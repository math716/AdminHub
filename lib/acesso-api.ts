// Conferência da permissão da área nas rotas de API.
//
// O menu e o middleware já escondem as páginas, mas as rotas também precisam
// recusar: sem isto, qualquer usuário logado lia e gravava dados de áreas que
// não tem liberadas chamando a rota direto. Papel e permissões vêm da sessão,
// que é reconferida no banco a cada minuto (lib/auth-options.ts).

import { NextResponse } from 'next/server';
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
