/**
 * Importa emendas parlamentares estaduais de Pernambuco (ALEPE).
 * Todos os parlamentares são DEPUTADO_ESTADUAL.
 *
 * Fonte: Portal de Transparência PE — planilha com coluna Autor.
 * Formato: CSV com cabeçalho nas linhas 1-2 (título + linha em branco),
 *          delimitado por ponto-e-vírgula, encoding UTF-8 BOM.
 * Colunas principais: Ano, Autor, Município, Nº da Emenda, Unidade Orçamentária,
 *          AÇÃO, OBJETO, TEMÁTICA, SUBAÇÃO, VALOR DOT INICIAL,
 *          Valor Empenhado, Valor Liquidado, Valor Pago.
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/estados/import-pe.ts \
 *     --file data/estados/PE-2026.csv
 *   npx tsx --require dotenv/config scripts/estados/import-pe.ts \
 *     --file data/estados/PE-2026.csv --dry-run
 */
import * as fs from 'fs';
import { buildPrisma, importarEmendas, parseValorBR, normalizeNome, type EmendaEstadualRow } from './base-import-estadual';
import type { EmendaArea } from '@prisma/client';

function arg(name: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  return idx >= 0 && idx + 1 < process.argv.length ? process.argv[idx + 1] : undefined;
}

const FILE    = arg('file');
const DRY_RUN = process.argv.includes('--dry-run');

// ─── Mapeamento de TEMÁTICA → EmendaArea ─────────────────────────────────────

const TEMATICA_AREA: Record<string, EmendaArea> = {
  'SAÚDE':                  'SAUDE',
  'EDUCAÇÃO':               'EDUCACAO',
  'SEGURANÇA PÚBLICA':      'SEGURANCA',
  'INFRAESTRUTURA':         'INFRAESTRUTURA',
  'URBANISMO':              'INFRAESTRUTURA',
  'SANEAMENTO':             'SANEAMENTO',
  'ASSISTÊNCIA SOCIAL':     'ASSISTENCIA_SOCIAL',
  'DIREITOS DA CIDADANIA':  'ASSISTENCIA_SOCIAL',
  'TRABALHO':               'ASSISTENCIA_SOCIAL',
  'AGRICULTURA':            'AGRICULTURA',
  'ORGANIZAÇÃO AGRÁRIA':    'AGRICULTURA',
  'CULTURA':                'CULTURA',
  'DESPORTO E LAZER':       'ESPORTE',
  'MEIO AMBIENTE':          'MEIO_AMBIENTE',
  'GESTÃO AMBIENTAL':       'MEIO_AMBIENTE',
  'TRANSPORTE':             'TRANSPORTE',
  'HABITAÇÃO':              'HABITACAO',
};

function mapearTematica(tematica: string): EmendaArea {
  return TEMATICA_AREA[tematica.trim().toUpperCase()] ?? 'OUTROS';
}

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCsv(filePath: string): Record<string, string>[] {
  const text = fs.readFileSync(filePath, 'utf-8').replace(/^﻿/, '');
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  // Pular as 2 primeiras linhas (título + linha em branco)
  let headerIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(';')) { headerIdx = i; break; }
  }

  const headers = lines[headerIdx].split(';').map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows: Record<string, string>[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = line.split(';').map((v) => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, j) => { if (h) row[h] = values[j] ?? ''; });
    rows.push(row);
  }

  return rows;
}

// ─── Mapeamento ───────────────────────────────────────────────────────────────

function mapearLinha(row: Record<string, string>): EmendaEstadualRow | null {
  const ano = parseInt(row['Ano'] ?? '', 10);
  if (!Number.isFinite(ano) || ano < 2000) return null;

  const autorNome = (row['Autor'] ?? '').trim();
  if (!autorNome) return null;

  const municipio  = (row['Município'] ?? '').trim();
  const nrEmenda   = (row['Nº da Emenda'] ?? '').trim();
  const subacao    = (row['SUBAÇÃO'] ?? '').trim();
  const unidade    = (row['Unidade Orçamentária'] ?? '').trim();
  const acao       = (row['AÇÃO'] ?? '').trim();
  const objeto     = (row['OBJETO'] ?? '').trim();
  const tematica   = (row['TEMÁTICA'] ?? '').trim();

  // ID único: código da SUBAÇÃO (ex: "ENXV") ou fallback Autor+Emenda
  const subacaoCod = subacao.split(' - ')[0].trim();
  const idPortal = subacaoCod && subacaoCod.length <= 10
    ? `PE-${ano}-${subacaoCod}`
    : `PE-${ano}-${normalizeNome(autorNome).replace(/\s+/g, '_').slice(0, 30)}-${nrEmenda}`;

  const valorProposto  = parseValorBR(row['VALOR DOT INICIAL']) || undefined;
  const valorEmpenhado = parseValorBR(row['Valor Empenhado']);
  const valorPago      = parseValorBR(row['Valor Pago']);

  return {
    idPortal,
    ano,
    numero:        nrEmenda || undefined,
    funcao:        unidade || undefined,
    subfuncao:     acao || undefined,
    objeto:        objeto || undefined,
    area:          mapearTematica(tematica),
    valorProposto,
    valorEmpenhado,
    valorPago,
    uf:            'PE',
    municipioNome: municipio || undefined,
    autorNome,
    autorCargo:    'DEPUTADO_ESTADUAL',
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!FILE) {
    console.error('\nUso: npx tsx --require dotenv/config scripts/estados/import-pe.ts --file <csv>');
    process.exit(1);
  }

  console.log(`\n🔄 Import PE — arquivo=${FILE}${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  const raw  = parseCsv(FILE);
  console.log(`  ${raw.length} linhas lidas`);

  const rows = raw.map(mapearLinha).filter((r): r is EmendaEstadualRow => r !== null);
  console.log(`  ${rows.length} emendas mapeadas`);

  const anos      = [...new Set(rows.map((r) => r.ano))].sort();
  const autores   = new Set(rows.map((r) => r.autorNome)).size;
  const municipios = new Set(rows.map((r) => r.municipioNome).filter(Boolean)).size;
  const semValor  = rows.filter((r) => !r.valorEmpenhado && !r.valorPago && !r.valorProposto).length;

  console.log(`\n  Validação:`);
  console.log(`    anos             : ${anos.join(', ')}`);
  console.log(`    deputados únicos : ${autores}`);
  console.log(`    municípios       : ${municipios}`);
  console.log(`    sem valor algum  : ${semValor}`);

  const areaCount: Record<string, number> = {};
  rows.forEach((r) => { areaCount[r.area ?? 'OUTROS'] = (areaCount[r.area ?? 'OUTROS'] ?? 0) + 1; });
  console.log(`  Áreas:`, areaCount);

  // Verificar duplicatas de idPortal
  const ids = rows.map((r) => r.idPortal);
  const uniqIds = new Set(ids).size;
  if (uniqIds < ids.length) {
    console.warn(`  ⚠️  ${ids.length - uniqIds} idPortal duplicados detectados`);
  }

  if (rows[0]) {
    console.log(`\n  Exemplo:`);
    console.log(`    parlamentar    : ${rows[0].autorNome}`);
    console.log(`    município      : ${rows[0].municipioNome}`);
    console.log(`    área           : ${rows[0].area}`);
    console.log(`    valorProposto  : R$ ${rows[0].valorProposto?.toLocaleString('pt-BR')}`);
    console.log(`    valorEmpenhado : R$ ${rows[0].valorEmpenhado?.toLocaleString('pt-BR')}`);
  }

  if (rows.length === 0) { console.error('\nNenhuma emenda mapeada.'); process.exit(1); }
  if (DRY_RUN) { console.log('\n[dry-run] nenhuma escrita realizada.'); return; }

  const prisma = buildPrisma();
  try {
    const result = await importarEmendas(prisma, 'PE', rows);
    console.log(`\n✅ Import PE concluído:`);
    console.log(`   emendas inseridas/atualizadas    : ${result.inseridas}`);
    console.log(`   parlamentares criados/atualizados: ${result.parlamentares}`);
    console.log(`   erros                            : ${result.erros}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error('\n❌', e.message); process.exit(1); });
