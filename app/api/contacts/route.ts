export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const gabineteId = (session.user as any)?.gabineteId;
    if (!gabineteId) {
      return NextResponse.json({ error: 'Usuário sem gabinete associado' }, { status: 400 });
    }

    const contatos = await prisma.contato.findMany({
      where: { gabineteId },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { name: true } } },
    });

    return NextResponse.json(contatos ?? []);
  } catch (error) {
    console.error('Get contacts error:', error);
    return NextResponse.json({ error: 'Erro ao buscar contatos' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const userId = (session.user as any)?.id;
    const gabineteId = (session.user as any)?.gabineteId;

    if (!gabineteId) {
      return NextResponse.json({ error: 'Usuário sem gabinete associado' }, { status: 400 });
    }

    const body = await request.json();

    if (!body?.nome || !body?.numero) {
      return NextResponse.json({ error: 'Nome e número são obrigatórios' }, { status: 400 });
    }

    const contato = await prisma.contato.create({
      data: {
        nome: body.nome,
        numero: body.numero,
        email: body.email ?? null,
        endereco: body.endereco ?? null,
        lat: body.lat ?? null,
        lng: body.lng ?? null,
        gabineteId,
        createdById: userId,
      },
    });

    return NextResponse.json(contato);
  } catch (error) {
    console.error('Create contact error:', error);
    return NextResponse.json({ error: 'Erro ao criar contato' }, { status: 500 });
  }
}
