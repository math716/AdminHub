-- Migra usuários com roles extintos para ASSESSOR antes de remover do enum
UPDATE "User" SET role = 'ASSESSOR' WHERE role IN ('ANALISTA', 'VISUALIZADOR');

-- Recria o enum sem ANALISTA e VISUALIZADOR
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'AGENTE_POLITICO', 'CHEFE', 'ASSESSOR');
ALTER TABLE "User" ALTER COLUMN role TYPE "UserRole" USING role::text::"UserRole";
ALTER TABLE "User" ALTER COLUMN role SET DEFAULT 'ASSESSOR'::"UserRole";
DROP TYPE "UserRole_old";
