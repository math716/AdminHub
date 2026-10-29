export const dynamic = 'force-dynamic';
// Uma agenda muito cheia, na primeira sincronização (sem syncToken ainda),
// pode levar mais que o padrão. 300s é o teto do plano — declarar aqui é só
// para deixar o limite explícito, não para pedir mais do que existe.
export const maxDuration = 300;

// Sincronização sob demanda — o botão "Sincronizar agora" na tela da agenda.
// A automática fica em /api/cron/google-agenda.

import { NextResponse } from 'next/server';
import { sincronizarGabinete } from '@/lib/google-agenda-sync';
import { exigirAcesso } from '@/lib/acesso-api';
import { PERMISSIONS } from '@/lib/permissions';

export async function POST() {
  try {
    const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.AGENDA], gabinete: 'sessao' });
    if (acesso instanceof NextResponse) return acesso;
    const { gabineteId } = acesso;

    const r = await sincronizarGabinete(gabineteId);
    // 409 e não 500: a falha costuma ser de autorização (token revogado no
    // Google), coisa que o usuário resolve reconectando.
    return NextResponse.json(r, { status: r.ok ? 200 : 409 });
  } catch (error) {
    console.error('POST /api/agenda/google/sincronizar error:', error);
    // Se a função foi encerrada por tempo, o Vercel devolve um erro sem
    // `message` legível — sem isso, a tela mostraria "Erro ao sincronizar"
    // para quem tem uma agenda muito cheia, dando a entender que é preciso
    // reconectar a conta, quando na verdade é só questão de tentar de novo
    // (o que já foi processado fica salvo; a próxima rodada continua daí).
    return NextResponse.json(
      { error: 'A sincronização demorou mais do que o esperado. Tente novamente em alguns minutos.' },
      { status: 500 },
    );
  }
}
