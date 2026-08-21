export const dynamic = 'force-dynamic';

// Retorno do consentimento do Google. Troca o código pelo refresh_token, grava
// a conexão do gabinete e devolve o usuário à agenda.
//
// Esta rota é aberta pelo NAVEGADOR (o Google redireciona para cá), então ela
// responde com redirect e não com JSON — o resultado vai na query, para a tela
// da agenda mostrar o aviso.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { trocarCodigoPorToken, emailDaConta } from '@/lib/google-agenda';
import { conferirEstado } from '@/lib/google-agenda-estado';
import { sincronizarGabinete } from '@/lib/google-agenda-sync';

function voltarParaAgenda(request: NextRequest, params: Record<string, string>) {
  const host = request.headers.get('host') ?? 'localhost:3000';
  const proto = host.startsWith('localhost') ? 'http' : 'https';
  const q = new URLSearchParams(params).toString();
  return NextResponse.redirect(`${proto}://${host}/dashboard/agenda?${q}`);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code  = searchParams.get('code');
  const erro  = searchParams.get('error');
  const state = searchParams.get('state') ?? '';

  // Usuário clicou em "cancelar" na tela do Google
  if (erro) return voltarParaAgenda(request, { google: 'cancelado' });
  if (!code) return voltarParaAgenda(request, { google: 'erro', motivo: 'sem-codigo' });

  // O state é assinado na rota de início — sem isso, alguém poderia forjar o
  // parâmetro e ligar a própria conta Google ao gabinete de outra pessoa.
  const estado = conferirEstado(state);
  if (!estado) return voltarParaAgenda(request, { google: 'erro', motivo: 'estado-invalido' });

  try {
    const host = request.headers.get('host') ?? 'localhost:3000';
    const proto = host.startsWith('localhost') ? 'http' : 'https';
    const token = await trocarCodigoPorToken(code, `${proto}://${host}/api/agenda/google/callback`);

    // Sem refresh_token a sincronização automática morre em ~1h. Acontece
    // quando a conta já autorizou antes e o Google não reenvia — por isso a
    // autorização pede prompt=consent.
    if (!token.refresh_token) {
      return voltarParaAgenda(request, { google: 'erro', motivo: 'sem-refresh-token' });
    }

    const [email, usuario] = await Promise.all([
      emailDaConta(token.access_token),
      prisma.user.findUnique({ where: { id: estado.userId }, select: { name: true } }),
    ]);

    await prisma.googleAgendaConexao.upsert({
      where: { gabineteId: estado.gabineteId },
      create: {
        gabineteId: estado.gabineteId,
        email: email || 'conta Google',
        refreshToken: token.refresh_token,
        accessToken: token.access_token,
        expiraEm: new Date(Date.now() + (token.expires_in ?? 3600) * 1000),
        escopo: token.scope ?? null,
        conectadoPorId: estado.userId,
        conectadoPorNome: usuario?.name ?? null,
      },
      update: {
        email: email || 'conta Google',
        refreshToken: token.refresh_token,
        accessToken: token.access_token,
        expiraEm: new Date(Date.now() + (token.expires_in ?? 3600) * 1000),
        escopo: token.scope ?? null,
        // Reconectou: começa do zero, senão herdaria um syncToken de outra conta.
        syncToken: null,
        ultimoErro: null,
        conectadoPorId: estado.userId,
        conectadoPorNome: usuario?.name ?? null,
      },
    });

    // Primeira carga já no ato: sem isso o gabinete conectaria e veria a agenda
    // vazia até o cron rodar.
    const r = await sincronizarGabinete(estado.gabineteId);

    return voltarParaAgenda(request, r.ok
      ? { google: 'conectado', importados: String(r.criados) }
      : { google: 'conectado', aviso: 'sync-falhou' });
  } catch (err) {
    console.error('[/api/agenda/google/callback]', String(err).slice(0, 300));
    return voltarParaAgenda(request, { google: 'erro', motivo: 'token' });
  }
}
