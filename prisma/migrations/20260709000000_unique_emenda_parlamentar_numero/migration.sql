-- Impede que a mesma emenda (mesmo parlamentar + ano + numero) seja importada
-- duas vezes com idPortal diferente — root cause das duplicatas visuais.
-- NULL em numero é tratado como distinto pelo PostgreSQL, então emendas sem
-- numero não violam este índice entre si.
CREATE UNIQUE INDEX "emendas_parlamentares_parlamentarId_ano_numero_key"
  ON "emendas_parlamentares"("parlamentarId", "ano", "numero");
