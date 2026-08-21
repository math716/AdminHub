// Sincronização Google Agenda → agenda do gabinete.
//
// Direção única, de propósito: o AdminHub só LÊ o Google. Nada que se faça aqui
// altera ou apaga a agenda real do parlamentar.

import { prisma } from '@/lib/db';
import { listarEventos, paraEventoLocal, tokenValido } from '@/lib/google-agenda';

export interface ResultadoSync {
  ok: boolean;
  criados: number;
  atualizados: number;
  removidos: number;
  erro?: string;
}

/**
 * Traz do Google o que mudou e reflete na agenda do gabinete.
 *
 * Eventos importados ficam com origem=GOOGLE e guardam o googleEventId, o que
 * permite atualizá-los na rodada seguinte em vez de duplicar. Eventos criados
 * à mão no AdminHub (origem=MANUAL) nunca são tocados.
 */
export async function sincronizarGabinete(gabineteId: string): Promise<ResultadoSync> {
  const conexao = await prisma.googleAgendaConexao.findUnique({ where: { gabineteId } });
  if (!conexao) return { ok: false, criados: 0, atualizados: 0, removidos: 0, erro: 'Gabinete sem Google Agenda conectado.' };

  try {
    const accessToken = await tokenValido(conexao);

    let r = await listarEventos({
      accessToken,
      calendarId: conexao.calendarId,
      syncToken: conexao.syncToken,
    });

    // syncToken caduca depois de alguns dias. Quando isso acontece, o Google
    // responde 410 e a única saída é refazer a carga cheia.
    if (r.tokenExpirado) {
      r = await listarEventos({ accessToken, calendarId: conexao.calendarId, syncToken: null });
    }

    let criados = 0, atualizados = 0, removidos = 0;
    const agora = new Date();

    for (const ev of r.eventos) {
      // Cancelado na origem: some daqui também. O filtro por origem garante que
      // só apagamos o que veio do Google.
      if (ev.status === 'cancelled') {
        const del = await prisma.agendaEvent.deleteMany({
          where: { gabineteId, googleEventId: ev.id, origem: 'GOOGLE' },
        });
        removidos += del.count;
        continue;
      }

      const campos = paraEventoLocal(ev);
      if (!campos) continue; // sem data utilizável

      const existente = await prisma.agendaEvent.findFirst({
        where: { gabineteId, googleEventId: ev.id },
        select: { id: true },
      });

      if (existente) {
        await prisma.agendaEvent.update({
          where: { id: existente.id },
          data: { ...campos, sincronizadoEm: agora },
        });
        atualizados++;
      } else {
        await prisma.agendaEvent.create({
          data: {
            ...campos,
            origem: 'GOOGLE',
            googleEventId: ev.id,
            sincronizadoEm: agora,
            tipo: 'COMPROMISSO',
            gabineteId,
            // A agenda do Google não tem autor no AdminHub; fica com quem
            // conectou, para o evento ter um responsável rastreável.
            createdById: conexao.conectadoPorId ?? (await primeiroUsuario(gabineteId)),
          },
        });
        criados++;
      }
    }

    await prisma.googleAgendaConexao.update({
      where: { id: conexao.id },
      data: {
        syncToken: r.novoSyncToken ?? conexao.syncToken,
        ultimaSync: agora,
        ultimoErro: null,
        eventosImportados: { increment: criados },
      },
    });

    return { ok: true, criados, atualizados, removidos };
  } catch (err) {
    const erro = String((err as Error)?.message ?? err).slice(0, 400);
    // Guarda o motivo para a tela poder mostrar "falhou porque…" em vez de
    // simplesmente parar de atualizar em silêncio.
    await prisma.googleAgendaConexao.update({
      where: { id: conexao.id },
      data: { ultimoErro: erro, ultimaSync: new Date() },
    }).catch(() => {});
    console.error(`[google-agenda] gabinete ${gabineteId}:`, erro);
    return { ok: false, criados: 0, atualizados: 0, removidos: 0, erro };
  }
}

/** Fallback de autoria quando quem conectou não está mais registrado. */
async function primeiroUsuario(gabineteId: string): Promise<string> {
  const u = await prisma.user.findFirst({ where: { gabineteId }, select: { id: true } });
  if (!u) throw new Error('Gabinete sem usuários para atribuir os eventos importados.');
  return u.id;
}
