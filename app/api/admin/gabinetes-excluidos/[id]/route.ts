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

    const body = await request.json().catch(() => ({}));
    const { acao } = body as { acao?: string };

    const gabinete = await prisma.gabinete.findUnique({ where: { id: params.id } });
    if (!gabinete) return NextResponse.json({ error: 'Gabinete não encontrado' }, { status: 404 });
    if (!gabinete.deletedAt) return NextResponse.json({ error: 'Gabinete não está na lixeira' }, { status: 409 });

    if (acao === 'RESTAURAR') {
      await prisma.gabinete.update({
        where: { id: params.id },
        data: { deletedAt: null, deletedById: null, deletedByName: null },
      });
      return NextResponse.json({ success: true });
    }

    if (acao === 'EXCLUIR') {
      await prisma.gabinete.delete({ where: { id: params.id } });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Ação inválida. Use RESTAURAR ou EXCLUIR.' }, { status: 400 });
  } catch (error) {
    console.error('Gabinetes excluidos POST error:', error);
    return NextResponse.json({ error: 'Erro ao processar ação' }, { status: 500 });
  }
}
