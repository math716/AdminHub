-- Município de destino de cada documento de emenda.
--
-- Uma emenda federal costuma ser dividida entre vários municípios, e o
-- cadastro da emenda guarda um só: somar por ele punha o valor inteiro numa
-- cidade. O valor por cidade passa a sair dos documentos.
--
-- Rodar no SQL Editor do Supabase ANTES de publicar o código que lê estas
-- colunas. ADD COLUMN sem valor padrão é instantâneo; os índices são criados
-- sem travar a tabela (CONCURRENTLY — rodar cada comando separado, fora de
-- transação).

ALTER TABLE "emendas_documentos" ADD COLUMN IF NOT EXISTS "municipioDestino" TEXT;
ALTER TABLE "emendas_documentos" ADD COLUMN IF NOT EXISTS "codigoIbgeDestino" TEXT;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "emendas_documentos_codigoIbgeDestino_idx" ON "emendas_documentos"("codigoIbgeDestino");

-- A "impressão" do resumo de Emendas passa a olhar também os documentos:
-- deixa instantânea a pergunta "qual a última alteração nos documentos?".
CREATE INDEX CONCURRENTLY IF NOT EXISTS "emendas_documentos_updatedAt_idx" ON "emendas_documentos"("updatedAt");
