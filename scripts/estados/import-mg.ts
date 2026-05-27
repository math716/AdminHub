/**
 * Importa emendas parlamentares estaduais de Minas Gerais (ALMG).
 * Todos os parlamentares são DEPUTADO_ESTADUAL.
 *
 * Suporta dois formatos do portal emendas.mg.gov.br:
 *   Formato A (2019–2022): col "Ano Exercicio Inciso", área por código numérico "Função do Inciso"
 *   Formato B (2023–2026): col "Ano da Indicação", área por texto "Função Descrição", IBGE presente
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/estados/import-mg.ts \
 *     --file-a data/estados/mg-2019-2020-2021-2022.xlsx \
 *     --file-b data/estados/mg-2023-2024-2025-2026.xlsx \
 *     --ano-min 2021
 *   Opcional: --dry-run
 */
import * as XLSX from 'xlsx';
import { buildPrisma, importarEmendas, parseValorBR, type EmendaEstadualRow } from './base-import-estadual';
import type { EmendaArea } from '@prisma/client';

function arg(name: string, def?: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return def;
}

const FILE_A  = arg('file-a');
const FILE_B  = arg('file-b');
const ANO_MIN = parseInt(arg('ano-min', '2021')!, 10);
const ANO_MAX = parseInt(arg('ano-max', '2026')!, 10);
const DRY_RUN = process.argv.includes('--dry-run');

// ─── Área por código de função SIAFI (formato A) ─────────────────────────────

function funcaoCodToArea(cod: number): EmendaArea {
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
    case 4:
    case 6:
    case 7:
    case 11:
    case 15:
    case 22:
    case 23:
    case 25:
    case 26: return 'INFRAESTRUTURA';
    default: return 'OUTROS';
  }
}

// ─── Área por texto de função (formato B) ────────────────────────────────────

function funcaoTextoToArea(funcao: string): EmendaArea {
  const f = funcao.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (f.includes('saude'))                                                          return 'SAUDE';
  if (f.includes('educacao'))                                                       return 'EDUCACAO';
  if (f.includes('assist') || f.includes('cidadania') || f.includes('previdencia')) return 'ASSISTENCIA_SOCIAL';
  if (f.includes('habitacao'))                                                      return 'HABITACAO';
  if (f.includes('saneamento'))                                                     return 'SANEAMENTO';
  if (f.includes('agricultura') || f.includes('agraria'))                           return 'AGRICULTURA';
  if (f.includes('desporto') || f.includes('lazer'))                                return 'ESPORTE';
  if (f.includes('cultura'))                                                        return 'CULTURA';
  if (f.includes('meio ambiente') || f.includes('ambiental') || f.includes('gestao ambiental')) return 'MEIO_AMBIENTE';
  if (f.includes('seguranca') || f.includes('defesa') || f.includes('judiciaria'))  return 'SEGURANCA';
  if (f.includes('transport') || f.includes('urbanismo') || f.includes('energia') ||
      f.includes('infraestrutura') || f.includes('industria') || f.includes('comercio')) return 'INFRAESTRUTURA';
  return 'OUTROS';
}

// ─── Mapeamento formato A ─────────────────────────────────────────────────────

function mapearFormatoA(row: Record<string, any>): EmendaEstadualRow | null {
  const ano = Number(row['Ano Exercicio Inciso'] ?? 0);
  if (!ano || ano < ANO_MIN || ano > ANO_MAX) return null;

  const autor = String(row['Nome do Responsável'] ?? '').trim();
  if (!autor || autor === '-') return null;

  const sigcon    = String(row['Nº Indicação - SIGCON'] ?? '').trim();
  const municipio = String(row['Município'] ?? '').trim();
  const objeto    = String(row['Descrição Indicação'] ?? '').trim();
  const funcao    = Number(row['Função do Inciso'] ?? 0);
  const orgao     = String(row['Órgão - Sigla'] ?? '').trim();
  const tipo      = String(row['Tipo de Indicação'] ?? '').trim();

  const valorProposto  = parseValorBR(row['Valor Indicação'] ?? 0);
  const valorEmpenhado = parseValorBR(row['Valor Empenhado no Ano da Emenda'] ?? 0);
  const valorPago      = parseValorBR(row['Valor Pago Atual'] ?? row['Valor Pago no Ano da Emenda'] ?? 0);

  const area = funcaoCodToArea(funcao);
  const idPortal = sigcon
    ? `MG-${ano}-${sigcon}`
    : `MG-${ano}-${autor.slice(0, 20).replace(/\s+/g, '_')}-${municipio.slice(0, 15).replace(/\s+/g, '_')}`;

  return {
    idPortal,
    ano,
    numero:        sigcon || undefined,
    tipo:          tipo || undefined,
    funcao:        orgao || undefined,
    objeto:        objeto || undefined,
    area,
    valorProposto,
    valorEmpenhado,
    valorPago,
    uf:            'MG',
    municipioNome: municipio || undefined,
    autorNome:     autor,
    autorCargo:    'DEPUTADO_ESTADUAL',
  };
}

// ─── Mapeamento formato B ─────────────────────────────────────────────────────

function mapearFormatoB(row: Record<string, any>): EmendaEstadualRow | null {
  const ano = Number(row['Ano da Indicação'] ?? 0);
  if (!ano || ano < ANO_MIN || ano > ANO_MAX) return null;

  const autor = String(row['Autor'] ?? '').trim();
  if (!autor || autor === '-') return null;

  const numero    = String(row['Número da Indicação'] ?? '').trim();
  const municipio = String(row['Município'] ?? '').trim();
  const objeto    = String(row['Descrição da Indicação'] ?? '').trim();
  const funcaoTxt = String(row['Função Descrição'] ?? '').trim();
  const funcaoCod = String(row['Função Código'] ?? '').trim();
  const tipo      = String(row['Tipo de Indicação'] ?? '').trim();
  const ibge      = String(row['Código IBGE do Município'] ?? '').trim();

  const valorProposto  = parseValorBR(row['Valor Indicado'] ?? 0);
  const valorEmpenhado = parseValorBR(row['Valor Empenhado no Ano'] ?? 0);
  const valorPago      = parseValorBR(row['Valor Pago Atualizado'] ?? row['Valor Pago no Ano'] ?? 0);

  const area = funcaoTextoToArea(funcaoTxt);
  const idPortal = numero
    ? `MG-${ano}-${numero}`
    : `MG-${ano}-${autor.slice(0, 20).replace(/\s+/g, '_')}-${municipio.slice(0, 15).replace(/\s+/g, '_')}`;

  return {
    idPortal,
    ano,
    numero:        numero || undefined,
    tipo:          tipo || undefined,
    funcao:        funcaoTxt || funcaoCod || undefined,
    objeto:        objeto || undefined,
    area,
    valorProposto,
    valorEmpenhado,
    valorPago,
    uf:            'MG',
    codigoIbge:    ibge && ibge !== '-' ? ibge : undefined,
    municipioNome: municipio || undefined,
    autorNome:     autor,
    autorCargo:    'DEPUTADO_ESTADUAL',
  };
}

// ─── Leitura de arquivo ───────────────────────────────────────────────────────

function lerArquivo(caminho: string, formato: 'A' | 'B'): EmendaEstadualRow[] {
  const wb = XLSX.readFile(caminho);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
  console.log(`  ${caminho}: ${raw.length} linhas lidas (formato ${formato})`);
  const rows = raw
    .map((r) => formato === 'A' ? mapearFormatoA(r) : mapearFormatoB(r))
    .filter((r): r is EmendaEstadualRow => r !== null);
  console.log(`  → ${rows.length} emendas mapeadas (anos ${ANO_MIN}–${ANO_MAX})`);
  return rows;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!FILE_A && !FILE_B) {
    console.error('\nUso: npx tsx --require dotenv/config scripts/estados/import-mg.ts --file-a <xlsx> --file-b <xlsx>');
    process.exit(1);
  }

  console.log(`\n🔄 Import MG — anos ${ANO_MIN}–${ANO_MAX}${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  const rows: EmendaEstadualRow[] = [];
  if (FILE_A) rows.push(...lerArquivo(FILE_A, 'A'));
  if (FILE_B) rows.push(...lerArquivo(FILE_B, 'B'));

  console.log(`\n  Total: ${rows.length} emendas`);

  const semMunicipio = rows.filter(r => !r.municipioNome).length;
  const semValor     = rows.filter(r => !r.valorEmpenhado && !r.valorPago && !r.valorProposto).length;
  console.log(`  Validação:`);
  console.log(`    sem município : ${semMunicipio}`);
  console.log(`    sem valor     : ${semValor}`);
  console.log(`    com IBGE      : ${rows.filter(r => r.codigoIbge).length}`);

  const areaCount: Record<string, number> = {};
  rows.forEach(r => { areaCount[r.area ?? 'OUTROS'] = (areaCount[r.area ?? 'OUTROS'] ?? 0) + 1; });
  console.log(`  Áreas:`, areaCount);

  if (rows[0]) {
    console.log(`\n  Exemplo:`);
    console.log(`    parlamentar : ${rows[0].autorNome}`);
    console.log(`    município   : ${rows[0].municipioNome}`);
    console.log(`    área        : ${rows[0].area}`);
    console.log(`    empenhado   : R$ ${rows[0].valorEmpenhado?.toLocaleString('pt-BR')}`);
  }

  if (rows.length === 0) { console.error('\nNenhuma emenda mapeada.'); process.exit(1); }
  if (DRY_RUN) { console.log('\n[dry-run] nenhuma escrita realizada.'); return; }

  const prisma = buildPrisma();
  try {
    const result = await importarEmendas(prisma, 'MG', rows);
    console.log(`\n✅ Import MG concluído:`);
    console.log(`   emendas inseridas/atualizadas    : ${result.inseridas}`);
    console.log(`   parlamentares criados/atualizados: ${result.parlamentares}`);
    console.log(`   erros                            : ${result.erros}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error('\n❌', e.message); process.exit(1); });
