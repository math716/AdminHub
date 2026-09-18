// TEMPORARIO — descobrir se a Vercel entrega os pedacos aos poucos ou segura
// tudo ate o fim. Apagar depois de responder a pergunta.
//
//   /api/zzteste?modo=ndjson  -> uma linha de JSON por evento (o que usamos hoje)
//   /api/zzteste?modo=sse     -> formato de eventos do navegador (text/event-stream)
//
// Emite 6 linhas com 1 segundo entre elas. Aberto no navegador:
//   - aparecendo uma a uma  -> a Vercel entrega na hora
//   - todas de uma vez no fim -> a Vercel segura
//
// Exige sessao: nao e endereco publico.
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

const espera = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const sse = request.nextUrl.searchParams.get('modo') === 'sse';
  const cod = new TextEncoder();
  const t0 = Date.now();

  const fluxo = new ReadableStream({
    start(c) {
      const emitir = (texto: string) => {
        const corpo = sse ? `data: ${texto}\n\n` : texto + '\n';
        c.enqueue(cod.encode(corpo));
      };
      (async () => {
        try {
          for (let i = 1; i <= 6; i++) {
            emitir(`linha ${i} — emitida ${((Date.now() - t0) / 1000).toFixed(1)}s depois de comecar`);
            await espera(1000);
          }
          emitir('FIM');
        } finally {
          c.close();
        }
      })();
    },
  });

  return new Response(fluxo, {
    headers: {
      'Content-Type': sse
        ? 'text/event-stream; charset=utf-8'
        : 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
