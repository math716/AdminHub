// Sincronização Google Agenda → agenda do gabinete.
//
// Direção única, de propósito: o AdminHub só LÊ o Google. Nada que se faça aqui
// altera ou apaga a agenda real do parlamentar.

import { prisma } from '@/lib/db';
import { listarEventos, paraEventoLocal, tokenValido } from '@/lib/google-agenda';
import { geocodificarLote, ancoraDoGabinete } from '@/lib/geocode';

export interface ResultadoSync {
  ok: boolean;
  criados: number;
  atualizados: number;
  removidos: number;
  erro?: string;
}

function emLotes<T>(itens: T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
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

    const agora = new Date();

    // Cancelados na origem somem daqui também — numa tacada só, em vez de um
    // deleteMany por evento. O filtro por origem garante que só apagamos o
    // que veio do Google.
    const idsCancelados = r.eventos.filter(ev => ev.status === 'cancelled').map(ev => ev.id);
    const removidos = idsCancelados.length === 0 ? 0 : (await prisma.agendaEvent.deleteMany({
      where: { gabineteId, googleEventId: { in: idsCancelados }, origem: 'GOOGLE' },
    })).count;

    const validos = r.eventos
      .filter(ev => ev.status !== 'cancelled')
      .map(ev => ({ ev, campos: paraEventoLocal(ev) }))
      .filter((x): x is { ev: typeof x.ev; campos: NonNullable<typeof x.campos> } => x.campos !== null);

    let criados = 0, atualizados = 0;

    if (validos.length > 0) {
      // Uma consulta só para saber quais já existem — antes era um findFirst
      // por evento. Numa agenda com centenas ou milhares de compromissos
      // (o caso de uma agenda compartilhada bem movimentada), essa troca de
      // N idas ao banco por 1 é o que evita a função estourar os 5 minutos
      // da Vercel no meio da sincronização.
      const idsGoogle = validos.map(v => v.ev.id);
      const existentes = await prisma.agendaEvent.findMany({
        where: { gabineteId, googleEventId: { in: idsGoogle } },
        select: { id: true, googleEventId: true },
      });
      const idLocalPorGoogleId = new Map(existentes.map(e => [e.googleEventId as string, e.id]));

      const autorPadrao = conexao.conectadoPorId ?? (await primeiroUsuario(gabineteId));
      const paraCriar = validos.filter(v => !idLocalPorGoogleId.has(v.ev.id));
      const paraAtualizar = validos.filter(v => idLocalPorGoogleId.has(v.ev.id));

      // createMany é um único round trip por lote, não um por linha — a carga
      // inicial de uma agenda cheia (a primeira sincronização, sem syncToken)
      // é praticamente só criação.
      for (const lote of emLotes(paraCriar, 500)) {
        const { count } = await prisma.agendaEvent.createMany({
          data: lote.map(v => ({
            ...v.campos,
            origem: 'GOOGLE' as const,
            googleEventId: v.ev.id,
            sincronizadoEm: agora,
            tipo: 'COMPROMISSO' as const,
            gabineteId,
            // A agenda do Google não tem autor no AdminHub; fica com quem
            // conectou, para o evento ter um responsável rastreável.
            createdById: autorPadrao,
          })),
          skipDuplicates: true,
        });
        criados += count;
      }

      // O Prisma não tem update em lote — mas rodar em paralelo em vez de um
      // de cada vez é o que muda de minutos para segundos. Nas rodadas depois
      // da primeira, a sincronização é quase só atualização, e era exatamente
      // aí que o tempo se acumulava.
      const CONCORRENCIA = 8; // dentro do limite de 10 conexões de lib/db.ts
      for (const lote of emLotes(paraAtualizar, CONCORRENCIA)) {
        await Promise.all(lote.map(v =>
          prisma.agendaEvent.update({
            where: { id: idLocalPorGoogleId.get(v.ev.id)! },
            data: { ...v.campos, sincronizadoEm: agora },
          })
        ));
        atualizados += lote.length;
      }
    }

    await preencherCoordenadas(gabineteId);

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

/**
 * Preenche as coordenadas dos eventos do Google que ainda não têm.
 *
 * Roda depois da sincronização, sobre o que está no banco, em vez de dentro do
 * laço: assim pega tanto os eventos recém-criados quanto os que já existiam de
 * rodadas anteriores — o histórico vai se completando a cada sincronização, sem
 * precisar de migração.
 *
 * O Nominatim admite uma consulta por segundo, então o lote é pequeno e tem
 * orçamento de tempo. O que não couber nesta rodada entra na próxima.
 */
async function preencherCoordenadas(gabineteId: string): Promise<void> {
  const LOTE = 12;             // ~13s de relógio, folgado dentro do limite da função
  const ORCAMENTO_MS = 20_000;

  const pendentes = await prisma.agendaEvent.findMany({
    where: {
      gabineteId,
      origem: 'GOOGLE',
      lat: null,
      // Sem local não há o que geocodificar — nem adianta trazer.
      local: { not: null },
      data: { gte: new Date() },   // agenda futura primeiro; passado não vira rota
    },
    orderBy: { data: 'asc' },
    take: LOTE,
    select: { id: true, local: true, endereco: true },
  });
  if (pendentes.length === 0) return;

  // geocodificarLote é quem aplica a pausa entre consultas — chamar
  // geocodificar em laço aqui estouraria o limite do Nominatim.
  const ancora = await ancoraDoGabinete(gabineteId);
  const coords = await geocodificarLote(pendentes, { ancora, maximo: LOTE, orcamentoMs: ORCAMENTO_MS });

  for (let i = 0; i < pendentes.length; i++) {
    const coord = coords[i];
    if (!coord) continue;   // sem endereço, ou endereço que o Nominatim não conhece
    await prisma.agendaEvent.update({
      where: { id: pendentes[i].id },
      data: { lat: coord.lat, lng: coord.lng },
    }).catch(() => {});      // evento apagado no meio da sincronização
  }
}

/** Fallback de autoria quando quem conectou não está mais registrado. */
async function primeiroUsuario(gabineteId: string): Promise<string> {
  const u = await prisma.user.findFirst({ where: { gabineteId }, select: { id: true } });
  if (!u) throw new Error('Gabinete sem usuários para atribuir os eventos importados.');
  return u.id;
}
