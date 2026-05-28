/**
 * Importa emendas parlamentares estaduais de Goiás (ALEGO).
 * Todos os parlamentares são DEPUTADO_ESTADUAL.
 *
 * Fonte: Portal Dados Abertos GO — arquivos por ano.
 * Formatos (variam por ano):
 *   2021      — ZIP/CSV semicolon latin-1: Emenda, DEPUTADO AUTOR, VALOR DA EMENDA, Saldo Empenhado, Saldo Pago
 *   2022      — ZIP/CSV semicolon latin-1: igual 2021 + múltiplos empenhos por emenda
 *   2023      — ZIP/CSV semicolon: Nº Emenda, Autor da Emenda, Município, Valor Empenho, Valor Pago
 *   2024      — CSV semicolon: Número Emenda, Autor (Deputado), Município (Beneficiário), Valor Empenho, OP (Saldo)
 *   2025      — CSV tab-delimited: mesmo schema de 2024
 *
 * Para 2021-2022 (sem Município), o script usa Goias_emendas.csv como lookup
 * de município via campo Processo.
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/estados/import-go.ts \
 *     --file data/estados/GO-2023.zip \
 *     --goias-meta data/estados/Goias_emendas.csv
 *
 *   # Importar todos os anos de uma vez:
 *   npx tsx --require dotenv/config scripts/estados/import-go.ts \
 *     --files "GO-2021.zip,GO-2022.zip,GO-2023.zip,GO-2024.csv,GO-2025.csv" \
 *     --goias-meta data/estados/Goias_emendas.csv \
 *     --base-dir data/estados
 */
import * as fs from 'fs';
import * as path from 'path';
import * as unzipper from 'unzipper';
import { buildPrisma, importarEmendas, parseValorBR, normalizeNome, type EmendaEstadualRow } from './base-import-estadual';
import { classificarArea } from '../../lib/portal-transparencia';

function arg(name: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  return idx >= 0 && idx + 1 < process.argv.length ? process.argv[idx + 1] : undefined;
}
const FILE      = arg('file');
const FILES     = arg('files');
const BASE_DIR  = arg('base-dir') ?? 'data/estados';
const META_FILE = arg('goias-meta');
const DRY_RUN   = process.argv.includes('--dry-run');

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCsvText(text: string, delimiter = ';'): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (!lines.length) return [];
  lines[0] = lines[0].replace(/^﻿/, '').replace(/^﻿/, '');
  const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const vals = line.split(delimiter).map((v) => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, j) => { if (h) row[h] = vals[j] ?? ''; });
    rows.push(row);
  }
  return rows;
}

async function lerArquivo(filePath: string): Promise<string> {
  const ext = filePath.toLowerCase();
  if (ext.endsWith('.zip')) {
    const dir = await unzipper.Open.file(filePath);
    const entry = dir.files.find((f) => /\.(csv|CSV)$/.test(f.path));
    if (!entry) throw new Error(`Nenhum CSV encontrado em ${filePath}`);
    const buf = await entry.buffer();
    // Tentar UTF-8 primeiro, depois latin-1
    const utf8 = buf.toString('utf-8');
    return utf8.includes('�') ? buf.toString('latin1') : utf8;
  }
  const buf = fs.readFileSync(filePath);
  const utf8 = buf.toString('utf-8');
  return utf8.includes('�') ? buf.toString('latin1') : utf8;
}

// ─── Tabela auxiliar: Goias_emendas.csv → Processo → Município ───────────────

type MetaLookup = Map<string, string>; // Processo → Município

function buildMetaLookup(metaFile: string): MetaLookup {
  const map = new Map<string, string>();
  if (!metaFile || !fs.existsSync(metaFile)) return map;
  // Goias_emendas.csv usa vírgula como delimitador e brackets nos nomes das colunas
  const text = fs.readFileSync(metaFile, 'utf-8').replace(/\[|\]/g, '');
  const delimiter = text.includes('\t') ? '\t' : text.split('\n')[0].includes(';') ? ';' : ',';
  const rows = parseCsvText(text, delimiter);
  for (const r of rows) {
    const proc = (r['Processo'] ?? '').trim();
    const muni = (r['Municipio (Beneficiario)'] ?? '').trim();
    if (proc && muni) map.set(proc, muni);
  }
  return map;
}

// ─── Parsers por formato ──────────────────────────────────────────────────────

// 2021: Emenda;TIPO DE EMENDA;VALOR DA EMENDA;DEPUTADO AUTOR;SECRETARIA RESPONSÁVEL;
//       OBJETO ORIGINAL DA EMENDA;Beneficiário (CPF/CNPJ);Beneficiário (Nome);
//       Número do Processo;Sequencial Empenho;Saldo Empenhado;Saldo Liquidado;Saldo Pago;...
function parse2021(rows: Record<string, string>[], meta: MetaLookup, ano: number): EmendaEstadualRow[] {
  // Agregar por (Emenda, DEPUTADO AUTOR)
  const map = new Map<string, EmendaEstadualRow>();
  for (const r of rows) {
    const autor    = (r['DEPUTADO AUTOR'] ?? '').trim();
    const nrEmenda = (r['Emenda'] ?? '').trim();
    if (!autor || !nrEmenda) continue;
    const key      = `${normalizeNome(autor)}|${nrEmenda}`;
    const processo = (r['Número do Processo'] ?? '').trim();
    const municipio = meta.get(processo) ?? '';
    const orgao    = (r['SECRETARIA RESPONSÁVEL'] ?? '').trim();
    const objeto   = (r['OBJETO ORIGINAL DA EMENDA'] ?? '').trim();

    const empenhado = parseValorBR(r['Saldo Empenhado']);
    const pago      = parseValorBR(r['Saldo Pago'] ?? r['Saldo a Pagar']);
    const proposto  = parseValorBR(r['VALOR DA EMENDA']);

    const existing = map.get(key);
    if (existing) {
      existing.valorEmpenhado += empenhado;
      existing.valorPago      += pago;
    } else {
      map.set(key, {
        idPortal:      `GO-${ano}-${normalizeNome(autor).replace(/\s+/g,'_').slice(0,30)}-${nrEmenda}`,
        ano, numero: nrEmenda,
        funcao:        orgao || undefined,
        objeto:        objeto || undefined,
        area:          classificarArea(null, orgao),
        valorProposto: proposto || undefined,
        valorEmpenhado: empenhado, valorPago: pago,
        uf:            'GO',
        municipioNome: municipio || undefined,
        autorNome:     autor, autorCargo: 'DEPUTADO_ESTADUAL',
      });
    }
  }
  return [...map.values()];
}

// 2022: Emenda;TIPO DE EMENDA;VALOR DA EMENDA;DEPUTADO AUTOR;SECRETARIA RESPONSÁVEL;...;
//       Beneficiário (Nome);Número do Processo;Sequencial Empenho;Empenhado;Liquidado;Pago;...
function parse2022(rows: Record<string, string>[], meta: MetaLookup, ano: number): EmendaEstadualRow[] {
  const map = new Map<string, EmendaEstadualRow>();
  for (const r of rows) {
    const autor    = (r['DEPUTADO AUTOR'] ?? '').trim();
    const nrEmenda = (r['Emenda'] ?? '').trim();
    if (!autor || !nrEmenda) continue;
    const key      = `${normalizeNome(autor)}|${nrEmenda}`;
    const processo = (r['Número do Processo'] ?? '').trim();
    const municipio = meta.get(processo) ?? '';
    const orgao    = (r['SECRETARIA RESPONSÁVEL'] ?? '').trim();
    const objeto   = (r['OBJETO ORIGINAL DA EMENDA'] ?? '').trim();

    const empenhado = parseValorBR(r['Empenhado']);
    const pago      = parseValorBR(r['Pago']);
    const proposto  = parseValorBR(r['VALOR DA EMENDA']);

    const existing = map.get(key);
    if (existing) {
      existing.valorEmpenhado += empenhado;
      existing.valorPago      += pago;
    } else {
      map.set(key, {
        idPortal:      `GO-${ano}-${normalizeNome(autor).replace(/\s+/g,'_').slice(0,30)}-${nrEmenda}`,
        ano, numero: nrEmenda,
        funcao:        orgao || undefined,
        objeto:        objeto || undefined,
        area:          classificarArea(null, orgao),
        valorProposto: proposto || undefined,
        valorEmpenhado: empenhado, valorPago: pago,
        uf:            'GO',
        municipioNome: municipio || undefined,
        autorNome:     autor, autorCargo: 'DEPUTADO_ESTADUAL',
      });
    }
  }
  return [...map.values()];
}

// 2023: Ano Emenda;Orgão;Nº Processo;Função (Área);Subfunção;Nº Emenda;Autor da Emenda;
//       Objeto;Município;Beneficiário;CNPJ;Valor Previsto;Valor Empenho;Valor Liquidado;Valor Pago
function parse2023(rows: Record<string, string>[], ano: number): EmendaEstadualRow[] {
  return rows.map((r) => {
    const autor    = (r['Autor da Emenda'] ?? '').trim();
    const nrEmenda = (r['Nº Emenda'] ?? '').trim();
    if (!autor || !nrEmenda) return null;
    const orgao    = (r['Orgão'] ?? '').trim();
    const funcao   = (r['Função (Área)'] ?? '').trim();
    return {
      idPortal:      `GO-${ano}-${normalizeNome(autor).replace(/\s+/g,'_').slice(0,30)}-${nrEmenda}`,
      ano, numero: nrEmenda,
      funcao:        orgao || funcao || undefined,
      subfuncao:     (r['Subfunção'] ?? '').trim() || undefined,
      objeto:        (r['Objeto'] ?? '').trim() || undefined,
      area:          classificarArea(null, orgao || funcao),
      valorProposto: parseValorBR(r['Valor Previsto (R$)'] ?? r['Valor Previsto']) || undefined,
      valorEmpenhado: parseValorBR(r['Valor Empenho (R$)'] ?? r['Valor Empenho']),
      valorPago:      parseValorBR(r['Valor Pago (R$)'] ?? r['Valor Pago']),
      uf:            'GO',
      municipioNome: (r['Município'] ?? '').trim() || undefined,
      autorNome:     autor, autorCargo: 'DEPUTADO_ESTADUAL',
    } as EmendaEstadualRow;
  }).filter((r): r is EmendaEstadualRow => r !== null);
}

// 2024/2025: Exercício (Ano);...;Número Emenda;Autor (Deputado);Objeto;
//            Município (Beneficiário);...;Valor Empenho;Liquidação (Saldo);OP (Saldo);...
function parse2024plus(rows: Record<string, string>[], ano: number): EmendaEstadualRow[] {
  const map = new Map<string, EmendaEstadualRow>();
  for (const r of rows) {
    const autor    = (r['Autor (Deputado)'] ?? '').trim();
    const nrEmenda = (r['Número Emenda'] ?? '').trim();
    if (!autor || !nrEmenda) continue;
    const key = `${normalizeNome(autor)}|${nrEmenda}`;
    const empenhado = parseValorBR(r['Valor Empenho']);
    const pago      = parseValorBR(r['OP (Saldo)']);
    const liquidado = parseValorBR(r['Liquidação (Saldo)']);
    const orgao = (r['Órgão Sucessor Atual (Código/Nome)'] ?? '').trim();
    const funcao = (r['Função (Nome)'] ?? '').trim();

    const existing = map.get(key);
    if (existing) {
      existing.valorEmpenhado += empenhado;
      existing.valorPago      += pago;
    } else {
      map.set(key, {
        idPortal:      `GO-${ano}-${normalizeNome(autor).replace(/\s+/g,'_').slice(0,30)}-${nrEmenda}`,
        ano, numero: nrEmenda,
        funcao:        funcao || orgao || undefined,
        subfuncao:     (r['SubFunção (Nome)'] ?? '').trim() || undefined,
        objeto:        (r['Objeto'] ?? '').trim() || undefined,
        area:          classificarArea(null, funcao || orgao),
        valorEmpenhado: empenhado, valorPago: pago,
        uf:            'GO',
        municipioNome: (r['Município (Beneficiário)'] ?? '').trim() || undefined,
        autorNome:     autor, autorCargo: 'DEPUTADO_ESTADUAL',
      });
    }
  }
  return [...map.values()];
}

// ─── Detecção de formato ──────────────────────────────────────────────────────

function detectarFormato(rows: Record<string, string>[], filePath: string): '2021' | '2022' | '2023' | '2024plus' {
  const cols = Object.keys(rows[0] ?? {});
  if (cols.includes('Autor da Emenda'))     return '2023';
  if (cols.includes('Autor (Deputado)'))    return '2024plus';
  if (cols.includes('Saldo Empenhado'))     return '2021';
  if (cols.includes('Empenhado'))           return '2022';
  // Fallback: tentar inferir pelo nome do arquivo
  if (filePath.includes('2023')) return '2023';
  if (filePath.includes('2024') || filePath.includes('2025')) return '2024plus';
  if (filePath.includes('2022')) return '2022';
  return '2021';
}

function extrairAno(filePath: string, rows: Record<string, string>[]): number {
  const match = filePath.match(/(\d{4})/);
  if (match) return parseInt(match[1], 10);
  const anoCol = rows[0]?.['Exercício (Ano)'] ?? rows[0]?.['Ano Emenda'] ?? rows[0]?.['Exercicio (Ano)'];
  return anoCol ? parseInt(anoCol, 10) : new Date().getFullYear();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function processarArquivo(filePath: string, meta: MetaLookup): Promise<EmendaEstadualRow[]> {
  console.log(`\n  📄 ${path.basename(filePath)}`);
  const text = await lerArquivo(filePath);
  const delimiter = text.includes('\t') ? '\t' : ';';
  const rows = parseCsvText(text, delimiter);
  console.log(`     ${rows.length} linhas lidas`);
  if (!rows.length) return [];

  const ano = extrairAno(filePath, rows);
  const fmt = detectarFormato(rows, filePath);
  console.log(`     ano=${ano} | formato=${fmt} | delimiter=${delimiter === '\t' ? 'TAB' : ';'}`);

  let result: EmendaEstadualRow[];
  if      (fmt === '2021')     result = parse2021(rows, meta, ano);
  else if (fmt === '2022')     result = parse2022(rows, meta, ano);
  else if (fmt === '2023')     result = parse2023(rows, ano);
  else                         result = parse2024plus(rows, ano);

  const semMuni = result.filter((r) => !r.municipioNome).length;
  console.log(`     ${result.length} emendas mapeadas (${semMuni} sem município)`);
  return result;
}

async function main() {
  const files: string[] = [];
  if (FILE) {
    files.push(FILE);
  } else if (FILES) {
    files.push(...FILES.split(',').map((f) => path.join(BASE_DIR, f.trim())));
  } else {
    console.error('\nUso: --file <arquivo> ou --files "GO-2021.zip,GO-2022.zip,..." --base-dir data/estados');
    process.exit(1);
  }

  console.log(`\n🔄 Import GO${DRY_RUN ? ' [DRY RUN]' : ''}`);

  const meta = META_FILE ? buildMetaLookup(META_FILE) : new Map<string, string>();
  if (META_FILE) console.log(`  Lookup de município: ${meta.size} processos carregados`);

  const allRows: EmendaEstadualRow[] = [];
  for (const f of files) {
    const rows = await processarArquivo(f, meta);
    allRows.push(...rows);
  }

  console.log(`\n  Total emendas: ${allRows.length}`);
  const anos = [...new Set(allRows.map((r) => r.ano))].sort();
  const autores = new Set(allRows.map((r) => r.autorNome)).size;
  const munis = new Set(allRows.map((r) => r.municipioNome).filter(Boolean)).size;
  console.log(`  Anos: ${anos.join(', ')} | Deputados: ${autores} | Municípios: ${munis}`);

  const areaCount: Record<string, number> = {};
  allRows.forEach((r) => { areaCount[r.area ?? 'OUTROS'] = (areaCount[r.area ?? 'OUTROS'] ?? 0) + 1; });
  console.log(`  Áreas:`, areaCount);

  if (DRY_RUN) { console.log('\n[dry-run] nenhuma escrita realizada.'); return; }

  const prisma = buildPrisma();
  try {
    const result = await importarEmendas(prisma, 'GO', allRows);
    console.log(`\n✅ Import GO concluído:`);
    console.log(`   emendas inseridas/atualizadas    : ${result.inseridas}`);
    console.log(`   parlamentares criados/atualizados: ${result.parlamentares}`);
    console.log(`   erros                            : ${result.erros}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error('\n❌', e.message); process.exit(1); });
