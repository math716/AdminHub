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
