// Integração com o Google Agenda — uma conexão por gabinete.
//
// Usa fetch direto na API REST do Google, e NÃO o pacote `googleapis`: ele traz
// o cliente de centenas de serviços e passa de 50 MB, e as funções deste
// projeto já vivem perto do teto de 250 MB da Vercel. Aqui são três endpoints.
//
// Fluxo: o gabinete autoriza uma vez (access_type=offline), guardamos o
// refresh_token, e a partir daí a sincronização automática renova o acesso
// sozinha — sem ninguém precisar estar logado.

import { prisma } from '@/lib/db';

const OAUTH_AUTH  = 'https://accounts.google.com/o/oauth2/v2/auth';
const OAUTH_TOKEN = 'https://oauth2.googleapis.com/token';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

// Só leitura: o AdminHub importa a agenda, nunca escreve nela. Pedir escrita
// exigiria verificação mais pesada do Google e daria ao sistema o poder de
// alterar a agenda real do parlamentar.
export const ESCOPOS = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

export function googleConfigurado(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** URL de consentimento. `estado` volta no callback (protege contra CSRF). */
export function urlDeConsentimento(redirectUri: string, estado: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: ESCOPOS,
    // offline + consent: sem os dois o Google devolve refresh_token só na
    // PRIMEIRA autorização; se o gabinete reconectar, viria sem ele e a
    // sincronização automática pararia depois de uma hora.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: estado,
  });
  return `${OAUTH_AUTH}?${p.toString()}`;
}

interface RespostaToken {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  id_token?: string;
}

async function postToken(corpo: Record<string, string>): Promise<RespostaToken> {
  const res = await fetch(OAUTH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      ...corpo,
    }).toString(),
  });
  const dados = await res.json();
  if (!res.ok) {
    throw new Error(`Google OAuth: ${dados.error ?? res.status} — ${dados.error_description ?? ''}`);
  }
  return dados;
}

export function trocarCodigoPorToken(code: string, redirectUri: string) {
  return postToken({ code, redirect_uri: redirectUri, grant_type: 'authorization_code' });
}

/** E-mail da conta autorizada — mostrado na tela para identificar a conexão. */
export async function emailDaConta(accessToken: string): Promise<string> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return '';
    return (await res.json()).email ?? '';
  } catch {
    return '';
  }
}

/**
 * Access token válido da conexão, renovando pelo refresh_token quando expirou.
 * Renova com 1 min de folga para não usar um token que vence no meio da chamada.
 */
export async function tokenValido(conexao: {
  id: string; accessToken: string | null; expiraEm: Date | null; refreshToken: string;
}): Promise<string> {
  const folga = 60_000;
  if (conexao.accessToken && conexao.expiraEm && conexao.expiraEm.getTime() - folga > Date.now()) {
    return conexao.accessToken;
  }
  const novo = await postToken({ refresh_token: conexao.refreshToken, grant_type: 'refresh_token' });
  const expiraEm = new Date(Date.now() + (novo.expires_in ?? 3600) * 1000);
  await prisma.googleAgendaConexao.update({
    where: { id: conexao.id },
    data: { accessToken: novo.access_token, expiraEm },
  });
  return novo.access_token;
}

// ── Eventos ──────────────────────────────────────────────────────────────────
export interface EventoGoogle {
  id: string;
  status?: string;                       // 'cancelled' = removido na origem
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

/**
 * Busca eventos do calendário. Com `syncToken`, o Google devolve só o que mudou
 * desde a última rodada — muito mais barato que reler a agenda toda.
 *
 * Devolve `tokenExpirado` quando o syncToken caducou (acontece após alguns
 * dias, ou se o calendário mudou muito): o chamador deve refazer a carga cheia.
 */
export async function listarEventos(params: {
  accessToken: string;
  calendarId: string;
  syncToken?: string | null;
  desde?: Date;
}): Promise<{ eventos: EventoGoogle[]; novoSyncToken: string | null; tokenExpirado: boolean }> {
  const eventos: EventoGoogle[] = [];
  let pageToken: string | undefined;
  let novoSyncToken: string | null = null;

  do {
    const q = new URLSearchParams({ maxResults: '250', singleEvents: 'true' });
    if (params.syncToken) {
      q.set('syncToken', params.syncToken);
    } else {
      // Carga inicial: não traz a agenda inteira desde sempre.
      q.set('timeMin', (params.desde ?? new Date(Date.now() - 90 * 86400_000)).toISOString());
      q.set('orderBy', 'startTime');
    }
    if (pageToken) q.set('pageToken', pageToken);

    const res = await fetch(
      `${CALENDAR_API}/calendars/${encodeURIComponent(params.calendarId)}/events?${q}`,
      { headers: { Authorization: `Bearer ${params.accessToken}` } },
    );

    if (res.status === 410) return { eventos: [], novoSyncToken: null, tokenExpirado: true };
    if (!res.ok) {
      const erro = await res.text();
      throw new Error(`Google Calendar ${res.status}: ${erro.slice(0, 200)}`);
    }

    const dados = await res.json();
    eventos.push(...(dados.items ?? []));
    pageToken = dados.nextPageToken;
    if (dados.nextSyncToken) novoSyncToken = dados.nextSyncToken;
  } while (pageToken);

  return { eventos, novoSyncToken, tokenExpirado: false };
}

// Evento de dia inteiro vem como `date` (só "2026-09-01"), sem fuso. Sem
// ancorar explicitamente, `new Date()` usa o fuso do SERVIDOR — que na Vercel é
// UTC — e o compromisso apareceria no dia anterior para quem está no Brasil.
// O Brasil não tem mais horário de verão desde 2019, então -03:00 é constante.
const FUSO_BR = '-03:00';

/** Converte o evento do Google para os campos do AgendaEvent. */
export function paraEventoLocal(e: EventoGoogle) {
  const inicio = e.start?.dateTime ?? (e.start?.date ? `${e.start.date}T00:00:00${FUSO_BR}` : null);
  const fim    = e.end?.dateTime   ?? (e.end?.date   ? `${e.end.date}T23:59:59${FUSO_BR}`   : null);
  if (!inicio) return null;
  return {
    titulo:    (e.summary ?? '(sem título)').slice(0, 200),
    descricao: e.description ? e.description.slice(0, 2000) : null,
    data:      new Date(inicio),
    dataFim:   fim ? new Date(fim) : null,
    local:     e.location ? e.location.slice(0, 200) : null,
  };
}
