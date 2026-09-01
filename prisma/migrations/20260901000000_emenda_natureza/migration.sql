-- Natureza da despesa da emenda: em QUE o dinheiro pode ser gasto.
--
-- O SISCONEP (DF) manda o codigo da natureza — "449051", "335041". O primeiro
-- digito ja virava "Custeio"/"Investimento" na coluna `tipo`; o que se perdia
-- era o resto, que diz o que foi comprado: obra, equipamento, servico de
-- terceiros, contribuicao a entidade.
--
-- Uma coluna opcional. Nada e reescrito, nada e apagado: emendas ja
-- importadas continuam como estao ate a proxima execucao do import, e as de
-- outros estados, que nao tem esse dado, seguem com a coluna vazia.

ALTER TABLE "emendas_parlamentares"
  ADD COLUMN IF NOT EXISTS "natureza" TEXT;

-- A busca por texto na tela de Emendas passa por aqui.
CREATE INDEX IF NOT EXISTS "emendas_parlamentares_natureza_idx"
  ON "emendas_parlamentares" ("natureza");
