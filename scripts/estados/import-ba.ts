/**
 * Importa emendas parlamentares estaduais da Bahia (ALBA).
 * Todos os parlamentares são DEPUTADO_ESTADUAL.
 *
 * Fonte: ALBA — arquivo ZIP com CSVs exportados do portal.
 * Arquivo principal: VW_PAINEL_EMENDAS_PARLAMENTARES_DESPESAS.csv
 * Colunas: Ano Exercício, Órgão, Unidade Orçamentária, Ação do Programa
 *          de Governo, Nome do Deputado, num_codigo,
 *          Valor Orçado Inicial., Valor Empenhado., Valor Pago.
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/estados/import-ba.ts \
 *     --file "data/estados/Estado da BA.zip"
 *   npx tsx --require dotenv/config scripts/estados/import-ba.ts \
 *     --file "data/estados/Estado da BA.zip" --dry-run
 */
import * as unzipper from 'unzipper';
import { buildPrisma, importarEmendas, parseValorBR, type EmendaEstadualRow } from './base-import-estadual';
import { classificarArea } from '../../lib/portal-transparencia';

function arg(name: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  return idx >= 0 && idx + 1 < process.argv.length ? process.argv[idx + 1] : undefined;
}

const FILE    = arg('file');
const DRY_RUN = process.argv.includes('--dry-run');

const TARGET_CSV = 'VW_PAINEL_EMENDAS_PARLAMENTARES_DESPESAS.csv';

// ─── Leitura do ZIP ───────────────────────────────────────────────────────────

async function lerCsvDoZip(zipPath: string): Promise<string> {
  const dir = await unzipper.Open.file(zipPath);
  const entry = dir.files.find((f) => f.path === TARGET_CSV || f.path.endsWith(TARGET_CSV));
  if (!entry) throw new Error(`Arquivo ${TARGET_CSV} não encontrado no ZIP`);
  const buf = await entry.buffer();
  return buf.toString('utf-8');
}

// ─── CSV parser minimalista (sem dependências extras) ─────────────────────────

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length === 0) return [];
  lines[0] = lines[0].replace(/^﻿/, ''); // remove BOM
  const headers = lines[0].split(';').map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = line.split(';').map((v) => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, j) => { row[h] = values[j] ?? ''; });
    rows.push(row);
  }
  return rows;
}

// ─── Mapeamento ───────────────────────────────────────────────────────────────

function mapearLinha(row: Record<string, string>): EmendaEstadualRow | null {
  const ano = parseInt(row['Ano Exercício'] ?? '', 10);
  if (!Number.isFinite(ano) || ano < 2000) return null;

  const autorNome = (row['Nome do Deputado'] ?? '').trim();
  if (!autorNome) return null;

  const numCodigo = (row['num_codigo'] ?? '').trim();
  if (!numCodigo) return null;

  const orgao   = (row['Órgão'] ?? '').trim();
  const unidade = (row['Unidade Orçamentária'] ?? '').trim();
  const acao    = (row['Ação do Programa de Governo'] ?? '').trim();

  const valorProposto  = parseValorBR(row['Valor Orçado Inicial.']) || undefined;
  const valorEmpenhado = parseValorBR(row['Valor Empenhado.']);
  const valorPago      = parseValorBR(row['Valor Pago.']);

  return {
    idPortal:      `BA-${numCodigo}`,
    ano,
    funcao:        orgao || undefined,
    subfuncao:     unidade || undefined,
    objeto:        acao || undefined,
    area:          classificarArea(null, orgao),
    valorProposto,
    valorEmpenhado,
    valorPago,
    uf:            'BA',
    autorNome,
    autorCargo:    'DEPUTADO_ESTADUAL',
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!FILE) {
    console.error('\nUso: npx tsx --require dotenv/config scripts/estados/import-ba.ts --file <zip>');
    process.exit(1);
  }

  console.log(`\n🔄 Import BA — arquivo=${FILE}${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  const csvText = await lerCsvDoZip(FILE);
  const raw     = parseCsv(csvText);
  console.log(`  ${raw.length} linhas lidas`);
  if (raw[0]) console.log('  Colunas:', Object.keys(raw[0]).join(', '));

  const rows = raw.map(mapearLinha).filter((r): r is EmendaEstadualRow => r !== null);
  console.log(`  ${rows.length} emendas mapeadas`);

  const anos     = [...new Set(rows.map((r) => r.ano))].sort();
  const semValor = rows.filter((r) => !r.valorEmpenhado && !r.valorPago && !r.valorProposto).length;
  console.log(`\n  Validação:`);
  console.log(`    anos            : ${anos.join(', ')}`);
  console.log(`    sem valor algum : ${semValor}`);

  const areaCount: Record<string, number> = {};
  rows.forEach((r) => { areaCount[r.area ?? 'OUTROS'] = (areaCount[r.area ?? 'OUTROS'] ?? 0) + 1; });
  console.log(`  Áreas:`, areaCount);

  if (rows[0]) {
    console.log(`\n  Exemplo:`);
    console.log(`    parlamentar    : ${rows[0].autorNome}`);
    console.log(`    órgão          : ${rows[0].funcao}`);
    console.log(`    área           : ${rows[0].area}`);
    console.log(`    valorEmpenhado : R$ ${rows[0].valorEmpenhado?.toLocaleString('pt-BR')}`);
    console.log(`    valorPago      : R$ ${rows[0].valorPago?.toLocaleString('pt-BR')}`);
  }

  if (rows.length === 0) { console.error('\nNenhuma emenda mapeada.'); process.exit(1); }
  if (DRY_RUN) { console.log('\n[dry-run] nenhuma escrita realizada.'); return; }

  const prisma = buildPrisma();
  try {
    const result = await importarEmendas(prisma, 'BA', rows);
    console.log(`\n✅ Import BA concluído:`);
    console.log(`   emendas inseridas/atualizadas    : ${result.inseridas}`);
    console.log(`   parlamentares criados/atualizados: ${result.parlamentares}`);
    console.log(`   erros                            : ${result.erros}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error('\n❌', e.message); process.exit(1); });
