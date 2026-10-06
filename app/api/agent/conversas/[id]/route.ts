export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { enxugar, validarMensagens } from '@/lib/agent/conversa-store';
import { donoDaConversa } from '@/lib/agent/dono-conversa';

/**
 * Atualiza uma conversa já salva. É o que faz o autosave funcionar: sem isso a
 * conversa congela no estado em que foi gravada pela primeira vez e as
 * mensagens seguintes (com os cards e os botões de relatório) se perdem.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const dono = await donoDaConversa(session);
    if (!dono) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { titulo, mensagens } = (await request.json()) ?? {};
    if (!validarMensagens(mensagens)) {
      return NextResponse.json({ error: 'Mensagens inválidas' }, { status: 400 });
    }

    // Escopo do dono — impede atualizar conversa de outro gabinete ou pessoa.
    const existing = await prisma.gabiConversa.findFirst({
      where: { id: params.id, ...dono },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });

    await prisma.gabiConversa.update({
      where: { id: params.id },
      data: {
        mensagens: enxugar(mensagens),
        ...(titulo ? { titulo: String(titulo).slice(0, 120) } : {}),
      },
      select: { id: true },
    });

    return NextResponse.json({ id: params.id });
  } catch (error) {
    console.error('PUT /api/agent/conversas/[id] error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar conversa' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const dono = await donoDaConversa(session);
    if (!dono) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const existing = await prisma.gabiConversa.findFirst({
      where: { id: params.id, ...dono },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });

    await prisma.gabiConversa.delete({ where: { id: params.id }, select: { id: true } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/agent/conversas/[id] error:', error);
    return NextResponse.json({ error: 'Erro ao deletar conversa' }, { status: 500 });
  }
}
