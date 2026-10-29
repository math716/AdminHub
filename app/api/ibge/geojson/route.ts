export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { exigirAcesso } from '@/lib/acesso-api';
import { CODIGO_IBGE_UF, caminhoMalhaBrasil, caminhoMalhaEstado } from '@/lib/ibge-local';
import { DADOS_URL } from '@/lib/dados-url';

// Contornos do Brasil (estados) e de um estado (cidades).
//
// Antes esta rota buscava no IBGE a cada pedido. Em out/2026 o IBGE parou de
// responder aos servidores da Vercel (fora do Brasil) e ela passou a devolver
// "Erro ao buscar dados geográficos": os mapas de estado e de cidade ficaram em
// branco em todo o sistema. Agora ela só aponta para o arquivo guardado em
// public/geojson/ibge/ (scripts/ibge/baixar-ibge.mjs) — que o CDN entrega mais
// rápido do que o IBGE entregava.
export async function GET(request: NextRequest) {
  const acesso = await exigirAcesso();
  if (acesso instanceof NextResponse) return acesso;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'brasil';
  const uf = searchParams.get('uf')?.toUpperCase() ?? '';

  let caminho: string;
  if (type === 'brasil') caminho = caminhoMalhaBrasil();
  else if (type === 'estado' && CODIGO_IBGE_UF[uf]) caminho = caminhoMalhaEstado(uf);
  else if (type === 'estado') return NextResponse.json({ error: 'UF inválido' }, { status: 400 });
  else return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });

  return NextResponse.redirect(DADOS_URL ? `${DADOS_URL}${caminho}` : new URL(caminho, request.url), 307);
}
