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
