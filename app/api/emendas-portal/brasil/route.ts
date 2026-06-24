export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

// GET /api/emendas-portal/brasil?ano=2026
// Retorna { totaisPorUF: { SP: 1234567, MG: 890000, ... } }
// Usado pelo BrazilMap no nível Brasil para colorir o heatmap por emendas.
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const anoRaw = request.nextUrl.searchParams.get('ano');
    const ano = anoRaw ? parseInt(anoRaw, 10) : new Date().getFullYear();

    const grupos = await prisma.emendaParlamentar.groupBy({
      by: ['uf'],
      where: { ano, uf: { not: null } },
      _sum: { valorEmpenhado: true },
    });

    const totaisPorUF: Record<string, number> = {};
    for (const g of grupos) {
      if (g.uf) {
        totaisPorUF[g.uf] = g._sum.valorEmpenhado ?? 0;
      }
    }

    return NextResponse.json({ ano, totaisPorUF });
  } catch (error) {
    console.error('GET /api/emendas-portal/brasil error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
