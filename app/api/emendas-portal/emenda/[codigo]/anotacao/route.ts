export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

export async function GET(_req: NextRequest, { params }: { params: { codigo: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const emenda = await prisma.emendaParlamentar.findUnique({
    where: { idPortal: params.codigo },
    select: { id: true },
  });
  if (!emenda) return NextResponse.json({ texto: '' });

  const anotacao = await prisma.emendaAnotacao.findUnique({
    where: { userId_emendaId: { userId: (session.user as any).id, emendaId: emenda.id } },
    select: { texto: true, updatedAt: true },
  });

  return NextResponse.json({ texto: anotacao?.texto ?? '', updatedAt: anotacao?.updatedAt ?? null });
}

export async function PUT(req: NextRequest, { params }: { params: { codigo: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

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
      where: { userId: (session.user as any).id, emendaId: emenda.id },
    });
    return NextResponse.json({ texto: '', updatedAt: null });
  }

  const result = await prisma.emendaAnotacao.upsert({
    where: { userId_emendaId: { userId: (session.user as any).id, emendaId: emenda.id } },
    create: { userId: (session.user as any).id, emendaId: emenda.id, texto },
    update: { texto },
    select: { texto: true, updatedAt: true },
  });

  return NextResponse.json(result);
}
