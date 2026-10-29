-- Excluir uma conta não apaga mais o que ela cadastrou no gabinete.
--
-- Com ON DELETE CASCADE, a exclusão definitiva de um ex-assessor (lixeira de
-- usuários) apagava todos os contatos, demandas, compromissos e colaboradores
-- que ele tinha criado. Agora o registro fica, com "criado por" vazio.
--
-- RODAR SÓ DEPOIS que os DOIS deploys estiverem com o código novo: o cliente
-- Prisma antigo trata "criado por" como obrigatório e quebraria ao listar um
-- registro órfão. Sem reescrita de tabela: instantâneo.

ALTER TABLE public."demands" ALTER COLUMN "createdById" DROP NOT NULL;
ALTER TABLE public."demands" DROP CONSTRAINT "demands_createdById_fkey",
  ADD CONSTRAINT "demands_createdById_fkey" FOREIGN KEY ("createdById")
  REFERENCES public."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE public."agenda_events" ALTER COLUMN "createdById" DROP NOT NULL;
ALTER TABLE public."agenda_events" DROP CONSTRAINT "agenda_events_createdById_fkey",
  ADD CONSTRAINT "agenda_events_createdById_fkey" FOREIGN KEY ("createdById")
  REFERENCES public."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE public."contatos" ALTER COLUMN "createdById" DROP NOT NULL;
ALTER TABLE public."contatos" DROP CONSTRAINT "contatos_createdById_fkey",
  ADD CONSTRAINT "contatos_createdById_fkey" FOREIGN KEY ("createdById")
  REFERENCES public."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE public."colaboradores" ALTER COLUMN "createdById" DROP NOT NULL;
ALTER TABLE public."colaboradores" DROP CONSTRAINT "colaboradores_createdById_fkey",
  ADD CONSTRAINT "colaboradores_createdById_fkey" FOREIGN KEY ("createdById")
  REFERENCES public."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
