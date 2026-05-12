export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

// GET /api/agenda?mes=4&ano=2026
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const gabineteId = (session.user as any)?.gabineteId;
    if (!gabineteId) return NextResponse.json({ error: 'Usuário sem gabinete' }, { status: 400 });

    const { searchParams } = new URL(request.url);
    const mes = searchParams.get('mes');
    const ano = searchParams.get('ano');

    // Auto-delete past events (before start of today)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    await prisma.agendaEvent.deleteMany({
      where: {
        gabineteId,
        OR: [
          { dataFim: { lt: startOfToday } },
          { dataFim: null, data: { lt: startOfToday } },
        ],
      },
    });

    const where: any = { gabineteId };

    if (mes && ano) {
      const mesNum = parseInt(mes);
      const anoNum = parseInt(ano);
      const inicio = new Date(anoNum, mesNum - 1, 1);
      const fim = new Date(anoNum, mesNum, 0, 23, 59, 59);
      where.data = { gte: inicio, lte: fim };
    }

    const events = await prisma.agendaEvent.findMany({
      where,
      orderBy: { data: 'asc' },
      include: { createdBy: { select: { name: true } } },
    });

    return NextResponse.json(events ?? []);
  } catch (error) {
    console.error('GET /api/agenda error:', error);
    return NextResponse.json({ error: 'Erro ao buscar eventos' }, { status: 500 });
  }
}

// POST /api/agenda
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const userId = (session.user as any)?.id;
    const gabineteId = (session.user as any)?.gabineteId;
    if (!gabineteId) return NextResponse.json({ error: 'Usuário sem gabinete' }, { status: 400 });

    const body = await request.json();

    const event = await prisma.agendaEvent.create({
      data: {
        titulo:    body.titulo ?? '',
        descricao: body.descricao ?? null,
        data:      new Date(body.data),
        dataFim:   body.dataFim ? new Date(body.dataFim) : null,
        local:     body.local ?? null,
        endereco:  body.endereco ?? null,
        lat:       body.lat ?? null,
        lng:       body.lng ?? null,
        tipo:      body.tipo ?? 'REUNIAO',
        cor:       body.cor ?? null,
        gabineteId,
        createdById: userId,
      },
    });

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    console.error('POST /api/agenda error:', error);
    return NextResponse.json({ error: 'Erro ao criar evento' }, { status: 500 });
  }
}
