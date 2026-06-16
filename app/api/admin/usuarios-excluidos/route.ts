export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const userRole = (session.user as any)?.role;
    if (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    const users = await prisma.user.findMany({
      where: { deletedAt: { not: null } },
      select: {
        id: true, name: true, email: true, role: true,
        deletedAt: true, deletedById: true, deletedByName: true,
        gabinete: { select: { id: true, nome: true } },
      },
      orderBy: { deletedAt: 'desc' },
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error('Get deleted users error:', error);
    return NextResponse.json({ error: 'Erro ao buscar usuários excluídos' }, { status: 500 });
  }
}
