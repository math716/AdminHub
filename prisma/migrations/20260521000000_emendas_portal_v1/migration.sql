-- ============================================================================
-- emendas_portal_v1
-- Substitui o modelo de emendas internas do gabinete pela integração com o
-- Portal da Transparência. Drop do model Emenda antigo e criação dos novos
-- models MunicipioStats, Parlamentar e EmendaParlamentar.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- Drop do modelo Emenda antigo
-- ─────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS "emendas" CASCADE;
DROP TYPE  IF EXISTS "EmendaTipo";
DROP TYPE  IF EXISTS "EmendaStatus";

-- ─────────────────────────────────────────────────────────────────────────
-- Novos enums
-- ─────────────────────────────────────────────────────────────────────────
CREATE TYPE "EmendaArea" AS ENUM (
  'SAUDE', 'EDUCACAO', 'SEGURANCA', 'INFRAESTRUTURA', 'ASSISTENCIA_SOCIAL',
  'AGRICULTURA', 'CULTURA', 'ESPORTE', 'MEIO_AMBIENTE', 'TRANSPORTE',
  'HABITACAO', 'SANEAMENTO', 'OUTROS'
);

CREATE TYPE "ParlamentarCargo" AS ENUM (
  'VEREADOR', 'PREFEITO', 'DEPUTADO_ESTADUAL', 'DEPUTADO_FEDERAL',
  'SENADOR', 'GOVERNADOR'
);

-- ─────────────────────────────────────────────────────────────────────────
-- MunicipioStats — habitantes, eleitores, teto MAC/PAP por ano
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE "municipio_stats" (
  "id"         TEXT             NOT NULL,
  "codigoIbge" TEXT             NOT NULL,
  "uf"         TEXT             NOT NULL,
  "nome"       TEXT             NOT NULL,
  "ano"        INTEGER          NOT NULL,
  "habitantes" INTEGER,
  "eleitores"  INTEGER,
  "tetoMac"    DOUBLE PRECISION,
  "tetoPap"    DOUBLE PRECISION,
  "fonte"      TEXT,
  "createdAt"  TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3)     NOT NULL,
  CONSTRAINT "municipio_stats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "municipio_stats_codigoIbge_ano_key" ON "municipio_stats"("codigoIbge", "ano");
CREATE INDEX        "municipio_stats_uf_ano_idx"         ON "municipio_stats"("uf", "ano");

-- ─────────────────────────────────────────────────────────────────────────
-- Parlamentar — cache de autores de emendas
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE "parlamentares" (
  "id"        TEXT               NOT NULL,
  "cpf"       TEXT,
  "idPortal"  TEXT,
  "nome"      TEXT               NOT NULL,
  "nomeUrna"  TEXT,
  "partido"   TEXT,
  "uf"        TEXT,
  "cargo"     "ParlamentarCargo" NOT NULL,
  "ativo"     BOOLEAN            NOT NULL DEFAULT TRUE,
  "fotoUrl"   TEXT,
  "createdAt" TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3)       NOT NULL,
  CONSTRAINT "parlamentares_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "parlamentares_cpf_key"      ON "parlamentares"("cpf");
CREATE UNIQUE INDEX "parlamentares_idPortal_key" ON "parlamentares"("idPortal");
CREATE INDEX        "parlamentares_cargo_idx"    ON "parlamentares"("cargo");
CREATE INDEX        "parlamentares_uf_idx"       ON "parlamentares"("uf");
CREATE INDEX        "parlamentares_partido_idx"  ON "parlamentares"("partido");
CREATE INDEX        "parlamentares_nome_idx"     ON "parlamentares"("nome");

-- ─────────────────────────────────────────────────────────────────────────
-- EmendaParlamentar — cache de emendas do Portal
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE "emendas_parlamentares" (
  "id"                   TEXT             NOT NULL,
  "idPortal"             TEXT             NOT NULL,
  "ano"                  INTEGER          NOT NULL,
  "numero"               TEXT,
  "tipo"                 TEXT,
  "funcao"               TEXT,
  "subfuncao"            TEXT,
  "area"                 "EmendaArea"     NOT NULL DEFAULT 'OUTROS',
  "objeto"               TEXT,
  "valorEmpenhado"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "valorPago"            DOUBLE PRECISION NOT NULL DEFAULT 0,
  "valorRestoPago"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "valorProposto"        DOUBLE PRECISION,
  "orgaoExecutor"        TEXT,
  "unidadeOrcamentaria"  TEXT,
  "beneficiario"         TEXT,
  "cnpjBeneficiario"     TEXT,
  "uf"                   TEXT,
  "codigoIbge"           TEXT,
  "municipioNome"        TEXT,
  "parlamentarId"        TEXT,
  "fetchedAt"            TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3)     NOT NULL,
  CONSTRAINT "emendas_parlamentares_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "emendas_parlamentares_idPortal_key"            ON "emendas_parlamentares"("idPortal");
CREATE INDEX        "emendas_parlamentares_ano_idx"                 ON "emendas_parlamentares"("ano");
CREATE INDEX        "emendas_parlamentares_codigoIbge_idx"          ON "emendas_parlamentares"("codigoIbge");
CREATE INDEX        "emendas_parlamentares_codigoIbge_ano_idx"      ON "emendas_parlamentares"("codigoIbge", "ano");
CREATE INDEX        "emendas_parlamentares_parlamentarId_idx"       ON "emendas_parlamentares"("parlamentarId");
CREATE INDEX        "emendas_parlamentares_parlamentarId_ano_idx"   ON "emendas_parlamentares"("parlamentarId", "ano");
CREATE INDEX        "emendas_parlamentares_area_idx"                ON "emendas_parlamentares"("area");
CREATE INDEX        "emendas_parlamentares_uf_ano_idx"              ON "emendas_parlamentares"("uf", "ano");

ALTER TABLE "emendas_parlamentares"
  ADD CONSTRAINT "emendas_parlamentares_parlamentarId_fkey"
  FOREIGN KEY ("parlamentarId") REFERENCES "parlamentares"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
