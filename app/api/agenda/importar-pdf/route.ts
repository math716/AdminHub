// Leitura de uma agenda em PDF para conferência.
//
// Esta rota NÃO grava nada: ela lê o documento e devolve os compromissos
// encontrados para a pessoa conferir na tela. A gravação é um segundo passo
// explícito, em /api/agenda/importar-pdf/confirmar.

export const dynamic = 'force-dynamic';
// A leitura do documento leva alguns segundos; o padrão da plataforma cortaria
// a requisição no meio.
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { lerAgendaEmPdf, montarDataBR, type EventoExtraido } from '@/lib/agenda/importar-pdf';

/** A plataforma limita o corpo da requisição a ~4,5 MB. Uma agenda semanal tem centenas de KB. */
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const gabineteId = (session.user as any)?.gabineteId;
    if (!gabineteId) return NextResponse.json({ error: 'Usuário sem gabinete' }, { status: 400 });

    const form = await request.formData();
    const arquivo = form.get('arquivo');
    if (!(arquivo instanceof File)) {
      return NextResponse.json({ error: 'Envie o arquivo PDF da agenda.' }, { status: 400 });
    }
    if (arquivo.type !== 'application/pdf' && !arquivo.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'O arquivo precisa ser um PDF.' }, { status: 400 });
    }
    if (arquivo.size > MAX_BYTES) {
      return NextResponse.json(
        { error: 'O arquivo passa de 4 MB. Envie apenas as páginas da agenda.' },
        { status: 400 },
      );
    }
    if (arquivo.size === 0) {
      return NextResponse.json({ error: 'O arquivo está vazio.' }, { status: 400 });
    }

    const base64 = Buffer.from(await arquivo.arrayBuffer()).toString('base64');

    let leitura;
    try {
      leitura = await lerAgendaEmPdf(base64);
    } catch (err) {
      const motivo = String(err);
      console.error('[/api/agenda/importar-pdf] leitura falhou:', motivo.slice(0, 300));

      // Demora e "não entendi o documento" são problemas diferentes e pedem
      // ações diferentes de quem está na tela.
      const demorou = /timeout|aborted|ETIMEDOUT/i.test(motivo);
      return NextResponse.json(
        {
          error: demorou
            ? 'A leitura demorou mais que o permitido. Se o PDF tiver várias semanas, envie uma semana por vez.'
            : 'Não consegui interpretar este documento. Confira se o PDF traz a grade de horários.',
        },
        { status: demorou ? 504 : 422 },
      );
    }

    const eventos = leitura.eventos.filter(temCamposMinimos);
    if (eventos.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum compromisso foi encontrado neste documento.' },
        { status: 422 },
      );
    }

    // Marca o que já está na agenda: reimportar a mesma semana é o erro mais
    // provável de quem usa isso, e duplicar compromisso é pior que não importar.
    const jaExistentes = await buscarExistentes(gabineteId, eventos);

    // Esta rota SÓ LÊ o documento. A geocodificação ficou aqui por um tempo e
    // estourou o limite de 60 s da função: ler o PDF já leva dezenas de
    // segundos, e cada endereço custa mais 1,1 s (limite do Nominatim) — uma
    // agenda de 20 compromissos somava 22 s só nisso.
    //
    // Quem geocodifica agora é a TELA, um endereço por vez, chamando
    // /api/geocode. O navegador não tem teto de 60 s, a pessoa vê o progresso,
    // e nenhuma função nova precisa ser criada.
    return NextResponse.json({
      eventos: eventos.map((e) => ({
        ...e,
        lat: null,
        lng: null,
        jaExiste: jaExistentes.has(chaveEvento(e.titulo, e.data, e.horaInicio)),
      })),
      observacoes: leitura.observacoes,
      arquivo: arquivo.name,
    });
  } catch (err) {
    console.error('[/api/agenda/importar-pdf]', err);
    return NextResponse.json({ error: 'Erro ao ler o documento.' }, { status: 500 });
  }
}

function temCamposMinimos(e: EventoExtraido): boolean {
  return Boolean(
    e?.titulo?.trim()
    && /^\d{4}-\d{2}-\d{2}$/.test(e.data ?? '')
    && /^\d{1,2}:\d{2}$/.test(e.horaInicio ?? ''),
  );
}

/** Título normalizado + início: o mesmo compromisso reimportado cai na mesma chave. */
function chaveEvento(titulo: string, data: string, hora: string): string {
  return `${titulo.trim().toLowerCase()}|${data}|${hora}`;
}

async function buscarExistentes(gabineteId: string, eventos: EventoExtraido[]): Promise<Set<string>> {
  const datas = eventos.map(e => montarDataBR(e.data, e.horaInicio).getTime()).filter(Number.isFinite);
  if (datas.length === 0) return new Set();

  // Uma folga de um dia em cada ponta cobre a virada por fuso horário.
  const DIA = 24 * 60 * 60 * 1000;
  const existentes = await prisma.agendaEvent.findMany({
    where: {
      gabineteId,
      data: { gte: new Date(Math.min(...datas) - DIA), lte: new Date(Math.max(...datas) + DIA) },
    },
    select: { titulo: true, data: true },
  });

  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const hora = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false,
  });

  return new Set(existentes.map((e: { titulo: string; data: Date }) => chaveEvento(e.titulo, fmt.format(e.data), hora.format(e.data))));
}
