/**
 * Importa emendas parlamentares estaduais de Minas Gerais (ALMG).
 * Todos os parlamentares são DEPUTADO_ESTADUAL.
 *
 * Fonte: emendas.mg.gov.br/transparencia
 * Formato: XLSX único com múltiplos anos (2023–2026), uma linha por emenda.
 * Colunas-chave: Ano da Indicação, Número da Indicação, Autor,
 *   Função Código, Função Descrição, Município, Código IBGE do Município,
 *   Valor Indicado, Valor Empenhado no Ano, Valor Pago no Ano,
 *   Valor Inscrito em Restos a Pagar, Status da Indicação
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/estados/import-mg.ts \
 *     --file data/estados/mg-emendas.xlsx
 *   npx tsx --require dotenv/config scripts/estados/import-mg.ts \
 *     --file data/estados/mg-emendas.xlsx --dry-run
 *   npx tsx --require dotenv/config scripts/estados/import-mg.ts \
 *     --file data/estados/mg-emendas.xlsx --discover
 */
import * as XLSX from 'xlsx';
import { buildPrisma, importarEmendas, parseValorBR, type EmendaEstadualRow } from './base-import-estadual';
import type { EmendaArea } from '@prisma/client';

function arg(name: string, def?: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return def;
}

const FILE     = arg('file');
const DRY_RUN  = process.argv.includes('--dry-run');
const DISCOVER = process.argv.includes('--discover');

// ─── Área por código de função SIAFI ─────────────────────────────────────────
function funcaoToArea(cod: number): EmendaArea {
  switch (cod) {
    case 10: return 'SAUDE';
    case 12: return 'EDUCACAO';
    case 8:
    case 9:
    case 14: return 'ASSISTENCIA_SOCIAL';
    case 16: return 'HABITACAO';
    case 17: return 'SANEAMENTO';
    case 20:
    case 21: return 'AGRICULTURA';
    case 27: return 'ESPORTE';
    case 13: return 'CULTURA';
    case 18: return 'MEIO_AMBIENTE';
    case 5:
    case 6:
    case 15:
    case 22:
    case 25:
    case 26: return 'INFRAESTRUTURA';
    case 3:
    case 28: return 'SEGURANCA';
    default: return 'OUTROS';
  }
}

// ─── Mapeamento de linha ──────────────────────────────────────────────────────
function mapearLinha(rowRaw: Record<string, any>): EmendaEstadualRow | null {
  const row: Record<string, any> = {};
  for (const [k, v] of Object.entries(rowRaw)) row[k.trim()] = v;

  const autor = String(row['Autor'] ?? '').trim();
  if (!autor || autor === '-') return null;

  const ano = Number(row['Ano da Indicação']);
  if (!ano || ano < 2000 || ano > 2100) return null;

  const numero      = String(row['Número da Indicação'] ?? '').trim();
  const funcaoCod   = Number(row['Função Código'] ?? 0);
  const funcaoDesc  = String(row['Função Descrição'] ?? '').trim();
  const subfuncao   = String(row['Nome da Ação'] ?? '').trim();
  const objeto      = String(row['Descrição da Indicação'] ?? '').replace(/\s+/g, ' ').trim();
  const municipio   = String(row['Município'] ?? '').trim();
  const ibgeRaw     = row['Código IBGE do Município'];
  const tipo        = String(row['Tipo de Indicação'] ?? '').trim();
  const estagio     = String(row['Status da Indicação'] ?? '').trim();

  const valorProposto  = parseValorBR(row['Valor Indicado'] ?? 0);
  const valorEmpenhado = parseValorBR(row['Valor Empenhado no Ano'] ?? 0);
  const valorPago      = parseValorBR(row['Valor Pago no Ano'] ?? 0);
  const valorRestoPago = parseValorBR(row['Valor Inscrito em Restos a Pagar'] ?? 0);

  // Código IBGE já vem como número de 7 dígitos (ex: 3165537)
  const codigoIbge = ibgeRaw && String(ibgeRaw).trim() !== '-'
    ? String(ibgeRaw).trim().padStart(7, '0')
    : undefined;

  const municipioNome = (!municipio || municipio === '-') ? undefined : municipio;
  const area = funcaoToArea(funcaoCod);

  const idPortal = `MG-${ano}-${numero}`;

  return {
    idPortal,
    ano,
    numero:         numero || undefined,
    tipo:           tipo || undefined,
    funcao:         funcaoDesc || undefined,
    subfuncao:      subfuncao || undefined,
    objeto:         objeto || undefined,
    area,
    valorProposto:  valorProposto || undefined,
    valorEmpenhado,
    valorPago,
    valorRestoPago: valorRestoPago || undefined,
    uf:             'MG',
    codigoIbge,
    municipioNome,
    autorNome:      autor,
    autorCargo:     'DEPUTADO_ESTADUAL',
    estagio:        estagio || undefined,
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

  if (DISCOVER) {
    if (raw[0]) {
      const cols = Object.keys(raw[0]);
      console.log(`\n  Colunas (${cols.length}):`);
      cols.forEach((c, i) => console.log(`    [${i}] "${c}"`));
      console.log(`\n  Exemplo (linha 1):`);
      Object.entries(raw[0]).forEach(([k, v]) => console.log(`    "${k}": ${JSON.stringify(v)}`));
    }
    return;
  }

  const rows = raw.map(mapearLinha).filter((r): r is EmendaEstadualRow => r !== null);
  console.log(`  ${rows.length} emendas mapeadas`);

  const anos = [...new Set(rows.map(r => r.ano))].sort();
  console.log(`  Anos: ${anos.join(', ')}`);

  const semMunicipio = rows.filter(r => !r.municipioNome).length;
  const semValor     = rows.filter(r => !r.valorEmpenhado && !r.valorProposto).length;
  console.log(`\n  Validação:`);
  console.log(`    sem município (nível estadual): ${semMunicipio}`);
  console.log(`    sem valor                     : ${semValor}`);

  const areaCount: Record<string, number> = {};
  rows.forEach(r => { areaCount[r.area ?? 'OUTROS'] = (areaCount[r.area ?? 'OUTROS'] ?? 0) + 1; });
  console.log(`  Áreas:`, areaCount);

  if (rows[0]) {
    console.log(`\n  Exemplo mapeado:`);
    console.log(`    parlamentar : ${rows[0].autorNome}`);
    console.log(`    ano         : ${rows[0].ano}`);
    console.log(`    município   : ${rows[0].municipioNome ?? '(estadual)'}`);
    console.log(`    ibge        : ${rows[0].codigoIbge ?? '-'}`);
    console.log(`    área        : ${rows[0].area}`);
    console.log(`    proposto    : R$ ${rows[0].valorProposto?.toLocaleString('pt-BR') ?? '0'}`);
    console.log(`    empenhado   : R$ ${rows[0].valorEmpenhado?.toLocaleString('pt-BR')}`);
    console.log(`    pago        : R$ ${rows[0].valorPago?.toLocaleString('pt-BR')}`);
    console.log(`    estágio     : ${rows[0].estagio ?? '-'}`);
  }

  if (rows.length === 0) { console.error('\nNenhuma emenda mapeada.'); process.exit(1); }
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
