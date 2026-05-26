/**
 * Importa emendas parlamentares estaduais de São Paulo.
 *
 * Fonte: Portal de Dados Abertos SP — emendas impositivas (LOA estadual)
 * Licença: CC-BY-4.0
 *
 * Como baixar o arquivo:
 *   1. Acesse https://dadosabertos.sp.gov.br/dataset/emendas-impositivas-2025
 *      (substitua o ano conforme necessário)
 *   2. Clique no recurso CSV e baixe o arquivo
 *   3. Salve em data/estados/sp-{ano}.csv
 *   Alternativa: https://www.transparencia.sp.gov.br/Home/EmendasParlamentares
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/estados/import-sp.ts --file data/estados/sp-2025.csv --ano 2025
 *   npx tsx --require dotenv/config scripts/estados/import-sp.ts --file data/estados/sp-2025.csv --ano 2025 --dry-run
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
const ANO     = parseInt(arg('ano', String(new Date().getFullYear()))!, 10);
const DRY_RUN = process.argv.includes('--dry-run');

function mapearLinha(row: Record<string, string>, ano: number): EmendaEstadualRow | null {
  const autor = (
    row['nome_parlamentar'] ?? row['autor'] ?? row['Autor'] ?? row['Nome Parlamentar'] ??
    row['PARLAMENTAR'] ?? row['Parlamentar'] ?? ''
  ).trim();
  if (!autor) return null;

  const numero    = (row['numero_emenda'] ?? row['numero'] ?? row['Número'] ?? row['NUMERO'] ?? '').trim();
  const funcao    = (row['funcao'] ?? row['area'] ?? row['Função'] ?? row['Área'] ?? row['FUNCAO'] ?? '').trim();
  const municipio = (row['municipio'] ?? row['beneficiario'] ?? row['Município'] ?? row['Beneficiário'] ?? '').trim();
  const objeto    = (row['objeto'] ?? row['descricao'] ?? row['Objeto'] ?? row['Descrição'] ?? '').trim();
  const partido   = (row['partido'] ?? row['Partido'] ?? row['PARTIDO'] ?? '').trim();

  const valorEmpenhado = parseValorBR(row['valor_empenhado'] ?? row['empenhado'] ?? row['Valor Empenhado'] ?? 0);
  const valorPago      = parseValorBR(row['valor_pago'] ?? row['pago'] ?? row['Valor Pago'] ?? 0);
  const valorProposto  = parseValorBR(row['valor_proposto'] ?? row['dotacao'] ?? row['Valor Proposto'] ?? row['Dotação'] ?? 0);

  return {
    idPortal:       numero ? `SP-${ano}-${numero}` : `SP-${ano}-${autor.slice(0, 20)}-${objeto.slice(0, 10)}`,
    ano,
    numero:         numero || undefined,
    funcao:         funcao || undefined,
    objeto:         objeto || undefined,
    valorProposto,
    valorEmpenhado,
    valorPago,
    uf:             'SP',
    municipioNome:  municipio || undefined,
    autorNome:      autor,
    autorCargo:     'DEPUTADO_ESTADUAL',
    autorPartido:   partido || undefined,
  };
}

async function main() {
  if (!FILE) {
    console.error('\nUso: npx tsx --require dotenv/config scripts/estados/import-sp.ts --file <caminho.csv> --ano <ano>');
    console.error('\nComo obter o arquivo:');
    console.error('  1. Acesse https://dadosabertos.sp.gov.br/dataset/emendas-impositivas-2025');
    console.error('  2. Clique no recurso CSV e baixe o arquivo');
    console.error('  3. Salve em data/estados/sp-2025.csv (por exemplo)');
    process.exit(1);
  }

  console.log(`\n🔄 Import SP — arquivo=${FILE} ano=${ANO}${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

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
    const result = await importarEmendas(prisma, 'SP', rows, { dryRun: DRY_RUN });
    console.log(`\n✅ Import SP concluído:`);
    console.log(`   emendas inseridas/atualizadas: ${result.inseridas}`);
    console.log(`   parlamentares criados/atualizados: ${result.parlamentares}`);
    console.log(`   erros: ${result.erros}`);
    if (DRY_RUN) console.log('\n  [dry-run] nenhuma escrita realizada.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error('\n❌', e.message); process.exit(1); });
