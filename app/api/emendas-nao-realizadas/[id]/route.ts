export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exigirAcesso } from '@/lib/acesso-api';
import { z } from 'zod';
import { lerCorpo, v } from '@/lib/validacao-api';
import { PERMISSIONS } from '@/lib/permissions';

const EdicaoEmenda = z.object({
  favorecido:      v.textoOpcional('o favorecido', 500),
  numero:          v.textoOpcional('o número', 100),
  tipo:            v.textoOpcional('o tipo', 100),
  area:            v.textoOpcional('a área', 200),
  municipio:       v.textoOpcional('o município', 200),
  uf:              v.textoOpcional('a UF', 2),
  valor:           v.numeroOuTexto('o valor'),
  observacao:      v.textoOpcional('a observação', 20000),
  documentoBase64: v.textoOpcional('o documento', 50_000_000),
  documentoNome:   v.textoOpcional('o nome do documento', 300),
}).passthrough();

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.EMENDAS_MAPA], gabinete: 'banco' });
  if (acesso instanceof NextResponse) return acesso;
  const { gabineteId } = acesso;

  const existing = await prisma.emendaNaoRealizada.findFirst({
    where: { id: params.id, gabineteId },
  });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const body = await lerCorpo(req, EdicaoEmenda);
  if (body instanceof NextResponse) return body;
  const { numero, tipo, area, favorecido, municipio, uf, valor, observacao, documentoBase64, documentoNome } = body;

  if (!favorecido?.trim()) {
    return NextResponse.json({ error: 'Favorecido é obrigatório' }, { status: 400 });
  }

  const MAX_DOC_BYTES = 10 * 1024 * 1024;
  if (typeof documentoBase64 === 'string' && documentoBase64.length > MAX_DOC_BYTES) {
    return NextResponse.json({ error: 'Documento muito grande (máx. 7MB)' }, { status: 400 });
  }

  const updated = await prisma.emendaNaoRealizada.update({
    where: { id: params.id },
    data: {
      numero: numero?.trim() || null,
      tipo: tipo?.trim() || null,
      area: area?.trim() || null,
      favorecido: favorecido.trim(),
      municipio: municipio?.trim() || null,
      uf: uf?.trim()?.toUpperCase() || null,
      valor: Number(valor) || 0,
      observacao: observacao?.trim() || null,
      documentoBase64: documentoBase64 !== undefined ? (documentoBase64 || null) : existing.documentoBase64,
      documentoNome: documentoNome !== undefined ? (documentoNome?.trim() || null) : existing.documentoNome,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.EMENDAS_MAPA], gabinete: 'banco' });
  if (acesso instanceof NextResponse) return acesso;
  const { gabineteId } = acesso;

  const existing = await prisma.emendaNaoRealizada.findFirst({
    where: { id: params.id, gabineteId },
  });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  await prisma.emendaNaoRealizada.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
