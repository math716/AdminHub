export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const gabineteId = (session.user as any)?.gabineteId as string | undefined;
    if (!gabineteId) {
      return NextResponse.json({ error: 'Usuário sem gabinete associado' }, { status: 403 });
    }

    // Todas as queries filtradas pelo gabinete do usuário autenticado
    const scope = { gabineteId };

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // A timeline antes carregava todas as demandas dos ultimos 30 dias
    // (select createdAt) e agregava em JS. Agora a agregacao acontece
    // no Postgres com GROUP BY DATE — uma unica linha por dia.
    const [total, pendentes, emAndamento, resolvidas, byCategory, byPriority, recentDemands, timelineRows] = await Promise.all([
      prisma.demand.count({ where: scope }),
      prisma.demand.count({ where: { ...scope, status: 'PENDENTE' } }),
      prisma.demand.count({ where: { ...scope, status: 'EM_ANDAMENTO' } }),
      prisma.demand.count({ where: { ...scope, status: 'RESOLVIDA' } }),
      prisma.demand.groupBy({ by: ['category'], where: scope, _count: { id: true } }),
      prisma.demand.groupBy({ by: ['priority'], where: scope, _count: { id: true } }),
      prisma.demand.findMany({
        where: scope,
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, solicitante: true, municipio: true, estado: true, status: true, priority: true, createdAt: true }
      }),
      prisma.$queryRaw<Array<{ date: Date; count: bigint }>>(Prisma.sql`
        SELECT DATE("createdAt") AS date, COUNT(*)::bigint AS count
        FROM demands
        WHERE "gabineteId" = ${gabineteId} AND "createdAt" >= ${thirtyDaysAgo}
        GROUP BY 1
        ORDER BY 1
      `),
    ]);

    const timeline = (timelineRows ?? []).map((row) => ({
      date: new Date(row.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      count: Number(row.count ?? 0),
    }));

    return NextResponse.json({
      total:       total       ?? 0,
      pendentes:   pendentes   ?? 0,
      emAndamento: emAndamento ?? 0,
      resolvidas:  resolvidas  ?? 0,
      byCategory: Object.fromEntries(
        (byCategory ?? []).map((c: { category: string; _count: { id: number } }) => [c.category, c._count.id ?? 0])
      ),
      byPriority: Object.fromEntries(
        (byPriority ?? []).map((p: { priority: string; _count: { id: number } }) => [p.priority, p._count.id ?? 0])
      ),
      recentDemands: recentDemands ?? [],
      timeline:      timeline      ?? []
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json({ error: 'Erro ao buscar estatísticas' }, { status: 500 });
  }
}
