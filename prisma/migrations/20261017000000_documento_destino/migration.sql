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

-- Valor por município (resumo de Emendas, Gabi): a consulta junta as emendas
-- do estado/ano com os documentos que têm destino. Sem este índice o banco
-- lia os 1,8 milhão de documentos inteiros — 19,9 s só para SP 2025, medido
-- em 17/10/2026. Parcial (só documentos com destino) e com as colunas da
-- conta: vai direto aos documentos de cada emenda, sem abrir a tabela.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "emendas_documentos_destino_emenda_idx"
  ON "emendas_documentos" ("emendaId")
  INCLUDE ("codigoIbgeDestino", "municipioDestino", "fase", "valor")
  WHERE "codigoIbgeDestino" IS NOT NULL;

-- Estatísticas da coluna nova (o planejador achava que metade dos documentos
-- já tinha destino e escolhia ler a tabela inteira).
ANALYZE "emendas_documentos";
