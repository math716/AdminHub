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

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const gabineteId = await getGabineteId(session);
  if (!gabineteId) return NextResponse.json([]);

  const ano = Number(req.nextUrl.searchParams.get('ano') ?? new Date().getFullYear());
  const parlamentarId = req.nextUrl.searchParams.get('parlamentarId') ?? '';

  if (!parlamentarId) return NextResponse.json([]);

  const [items, impedidas] = await Promise.all([
    prisma.emendaNaoRealizada.findMany({
      where: { gabineteId, parlamentarId, ano },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.emendaParlamentar.findMany({
      where: {
        parlamentarId,
        ano,
        estagio: { contains: 'impedi', mode: 'insensitive' },
      },
      select: {
        idPortal: true, parlamentarId: true, ano: true,
        numero: true, tipo: true, area: true,
        beneficiario: true, municipioNome: true, uf: true,
        valorEmpenhado: true, estagio: true, fetchedAt: true,
      },
    }),
  ]);

  const portalItems = impedidas.map((e) => ({
    id: e.idPortal,
    parlamentarId: e.parlamentarId ?? parlamentarId,
    ano: e.ano,
    numero: e.numero,
    tipo: e.tipo,
    area: e.area,
    favorecido: e.beneficiario ?? e.municipioNome ?? '—',
    municipio: e.municipioNome,
    uf: e.uf,
    valor: e.valorEmpenhado,
    estagio: e.estagio,
    createdAt: e.fetchedAt.toISOString(),
    deletavel: false as const,
  }));

  return NextResponse.json([
    ...items.map((i) => ({ ...i, deletavel: true as const })),
    ...portalItems,
  ]);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const gabineteId = await getGabineteId(session);
  if (!gabineteId) return NextResponse.json({ error: 'Sem gabinete' }, { status: 403 });

  const body = await req.json();
  const { ano, parlamentarId, numero, tipo, area, favorecido, municipio, uf, valor } = body;

  if (!favorecido?.trim()) {
    return NextResponse.json({ error: 'Favorecido é obrigatório' }, { status: 400 });
  }
  if (!parlamentarId?.trim()) {
    return NextResponse.json({ error: 'Parlamentar não identificado' }, { status: 400 });
  }

  const item = await prisma.emendaNaoRealizada.create({
    data: {
      gabineteId,
      parlamentarId: parlamentarId.trim(),
      ano: Number(ano) || new Date().getFullYear(),
      numero: numero?.trim() || null,
      tipo: tipo?.trim() || null,
      area: area?.trim() || null,
      favorecido: favorecido.trim(),
      municipio: municipio?.trim() || null,
      uf: uf?.trim()?.toUpperCase() || null,
      valor: Number(valor) || 0,
    },
  });

  return NextResponse.json(item, { status: 201 });
}
