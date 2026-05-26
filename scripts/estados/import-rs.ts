/**
 * Importa emendas parlamentares estaduais do Rio Grande do Sul.
 *
 * Fonte: Secretaria de Planejamento RS — arquivos XLSX por ano
 * Portal: https://planejamento.rs.gov.br/emendas-parlamentares-estaduais
 *
 * Como baixar o arquivo:
 *   1. Acesse https://planejamento.rs.gov.br/emendas-parlamentares-estaduais
 *   2. Baixe o XLSX do ano desejado
 *   3. Salve em data/estados/rs-{ano}.xlsx
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/estados/import-rs.ts --file data/estados/rs-2022.xlsx --ano 2022
 *   npx tsx --require dotenv/config scripts/estados/import-rs.ts --file data/estados/rs-2022.xlsx --ano 2022 --dry-run
 */
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { buildPrisma, importarEmendas, parseValorBR, type EmendaEstadualRow } from './base-import-estadual';

function arg(name: string, def?: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return def;
}

const FILE    = arg('file');
const ANO     = parseInt(arg('ano', String(new Date().getFullYear() - 1))!, 10);
const DRY_RUN = process.argv.includes('--dry-run');

function mapearLinha(row: Record<string, any>, ano: number): EmendaEstadualRow | null {
  const autor = (
    row['Autor'] ?? row['Parlamentar'] ?? row['Nome do Parlamentar'] ?? row['AUTOR'] ?? ''
  ).toString().trim();
  if (!autor) return null;

  const numero   = (row['Número'] ?? row['Nº Emenda'] ?? row['NUMERO'] ?? row['numero'] ?? '').toString().trim();
  const funcao   = (row['Função'] ?? row['Área'] ?? row['Area'] ?? row['FUNCAO'] ?? '').toString().trim();
  const municipio = (row['Município'] ?? row['Municipio'] ?? row['Beneficiário'] ?? row['MUNICIPIO'] ?? '').toString().trim();
  const objeto   = (row['Objeto'] ?? row['Descrição'] ?? row['Finalidade'] ?? row['OBJETO'] ?? '').toString().trim();
  const partido  = (row['Partido'] ?? row['PARTIDO'] ?? '').toString().trim();

  const valorEmpenhado = parseValorBR(row['Empenhado'] ?? row['Valor Empenhado'] ?? row['Valor Realizado'] ?? row['EMPENHADO'] ?? 0);
  const valorPago      = parseValorBR(row['Pago'] ?? row['Valor Pago'] ?? row['PAGO'] ?? 0);
  const valorProposto  = parseValorBR(row['Proposto'] ?? row['Valor Proposto'] ?? row['Dotação'] ?? row['DOTACAO'] ?? 0);

  return {
    idPortal:       numero ? `RS-${ano}-${numero}` : `RS-${ano}-${autor.slice(0, 20)}-${objeto.slice(0, 10)}`,
    ano,
    numero:         numero || undefined,
    funcao:         funcao || undefined,
    objeto:         objeto || undefined,
    valorProposto,
    valorEmpenhado,
    valorPago,
    uf:             'RS',
    municipioNome:  municipio || undefined,
    autorNome:      autor,
    autorCargo:     'DEPUTADO_ESTADUAL',
    autorPartido:   partido || undefined,
  };
}

async function main() {
  if (!FILE) {
    console.error('\nUso: npx tsx --require dotenv/config scripts/estados/import-rs.ts --file <caminho.xlsx> --ano <ano>');
    console.error('\nComo obter o arquivo:');
    console.error('  1. Acesse https://planejamento.rs.gov.br/emendas-parlamentares-estaduais');
    console.error('  2. Baixe o XLSX do ano desejado');
    console.error('  3. Salve em data/estados/rs-2022.xlsx (por exemplo)');
    process.exit(1);
  }

  console.log(`\n🔄 Import RS — arquivo=${FILE} ano=${ANO}${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  const buffer = readFileSync(FILE);
  const wb     = XLSX.read(buffer, { type: 'buffer' });
  const sheet  = wb.Sheets[wb.SheetNames[0]];
  const raw    = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

  console.log(`  ${raw.length} linhas lidas do XLSX.`);

  if (raw.length === 0) {
    console.error('XLSX vazio ou sem dados na primeira aba.');
    process.exit(1);
  }

  console.log('  Colunas encontradas:', Object.keys(raw[0]).join(', '));

  const rows = raw.map((r) => mapearLinha(r, ANO)).filter((r): r is EmendaEstadualRow => r !== null);
  console.log(`  ${rows.length} emendas mapeadas.\n`);

  if (rows.length === 0) {
    console.warn('Nenhuma emenda mapeada. Verifique os nomes das colunas acima e ajuste o mapeamento em mapearLinha().');
    process.exit(1);
  }

  const prisma = buildPrisma();
  try {
    const result = await importarEmendas(prisma, 'RS', rows, { dryRun: DRY_RUN });
    console.log(`\n✅ Import RS concluído:`);
    console.log(`   emendas inseridas/atualizadas: ${result.inseridas}`);
    console.log(`   parlamentares criados/atualizados: ${result.parlamentares}`);
    console.log(`   erros: ${result.erros}`);
    if (DRY_RUN) console.log('\n  [dry-run] nenhuma escrita realizada.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error('\n❌', e.message); process.exit(1); });
