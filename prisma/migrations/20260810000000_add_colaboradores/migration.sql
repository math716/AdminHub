-- Enum de status do colaborador
CREATE TYPE "ColaboradorStatus" AS ENUM ('ATIVO', 'INATIVO');

-- Tabela principal de colaboradores de campanha
CREATE TABLE "colaboradores" (
    "id"           TEXT NOT NULL,
    "nome"         TEXT NOT NULL,
    "telefone"     TEXT,
    "email"        TEXT,
    "endereco"     TEXT,
    "lat"          DOUBLE PRECISION,
    "lng"          DOUBLE PRECISION,
    "funcao"       TEXT,
    "observacao"   TEXT,
    "status"       "ColaboradorStatus" NOT NULL DEFAULT 'ATIVO',
    "padrinhoId"   TEXT,
    "gabineteId"   TEXT NOT NULL,
    "createdById"  TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "colaboradores_pkey" PRIMARY KEY ("id")
);

-- Tabela de regiões de atuação (N:N entre colaborador e região)
CREATE TABLE "colaboradores_regioes" (
    "id"            TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "uf"            TEXT NOT NULL,
    "regiaoNome"    TEXT NOT NULL,

    CONSTRAINT "colaboradores_regioes_pkey" PRIMARY KEY ("id")
);

-- Foreign keys
ALTER TABLE "colaboradores"
    ADD CONSTRAINT "colaboradores_padrinhoId_fkey"
        FOREIGN KEY ("padrinhoId") REFERENCES "colaboradores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "colaboradores"
    ADD CONSTRAINT "colaboradores_gabineteId_fkey"
        FOREIGN KEY ("gabineteId") REFERENCES "gabinetes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "colaboradores"
    ADD CONSTRAINT "colaboradores_createdById_fkey"
        FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "colaboradores_regioes"
    ADD CONSTRAINT "colaboradores_regioes_colaboradorId_fkey"
        FOREIGN KEY ("colaboradorId") REFERENCES "colaboradores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Índices
CREATE INDEX "colaboradores_gabineteId_idx" ON "colaboradores"("gabineteId");
CREATE INDEX "colaboradores_padrinhoId_idx" ON "colaboradores"("padrinhoId");
CREATE INDEX "colaboradores_status_idx" ON "colaboradores"("status");
CREATE INDEX "colaboradores_gabineteId_status_idx" ON "colaboradores"("gabineteId", "status");

CREATE UNIQUE INDEX "colaboradores_regioes_colaboradorId_regiaoNome_key"
    ON "colaboradores_regioes"("colaboradorId", "regiaoNome");
CREATE INDEX "colaboradores_regioes_colaboradorId_idx" ON "colaboradores_regioes"("colaboradorId");
CREATE INDEX "colaboradores_regioes_regiaoNome_idx" ON "colaboradores_regioes"("regiaoNome");
