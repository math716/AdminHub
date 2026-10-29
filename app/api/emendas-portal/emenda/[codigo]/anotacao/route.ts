export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exigirAcesso } from '@/lib/acesso-api';
import { z } from 'zod';
import { lerCorpo, v } from '@/lib/validacao-api';
import { PERMISSIONS } from '@/lib/permissions';

// Texto vazio apaga a anotação (abaixo) — por isso não é obrigatório.
const Anotacao = z.object({ texto: z.string({ required_error: 'Informe o texto.', invalid_type_error: 'Texto: valor inválido.' }).max(20000, 'Texto: no máximo 20000 caracteres.') }).passthrough();

export async function GET(_req: NextRequest, { params }: { params: { codigo: string } }) {
  const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.EMENDAS_MAPA] });
  if (acesso instanceof NextResponse) return acesso;

  const emenda = await prisma.emendaParlamentar.findUnique({
    where: { idPortal: params.codigo },
    select: { id: true },
  });
  if (!emenda) return NextResponse.json({ texto: '' });

  const anotacao = await prisma.emendaAnotacao.findUnique({
    where: { userId_emendaId: { userId: acesso.userId, emendaId: emenda.id } },
    select: { texto: true, updatedAt: true },
  });

  return NextResponse.json({ texto: anotacao?.texto ?? '', updatedAt: anotacao?.updatedAt ?? null });
}

export async function PUT(req: NextRequest, { params }: { params: { codigo: string } }) {
  const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.EMENDAS_MAPA] });
  if (acesso instanceof NextResponse) return acesso;

  const body = await lerCorpo(req, Anotacao);
  if (body instanceof NextResponse) return body;
  const { texto } = body;
  if (typeof texto !== 'string') {
    return NextResponse.json({ error: 'texto inválido' }, { status: 400 });
  }

  const emenda = await prisma.emendaParlamentar.findUnique({
    where: { idPortal: params.codigo },
    select: { id: true },
  });
  if (!emenda) return NextResponse.json({ error: 'Emenda não encontrada' }, { status: 404 });

  if (texto.trim() === '') {
    await prisma.emendaAnotacao.deleteMany({
      where: { userId: acesso.userId, emendaId: emenda.id },
    });
    return NextResponse.json({ texto: '', updatedAt: null });
  }

  const result = await prisma.emendaAnotacao.upsert({
    where: { userId_emendaId: { userId: acesso.userId, emendaId: emenda.id } },
    create: { userId: acesso.userId, emendaId: emenda.id, texto },
    update: { texto },
    select: { texto: true, updatedAt: true },
  });

  return NextResponse.json(result);
}
