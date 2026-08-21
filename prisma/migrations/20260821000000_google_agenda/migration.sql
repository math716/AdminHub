-- Integração com o Google Agenda (uma conexão por gabinete).

-- Origem do evento: o que veio do Google é sobrescrito a cada sincronização.
DO $$ BEGIN
  CREATE TYPE "AgendaOrigem" AS ENUM ('MANUAL', 'GOOGLE');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "agenda_events"
  ADD COLUMN IF NOT EXISTS "origem"         "AgendaOrigem" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS "googleEventId"  TEXT,
  ADD COLUMN IF NOT EXISTS "sincronizadoEm" TIMESTAMP(3);

-- Casa o evento local com o do Google. Único por gabinete: o mesmo ID pode
-- existir em gabinetes diferentes sem conflito.
CREATE UNIQUE INDEX IF NOT EXISTS "agenda_events_gabineteId_googleEventId_key"
  ON "agenda_events" ("gabineteId", "googleEventId");

CREATE TABLE IF NOT EXISTS "google_agenda_conexoes" (
  "id"                TEXT NOT NULL,
  "gabineteId"        TEXT NOT NULL,
  "email"             TEXT NOT NULL,
  "refreshToken"      TEXT NOT NULL,
  "accessToken"       TEXT,
  "expiraEm"          TIMESTAMP(3),
  "escopo"            TEXT,
  "calendarId"        TEXT NOT NULL DEFAULT 'primary',
  "syncToken"         TEXT,
  "ultimaSync"        TIMESTAMP(3),
  "ultimoErro"        TEXT,
  "eventosImportados" INTEGER NOT NULL DEFAULT 0,
  "conectadoPorId"    TEXT,
  "conectadoPorNome"  TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "google_agenda_conexoes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "google_agenda_conexoes_gabineteId_key"
  ON "google_agenda_conexoes" ("gabineteId");

DO $$ BEGIN
  ALTER TABLE "google_agenda_conexoes"
    ADD CONSTRAINT "google_agenda_conexoes_gabineteId_fkey"
    FOREIGN KEY ("gabineteId") REFERENCES "gabinetes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
