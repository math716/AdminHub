export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

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

    const conversas = await (prisma as any).gabiConversa.findMany({
      where: { gabineteId },
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

// As mensagens são salvas completas (com visualizacoes/dadosBrutos) para que os
// cards de dados e o botão de PDF sobrevivam ao reabrir a conversa. Como os
// dadosBrutos podem trazer centenas de registros, descarta os mais antigos
// quando o conjunto passa do limite — as mensagens e os gráficos permanecem.
const LIMITE_JSON = 800_000; // ~800 KB

function enxugar(mensagens: any[]): any[] {
  const msgs = mensagens.map(m => ({ ...m }));
  const tamanho = () => JSON.stringify(msgs).length;
  for (let i = 0; i < msgs.length && tamanho() > LIMITE_JSON; i++) {
    if (msgs[i]?.dadosBrutos) delete msgs[i].dadosBrutos;
  }
  // Ainda grande (conversa muito longa): remove também as visualizações antigas
  for (let i = 0; i < msgs.length && tamanho() > LIMITE_JSON; i++) {
    if (msgs[i]?.visualizacoes) delete msgs[i].visualizacoes;
  }
  return msgs;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const gabineteId = await getGabineteId(session);
    if (!gabineteId) return NextResponse.json({ error: 'Gabinete não encontrado' }, { status: 400 });

    const body = await request.json();
    const { titulo, mensagens } = body ?? {};

    if (!Array.isArray(mensagens) || mensagens.length === 0) {
      return NextResponse.json({ error: 'Mensagens inválidas' }, { status: 400 });
    }

    const conversa = await (prisma as any).gabiConversa.create({
      data: {
        gabineteId,
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
