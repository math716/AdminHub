export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import DashboardReport from '@/components/pdf/dashboard-report';
import { buildDemandasStats, type PeriodoRelatorio } from '@/lib/reports/demandas-stats';
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

    // Período do relatório
    const url     = new URL(request.url);
    const periodo = (url.searchParams.get('periodo') ?? 'MENSAL') as PeriodoRelatorio;

    const { stats, periodoLabel } = await buildDemandasStats(gabineteId, periodo, {
      dataInicio: url.searchParams.get('dataInicio'),
      dataFim:    url.searchParams.get('dataFim'),
    });

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
