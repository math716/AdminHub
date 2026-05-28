/**
 * Importa emendas parlamentares estaduais de Alagoas (ALAL).
 *
 * Fonte: Portal de Transparência AL — AL-EMENDAS.csv
 * Formato: CSV delimitado por vírgula, campos com aspas, encoding UTF-8.
 * Colunas principais: ano, parlamentar, partido, municipio, funcao, modalidade,
 *   objeto_despesa, codigo_identificador_emenda, valor_emenda,
 *   valor_empenhado, valor_pago, valor_liquidado.
 *
 * Cada emenda pode aparecer em múltiplas linhas (uma por grupo_despesa).
 * O script agrega por codigo_identificador_emenda somando os valores financeiros.
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/estados/import-al.ts \
 *     --file data/estados/AL-EMENDAS.csv
 *   npx tsx --require dotenv/config scripts/estados/import-al.ts \
 *     --file data/estados/AL-EMENDAS.csv --dry-run
 */
import * as fs from 'fs';
import { parse } from 'csv/sync';
import { buildPrisma, importarEmendas, parseValorBR, normalizeNome, type EmendaEstadualRow } from './base-import-estadual';
import { classificarArea } from '../../lib/portal-transparencia';

function arg(name: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  return idx >= 0 && idx + 1 < process.argv.length ? process.argv[idx + 1] : undefined;
}

const FILE    = arg('file');
const DRY_RUN = process.argv.includes('--dry-run');

// ─── Parser ──────────────────────────────────────────────────────────────────

function parseCsv(filePath: string): Record<string, string>[] {
  const text = fs.readFileSync(filePath, 'utf-8').replace(/^﻿/, '');
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
    trim: true,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extrairFuncao(funcaoRaw: string): string | undefined {
  // "10 - SAÚDE" → "SAÚDE"
  const match = funcaoRaw.match(/^\d+\s*-\s*(.+)/);
  return match ? match[1].trim() : (funcaoRaw.trim() || undefined);
}

// ─── Agrupamento e mapeamento ─────────────────────────────────────────────────

interface Grupo {
  ano: number;
  parlamentar: string;
  partido?: string;
  municipio?: string;
  funcao?: string;
  tipo?: string;
  objeto?: string;
  codigo: string;
  valorProposto: number;
  valorEmpenhado: number;
  valorPago: number;
}

function agrupar(rows: Record<string, string>[]): Grupo[] {
  const map = new Map<string, Grupo>();

  for (const r of rows) {
    const ano = parseInt(r['ano'] ?? '', 10);
    if (!Number.isFinite(ano) || ano < 2000) continue;

    const parlamentar = (r['parlamentar'] ?? '').trim();
    if (!parlamentar || parlamentar === '-') continue;

    const codigo = (r['codigo_identificador_emenda'] ?? '').trim();
    if (!codigo) continue;

    const key = `${ano}-${codigo}`;
    const existing = map.get(key);

    const vProposto  = parseValorBR(r['valor_emenda']);
    const vEmpenhado = parseValorBR(r['valor_empenhado']);
    const vPago      = parseValorBR(r['valor_pago']);

    if (existing) {
      // Soma valores financeiros; valorProposto: mantém o maior (evita duplicar dotação)
      existing.valorProposto  = Math.max(existing.valorProposto, vProposto);
      existing.valorEmpenhado += vEmpenhado;
      existing.valorPago      += vPago;
    } else {
      const municipio = (r['municipio'] ?? '').trim();
      map.set(key, {
        ano,
        parlamentar,
        partido:   (r['partido'] ?? '').trim() || undefined,
        municipio: municipio && municipio !== '-' ? municipio : undefined,
        funcao:    extrairFuncao(r['funcao'] ?? ''),
        tipo:      (r['modalidade'] ?? '').trim() || undefined,
        objeto:    (r['objeto_despesa'] ?? '').trim() || undefined,
        codigo,
        valorProposto: vProposto,
        valorEmpenhado: vEmpenhado,
        valorPago: vPago,
      });
    }
  }

  return [...map.values()];
}

function mapearGrupo(g: Grupo): EmendaEstadualRow {
  const area = classificarArea(null, g.funcao ?? null);
  return {
    idPortal:      `AL-${g.ano}-${g.codigo}`,
    ano:           g.ano,
    numero:        g.codigo,
    tipo:          g.tipo,
    funcao:        g.funcao,
    objeto:        g.objeto,
    area,
    valorProposto: g.valorProposto || undefined,
    valorEmpenhado: g.valorEmpenhado,
    valorPago:     g.valorPago,
    uf:            'AL',
    municipioNome: g.municipio,
    autorNome:     g.parlamentar,
    autorCargo:    'DEPUTADO_ESTADUAL',
    autorPartido:  g.partido,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!FILE) {
    console.error('\nUso: npx tsx --require dotenv/config scripts/estados/import-al.ts --file <csv>');
    process.exit(1);
  }

  console.log(`\n🔄 Import AL — arquivo=${FILE}${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  const raw = parseCsv(FILE);
  console.log(`  ${raw.length} linhas lidas`);

  const grupos  = agrupar(raw);
  const rows    = grupos.map(mapearGrupo);
  console.log(`  ${rows.length} emendas após agrupamento`);

  const anos       = [...new Set(rows.map((r) => r.ano))].sort();
  const autores    = new Set(rows.map((r) => r.autorNome)).size;
  const municipios = new Set(rows.map((r) => r.municipioNome).filter(Boolean)).size;
  const semValor   = rows.filter((r) => !r.valorEmpenhado && !r.valorPago && !r.valorProposto).length;

  console.log(`\n  Validação:`);
  console.log(`    anos             : ${anos.join(', ')}`);
  console.log(`    deputados únicos : ${autores}`);
  console.log(`    municípios       : ${municipios}`);
  console.log(`    sem valor algum  : ${semValor}`);

  const areaCount: Record<string, number> = {};
  rows.forEach((r) => { areaCount[r.area ?? 'OUTROS'] = (areaCount[r.area ?? 'OUTROS'] ?? 0) + 1; });
  console.log(`  Áreas:`, areaCount);

  if (rows[0]) {
    console.log(`\n  Exemplo:`);
    console.log(`    parlamentar    : ${rows[0].autorNome}`);
    console.log(`    município      : ${rows[0].municipioNome}`);
    console.log(`    área           : ${rows[0].area}`);
    console.log(`    valorProposto  : R$ ${rows[0].valorProposto?.toLocaleString('pt-BR')}`);
    console.log(`    valorEmpenhado : R$ ${rows[0].valorEmpenhado?.toLocaleString('pt-BR')}`);
  }

  if (rows.length === 0) { console.error('\nNenhuma emenda mapeada.'); process.exit(1); }
  if (DRY_RUN) { console.log('\n[dry-run] nenhuma escrita realizada.'); return; }

  const prisma = buildPrisma();
  try {
    const result = await importarEmendas(prisma, 'AL', rows);
    console.log(`\n✅ Import AL concluído:`);
    console.log(`   emendas inseridas/atualizadas    : ${result.inseridas}`);
    console.log(`   parlamentares criados/atualizados: ${result.parlamentares}`);
    console.log(`   erros                            : ${result.erros}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error('\n❌', e.message); process.exit(1); });
