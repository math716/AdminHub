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

    // Auto-cleanup: exclui permanentemente gabinetes com mais de 90 dias na lixeira
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    await prisma.gabinete.deleteMany({
      where: { deletedAt: { not: null, lt: cutoff } },
    });

    const gabinetes = await prisma.gabinete.findMany({
      where: { deletedAt: { not: null } },
      select: {
        id:            true,
        nome:          true,
        deletedAt:     true,
        deletedByName: true,
        _count: { select: { users: true, demands: true, contatos: true } },
      },
      orderBy: { deletedAt: 'desc' },
    });

    return NextResponse.json(gabinetes);
  } catch (error) {
    console.error('Gabinetes excluidos GET error:', error);
    return NextResponse.json({ error: 'Erro ao buscar gabinetes excluídos' }, { status: 500 });
  }
}
