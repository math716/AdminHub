export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exigirAcesso } from '@/lib/acesso-api';
import { PERMISSIONS } from '@/lib/permissions';

// PUT /api/agenda/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.AGENDA], gabinete: 'sessao' });
    if (acesso instanceof NextResponse) return acesso;
    const { gabineteId } = acesso;
    const body = await request.json();

    const existing = await prisma.agendaEvent.findUnique({ where: { id: params.id } });
    if (!existing || existing.gabineteId !== gabineteId) {
      return NextResponse.json({ error: 'Evento não encontrado' }, { status: 404 });
    }

    // Só é alterado o que veio no corpo. O Prisma ignora campo com valor
    // `undefined`, então ausente = não mexe.
    //
    // Antes, estes campos usavam `?? null`: quem não os reenviasse os apagava.
    // Hoje ninguém é atingido, porque a tela da agenda manda o compromisso
    // inteiro ao salvar — mas foi assim que nasceu o defeito que apagava a foto
    // das demandas. Lá a tela também mandava tudo, até alguém otimizar a
    // listagem para não trazer a foto (coisa correta de fazer) e o `?? null`
    // virar perda de dado. Aqui fica fechado antes de acontecer.
    const veio = (campo: string) => campo in (body ?? {});
    const dataOuNulo = (v: unknown) => (v ? new Date(v as string) : null);

    const event = await prisma.agendaEvent.update({
      where: { id: params.id },
      data: {
        titulo:    body.titulo ?? existing.titulo,
        data:      body.data ? new Date(body.data) : existing.data,
        tipo:      body.tipo ?? existing.tipo,
        descricao: veio('descricao') ? (body.descricao ?? null) : undefined,
        dataFim:   veio('dataFim')   ? dataOuNulo(body.dataFim)  : undefined,
        local:     veio('local')     ? (body.local ?? null)      : undefined,
        endereco:  veio('endereco')  ? (body.endereco ?? null)   : undefined,
        lat:       veio('lat')       ? (body.lat ?? null)        : undefined,
        lng:       veio('lng')       ? (body.lng ?? null)        : undefined,
        cor:       veio('cor')       ? (body.cor ?? null)        : undefined,
      },
    });

    return NextResponse.json(event);
  } catch (error) {
    console.error('PUT /api/agenda/[id] error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar evento' }, { status: 500 });
  }
}

// DELETE /api/agenda/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.AGENDA], gabinete: 'sessao' });
    if (acesso instanceof NextResponse) return acesso;
    const { gabineteId } = acesso;

    const existing = await prisma.agendaEvent.findUnique({ where: { id: params.id } });
    if (!existing || existing.gabineteId !== gabineteId) {
      return NextResponse.json({ error: 'Evento não encontrado' }, { status: 404 });
    }

    await prisma.agendaEvent.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/agenda/[id] error:', error);
    return NextResponse.json({ error: 'Erro ao excluir evento' }, { status: 500 });
  }
}
