export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exigirAcesso } from '@/lib/acesso-api';
import { PERMISSIONS } from '@/lib/permissions';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.MAPA_ELEITORAL, PERMISSIONS.EMENDAS_MAPA] });
    if (acesso instanceof NextResponse) return acesso;

    const { userId } = acesso;
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
