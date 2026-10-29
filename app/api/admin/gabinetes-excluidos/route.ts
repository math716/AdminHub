export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exigirAcesso } from '@/lib/acesso-api';

export async function GET() {
  try {
    const acesso = await exigirAcesso({ papeis: ['ADMIN', 'SUPER_ADMIN'] });
    if (acesso instanceof NextResponse) return acesso;

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
