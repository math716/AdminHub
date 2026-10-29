// Apoio aos testes que chamam as rotas de verdade: sessão simulada e um
// "banco" de mentira que só responde o que cada teste preparar e anota o que
// a rota pediu. Nenhum teste toca o banco real.
//
// Uso (no topo do arquivo de teste — vi.mock é içado para antes dos imports):
//   const { sessao, banco } = vi.hoisted(() => criarAmbiente());
//   vi.mock('next-auth', () => ({ getServerSession: async () => sessao.atual }));
//   vi.mock('@/lib/auth-options', () => ({ authOptions: {} }));
//   vi.mock('@/lib/db', () => ({ prisma: banco.cliente }));

import { NextRequest } from 'next/server';

export interface UsuarioTeste {
  id: string; role: string; gabineteId: string | null; permissions?: string[]; name?: string;
}

export function criarAmbiente() {
  const sessao: { atual: { user: UsuarioTeste } | null } = { atual: null };

  // Registros por modelo (banco.tabelas.contato = [...]). As buscas filtram
  // pelos campos simples do `where` (id, gabineteId…), como o banco faria;
  // operadores complexos são ignorados. Cada chamada fica em banco.chamadas.
  const tabelas: Record<string, any[]> = {};
  const respostas = new Map<string, (args: any) => any>();
  const chamadas: Array<{ alvo: string; args: any }> = [];
  const casa = (linha: any, where: any): boolean => !where || Object.entries(where).every(([k, v]) => {
    if (k === 'AND' || k === 'OR' || k === 'NOT') return true;
    if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) return linha[k] === v;
    if (typeof v === 'object' && 'equals' in (v as any)) return linha[k] === (v as any).equals;
    if (typeof v === 'object' && 'in' in (v as any)) return (v as any).in.includes(linha[k]);
    return true;
  });
  const modelo = (nome: string) => new Proxy({}, {
    get: (_t, op: string) => async (args: any) => {
      const alvo = `${nome}.${op}`;
      chamadas.push({ alvo, args });
      const r = respostas.get(alvo);
      if (r) return r(args);
      const linhas = (tabelas[nome] ?? []).filter(l => casa(l, args?.where));
      switch (op) {
        case 'findMany': return linhas;
        case 'findFirst': case 'findUnique': return linhas[0] ?? null;
        case 'count': return linhas.length;
        case 'create': return { id: 'novo', ...args?.data };
        case 'update': return { ...(linhas[0] ?? {}), ...args?.data };
        case 'delete': return linhas[0] ?? null;
        case 'updateMany': case 'deleteMany': return { count: linhas.length };
        default: return null;
      }
    },
  });
  const cliente: any = new Proxy({}, {
    get: (_t, nome: string) => {
      if (nome === '$queryRaw' || nome === '$executeRaw') return async () => [];
      if (nome === '$transaction') {
        return async (arg: any) => (typeof arg === 'function' ? arg(cliente) : Promise.all(arg));
      }
      if (nome === 'then') return undefined;
      return modelo(nome);
    },
  });

  const banco = {
    cliente,
    chamadas,
    tabelas,
    responder(alvo: string, fn: (args: any) => any) { respostas.set(alvo, fn); },
    limpar() { respostas.clear(); chamadas.length = 0; for (const k of Object.keys(tabelas)) delete tabelas[k]; },
    pediu(alvo: string) { return chamadas.filter(c => c.alvo === alvo); },
  };
  return { sessao, banco };
}

export function pedido(url: string, metodo = 'GET', corpo?: unknown) {
  return new NextRequest(new URL(url, 'http://localhost'), {
    method: metodo,
    ...(corpo !== undefined && { body: JSON.stringify(corpo), headers: { 'content-type': 'application/json' } }),
  });
}

export const GAB_A = 'gabinete-a';
export const GAB_B = 'gabinete-b';

/** Usuários de exemplo. Assessor só com as áreas que o teste der. */
export const usuarios = {
  chefeA: { id: 'chefe-a', role: 'CHEFE', gabineteId: GAB_A, permissions: [] } as UsuarioTeste,
  assessorA: (permissions: string[] = []) => ({ id: 'assessor-a', role: 'ASSESSOR', gabineteId: GAB_A, permissions }) as UsuarioTeste,
  semGabinete: { id: 'sem-gab', role: 'CHEFE', gabineteId: null, permissions: [] } as UsuarioTeste,
  admin: { id: 'admin', role: 'ADMIN', gabineteId: null, permissions: [] } as UsuarioTeste,
};
