-- Resumo pronto da tela de Emendas.
--
-- A tela somava milhares de emendas a cada abertura (2 a 6 s nos estados
-- grandes). O resumo passa a ser calculado no fim de cada importação e a tela
-- lê o resultado pronto. A mesma criação roda no script
-- scripts/atualizar-resumo-emendas.ts (IF NOT EXISTS), então não precisa
-- rodar este arquivo à mão.

CREATE TABLE IF NOT EXISTS "emendas_resumos" (
  "chave"               TEXT PRIMARY KEY,
  "dados"               JSONB NOT NULL,
  "qtdEmendas"          INTEGER NOT NULL,
  "versaoEmendas"       TIMESTAMP(3),
  "versaoParlamentares" TIMESTAMP(3),
  "calculadoEm"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Deixa instantânea a pergunta "qual a última alteração nas emendas?".
CREATE INDEX IF NOT EXISTS "emendas_parlamentares_updatedAt_idx" ON "emendas_parlamentares"("updatedAt");
