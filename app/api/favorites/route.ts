export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exigirAcesso } from '@/lib/acesso-api';
import { z } from 'zod';
import { lerCorpo, v } from '@/lib/validacao-api';
import { PERMISSIONS } from '@/lib/permissions';

const NovoFavorito = z.object({
  candidateName: v.textoOpcional('o candidato', 300),
  ano:           v.numeroOuTexto('o ano'),
  cargo:         v.textoOpcional('o cargo', 100),
  uf:            v.textoOpcional('a UF', 2),
  tipo:          v.textoOpcional('o tipo', 40),
}).passthrough();

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

    const body = await lerCorpo(request, NovoFavorito);
    if (body instanceof NextResponse) return body;
    const { candidateName, ano, cargo, uf, tipo } = body ?? {};

    if (!candidateName || !ano || !uf) {
      return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 });
    }

    const favorite = await prisma.favorite.create({
      data: {
        userId,
        candidateName: candidateName ?? '',
        ano: parseInt(String(ano)) || 2022,
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
