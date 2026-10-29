-- Tabelas que nunca receberam dados (0 linhas em 29/10/2026):
-- - accounts, sessions, verification_tokens: do adapter do NextAuth, que não
--   era chamado (sessão JWT, login só por credenciais) e saiu do código;
-- - votos_municipio, votos_zona, locais_votacao: os votos do TSE vêm dos
--   arquivos estáticos (public/data/tse);
-- - transferencias_pix: nunca houve importação para ela.
--
-- RODAR SÓ DEPOIS que os DOIS deploys (math716 e produção) estiverem com o
-- código que não consulta mais essas tabelas. Sempre com o esquema `public`:
-- o Supabase tem um auth.sessions próprio, que não pode ser tocado.

DO $$
DECLARE t text; n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['accounts','sessions','verification_tokens','votos_municipio','votos_zona','locais_votacao','transferencias_pix'] LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
      IF n > 0 THEN RAISE EXCEPTION 'public.% tem % linhas — nada foi apagado', t, n; END IF;
    END IF;
  END LOOP;
END $$;

DROP TABLE IF EXISTS public."accounts";
DROP TABLE IF EXISTS public."sessions";
DROP TABLE IF EXISTS public."verification_tokens";
DROP TABLE IF EXISTS public."votos_municipio";
DROP TABLE IF EXISTS public."votos_zona";
DROP TABLE IF EXISTS public."locais_votacao";
DROP TABLE IF EXISTS public."transferencias_pix";
