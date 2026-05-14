export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

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

    const [total, pendentes, emAndamento, resolvidas, byCategory, byPriority, recentDemands, demands] = await Promise.all([
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
      prisma.demand.findMany({
        where: { ...scope, createdAt: { gte: thirtyDaysAgo } },
        select: { createdAt: true }
      }),
    ]);

    const timelineMap: Record<string, number> = {};
    demands?.forEach?.((d: { createdAt: Date }) => {
      const dateStr = d?.createdAt?.toISOString?.()?.split?.('T')?.[0] ?? '';
      if (dateStr) timelineMap[dateStr] = (timelineMap[dateStr] ?? 0) + 1;
    });

    const timeline = Object.entries(timelineMap ?? {})
      ?.map?.(([date, count]) => ({
        date: new Date(date)?.toLocaleDateString?.('pt-BR', { day: '2-digit', month: '2-digit' }) ?? date,
        count: count ?? 0
      }))
      ?.sort?.((a, b) => {
        const dateA = a?.date?.split?.('/')?.reverse?.()?.join?.('') ?? '';
        const dateB = b?.date?.split?.('/')?.reverse?.()?.join?.('') ?? '';
        return dateA?.localeCompare?.(dateB) ?? 0;
      }) ?? [];

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
