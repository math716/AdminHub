export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

const VALID_STATUS   = ['PENDENTE', 'EM_ANDAMENTO', 'RESOLVIDA', 'CANCELADA'];
const VALID_CATEGORY = ['SAUDE', 'EDUCACAO', 'INFRAESTRUTURA', 'SEGURANCA', 'ASSISTENCIA_SOCIAL', 'MEIO_AMBIENTE', 'CULTURA', 'ESPORTE', 'HABITACAO', 'TRANSPORTE', 'OUTROS'];
const VALID_PRIORITY = ['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'];

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

    const demand = await prisma.demand.findUnique({
      where: { id: params?.id ?? '' },
      include: { createdBy: { select: { name: true, email: true } } }
    });

    if (!demand || demand.gabineteId !== ctx.gabineteId) {
      return NextResponse.json({ error: 'Demanda não encontrada' }, { status: 404 });
    }

    // Cache no browser (private = nao cacheia em CDN, ja que e dado autenticado).
    // 60s e curto o suficiente para edicoes refletirem rapido, e longo o suficiente
    // para que clicar varias vezes no mesmo pin nao re-baixe a foto base64.
    return NextResponse.json(demand, {
      headers: { 'Cache-Control': 'private, max-age=60, must-revalidate' },
    });
  } catch (error) {
    console.error('Get demand error:', error);
    return NextResponse.json({ error: 'Erro ao buscar demanda' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getSessionAndGabinete();
    if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    // Verifica posse antes de atualizar
    const existing = await prisma.demand.findUnique({ where: { id: params?.id ?? '' } });
    if (!existing || existing.gabineteId !== ctx.gabineteId) {
      return NextResponse.json({ error: 'Demanda não encontrada' }, { status: 404 });
    }

    // ASSESSOR só pode editar demandas que ele mesmo criou
    if (ctx.user?.role === 'ASSESSOR' && existing.createdById !== ctx.user?.id) {
      return NextResponse.json({ error: 'Sem permissão para editar esta demanda' }, { status: 403 });
    }

    const body = await request.json();

    if (body?.title !== undefined && String(body.title).trim().length === 0)
      return NextResponse.json({ error: 'Título não pode ser vazio' }, { status: 400 });
    if (body?.title !== undefined && String(body.title).length > 255)
      return NextResponse.json({ error: 'Título deve ter no máximo 255 caracteres' }, { status: 400 });
    if ((body?.description ?? '').length > 5000)
      return NextResponse.json({ error: 'Descrição deve ter no máximo 5000 caracteres' }, { status: 400 });
    if ((body?.observations ?? '').length > 2000)
      return NextResponse.json({ error: 'Observações devem ter no máximo 2000 caracteres' }, { status: 400 });

    const MAX_FOTO_BYTES = 7 * 1024 * 1024;
    if (typeof body?.foto === 'string' && body.foto.length > MAX_FOTO_BYTES) {
      return NextResponse.json({ error: 'Foto muito grande (limite 5MB)' }, { status: 413 });
    }

    const updateData: any = {
      title:        body?.title,
      description:  body?.description,
      solicitante:  body?.solicitante,
      contato:      body?.contato,
      estado:       body?.estado,
      municipio:    body?.municipio,
      bairro:       body?.bairro,
      endereco:     body?.endereco     ?? null,
      lat:          body?.lat          ?? null,
      lng:          body?.lng          ?? null,
      foto:         body?.foto         ?? null,
      observations: body?.observations
    };

    // Validar enums antes de atualizar
    if (body?.category && VALID_CATEGORY.includes(body.category)) updateData.category = body.category;
    if (body?.priority && VALID_PRIORITY.includes(body.priority)) updateData.priority = body.priority;
    if (body?.status   && VALID_STATUS.includes(body.status))     updateData.status   = body.status;

    if (body?.status === 'RESOLVIDA') updateData.closedAt = new Date();

    const demand = await prisma.demand.update({
      where: { id: params?.id ?? '' },
      data: updateData
    });

    return NextResponse.json(demand);
  } catch (error) {
    console.error('Update demand error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar demanda' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getSessionAndGabinete(['CHEFE', 'ADMIN', 'AGENTE_POLITICO', 'SUPER_ADMIN']);
    if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    // Verifica posse antes de deletar
    const existing = await prisma.demand.findUnique({ where: { id: params?.id ?? '' } });
    if (!existing || existing.gabineteId !== ctx.gabineteId) {
      return NextResponse.json({ error: 'Demanda não encontrada' }, { status: 404 });
    }

    await prisma.demand.delete({ where: { id: params?.id ?? '' } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete demand error:', error);
    return NextResponse.json({ error: 'Erro ao excluir demanda' }, { status: 500 });
  }
}
