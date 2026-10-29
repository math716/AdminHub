export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exigirAcesso } from '@/lib/acesso-api';
import { PERMISSIONS } from '@/lib/permissions';
import { calcularTotaisBrasil, chaveResumoBrasil, lerResumoPronto } from '@/lib/emendas/resumo-emendas';

type TotaisBrasil = Awaited<ReturnType<typeof calcularTotaisBrasil>>;

// Ler o resumo pronto (tabela emendas_resumos) — mesma chave da rota /resumo.
const USAR_RESUMO_PRONTO = true;

// GET /api/emendas-portal/brasil?ano=2026
// Retorna { totaisPorUF: { SP: 1234567, MG: 890000, ... } }
// Usado pelo BrazilMap no nível Brasil para colorir o heatmap por emendas.
export async function GET(request: NextRequest) {
  try {
    const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.EMENDAS_MAPA] });
    if (acesso instanceof NextResponse) return acesso;

    const anoRaw = request.nextUrl.searchParams.get('ano');
    const ano = anoRaw ? parseInt(anoRaw, 10) : new Date().getFullYear();

    if (USAR_RESUMO_PRONTO) {
      const qtd = await prisma.emendaParlamentar.count({ where: { ano, uf: { not: null } } });
      const pronto = await lerResumoPronto<TotaisBrasil>(prisma, chaveResumoBrasil(ano), qtd);
      if (pronto) return NextResponse.json(pronto);
    }

    return NextResponse.json(await calcularTotaisBrasil(prisma, ano));
  } catch (error) {
    console.error('GET /api/emendas-portal/brasil error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
