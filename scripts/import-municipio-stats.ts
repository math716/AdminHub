/**
 * Importa dados anuais por município pra tabela `municipio_stats`:
 *   - Eleitores (CSV TSE perfil_eleitorado_<ano>.csv — agrega por município)
 *   - Teto MAC  (xlsx Limites-MAC-Coletivas — soma todos os CNES por município)
 *   - Teto PAP  (xlsx Limites-PAP-Coletivas — uma linha por município)
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/import-municipio-stats.ts \
 *     --tse  "C:/.../perfil_eleitorado_2024.csv" \
 *     --mac  "C:/.../Limites-MAC-Coletivas.xlsx" \
 *     --pap  "C:/.../Limites-PAP-Coletivas.xlsx" \
 *     --ano  2024
 *
 * Qualquer um dos --tse/--mac/--pap pode ser omitido — só o que for fornecido é importado.
 * Faz upsert por (codigoIbge, ano) — pode rodar de novo sem duplicar.
 */

import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();

// ────────────────────────────────────────────────────────────────────────────
// CLI args parsing
// ────────────────────────────────────────────────────────────────────────────
function arg(name: string, def?: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return def;
}

const TSE_PATH  = arg('tse');
const MAC_PATH  = arg('mac');
const PAP_PATH  = arg('pap');
const ANO       = parseInt(arg('ano', String(new Date().getFullYear()))!, 10);
const DRY_RUN   = process.argv.includes('--dry-run');

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────
function normalizeNome(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseValorBR(v: any): number {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return 0;
  // "200.000,00" → 200000   ou   "200000.00" → 200000
  const cleaned = v.replace(/[^\d,.\-]/g, '');
  // Se tem vírgula e ponto: ponto é separador de milhar → remove
  if (cleaned.includes(',')) {
    const norm = cleaned.replace(/\./g, '').replace(',', '.');
    return Number(norm) || 0;
  }
  return Number(cleaned) || 0;
}

// ────────────────────────────────────────────────────────────────────────────
// Lista de municípios IBGE — fonte de verdade pro codigoIbge 7 dígitos
// ────────────────────────────────────────────────────────────────────────────
interface MunicipioIBGE {
  codigoIbge: string;  // 7 dígitos
  codigo6:    string;  // 6 primeiros dígitos (compat. FNS)
  uf:         string;
  nome:       string;
  normNome:   string;
}

const UFs: Record<string, number> = {
  AC: 12, AL: 27, AP: 16, AM: 13, BA: 29, CE: 23, DF: 53, ES: 32, GO: 52, MA: 21,
  MT: 51, MS: 50, MG: 31, PA: 15, PB: 25, PR: 41, PE: 26, PI: 22, RJ: 33, RN: 24,
  RS: 43, RO: 11, RR: 14, SC: 42, SP: 35, SE: 28, TO: 17,
};

async function carregarMunicipiosIBGE(): Promise<MunicipioIBGE[]> {
  const all: MunicipioIBGE[] = [];
  for (const [uf, code] of Object.entries(UFs)) {
    const res = await fetch(
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${code}/municipios`,
    );
    if (!res.ok) {
      console.warn(`  [aviso] falha em ${uf}: HTTP ${res.status}`);
      continue;
    }
    const data: any[] = await res.json();
    data.forEach((m) => {
      const codigoIbge = String(m.id);
      all.push({
        codigoIbge,
        codigo6:  codigoIbge.slice(0, 6),
        uf,
        nome:     m.nome,
        normNome: normalizeNome(m.nome),
      });
    });
  }
  return all;
}

// ────────────────────────────────────────────────────────────────────────────
// Parser TSE — CSV com encoding latin1 e separador ;
// ────────────────────────────────────────────────────────────────────────────
function parseCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === ';' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

interface TSERow { uf: string; municipio: string; qtd: number; }

function lerTSE(filePath: string): TSERow[] {
  const buffer = fs.readFileSync(filePath);
  // Latin1 → string
  const text = buffer.toString('latin1');
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = parseCSVLine(lines[0]);

  const idxUf  = header.indexOf('SG_UF');
  const idxMun = header.indexOf('NM_MUNICIPIO');
  const idxQtd = header.indexOf('QT_ELEITORES_PERFIL');

  if (idxUf < 0 || idxMun < 0 || idxQtd < 0) {
    throw new Error(`TSE CSV: cabeçalho não tem SG_UF/NM_MUNICIPIO/QT_ELEITORES_PERFIL`);
  }

  const agg = new Map<string, TSERow>();
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    const uf = row[idxUf]?.trim();
    const mun = row[idxMun]?.trim();
    const qtd = parseInt(row[idxQtd] || '0', 10);
    if (!uf || !mun || !Number.isFinite(qtd)) continue;
    const key = `${uf}|${normalizeNome(mun)}`;
    const cur = agg.get(key);
    if (cur) cur.qtd += qtd;
    else agg.set(key, { uf, municipio: mun, qtd });
  }
  return Array.from(agg.values());
}

// ────────────────────────────────────────────────────────────────────────────
// Parser MAC (xlsx, sheet "CNES Público")
// ────────────────────────────────────────────────────────────────────────────
interface MACRow { codigo6: string; valor: number; }

function lerMAC(filePath: string): MACRow[] {
  const wb = XLSX.readFile(filePath);
  // Match flexível pra "CNES Público" / "CNES Publico" / etc
  const sheetName = wb.SheetNames.find((n) => /CNES.*P(u|ú|�)blico/i.test(n)) ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`MAC: sheet "${sheetName}" não encontrada`);

  const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const headerRow = rows[0] as any[];

  // Header pode vir com caracteres corrompidos no read_only=True; usamos índice de fallback
  const idxIBGE  = headerRow.findIndex((h: any) => String(h).toUpperCase().includes('IBGE'));
  const idxValor = headerRow.findIndex((h: any) => String(h).toUpperCase().includes('VALOR'));

  if (idxIBGE < 0 || idxValor < 0) {
    throw new Error(`MAC: cabeçalho não tem coluna IBGE ou VALOR (achou: ${headerRow.join(', ')})`);
  }

  const agg = new Map<string, number>();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as any[];
    if (!row || row.length === 0) continue;
    const codigo6 = String(row[idxIBGE] ?? '').trim();
    if (!/^\d{6,7}$/.test(codigo6)) continue;
    const valor = parseValorBR(row[idxValor]);
    if (!Number.isFinite(valor) || valor <= 0) continue;
    const key = codigo6.length === 7 ? codigo6.slice(0, 6) : codigo6;
    agg.set(key, (agg.get(key) ?? 0) + valor);
  }
  return Array.from(agg.entries()).map(([codigo6, valor]) => ({ codigo6, valor }));
}

// ────────────────────────────────────────────────────────────────────────────
// Parser PAP (xlsx, sheet "Emendas Coletivas")
// ────────────────────────────────────────────────────────────────────────────
interface PAPRow { codigo6: string; valor: number; }

function lerPAP(filePath: string): PAPRow[] {
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames.find((n) => /emenda/i.test(n)) ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`PAP: sheet "${sheetName}" não encontrada`);

  const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const headerRow = rows[0] as any[];

  const idxIBGE  = headerRow.findIndex((h: any) => String(h).toUpperCase().trim().includes('IBGE'));
  const idxValor = headerRow.findIndex((h: any) => String(h).toUpperCase().trim().includes('VALOR'));

  if (idxIBGE < 0 || idxValor < 0) {
    throw new Error(`PAP: cabeçalho não tem coluna IBGE ou VALOR (achou: ${headerRow.join(', ')})`);
  }

  const out: PAPRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as any[];
    if (!row || row.length === 0) continue;
    const codigo6 = String(row[idxIBGE] ?? '').trim();
    if (!/^\d{6,7}$/.test(codigo6)) continue;
    const valor = parseValorBR(row[idxValor]);
    if (!Number.isFinite(valor) || valor <= 0) continue;
    out.push({ codigo6: codigo6.length === 7 ? codigo6.slice(0, 6) : codigo6, valor });
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n📊 Import municipio_stats — ano=${ANO}${DRY_RUN ? ' (DRY RUN)' : ''}\n`);

  if (!TSE_PATH && !MAC_PATH && !PAP_PATH) {
    console.error('❌ Forneça pelo menos um arquivo: --tse, --mac ou --pap');
    process.exit(1);
  }

  // 1. IBGE
  console.log('🌎 Baixando lista de municípios do IBGE…');
  const muns = await carregarMunicipiosIBGE();
  console.log(`   ${muns.length} municípios carregados.`);

  // Índices pra cruzamento rápido
  const por7        = new Map(muns.map((m) => [m.codigoIbge, m]));
  const por6        = new Map(muns.map((m) => [m.codigo6, m]));
  const porUfNome   = new Map(muns.map((m) => [`${m.uf}|${m.normNome}`, m]));

  // 2. Parse arquivos
  const eleitoresPorIbge = new Map<string, number>();
  const macPorIbge       = new Map<string, number>();
  const papPorIbge       = new Map<string, number>();

  if (TSE_PATH) {
    if (!fs.existsSync(TSE_PATH)) throw new Error(`TSE: arquivo não existe — ${TSE_PATH}`);
    console.log(`\n🗳️  Lendo TSE: ${path.basename(TSE_PATH)}…`);
    const tseRows = lerTSE(TSE_PATH);
    let matched = 0, missed = 0;
    for (const r of tseRows) {
      const hit = porUfNome.get(`${r.uf}|${normalizeNome(r.municipio)}`);
      if (hit) {
        eleitoresPorIbge.set(hit.codigoIbge, r.qtd);
        matched++;
      } else {
        missed++;
        if (missed <= 5) console.log(`   [aviso] sem match IBGE: ${r.uf} / ${r.municipio}`);
      }
    }
    console.log(`   ✅ ${matched} municípios casados, ${missed} sem match`);
  }

  if (MAC_PATH) {
    if (!fs.existsSync(MAC_PATH)) throw new Error(`MAC: arquivo não existe — ${MAC_PATH}`);
    console.log(`\n🏥 Lendo MAC: ${path.basename(MAC_PATH)}…`);
    const macRows = lerMAC(MAC_PATH);
    let matched = 0, missed = 0;
    for (const r of macRows) {
      const hit = por6.get(r.codigo6);
      if (hit) {
        macPorIbge.set(hit.codigoIbge, r.valor);
        matched++;
      } else {
        missed++;
        if (missed <= 5) console.log(`   [aviso] sem match IBGE: código FNS ${r.codigo6}`);
      }
    }
    console.log(`   ✅ ${matched} municípios casados, ${missed} sem match`);
  }

  if (PAP_PATH) {
    if (!fs.existsSync(PAP_PATH)) throw new Error(`PAP: arquivo não existe — ${PAP_PATH}`);
    console.log(`\n🏛️  Lendo PAP: ${path.basename(PAP_PATH)}…`);
    const papRows = lerPAP(PAP_PATH);
    let matched = 0, missed = 0;
    for (const r of papRows) {
      const hit = por6.get(r.codigo6);
      if (hit) {
        papPorIbge.set(hit.codigoIbge, r.valor);
        matched++;
      } else {
        missed++;
        if (missed <= 5) console.log(`   [aviso] sem match IBGE: código FNS ${r.codigo6}`);
      }
    }
    console.log(`   ✅ ${matched} municípios casados, ${missed} sem match`);
  }

  // 3. Consolidar
  const ibgesParaUpsert = new Set<string>([
    ...eleitoresPorIbge.keys(),
    ...macPorIbge.keys(),
    ...papPorIbge.keys(),
  ]);

  const fonteParts = [
    TSE_PATH ? `TSE ${ANO}` : null,
    MAC_PATH ? 'MAC/SISMAC' : null,
    PAP_PATH ? 'PAP/SISAPS (Emendas Coletivas)' : null,
  ].filter(Boolean);
  const fonte = fonteParts.join(' + ');

  console.log(`\n📝 ${ibgesParaUpsert.size} municípios serão atualizados.`);

  if (DRY_RUN) {
    console.log('\n🧪 DRY RUN — mostrando 3 amostras (sem gravar no banco):');
    let count = 0;
    for (const codigoIbge of ibgesParaUpsert) {
      if (count++ >= 3) break;
      const m = por7.get(codigoIbge);
      console.log(`   ${codigoIbge} ${m?.uf}/${m?.nome}:`);
      console.log(`     eleitores: ${eleitoresPorIbge.get(codigoIbge) ?? '—'}`);
      console.log(`     tetoMac:   ${macPorIbge.get(codigoIbge) ?? '—'}`);
      console.log(`     tetoPap:   ${papPorIbge.get(codigoIbge) ?? '—'}`);
    }
    console.log('\n✓ DRY RUN concluído — re-rode sem --dry-run pra gravar.');
    return;
  }

  // 4. Upsert em lotes
  console.log(`\n💾 Gravando no banco em lotes de 50…`);
  const ibgesArr = Array.from(ibgesParaUpsert);
  const batchSize = 50;
  let total = 0;

  for (let i = 0; i < ibgesArr.length; i += batchSize) {
    const batch = ibgesArr.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (codigoIbge) => {
        const m = por7.get(codigoIbge)!;
        const data = {
          uf:         m.uf,
          nome:       m.nome,
          eleitores:  eleitoresPorIbge.get(codigoIbge) ?? null,
          tetoMac:    macPorIbge.get(codigoIbge) ?? null,
          tetoPap:    papPorIbge.get(codigoIbge) ?? null,
          fonte,
        };
        await prisma.municipioStats.upsert({
          where:  { codigoIbge_ano: { codigoIbge, ano: ANO } },
          create: { codigoIbge, ano: ANO, ...data },
          update: data,
        });
      }),
    );
    total += batch.length;
    process.stdout.write(`\r   ${total}/${ibgesArr.length} gravados…`);
  }

  console.log(`\n\n✅ Concluído! ${total} municípios atualizados em municipio_stats (ano ${ANO}).`);
}

main()
  .catch((e) => {
    console.error('\n❌ Erro:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
