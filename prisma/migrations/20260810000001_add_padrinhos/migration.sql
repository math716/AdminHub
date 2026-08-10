-- Nova tabela de Padrinhos Políticos
CREATE TABLE "padrinhos" (
    "id"         TEXT NOT NULL,
    "nome"       TEXT NOT NULL,
    "cargo"      TEXT NOT NULL,
    "partido"    TEXT NOT NULL,
    "gabineteId" TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "padrinhos_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "padrinhos"
    ADD CONSTRAINT "padrinhos_gabineteId_fkey"
    FOREIGN KEY ("gabineteId") REFERENCES "gabinetes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Trocar FK de colaboradores.padrinhoId: de auto-referência para padrinhos
ALTER TABLE "colaboradores" DROP CONSTRAINT IF EXISTS "colaboradores_padrinhoId_fkey";

ALTER TABLE "colaboradores"
    ADD CONSTRAINT "colaboradores_padrinhoId_fkey"
    FOREIGN KEY ("padrinhoId") REFERENCES "padrinhos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "padrinhos_gabineteId_idx" ON "padrinhos"("gabineteId");
CREATE INDEX "padrinhos_nome_idx" ON "padrinhos"("nome");
