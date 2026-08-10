export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

async function getGabineteId(session: any): Promise<string | null> {
  const userId = (session.user as any)?.id;
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { gabineteId: true } });
  return user?.gabineteId ?? null;
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

    const existing = await prisma.padrinho.findFirst({
      where: { id: params.id, gabineteId },
    });
    if (!existing) return NextResponse.json({ error: 'Padrinho não encontrado' }, { status: 404 });

    // Desvincula colaboradores antes de deletar
    await prisma.colaborador.updateMany({
      where: { padrinhoId: params.id },
      data: { padrinhoId: null },
    });

    await prisma.padrinho.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/padrinhos/[id] error:', error);
    return NextResponse.json({ error: 'Erro ao deletar padrinho' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const gabineteId = await getGabineteId(session);
    if (!gabineteId) return NextResponse.json({ error: 'Gabinete não encontrado' }, { status: 400 });

    const existing = await prisma.padrinho.findFirst({
      where: { id: params.id, gabineteId },
    });
    if (!existing) return NextResponse.json({ error: 'Padrinho não encontrado' }, { status: 404 });

    const body = await request.json();
    const { nome, cargo, partido } = body ?? {};
    if (!nome?.trim()) return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });

    const updated = await prisma.padrinho.update({
      where: { id: params.id },
      data: {
        ...(nome !== undefined && { nome: nome.trim() }),
        ...(cargo !== undefined && { cargo: cargo.trim() }),
        ...(partido !== undefined && { partido: partido.trim() }),
      },
      select: { id: true, nome: true, cargo: true, partido: true, _count: { select: { colaboradores: true } } },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('PATCH /api/padrinhos/[id] error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar padrinho' }, { status: 500 });
  }
}
