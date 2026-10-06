-- Histórico da Gabi para quem não tem gabinete.
--
-- A conversa era sempre guardada DENTRO de um gabinete (gabineteId
-- obrigatório). As contas ADMIN e SUPER_ADMIN não têm gabinete até escolher um
-- no seletor — e todo salvamento delas era recusado em silêncio: a Gabi
-- respondia, mas a conversa sumia ao recarregar e o histórico ficava vazio.
--
-- Agora a conversa pertence a um gabinete OU, sem gabinete, ao próprio
-- usuário. Nada é reescrito nem apagado: as conversas existentes continuam
-- no gabinete delas. A regra no fim impede conversa sem dono.

ALTER TABLE "gabi_conversas" ALTER COLUMN "gabineteId" DROP NOT NULL;

ALTER TABLE "gabi_conversas" ADD COLUMN IF NOT EXISTS "usuarioId" TEXT;

DO $$ BEGIN
  ALTER TABLE "gabi_conversas"
    ADD CONSTRAINT "gabi_conversas_usuarioId_fkey"
    FOREIGN KEY ("usuarioId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "gabi_conversas_usuarioId_criadaEm_idx"
  ON "gabi_conversas" ("usuarioId", "criadaEm" DESC);

DO $$ BEGIN
  ALTER TABLE "gabi_conversas"
    ADD CONSTRAINT "gabi_conversas_dono_check"
    CHECK ("gabineteId" IS NOT NULL OR "usuarioId" IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
