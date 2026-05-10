export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { sendUserApprovedEmail } from '@/lib/email';

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

    if (userRole !== 'CHEFE' && userRole !== 'ADMIN') {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    const userToApprove = await prisma.user.findUnique({
      where: { id: params?.id ?? '' }
    });

    if (!userToApprove) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // CHEFE só pode aprovar usuários do próprio gabinete; ADMIN pode aprovar qualquer um
    if (userRole === 'CHEFE' && userToApprove.gabineteId !== gabineteId) {
      return NextResponse.json({ error: 'Você só pode aprovar usuários do seu gabinete' }, { status: 403 });
    }

    const user = await prisma.user.update({
      where: { id: params?.id ?? '' },
      data: { approved: true }
    });

    // Notificar o usuário aprovado por e-mail
    const baseUrl = process.env.NEXTAUTH_URL ?? 'https://adminhub.app';
    sendUserApprovedEmail({
      userName: user.name,
      userEmail: user.email,
      loginUrl: `${baseUrl}/login`,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      user: {
        id: user?.id,
        email: user?.email,
        name: user?.name,
        approved: user?.approved
      }
    });
  } catch (error) {
    console.error('Approve user error:', error);
    return NextResponse.json({ error: 'Erro ao aprovar usuário' }, { status: 500 });
  }
}
