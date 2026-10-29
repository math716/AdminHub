export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exigirAcesso } from '@/lib/acesso-api';
import { PERMISSIONS } from '@/lib/permissions';

export async function GET(_req: NextRequest, { params }: { params: { codigo: string } }) {
  const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.EMENDAS_MAPA] });
  if (acesso instanceof NextResponse) return acesso;

  const emenda = await prisma.emendaParlamentar.findUnique({
    where: { idPortal: params.codigo },
    select: { id: true },
  });
  if (!emenda) return NextResponse.json({ texto: '' });

  const anotacao = await prisma.emendaAnotacao.findUnique({
    where: { userId_emendaId: { userId: acesso.userId, emendaId: emenda.id } },
    select: { texto: true, updatedAt: true },
  });

  return NextResponse.json({ texto: anotacao?.texto ?? '', updatedAt: anotacao?.updatedAt ?? null });
}

export async function PUT(req: NextRequest, { params }: { params: { codigo: string } }) {
  const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.EMENDAS_MAPA] });
  if (acesso instanceof NextResponse) return acesso;

  const { texto } = await req.json();
  if (typeof texto !== 'string') {
    return NextResponse.json({ error: 'texto inválido' }, { status: 400 });
  }

  const emenda = await prisma.emendaParlamentar.findUnique({
    where: { idPortal: params.codigo },
    select: { id: true },
  });
  if (!emenda) return NextResponse.json({ error: 'Emenda não encontrada' }, { status: 404 });

  if (texto.trim() === '') {
    await prisma.emendaAnotacao.deleteMany({
      where: { userId: acesso.userId, emendaId: emenda.id },
    });
    return NextResponse.json({ texto: '', updatedAt: null });
  }

  const result = await prisma.emendaAnotacao.upsert({
    where: { userId_emendaId: { userId: acesso.userId, emendaId: emenda.id } },
    create: { userId: acesso.userId, emendaId: emenda.id, texto },
    update: { texto },
    select: { texto: true, updatedAt: true },
  });

  return NextResponse.json(result);
}
