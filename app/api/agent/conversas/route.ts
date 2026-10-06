export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { enxugar, validarMensagens } from '@/lib/agent/conversa-store';
import { donoDaConversa } from '@/lib/agent/dono-conversa';

// O histórico é do gabinete — ou, para quem não tem gabinete (as contas de
// administração sem gabinete escolhido), da própria pessoa. Ver dono-conversa.

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const dono = await donoDaConversa(session);
    if (!dono) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const conversas = await prisma.gabiConversa.findMany({
      where: dono,
      select: { id: true, titulo: true, mensagens: true, criadaEm: true },
      orderBy: { criadaEm: 'desc' },
      take: 50,
    });

    return NextResponse.json(conversas);
  } catch (error) {
    console.error('GET /api/agent/conversas error:', error);
    return NextResponse.json({ error: 'Erro ao buscar histórico' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const dono = await donoDaConversa(session);
    if (!dono) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await request.json();
    const { titulo, mensagens } = body ?? {};

    if (!validarMensagens(mensagens)) {
      return NextResponse.json({ error: 'Mensagens inválidas' }, { status: 400 });
    }

    const conversa = await prisma.gabiConversa.create({
      data: {
        ...dono,
        titulo: titulo?.slice(0, 120) || null,
        mensagens: enxugar(mensagens),
      },
      select: { id: true },
    });

    return NextResponse.json(conversa, { status: 201 });
  } catch (error) {
    console.error('POST /api/agent/conversas error:', error);
    return NextResponse.json({ error: 'Erro ao salvar conversa' }, { status: 500 });
  }
}
