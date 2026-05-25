/**
 * HTTP layer pro Portal da Transparência (api.portaldatransparencia.gov.br).
 *
 * Auth: header `chave-api-dados: <PORTAL_TRANSPARENCIA_API_KEY>`.
 * Rate limit observado: ~700 req/min na chave grátis. Quando estoura, API
 * retorna 429 — fazemos backoff exponencial e retry.
 *
 * Por que módulo separado de `lib/portal-transparencia.ts`:
 *  - `portal-transparencia.ts` tem fetcher próprio, mas as funções são privadas
 *    (não exportadas) e estão acopladas ao fluxo live-fetch + cache de memória.
 *  - Esse novo fetcher é pensado pro cron/persistência: rate limit explícito,
 *    sem cache em memória, retry-friendly.
 */

const PORTAL_BASE = 'https://api.portaldatransparencia.gov.br';
const API_KEY = process.env.PORTAL_TRANSPARENCIA_API_KEY;

export class PortalRateLimitError extends Error {
  constructor() {
    super('Portal da Transparência rate limit (HTTP 429) — backoff esgotado.');
    this.name = 'PortalRateLimitError';
  }
}

export class PortalNotConfiguredError extends Error {
  constructor() {
    super('PORTAL_TRANSPARENCIA_API_KEY não está definida.');
    this.name = 'PortalNotConfiguredError';
  }
}

interface FetchOpts {
  /** Retentativas em caso de 429 antes de desistir. */
  maxRetries?: number;
  /** Delay base do backoff exponencial (ms). */
  baseDelayMs?: number;
  /** Se true, ignora 404 e retorna []. Útil pra endpoints que retornam vazio quando não há dado. */
  empty404?: boolean;
}

/**
 * Fetch genérico no Portal. Faz backoff exponencial em 429.
 *
 * Lança `PortalNotConfiguredError` se a chave não estiver setada — diferente
 * de `lib/portal-transparencia.ts` que entra em mock mode. Em cron/sync,
 * mock não faz sentido.
 */
export async function portalFetch<T = unknown>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  opts: FetchOpts = {},
): Promise<T> {
  if (!API_KEY) throw new PortalNotConfiguredError();

  const maxRetries = opts.maxRetries ?? 5;
  const baseDelayMs = opts.baseDelayMs ?? 1000;

  const url = new URL(`${PORTAL_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  });

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url.toString(), {
      headers: {
        'chave-api-dados': API_KEY,
        accept: 'application/json',
      },
    });

    if (res.status === 429) {
      if (attempt === maxRetries) throw new PortalRateLimitError();
      const delay = baseDelayMs * Math.pow(2, attempt);
      await sleep(delay);
      continue;
    }

    if (res.status === 404 && opts.empty404) {
      return [] as unknown as T;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Portal HTTP ${res.status} @ ${path}: ${body.slice(0, 200)}`);
    }

    return res.json() as Promise<T>;
  }

  // unreachable — loop termina por return ou throw
  throw new PortalRateLimitError();
}

/**
 * Paginação sequencial. Para quando uma página vem vazia ou com menos de
 * `pageSize` itens (Portal usa 15 por padrão).
 */
export async function portalFetchAllPages<T = unknown>(
  path: string,
  baseParams: Record<string, string | number | undefined>,
  opts: { maxPages?: number; pageSize?: number } & FetchOpts = {},
): Promise<T[]> {
  const maxPages = opts.maxPages ?? 500;
  const pageSize = opts.pageSize ?? 15;
  const out: T[] = [];

  for (let pagina = 1; pagina <= maxPages; pagina++) {
    const page = await portalFetch<T[]>(path, { ...baseParams, pagina }, opts);
    if (!Array.isArray(page) || page.length === 0) break;
    out.push(...page);
    if (page.length < pageSize) break;
  }

  return out;
}

/**
 * Paginação em chunks paralelos. Mais rápido que sequencial pra grandes
 * volumes, mas exige cuidado com rate limit — concurrency padrão 6 fica
 * folgado dentro dos ~700 req/min.
 */
export async function portalFetchAllPagesParallel<T = unknown>(
  path: string,
  baseParams: Record<string, string | number | undefined>,
  opts: { maxPages?: number; concurrency?: number; pageSize?: number } & FetchOpts = {},
): Promise<T[]> {
  const maxPages = opts.maxPages ?? 500;
  const concurrency = opts.concurrency ?? 6;
  const pageSize = opts.pageSize ?? 15;
  const out: T[] = [];

  for (let start = 1; start <= maxPages; start += concurrency) {
    const pages = Array.from(
      { length: Math.min(concurrency, maxPages - start + 1) },
      (_, i) => start + i,
    );
    const chunk = await Promise.all(
      pages.map((pagina) =>
        portalFetch<T[]>(path, { ...baseParams, pagina }, opts).catch(() => [] as T[]),
      ),
    );

    let sawEnd = false;
    for (const page of chunk) {
      if (!Array.isArray(page) || page.length === 0) {
        sawEnd = true;
        continue;
      }
      out.push(...page);
      if (page.length < pageSize) sawEnd = true;
    }
    if (sawEnd) break;
  }

  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
