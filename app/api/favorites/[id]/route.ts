export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { semPermissao } from '@/lib/acesso-api';
import { PERMISSIONS } from '@/lib/permissions';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    const negado = semPermissao(session, PERMISSIONS.MAPA_ELEITORAL, PERMISSIONS.EMENDAS_MAPA);
    if (negado) return negado;

    const userId = (session.user as any)?.id;
    const favorite = await prisma.favorite.findFirst({
      where: {
        id: params?.id ?? '',
        userId
      }
    });

    if (!favorite) {
      return NextResponse.json({ error: 'Favorito não encontrado' }, { status: 404 });
    }

    await prisma.favorite.delete({
      where: { id: params?.id ?? '' }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete favorite error:', error);
    return NextResponse.json({ error: 'Erro ao remover favorito' }, { status: 500 });
  }
}
