/**
 * Rate limiter simples baseado em memória (por processo Node.js).
 * Suficiente para prevenir brute-force em instância única.
 * Em ambientes multi-instância, substitua por Redis + @upstash/ratelimit.
 */

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
