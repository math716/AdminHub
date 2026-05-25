export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { searchParlamentares, PORTAL_MOCK_MODE } from '@/lib/portal-transparencia';

// Busca parlamentares por nome — banco-first com fallback ao Portal.
//
// Estratégia em camadas:
//   1) Tenta no banco (tabela Parlamentar). Instantâneo, sem rate limit.
//      Match case-insensitive em `nome` e `nomeUrna`.
//   2) Se banco vazio (ou pouquíssimos resultados), cai pro Portal ao vivo.
//      Vale como fallback enquanto a sincronização não cobriu o autor buscado.
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
    if (q.length < 2) return NextResponse.json({ results: [], mock: PORTAL_MOCK_MODE, fonte: 'banco' });

    // ── 1) Banco ──────────────────────────────────────────────────────
    const noBanco = await prisma.parlamentar.findMany({
      where: {
        OR: [
          { nome:     { contains: q, mode: 'insensitive' } },
          { nomeUrna: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        cpf: true, idPortal: true, nome: true, nomeUrna: true,
        partido: true, uf: true, cargo: true,
      },
      take: 20,
      orderBy: { nome: 'asc' },
    });

    // Threshold pra decidir se vale fallback: se banco tem pelo menos 3 hits,
    // confia no banco. Caso contrário, complementa com Portal.
    if (noBanco.length >= 3) {
      return NextResponse.json({
        results: noBanco.map((p) => ({
          cpf: p.cpf, idPortal: p.idPortal ?? p.nome, nome: p.nome,
          nomeUrna: p.nomeUrna, partido: p.partido, uf: p.uf, cargo: p.cargo,
        })),
        mock: false,
        fonte: 'banco' as const,
      });
    }

    // ── 2) Fallback Portal ─────────────────────────────────────────────
    const doPortal = await searchParlamentares(q);

    // Mescla: primeiro os do banco, depois os novos do Portal (dedup por nome).
    const seen = new Set(noBanco.map((p) => p.nome.toLowerCase()));
    const extras = doPortal.filter((p) => !seen.has(p.nome.toLowerCase()));
    const results = [
      ...noBanco.map((p) => ({
        cpf: p.cpf, idPortal: p.idPortal ?? p.nome, nome: p.nome,
        nomeUrna: p.nomeUrna, partido: p.partido, uf: p.uf, cargo: p.cargo,
      })),
      ...extras,
    ];

    return NextResponse.json({
      results,
      mock: PORTAL_MOCK_MODE,
      fonte: noBanco.length > 0 ? ('misto' as const) : ('portal' as const),
    });
  } catch (error) {
    console.error('GET /api/emendas-portal/parlamentares error:', error);
    return NextResponse.json({ error: 'Erro ao buscar parlamentares' }, { status: 500 });
  }
}
