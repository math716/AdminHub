export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { derivarZonasDeRas } from '@/lib/colaboradores-zonas';

const SELECT = {
  id: true, nome: true, telefone: true, email: true,
  endereco: true, lat: true, lng: true, funcao: true,
  observacao: true, status: true, cor: true, padrinhoId: true,
  padrinho: { select: { id: true, nome: true, cargo: true, partido: true } },
  regioes: { select: { id: true, regiaoNome: true, uf: true, tipo: true } },
  createdAt: true,
} as const;

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

    const colaboradores = await prisma.colaborador.findMany({
      where: { gabineteId },
      select: SELECT,
      orderBy: { nome: 'asc' },
    });

    return NextResponse.json(colaboradores);
  } catch (error) {
    console.error('GET /api/colaboradores error:', error);
    return NextResponse.json({ error: 'Erro ao buscar colaboradores' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const userId = (session.user as any)?.id;
    const gabineteId = await getGabineteId(session);
    if (!gabineteId || !userId) return NextResponse.json({ error: 'Gabinete não encontrado' }, { status: 400 });

    const body = await request.json();
    const { nome, telefone, email, endereco, lat, lng, funcao, padrinhoId, observacao, status, cor, regioes, zonas } = body ?? {};

    if (!nome?.trim()) return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });

    const raNames: string[] = Array.isArray(regioes) ? regioes : [];
    const raItems = raNames.map((r: string) => ({ uf: 'DF', regiaoNome: r, tipo: 'RA' }));
    const zonaItemsManual = Array.isArray(zonas) ? zonas.map((z: string) => ({ uf: 'DF', regiaoNome: `Zona ${z}`, tipo: 'ZONA' })) : [];
    const zonaItemsAuto = derivarZonasDeRas(raNames);
    // Merge manual zones + auto-derived zones, deduplicate by name
    const allZonas = [...zonaItemsManual, ...zonaItemsAuto].filter(
      (z, i, arr) => arr.findIndex(x => x.regiaoNome === z.regiaoNome) === i
    );
    const allRegioes = [...raItems, ...allZonas];

    const colaborador = await prisma.colaborador.create({
      data: {
        nome: nome.trim(),
        telefone: telefone?.trim() || null,
        email: email?.trim() || null,
        endereco: endereco?.trim() || null,
        lat: lat ?? null,
        lng: lng ?? null,
        funcao: funcao?.trim() || null,
        observacao: observacao?.trim() || null,
        status: status === 'INATIVO' ? 'INATIVO' : 'ATIVO',
        cor: cor || '#8b5cf6',
        padrinhoId: padrinhoId || null,
        gabineteId,
        createdById: userId,
        regioes: allRegioes.length > 0 ? { create: allRegioes } : undefined,
      },
      select: SELECT,
    });

    return NextResponse.json(colaborador, { status: 201 });
  } catch (error) {
    console.error('POST /api/colaboradores error:', error);
    return NextResponse.json({ error: 'Erro ao criar colaborador' }, { status: 500 });
  }
}
