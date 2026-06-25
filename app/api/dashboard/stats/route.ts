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

    const userRole = (session.user as any)?.role as string | undefined;
    const userId   = (session.user as any)?.id   as string | undefined;

    // Fonte de verdade: gabineteId do banco (não da sessão JWT, que pode ser stale)
    // SUPER_ADMIN sem gabinete no banco vê tudo (visão global de plataforma)
    let gabineteId: string | null | undefined = (session.user as any)?.gabineteId;
    if (userId) {
      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { gabineteId: true },
      });
      gabineteId = dbUser?.gabineteId ?? null;
    }

    if (!gabineteId && userRole !== 'SUPER_ADMIN') {
      // ADMIN/outros sem gabinete associado → dashboard vazio (não é erro)
      return NextResponse.json({
        total: 0, pendentes: 0, emAndamento: 0, resolvidas: 0,
        byCategory: {}, byPriority: {}, recentDemands: [], timeline: [], lastResolvedDate: null,
      });
    }

    // Filtra por gabinete — SUPER_ADMIN sem gabinete vê tudo
    const scope = gabineteId ? { gabineteId } : {};

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
        select: { createdAt: true, status: true, updatedAt: true }
      }),
    ]);

    const timelineMap: Record<string, number> = {};
    const resolvedMap: Record<string, number> = {};
    demands?.forEach?.((d: { createdAt: Date; status: string; updatedAt: Date }) => {
      const dateStr = d?.createdAt?.toISOString?.()?.split?.('T')?.[0] ?? '';
      if (dateStr) timelineMap[dateStr] = (timelineMap[dateStr] ?? 0) + 1;
      if (d?.status === 'RESOLVIDA') {
        const resolvedStr = d?.updatedAt?.toISOString?.()?.split?.('T')?.[0] ?? dateStr;
        if (resolvedStr) resolvedMap[resolvedStr] = (resolvedMap[resolvedStr] ?? 0) + 1;
      }
    });

    const timeline: { date: string; count: number; resolved: number }[] = [];
    let lastResolvedDate: string | null = null;
    for (let i = 29; i >= 0; i--) {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - i);
      const key = day.toISOString().split('T')[0];
      const resolvedCount = resolvedMap[key] ?? 0;
      if (resolvedCount > 0) lastResolvedDate = day.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      timeline.push({
        date: day.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        count: timelineMap[key] ?? 0,
        resolved: resolvedCount,
      });
    }

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
      timeline:      timeline      ?? [],
      lastResolvedDate: lastResolvedDate ?? null,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json({ error: 'Erro ao buscar estatísticas' }, { status: 500 });
  }
}
