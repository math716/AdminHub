export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const userRole     = (session.user as any)?.role;
    const gabineteId   = (session.user as any)?.gabineteId;
    const sessionName  = (session.user as any)?.name ?? 'Administrador';
    const sessionId    = (session.user as any)?.id;

    if (
      userRole !== 'CHEFE' && userRole !== 'ADMIN' &&
      userRole !== 'SUPER_ADMIN' && userRole !== 'AGENTE_POLITICO'
    ) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    const userToReject = await prisma.user.findUnique({
      where: { id: params?.id ?? '' }
    });

    if (!userToReject) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    if (params.id === sessionId) {
      return NextResponse.json({ error: 'Você não pode remover a própria conta' }, { status: 400 });
    }

    // CHEFE e AGENTE_POLITICO só podem mexer em usuários do próprio gabinete
    if (
      (userRole === 'CHEFE' || userRole === 'AGENTE_POLITICO') &&
      userToReject.gabineteId !== gabineteId
    ) {
      return NextResponse.json({ error: 'Você só pode remover usuários do seu gabinete' }, { status: 403 });
    }

    // ADMIN e SUPER_ADMIN fazem hard delete direto (são os revisores)
    if (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN') {
      await prisma.user.delete({ where: { id: params?.id ?? '' } });
      return NextResponse.json({ success: true });
    }

    // CHEFE e AGENTE_POLITICO fazem soft delete — fica pendente para revisão do ADMIN
    await prisma.user.update({
      where: { id: params?.id ?? '' },
      data: {
        deletedAt:     new Date(),
        deletedById:   sessionId,
        deletedByName: sessionName,
      },
    });

    return NextResponse.json({ success: true, softDeleted: true });
  } catch (error) {
    console.error('Reject user error:', error);
    return NextResponse.json({ error: 'Erro ao remover usuário' }, { status: 500 });
  }
}
