export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

const SELECT = {
  id: true, nome: true, telefone: true, email: true,
  endereco: true, lat: true, lng: true, funcao: true,
  observacao: true, status: true, padrinhoId: true,
  padrinho: { select: { id: true, nome: true } },
  apadrinhados: { select: { id: true, nome: true } },
  regioes: { select: { id: true, regiaoNome: true, uf: true, tipo: true } },
  createdAt: true,
} as const;

async function getGabineteId(session: any): Promise<string | null> {
  const userId = (session.user as any)?.id;
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { gabineteId: true } });
  return user?.gabineteId ?? null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const gabineteId = await getGabineteId(session);
    if (!gabineteId) return NextResponse.json({ error: 'Gabinete não encontrado' }, { status: 400 });

    const existing = await prisma.colaborador.findFirst({
      where: { id: params.id, gabineteId },
    });
    if (!existing) return NextResponse.json({ error: 'Colaborador não encontrado' }, { status: 404 });

    const body = await request.json();
    const { nome, telefone, email, endereco, lat, lng, funcao, padrinhoId, observacao, status, regioes, zonas } = body ?? {};

    const hasRegioesUpdate = Array.isArray(regioes) || Array.isArray(zonas);
    const raItems = Array.isArray(regioes) ? regioes.map((r: string) => ({ uf: 'DF', regiaoNome: r, tipo: 'RA' })) : [];
    const zonaItems = Array.isArray(zonas) ? zonas.map((z: string) => ({ uf: 'DF', regiaoNome: `Zona ${z}`, tipo: 'ZONA' })) : [];
    const allRegioes = [...raItems, ...zonaItems];

    const colaborador = await prisma.$transaction(async (tx) => {
      // Atualiza as regiões: delete todas e recria
      if (hasRegioesUpdate) {
        await tx.colaboradorRegiao.deleteMany({ where: { colaboradorId: params.id } });
      }

      return tx.colaborador.update({
        where: { id: params.id },
        data: {
          ...(nome !== undefined && { nome: nome.trim() }),
          ...(telefone !== undefined && { telefone: telefone?.trim() || null }),
          ...(email !== undefined && { email: email?.trim() || null }),
          ...(endereco !== undefined && { endereco: endereco?.trim() || null }),
          ...(lat !== undefined && { lat }),
          ...(lng !== undefined && { lng }),
          ...(funcao !== undefined && { funcao: funcao?.trim() || null }),
          ...(observacao !== undefined && { observacao: observacao?.trim() || null }),
          ...(status !== undefined && { status: status === 'INATIVO' ? 'INATIVO' : 'ATIVO' }),
          ...(padrinhoId !== undefined && { padrinhoId: padrinhoId || null }),
          ...(hasRegioesUpdate && allRegioes.length > 0 && {
            regioes: { create: allRegioes },
          }),
        },
        select: SELECT,
      });
    });

    return NextResponse.json(colaborador);
  } catch (error) {
    console.error('PATCH /api/colaboradores/[id] error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar colaborador' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const gabineteId = await getGabineteId(session);
    if (!gabineteId) return NextResponse.json({ error: 'Gabinete não encontrado' }, { status: 400 });

    const existing = await prisma.colaborador.findFirst({
      where: { id: params.id, gabineteId },
    });
    if (!existing) return NextResponse.json({ error: 'Colaborador não encontrado' }, { status: 404 });

    await prisma.colaborador.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/colaboradores/[id] error:', error);
    return NextResponse.json({ error: 'Erro ao deletar colaborador' }, { status: 500 });
  }
}
