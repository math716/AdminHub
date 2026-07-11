/**
 * Importa emendas parlamentares estaduais do Rio de Janeiro (ALERJ).
 * Todos os parlamentares são DEPUTADO_ESTADUAL.
 *
 * Fonte: transparencia.alerj.rj.gov.br
 * Formato: uma aba "Impositivas" por arquivo, um arquivo por ano.
 * Colunas: Emenda, Identificador, Autor, Valor, Órgão, Função, Subfunção,
 *          Objeto, Beneficiário, Município, CNPJ, Modalidade
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/estados/import-rj.ts \
 *     --file data/estados/RJ-2025.xlsx --ano 2025
 *   npx tsx --require dotenv/config scripts/estados/import-rj.ts \
 *     --file data/estados/RJ-2026.xlsx --ano 2026 --dry-run
 */
import * as XLSX from 'xlsx';
import { buildPrisma, importarEmendas, parseValorBR, type EmendaEstadualRow } from './base-import-estadual';
import type { EmendaArea } from '@prisma/client';

function arg(name: string, def?: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return def;
}

const FILE    = arg('file');
const ANO     = parseInt(arg('ano', String(new Date().getFullYear()))!, 10);
const DRY_RUN = process.argv.includes('--dry-run');

// ─── Área por código de função SIAFI ─────────────────────────────────────────
// Função vem no formato "10-Saúde", "08-Assistência Social", etc.

function funcaoToArea(funcao: string): EmendaArea {
  const cod = parseInt(funcao.split('-')[0].trim(), 10);
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

// ─── Mapeamento ───────────────────────────────────────────────────────────────

function mapearLinha(rowRaw: Record<string, any>, ano: number): EmendaEstadualRow | null {
  // Normaliza chaves removendo espaços extras
  const row: Record<string, any> = {};
  for (const [k, v] of Object.entries(rowRaw)) row[k.trim()] = v;

  const autor = String(row['Autor'] ?? '').trim();
  if (!autor) return null;

  const identificador = String(row['Identificador'] ?? '').trim();
  const numero        = String(row['Número Emenda'] ?? row['Emenda'] ?? '').trim();
  const funcao        = String(row['Função'] ?? '').trim();
  const subfuncao     = String(row['Subfunção'] ?? '').trim();
  const objeto        = String(row['Nome emenda'] ?? row['Objeto'] ?? '').replace(/\s+/g, ' ').trim();
  const orgao         = String(row['Órgão'] ?? row['UO'] ?? '').trim();
  const municipio     = String(row['Município'] ?? '').trim();
  const modalidade    = String(row['Modalidade'] ?? '').trim();

  const valor = parseValorBR(row['Valor'] ?? 0);

  const area = funcaoToArea(funcao);

  // Município "Estado" = emenda sem município específico
  const municipioNome = (!municipio || municipio === 'Estado') ? undefined : municipio;

  const idPortal = identificador
    ? `RJ-${ano}-${identificador}`
    : `RJ-${ano}-${autor.slice(0, 20).replace(/\s+/g, '_')}-${numero}`;

  return {
    idPortal,
    ano,
    numero:        numero || undefined,
    tipo:          modalidade || undefined,
    funcao:        orgao || funcao || undefined,
    subfuncao:     subfuncao || undefined,
    objeto:        objeto || undefined,
    area,
    valorProposto:  valor,
    valorEmpenhado: valor,
    valorPago:      0,
    uf:            'RJ',
    municipioNome,
    autorNome:     autor,
    autorCargo:    'DEPUTADO_ESTADUAL',
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!FILE) {
    console.error('\nUso: npx tsx --require dotenv/config scripts/estados/import-rj.ts --file <xlsx> --ano <ano>');
    process.exit(1);
  }

  console.log(`\n🔄 Import RJ — arquivo=${FILE} ano=${ANO}${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  const wb = XLSX.readFile(FILE);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
  console.log(`  ${raw.length} linhas lidas`);
  if (raw[0]) console.log('  Colunas:', Object.keys(raw[0]).join(', '));

  const rows = raw
    .map((r) => mapearLinha(r, ANO))
    .filter((r): r is EmendaEstadualRow => r !== null);

  console.log(`  ${rows.length} emendas mapeadas`);

  const semMunicipio = rows.filter(r => !r.municipioNome).length;
  const semValor     = rows.filter(r => !r.valorEmpenhado && !r.valorProposto).length;
  console.log(`\n  Validação:`);
  console.log(`    sem município (nível estadual) : ${semMunicipio}`);
  console.log(`    sem valor                      : ${semValor}`);

  const areaCount: Record<string, number> = {};
  rows.forEach(r => { areaCount[r.area ?? 'OUTROS'] = (areaCount[r.area ?? 'OUTROS'] ?? 0) + 1; });
  console.log(`  Áreas:`, areaCount);

  if (rows[0]) {
    console.log(`\n  Exemplo:`);
    console.log(`    parlamentar : ${rows[0].autorNome}`);
    console.log(`    município   : ${rows[0].municipioNome ?? '(nível estadual)'}`);
    console.log(`    área        : ${rows[0].area}`);
    console.log(`    valor       : R$ ${rows[0].valorEmpenhado?.toLocaleString('pt-BR')}`);
  }

  if (rows.length === 0) { console.error('\nNenhuma emenda mapeada.'); process.exit(1); }
  if (DRY_RUN) { console.log('\n[dry-run] nenhuma escrita realizada.'); return; }

  const prisma = buildPrisma();
  try {
    const result = await importarEmendas(prisma, 'RJ', rows);
    console.log(`\n✅ Import RJ concluído:`);
    console.log(`   emendas inseridas/atualizadas    : ${result.inseridas}`);
    console.log(`   parlamentares criados/atualizados: ${result.parlamentares}`);
    console.log(`   erros                            : ${result.erros}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error('\n❌', e.message); process.exit(1); });
