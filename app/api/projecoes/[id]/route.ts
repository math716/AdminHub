import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { PERMISSIONS } from '@/lib/permissions';
import { exigirAcesso } from '@/lib/acesso-api';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  try {
    const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.PROJETO_CAMPANHA] });
    if (acesso instanceof NextResponse) return acesso;
    const user = { id: acesso.userId, gabineteId: acesso.gabineteId, role: acesso.role };
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
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  try {
    const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.PROJETO_CAMPANHA] });
    if (acesso instanceof NextResponse) return acesso;
    const user = { id: acesso.userId, gabineteId: acesso.gabineteId, role: acesso.role };

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
