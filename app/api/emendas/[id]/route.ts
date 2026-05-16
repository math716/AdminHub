export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

const VALID_TIPO   = ['INDIVIDUAL', 'BANCADA', 'COMISSAO', 'RELATOR'];
const VALID_STATUS = ['PROPOSTA', 'EMPENHADA', 'PAGA', 'CANCELADA'];

async function getSessionAndGabinete(extraRoles?: string[]) {
  const session = await getServerSession(authOptions);
  if (!session) return { error: 'Não autorizado', status: 401 } as const;
  const user = session.user as any;
  const gabineteId = user?.gabineteId as string | undefined;
  if (!gabineteId) return { error: 'Usuário sem gabinete associado', status: 403 } as const;
  if (extraRoles && !extraRoles.includes(user?.role)) {
    return { error: 'Sem permissão', status: 403 } as const;
  }
  return { user, gabineteId };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getSessionAndGabinete();
    if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const emenda = await prisma.emenda.findUnique({
      where: { id: params?.id ?? '' },
      include: { createdBy: { select: { name: true, email: true } } },
    });

    if (!emenda || emenda.gabineteId !== ctx.gabineteId) {
      return NextResponse.json({ error: 'Emenda não encontrada' }, { status: 404 });
    }

    return NextResponse.json(emenda, {
      headers: { 'Cache-Control': 'private, max-age=60, must-revalidate' },
    });
  } catch (error) {
    console.error('GET /api/emendas/[id] error:', error);
    return NextResponse.json({ error: 'Erro ao buscar emenda' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getSessionAndGabinete();
    if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const existing = await prisma.emenda.findUnique({ where: { id: params?.id ?? '' } });
    if (!existing || existing.gabineteId !== ctx.gabineteId) {
      return NextResponse.json({ error: 'Emenda não encontrada' }, { status: 404 });
    }

    if (ctx.user?.role === 'ASSESSOR' && existing.createdById !== ctx.user?.id) {
      return NextResponse.json({ error: 'Sem permissão para editar esta emenda' }, { status: 403 });
    }

    const body = await request.json();

    if (body?.titulo !== undefined && String(body.titulo).trim().length === 0)
      return NextResponse.json({ error: 'Título não pode ser vazio' }, { status: 400 });
    if (body?.titulo !== undefined && String(body.titulo).length > 255)
      return NextResponse.json({ error: 'Título deve ter no máximo 255 caracteres' }, { status: 400 });
    if ((body?.descricao ?? '').length > 5000)
      return NextResponse.json({ error: 'Descrição deve ter no máximo 5000 caracteres' }, { status: 400 });
    if ((body?.observations ?? '').length > 2000)
      return NextResponse.json({ error: 'Observações devem ter no máximo 2000 caracteres' }, { status: 400 });

    const valor = body?.valor !== undefined && body?.valor !== null && body?.valor !== ''
      ? Number(body.valor) : null;
    const ano = body?.ano !== undefined && body?.ano !== null && body?.ano !== ''
      ? parseInt(String(body.ano)) : null;

    const updateData: any = {
      titulo:        body?.titulo,
      descricao:     body?.descricao     ?? null,
      valor:         Number.isFinite(valor as number) ? valor : null,
      autor:         body?.autor         ?? null,
      numero:        body?.numero        ?? null,
      ano:           Number.isFinite(ano as number) ? ano : null,
      orgaoExecutor: body?.orgaoExecutor ?? null,
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
    };
    if (body?.tipo   && VALID_TIPO.includes(body.tipo))     updateData.tipo   = body.tipo;
    if (body?.status && VALID_STATUS.includes(body.status)) updateData.status = body.status;

    const emenda = await prisma.emenda.update({
      where: { id: params?.id ?? '' },
      data: updateData,
    });

    return NextResponse.json(emenda);
  } catch (error) {
    console.error('PUT /api/emendas/[id] error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar emenda' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getSessionAndGabinete(['CHEFE', 'ADMIN']);
    if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const existing = await prisma.emenda.findUnique({ where: { id: params?.id ?? '' } });
    if (!existing || existing.gabineteId !== ctx.gabineteId) {
      return NextResponse.json({ error: 'Emenda não encontrada' }, { status: 404 });
    }

    await prisma.emenda.delete({ where: { id: params?.id ?? '' } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/emendas/[id] error:', error);
    return NextResponse.json({ error: 'Erro ao excluir emenda' }, { status: 500 });
  }
}
