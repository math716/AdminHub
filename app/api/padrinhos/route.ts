export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exigirAcesso } from '@/lib/acesso-api';
import { PERMISSIONS } from '@/lib/permissions';

export async function GET(request: NextRequest) {
  try {
    const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.COLABORADORES_CAMPANHA], gabinete: 'banco' });
    if (acesso instanceof NextResponse) return acesso;
    const { gabineteId } = acesso;

    const padrinhos = await prisma.padrinho.findMany({
      where: { gabineteId },
      select: { id: true, nome: true, cargo: true, partido: true, cor: true, _count: { select: { colaboradores: true } } },
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
    const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.COLABORADORES_CAMPANHA], gabinete: 'banco' });
    if (acesso instanceof NextResponse) return acesso;
    const { gabineteId } = acesso;

    const body = await request.json();
    const { nome, cargo, partido, cor } = body ?? {};
    if (!nome?.trim()) return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });
    if (!cargo?.trim()) return NextResponse.json({ error: 'Cargo é obrigatório' }, { status: 400 });
    if (!partido?.trim()) return NextResponse.json({ error: 'Partido é obrigatório' }, { status: 400 });

    const padrinho = await prisma.padrinho.create({
      data: {
        nome: nome.trim(),
        cargo: cargo.trim(),
        partido: partido.trim(),
        cor: cor || '#8b5cf6',
        gabineteId,
      },
      select: { id: true, nome: true, cargo: true, partido: true, cor: true, _count: { select: { colaboradores: true } } },
    });

    return NextResponse.json(padrinho, { status: 201 });
  } catch (error) {
    console.error('POST /api/padrinhos error:', error);
    return NextResponse.json({ error: 'Erro ao criar padrinho' }, { status: 500 });
  }
}
