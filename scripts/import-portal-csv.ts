/**
 * Importa CSVs "EmendasParlamentaresPorDocumento" baixados manualmente
 * do Portal da Transparência (a API REST `/api-de-dados/emendas` tem
 * lag de ~1-2 anos; o download CSV via interface web é atualizado quase
 * em tempo real).
 *
 * O dataset é GRANULAR (1 linha por documento de despesa — empenho/
 * liquidação/pagamento), então cada linha:
 *   - Upserta o `Parlamentar` autor (cache em memória)
 *   - Upserta a `EmendaParlamentar` (campos consolidados da emenda)
 *   - Upserta a `EmendaDocumento` (campos específicos do documento)
 *
 * O CSV vem ISO-8859-1, separador `;`, quoted com `"`, e está dentro de
 * um ZIP. Lemos via stream pra não carregar 400MB em memória.
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/import-portal-csv.ts \
 *     --file data/portal-csv-imports/2025_EmendasParlamentaresPorDocumento.zip \
 *     [--batch 500] [--limit 0]
 *
 * Flags:
 *   --file  caminho do ZIP a importar (obrigatório)
 *   --batch tamanho do batch de upserts paralelos (default 500)
 *   --limit pra teste: para após N linhas (default 0 = todas)
 *
 * Tempo estimado: 30-60min por arquivo (387k linhas em 2025).
 */

import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import * as unzipper from 'unzipper';
import { parse } from 'csv-parse';
import { PrismaClient } from '@prisma/client';
import type { EmendaArea, ParlamentarCargo } from '@prisma/client';

// Para imports em lote usa sempre o Transaction Pooler (porta 6543) com
// pgbouncer=true — multiplexia muitas conexões sobre poucas conexões reais,
// evitando "Can't reach database server" por esgotamento do Session Pooler.
// DIRECT_URL (Session Pooler / porta 5432) é adequada só para migrations.
const dbUrl = (() => {
  const raw = process.env.DATABASE_URL ?? '';
  return raw + (raw.includes('?') ? '&' : '?') + 'pgbouncer=true';
})();
let prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

// ─────────────────────────────────────────────────────────────────────────
// Retry com reconexão automática
// ─────────────────────────────────────────────────────────────────────────
const isConnError = (e: any) =>
  typeof e?.message === 'string' && (
    e.message.includes('Server has closed the connection') ||
    e.message.includes('Connection pool timeout') ||
    e.message.includes("Can't reach database server") ||
    e.message.includes('ECONNRESET') ||
    e.message.includes('ETIMEDOUT')
  );

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      if (isConnError(e) && attempt < retries - 1) {
        const waitMs = 3000 * (attempt + 1);
        process.stdout.write(
          `\n   [reconexão #${attempt + 1}] ${e.message.slice(0, 70)} — aguardando ${waitMs / 1000}s...\n`,
        );
        await new Promise((r) => setTimeout(r, waitMs));
        await prisma.$disconnect().catch(() => {});
        prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
        continue;
      }
      throw e;
    }
  }
  throw new Error('unreachable');
}

// ─────────────────────────────────────────────────────────────────────────
// CLI args
// ─────────────────────────────────────────────────────────────────────────
function arg(name: string, def?: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return def;
}

const FILE        = arg('file');
const BATCH       = parseInt(arg('batch', '500')!, 10);
const LIMIT       = parseInt(arg('limit', '0')!, 10);
const SKIP        = parseInt(arg('skip', '0')!, 10);   // pula as primeiras N linhas
const RETRY_FILE  = arg('retry-file');                  // reimporta só os códigos do arquivo

if (!FILE) {
  console.error('❌ --file é obrigatório');
  process.exit(1);
}

// Carrega códigos de emenda do retry-file (um código por linha)
const retryCodigos = RETRY_FILE
  ? new Set(
      readFileSync(RETRY_FILE, 'utf-8')
        .split('\n').map((l) => l.trim()).filter(Boolean),
    )
  : null;

// ─────────────────────────────────────────────────────────────────────────
// Mapeamento de colunas (cabeçalho do CSV em português)
// ─────────────────────────────────────────────────────────────────────────
const COL = {
  codigoEmenda:       'Código da Emenda',
  anoEmenda:          'Ano da Emenda',
  nomeAutor:          'Nome do Autor da Emenda',
  numeroEmenda:       'Número da emenda',
  valorEmpenhado:     'Valor Empenhado',
  valorPago:          'Valor Pago',
  tipoEmenda:         'Tipo de Emenda',
  dataDocumento:      'Data Documento',
  codigoDocumento:    'Código Documento',
  localidadeAplicacao:'Localidade de aplicação do recurso',
  ufAplicacao:        'UF de aplicação do recurso',
  municipioAplicacao: 'Município de aplicação do recurso',
  ibgeAplicacao:      'Código IBGE do município de aplicação do recurso',
  fase:               'Fase da despesa',
  codigoFavorecido:   'Código favorecido',
  nomeFavorecido:     'Favorecido',
  tipoFavorecido:     'Tipo Favorecido',
  ufFavorecido:       'UF Favorecido',
  municipioFavorecido:'Município Favorecido',
  orgao:              'Órgão',
  orgaoSuperior:      'Órgão Superior',
  funcao:             'Função',
  subfuncao:          'SubFunção',
  programa:           'Programa',
  acao:               'Ação',
  subtitulo:          'Subtítulo (Localizador)',
} as const;

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────
function parseValorBR(v: string | undefined): number {
  if (!v || v === 'Sem informação') return 0;
  const norm = v.replace(/\./g, '').replace(',', '.');
  const n = Number(norm);
  return Number.isFinite(n) ? n : 0;
}

function parseDataBR(v: string | undefined): Date | null {
  if (!v) return null;
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeCnpj(v: string | undefined): string | null {
  if (!v) return null;
  const d = v.replace(/\D/g, '');
  return d.length === 14 ? d : (d.length === 11 ? d : null);
}

function naIfEmpty(v: string | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  if (!t || t === 'Sem informação' || t === '-1') return null;
  return t;
}

function classificarArea(funcaoNome?: string | null): EmendaArea {
  const nome = (funcaoNome ?? '').toLowerCase();
  if (nome.includes('saúde') || nome.includes('saude')) return 'SAUDE';
  if (nome.includes('educa'))       return 'EDUCACAO';
  if (nome.includes('segura') || nome.includes('defesa')) return 'SEGURANCA';
  if (nome.includes('urban') || nome.includes('infraestrutura')) return 'INFRAESTRUTURA';
  if (nome.includes('saneamento'))  return 'SANEAMENTO';
  if (nome.includes('assistência') || nome.includes('assistencia')) return 'ASSISTENCIA_SOCIAL';
  if (nome.includes('previdência') || nome.includes('previdencia')) return 'ASSISTENCIA_SOCIAL';
  if (nome.includes('trabalho'))    return 'ASSISTENCIA_SOCIAL';
  if (nome.includes('cidadania'))   return 'ASSISTENCIA_SOCIAL';
  if (nome.includes('organização agrária') || nome.includes('organizacao agraria')) return 'AGRICULTURA';
  if (nome.includes('agricultura')) return 'AGRICULTURA';
  if (nome.includes('gestão ambiental') || nome.includes('gestao ambiental')) return 'MEIO_AMBIENTE';
  if (nome.includes('ambiente'))    return 'MEIO_AMBIENTE';
  if (nome.includes('cultura'))     return 'CULTURA';
  if (nome.includes('esporte') || nome.includes('desporto') || nome.includes('lazer')) return 'ESPORTE';
  if (nome.includes('transporte'))  return 'TRANSPORTE';
  if (nome.includes('habita'))      return 'HABITACAO';
  if (nome.includes('comunicaç') || nome.includes('comunicac')) return 'INFRAESTRUTURA';
  if (nome.includes('energia'))     return 'INFRAESTRUTURA';
  if (nome.includes('indústria') || nome.includes('industria')) return 'INFRAESTRUTURA';
  return 'OUTROS';
}

function inferCargo(tipoEmenda: string | undefined): ParlamentarCargo {
  const s = (tipoEmenda ?? '').toUpperCase();
  if (s.includes('SENADOR')) return 'SENADOR';
  if (s.includes('BANCADA')) return 'DEPUTADO_FEDERAL';
  if (s.includes('COMISSÃO') || s.includes('COMISSAO')) return 'DEPUTADO_FEDERAL';
  if (s.includes('ESTADUAL')) return 'DEPUTADO_ESTADUAL';
  return 'DEPUTADO_FEDERAL'; // emendas individuais federais por default
}

function normalizeFase(v: string | undefined): string {
  const s = (v ?? '').trim();
  if (s.includes('Empenho')) return 'Empenho';
  if (s.includes('Liquida')) return 'Liquidação';
  if (s.includes('Pagamento')) return 'Pagamento';
  return s || 'Empenho';
}

// ─────────────────────────────────────────────────────────────────────────
// Caches em memória (pra evitar SELECT por linha)
// ─────────────────────────────────────────────────────────────────────────
const parlamentarPorNome = new Map<string, string>();            // nomeNorm → id (resolvido)
const parlamentarInflight = new Map<string, Promise<string>>(); // nomeNorm → promise em voo
const emendaPorCodigo = new Map<string, string>();               // codigoEmenda → id (resolvido)
const emendaInflight = new Map<string, Promise<string>>();       // codigoEmenda → promise em voo

// Deduplication de chamadas paralelas: se dois rows do mesmo batch tentarem
// upsert do mesmo parlamentar/emenda ao mesmo tempo, compartilham a mesma
// promise em vez de abrirem dois INSERTs simultâneos (que causariam unique
// constraint violation no BD).
async function obterParlamentarId(nome: string, cargo: ParlamentarCargo, uf: string | null): Promise<string> {
  const nomeNorm = nome.trim().toUpperCase();
  if (parlamentarPorNome.has(nomeNorm)) return parlamentarPorNome.get(nomeNorm)!;
  if (parlamentarInflight.has(nomeNorm)) return parlamentarInflight.get(nomeNorm)!;

  const promise = (async () => {
    try {
      const idPortal = `PORTAL:${nomeNorm}`;
      const p = await withRetry(() => prisma.parlamentar.upsert({
        where: { idPortal },
        create: { idPortal, nome: nomeNorm, cargo, uf },
        update: {},
        select: { id: true },
      }));
      parlamentarPorNome.set(nomeNorm, p.id);
      return p.id;
    } finally {
      // Sempre limpa o inflight — inclusive em caso de erro,
      // para não deixar promise rejeitada presa no cache.
      parlamentarInflight.delete(nomeNorm);
    }
  })();

  parlamentarInflight.set(nomeNorm, promise);
  return promise;
}

async function obterEmendaId(opts: {
  codigoEmenda: string;
  ano: number;
  numero: string | null;
  tipo: string | null;
  funcao: string | null;
  uf: string | null;
  codigoIbge: string | null;
  municipioNome: string | null;
  valorEmpenhado: number;
  valorPago: number;
  parlamentarId: string;
  objeto: string | null;
}): Promise<string> {
  if (emendaPorCodigo.has(opts.codigoEmenda)) return emendaPorCodigo.get(opts.codigoEmenda)!;
  if (emendaInflight.has(opts.codigoEmenda)) return emendaInflight.get(opts.codigoEmenda)!;

  const promise = (async () => {
    const e = await withRetry(() => prisma.emendaParlamentar.upsert({
      where: { idPortal: opts.codigoEmenda },
      create: {
        idPortal:       opts.codigoEmenda,
        ano:            opts.ano,
        numero:         opts.numero,
        tipo:           opts.tipo,
        funcao:         opts.funcao,
        area:           classificarArea(opts.funcao),
        objeto:         opts.objeto,
        valorEmpenhado: opts.valorEmpenhado,
        valorPago:      opts.valorPago,
        valorRestoPago: 0,
        uf:             opts.uf,
        codigoIbge:     opts.codigoIbge,
        municipioNome:  opts.municipioNome,
        parlamentarId:  opts.parlamentarId,
      },
      update: {
        numero:        opts.numero        ?? undefined,
        tipo:          opts.tipo          ?? undefined,
        funcao:        opts.funcao        ?? undefined,
        area:          opts.funcao ? classificarArea(opts.funcao) : undefined,
        uf:            opts.uf            ?? undefined,
        codigoIbge:    opts.codigoIbge    ?? undefined,
        municipioNome: opts.municipioNome ?? undefined,
      },
      select: { id: true },
    }));
    emendaPorCodigo.set(opts.codigoEmenda, e.id);
    emendaInflight.delete(opts.codigoEmenda);
    return e.id;
  })();

  emendaInflight.set(opts.codigoEmenda, promise);
  return promise;
}

async function upsertDocumento(emendaId: string, row: Record<string, string>): Promise<void> {
  const codigoDocumento = naIfEmpty(row[COL.codigoDocumento]);
  if (!codigoDocumento) return;

  // Município "do recurso" tem prioridade sobre "do favorecido" pra exibição
  const munFav    = naIfEmpty(row[COL.municipioFavorecido]);
  const ufFav     = naIfEmpty(row[COL.ufFavorecido]);

  await withRetry(() => prisma.emendaDocumento.upsert({
    where: { codigoDocumento },
    create: {
      codigoDocumento,
      codigoDocumentoResumido: codigoDocumento.slice(-12), // OB000135 etc — heurística simples
      emendaId,
      fase:                normalizeFase(row[COL.fase]),
      data:                parseDataBR(row[COL.dataDocumento]),
      valor:               parseValorBR(row[COL.valorPago]) || parseValorBR(row[COL.valorEmpenhado]),
      cnpjFavorecido:      normalizeCnpj(row[COL.codigoFavorecido]),
      nomeFavorecido:      naIfEmpty(row[COL.nomeFavorecido]),
      ufFavorecido:        ufFav,
      municipioFavorecido: munFav,
      codigoIbgeFavorecido: null, // CSV não dá IBGE do favorecido, só do "local de aplicação"
      subTitulo:           naIfEmpty(row[COL.subtitulo]),
      localizadorGasto:    naIfEmpty(row[COL.subtitulo]), // mesmo campo no CSV
      observacao:          null, // CSV não traz observação (só o detalhe individual /despesas/documentos/{cod})
      programa:            naIfEmpty(row[COL.programa]),
      acao:                naIfEmpty(row[COL.acao]),
      orgao:               naIfEmpty(row[COL.orgao]),
      orgaoSuperior:       naIfEmpty(row[COL.orgaoSuperior]),
    },
    update: {
      fase:                normalizeFase(row[COL.fase]),
      valor:               parseValorBR(row[COL.valorPago]) || parseValorBR(row[COL.valorEmpenhado]),
      cnpjFavorecido:      normalizeCnpj(row[COL.codigoFavorecido]) ?? undefined,
      nomeFavorecido:      naIfEmpty(row[COL.nomeFavorecido])       ?? undefined,
      ufFavorecido:        ufFav                                    ?? undefined,
      municipioFavorecido: munFav                                   ?? undefined,
      subTitulo:           naIfEmpty(row[COL.subtitulo])            ?? undefined,
      localizadorGasto:    naIfEmpty(row[COL.subtitulo])            ?? undefined,
      programa:            naIfEmpty(row[COL.programa])             ?? undefined,
      acao:                naIfEmpty(row[COL.acao])                 ?? undefined,
      orgao:               naIfEmpty(row[COL.orgao])                ?? undefined,
      orgaoSuperior:       naIfEmpty(row[COL.orgaoSuperior])        ?? undefined,
    },
  }));
}

// ─────────────────────────────────────────────────────────────────────────
// Stream loop principal
// ─────────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n📥 Importando ${FILE}\n   batch=${BATCH}, limit=${LIMIT || 'sem limite'}\n`);
  const inicio = Date.now();

  // CSV parser com decoder ISO-8859-1
  const parser = parse({
    delimiter: ';',
    quote: '"',
    columns: true,             // primeira linha como headers
    skip_empty_lines: true,
    relax_quotes: true,
    encoding: 'latin1' as any, // ISO-8859-1
  });

  // unzipper.ParseOne() extrai a 1ª entrada do ZIP como stream, sem disco
  const zipStream = createReadStream(FILE!);
  zipStream.on('error', (err) => {
    console.error('❌ Erro ao ler ZIP:', err.message);
    process.exit(1);
  });
  zipStream.pipe(unzipper.ParseOne()).pipe(parser);

  let total = 0;
  let docsOk = 0;
  let pulados = 0;
  let erros = 0;
  let buffer: Record<string, string>[] = [];
  const codigosComErro = new Set<string>(); // acumula para salvar no final

  const flushBatch = async (batch: Record<string, string>[]) => {
    const results = await Promise.allSettled(
      batch.map(async (row): Promise<'ok' | 'skip'> => {
        const codigoEmenda = naIfEmpty(row[COL.codigoEmenda]);
        // Linhas sem código (rodapés, totalizadores, linhas em branco do CSV)
        if (!codigoEmenda) return 'skip';
        // --retry-file: processa só os códigos que falharam antes
        if (retryCodigos && !retryCodigos.has(codigoEmenda)) return 'skip';

        const nomeAutor = naIfEmpty(row[COL.nomeAutor]) ?? '—';
        const tipoEmenda = naIfEmpty(row[COL.tipoEmenda]);
        const cargo = inferCargo(tipoEmenda ?? undefined);
        const ufFav = naIfEmpty(row[COL.ufFavorecido]);
        const ufAplic = naIfEmpty(row[COL.ufAplicacao]);
        const ufRef = ufAplic ?? ufFav;

        const parlamentarId = await obterParlamentarId(nomeAutor, cargo, ufRef);
        const emendaId = await obterEmendaId({
          codigoEmenda,
          ano:           parseInt(row[COL.anoEmenda] ?? '0', 10),
          numero:        naIfEmpty(row[COL.numeroEmenda]),
          tipo:          tipoEmenda,
          funcao:        naIfEmpty(row[COL.funcao]),
          uf:            ufRef,
          codigoIbge:    naIfEmpty(row[COL.ibgeAplicacao]),
          municipioNome: naIfEmpty(row[COL.municipioAplicacao]),
          valorEmpenhado: parseValorBR(row[COL.valorEmpenhado]),
          valorPago:      parseValorBR(row[COL.valorPago]),
          parlamentarId,
          objeto:        naIfEmpty(row[COL.localidadeAplicacao]),
        });

        await upsertDocumento(emendaId, row);
        return 'ok';
      }),
    );

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'rejected') {
        erros++;
        const codigo = naIfEmpty(batch[i][COL.codigoEmenda]);
        if (codigo) codigosComErro.add(codigo);
        if (erros <= 10) {
          console.error(`\n   [erro #${erros}] ${(r.reason as any)?.message ?? r.reason}`);
        }
      } else if (r.value === 'skip') {
        pulados++;
      } else {
        docsOk++;
      }
    }
  };

  let linhaBruta = 0; // contador antes do SKIP, para exibição correta
  for await (const row of parser) {
    linhaBruta++;
    if (SKIP && linhaBruta <= SKIP) continue; // pula as primeiras N linhas
    if (LIMIT && total >= LIMIT) break;
    buffer.push(row as Record<string, string>);
    total++;

    if (buffer.length >= BATCH) {
      await flushBatch(buffer);
      buffer = [];

      const elapsedMin = ((Date.now() - inicio) / 60_000).toFixed(1);
      const rate = (total / Math.max(1, (Date.now() - inicio) / 1000)).toFixed(0);
      process.stdout.write(
        `\r   ${total} lidas | ${docsOk} ok | ${pulados} puladas | ${erros} erros | ${rate} l/s | ${elapsedMin}min     `,
      );
    }
  }

  if (buffer.length > 0) await flushBatch(buffer);

  const totalMin = ((Date.now() - inicio) / 60_000).toFixed(1);
  console.log(`\n\n✅ Import concluído!`);
  if (SKIP) console.log(`   (puladas as primeiras ${SKIP} linhas via --skip)`);
  if (retryCodigos) console.log(`   (modo retry: ${retryCodigos.size} códigos no arquivo)`);
  console.log(`   ${total} linhas lidas`);
  console.log(`   ${docsOk} documentos processados`);
  console.log(`   ${pulados} linhas puladas (sem código de emenda — rodapés do CSV)`);
  console.log(`   ${erros} erros reais`);
  console.log(`   ${parlamentarPorNome.size} parlamentares no cache`);
  console.log(`   ${emendaPorCodigo.size} emendas no cache`);
  console.log(`   ${totalMin}min de execução`);

  // Salva códigos com erro para retry futuro
  if (codigosComErro.size > 0) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const errFile = `import-errors-${ts}.txt`;
    writeFileSync(errFile, [...codigosComErro].join('\n'));
    console.log(`\n   ⚠️  ${codigosComErro.size} códigos com erro salvos em: ${errFile}`);
    console.log(`   Para reimportar só esses:`);
    console.log(`   npx tsx --require dotenv/config scripts/import-portal-csv.ts --file <zip> --retry-file ${errFile}`);
  }
}

main()
  .catch((e) => {
    console.error('\n❌ Erro fatal:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
