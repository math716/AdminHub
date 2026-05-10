export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const gabineteId = (session.user as any)?.gabineteId;
    const contato = await prisma.contato.findUnique({ where: { id: params.id } });
    if (!contato || contato.gabineteId !== gabineteId)
      return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 });

    const body = await request.json();
    const updated = await prisma.contato.update({
      where: { id: params.id },
      data: {
        ...(body.lat  !== undefined && { lat:  body.lat }),
        ...(body.lng  !== undefined && { lng:  body.lng }),
        ...(body.nome !== undefined && { nome: body.nome }),
        ...(body.email !== undefined && { email: body.email }),
        ...(body.endereco !== undefined && { endereco: body.endereco }),
        ...(body.numero !== undefined && { numero: body.numero }),
      },
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Patch contact error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar contato' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const gabineteId = (session.user as any)?.gabineteId;

    const contato = await prisma.contato.findUnique({ where: { id: params.id } });
    if (!contato || contato.gabineteId !== gabineteId) {
      return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 });
    }

    await prisma.contato.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete contact error:', error);
    return NextResponse.json({ error: 'Erro ao deletar contato' }, { status: 500 });
  }
}
