/**
 * Importa emendas parlamentares estaduais do Rio Grande do Sul.
 *
 * Fonte: Secretaria de Planejamento RS — arquivos XLSX por ano
 * Portal: https://planejamento.rs.gov.br/emendas-parlamentares-estaduais
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/estados/import-rs.ts --ano 2024
 *   npx tsx --require dotenv/config scripts/estados/import-rs.ts --ano 2024 --dry-run
 */
import * as XLSX from 'xlsx';
import { buildPrisma, importarEmendas, parseValorBR, type EmendaEstadualRow } from './base-import-estadual';

// URLs por ano — atualizar quando novos arquivos forem publicados
// Fonte: https://planejamento.rs.gov.br/emendas-parlamentares-estaduais
const URLS_POR_ANO: Record<number, string> = {
  2020: 'https://planejamento.rs.gov.br/upload/arquivos/202107/20115932-emendas-parlamentares-estaduais-2020-com-remanejamento-de-10-04-2021.xlsx',
  2021: 'https://planejamento.rs.gov.br/upload/arquivos/202109/21093325-08173320-emendas-parlamentares-estaduais-2021-com-remanejamento-de-17-09-2021.xlsx',
  2022: 'https://planejamento.rs.gov.br/upload/arquivos/202507/15164801-27105304-13155514-eps-2022-para-site-spgg-em-14-07-25.xlsx',
  // Adicionar 2023, 2024, 2025 quando publicados no portal
};

function arg(name: string, def?: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return def;
}

const ANO     = parseInt(arg('ano', String(new Date().getFullYear() - 1))!, 10);
const DRY_RUN = process.argv.includes('--dry-run');

async function baixarXlsx(url: string): Promise<Buffer> {
  console.log(`  Baixando: ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar ${url}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

function mapearLinha(row: Record<string, any>, ano: number): EmendaEstadualRow | null {
  // O RS usa colunas em português — mapeamento baseado no padrão do SPGG
  // Ajustar nomes de coluna conforme o arquivo real do estado
  const autor = (row['Autor'] ?? row['Parlamentar'] ?? row['Nome do Parlamentar'] ?? '').toString().trim();
  if (!autor) return null;

  const numero = (row['Número'] ?? row['Nº Emenda'] ?? row['numero'] ?? '').toString().trim();
  const funcao = (row['Função'] ?? row['Area'] ?? row['Área'] ?? '').toString().trim();
  const municipio = (row['Município'] ?? row['Municipio'] ?? row['Beneficiário'] ?? '').toString().trim();
  const objeto = (row['Objeto'] ?? row['Descrição'] ?? row['Finalidade'] ?? '').toString().trim();

  const valorEmpenhado = parseValorBR(row['Empenhado'] ?? row['Valor Empenhado'] ?? row['Valor Realizado'] ?? 0);
  const valorPago      = parseValorBR(row['Pago'] ?? row['Valor Pago'] ?? 0);
  const valorProposto  = parseValorBR(row['Proposto'] ?? row['Valor Proposto'] ?? row['Dotação'] ?? 0);

  // ID único: UF + ano + número da emenda
  const idPortal = `RS-${ano}-${numero || autor.slice(0, 20)}-${Math.random().toString(36).slice(2, 6)}`;

  return {
    idPortal: numero ? `RS-${ano}-${numero}` : idPortal,
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
  };
}

async function main() {
  const url = URLS_POR_ANO[ANO];
  if (!url) {
    console.error(`\nURL não cadastrada para o ano ${ANO}.`);
    console.error(`Anos disponíveis: ${Object.keys(URLS_POR_ANO).join(', ')}`);
    console.error(`Adicione a URL em URLS_POR_ANO em scripts/estados/import-rs.ts`);
    process.exit(1);
  }

  console.log(`\n🔄 Import RS — ano=${ANO}${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  const buffer = await baixarXlsx(url);
  const wb     = XLSX.read(buffer, { type: 'buffer' });
  const sheet  = wb.Sheets[wb.SheetNames[0]];
  const raw    = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

  console.log(`  ${raw.length} linhas lidas do XLSX.`);

  const rows = raw.map((r) => mapearLinha(r, ANO)).filter((r): r is EmendaEstadualRow => r !== null);
  console.log(`  ${rows.length} emendas mapeadas.\n`);

  if (rows.length === 0) {
    console.warn('Nenhuma emenda mapeada. Verifique os nomes das colunas no XLSX.');
    console.log('Colunas encontradas:', Object.keys(raw[0] ?? {}).join(', '));
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
