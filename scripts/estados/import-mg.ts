/**
 * Importa emendas parlamentares estaduais de Minas Gerais (ALMG).
 * Todos os parlamentares são DEPUTADO_ESTADUAL.
 *
 * Fonte: emendas.mg.gov.br/transparencia
 * Formato: XLSX único com múltiplos anos (2023–2026), uma linha por emenda.
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/estados/import-mg.ts \
 *     --file data/estados/mg-emendas.xlsx
 *   npx tsx --require dotenv/config scripts/estados/import-mg.ts \
 *     --file data/estados/mg-emendas.xlsx --dry-run
 *   npx tsx --require dotenv/config scripts/estados/import-mg.ts \
 *     --file data/estados/mg-emendas.xlsx --discover   # só imprime colunas e sai
 */
import * as XLSX from 'xlsx';
import { buildPrisma, importarEmendas, parseValorBR, normalizeNome, type EmendaEstadualRow } from './base-import-estadual';
import type { EmendaArea } from '@prisma/client';

function arg(name: string, def?: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return def;
}

const FILE     = arg('file');
const DRY_RUN  = process.argv.includes('--dry-run');
const DISCOVER = process.argv.includes('--discover');

// ─── Área por função ──────────────────────────────────────────────────────────
// Ajustar após ver as colunas reais via --discover
function funcaoToArea(funcao: string): EmendaArea {
  const norm = normalizeNome(funcao);
  if (norm.includes('SAUDE'))                                          return 'SAUDE';
  if (norm.includes('EDUCACAO') || norm.includes('ENSINO'))           return 'EDUCACAO';
  if (norm.includes('ASSISTENCIA') || norm.includes('SOCIAL'))        return 'ASSISTENCIA_SOCIAL';
  if (norm.includes('HABITACAO') || norm.includes('MORADIA'))         return 'HABITACAO';
  if (norm.includes('SANEAMENTO'))                                     return 'SANEAMENTO';
  if (norm.includes('AGRICULTURA') || norm.includes('AGROPECUARIA'))  return 'AGRICULTURA';
  if (norm.includes('ESPORTE') || norm.includes('LAZER'))             return 'ESPORTE';
  if (norm.includes('CULTURA'))                                        return 'CULTURA';
  if (norm.includes('MEIO AMBIENTE') || norm.includes('AMBIENTE'))    return 'MEIO_AMBIENTE';
  if (norm.includes('INFRAESTRUTURA') || norm.includes('TRANSPORTE') ||
      norm.includes('URBANISMO') || norm.includes('ENERGIA'))         return 'INFRAESTRUTURA';
  if (norm.includes('SEGURANCA') || norm.includes('DEFESA'))          return 'SEGURANCA';
  return 'OUTROS';
}

// ─── Mapeamento de linha ──────────────────────────────────────────────────────
// ATENÇÃO: nomes das colunas ajustados após rodar --discover
const COL = {
  ano:            ['Ano', 'ANO', 'ano'],
  numero:         ['Número', 'Numero', 'NUMERO', 'Nº Emenda', 'Nº da Emenda', 'Numero Emenda'],
  autor:          ['Parlamentar', 'Autor', 'PARLAMENTAR', 'AUTOR', 'Nome do Parlamentar'],
  partido:        ['Partido', 'PARTIDO'],
  funcao:         ['Função', 'Funcao', 'FUNCAO', 'Área', 'Area'],
  subfuncao:      ['Subfunção', 'Subfuncao', 'SUBFUNCAO'],
  objeto:         ['Objeto', 'OBJETO', 'Descrição', 'Descricao'],
  municipio:      ['Município', 'Municipio', 'MUNICIPIO', 'Beneficiário', 'Beneficiario'],
  valorProposto:  ['Valor Indicado', 'Valor Proposto', 'VALOR INDICADO', 'Valor Autorizado'],
  valorEmpenhado: ['Valor Empenhado', 'VALOR EMPENHADO', 'Empenhado'],
  valorPago:      ['Valor Pago', 'VALOR PAGO', 'Pago'],
  valorResto:     ['Restos a Pagar', 'RESTOS A PAGAR', 'Restos Pagar'],
  tipo:           ['Tipo', 'TIPO', 'Modalidade'],
  estagio:        ['Estágio', 'Estagio', 'ESTAGIO', 'Situação', 'Situacao'],
};

function pick(row: Record<string, any>, candidates: string[]): string {
  for (const c of candidates) {
    const v = row[c];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function mapearLinha(rowRaw: Record<string, any>): EmendaEstadualRow | null {
  const row: Record<string, any> = {};
  for (const [k, v] of Object.entries(rowRaw)) row[k.trim()] = v;

  const autor = pick(row, COL.autor);
  if (!autor) return null;

  const anoStr = pick(row, COL.ano);
  const ano    = parseInt(anoStr, 10);
  if (!ano || ano < 2000 || ano > 2100) return null;

  const numero   = pick(row, COL.numero);
  const funcao   = pick(row, COL.funcao);
  const partido  = pick(row, COL.partido);
  const municipio = pick(row, COL.municipio);

  const valorEmpenhado = parseValorBR(pick(row, COL.valorEmpenhado));
  const valorProposto  = parseValorBR(pick(row, COL.valorProposto)) || undefined;
  const valorPago      = parseValorBR(pick(row, COL.valorPago));
  const valorRestoPago = parseValorBR(pick(row, COL.valorResto)) || undefined;

  const area = funcao ? funcaoToArea(funcao) : 'OUTROS';

  const chaveAutor = normalizeNome(autor).slice(0, 20).replace(/\s+/g, '_');
  const idPortal   = `MG-${ano}-${numero || chaveAutor}`;

  return {
    idPortal,
    ano,
    numero:         numero || undefined,
    tipo:           pick(row, COL.tipo) || undefined,
    funcao:         funcao || undefined,
    subfuncao:      pick(row, COL.subfuncao) || undefined,
    objeto:         pick(row, COL.objeto) || undefined,
    area,
    valorProposto,
    valorEmpenhado,
    valorPago,
    valorRestoPago,
    uf:             'MG',
    municipioNome:  municipio || undefined,
    autorNome:      autor,
    autorPartido:   partido || undefined,
    autorCargo:     'DEPUTADO_ESTADUAL',
    estagio:        pick(row, COL.estagio) || undefined,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!FILE) {
    console.error('\nUso: npx tsx --require dotenv/config scripts/estados/import-mg.ts --file <xlsx>');
    process.exit(1);
  }

  console.log(`\n🔄 Import MG — arquivo=${FILE}${DRY_RUN ? ' [DRY RUN]' : ''}${DISCOVER ? ' [DISCOVER]' : ''}\n`);

  const wb  = XLSX.readFile(FILE);
  const ws  = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
  console.log(`  ${raw.length} linhas lidas`);

  if (raw[0]) {
    const cols = Object.keys(raw[0]);
    console.log(`\n  Colunas (${cols.length}):`);
    cols.forEach((c, i) => console.log(`    [${i}] "${c}"`));
    console.log(`\n  Exemplo (linha 1):`);
    Object.entries(raw[0]).forEach(([k, v]) => console.log(`    "${k}": ${JSON.stringify(v)}`));
  }

  if (DISCOVER) return;

  const rows = raw.map(mapearLinha).filter((r): r is EmendaEstadualRow => r !== null);
  console.log(`\n  ${rows.length} emendas mapeadas`);

  const anos = [...new Set(rows.map(r => r.ano))].sort();
  console.log(`  Anos: ${anos.join(', ')}`);

  const semMunicipio = rows.filter(r => !r.municipioNome).length;
  const semValor     = rows.filter(r => !r.valorEmpenhado && !r.valorProposto).length;
  console.log(`  sem município: ${semMunicipio} | sem valor: ${semValor}`);

  const areaCount: Record<string, number> = {};
  rows.forEach(r => { areaCount[r.area ?? 'OUTROS'] = (areaCount[r.area ?? 'OUTROS'] ?? 0) + 1; });
  console.log(`  Áreas:`, areaCount);

  if (rows[0]) {
    console.log(`\n  Exemplo mapeado:`);
    console.log(`    parlamentar : ${rows[0].autorNome}`);
    console.log(`    ano         : ${rows[0].ano}`);
    console.log(`    município   : ${rows[0].municipioNome ?? '(estadual)'}`);
    console.log(`    área        : ${rows[0].area}`);
    console.log(`    empenhado   : R$ ${rows[0].valorEmpenhado?.toLocaleString('pt-BR')}`);
  }

  if (rows.length === 0) { console.error('\nNenhuma emenda mapeada — verifique os nomes das colunas.'); process.exit(1); }
  if (DRY_RUN) { console.log('\n[dry-run] nenhuma escrita realizada.'); return; }

  const prisma = buildPrisma();
  try {
    const result = await importarEmendas(prisma, 'MG', rows);
    console.log(`\n✅ Import MG concluído:`);
    console.log(`   emendas inseridas/atualizadas    : ${result.inseridas}`);
    console.log(`   parlamentares criados/atualizados: ${result.parlamentares}`);
    console.log(`   erros                            : ${result.erros}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error('\n❌', e.message); process.exit(1); });
