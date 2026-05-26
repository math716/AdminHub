/**
 * Importa emendas parlamentares estaduais de Minas Gerais.
 *
 * Fonte: Portal Estadual de Emendas MG
 * Portal: https://www.emendas.mg.gov.br/transparencia/
 * Dados: SIAFI-MG, SIGCON-MG, SIAD-MG — atualização bimensal
 *
 * Como baixar o arquivo:
 *   1. Acesse https://www.emendas.mg.gov.br/transparencia/
 *   2. Clique em "Exportar CSV" ou "Download"
 *   3. Salve em data/estados/mg-{ano}.csv
 *   Alternativa: https://www.transparencia.mg.gov.br/emendas-parlamentares
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/estados/import-mg.ts --file data/estados/mg-2024.csv --ano 2024
 *   npx tsx --require dotenv/config scripts/estados/import-mg.ts --file data/estados/mg-2024.csv --ano 2024 --dry-run
 */
import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { buildPrisma, importarEmendas, parseValorBR, type EmendaEstadualRow } from './base-import-estadual';

function arg(name: string, def?: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return def;
}

const FILE    = arg('file');
const ANO     = parseInt(arg('ano', String(new Date().getFullYear() - 1))!, 10);
const DRY_RUN = process.argv.includes('--dry-run');

function mapearLinha(row: Record<string, string>, ano: number): EmendaEstadualRow | null {
  const autor = (
    row['Nome do Autor'] ?? row['Autor'] ?? row['parlamentar'] ?? row['nome_parlamentar'] ??
    row['AUTOR'] ?? row['PARLAMENTAR'] ?? ''
  ).trim();
  if (!autor) return null;

  const numero    = (row['Número da Emenda'] ?? row['numero'] ?? row['Nº'] ?? row['NUMERO'] ?? '').trim();
  const funcao    = (row['Função'] ?? row['Área'] ?? row['funcao'] ?? row['FUNCAO'] ?? '').trim();
  const municipio = (row['Município'] ?? row['Beneficiário'] ?? row['municipio'] ?? row['MUNICIPIO'] ?? '').trim();
  const objeto    = (row['Objeto'] ?? row['Descrição'] ?? row['objeto'] ?? row['OBJETO'] ?? '').trim();
  const partido   = (row['Partido'] ?? row['partido'] ?? row['PARTIDO'] ?? '').trim();
  const tipo      = (row['Tipo'] ?? row['tipo'] ?? row['TIPO'] ?? '').trim();

  const valorEmpenhado = parseValorBR(
    row['Valor Empenhado'] ?? row['empenhado'] ?? row['valor_empenhado'] ?? row['EMPENHADO'] ?? 0,
  );
  const valorPago = parseValorBR(
    row['Valor Pago'] ?? row['pago'] ?? row['valor_pago'] ?? row['PAGO'] ?? 0,
  );
  const valorProposto = parseValorBR(
    row['Valor Proposto'] ?? row['dotacao'] ?? row['valor_proposto'] ?? row['DOTACAO'] ?? 0,
  );

  return {
    idPortal:       numero ? `MG-${ano}-${numero}` : `MG-${ano}-${autor.slice(0, 20)}-${objeto.slice(0, 10)}`,
    ano,
    numero:         numero || undefined,
    tipo:           tipo || undefined,
    funcao:         funcao || undefined,
    objeto:         objeto || undefined,
    valorProposto,
    valorEmpenhado,
    valorPago,
    uf:             'MG',
    municipioNome:  municipio || undefined,
    autorNome:      autor,
    autorCargo:     'DEPUTADO_ESTADUAL',
    autorPartido:   partido || undefined,
  };
}

async function main() {
  if (!FILE) {
    console.error('\nUso: npx tsx --require dotenv/config scripts/estados/import-mg.ts --file <caminho.csv> --ano <ano>');
    console.error('\nComo obter o arquivo:');
    console.error('  1. Acesse https://www.emendas.mg.gov.br/transparencia/');
    console.error('  2. Clique em "Exportar" ou "Download CSV"');
    console.error('  3. Salve em data/estados/mg-2024.csv (por exemplo)');
    process.exit(1);
  }

  console.log(`\n🔄 Import MG — arquivo=${FILE} ano=${ANO}${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  const content = readFileSync(FILE);
  const raw = parse(content, {
    columns: true,
    skip_empty_lines: true,
    delimiter: [',', ';'],
    trim: true,
    bom: true,
  }) as Record<string, string>[];

  console.log(`  ${raw.length} linhas lidas.`);

  if (raw.length === 0) {
    console.error('CSV vazio ou formato não reconhecido.');
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
    const result = await importarEmendas(prisma, 'MG', rows, { dryRun: DRY_RUN });
    console.log(`\n✅ Import MG concluído:`);
    console.log(`   emendas inseridas/atualizadas: ${result.inseridas}`);
    console.log(`   parlamentares criados/atualizados: ${result.parlamentares}`);
    console.log(`   erros: ${result.erros}`);
    if (DRY_RUN) console.log('\n  [dry-run] nenhuma escrita realizada.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error('\n❌', e.message); process.exit(1); });
