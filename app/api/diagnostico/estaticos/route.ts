// Diagnóstico TEMPORÁRIO: de qual endereço a função consegue baixar os
// arquivos de public/ em produção.
//
// Existe por causa de uma falha concreta: a base do TSE foi migrada de leitura
// em disco para HTTP, o /api/tse/candidato passou a devolver 404 e a migração
// teve de ser revertida. O teste local usava um servidor aberto, então não
// reproduziu o ambiente real. Esta rota responde à pergunta com medida, não
// com suposição — e depois pode ser apagada.
//
// Acesse logado: /api/diagnostico/estaticos

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

/** O menor arquivo da base (~80 KB) — só interessa se o download acontece. */
const ALVO = '/data/tse/2022/DF.json.gz';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const host = request.headers.get('host') ?? '';
  const proto = host.startsWith('localhost') ? 'http' : 'https';

  const candidatas: Array<{ origem: string; base: string | null }> = [
    { origem: 'host do pedido (usado pelo mapa de bairros, que funciona)', base: host ? `${proto}://${host}` : null },
    { origem: 'VERCEL_URL (URL do deployment)', base: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null },
    { origem: 'VERCEL_PROJECT_PRODUCTION_URL', base: process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null },
    { origem: 'VERCEL_BRANCH_URL', base: process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : null },
    { origem: 'NEXTAUTH_URL', base: process.env.NEXTAUTH_URL ?? null },
  ];

  const testes = [];
  for (const { origem, base } of candidatas) {
    if (!base) { testes.push({ origem, base: null, resultado: 'variável ausente' }); continue; }

    const inicio = Date.now();
    try {
      const res = await fetch(`${base}${ALVO}`, { redirect: 'manual' });
      const bytes = res.ok ? (await res.arrayBuffer()).byteLength : 0;
      testes.push({
        origem,
        base,
        status: res.status,
        // 401/403 aqui = proteção de deploy barrando a própria função;
        // 3xx = redirecionamento (provável tela de autenticação da Vercel).
        redirecionadoPara: res.headers.get('location') ?? undefined,
        contentType: res.headers.get('content-type') ?? undefined,
        bytes,
        ms: Date.now() - inicio,
        funciona: res.ok && bytes > 1000,
      });
    } catch (err) {
      testes.push({ origem, base, erro: String(err).slice(0, 200), ms: Date.now() - inicio });
    }
  }

  return NextResponse.json({
    alvo: ALVO,
    ambiente: {
      VERCEL_ENV: process.env.VERCEL_ENV ?? null,
      REGIAO: process.env.VERCEL_REGION ?? null,
      temProtecaoBypass: Boolean(process.env.VERCEL_AUTOMATION_BYPASS_SECRET),
    },
    testes,
    comoLer: 'A candidata com "funciona": true é a que a migração deve usar. '
      + 'Status 401/403 ou redirecionamento indica proteção de deploy barrando a própria função.',
  });
}
