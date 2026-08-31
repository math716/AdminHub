// Sede do gabinete — ponto de partida das rotas do dia.
//
// Fica separada de /api/gabinetes (gestão de gabinetes, restrita a admin)
// porque isto aqui é configuração do PRÓPRIO gabinete: quem chefia precisa
// poder ajustar sem depender de um administrador do sistema.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

/** Mesma régua da conexão com o Google: quem responde pelo gabinete. */
const PAPEIS_PERMITIDOS = new Set(['ADMIN', 'SUPER_ADMIN', 'CHEFE', 'AGENTE_POLITICO']);

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const gabineteId = (session.user as any)?.gabineteId as string | undefined;
  if (!gabineteId) return NextResponse.json({ error: 'Usuário sem gabinete' }, { status: 400 });

  // Leitura é liberada a toda a equipe: a rota do dia parte daqui, e um
  // assessor precisa vê-la para montar o trajeto.
  const g = await prisma.gabinete.findUnique({
    where: { id: gabineteId },
    select: { endereco: true, lat: true, lng: true },
  });

  const papel = String((session.user as any)?.role ?? '');
  return NextResponse.json({ ...(g ?? {}), podeEditar: PAPEIS_PERMITIDOS.has(papel) });
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const gabineteId = (session.user as any)?.gabineteId as string | undefined;
    if (!gabineteId) return NextResponse.json({ error: 'Usuário sem gabinete' }, { status: 400 });

    if (!PAPEIS_PERMITIDOS.has(String((session.user as any)?.role ?? ''))) {
      return NextResponse.json(
        { error: 'Apenas chefe de gabinete, agente político ou administrador podem alterar a sede.' },
        { status: 403 },
      );
    }

    const body = await request.json();

    // Campo vazio limpa a sede — é como o gabinete volta a não ter ponto de
    // partida, sem precisar de outra rota para isso.
    const endereco = String(body?.endereco ?? '').trim().slice(0, 400) || null;
    const lat = coordValida(body?.lat, 90);
    const lng = coordValida(body?.lng, 180);

    // Endereço sem coordenada não serve para rota nenhuma; melhor recusar do
    // que gravar uma sede que silenciosamente nunca aparece no mapa.
    if (endereco && (lat === null || lng === null)) {
      return NextResponse.json(
        { error: 'Localize o endereço no mapa antes de salvar.' },
        { status: 400 },
      );
    }

    await prisma.gabinete.update({
      where: { id: gabineteId },
      data: endereco ? { endereco, lat, lng } : { endereco: null, lat: null, lng: null },
    });

    return NextResponse.json({ ok: true, endereco, lat, lng });
  } catch (err) {
    console.error('[/api/gabinete/sede]', err);
    return NextResponse.json({ error: 'Erro ao salvar o endereço.' }, { status: 500 });
  }
}

function coordValida(v: unknown, limite: number): number | null {
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n) <= limite && n !== 0 ? n : null;
}
