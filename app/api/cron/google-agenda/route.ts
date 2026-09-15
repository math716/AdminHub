export const dynamic = 'force-dynamic';

/**
 * Cron da agenda: atualiza os gabinetes conectados ao Google.
 *
 * Percorre um LOTE por invocação, do que faz mais tempo que não sincroniza.
 * A serverless da Vercel tem tempo limitado, e uma conta com agenda grande pode
 * demorar — processar tudo de uma vez arriscaria estourar e não atualizar
 * ninguém. Com o cron frequente, o rodízio cobre todos.
 *
 * Configurado em vercel.json. Auth pelo header Authorization: Bearer
 * <CRON_SECRET>, que a Vercel envia sozinha quando a env var existe.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sincronizarGabinete } from '@/lib/google-agenda-sync';

const LOTE = 10;

export async function GET(request: NextRequest) {
  // Sem segredo configurado, a rota NAO fica aberta.
  //
  // A guarda era `if (segredo) { confere }`: faltando a variavel de ambiente,
  // qualquer um podia disparar este cron — e ele consulta servico externo e
  // escreve no banco. Falhar fechado e o certo: se a variavel sumir, o cron
  // para de rodar e aparece no log, em vez de virar um endereco publico que
  // ninguem percebe.
  const segredo = process.env.CRON_SECRET;
  if (!segredo) {
    console.error('[cron/google-agenda] CRON_SECRET nao configurado — cron recusado');
    return NextResponse.json({ error: 'Cron não configurado' }, { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${segredo}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    const conexoes = await prisma.googleAgendaConexao.findMany({
      // nulls first: quem nunca sincronizou entra na frente
      orderBy: { ultimaSync: { sort: 'asc', nulls: 'first' } },
      take: LOTE,
      select: { gabineteId: true },
    });

    const resultados = [];
    for (const c of conexoes) {
      const r = await sincronizarGabinete(c.gabineteId);
      resultados.push({ gabineteId: c.gabineteId, ...r });
    }

    const falhas = resultados.filter(r => !r.ok).length;
    if (falhas > 0) console.warn(`[cron/google-agenda] ${falhas} de ${resultados.length} gabinetes falharam`);

    return NextResponse.json({
      processados: resultados.length,
      criados: resultados.reduce((s, r) => s + r.criados, 0),
      atualizados: resultados.reduce((s, r) => s + r.atualizados, 0),
      removidos: resultados.reduce((s, r) => s + r.removidos, 0),
      falhas,
    });
  } catch (error) {
    console.error('[cron/google-agenda]', error);
    return NextResponse.json({ error: 'Erro no cron da agenda' }, { status: 500 });
  }
}
