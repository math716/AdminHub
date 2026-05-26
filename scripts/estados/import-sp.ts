/**
 * Importa emendas parlamentares estaduais de São Paulo.
 *
 * Fonte: Portal de Dados Abertos SP — emendas impositivas (LOA estadual)
 * Portal: https://dadosabertos.sp.gov.br/dataset/emendas-impositivas-2025
 * Licença: CC-BY-4.0
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/estados/import-sp.ts --ano 2025
 *   npx tsx --require dotenv/config scripts/estados/import-sp.ts --ano 2025 --dry-run
 */
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'node:fs';
import { buildPrisma, importarEmendas, parseValorBR, type EmendaEstadualRow } from './base-import-estadual';

// Resource IDs do portal de dados abertos SP por ano
// Fonte: https://dadosabertos.sp.gov.br/dataset/emendas-impositivas-{ano}
const RESOURCE_IDS: Record<number, string> = {
  2025: '5a244d8b-0922-48fa-83d2-48b4e644a8d9',
  // Adicionar resource IDs de anos anteriores conforme disponíveis
};

// URL base do CKAN SP para download direto
const CKAN_BASE = 'https://dadosabertos.sp.gov.br/dataset';

function arg(name: string, def?: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return def;
}

const ANO     = parseInt(arg('ano', String(new Date().getFullYear()))!, 10);
const DRY_RUN = process.argv.includes('--dry-run');

async function baixarCsv(ano: number): Promise<Buffer> {
  const resourceId = RESOURCE_IDS[ano];

  // Tenta download direto via CKAN resource
  if (resourceId) {
    const url = `https://dadosabertos.sp.gov.br/datastore/dump/${resourceId}?format=csv`;
    console.log(`  Baixando via CKAN: ${url}`);
    const res = await fetch(url);
    if (res.ok) {
      const ab = await res.arrayBuffer();
      return Buffer.from(ab);
    }
    console.warn(`  CKAN retornou ${res.status}, tentando portal de transparência...`);
  }

  // Fallback: portal de transparência SP
  const fallbackUrl = `https://www.transparencia.sp.gov.br/Home/EmendasParlamentares?ano=${ano}&format=csv`;
  console.log(`  Baixando via transparência SP: ${fallbackUrl}`);
  const res2 = await fetch(fallbackUrl);
  if (!res2.ok) throw new Error(`HTTP ${res2.status} — não foi possível baixar dados de SP/${ano}`);
  const ab = await res2.arrayBuffer();
  return Buffer.from(ab);
}

function mapearLinha(row: Record<string, string>, ano: number): EmendaEstadualRow | null {
  // Colunas do portal de dados abertos SP (emendas impositivas)
  // Ajustar conforme o CSV real do portal
  const autor = (
    row['nome_parlamentar'] ?? row['autor'] ?? row['Autor'] ?? row['Nome Parlamentar'] ?? ''
  ).trim();
  if (!autor) return null;

  const numero    = (row['numero_emenda'] ?? row['numero'] ?? row['Número'] ?? '').trim();
  const funcao    = (row['funcao'] ?? row['area'] ?? row['Função'] ?? '').trim();
  const municipio = (row['municipio'] ?? row['beneficiario'] ?? row['Município'] ?? '').trim();
  const objeto    = (row['objeto'] ?? row['descricao'] ?? row['Objeto'] ?? '').trim();
  const partido   = (row['partido'] ?? row['Partido'] ?? '').trim();

  const valorEmpenhado = parseValorBR(row['valor_empenhado'] ?? row['empenhado'] ?? row['Valor Empenhado'] ?? 0);
  const valorPago      = parseValorBR(row['valor_pago'] ?? row['pago'] ?? row['Valor Pago'] ?? 0);
  const valorProposto  = parseValorBR(row['valor_proposto'] ?? row['dotacao'] ?? row['Valor Proposto'] ?? 0);

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
  console.log(`\n🔄 Import SP — ano=${ANO}${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  const buffer = await baixarCsv(ANO);
  const raw = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    delimiter: [',', ';'],
    trim: true,
  }) as Record<string, string>[];

  console.log(`  ${raw.length} linhas lidas do CSV.`);
  if (raw.length === 0) {
    console.error('CSV vazio ou formato não reconhecido.');
    process.exit(1);
  }
  console.log('  Colunas:', Object.keys(raw[0]).join(', '));

  const rows = raw.map((r) => mapearLinha(r, ANO)).filter((r): r is EmendaEstadualRow => r !== null);
  console.log(`  ${rows.length} emendas mapeadas.\n`);

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
