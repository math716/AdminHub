export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { sendUserApprovedEmail } from '@/lib/email';
import { ALL_PERMISSIONS, hasFullAccess } from '@/lib/permissions';

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

    if (userRole !== 'CHEFE' && userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN' && userRole !== 'AGENTE_POLITICO') {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    const userToApprove = await prisma.user.findUnique({
      where: { id: params?.id ?? '' }
    });

    if (!userToApprove) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // CHEFE e AGENTE_POLITICO só podem aprovar usuários do próprio gabinete
    if ((userRole === 'CHEFE' || userRole === 'AGENTE_POLITICO') && userToApprove.gabineteId !== gabineteId) {
      return NextResponse.json({ error: 'Você só pode aprovar usuários do seu gabinete' }, { status: 403 });
    }

    // Permissões opcionais no body. Para ADMIN/AGENTE_POLITICO o array é ignorado
    // porque acesso total já é resolvido em tempo de execução (hasPermission).
    let permissions: string[] | undefined;
    try {
      const body = await request.json().catch(() => null);
      const raw = body?.permissions;
      if (Array.isArray(raw)) {
        const invalid = raw.filter((p: string) => !ALL_PERMISSIONS.includes(p as any));
        if (invalid.length > 0) {
          return NextResponse.json({ error: `Permissões inválidas: ${invalid.join(', ')}` }, { status: 400 });
        }
        permissions = Array.from(new Set(raw));
      }
    } catch {
      // sem body — segue sem mexer em permissions
    }

    const updateData: { approved: boolean; permissions?: string[]; gabineteId?: string; pendingGabineteNome?: null } = { approved: true };
    if (permissions !== undefined && !hasFullAccess(userToApprove.role)) {
      updateData.permissions = permissions;
    }

    // Se o usuário tem um gabinete pendente de criação, criar agora
    if (userToApprove.pendingGabineteNome) {
      const nomeGab = userToApprove.pendingGabineteNome;

      // Verifica se já não foi criado por outra aprovação simultânea
      let gabinete = await prisma.gabinete.findUnique({ where: { nome: nomeGab } });
      if (!gabinete) {
        gabinete = await prisma.gabinete.create({ data: { nome: nomeGab } });
      }

      updateData.gabineteId = gabinete.id;
      updateData.pendingGabineteNome = null; // limpa o campo pendente
    }

    const user = await prisma.user.update({
      where: { id: params?.id ?? '' },
      data: updateData,
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
