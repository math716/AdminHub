-- Limite de tentativas (login, cadastro, convite) guardado no banco.
--
-- Ficava na memória de cada servidor: na Vercel cada pedido pode cair numa
-- instância diferente, cada uma com a sua contagem — o limite de 8 tentativas
-- de login por minuto valia por instância, não por pessoa.
--
-- Rodar no SQL Editor do Supabase ANTES de publicar o código que usa a
-- tabela. Tabela nova e vazia: criação instantânea. (Rodado em 29/10/2026.)

CREATE TABLE IF NOT EXISTS "limites_tentativas" (
  "chave"    TEXT PRIMARY KEY,
  "contagem" INTEGER NOT NULL DEFAULT 0,
  "expiraEm" TIMESTAMP(3) NOT NULL
);

CREATE INDEX IF NOT EXISTS "limites_tentativas_expiraEm_idx" ON "limites_tentativas"("expiraEm");
