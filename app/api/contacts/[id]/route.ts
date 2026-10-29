export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exigirAcesso } from '@/lib/acesso-api';
import { PERMISSIONS } from '@/lib/permissions';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.CONTATOS], gabinete: 'sessao' });
    if (acesso instanceof NextResponse) return acesso;
    const { gabineteId } = acesso;
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
    const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.CONTATOS], gabinete: 'sessao' });
    if (acesso instanceof NextResponse) return acesso;
    const { gabineteId } = acesso;

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
