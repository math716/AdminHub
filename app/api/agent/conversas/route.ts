export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exigirAcesso } from '@/lib/acesso-api';
import { z } from 'zod';
import { lerCorpo, v } from '@/lib/validacao-api';
import { enxugar, validarMensagens } from '@/lib/agent/conversa-store';
import { donoDaConversa } from '@/lib/agent/dono-conversa';

// As mensagens vão inteiras (com gráficos e dados dos relatórios): o teto de
// tamanho é o de enxugar(), na gravação. Aqui só a forma.
const Salvamento = z.object({
  titulo:    v.textoOpcional('o título', 300),
  mensagens: z.array(z.unknown(), { invalid_type_error: 'Mensagens: valor inválido.' }).max(5000).nullish(),
}).passthrough();

// O histórico é do gabinete — ou, para quem não tem gabinete (as contas de
// administração sem gabinete escolhido), da própria pessoa. Ver dono-conversa.

export async function GET(request: NextRequest) {
  try {
    const acesso = await exigirAcesso();
    if (acesso instanceof NextResponse) return acesso;

    const dono = await donoDaConversa(acesso.session);
    if (!dono) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const conversas = await prisma.gabiConversa.findMany({
      where: dono,
      select: { id: true, titulo: true, mensagens: true, criadaEm: true },
      orderBy: { criadaEm: 'desc' },
      take: 50,
    });

    return NextResponse.json(conversas);
  } catch (error) {
    console.error('GET /api/agent/conversas error:', error);
    return NextResponse.json({ error: 'Erro ao buscar histórico' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const acesso = await exigirAcesso();
    if (acesso instanceof NextResponse) return acesso;

    const dono = await donoDaConversa(acesso.session);
    if (!dono) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await lerCorpo(request, Salvamento);
    if (body instanceof NextResponse) return body;
    const { titulo, mensagens } = body;

    if (!validarMensagens(mensagens)) {
      return NextResponse.json({ error: 'Mensagens inválidas' }, { status: 400 });
    }

    const conversa = await prisma.gabiConversa.create({
      data: {
        ...dono,
        titulo: titulo?.slice(0, 120) || null,
        mensagens: enxugar(mensagens),
      },
      select: { id: true },
    });

    return NextResponse.json(conversa, { status: 201 });
  } catch (error) {
    console.error('POST /api/agent/conversas error:', error);
    return NextResponse.json({ error: 'Erro ao salvar conversa' }, { status: 500 });
  }
}
