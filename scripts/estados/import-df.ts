/**
 * Importa emendas parlamentares do DF via SISCONEP Cidadão.
 * Todos os parlamentares são DEPUTADO_ESTADUAL (CLDF).
 *
 * Suporta dois formatos de entrada:
 *   .json  — resposta OutSystems interceptada pelo download-emendas-df-sisconep.ts
 *            campos: EmendaId, NomeCompleto, NrEmenda, NoUO, NameSubTitulo,
 *                    PT, EmpenhadoEmendaSum, LiquidadoEmendaSum, Label, AnoExercicio
 *   .xls / .xlsx — planilha gerada pelo site (fallback legado)
 *            colunas: Unidade Orçamentária | Parlamentar | N° Emenda | Programa de Trabalho
 *                     Subtítulo | Valor Emenda | Empenhado | Liquidado | Status
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/estados/import-df.ts --file data/estados/Emendas_DF_2025.json --ano 2025
 */
import * as XLSX from 'xlsx';
import * as fs from 'fs';
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

// ─── Formato JSON (OutSystems) ────────────────────────────────────────────────

/**
 * Uma emenda como o SISCONEP devolve.
 *
 * Os nomes mudaram quando o site foi republicado: `NomeCompleto` virou
 * `Parlamentar`, `NoUO` virou `UnidadeOrcamentaria`, `EmpenhadoEmendaSum`
 * virou `ValorEmpenhado`. Os dois conjuntos ficam aceitos aqui, para que os
 * arquivos ja baixados continuem importaveis.
 */
interface SISCONEPRow {
  // Forma nova
  Id?: string;
  Parlamentar?: string;
  UnidadeOrcamentaria?: string;
  ValorEmpenhado?: string;
  ValorLiquidado?: string;
  ValorEmenda?: string;
  // Forma antiga
  EmendaId?: string;
  NomeCompleto?: string;
  NoUO?: string;
  EmpenhadoEmendaSum?: string;
  LiquidadoEmendaSum?: string;
  // Iguais nas duas
  NameSubTitulo?: string;
  NrEmenda?: string;
  PT?: string;
}

function lerJson(caminho: string): SISCONEPRow[] {
  const raw = JSON.parse(fs.readFileSync(caminho, 'utf8'));

  // ListAux e a lista completa da resposta atual — tem o Id real da emenda.
  // List e a pagina exibida na tela, e hoje vem vazia; era dela que os
  // arquivos antigos vinham. Relatorio traz os mesmos registros de ListAux,
  // porem com Id "0", entao so serve se nao houver melhor.
  const lista = raw?.data?.ListAux?.List
    ?? raw?.data?.List?.List
    ?? raw?.data?.Relatorio?.List;

  if (!Array.isArray(lista) || lista.length === 0) {
    const chaves = Object.keys(raw?.data ?? {}).join(', ') || '(nenhuma)';
    throw new Error(
      `Formato JSON inválido — esperado data.ListAux.List[] com registros. `
      + `Chaves encontradas em data: ${chaves}`);
  }
  return lista as SISCONEPRow[];
}

function mapearJson(row: SISCONEPRow, ano: number): EmendaEstadualRow | null {
  const autor = (row.Parlamentar ?? row.NomeCompleto ?? '').trim();
  if (!autor) return null;

  const funcao   = (row.UnidadeOrcamentaria ?? row.NoUO ?? '').trim();
  const objeto   = (row.NameSubTitulo ?? '').trim();
  const area     = classificarArea(null, funcao || null);
  const empenhado = parseFloat(row.ValorEmpenhado ?? row.EmpenhadoEmendaSum ?? '') || 0;
  const liquidado = parseFloat(row.ValorLiquidado ?? row.LiquidadoEmendaSum ?? '') || 0;

  return {
    idPortal:       `DF-${ano}-${row.Id ?? row.EmendaId}`,
    ano,
    numero:         row.NrEmenda?.trim() || undefined,
    funcao:         funcao || undefined,
    subfuncao:      row.PT?.trim() || undefined,
    objeto:         objeto || undefined,
    area,
    valorProposto:  empenhado || undefined,
    valorEmpenhado: empenhado,
    valorPago:      liquidado,
    uf:             'DF',
    autorNome:      autor,
    autorCargo:     'DEPUTADO_ESTADUAL',
  };
}

// ─── Formato XLS/XLSX (legado) ────────────────────────────────────────────────

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

function lerXls(caminho: string): Record<string, any>[] {
  const wb = XLSX.readFile(caminho);
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
}

function mapearXls(row: Record<string, any>, ano: number): EmendaEstadualRow | null {
  const autor = String(findCol(row, ['PARLAMENTAR']) ?? '').replace(/\n/g, ' ').trim();
  if (!autor) return null;

  const numero    = String(findCol(row, ['N EMENDA', 'NUM EMENDA', 'NUMERO EMENDA', 'NO EMENDA']) ?? '').trim();
  const unidade   = String(findCol(row, ['UNIDADE ORCAMENTARIA', 'UNIDADE ORC']) ?? '').trim();
  const programa  = String(findCol(row, ['PROGRAMA DE TRABALHO', 'PROGRAMA']) ?? '').trim();
  const subtitulo = String(findCol(row, ['SUBTITULO']) ?? '').trim();

  const valorProposto  = parseValorBR(findCol(row, ['VALOR DA EMENDA', 'VALOR EMENDA']));
  const valorEmpenhado = parseValorBR(findCol(row, ['EMPENHADO']));
  const valorPago      = parseValorBR(findCol(row, ['LIQUIDADO', 'PAGO']));

  const idPortal = numero
    ? `DF-${ano}-${numero.replace(/\s+/g, '')}`
    : `DF-${ano}-${autor.slice(0, 20).replace(/\s+/g, '_')}-${programa.slice(0, 15).replace(/\s+/g, '_')}`;

  const funcao = unidade || undefined;
  const area   = classificarArea(null, funcao ?? null);

  return {
    idPortal, ano, numero: numero || undefined, funcao,
    subfuncao: subtitulo || undefined, objeto: programa || undefined, area,
    valorProposto: valorProposto || undefined, valorEmpenhado, valorPago,
    uf: 'DF', autorNome: autor, autorCargo: 'DEPUTADO_ESTADUAL',
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!FILE) {
    console.error('\nUso: npx tsx --require dotenv/config scripts/estados/import-df.ts --file <caminho> --ano <ano>');
    console.error('     Formatos suportados: .json (OutSystems), .xls, .xlsx');
    process.exit(1);
  }

  console.log(`\n🔄 Import DF — arquivo=${FILE} ano=${ANO}${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  const isJson = FILE.endsWith('.json');
  let rows: EmendaEstadualRow[];

  if (isJson) {
    const rawJson = lerJson(FILE);
    console.log(`  ${rawJson.length} registros JSON lidos.`);
    rows = rawJson.map(r => mapearJson(r, ANO)).filter((r): r is EmendaEstadualRow => r !== null);
  } else {
    const rawXls = lerXls(FILE);
    console.log(`  ${rawXls.length} linhas XLS lidas.`);
    if (rawXls.length > 0) console.log('  Colunas:', Object.keys(rawXls[0]).join(', '));
    rows = rawXls.map(r => mapearXls(r, ANO)).filter((r): r is EmendaEstadualRow => r !== null);
  }

  console.log(`  ${rows.length} emendas mapeadas.`);
  if (rows[0]) {
    console.log(`\n  Exemplo:`);
    console.log(`    parlamentar   : ${rows[0].autorNome}`);
    console.log(`    nº emenda     : ${rows[0].numero}`);
    console.log(`    empenhado     : R$ ${rows[0].valorEmpenhado.toLocaleString('pt-BR')}`);
    console.log(`    área          : ${rows[0].area}`);
  }

  if (rows.length === 0) {
    console.error('\nNenhuma emenda mapeada.');
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
