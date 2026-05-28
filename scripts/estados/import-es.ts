/**
 * Importa emendas parlamentares estaduais do Espírito Santo (ALES).
 *
 * Fonte: dados.es.gov.br — arquivos CSV anuais.
 * Formato: CSV delimitado por ponto-e-vírgula, encoding UTF-8.
 * Colunas: NomeAutor, AnoEmenda, NumeroEmenda, ObjetoFinalidade, TipoEmenda,
 *   DescricaoRegiaoBeneficiada, Funcao, SubFuncao, ValorPrevisto,
 *   ValorEmpenho, ValorPago, ValorRap, Id.
 *
 * A mesma emenda pode ter múltiplas linhas (por instrumento/convênio).
 * O script agrega por (AnoEmenda, NumeroEmenda, NomeAutor) somando valores.
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/estados/import-es.ts \
 *     --files "data/estados/ES-2024.csv,data/estados/ES-2025.csv,data/estados/ES-2026.csv"
 *   npx tsx --require dotenv/config scripts/estados/import-es.ts \
 *     --files "..." --dry-run
 */
import * as fs from 'fs';
import { parse } from 'csv/sync';
import { buildPrisma, importarEmendas, parseValorBR, normalizeNome, type EmendaEstadualRow } from './base-import-estadual';
import { classificarArea } from '../../lib/portal-transparencia';

function arg(name: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  return idx >= 0 && idx + 1 < process.argv.length ? process.argv[idx + 1] : undefined;
}

const FILES   = (arg('files') ?? arg('file') ?? '').split(',').map((f) => f.trim()).filter(Boolean);
const DRY_RUN = process.argv.includes('--dry-run');

function parseCsv(path: string): Record<string, string>[] {
  const text = fs.readFileSync(path, 'utf-8').replace(/^﻿/, '');
  return parse(text, { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true, trim: true, delimiter: ';' });
}

function extrairNumero(numEmenda: string): string {
  // "2024 / E1179" → "E1179"
  const parts = numEmenda.split('/');
  return (parts.pop() ?? numEmenda).trim().replace(/\s+/g, '');
}

function limparAutor(nome: string): string {
  return nome.replace(/^Dep\.\s*/i, '').trim();
}

interface Grupo {
  ano: number;
  autorNome: string;
  numero: string;
  tipo?: string;
  funcao?: string;
  subfuncao?: string;
  objeto?: string;
  municipio?: string;
  valorProposto: number;
  valorEmpenhado: number;
  valorPago: number;
}

function agrupar(rows: Record<string, string>[]): Grupo[] {
  const map = new Map<string, Grupo>();

  for (const r of rows) {
    const ano = parseInt(r['AnoEmenda'] ?? '', 10);
    if (!Number.isFinite(ano) || ano < 2000) continue;

    const autorRaw = (r['NomeAutor'] ?? '').trim();
    if (!autorRaw) continue;

    const autorNome = limparAutor(autorRaw);
    const numRaw    = (r['NumeroEmenda'] ?? '').trim();
    const numero    = extrairNumero(numRaw);
    if (!numero) continue;

    const key = `${ano}-${numero}-${normalizeNome(autorNome)}`;
    const existing = map.get(key);

    const vProposto  = parseValorBR(r['ValorPrevisto']);
    const vEmpenhado = parseValorBR(r['ValorEmpenho']);
    const vPago      = parseValorBR(r['ValorPago']);

    if (existing) {
      existing.valorProposto   = Math.max(existing.valorProposto, vProposto);
      existing.valorEmpenhado += vEmpenhado;
      existing.valorPago      += vPago;
      if (!existing.municipio && r['DescricaoRegiaoBeneficiada']?.trim()) {
        existing.municipio = r['DescricaoRegiaoBeneficiada'].trim();
      }
    } else {
      const desc = (r['DescricaoRegiaoBeneficiada'] ?? '').trim();
      map.set(key, {
        ano,
        autorNome,
        numero,
        tipo:      (r['TipoEmenda'] ?? '').trim() || undefined,
        funcao:    (r['Funcao'] ?? '').trim() || undefined,
        subfuncao: (r['SubFuncao'] ?? '').trim() || undefined,
        objeto:    (r['ObjetoFinalidade'] ?? '').trim() || undefined,
        municipio: desc || undefined,
        valorProposto: vProposto,
        valorEmpenhado: vEmpenhado,
        valorPago: vPago,
      });
    }
  }

  return [...map.values()];
}

function mapear(g: Grupo): EmendaEstadualRow {
  return {
    idPortal:      `ES-${g.ano}-${g.numero}`,
    ano:           g.ano,
    numero:        g.numero,
    tipo:          g.tipo,
    funcao:        g.funcao,
    subfuncao:     g.subfuncao,
    objeto:        g.objeto,
    area:          classificarArea(null, g.funcao ?? null),
    valorProposto: g.valorProposto || undefined,
    valorEmpenhado: g.valorEmpenhado,
    valorPago:     g.valorPago,
    uf:            'ES',
    municipioNome: g.municipio,
    autorNome:     g.autorNome,
    autorCargo:    'DEPUTADO_ESTADUAL',
  };
}

async function main() {
  if (!FILES.length) {
    console.error('\nUso: npx tsx --require dotenv/config scripts/estados/import-es.ts --files "ES-2024.csv,ES-2025.csv,ES-2026.csv"');
    process.exit(1);
  }

  console.log(`\n🔄 Import ES — ${FILES.length} arquivo(s)${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  let allRows: Record<string, string>[] = [];
  for (const f of FILES) {
    const rows = parseCsv(f);
    console.log(`  ${f}: ${rows.length} linhas`);
    allRows = allRows.concat(rows);
  }

  const grupos = agrupar(allRows);
  const rows   = grupos.map(mapear);
  console.log(`\n  ${rows.length} emendas após agrupamento`);

  const anos       = [...new Set(rows.map((r) => r.ano))].sort();
  const autores    = new Set(rows.map((r) => r.autorNome)).size;
  const municipios = new Set(rows.map((r) => r.municipioNome).filter(Boolean)).size;
  const semValor   = rows.filter((r) => !r.valorEmpenhado && !r.valorPago && !r.valorProposto).length;

  console.log(`\n  Validação:`);
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
    console.log(`    valorEmpenhado : R$ ${rows[0].valorEmpenhado?.toLocaleString('pt-BR')}`);
  }

  if (!rows.length) { console.error('\nNenhuma emenda mapeada.'); process.exit(1); }
  if (DRY_RUN) { console.log('\n[dry-run] nenhuma escrita realizada.'); return; }

  const prisma = buildPrisma();
  try {
    const result = await importarEmendas(prisma, 'ES', rows);
    console.log(`\n✅ Import ES concluído:`);
    console.log(`   emendas inseridas/atualizadas    : ${result.inseridas}`);
    console.log(`   parlamentares criados/atualizados: ${result.parlamentares}`);
    console.log(`   erros                            : ${result.erros}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error('\n❌', e.message); process.exit(1); });
