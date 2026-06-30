import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const user = session.user as any;
    const projecao = await prisma.projecaoCampanha.findUnique({
      where: { id: params.id },
      include: { municipios: true }
    });

    if (!projecao || projecao.userId !== user.id) {
      return NextResponse.json({ error: 'Projeção não encontrada' }, { status: 404 });
    }

    return NextResponse.json(projecao);
  } catch (error) {
    console.error('Erro ao buscar projeção:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const user = session.user as any;
    if (!hasPermission(user, PERMISSIONS.PROJETO_CAMPANHA)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const projecao = await prisma.projecaoCampanha.findUnique({
      where: { id: params.id },
      include: { user: { select: { gabineteId: true } } }
    });

    const pertenceAoGabinete = user.gabineteId
      ? projecao?.user?.gabineteId === user.gabineteId
      : projecao?.userId === user.id;

    if (!projecao || !pertenceAoGabinete) {
      return NextResponse.json({ error: 'Projeção não encontrada' }, { status: 404 });
    }

    await prisma.projecaoCampanha.delete({
      where: { id: params.id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao excluir projeção:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
