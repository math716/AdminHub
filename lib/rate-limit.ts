/**
 * Limite de tentativas (login, cadastro, convite).
 *
 * `limiteDeTentativas` conta no banco (tabela limites_tentativas), que é
 * compartilhado entre as instâncias da Vercel. A contagem só em memória valia
 * POR INSTÂNCIA: cada pedido pode cair num servidor diferente, então as 8
 * tentativas de login por minuto viravam 8 vezes o número de instâncias.
 *
 * `checkRateLimit` (memória) continua como reserva: se o banco falhar nessa
 * conferência, o limite em memória entra no lugar — ninguém fica sem entrar
 * por causa da tabela.
 */

import { prisma } from '@/lib/db';

interface Entry { count: number; resetAt: number }
const store = new Map<string, Entry>();

// Limpeza periódica para evitar vazamento de memória em processos de longa duração
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos
function cleanup() {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}
if (typeof setInterval !== 'undefined') {
  const timer = setInterval(cleanup, CLEANUP_INTERVAL_MS);
  if (timer?.unref) timer.unref(); // não impede o processo de encerrar
}

export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

let avisouFalha = false;

/**
 * true = pode seguir; false = passou do limite. Até `maxRequests` tentativas
 * por janela, como antes. Uma operação só no banco: soma 1 e, se a janela
 * venceu, recomeça a contagem — certo mesmo com tentativas simultâneas.
 */
export async function limiteDeTentativas(key: string, maxRequests: number, windowMs: number): Promise<boolean> {
  try {
    const linhas = await prisma.$queryRaw<Array<{ contagem: number }>>`
      INSERT INTO "limites_tentativas" ("chave", "contagem", "expiraEm")
      VALUES (${key}, 1, now() + (${windowMs}::int * interval '1 millisecond'))
      ON CONFLICT ("chave") DO UPDATE SET
        "contagem" = CASE WHEN "limites_tentativas"."expiraEm" <= now()
                          THEN 1 ELSE "limites_tentativas"."contagem" + 1 END,
        "expiraEm" = CASE WHEN "limites_tentativas"."expiraEm" <= now()
                          THEN EXCLUDED."expiraEm" ELSE "limites_tentativas"."expiraEm" END
      RETURNING "contagem"`;
    // De vez em quando, apaga o que já venceu — a tabela fica pequena.
    if (Math.random() < 0.02) {
      prisma.$executeRaw`DELETE FROM "limites_tentativas" WHERE "expiraEm" < now() - interval '1 hour'`
        .catch(() => {});
    }
    return Number(linhas[0]?.contagem ?? 1) <= maxRequests;
  } catch (err) {
    if (!avisouFalha) {
      avisouFalha = true;
      console.warn('[rate-limit] banco indisponível, usando o limite em memória:', String(err).slice(0, 200));
    }
    return checkRateLimit(key, maxRequests, windowMs);
  }
}
