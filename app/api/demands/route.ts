export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import type { DemandCategory, DemandPriority, DemandStatus } from '@prisma/client';
import { exigirAcesso } from '@/lib/acesso-api';
import { z } from 'zod';
import { lerCorpo, v } from '@/lib/validacao-api';
import { PERMISSIONS } from '@/lib/permissions';

const NovaDemanda = z.object({
  title:        v.textoOpcional('o título', 20000),
  solicitante:  v.textoOpcional('o solicitante', 20000),
  description:  v.textoOpcional('a descrição', 20000),
  contato:      v.textoOpcional('o contato', 255),
  estado:       v.textoOpcional('o estado', 50),
  municipio:    v.textoOpcional('o município', 200),
  bairro:       v.textoOpcional('o bairro', 200),
  endereco:     v.textoOpcional('o endereço', 500),
  lat:          v.latitude(),
  lng:          v.longitude(),
  foto:         v.textoOpcional('a foto', 50_000_000),
  category:     v.textoOpcional('a categoria', 40),
  status:       v.textoOpcional('o status', 40),
  priority:     v.textoOpcional('a prioridade', 40),
  observations: v.textoOpcional('as observações', 20000),
}).passthrough();

const VALID_STATUS   = ['PENDENTE', 'EM_ANDAMENTO', 'RESOLVIDA', 'CANCELADA'];
const VALID_CATEGORY = ['SAUDE', 'EDUCACAO', 'INFRAESTRUTURA', 'SEGURANCA', 'ASSISTENCIA_SOCIAL', 'MEIO_AMBIENTE', 'CULTURA', 'ESPORTE', 'HABITACAO', 'TRANSPORTE', 'OUTROS'];
const VALID_PRIORITY = ['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'];

export async function GET(request: NextRequest) {
  try {
    const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.DEMANDAS, PERMISSIONS.MAPA_GABINETE], gabinete: 'sessao' });
    if (acesso instanceof NextResponse) return acesso;
    const { gabineteId } = acesso;

    const { searchParams } = new URL(request.url);
    const status   = searchParams.get('status');
    const category = searchParams.get('category');
    const priority = searchParams.get('priority');
    const estado   = searchParams.get('estado');
    const municipio = searchParams.get('municipio');
    const search   = searchParams.get('search');

    // Sempre restringe ao gabinete do usuário autenticado
    const where: any = { gabineteId };

    if (status   && VALID_STATUS.includes(status))     where.status   = status;
    if (category && VALID_CATEGORY.includes(category)) where.category = category;
    if (priority && VALID_PRIORITY.includes(priority)) where.priority = priority;
    if (estado)    where.estado   = estado;
    if (municipio) where.municipio = { contains: municipio, mode: 'insensitive' };
    if (search) {
      where.OR = [
        { title:       { contains: search, mode: 'insensitive' } },
        { solicitante: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Listagem nao traz o campo `foto` (base64, frequentemente >100KB).
    // Quem precisa da imagem busca a demanda inteira em /api/demands/[id]:
    // `selectDemandWithFoto` no mapa e `handleEdit` na lista de demandas.
    //
    // Nao existe `hasFoto` aqui — o comentario anterior dizia que sim, e quem
    // confiasse nele escreveria tela contando com um campo que nunca chega.
    const demands = await prisma.demand.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        solicitante: true,
        contato: true,
        estado: true,
        municipio: true,
        bairro: true,
        endereco: true,
        lat: true,
        lng: true,
        category: true,
        status: true,
        priority: true,
        observations: true,
        closedAt: true,
        gabineteId: true,
        createdById: true,
        createdAt: true,
        updatedAt: true,
        createdBy: { select: { name: true, email: true } },
      },
    });

    return NextResponse.json(demands ?? []);
  } catch (error) {
    console.error('Get demands error:', error);
    return NextResponse.json({ error: 'Erro ao buscar demandas' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.DEMANDAS, PERMISSIONS.MAPA_GABINETE], gabinete: 'sessao' });
    if (acesso instanceof NextResponse) return acesso;
    const { userId, gabineteId } = acesso;
    const body = await lerCorpo(request, NovaDemanda);
    if (body instanceof NextResponse) return body;

    const title      = String(body?.title      ?? '').trim();
    const solicitante = String(body?.solicitante ?? '').trim();

    if (!title)      return NextResponse.json({ error: 'Título é obrigatório' }, { status: 400 });
    if (!solicitante) return NextResponse.json({ error: 'Solicitante é obrigatório' }, { status: 400 });
    if (title.length > 255)
      return NextResponse.json({ error: 'Título deve ter no máximo 255 caracteres' }, { status: 400 });
    if ((body?.description ?? '').length > 5000)
      return NextResponse.json({ error: 'Descrição deve ter no máximo 5000 caracteres' }, { status: 400 });
    if (solicitante.length > 255)
      return NextResponse.json({ error: 'Solicitante deve ter no máximo 255 caracteres' }, { status: 400 });
    if ((body?.observations ?? '').length > 2000)
      return NextResponse.json({ error: 'Observações devem ter no máximo 2000 caracteres' }, { status: 400 });

    // Validacao server-side do tamanho do payload da foto base64.
    // Cliente ja limita a 5MB no formulario, mas atacante pode contornar
    // via curl e enviar payload arbitrario, esgotando memoria/Postgres.
    const MAX_FOTO_BYTES = 7 * 1024 * 1024; // 7MB base64 ~= 5MB binario
    if (typeof body?.foto === 'string' && body.foto.length > MAX_FOTO_BYTES) {
      return NextResponse.json({ error: 'Foto muito grande (limite 5MB)' }, { status: 413 });
    }

    const status   = (VALID_STATUS.includes(body.status ?? '')     ? body.status   : 'PENDENTE') as DemandStatus;
    const category = (VALID_CATEGORY.includes(body.category ?? '') ? body.category : 'OUTROS') as DemandCategory;
    const priority = (VALID_PRIORITY.includes(body.priority ?? '') ? body.priority : 'MEDIA') as DemandPriority;

    const demand = await prisma.demand.create({
      data: {
        title,
        description: body?.description ?? null,
        solicitante,
        contato:     body?.contato     ?? null,
        estado:      body?.estado      ?? '',
        municipio:   body?.municipio   ?? '',
        bairro:      body?.bairro      ?? null,
        endereco:    body?.endereco    ?? null,
        lat:         body?.lat         ?? null,
        lng:         body?.lng         ?? null,
        foto:        body?.foto        ?? null,
        category,
        status,
        priority,
        observations: body?.observations ?? null,
        createdById:  userId,
        gabineteId
      }
    });

    return NextResponse.json(demand);
  } catch (error) {
    console.error('Create demand error:', error);
    return NextResponse.json({ error: 'Erro ao criar demanda' }, { status: 500 });
  }
}
