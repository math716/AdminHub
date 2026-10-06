// A quem pertence a conversa da Gabi de quem está logado.
//
// Antes, as rotas do histórico buscavam o gabinete NO BANCO e, sem ele,
// respondiam "Gabinete não encontrado". As duas contas de administração não
// têm gabinete até escolher um no seletor — e todo salvamento delas era
// recusado em silêncio: a Gabi respondia, mas o histórico ficava vazio.
//
// Agora:
// - ADMIN/SUPER_ADMIN: o gabinete escolhido no seletor, lido do TOKEN — é o
//   mesmo que a Gabi usa para responder e o que a tela mostra. Sem gabinete
//   escolhido, a conversa fica com a própria pessoa.
// - Demais perfis: o gabinete do cadastro, como sempre. Esses perfis sempre
//   têm gabinete; se um dia faltar, a conversa também fica com a pessoa em vez
//   de se perder.
//
// O resultado serve direto como filtro (`where`) e como dado de criação.

import { prisma } from '@/lib/db';

export type DonoConversa =
  | { gabineteId: string }
  | { usuarioId: string; gabineteId: null };

export async function donoDaConversa(session: any): Promise<DonoConversa | null> {
  const user = session?.user ?? {};
  const userId = user.id as string | undefined;
  if (!userId) return null;

  let gabineteId: string | null = null;
  if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
    gabineteId = (user.gabineteId as string | null | undefined) ?? null;
  } else {
    const registro = await prisma.user.findUnique({ where: { id: userId }, select: { gabineteId: true } });
    gabineteId = registro?.gabineteId ?? null;
  }

  return gabineteId ? { gabineteId } : { usuarioId: userId, gabineteId: null };
}
