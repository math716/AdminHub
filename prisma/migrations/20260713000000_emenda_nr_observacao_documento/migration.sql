-- AlterTable: adiciona observacao e campos de documento em emendas_nao_realizadas
ALTER TABLE "emendas_nao_realizadas" ADD COLUMN IF NOT EXISTS "observacao" TEXT;
ALTER TABLE "emendas_nao_realizadas" ADD COLUMN IF NOT EXISTS "documentoBase64" TEXT;
ALTER TABLE "emendas_nao_realizadas" ADD COLUMN IF NOT EXISTS "documentoNome" TEXT;
