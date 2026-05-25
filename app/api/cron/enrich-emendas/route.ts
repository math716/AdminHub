/**
 * Cron de enriquecimento de emendas.
 *
 * Roda a cada N minutos, processa um chunk pequeno de emendas que ainda não têm
 * documentos no banco, e enriquece cada uma chamando /emendas/documentos e
 * /despesas/documentos do Portal.
 *
 * Por que chunk pequeno:
 *   Vercel serverless tem maxDuration de 60s (hobby) / 300s (pro). Sync completo
 *   de Brasil/ano demora horas — não cabe numa invocação. Solução: cron a cada
 *   5-10min, cada invocação processa um lote, gradualmente converge.
 *
 * Configurar em vercel.json:
 *   {
 *     "crons": [{
 *       "path": "/api/cron/enrich-emendas?limit=30",
 *       "schedule": "* /10 * * * *"
 *     }]
 *   }
 *
 * Auth: header `Authorization: Bearer <CRON_SECRET>`. Vercel envia automaticamente
 * quando CRON_SECRET está definido nas env vars do projeto.
 *
 * Backfill manual: use scripts/enrich-emendas-documentos.ts (CLI, sem timeout).
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { enrichEmenda } from '@/lib/emendas/enrich-emenda';

const ANOS_QUENTES = [2024, 2025, 2026];
const DEFAULT_LIMIT = 25;
const DEFAULT_CONCURRENCY = 3;

export async function GET(request: NextRequest) {
  // ── Auth: Bearer secret (Vercel Cron compatível) ─────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const limit = Math.min(
    parseInt(request.nextUrl.searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT,
    100,
  );
  const concurrency = Math.min(
    parseInt(request.nextUrl.searchParams.get('concurrency') ?? String(DEFAULT_CONCURRENCY), 10) || DEFAULT_CONCURRENCY,
    6,
  );
  const anoFiltro = request.nextUrl.searchParams.get('ano');
  const anos = anoFiltro ? [parseInt(anoFiltro, 10)] : ANOS_QUENTES;

  const inicio = Date.now();

  const emendas = await prisma.emendaParlamentar.findMany({
    where: {
      ano: { in: anos },
      documentos: { none: {} },
    },
    select: { id: true, idPortal: true, uf: true, ano: true },
    take: limit,
    orderBy: [{ ano: 'desc' }, { fetchedAt: 'asc' }],
  });

  if (emendas.length === 0) {
    return NextResponse.json({
      ok: true,
      mensagem: 'Nenhuma emenda pendente de enrich.',
      anos,
      processadas: 0,
      docsPersistidos: 0,
      duracaoMs: Date.now() - inicio,
    });
  }

  let totalDocsPersistidos = 0;
  let totalEmendasOk = 0;
  const erros: Array<{ codigoEmenda: string; mensagem: string }> = [];

  for (let i = 0; i < emendas.length; i += concurrency) {
    // Watchdog: se já gastamos 50s, para e deixa o resto pra próxima invocação
    if (Date.now() - inicio > 50_000) break;

    const batch = emendas.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map((e) =>
        enrichEmenda(e.idPortal, { emendaId: e.id, emendaUf: e.uf }).catch((err) => ({
          codigoEmenda: e.idPortal,
          docsEncontrados: 0,
          docsPersistidos: 0,
          erros: [{ codigoDocumento: '(enrich)', mensagem: err.message ?? String(err) }],
        })),
      ),
    );

    for (const r of results) {
      totalDocsPersistidos += r.docsPersistidos;
      if (r.erros.length === 0) {
        totalEmendasOk++;
      } else {
        erros.push({ codigoEmenda: r.codigoEmenda, mensagem: r.erros[0].mensagem });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    anos,
    pendentesNoLote: emendas.length,
    processadasComSucesso: totalEmendasOk,
    docsPersistidos: totalDocsPersistidos,
    erros: erros.slice(0, 20),
    duracaoMs: Date.now() - inicio,
  });
}
