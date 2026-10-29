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

import type { PrismaClient } from '@/lib/prisma-gerado/client';

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
      // O arquivo da CGU traz os empenhos, mas não as anulações: empenho
      // cancelado e refeito para outra entidade aparece duas vezes, e a soma
      // por cidade passava do total oficial da emenda (2% delas; em 2025,
      // R$ 299 mi a mais — caso real: emenda de R$ 7 mi com quatro empenhos de
      // R$ 3,43 mi). Quando os empenhos passam do total oficial, o que vai para
      // as cidades é o total oficial (descontada a parte sem cidade, como a
      // taxa do SERPRO), repartido pelo que foi PAGO a cada uma — o pagamento
      // é o destino real; ainda pouco pago, pela proporção dos empenhos.
      // Só de 2021 em diante: antes disso o total da emenda no banco não foi
      // conferido com o oficial.
      //
      // O PAGO tem outro defeito: repasse fundo a fundo (saúde) sai numa ordem
      // bancária só, em lote, favorecendo o Banco do Brasil ou a Caixa — o
      // arquivo põe o valor do LOTE inteiro em cada emenda e o destino na
      // cidade da agência (caso real: emenda de R$ 500 mil para Vassouras com
      // R$ 8 mi "pagos" em Duque de Caxias). Em 2021–2024, 1.400 a 1.800
      // emendas por ano. Nesses casos, e quando os pagamentos passam do total
      // oficial, o pago oficial é repartido pelas cidades na proporção do
      // empenho, cujo favorecido é o próprio fundo municipal.
      db.$executeRawUnsafe(`
        WITH docs AS (
          SELECT d."emendaId", d."codigoIbgeDestino" AS cod, max(d."municipioDestino") AS mun,
                 coalesce(sum(d.valor) FILTER (WHERE d.fase = 'Empenho'), 0) AS emp,
                 coalesce(sum(d.valor) FILTER (WHERE d.fase = 'Pagamento'), 0) AS pago
          FROM "emendas_documentos" d
          WHERE d."emendaId" = ANY($1::text[]) AND d."codigoIbgeDestino" IS NOT NULL
          GROUP BY 1, 2),
        todos AS (
          SELECT d."emendaId",
                 coalesce(sum(d.valor) FILTER (WHERE d.fase = 'Empenho'), 0) AS emp_todos,
                 coalesce(sum(d.valor) FILTER (WHERE d.fase = 'Pagamento'), 0) AS pago_todos,
                 coalesce(bool_or(d.fase = 'Pagamento' AND (d."nomeFavorecido" ILIKE 'BANCO DO BRASIL%'
                                                         OR d."nomeFavorecido" ILIKE 'CAIXA ECON%')), false) AS pago_em_lote
          FROM "emendas_documentos" d WHERE d."emendaId" = ANY($1::text[]) GROUP BY 1),
        destino AS (
          SELECT "emendaId", sum(emp) AS emp_dest, sum(pago) AS pago_dest FROM docs GROUP BY 1),
        alvo AS (
          SELECT x."emendaId", x.emp_dest, x.pago_dest, t.emp_todos, e."valorPago" AS pago_oficial,
                 CASE WHEN e.ano >= 2021 AND e."valorEmpenhado" > 0 AND x.emp_dest > 0
                       AND t.emp_todos > e."valorEmpenhado" * 1.01 + 1
                      THEN e."valorEmpenhado" * x.emp_dest / t.emp_todos END AS emp_corrigido,
                 -- Pagamento que não dá para atribuir à cidade pelo documento.
                 (e.ano >= 2021 AND x.emp_dest > 0
                   AND (t.pago_em_lote OR t.pago_todos > e."valorPago" * 1.01 + 1)) AS pago_pelo_empenho
          FROM destino x
          JOIN todos t USING ("emendaId")
          JOIN "emendas_parlamentares" e ON e.id = x."emendaId"),
        corrigido AS (
          SELECT docs."emendaId", docs.cod, docs.mun, docs.emp, docs.pago, a.emp_dest, a.pago_dest,
                 a.emp_todos, a.pago_oficial, a.pago_pelo_empenho,
                 CASE WHEN a.emp_corrigido IS NULL THEN docs.emp
                      WHEN NOT a.pago_pelo_empenho AND a.pago_dest >= 0.5 * a.emp_corrigido
                        THEN a.emp_corrigido * docs.pago / a.pago_dest
                      ELSE a.emp_corrigido * docs.emp / a.emp_dest END AS emp_cidade
          FROM docs JOIN alvo a USING ("emendaId")),
        final AS (
          SELECT c."emendaId", c.cod, c.mun, c.emp_cidade AS empenhado,
                 CASE WHEN NOT c.pago_pelo_empenho THEN c.pago
                      ELSE coalesce(c.pago_oficial * c.emp / nullif(c.emp_todos, 0), 0) END AS pago
          FROM corrigido c)
        INSERT INTO "emendas_municipios" ("emendaId", "codigoIbge", "municipio", "empenhado", "pago", "atualizadoEm")
        -- Cidade que só aparecia pelo pagamento em lote (a da agência) fica de fora.
        SELECT "emendaId", cod, mun, empenhado, pago, now() FROM final
        WHERE empenhado > 0 OR pago > 0`, lote),
    ]);
    linhas += inseridas;
    if ((i / POR_ENVIO) % 10 === 9) log(`   valor por município: ${Math.min(i + POR_ENVIO, emendaIds.length)}/${emendaIds.length} emendas`);
  }
  return linhas;
}

/**
 * Refaz a soma por município de TODAS as emendas federais dos anos — quando a
 * regra da soma muda (a importação só refaz as emendas do arquivo que leu).
 */
export async function refazerEmendasMunicipios(
  db: PrismaClient,
  anos: number[],
  log: (msg: string) => void = console.log,
): Promise<void> {
  for (const sql of SQL_CRIAR_EMENDAS_MUNICIPIOS) await db.$executeRawUnsafe(sql);
  for (const ano of anos) {
    const ids = await emendasFederaisDoAno(db, ano);
    log(`   ${ano}: refazendo o valor por município de ${ids.length} emendas`);
    const linhas = await preencherEmendasMunicipios(db, ids, log);
    log(`   ${ano}: ${linhas} pares emenda × município gravados`);
  }
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

  // Emendas que mudaram DEPOIS da soma por município. O caso que importa: a
  // importação soma as cidades no fim do arquivo, mas o total oficial de uma
  // emenda nova só é gravado na etapa seguinte (totais do Portal) — e a soma
  // usa esse total para descontar empenhos anulados. Sem refazer aqui, a
  // emenda nova ficava com a divisão calculada sobre o valor errado.
  const desatualizadas = await db.$queryRawUnsafe<{ id: string }[]>(`
    SELECT e.id FROM "emendas_parlamentares" e
    WHERE e.ano = ANY($1::int[]) AND e.esfera::text = 'FEDERAL'
      AND EXISTS (SELECT 1 FROM "emendas_municipios" m
                  WHERE m."emendaId" = e.id AND m."atualizadoEm" < e."updatedAt")`, anos);
  if (desatualizadas.length > 0) {
    log(`   ${desatualizadas.length} emendas mudaram depois da soma por município — refazendo`);
    await preencherEmendasMunicipios(db, desatualizadas.map(d => d.id), log);
  }
}
