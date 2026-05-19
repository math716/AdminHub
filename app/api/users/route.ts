export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

export async function GET() {
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

    // ADMIN vê todos; CHEFE vê apenas o próprio gabinete
    const users = await prisma.user.findMany({
      where: userRole === 'ADMIN' ? {} : { gabineteId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        approved: true,
        permissions: true,
        createdAt: true,
        gabinete: {
          select: {
            id: true,
            nome: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(users ?? []);
  } catch (error) {
    console.error('Get users error:', error);
    return NextResponse.json({ error: 'Erro ao buscar usuários' }, { status: 500 });
  }
}
