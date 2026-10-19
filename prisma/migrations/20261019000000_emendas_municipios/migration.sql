-- Quanto cada emenda mandou para cada município: a soma pronta dos
-- documentos por município de destino. O resumo de Emendas, a tela de uma
-- cidade e a Gabi leem daqui em vez de somar os documentos a cada consulta
-- (20 s em SP 2025; estourava o tempo do banco no fim das importações).
--
-- Rodar no SQL Editor do Supabase ANTES de publicar o código que lê a
-- tabela. Tabela nova e vazia: criação instantânea.

CREATE TABLE IF NOT EXISTS "emendas_municipios" (
  "emendaId"     TEXT NOT NULL REFERENCES "emendas_parlamentares"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "codigoIbge"   TEXT NOT NULL,
  "municipio"    TEXT,
  "empenhado"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  "pago"         DOUBLE PRECISION NOT NULL DEFAULT 0,
  "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "emendas_municipios_pkey" PRIMARY KEY ("emendaId", "codigoIbge")
);

CREATE INDEX IF NOT EXISTS "emendas_municipios_codigoIbge_idx" ON "emendas_municipios"("codigoIbge");
