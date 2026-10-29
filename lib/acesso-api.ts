// Conferência da permissão da área nas rotas de API.
//
// O menu e o middleware já escondem as páginas, mas as rotas também precisam
// recusar: sem isto, qualquer usuário logado lia e gravava dados de áreas que
// não tem liberadas chamando a rota direto. Papel e permissões vêm da sessão,
// que é reconferida no banco a cada minuto (lib/auth-options.ts).

import { NextResponse } from 'next/server';
import { getServerSession, type Session } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { hasPermission, type Permission } from '@/lib/permissions';

/**
 * Resposta 403 se o usuário não tem NENHUMA das permissões; null se pode
 * seguir. Mais de uma permissão = rota usada por mais de uma área (ex.: os
 * dados do TSE servem ao Mapa Eleitoral e ao Projeto de Campanha).
 */
export function semPermissao(session: any, ...permissoes: Permission[]): NextResponse | null {
  const user = { role: session?.user?.role, permissions: session?.user?.permissions ?? [] };
  if (permissoes.some(p => hasPermission(user, p))) return null;
  return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
}

// ─── Verificador único das rotas ────────────────────────────────────────────
// Cada rota repetia o mesmo bloco (sessão → permissão → gabinete), cada uma do
// seu jeito, com `(session.user as any)` espalhado. Basta uma esquecer um passo
// para um usuário ver o que não deve. Aqui o bloco é um só:
//
//   const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.CONTATOS], gabinete: 'sessao' });
//   if (acesso instanceof NextResponse) return acesso;
//   acesso.gabineteId // string garantida
//
// Respostas: 401 sem login · 403 sem permissão/papel · 400 sem gabinete.

export interface Acesso {
  session: Session;
  userId: string;
  role: string;
  permissions: string[];
  gabineteId: string | null;
  gabineteNome: string | null;
}
export type AcessoComGabinete = Acesso & { gabineteId: string };

interface OpcoesAcesso {
  /** Basta UMA das permissões (rota usada por mais de uma área). */
  permissoes?: Permission[];
  /** Só estes papéis (ex.: ['ADMIN', 'SUPER_ADMIN']). */
  papeis?: string[];
  /**
   * Exige gabinete. 'sessao' lê do login; 'banco' relê do cadastro do usuário
   * (o que algumas rotas sempre fizeram — a troca de gabinete grava nos dois).
   */
  gabinete?: 'sessao' | 'banco';
}

export async function exigirAcesso(opcoes: OpcoesAcesso & { gabinete: 'sessao' | 'banco' }): Promise<AcessoComGabinete | NextResponse>;
export async function exigirAcesso(opcoes?: OpcoesAcesso): Promise<Acesso | NextResponse>;
export async function exigirAcesso(opcoes: OpcoesAcesso = {}): Promise<Acesso | NextResponse> {
  const session = await getServerSession(authOptions);
  const u = session?.user as Record<string, any> | undefined;
  if (!session || !u?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const acesso: Acesso = {
    session,
    userId: String(u.id),
    role: String(u.role ?? ''),
    permissions: Array.isArray(u.permissions) ? u.permissions : [],
    gabineteId: u.gabineteId ?? null,
    gabineteNome: u.gabineteNome ?? null,
  };

  if (opcoes.permissoes?.length) {
    const negado = semPermissao(session, ...opcoes.permissoes);
    if (negado) return negado;
  }
  if (opcoes.papeis && !opcoes.papeis.includes(acesso.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }
  if (opcoes.gabinete) {
    if (opcoes.gabinete === 'banco') acesso.gabineteId = await gabineteDoUsuario(acesso.userId);
    if (!acesso.gabineteId) return NextResponse.json({ error: 'Usuário sem gabinete associado' }, { status: 400 });
  }
  return acesso;
}

/** O gabinete do usuário, relido do cadastro (null se não tiver). */
export async function gabineteDoUsuario(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { gabineteId: true } });
  return u?.gabineteId ?? null;
}
