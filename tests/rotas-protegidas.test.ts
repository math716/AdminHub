// Toda rota da API passa pelo verificador de acesso (exigirAcesso) — exceto as
// públicas desta lista, cada uma com o motivo e a proteção que tem no lugar.
//
// É o teste que pega a rota nova criada sem proteção: antes do verificador
// único, cada rota conferia o login do seu jeito, e mais de uma esqueceu um
// passo (permissão da área, gabinete) — o comentário de várias conta a falha.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const RAIZ = path.join(__dirname, '..', 'app', 'api');

/** "rota:MÉTODO" → [motivo, trecho que precisa existir no handler] */
const PUBLICAS: Record<string, [string, string]> = {
  'auth/[...nextauth]:GET': ['o próprio NextAuth', ''],
  'auth/[...nextauth]:POST': ['o próprio NextAuth', ''],
  'signup:POST': ['cadastro aberto (só pede gabinete novo)', 'limiteDeTentativas'],
  'signup/invite:POST': ['cadastro pelo link de convite', 'jwt.verify'],
  'invites:GET': ['confere um link de convite', 'jwt.verify'],
  'registro-gabinete:POST': ['solicitação de gabinete pelo link', 'gabineteConviteLink'],
  'registro-gabinete/[token]:GET': ['confere o link de registro', 'gabineteConviteLink'],
  'cron/enrich-emendas:GET': ['tarefa agendada da Vercel', 'CRON_SECRET'],
  'cron/google-agenda:GET': ['tarefa agendada da Vercel', 'CRON_SECRET'],
  'agenda/google/callback:GET': ['retorno do Google (estado assinado)', 'conferirEstado'],
  'osm/bairros:GET': ['desativada: devolve lista vazia, sem dados', ''],
};

function rotas(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return rotas(p);
    return e.name === 'route.ts' ? [p] : [];
  });
}

/** Corpo de cada handler exportado (do `export … function X` até o próximo export). */
function handlers(fonte: string): Array<{ metodo: string; corpo: string }> {
  const re = /export\s+(?:async\s+function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b|export\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g;
  const achados = [...fonte.matchAll(re)];
  const lista = achados.map((m, i) => ({
    metodo: m[1] ?? m[2],
    corpo: fonte.slice(m.index!, achados[i + 1]?.index ?? fonte.length),
  }));
  // `export { handler as GET, handler as POST }` (NextAuth): o arquivo inteiro.
  for (const m of fonte.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const a of m[1].matchAll(/\bas\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) lista.push({ metodo: a[1], corpo: fonte });
  }
  return lista;
}

/** Funções do próprio arquivo que chamam exigirAcesso (ex.: getSessionAndGabinete). */
function auxiliaresQueConferem(fonte: string): string[] {
  return [...fonte.matchAll(/(?:async\s+)?function\s+(\w+)\s*\([^)]*\)[^{]*\{/g)]
    .filter(m => {
      const resto = fonte.slice(m.index!);
      const fim = resto.search(/\n\}/);
      return /exigirAcesso\(/.test(resto.slice(0, fim === -1 ? undefined : fim));
    })
    .map(m => m[1])
    .filter(n => !/^(GET|POST|PUT|PATCH|DELETE)$/.test(n));
}

const arquivos = rotas(RAIZ);

describe('rotas da API', () => {
  it('encontra as rotas', () => {
    expect(arquivos.length).toBeGreaterThan(80);
  });

  it('nenhuma rota confere o login por conta própria (getServerSession)', () => {
    const fora = arquivos.filter(f => /getServerSession\(/.test(fs.readFileSync(f, 'utf8')));
    expect(fora.map(f => path.relative(RAIZ, f))).toEqual([]);
  });

  it('todo handler passa pelo verificador, ou é público com motivo e proteção própria', () => {
    const problemas: string[] = [];
    const publicasUsadas = new Set<string>();
    for (const f of arquivos) {
      const fonte = fs.readFileSync(f, 'utf8');
      const rota = path.relative(RAIZ, path.dirname(f)).split(path.sep).join('/');
      const aux = auxiliaresQueConferem(fonte);
      for (const { metodo, corpo } of handlers(fonte)) {
        const chave = `${rota}:${metodo}`;
        const protegido = /exigirAcesso\(/.test(corpo) || aux.some(a => new RegExp(`\\b${a}\\(`).test(corpo));
        if (protegido) continue;
        const pub = PUBLICAS[chave];
        if (!pub) { problemas.push(`${chave}: sem exigirAcesso e fora da lista de públicas`); continue; }
        publicasUsadas.add(chave);
        if (pub[1] && !fonte.includes(pub[1])) problemas.push(`${chave}: pública, mas sem a proteção esperada (${pub[1]})`);
      }
    }
    // Lista desatualizada (rota pública que deixou de existir) também é falha.
    for (const k of Object.keys(PUBLICAS)) if (!publicasUsadas.has(k)) problemas.push(`${k}: está na lista de públicas mas não existe mais`);
    expect(problemas).toEqual([]);
  });
});
