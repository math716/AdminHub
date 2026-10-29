-- Índices sem uso nas tabelas de emendas (~83 MB). Medido em 29/10/2026 em
-- pg_stat_user_indexes (contagem desde a criação do banco): 0 usos, exceto
-- fase (1). As importações gravam nessas colunas, mas nenhuma consulta busca
-- por elas — gravar sem os índices fica mais rápido. Recriáveis a qualquer
-- momento.
--
-- CONCURRENTLY não roda dentro de transação: um comando por vez.

DROP INDEX CONCURRENTLY IF EXISTS public."emendas_documentos_cnpjFavorecido_idx";
DROP INDEX CONCURRENTLY IF EXISTS public."emendas_documentos_codigoIbgeFavorecido_idx";
DROP INDEX CONCURRENTLY IF EXISTS public."emendas_documentos_fase_idx";
DROP INDEX CONCURRENTLY IF EXISTS public."emendas_parlamentares_codigoIbge_ano_idx";
-- Este não estava no schema.prisma (criado à mão).
DROP INDEX CONCURRENTLY IF EXISTS public."emendas_parlamentares_natureza_idx";
