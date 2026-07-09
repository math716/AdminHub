/**
 * Importa emendas parlamentares do DF via SISCONEP Cidadão.
 * Todos os parlamentares são DEPUTADO_DISTRITAL (CLDF).
 *
 * Colunas esperadas no XLS/XLSX do SISCONEP:
 *   Unidade Orçamentária | Parlamentar | Nº Emenda | Programa de Trabalho
 *   Subtítulo | Valor da Emenda (R$) | Empenhado (R$) | Liquidado (R$) | Status
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/estados/import-df.ts --file data/estados/Emendas_DF_2025.xls --ano 2025
 */
import * as XLSX from 'xlsx';
import { buildPrisma, importarEmendas, parseValorBR, type EmendaEstadualRow } from './base-import-estadual';
import { classificarArea } from '../../lib/portal-transparencia';

function arg(name: string, def?: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return def;
}

const FILE    = arg('file');
const ANO     = parseInt(arg('ano', String(new Date().getFullYear()))!, 10);
const DRY_RUN = process.argv.includes('--dry-run');

// ─── Leitura do XLS/XLSX ─────────────────────────────────────────────────────

function lerArquivo(caminho: string): Record<string, any>[] {
  const wb = XLSX.readFile(caminho);
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
}

// ─── Mapeamento de colunas ───────────────────────────────────────────────────

function normalizeKey(k: string): string {
  return k.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function findCol(row: Record<string, any>, candidates: string[]): any {
  for (const [k, v] of Object.entries(row)) {
    const nk = normalizeKey(k);
    if (candidates.some(c => nk.includes(c))) return v;
  }
  return '';
}

function mapearRow(row: Record<string, any>, ano: number): EmendaEstadualRow | null {
  const autor    = String(findCol(row, ['PARLAMENTAR']) ?? '').replace(/\n/g, ' ').trim();
  if (!autor) return null;

  const numero   = String(findCol(row, ['N EMENDA', 'NUM EMENDA', 'NUMERO EMENDA', 'NO EMENDA']) ?? '').trim();
  const unidade  = String(findCol(row, ['UNIDADE ORCAMENTARIA', 'UNIDADE ORC']) ?? '').trim();
  const programa = String(findCol(row, ['PROGRAMA DE TRABALHO', 'PROGRAMA']) ?? '').trim();
  const subtitulo = String(findCol(row, ['SUBTITULO']) ?? '').trim();

  const valorProposto  = parseValorBR(findCol(row, ['VALOR DA EMENDA', 'VALOR EMENDA']));
  const valorEmpenhado = parseValorBR(findCol(row, ['EMPENHADO']));
  const valorPago      = parseValorBR(findCol(row, ['LIQUIDADO', 'PAGO']));

  // ID determinístico: DF + ano + número da emenda (ou fallback com autor+índice)
  const idPortal = numero
    ? `DF-${ano}-${numero.replace(/\s+/g, '')}`
    : `DF-${ano}-${autor.slice(0, 20).replace(/\s+/g, '_')}-${programa.slice(0, 15).replace(/\s+/g, '_')}`;

  const funcao = unidade || undefined;
  const area   = classificarArea(null, funcao ?? null);

  return {
    idPortal,
    ano,
    numero:         numero || undefined,
    funcao,
    subfuncao:      subtitulo || undefined,
    objeto:         programa || undefined,
    area,
    valorProposto:  valorProposto || undefined,
    valorEmpenhado,
    valorPago,
    uf:             'DF',
    autorNome:      autor,
    autorCargo:     'DEPUTADO_ESTADUAL',
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!FILE) {
    console.error('\nUso: npx tsx --require dotenv/config scripts/estados/import-df.ts --file <caminho.xls> --ano <ano>');
    process.exit(1);
  }

  console.log(`\n🔄 Import DF — arquivo=${FILE} ano=${ANO}${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  const rawRows = lerArquivo(FILE);
  console.log(`  ${rawRows.length} linhas lidas.`);
  if (rawRows.length > 0) {
    console.log('  Colunas:', Object.keys(rawRows[0]).join(', '));
  }

  const rows = rawRows
    .map(r => mapearRow(r, ANO))
    .filter((r): r is EmendaEstadualRow => r !== null);

  console.log(`  ${rows.length} emendas mapeadas.`);
  if (rows[0]) {
    console.log(`\n  Exemplo:`);
    console.log(`    parlamentar   : ${rows[0].autorNome}`);
    console.log(`    nº emenda     : ${rows[0].numero}`);
    console.log(`    valor proposto: R$ ${rows[0].valorProposto?.toLocaleString('pt-BR')}`);
    console.log(`    empenhado     : R$ ${rows[0].valorEmpenhado.toLocaleString('pt-BR')}`);
    console.log(`    área          : ${rows[0].area}`);
  }

  if (rows.length === 0) {
    console.error('\nNenhuma emenda mapeada. Verifique os nomes das colunas acima.');
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('\n[dry-run] nenhuma escrita realizada.');
    return;
  }

  const prisma = buildPrisma();
  try {
    const result = await importarEmendas(prisma, 'DF', rows, { batchSize: 20 });
    console.log(`\n✅ Import DF concluído:`);
    console.log(`   emendas inseridas/atualizadas    : ${result.inseridas}`);
    console.log(`   parlamentares criados/atualizados: ${result.parlamentares}`);
    console.log(`   erros                            : ${result.erros}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1); });
