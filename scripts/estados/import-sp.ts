/**
 * Importa emendas parlamentares estaduais de São Paulo (ALESP).
 * Todos os parlamentares são DEPUTADO_ESTADUAL.
 *
 * Suporta dois formatos:
 *   Formato A (2021/2022): linha 1 = título, linha 2 = cabeçalho,
 *     colunas: PARLAMENTAR, BENEFICIÁRIO, MUNICÍPIO, OBJETO, ÓRGÃO PROCESSADOR, "R$", VALOR, STATUS
 *   Formato B (2023+): linha 1 = cabeçalho,
 *     colunas: MUNICÍPIO, ÓRGÃO PROCESSADOR, OBJETO, PARLAMENTAR, PARTIDO, ANO,
 *              CÓDIGO, TIPO EMENDA, FUNÇÃO DE GOVERNO, ..., ESTÁGIO, VALOR DECISÃO, VALOR REMANEJADO
 *
 * Fontes:
 *   https://dadosabertos.sp.gov.br/dataset/emendas-impositivas-{ano}
 *   https://www.transparencia.sp.gov.br/Home/EmendasParlamentares
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/estados/import-sp.ts --file data/estados/sp-2025.xlsx --ano 2025
 *   npx tsx --require dotenv/config scripts/estados/import-sp.ts --file data/estados/sp-2021-saude.xlsx --ano 2021 --area SAUDE
 */
import * as XLSX from 'xlsx';
import { buildPrisma, importarEmendas, parseValorBR, type EmendaEstadualRow } from './base-import-estadual';
import type { EmendaArea } from '@prisma/client';

function arg(name: string, def?: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return def;
}

const FILE      = arg('file');
const ANO       = parseInt(arg('ano', String(new Date().getFullYear()))!, 10);
const DRY_RUN   = process.argv.includes('--dry-run');
const AREA_FLAG = arg('area') as EmendaArea | undefined;  // override de área (ex: SAUDE)

// ─── Leitura do XLSX ──────────────────────────────────────────────────────────

function lerXlsx(caminho: string): { rows: Record<string, any>[]; formato: 'A' | 'B'; titulo: string } {
  const wb = XLSX.readFile(caminho);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });

  const primeiraColuna = String(raw[0]?.[0] ?? '');
  const isFormatoA = primeiraColuna.toUpperCase().includes('EMENDAS IMPOSITIVAS');

  if (isFormatoA) {
    const titulo  = primeiraColuna;
    const headers = raw[1] as (string | undefined)[];
    const dados   = raw.slice(2).filter((r: any[]) => r.length > 0 && r[0]);
    const rows = dados.map((r: any[]) => {
      const obj: Record<string, any> = {};
      // Loop normal (não forEach) para não pular buracos de arrays esparsos
      const len = Math.max(headers.length, r.length);
      for (let i = 0; i < len; i++) {
        const h = headers[i];
        obj[h != null && h !== '' ? h : `__COL${i}`] = r[i] ?? '';
      }
      return obj;
    });
    return { rows, formato: 'A', titulo };
  }

  // Formato B: cabeçalho na primeira linha
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
  return { rows, formato: 'B', titulo: '' };
}

// ─── Inferência de área (Formato A não tem função de governo) ─────────────────

function inferirArea(objeto: string, orgao: string, titulo: string): EmendaArea {
  if (AREA_FLAG) return AREA_FLAG;

  const tit = titulo.toLowerCase();
  const o   = orgao.toLowerCase();

  // Mapeamento direto por ÓRGÃO PROCESSADOR (mais confiável que objeto/título)
  if (o.includes('saúde') || o.includes('saude') || o.includes('hospital') || o.includes('clínica') || o.includes('clinica')) return 'SAUDE';
  if (o.includes('educação') || o.includes('educacao') || o.includes('universidade') || o.includes('usp') || o.includes('unicamp') || o.includes('unesp') || o.includes('paula souza') || o.includes('ceeteps')) return 'EDUCACAO';
  if (o.includes('segurança') || o.includes('seguranca') || o.includes('polí') || o.includes('poli') || o.includes('bombeiro') || o.includes('penitenciária') || o.includes('penitenciaria') || o.includes('técnico-científica') || o.includes('tecnico-cientifica')) return 'SEGURANCA';
  if (o.includes('habitação') || o.includes('habitacao')) return 'HABITACAO';
  if (o.includes('agricultura') || o.includes('abastecimento') || o.includes('itesp') || o.includes('animal')) return 'AGRICULTURA';
  if (o.includes('cultura') || o.includes('memorial')) return 'CULTURA';
  if (o.includes('esporte')) return 'ESPORTE';
  if (o.includes('infraestrutura') || o.includes('saneamento') || o.includes('detran') || o.includes('trânsito') || o.includes('transito')) return 'INFRAESTRUTURA';
  if (o.includes('social') || o.includes('deficiência') || o.includes('deficiencia') || o.includes('socioeducativo') || o.includes('fundação casa') || o.includes('fundacao casa') || o.includes('cidadania') || o.includes('justiça') || o.includes('justica')) return 'ASSISTENCIA_SOCIAL';
  if (o.includes('meio ambiente') || o.includes('ambiental')) return 'MEIO_AMBIENTE';

  // Fallback: inferência pelo título do arquivo e objeto
  const isSaudeTitulo = (tit.includes('saúde') || tit.includes('saude')) && !tit.includes('exceto');
  if (isSaudeTitulo) return 'SAUDE';

  const obj = objeto.toLowerCase();
  if (obj.includes('infraestrutura') || obj.includes('pavimentação') || obj.includes('pavimentacao')) return 'INFRAESTRUTURA';
  if (obj.includes('saneamento')) return 'SANEAMENTO';

  return 'OUTROS';
}

// ─── Mapeamentos ──────────────────────────────────────────────────────────────

function mapearFormatoA(row: Record<string, any>, ano: number, titulo: string): EmendaEstadualRow | null {
  const autor    = String(row['PARLAMENTAR'] ?? '').replace(/\n/g, ' ').trim();
  if (!autor) return null;

  const municipio = String(row['MUNICÍPIO'] ?? row['MUNICIPIO'] ?? '').replace(/\n/g, ' ').trim();
  const objeto    = String(row['OBJETO']    ?? '').replace(/\n/g, ' ').trim();
  const orgao     = String(row['ÓRGÃO PROCESSADOR'] ?? row['ORGAO PROCESSADOR'] ?? '').replace(/\n/g, ' ').trim();
  const status    = String(row['STATUS']    ?? '').trim().toLowerCase();

  // Col 5 = 'VALOR' (contém "R$"), col 6 = sem cabeçalho (o número real) → mapeada como __COL6
  const valorNum  = parseValorBR(row['__COL6'] ?? 0);

  const pago = status.includes('pag') ? valorNum : 0;
  const area = inferirArea(objeto, orgao, titulo);

  // Sem CÓDIGO nos arquivos antigos: gera um ID determinístico
  const idPortal = `SP-${ano}-${autor.slice(0, 25).replace(/\s+/g, '_')}-${municipio.slice(0, 15).replace(/\s+/g, '_')}-${objeto.slice(0, 10).replace(/\s+/g, '_')}`;

  return {
    idPortal,
    ano,
    funcao:         orgao || undefined,
    objeto:         objeto || undefined,
    area,
    valorProposto:  valorNum,
    valorEmpenhado: valorNum,
    valorPago:      pago,
    uf:             'SP',
    municipioNome:  municipio || undefined,
    autorNome:      autor,
    autorCargo:     'DEPUTADO_ESTADUAL',
  };
}

function mapearFormatoB(row: Record<string, any>, ano: number): EmendaEstadualRow | null {
  const autor = String(row['PARLAMENTAR'] ?? '').trim();
  if (!autor) return null;

  const codigo    = String(row['CÓDIGO'] ?? row['CODIGO'] ?? '').trim();
  const municipio = String(row['MUNICÍPIO'] ?? row['MUNICIPIO'] ?? '').trim();
  const objeto    = String(row['OBJETO'] ?? '').trim();
  const partido   = String(row['PARTIDO'] ?? '').trim();
  const funcao    = String(row['FUNÇÃO DE GOVERNO'] ?? row['FUNCAO DE GOVERNO'] ?? '').trim();
  const tipo      = String(row['TIPO EMENDA'] ?? '').trim();
  const estagioRaw = String(row['ESTÁGIO'] ?? row['ESTAGIO'] ?? '').trim();
  const estagio    = estagioRaw.toLowerCase();

  const valorDecisao    = parseValorBR(row['VALOR DECISÃO'] ?? row['VALOR DECISAO'] ?? 0);
  const valorRemanejado = parseValorBR(row['VALOR REMANEJADO'] ?? 0);
  const valorFinal      = valorDecisao - valorRemanejado;
  const pago            = estagio.includes('pag') ? valorFinal : 0;

  return {
    idPortal:      codigo ? `SP-${ano}-${codigo}` : `SP-${ano}-${autor.slice(0, 20)}-${objeto.slice(0, 15)}`,
    ano,
    numero:        codigo || undefined,
    tipo:          tipo || undefined,
    funcao:        funcao || undefined,
    objeto:        objeto || undefined,
    valorProposto: valorDecisao,
    valorEmpenhado: valorFinal,
    valorPago:     pago,
    uf:            'SP',
    municipioNome: municipio || undefined,
    autorNome:     autor,
    autorCargo:    'DEPUTADO_ESTADUAL',
    autorPartido:  partido || undefined,
    estagio:       estagioRaw || undefined,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!FILE) {
    console.error('\nUso: npx tsx --require dotenv/config scripts/estados/import-sp.ts --file <caminho.xlsx> --ano <ano>');
    console.error('     Opcional: --area SAUDE|EDUCACAO|... (força área para arquivos antigos)');
    process.exit(1);
  }

  console.log(`\n🔄 Import SP — arquivo=${FILE} ano=${ANO}${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  const { rows: raw, formato, titulo } = lerXlsx(FILE);
  console.log(`  Formato detectado: ${formato} ${titulo ? `("${titulo}")` : ''}`);
  console.log(`  ${raw.length} linhas lidas.`);
  if (raw.length > 0) console.log('  Colunas:', Object.keys(raw[0]).join(', '));

  const rows = raw
    .map((r) => formato === 'A' ? mapearFormatoA(r, ANO, titulo) : mapearFormatoB(r, ANO))
    .filter((r): r is EmendaEstadualRow => r !== null);

  console.log(`  ${rows.length} emendas mapeadas.`);

  // Validação dos campos principais
  const semMunicipio  = rows.filter(r => !r.municipioNome).length;
  const semValor      = rows.filter(r => !r.valorEmpenhado && !r.valorPago && !r.valorProposto).length;
  console.log(`\n  Validação:`);
  console.log(`    sem município : ${semMunicipio}`);
  console.log(`    sem valor     : ${semValor}`);
  console.log(`    com área      : ${rows.filter(r => r.area).length} / ${rows.length}`);
  if (rows[0]) {
    console.log(`\n  Exemplo:`);
    console.log(`    parlamentar : ${rows[0].autorNome}`);
    console.log(`    município   : ${rows[0].municipioNome}`);
    console.log(`    valor pago  : R$ ${rows[0].valorPago?.toLocaleString('pt-BR')}`);
    console.log(`    área        : ${rows[0].area}`);
  }

  if (rows.length === 0) {
    console.error('\nNenhuma emenda mapeada.');
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('\n[dry-run] nenhuma escrita realizada.');
    return;
  }

  const prisma = buildPrisma();
  try {
    const result = await importarEmendas(prisma, 'SP', rows);
    console.log(`\n✅ Import SP concluído:`);
    console.log(`   emendas inseridas/atualizadas    : ${result.inseridas}`);
    console.log(`   parlamentares criados/atualizados: ${result.parlamentares}`);
    console.log(`   erros                            : ${result.erros}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error('\n❌', e.message); process.exit(1); });
