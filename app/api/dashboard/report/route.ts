export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import DashboardReport from '@/components/pdf/dashboard-report';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const userRole = (session.user as any)?.role as string | undefined;
    const userId   = (session.user as any)?.id   as string | undefined;

    if (userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') {
      return NextResponse.json({ error: 'Sem dados de gabinete' }, { status: 403 });
    }

    let gabineteId: string | null = null;
    let gabineteName = 'AdminHub';

    if (userId) {
      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { gabineteId: true, gabinete: { select: { name: true } } },
      });
      gabineteId = dbUser?.gabineteId ?? null;
      gabineteName = (dbUser as any)?.gabinete?.name ?? 'AdminHub';
    }

    if (!gabineteId) {
      return NextResponse.json({ error: 'Usuário sem gabinete' }, { status: 403 });
    }

    const scope = { gabineteId };
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [total, pendentes, emAndamento, resolvidas, byCategory, byPriority, recentDemands, demands] =
      await Promise.all([
        prisma.demand.count({ where: scope }),
        prisma.demand.count({ where: { ...scope, status: 'PENDENTE' } }),
        prisma.demand.count({ where: { ...scope, status: 'EM_ANDAMENTO' } }),
        prisma.demand.count({ where: { ...scope, status: 'RESOLVIDA' } }),
        prisma.demand.groupBy({ by: ['category'], where: scope, _count: { id: true } }),
        prisma.demand.groupBy({ by: ['priority'], where: scope, _count: { id: true } }),
        prisma.demand.findMany({
          where: scope,
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: { id: true, title: true, status: true, priority: true, createdAt: true },
        }),
        prisma.demand.findMany({
          where: { ...scope, createdAt: { gte: thirtyDaysAgo } },
          select: { createdAt: true, status: true, updatedAt: true },
        }),
      ]);

    const timelineMap: Record<string, number> = {};
    const resolvedMap: Record<string, number> = {};
    demands.forEach((d) => {
      const dateStr = d.createdAt.toISOString().split('T')[0];
      timelineMap[dateStr] = (timelineMap[dateStr] ?? 0) + 1;
      if (d.status === 'RESOLVIDA') {
        const resolvedStr = d.updatedAt.toISOString().split('T')[0];
        resolvedMap[resolvedStr] = (resolvedMap[resolvedStr] ?? 0) + 1;
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
      timeline.push({ date: day.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), count: timelineMap[key] ?? 0, resolved: resolvedCount });
    }

    const stats = {
      total:       total       ?? 0,
      pendentes:   pendentes   ?? 0,
      emAndamento: emAndamento ?? 0,
      resolvidas:  resolvidas  ?? 0,
      byCategory:  Object.fromEntries((byCategory ?? []).map((c) => [c.category, c._count.id ?? 0])),
      byPriority:  Object.fromEntries((byPriority ?? []).map((p) => [p.priority, p._count.id ?? 0])),
      recentDemands: recentDemands ?? [],
      timeline:    timeline ?? [],
      lastResolvedDate: lastResolvedDate ?? null,
    };

    const buffer = await renderToBuffer(
      React.createElement(DashboardReport, { gabineteName, stats })
    );

    const dateStr = new Date().toISOString().slice(0, 10);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="relatorio-dashboard-${dateStr}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('PDF report error:', error);
    return NextResponse.json({ error: 'Erro ao gerar relatório' }, { status: 500 });
  }
}
