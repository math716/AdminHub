export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exigirAcesso } from '@/lib/acesso-api';

export async function GET() {
  try {
    const acesso = await exigirAcesso({ papeis: ['CHEFE', 'ADMIN', 'SUPER_ADMIN', 'AGENTE_POLITICO'] });
    if (acesso instanceof NextResponse) return acesso;
    const { role: userRole, gabineteId } = acesso;

    // Chefe/agente sem gabinete: o filtro ia com gabineteId vazio, que o Prisma
    // ignora — e a lista saía com os usuários de TODOS os gabinetes.
    if (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN' && !gabineteId) {
      return NextResponse.json({ error: 'Usuário sem gabinete associado' }, { status: 400 });
    }

    // SUPER_ADMIN e ADMIN veem todos; demais veem apenas o próprio gabinete
    // Exclui usuários com soft delete pendente
    const users = await prisma.user.findMany({
      where: (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN')
        ? { deletedAt: null }
        : { gabineteId, deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        approved: true,
        permissions: true,
        createdAt: true,
        pendingGabineteNome: true,
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
