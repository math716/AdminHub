/**
 * Importa emendas parlamentares estaduais de Minas Gerais.
 *
 * Fonte: Portal Estadual de Emendas MG
 * Portal: https://www.emendas.mg.gov.br/transparencia/
 * Dados: SIAFI-MG, SIGCON-MG, SIAD-MG — atualização bimensal
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/estados/import-mg.ts --ano 2024
 *   npx tsx --require dotenv/config scripts/estados/import-mg.ts --ano 2024 --dry-run
 */
import { parse } from 'csv-parse/sync';
import { buildPrisma, importarEmendas, parseValorBR, type EmendaEstadualRow } from './base-import-estadual';

// URLs de download do portal emendas.mg.gov.br por ano
// Fonte: https://www.emendas.mg.gov.br/transparencia/
const URLS_POR_ANO: Record<number, string> = {
  2024: 'https://www.emendas.mg.gov.br/dados-de-emendas-2024/',
  2025: 'https://www.emendas.mg.gov.br/portfolio-2025/',
  // Verificar URL exata do CSV em https://www.emendas.mg.gov.br/transparencia/
};

function arg(name: string, def?: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return def;
}

const ANO     = parseInt(arg('ano', String(new Date().getFullYear() - 1))!, 10);
const DRY_RUN = process.argv.includes('--dry-run');

async function baixarCsv(ano: number): Promise<Buffer> {
  // Tenta download direto do portal de transparência MG
  const urls = [
    `https://www.transparencia.mg.gov.br/emendas-parlamentares?ano=${ano}&format=csv`,
    `https://www.emendas.mg.gov.br/wp-content/uploads/emendas-${ano}.csv`,
    `https://dadosabertos.almg.gov.br/ws/emendas/pesquisa?formato=csv&ano=${ano}`,
  ];

  for (const url of urls) {
    try {
      console.log(`  Tentando: ${url}`);
      const res = await fetch(url, {
        headers: { Accept: 'text/csv,application/csv,*/*' },
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        const ct = res.headers.get('content-type') ?? '';
        if (ct.includes('csv') || ct.includes('text')) {
          const ab = await res.arrayBuffer();
          return Buffer.from(ab);
        }
      }
    } catch {
      // tenta próxima URL
    }
  }

  throw new Error(
    `Não foi possível baixar dados de MG/${ano}.\n` +
    `Acesse https://www.emendas.mg.gov.br/transparencia/ e copie a URL direta do CSV.\n` +
    `Adicione em URLS_POR_ANO em scripts/estados/import-mg.ts`,
  );
}

function mapearLinha(row: Record<string, string>, ano: number): EmendaEstadualRow | null {
  // Colunas do portal emendas.mg.gov.br (baseado no padrão ALMG/SIGCON)
  const autor = (
    row['Nome do Autor'] ?? row['Autor'] ?? row['parlamentar'] ?? row['nome_parlamentar'] ?? ''
  ).trim();
  if (!autor) return null;

  const numero    = (row['Número da Emenda'] ?? row['numero'] ?? row['Nº'] ?? '').trim();
  const funcao    = (row['Função'] ?? row['Área'] ?? row['funcao'] ?? '').trim();
  const municipio = (row['Município'] ?? row['Beneficiário'] ?? row['municipio'] ?? '').trim();
  const objeto    = (row['Objeto'] ?? row['Descrição'] ?? row['objeto'] ?? '').trim();
  const partido   = (row['Partido'] ?? row['partido'] ?? '').trim();
  const tipo      = (row['Tipo'] ?? row['tipo'] ?? '').trim();

  const valorEmpenhado = parseValorBR(
    row['Valor Empenhado'] ?? row['empenhado'] ?? row['valor_empenhado'] ?? 0,
  );
  const valorPago = parseValorBR(
    row['Valor Pago'] ?? row['pago'] ?? row['valor_pago'] ?? 0,
  );
  const valorProposto = parseValorBR(
    row['Valor Proposto'] ?? row['dotacao'] ?? row['valor_proposto'] ?? 0,
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
  console.log(`\n🔄 Import MG — ano=${ANO}${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  const buffer = await baixarCsv(ANO);
  const raw = parse(buffer, {
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
  console.log('  Colunas:', Object.keys(raw[0]).join(', '));

  const rows = raw.map((r) => mapearLinha(r, ANO)).filter((r): r is EmendaEstadualRow => r !== null);
  console.log(`  ${rows.length} emendas mapeadas.\n`);

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
