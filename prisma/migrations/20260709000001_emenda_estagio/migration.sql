-- Adiciona campo estagio para armazenar o estágio da emenda conforme
-- reportado pelo portal de origem (ex: ALESP SP: "Impedida Tecnicamente").
-- Nullable — apenas estados que fornecem esse dado o preencherão.
ALTER TABLE "emendas_parlamentares" ADD COLUMN "estagio" TEXT;
