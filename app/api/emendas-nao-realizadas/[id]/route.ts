export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

async function getGabineteId(session: any): Promise<string | null> {
  const userId = session?.user?.id as string | undefined;
  if (!userId) return null;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { gabineteId: true } });
  return u?.gabineteId ?? null;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const gabineteId = await getGabineteId(session);
  if (!gabineteId) return NextResponse.json({ error: 'Sem gabinete' }, { status: 403 });

  const existing = await prisma.emendaNaoRealizada.findFirst({
    where: { id: params.id, gabineteId },
  });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const body = await req.json();
  const { numero, tipo, area, favorecido, municipio, uf, valor } = body;

  if (!favorecido?.trim()) {
    return NextResponse.json({ error: 'Favorecido é obrigatório' }, { status: 400 });
  }

  const updated = await prisma.emendaNaoRealizada.update({
    where: { id: params.id },
    data: {
      numero: numero?.trim() || null,
      tipo: tipo?.trim() || null,
      area: area?.trim() || null,
      favorecido: favorecido.trim(),
      municipio: municipio?.trim() || null,
      uf: uf?.trim()?.toUpperCase() || null,
      valor: Number(valor) || 0,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const gabineteId = await getGabineteId(session);
  if (!gabineteId) return NextResponse.json({ error: 'Sem gabinete' }, { status: 403 });

  const existing = await prisma.emendaNaoRealizada.findFirst({
    where: { id: params.id, gabineteId },
  });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  await prisma.emendaNaoRealizada.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
