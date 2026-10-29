export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exigirAcesso, gabineteDoUsuario } from '@/lib/acesso-api';
import { z } from 'zod';
import { lerCorpo, v } from '@/lib/validacao-api';
import { PERMISSIONS } from '@/lib/permissions';

const NovaEmenda = z.object({
  ano:             v.numeroOuTexto('o ano'),
  parlamentarId:   v.textoOpcional('o parlamentar', 64),
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

export async function GET(req: NextRequest) {
  const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.EMENDAS_MAPA] });
  if (acesso instanceof NextResponse) return acesso;
  const gabineteId = await gabineteDoUsuario(acesso.userId);
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
  const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.EMENDAS_MAPA], gabinete: 'banco' });
  if (acesso instanceof NextResponse) return acesso;
  const { gabineteId } = acesso;

  const body = await lerCorpo(req, NovaEmenda);
  if (body instanceof NextResponse) return body;
  const { ano, parlamentarId, numero, tipo, area, favorecido, municipio, uf, valor, observacao, documentoBase64, documentoNome } = body;

  if (!favorecido?.trim()) {
    return NextResponse.json({ error: 'Favorecido é obrigatório' }, { status: 400 });
  }
  if (!parlamentarId?.trim()) {
    return NextResponse.json({ error: 'Parlamentar não identificado' }, { status: 400 });
  }

  const MAX_DOC_BYTES = 10 * 1024 * 1024; // 10MB base64 ~= 7.5MB binário
  if (typeof documentoBase64 === 'string' && documentoBase64.length > MAX_DOC_BYTES) {
    return NextResponse.json({ error: 'Documento muito grande (máx. 7MB)' }, { status: 400 });
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
      observacao: observacao?.trim() || null,
      documentoBase64: documentoBase64 || null,
      documentoNome: documentoNome?.trim() || null,
    },
  });

  return NextResponse.json(item, { status: 201 });
}
