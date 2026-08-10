export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

async function getGabineteId(session: any): Promise<string | null> {
  const userId = (session.user as any)?.id;
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { gabineteId: true } });
  return user?.gabineteId ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const gabineteId = await getGabineteId(session);
    if (!gabineteId) return NextResponse.json({ error: 'Gabinete não encontrado' }, { status: 400 });

    const padrinhos = await prisma.padrinho.findMany({
      where: { gabineteId },
      select: { id: true, nome: true, cargo: true, partido: true, _count: { select: { colaboradores: true } } },
      orderBy: { nome: 'asc' },
    });

    return NextResponse.json(padrinhos);
  } catch (error) {
    console.error('GET /api/padrinhos error:', error);
    return NextResponse.json({ error: 'Erro ao buscar padrinhos' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const gabineteId = await getGabineteId(session);
    if (!gabineteId) return NextResponse.json({ error: 'Gabinete não encontrado' }, { status: 400 });

    const body = await request.json();
    const { nome, cargo, partido } = body ?? {};
    if (!nome?.trim()) return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });
    if (!cargo?.trim()) return NextResponse.json({ error: 'Cargo é obrigatório' }, { status: 400 });
    if (!partido?.trim()) return NextResponse.json({ error: 'Partido é obrigatório' }, { status: 400 });

    const padrinho = await prisma.padrinho.create({
      data: {
        nome: nome.trim(),
        cargo: cargo.trim(),
        partido: partido.trim(),
        gabineteId,
      },
      select: { id: true, nome: true, cargo: true, partido: true, _count: { select: { colaboradores: true } } },
    });

    return NextResponse.json(padrinho, { status: 201 });
  } catch (error) {
    console.error('POST /api/padrinhos error:', error);
    return NextResponse.json({ error: 'Erro ao criar padrinho' }, { status: 500 });
  }
}
