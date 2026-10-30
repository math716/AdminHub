export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exigirAcesso } from '@/lib/acesso-api';
import { z } from 'zod';
import { lerCorpo, v } from '@/lib/validacao-api';
import { PERMISSIONS } from '@/lib/permissions';

const EdicaoPadrinho = z.object({
  nome:    v.texto('o nome', 200).optional(),
  cargo:   v.texto('o cargo', 200).optional(),
  partido: v.texto('o partido', 100).optional(),
  cor:     v.textoOpcional('a cor', 30),
}).passthrough();

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  try {
    const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.COLABORADORES_CAMPANHA], gabinete: 'banco' });
    if (acesso instanceof NextResponse) return acesso;
    const { gabineteId } = acesso;

    const existing = await prisma.padrinho.findFirst({
      where: { id: params.id, gabineteId },
    });
    if (!existing) return NextResponse.json({ error: 'Padrinho não encontrado' }, { status: 404 });

    // Desvincula colaboradores antes de deletar
    await prisma.colaborador.updateMany({
      where: { padrinhoId: params.id },
      data: { padrinhoId: null },
    });

    await prisma.padrinho.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/padrinhos/[id] error:', error);
    return NextResponse.json({ error: 'Erro ao deletar padrinho' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  try {
    const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.COLABORADORES_CAMPANHA], gabinete: 'banco' });
    if (acesso instanceof NextResponse) return acesso;
    const { gabineteId } = acesso;

    const existing = await prisma.padrinho.findFirst({
      where: { id: params.id, gabineteId },
    });
    if (!existing) return NextResponse.json({ error: 'Padrinho não encontrado' }, { status: 404 });

    const body = await lerCorpo(request, EdicaoPadrinho);
    if (body instanceof NextResponse) return body;
    const { nome, cargo, partido, cor } = body ?? {};
    if (!nome?.trim()) return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });

    const updated = await prisma.padrinho.update({
      where: { id: params.id },
      data: {
        ...(nome !== undefined && { nome: nome.trim() }),
        ...(cargo !== undefined && { cargo: cargo.trim() }),
        ...(partido !== undefined && { partido: partido.trim() }),
        ...(cor !== undefined && { cor: cor || '#8b5cf6' }),
      },
      select: { id: true, nome: true, cargo: true, partido: true, cor: true, _count: { select: { colaboradores: true } } },
    });

    // Propaga nova cor para todos os apadrinhados
    if (cor !== undefined) {
      await prisma.colaborador.updateMany({
        where: { padrinhoId: params.id },
        data: { cor: cor || '#8b5cf6' },
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('PATCH /api/padrinhos/[id] error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar padrinho' }, { status: 500 });
  }
}
