// Gravação dos compromissos lidos de um PDF, depois da conferência na tela.
//
// Separada da leitura de propósito: o que chega aqui é o que a pessoa REVISOU e
// aprovou, não o que o modelo leu. Os campos são revalidados mesmo assim — o
// corpo vem do navegador e pode ter sido alterado no caminho.

export const dynamic = 'force-dynamic';
// Geocodificar respeita 1 consulta/segundo (política do Nominatim), então uma
// agenda cheia leva dezenas de segundos.
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { montarDataBR, TIPOS_EVENTO } from '@/lib/agenda/importar-pdf';
import { geocodificarLote, ancoraDoGabinete } from '@/lib/geocode';

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

    // Coordenadas, para o compromisso aparecer no mapa. Só tenta onde há
    // endereço; quem não tiver entra sem coordenada, sem travar a importação.
    const ancora = await ancoraDoGabinete(gabineteId);
    const coords = await geocodificarLote(registros, { ancora });
    coords.forEach((c, i) => {
      if (c) { registros[i].lat = c.lat; registros[i].lng = c.lng; }
    });
    const localizados = coords.filter(Boolean).length;

    const { count } = await prisma.agendaEvent.createMany({ data: registros });

    return NextResponse.json({ importados: count, localizados, recusados }, { status: 201 });
  } catch (err) {
    console.error('[/api/agenda/importar-pdf/confirmar]', err);
    return NextResponse.json({ error: 'Erro ao gravar os compromissos.' }, { status: 500 });
  }
}

function textoOuNulo(v: unknown, max: number): string | null {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
}
