-- Adiciona campos de geolocalização e foto ao model Demand
ALTER TABLE "demands"
  ADD COLUMN IF NOT EXISTS "endereco" TEXT,
  ADD COLUMN IF NOT EXISTS "lat" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "lng" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "foto" TEXT;

-- Cria enum AgendaEventTipo
DO $$ BEGIN
  CREATE TYPE "AgendaEventTipo" AS ENUM ('REUNIAO', 'VISITA', 'EVENTO', 'COMPROMISSO');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Cria tabela agenda_events
CREATE TABLE IF NOT EXISTS "agenda_events" (
  "id"          TEXT NOT NULL,
  "titulo"      TEXT NOT NULL,
  "descricao"   TEXT,
  "data"        TIMESTAMP(3) NOT NULL,
  "dataFim"     TIMESTAMP(3),
  "local"       TEXT,
  "endereco"    TEXT,
  "lat"         DOUBLE PRECISION,
  "lng"         DOUBLE PRECISION,
  "tipo"        "AgendaEventTipo" NOT NULL DEFAULT 'REUNIAO',
  "cor"         TEXT,
  "gabineteId"  TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "agenda_events_pkey" PRIMARY KEY ("id")
);

-- Índices
CREATE INDEX IF NOT EXISTS "agenda_events_gabineteId_idx" ON "agenda_events"("gabineteId");
CREATE INDEX IF NOT EXISTS "agenda_events_data_idx" ON "agenda_events"("data");

-- Foreign keys
ALTER TABLE "agenda_events"
  ADD CONSTRAINT "agenda_events_gabineteId_fkey"
    FOREIGN KEY ("gabineteId") REFERENCES "gabinetes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "agenda_events_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
