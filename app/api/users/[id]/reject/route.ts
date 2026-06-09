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

    const userRole = (session.user as any)?.role;
    const gabineteId = (session.user as any)?.gabineteId;
    
    if (userRole !== 'CHEFE' && userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    const userToReject = await prisma.user.findUnique({
      where: { id: params?.id ?? '' }
    });

    if (!userToReject) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    if (userRole === 'CHEFE' && userToReject.gabineteId !== gabineteId) {
      return NextResponse.json({ error: 'Você só pode rejeitar usuários do seu gabinete' }, { status: 403 });
    }

    await prisma.user.delete({
      where: { id: params?.id ?? '' }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Reject user error:', error);
    return NextResponse.json({ error: 'Erro ao rejeitar usuário' }, { status: 500 });
  }
}
