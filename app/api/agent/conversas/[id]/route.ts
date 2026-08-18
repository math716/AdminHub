export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { enxugar, validarMensagens } from '@/lib/agent/conversa-store';

async function getGabineteId(session: any): Promise<string | null> {
  const userId = (session.user as any)?.id;
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { gabineteId: true } });
  return user?.gabineteId ?? null;
}

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

    const gabineteId = await getGabineteId(session);
    if (!gabineteId) return NextResponse.json({ error: 'Gabinete não encontrado' }, { status: 400 });

    const { titulo, mensagens } = (await request.json()) ?? {};
    if (!validarMensagens(mensagens)) {
      return NextResponse.json({ error: 'Mensagens inválidas' }, { status: 400 });
    }

    // Escopo do gabinete — impede atualizar conversa de outro gabinete.
    const existing = await (prisma as any).gabiConversa.findFirst({
      where: { id: params.id, gabineteId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });

    await (prisma as any).gabiConversa.update({
      where: { id: params.id },
      data: {
        mensagens: enxugar(mensagens),
        ...(titulo ? { titulo: String(titulo).slice(0, 120) } : {}),
      },
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

    const gabineteId = await getGabineteId(session);
    if (!gabineteId) return NextResponse.json({ error: 'Gabinete não encontrado' }, { status: 400 });

    const existing = await (prisma as any).gabiConversa.findFirst({
      where: { id: params.id, gabineteId },
    });
    if (!existing) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });

    await (prisma as any).gabiConversa.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/agent/conversas/[id] error:', error);
    return NextResponse.json({ error: 'Erro ao deletar conversa' }, { status: 500 });
  }
}
