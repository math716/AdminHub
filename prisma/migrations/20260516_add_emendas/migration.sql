-- Enums para emendas parlamentares
DO $$ BEGIN
  CREATE TYPE "EmendaTipo" AS ENUM ('INDIVIDUAL', 'BANCADA', 'COMISSAO', 'RELATOR');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "EmendaStatus" AS ENUM ('PROPOSTA', 'EMPENHADA', 'PAGA', 'CANCELADA');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Tabela emendas
CREATE TABLE IF NOT EXISTS "emendas" (
  "id"              TEXT NOT NULL,
  "titulo"          TEXT NOT NULL,
  "descricao"       TEXT,
  "valor"           DOUBLE PRECISION,
  "autor"           TEXT,
  "numero"          TEXT,
  "ano"             INTEGER,
  "tipo"            "EmendaTipo"   NOT NULL DEFAULT 'INDIVIDUAL',
  "orgaoExecutor"   TEXT,
  "status"          "EmendaStatus" NOT NULL DEFAULT 'PROPOSTA',
  "beneficiario"    TEXT,
  "estado"          TEXT,
  "municipio"       TEXT,
  "bairro"          TEXT,
  "endereco"        TEXT,
  "lat"             DOUBLE PRECISION,
  "lng"             DOUBLE PRECISION,
  "foto"            TEXT,
  "observations"    TEXT,
  "gabineteId"      TEXT NOT NULL,
  "createdById"     TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "emendas_pkey" PRIMARY KEY ("id")
);

-- Índices
CREATE INDEX IF NOT EXISTS "emendas_gabineteId_idx"  ON "emendas"("gabineteId");
CREATE INDEX IF NOT EXISTS "emendas_createdById_idx" ON "emendas"("createdById");
CREATE INDEX IF NOT EXISTS "emendas_status_idx"      ON "emendas"("status");
CREATE INDEX IF NOT EXISTS "emendas_tipo_idx"        ON "emendas"("tipo");
CREATE INDEX IF NOT EXISTS "emendas_ano_idx"         ON "emendas"("ano");

-- Foreign keys
ALTER TABLE "emendas"
  ADD CONSTRAINT "emendas_gabineteId_fkey"
    FOREIGN KEY ("gabineteId") REFERENCES "gabinetes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "emendas_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
