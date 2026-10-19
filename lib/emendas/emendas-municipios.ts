/**
 * Valor de cada emenda em cada município (tabela emendas_municipios).
 *
 * Uma emenda federal costuma ser DIVIDIDA entre vários municípios (metade das
 * de 2025), e cada documento de empenho/pagamento diz para qual foi aquele
 * pedaço (municipioDestino). Somar os documentos a cada consulta lia centenas
 * de milhares de linhas por estado — 20 s em SP 2025 — e estourava o tempo do
 * banco no fim das importações. A soma passa a ser feita uma vez, aqui, e o
 * resumo de Emendas, a tela de uma cidade e a Gabi leem o resultado pronto.
 *
 * Quem chama:
 *   - scripts/import-portal-csv.mts, no fim de cada importação federal, para
 *     as emendas do arquivo;
 *   - scripts/atualizar-resumo-emendas.ts, antes da conta, para o ano que tem
 *     destino nos documentos mas ainda não tem a soma pronta (primeira vez).
 *
 * Recebe o PrismaClient por parâmetro (rota, script e import usam clientes
 * diferentes) — por isso não importa '@/lib/db'.
 */

import type { PrismaClient } from '@prisma/client';

/** Mesma criação da migration 20261019000000 (para o script não depender dela). */
export const SQL_CRIAR_EMENDAS_MUNICIPIOS = [
  `CREATE TABLE IF NOT EXISTS "emendas_municipios" (
    "emendaId"     TEXT NOT NULL REFERENCES "emendas_parlamentares"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "codigoIbge"   TEXT NOT NULL,
    "municipio"    TEXT,
    "empenhado"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pago"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "emendas_municipios_pkey" PRIMARY KEY ("emendaId", "codigoIbge")
  )`,
  `CREATE INDEX IF NOT EXISTS "emendas_municipios_codigoIbge_idx" ON "emendas_municipios"("codigoIbge")`,
];

/**
 * Emendas por envio. Cada envio lê só os documentos dessas emendas, pelo
 * índice de emendaId — nunca a tabela de documentos inteira.
 */
const POR_ENVIO = 300;

/**
 * Refaz a soma por município das emendas indicadas. Apaga e regrava numa
 * transação só: quem lê no meio vê a soma velha ou a nova, nunca a metade.
 * Emenda sem destino nos documentos (estadual, ou federal ainda não
 * reimportada) fica sem linha — quem lê usa o município do cadastro.
 */
export async function preencherEmendasMunicipios(
  db: PrismaClient,
  emendaIds: string[],
  log: (msg: string) => void = () => {},
): Promise<number> {
  let linhas = 0;
  for (let i = 0; i < emendaIds.length; i += POR_ENVIO) {
    const lote = emendaIds.slice(i, i + POR_ENVIO);
    const [, inseridas] = await db.$transaction([
      db.$executeRawUnsafe(`DELETE FROM "emendas_municipios" WHERE "emendaId" = ANY($1::text[])`, lote),
      db.$executeRawUnsafe(`
        INSERT INTO "emendas_municipios" ("emendaId", "codigoIbge", "municipio", "empenhado", "pago", "atualizadoEm")
        SELECT d."emendaId", d."codigoIbgeDestino", max(d."municipioDestino"),
               coalesce(sum(d.valor) FILTER (WHERE d.fase = 'Empenho'), 0),
               coalesce(sum(d.valor) FILTER (WHERE d.fase = 'Pagamento'), 0),
               now()
        FROM "emendas_documentos" d
        WHERE d."emendaId" = ANY($1::text[]) AND d."codigoIbgeDestino" IS NOT NULL
        GROUP BY 1, 2`, lote),
    ]);
    linhas += inseridas;
    if ((i / POR_ENVIO) % 10 === 9) log(`   valor por município: ${Math.min(i + POR_ENVIO, emendaIds.length)}/${emendaIds.length} emendas`);
  }
  return linhas;
}

/** Todas as emendas federais de um ano (as que têm documentos). */
export async function emendasFederaisDoAno(db: PrismaClient, ano: number): Promise<string[]> {
  const r = await db.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM "emendas_parlamentares" WHERE ano = $1 AND esfera::text = 'FEDERAL' ORDER BY id`, ano);
  return r.map(x => x.id);
}

/**
 * Para cada ano: se há emendas com destino nos documentos e a soma pronta
 * não cobre todas, refaz o ano. Normalmente nada a fazer — a importação já
 * preenche; isto cobre a primeira vez e uma importação que caiu no meio.
 *
 * As duas contagens usam índices (o parcial de destino por emendaId, da
 * migration 20261017000000, e a chave da tabela): não leem documentos.
 */
export async function garantirEmendasMunicipios(
  db: PrismaClient,
  anos: number[],
  log: (msg: string) => void = console.log,
): Promise<void> {
  for (const sql of SQL_CRIAR_EMENDAS_MUNICIPIOS) await db.$executeRawUnsafe(sql);
  for (const ano of anos) {
    const [c] = await db.$queryRawUnsafe<{ com_destino: number; prontas: number }[]>(`
      SELECT
        (SELECT count(*) FROM "emendas_parlamentares" e
          WHERE e.ano = $1 AND e.esfera::text = 'FEDERAL'
            AND EXISTS (SELECT 1 FROM "emendas_documentos" d
                        WHERE d."emendaId" = e.id AND d."codigoIbgeDestino" IS NOT NULL))::int AS com_destino,
        (SELECT count(DISTINCT m."emendaId") FROM "emendas_municipios" m
          JOIN "emendas_parlamentares" e ON e.id = m."emendaId" WHERE e.ano = $1)::int AS prontas`, ano);
    if (!c || c.com_destino === 0 || c.com_destino === c.prontas) continue;
    log(`   ${ano}: ${c.com_destino} emendas com destino, ${c.prontas} com o valor por município pronto — refazendo o ano`);
    const ids = await emendasFederaisDoAno(db, ano);
    const linhas = await preencherEmendasMunicipios(db, ids, log);
    log(`   ${ano}: ${linhas} pares emenda × município gravados`);
  }
}
