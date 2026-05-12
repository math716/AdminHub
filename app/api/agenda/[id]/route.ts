export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

// PUT /api/agenda/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const gabineteId = (session.user as any)?.gabineteId;
    const body = await request.json();

    const existing = await prisma.agendaEvent.findUnique({ where: { id: params.id } });
    if (!existing || existing.gabineteId !== gabineteId) {
      return NextResponse.json({ error: 'Evento não encontrado' }, { status: 404 });
    }

    const event = await prisma.agendaEvent.update({
      where: { id: params.id },
      data: {
        titulo:    body.titulo ?? existing.titulo,
        descricao: body.descricao ?? null,
        data:      body.data ? new Date(body.data) : existing.data,
        dataFim:   body.dataFim ? new Date(body.dataFim) : null,
        local:     body.local ?? null,
        endereco:  body.endereco ?? null,
        lat:       body.lat ?? null,
        lng:       body.lng ?? null,
        tipo:      body.tipo ?? existing.tipo,
        cor:       body.cor ?? null,
      },
    });

    return NextResponse.json(event);
  } catch (error) {
    console.error('PUT /api/agenda/[id] error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar evento' }, { status: 500 });
  }
}

// DELETE /api/agenda/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const gabineteId = (session.user as any)?.gabineteId;

    const existing = await prisma.agendaEvent.findUnique({ where: { id: params.id } });
    if (!existing || existing.gabineteId !== gabineteId) {
      return NextResponse.json({ error: 'Evento não encontrado' }, { status: 404 });
    }

    await prisma.agendaEvent.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/agenda/[id] error:', error);
    return NextResponse.json({ error: 'Erro ao excluir evento' }, { status: 500 });
  }
}
