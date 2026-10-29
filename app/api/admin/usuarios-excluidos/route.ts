export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exigirAcesso } from '@/lib/acesso-api';

export async function GET() {
  try {
    const acesso = await exigirAcesso({ papeis: ['ADMIN', 'SUPER_ADMIN'] });
    if (acesso instanceof NextResponse) return acesso;

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
