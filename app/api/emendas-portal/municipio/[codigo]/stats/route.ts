export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

// Stats compostas de um município: habitantes (IBGE), eleitores (TSE),
// teto MAC (Média/Alta Complexidade), teto PAP (Atenção Primária).
// MAC/PAP são importados manualmente em MunicipioStats; habitantes/eleitores
// caem em fallback no IBGE ao vivo se ainda não tiver snapshot.
export async function GET(request: NextRequest, { params }: { params: { codigo: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const codigoIbge = params.codigo;
    const anoRaw = request.nextUrl.searchParams.get('ano');
    const ano = anoRaw ? parseInt(anoRaw, 10) : new Date().getFullYear();

    // 1. Tenta snapshot no banco (ano exato, depois mais recente).
    const snapshot =
      (await prisma.municipioStats.findUnique({
        where: { codigoIbge_ano: { codigoIbge, ano } },
      })) ??
      (await prisma.municipioStats.findFirst({
        where: { codigoIbge },
        orderBy: { ano: 'desc' },
      }));

    let habitantes = snapshot?.habitantes ?? null;
    let eleitores  = snapshot?.eleitores  ?? null;
    const tetoMac  = snapshot?.tetoMac    ?? null;
    const tetoPap  = snapshot?.tetoPap    ?? null;

    // 2. Habitantes via IBGE (fallback) — só quando não temos snapshot.
    if (habitantes == null) {
      try {
        const res = await fetch(
          `https://servicodados.ibge.gov.br/api/v3/agregados/6579/periodos/2021/variaveis/9324?localidades=N6[${codigoIbge}]`,
          { next: { revalidate: 86400 } },
        );
        if (res.ok) {
          const data = await res.json();
          const valor = data?.[0]?.resultados?.[0]?.series?.[0]?.serie?.['2021'];
          if (valor && valor !== '-') habitantes = Number(valor);
        }
      } catch {}
    }

    return NextResponse.json({
      codigoIbge,
      ano: snapshot?.ano ?? ano,
      habitantes,
      eleitores,
      tetoMac,
      tetoPap,
      fonte: snapshot?.fonte ?? null,
      hasSnapshot: !!snapshot,
    });
  } catch (error) {
    console.error('GET /api/emendas-portal/municipio/[codigo]/stats error:', error);
    return NextResponse.json({ error: 'Erro ao buscar stats do município' }, { status: 500 });
  }
}
