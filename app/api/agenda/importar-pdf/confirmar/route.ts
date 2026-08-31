// Gravação dos compromissos lidos de um PDF, depois da conferência na tela.
//
// Separada da leitura de propósito: o que chega aqui é o que a pessoa REVISOU e
// aprovou, não o que o modelo leu. Os campos são revalidados mesmo assim — o
// corpo vem do navegador e pode ter sido alterado no caminho.

export const dynamic = 'force-dynamic';
// Sem maxDuration de propósito: as coordenadas já vêm resolvidas da leitura, e
// no plano Hobby cada rota com configuração própria vira uma função serverless
// dedicada — o limite é 12 para o projeto inteiro.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { montarDataBR, TIPOS_EVENTO } from '@/lib/agenda/importar-pdf';

/** Teto por importação. Uma agenda semanal tem dezenas de itens, não centenas. */
const MAX_EVENTOS = 200;

const TIPOS = new Set<string>(TIPOS_EVENTO);

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const userId = (session.user as any)?.id;
    const gabineteId = (session.user as any)?.gabineteId;
    if (!gabineteId) return NextResponse.json({ error: 'Usuário sem gabinete' }, { status: 400 });

    const body = await request.json();
    const entrada = Array.isArray(body?.eventos) ? body.eventos : [];
    if (entrada.length === 0) {
      return NextResponse.json({ error: 'Nenhum compromisso para importar.' }, { status: 400 });
    }
    if (entrada.length > MAX_EVENTOS) {
      return NextResponse.json(
        { error: `São no máximo ${MAX_EVENTOS} compromissos por importação.` },
        { status: 400 },
      );
    }

    const registros: any[] = [];
    const recusados: string[] = [];

    for (const e of entrada) {
      const titulo = String(e?.titulo ?? '').trim();
      const data = String(e?.data ?? '');
      const horaInicio = String(e?.horaInicio ?? '');

      if (!titulo || !/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{1,2}:\d{2}$/.test(horaInicio)) {
        recusados.push(titulo || '(sem título)');
        continue;
      }

      const inicio = montarDataBR(data, horaInicio);
      if (Number.isNaN(inicio.getTime())) { recusados.push(titulo); continue; }

      // Fim só entra se for depois do início — uma agenda que atravessa a
      // meia-noite viria com fim "menor" e criaria um evento de duração negativa.
      let fim: Date | null = null;
      if (/^\d{1,2}:\d{2}$/.test(String(e?.horaFim ?? ''))) {
        const cand = montarDataBR(data, String(e.horaFim));
        if (!Number.isNaN(cand.getTime()) && cand > inicio) fim = cand;
      }

      registros.push({
        titulo: titulo.slice(0, 300),
        descricao: textoOuNulo(e?.descricao, 2000),
        data: inicio,
        dataFim: fim,
        local: textoOuNulo(e?.local, 200),
        endereco: textoOuNulo(e?.endereco, 400),
        tipo: TIPOS.has(String(e?.tipo)) ? String(e.tipo) : 'COMPROMISSO',
        // Coordenadas resolvidas na leitura. Revalidadas porque o corpo vem do
        // navegador: um par invalido plotaria o compromisso no lugar errado.
        lat: coordValida(e?.lat, 90),
        lng: coordValida(e?.lng, 180),
        gabineteId,
        createdById: userId,
      });
    }

    if (registros.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum compromisso válido — confira as datas e horários.' },
        { status: 400 },
      );
    }

    const localizados = registros.filter(r => r.lat != null).length;

    const { count } = await prisma.agendaEvent.createMany({ data: registros });

    return NextResponse.json({ importados: count, localizados, recusados }, { status: 201 });
  } catch (err) {
    console.error('[/api/agenda/importar-pdf/confirmar]', err);
    return NextResponse.json({ error: 'Erro ao gravar os compromissos.' }, { status: 500 });
  }
}

/** Coordenada so entra se for numero real dentro da faixa geografica. */
function coordValida(v: unknown, limite: number): number | null {
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n) <= limite && n !== 0 ? n : null;
}

function textoOuNulo(v: unknown, max: number): string | null {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
}
