export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const userRole = (session.user as any)?.role;
    const sessionUserId = (session.user as any)?.id;

    if (userRole !== 'ADMIN') {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    if (params.id === sessionUserId) {
      return NextResponse.json({ error: 'Você não pode alterar o próprio perfil' }, { status: 400 });
    }

    const body = await request.json();
    const { role } = body;

    const allowed = ['ADMIN', 'CHEFE', 'ASSESSOR'];
    if (!allowed.includes(role)) {
      return NextResponse.json({ error: 'Role inválido' }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: params.id },
      data: { role },
      select: { id: true, name: true, email: true, role: true, approved: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Patch user error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar usuário' }, { status: 500 });
  }
}
