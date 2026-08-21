export const dynamic = 'force-dynamic';

// Sincronização sob demanda — o botão "Sincronizar agora" na tela da agenda.
// A automática fica em /api/cron/google-agenda.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { sincronizarGabinete } from '@/lib/google-agenda-sync';

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const gabineteId = (session.user as any)?.gabineteId;
    if (!gabineteId) return NextResponse.json({ error: 'Usuário sem gabinete' }, { status: 400 });

    const r = await sincronizarGabinete(gabineteId);
    // 409 e não 500: a falha costuma ser de autorização (token revogado no
    // Google), coisa que o usuário resolve reconectando.
    return NextResponse.json(r, { status: r.ok ? 200 : 409 });
  } catch (error) {
    console.error('POST /api/agenda/google/sincronizar error:', error);
    return NextResponse.json({ error: 'Erro ao sincronizar' }, { status: 500 });
  }
}
