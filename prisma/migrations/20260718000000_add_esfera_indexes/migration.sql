-- Índices compostos com esfera para acelerar queries de resumo filtradas
-- por esfera (FEDERAL/ESTADUAL). Sem esses índices o Postgres usava o
-- índice (uf, ano) e fazia post-filter em até 50k linhas.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "emendas_parlamentares_uf_ano_esfera_idx"
  ON "emendas_parlamentares"("uf", "ano", "esfera");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "emendas_parlamentares_codigoIbge_ano_esfera_idx"
  ON "emendas_parlamentares"("codigoIbge", "ano", "esfera");
