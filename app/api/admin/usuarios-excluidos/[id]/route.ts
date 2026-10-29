export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exigirAcesso } from '@/lib/acesso-api';
import { z } from 'zod';
import { lerCorpo, v } from '@/lib/validacao-api';

const Acao = z.object({ acao: v.textoOpcional('a ação', 20) }).passthrough();

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const acesso = await exigirAcesso({ papeis: ['ADMIN', 'SUPER_ADMIN'] });
    if (acesso instanceof NextResponse) return acesso;

    const body = await lerCorpo(request, Acao);
    if (body instanceof NextResponse) return body;
    const { acao } = body;
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
