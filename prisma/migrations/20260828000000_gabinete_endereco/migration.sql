-- Sede do gabinete: ponto de partida das rotas do dia no Mapa do Gabinete.
--
-- Sem isto, a rota comecava no primeiro compromisso e ignorava o trajeto de
-- saida, que costuma ser o mais longo do dia.
--
-- Tres colunas opcionais. Nada e reescrito, nada e apagado: gabinetes ja
-- existentes continuam funcionando exatamente como hoje, apenas sem ponto de
-- partida ate alguem preencher em Configuracoes.

ALTER TABLE "gabinetes"
  ADD COLUMN IF NOT EXISTS "endereco" TEXT,
  ADD COLUMN IF NOT EXISTS "lat"      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "lng"      DOUBLE PRECISION;
