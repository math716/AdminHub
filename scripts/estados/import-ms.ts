/**
 * Importa emendas parlamentares estaduais de Mato Grosso do Sul (ALEMS).
 *
 * Fontes:
 *   - dados.ms.gov.br — XLSX 2017-2023 (usar apenas 2021-2023) e CSV anuais 2024-2026.
 * Ambos os formatos têm apenas o valor da dotação (Valor Emenda), sem empenho nem pago.
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/estados/import-ms.ts \
 *     --xlsx "data/estados/MS-2017 A 2023.xlsx" \
 *     --csvs "data/estados/MS-2024.csv,data/estados/MS-2025.csv,data/estados/MS-2026.csv"
 *   npx tsx --require dotenv/config scripts/estados/import-ms.ts ... --dry-run
 */
import * as fs from 'fs';
import * as XLSX from 'xlsx';
import { parse } from 'csv/sync';
import { buildPrisma, importarEmendas, parseValorBR, type EmendaEstadualRow } from './base-import-estadual';
import { classificarArea } from '../../lib/portal-transparencia';

function arg(name: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  return idx >= 0 && idx + 1 < process.argv.length ? process.argv[idx + 1] : undefined;
}

const XLSX_FILE = arg('xlsx');
const CSV_FILES = (arg('csvs') ?? arg('csv') ?? '').split(',').map((f) => f.trim()).filter(Boolean);
const DRY_RUN   = process.argv.includes('--dry-run');

// ─── XLSX (2021-2023) ─────────────────────────────────────────────────────────

function parseXlsx(path: string): EmendaEstadualRow[] {
  const wb   = XLSX.readFile(path);
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

  const result: EmendaEstadualRow[] = [];
  for (const r of rows) {
    const ano = Number(r['Ano']);
    if (![2021, 2022, 2023].includes(ano)) continue;

    const autorNome = String(r['Nome do deputado'] ?? '').trim();
    if (!autorNome) continue;

    const municipio = String(r['Município'] ?? '').trim();
    const objeto    = String(r['Descrição Sintética do Objeto'] ?? r['Ação a ser financiada'] ?? '').trim();
    const funcao    = String(r['Ação a ser financiada'] ?? '').trim();
    const termo     = String(r['Número do termo'] ?? '').trim();
    const valorProposto = typeof r['Valor total da solicitação'] === 'number'
      ? r['Valor total da solicitação']
      : parseValorBR(String(r['Valor total da solicitação'] ?? ''));

    result.push({
      idPortal:      `MS-XLSX-${ano}-${termo || result.length + 1}`,
      ano,
      funcao:        funcao || undefined,
      objeto:        objeto || undefined,
      area:          classificarArea(null, funcao || null),
      valorProposto: valorProposto || undefined,
      valorEmpenhado: 0,
      valorPago:     0,
      uf:            'MS',
      municipioNome: municipio || undefined,
      autorNome,
      autorCargo:    'DEPUTADO_ESTADUAL',
    });
  }
  return result;
}

// ─── CSV (2024-2026) ──────────────────────────────────────────────────────────

function parseCsv(path: string): EmendaEstadualRow[] {
  const text = fs.readFileSync(path, 'utf-8').replace(/^﻿/, '');
  const rows: Record<string, string>[] = parse(text, {
    columns: true, skip_empty_lines: true, relax_quotes: true,
    relax_column_count: true, trim: true, delimiter: ';',
  });

  // Extrai ano do nome do arquivo (ex: MS-2024.csv)
  const anoMatch = path.match(/(\d{4})/);
  const anoFile  = anoMatch ? parseInt(anoMatch[1], 10) : 0;

  return rows
    .map((r): EmendaEstadualRow | null => {
      const autorNome = (r['Deputado(s)'] ?? '').trim();
      if (!autorNome) return null;

      const municipioRaw = (r['Município'] ?? '').trim();
      const municipio    = municipioRaw.replace(/\s*-\s*MS\s*$/i, '').trim();
      const processo     = (r['Nº do processo'] ?? '').trim();
      const nrEmenda     = (r['Nº da emenda'] ?? '').trim();
      const objeto       = (r['Objeto'] ?? '').trim();
      const orgao        = (r['Órgão'] ?? '').trim();
      const valorProposto = parseValorBR(r['Valor Emenda']);

      return {
        idPortal:      processo ? `MS-${processo}` : `MS-${anoFile}-${nrEmenda}`,
        ano:           anoFile,
        numero:        nrEmenda || undefined,
        funcao:        orgao || undefined,
        objeto:        objeto || undefined,
        area:          classificarArea(null, orgao || null),
        valorProposto: valorProposto || undefined,
        valorEmpenhado: 0,
        valorPago:     0,
        uf:            'MS',
        municipioNome: municipio || undefined,
        autorNome,
        autorCargo:    'DEPUTADO_ESTADUAL',
      };
    })
    .filter((r): r is EmendaEstadualRow => r !== null);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!XLSX_FILE && !CSV_FILES.length) {
    console.error('\nUso: npx tsx --require dotenv/config scripts/estados/import-ms.ts --xlsx <xlsx> --csvs "csv1,csv2,csv3"');
    process.exit(1);
  }

  console.log(`\n🔄 Import MS${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  let rows: EmendaEstadualRow[] = [];

  if (XLSX_FILE) {
    const xlsxRows = parseXlsx(XLSX_FILE);
    console.log(`  XLSX (2021-2023): ${xlsxRows.length} emendas`);
    rows = rows.concat(xlsxRows);
  }

  for (const f of CSV_FILES) {
    const csvRows = parseCsv(f);
    console.log(`  ${f}: ${csvRows.length} emendas`);
    rows = rows.concat(csvRows);
  }

  const anos       = [...new Set(rows.map((r) => r.ano))].sort();
  const autores    = new Set(rows.map((r) => r.autorNome)).size;
  const municipios = new Set(rows.map((r) => r.municipioNome).filter(Boolean)).size;
  const semValor   = rows.filter((r) => !r.valorProposto && !r.valorEmpenhado && !r.valorPago).length;

  console.log(`\n  Total: ${rows.length} emendas`);
  console.log(`  Validação:`);
  console.log(`    anos             : ${anos.join(', ')}`);
  console.log(`    deputados únicos : ${autores}`);
  console.log(`    municípios       : ${municipios}`);
  console.log(`    sem valor algum  : ${semValor}`);

  const areaCount: Record<string, number> = {};
  rows.forEach((r) => { areaCount[r.area ?? 'OUTROS'] = (areaCount[r.area ?? 'OUTROS'] ?? 0) + 1; });
  console.log(`  Áreas:`, areaCount);

  if (rows[0]) {
    console.log(`\n  Exemplo:`);
    console.log(`    parlamentar    : ${rows[0].autorNome}`);
    console.log(`    município      : ${rows[0].municipioNome}`);
    console.log(`    área           : ${rows[0].area}`);
    console.log(`    valorProposto  : R$ ${rows[0].valorProposto?.toLocaleString('pt-BR')}`);
  }

  if (!rows.length) { console.error('\nNenhuma emenda mapeada.'); process.exit(1); }
  if (DRY_RUN) { console.log('\n[dry-run] nenhuma escrita realizada.'); return; }

  const prisma = buildPrisma();
  try {
    const result = await importarEmendas(prisma, 'MS', rows);
    console.log(`\n✅ Import MS concluído:`);
    console.log(`   emendas inseridas/atualizadas    : ${result.inseridas}`);
    console.log(`   parlamentares criados/atualizados: ${result.parlamentares}`);
    console.log(`   erros                            : ${result.erros}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error('\n❌', e.message); process.exit(1); });
