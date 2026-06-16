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
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const userRole = (session.user as any)?.role;
    if (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    const { acao } = await request.json();
    if (acao !== 'RESTAURAR' && acao !== 'EXCLUIR') {
      return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, deletedAt: true },
    });
    if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    if (!user.deletedAt) return NextResponse.json({ error: 'Usuário não está pendente de exclusão' }, { status: 400 });

    if (acao === 'RESTAURAR') {
      await prisma.user.update({
        where: { id: params.id },
        data: { deletedAt: null, deletedById: null, deletedByName: null },
      });
      return NextResponse.json({ success: true, acao: 'RESTAURAR' });
    }

    // EXCLUIR definitivamente
    await prisma.user.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true, acao: 'EXCLUIR' });
  } catch (error) {
    console.error('Acao usuario excluido error:', error);
    return NextResponse.json({ error: 'Erro ao processar ação' }, { status: 500 });
  }
}
