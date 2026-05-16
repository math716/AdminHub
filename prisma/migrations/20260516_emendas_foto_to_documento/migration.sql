-- Renomeia foto -> documento e adiciona nome do arquivo

ALTER TABLE "emendas" RENAME COLUMN "foto" TO "documento";

ALTER TABLE "emendas"
  ADD COLUMN IF NOT EXISTS "documentoNome" TEXT;
