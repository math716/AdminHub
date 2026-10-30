export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exigirAcesso } from '@/lib/acesso-api';

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  try {
    const acesso = await exigirAcesso({ papeis: ['CHEFE', 'ADMIN', 'SUPER_ADMIN', 'AGENTE_POLITICO'] });
    if (acesso instanceof NextResponse) return acesso;
    const { role: userRole, gabineteId, userId: sessionId } = acesso;
    const sessionName = acesso.session.user?.name ?? 'Administrador';

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
