export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exigirAcesso } from '@/lib/acesso-api';
import { PERMISSIONS } from '@/lib/permissions';

export async function GET(request: NextRequest) {
  try {
    const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.MAPA_ELEITORAL, PERMISSIONS.EMENDAS_MAPA] });
    if (acesso instanceof NextResponse) return acesso;

    const { userId } = acesso;
    if (!userId) {
      return NextResponse.json({ error: 'Usuário não identificado' }, { status: 400 });
    }

    const tipo = request.nextUrl.searchParams.get('tipo') ?? 'ELEITORAL';

    const favorites = await prisma.favorite.findMany({
      where: { userId, tipo },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(favorites ?? []);
  } catch (error) {
    console.error('Get favorites error:', error);
    return NextResponse.json({ error: 'Erro ao buscar favoritos' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.MAPA_ELEITORAL, PERMISSIONS.EMENDAS_MAPA] });
    if (acesso instanceof NextResponse) return acesso;

    const { userId } = acesso;
    if (!userId) {
      return NextResponse.json({ error: 'Usuário não identificado' }, { status: 400 });
    }

    const body = await request.json();
    const { candidateName, ano, cargo, uf, tipo } = body ?? {};

    if (!candidateName || !ano || !uf) {
      return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 });
    }

    const favorite = await prisma.favorite.create({
      data: {
        userId,
        candidateName: candidateName ?? '',
        ano: parseInt(ano) || 2022,
        cargo: cargo ?? null,
        uf: uf ?? '',
        tipo: tipo ?? 'ELEITORAL',
      }
    });

    return NextResponse.json(favorite);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'Candidato já está nos favoritos' }, { status: 400 });
    }
    console.error('Create favorite error:', error);
    return NextResponse.json({ error: 'Erro ao adicionar favorito' }, { status: 500 });
  }
}
