// Rota entre compromissos, para o Mapa do Gabinete.
//
// Proxy para o serviço de rotas: mantém a origem do cálculo no servidor (o
// navegador não fala direto com o provedor) e permite trocar de provedor sem
// mexer na tela.

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { tracarRota, ordenarParadas, type Ponto } from '@/lib/rotas';

const MAX_PONTOS = 25;

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await request.json();
    const pontos = validarPontos(body?.pontos);

    if (pontos.length < 2) {
      return NextResponse.json(
        { error: 'São necessários ao menos dois compromissos com endereço localizado.' },
        { status: 400 },
      );
    }

    // Otimizar é opcional: por padrão a rota segue a ordem dos horários, que é
    // o que o gabinete combinou com as pessoas.
    let ordem: number[] | null = null;
    let usados = pontos;
    if (body?.otimizar === true) {
      ordem = await ordenarParadas(pontos);
      if (ordem) usados = ordem.map(i => pontos[i]);
    }

    const rota = await tracarRota(usados);
    if (!rota) {
      return NextResponse.json(
        { error: 'Não foi possível calcular a rota agora. Tente de novo em instantes.' },
        { status: 502 },
      );
    }

    return NextResponse.json({ ...rota, ordem });
  } catch (err) {
    console.error('[/api/rotas]', err);
    return NextResponse.json({ error: 'Erro ao calcular a rota.' }, { status: 500 });
  }
}

/** Só coordenadas plausíveis entram — lixo aqui vira uma rota absurda. */
function validarPontos(entrada: unknown): Ponto[] {
  if (!Array.isArray(entrada)) return [];
  return entrada
    .slice(0, MAX_PONTOS)
    .map((p: any) => ({
      lat: Number(p?.lat),
      lng: Number(p?.lng),
      nome: p?.nome ? String(p.nome).slice(0, 120) : undefined,
    }))
    .filter(p =>
      Number.isFinite(p.lat) && Number.isFinite(p.lng)
      && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180);
}
