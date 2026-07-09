export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import DashboardReport from '@/components/pdf/dashboard-report';
import fs from 'fs';
import path from 'path';

export async function GET(request: Request) {
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
        select: { gabineteId: true, gabinete: { select: { nome: true } } },
      });
      gabineteId = dbUser?.gabineteId ?? null;
      gabineteName = (dbUser as any)?.gabinete?.nome ?? 'AdminHub';
    }

    if (!gabineteId) {
      return NextResponse.json({ error: 'Usuário sem gabinete' }, { status: 403 });
    }

    const scope = { gabineteId };

    // Período do relatório
    const url     = new URL(request.url);
    const periodo = url.searchParams.get('periodo') ?? 'MENSAL';
    const hoje    = new Date();
    let dataInicio: Date;
    let dataFim: Date = new Date(hoje);

    if (periodo === 'ANUAL') {
      dataInicio = new Date(hoje.getFullYear(), 0, 1);
    } else if (periodo === 'CUSTOM') {
      const ini = url.searchParams.get('dataInicio');
      const fim = url.searchParams.get('dataFim');
      dataInicio = ini ? new Date(ini) : new Date(hoje.getTime() - 30 * 86_400_000);
      dataFim    = fim ? new Date(fim + 'T23:59:59') : hoje;
    } else {
      // MENSAL — últimos 30 dias
      dataInicio = new Date(hoje.getTime() - 30 * 86_400_000);
    }

    const periodoLabel = periodo === 'ANUAL'
      ? `Ano ${hoje.getFullYear()}`
      : periodo === 'CUSTOM'
        ? `${dataInicio.toLocaleDateString('pt-BR')} – ${dataFim.toLocaleDateString('pt-BR')}`
        : 'Últimos 30 dias';

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
          where: { ...scope, createdAt: { gte: dataInicio, lte: dataFim } },
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
    const diffDays = Math.max(1, Math.ceil((dataFim.getTime() - dataInicio.getTime()) / 86_400_000));
    for (let i = 0; i < diffDays; i++) {
      const day = new Date(dataInicio);
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() + i);
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

    const logoPath = path.join(process.cwd(), 'public', 'logo.png');
    const logoSrc = fs.existsSync(logoPath)
      ? `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`
      : undefined;

    const buffer = await renderToBuffer(
      React.createElement(DashboardReport, { gabineteName, stats, logoSrc, periodoLabel })
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
