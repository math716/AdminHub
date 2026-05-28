/**
 * Importa emendas parlamentares estaduais do Rio Grande do Sul (ALRS).
 * Todos os parlamentares são DEPUTADO_ESTADUAL.
 *
 * Fonte: ALRS — arquivo multi-ano com aba "Export"
 * Colunas: Ano, Deputado, Partido, Município, Órgão, Projeto,
 *          Subprojeto, Forma de Repasse, Valor
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/estados/import-rs.ts \
 *     --file data/estados/RS-2022-A-2026.xlsx
 *   npx tsx --require dotenv/config scripts/estados/import-rs.ts \
 *     --file data/estados/RS-2022-A-2026.xlsx --dry-run
 */
import * as XLSX from 'xlsx';
import { buildPrisma, importarEmendas, type EmendaEstadualRow } from './base-import-estadual';
import { classificarArea } from '../../lib/portal-transparencia';

function arg(name: string, def?: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return def;
}

const FILE    = arg('file');
const DRY_RUN = process.argv.includes('--dry-run');

// ─── Mapeamento ───────────────────────────────────────────────────────────────

function mapearLinha(row: Record<string, any>): EmendaEstadualRow | null {
  // Filtra rodapés — Ano deve ser número
  if (typeof row['Ano'] !== 'number') return null;

  const deputado = String(row['Deputado'] ?? '').trim();
  if (!deputado) return null;

  const ano        = row['Ano'] as number;
  const partido    = String(row['Partido'] ?? '').trim() || undefined;
  const municipio  = String(row['Município'] ?? '').trim();
  const orgao      = String(row['Órgão'] ?? '').trim();
  const projeto    = String(row['Projeto'] ?? '').trim();
  const subprojeto = String(row['Subprojeto'] ?? '').trim();
  const forma      = String(row['Forma de Repasse'] ?? '').trim();

  const valor = typeof row['Valor'] === 'number'
    ? row['Valor']
    : Number(String(row['Valor'] ?? '0').replace(/\./g, '').replace(',', '.')) || 0;

  // Subprojeto contém código único por emenda (ex: "Ep 2180 - …")
  const idPortal = `RS-${ano}-${subprojeto.slice(0, 80)}`;

  return {
    idPortal,
    ano,
    tipo:          forma || undefined,
    funcao:        orgao || undefined,
    subfuncao:     projeto || undefined,
    objeto:        subprojeto || undefined,
    area:          classificarArea(null, orgao),
    valorProposto:  valor,
    valorEmpenhado: valor,
    valorPago:      0,
    uf:            'RS',
    municipioNome: municipio || undefined,
    autorNome:     deputado,
    autorCargo:    'DEPUTADO_ESTADUAL',
    autorPartido:  partido,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!FILE) {
    console.error('\nUso: npx tsx --require dotenv/config scripts/estados/import-rs.ts --file <xlsx>');
    process.exit(1);
  }

  console.log(`\n🔄 Import RS — arquivo=${FILE}${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  const wb  = XLSX.readFile(FILE);
  const ws  = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
  console.log(`  ${raw.length} linhas lidas`);
  if (raw[0]) console.log('  Colunas:', Object.keys(raw[0]).join(', '));

  const rows = raw
    .map(mapearLinha)
    .filter((r): r is EmendaEstadualRow => r !== null);

  console.log(`  ${rows.length} emendas mapeadas`);

  const semMunicipio = rows.filter(r => !r.municipioNome).length;
  const semValor     = rows.filter(r => !r.valorEmpenhado && !r.valorProposto).length;
  const anos         = [...new Set(rows.map(r => r.ano))].sort();
  console.log(`\n  Validação:`);
  console.log(`    anos                          : ${anos.join(', ')}`);
  console.log(`    sem município (nível estadual): ${semMunicipio}`);
  console.log(`    sem valor                     : ${semValor}`);

  const areaCount: Record<string, number> = {};
  rows.forEach(r => { areaCount[r.area ?? 'OUTROS'] = (areaCount[r.area ?? 'OUTROS'] ?? 0) + 1; });
  console.log(`  Áreas:`, areaCount);

  if (rows[0]) {
    console.log(`\n  Exemplo:`);
    console.log(`    parlamentar : ${rows[0].autorNome} (${rows[0].autorPartido})`);
    console.log(`    município   : ${rows[0].municipioNome ?? '(nível estadual)'}`);
    console.log(`    área        : ${rows[0].area}`);
    console.log(`    valor       : R$ ${rows[0].valorEmpenhado?.toLocaleString('pt-BR')}`);
  }

  if (rows.length === 0) { console.error('\nNenhuma emenda mapeada.'); process.exit(1); }
  if (DRY_RUN) { console.log('\n[dry-run] nenhuma escrita realizada.'); return; }

  const prisma = buildPrisma();
  try {
    const result = await importarEmendas(prisma, 'RS', rows);
    console.log(`\n✅ Import RS concluído:`);
    console.log(`   emendas inseridas/atualizadas    : ${result.inseridas}`);
    console.log(`   parlamentares criados/atualizados: ${result.parlamentares}`);
    console.log(`   erros                            : ${result.erros}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error('\n❌', e.message); process.exit(1); });
