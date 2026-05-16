export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

const VALID_TIPO   = ['INDIVIDUAL', 'BANCADA', 'COMISSAO', 'RELATOR'];
const VALID_STATUS = ['PROPOSTA', 'EMPENHADA', 'PAGA', 'CANCELADA'];

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const gabineteId = (session.user as any)?.gabineteId as string | undefined;
    if (!gabineteId) return NextResponse.json({ error: 'Usuário sem gabinete associado' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const status    = searchParams.get('status');
    const tipo      = searchParams.get('tipo');
    const ano       = searchParams.get('ano');
    const estado    = searchParams.get('estado');
    const municipio = searchParams.get('municipio');
    const search    = searchParams.get('search');

    const where: any = { gabineteId };
    if (status && VALID_STATUS.includes(status)) where.status = status;
    if (tipo   && VALID_TIPO.includes(tipo))     where.tipo   = tipo;
    if (ano)       where.ano       = parseInt(ano);
    if (estado)    where.estado    = estado;
    if (municipio) where.municipio = { contains: municipio, mode: 'insensitive' };
    if (search) {
      where.OR = [
        { titulo:       { contains: search, mode: 'insensitive' } },
        { autor:        { contains: search, mode: 'insensitive' } },
        { beneficiario: { contains: search, mode: 'insensitive' } },
        { numero:       { contains: search, mode: 'insensitive' } },
      ];
    }

    // Listagem nao traz o campo `documento` (base64, ate 5MB cada).
    // O frontend recebe `documentoNome` (leve) e busca o conteudo sob
    // demanda em /api/emendas/[id] ao abrir o detalhe — implementado via
    // selectEmendaWithDoc na pagina mapa-demandas.
    const emendas = await prisma.emenda.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        titulo: true,
        descricao: true,
        valor: true,
        autor: true,
        numero: true,
        ano: true,
        tipo: true,
        orgaoExecutor: true,
        status: true,
        beneficiario: true,
        estado: true,
        municipio: true,
        bairro: true,
        endereco: true,
        lat: true,
        lng: true,
        documentoNome: true,
        observations: true,
        gabineteId: true,
        createdById: true,
        createdAt: true,
        updatedAt: true,
        createdBy: { select: { name: true, email: true } },
      },
    });

    return NextResponse.json(emendas ?? []);
  } catch (error) {
    console.error('GET /api/emendas error:', error);
    return NextResponse.json({ error: 'Erro ao buscar emendas' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const userId     = (session.user as any)?.id;
    const gabineteId = (session.user as any)?.gabineteId;
    if (!gabineteId) return NextResponse.json({ error: 'Usuário sem gabinete associado' }, { status: 400 });

    const body = await request.json();

    const titulo = String(body?.titulo ?? '').trim();
    if (!titulo) return NextResponse.json({ error: 'Título é obrigatório' }, { status: 400 });
    if (titulo.length > 255) return NextResponse.json({ error: 'Título deve ter no máximo 255 caracteres' }, { status: 400 });
    if ((body?.descricao ?? '').length > 5000)
      return NextResponse.json({ error: 'Descrição deve ter no máximo 5000 caracteres' }, { status: 400 });
    if ((body?.observations ?? '').length > 2000)
      return NextResponse.json({ error: 'Observações devem ter no máximo 2000 caracteres' }, { status: 400 });

    const tipo   = VALID_TIPO.includes(body?.tipo)     ? body.tipo   : 'INDIVIDUAL';
    const status = VALID_STATUS.includes(body?.status) ? body.status : 'PROPOSTA';
    const valor  = body?.valor !== undefined && body?.valor !== null && body?.valor !== ''
      ? Number(body.valor) : null;
    const ano    = body?.ano !== undefined && body?.ano !== null && body?.ano !== ''
      ? parseInt(String(body.ano)) : null;

    const emenda = await prisma.emenda.create({
      data: {
        titulo,
        descricao:     body?.descricao     ?? null,
        valor:         Number.isFinite(valor as number) ? valor : null,
        autor:         body?.autor         ?? null,
        numero:        body?.numero        ?? null,
        ano:           Number.isFinite(ano as number) ? ano : null,
        tipo,
        orgaoExecutor: body?.orgaoExecutor ?? null,
        status,
        beneficiario:  body?.beneficiario  ?? null,
        estado:        body?.estado        ?? null,
        municipio:     body?.municipio     ?? null,
        bairro:        body?.bairro        ?? null,
        endereco:      body?.endereco      ?? null,
        lat:           body?.lat           ?? null,
        lng:           body?.lng           ?? null,
        documento:     body?.documento     ?? null,
        documentoNome: body?.documentoNome ?? null,
        observations:  body?.observations  ?? null,
        gabineteId,
        createdById:   userId,
      },
    });

    return NextResponse.json(emenda, { status: 201 });
  } catch (error) {
    console.error('POST /api/emendas error:', error);
    return NextResponse.json({ error: 'Erro ao criar emenda' }, { status: 500 });
  }
}
