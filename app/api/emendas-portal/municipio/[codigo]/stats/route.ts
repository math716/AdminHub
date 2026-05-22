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
    const eleitores = snapshot?.eleitores ?? null;
    const tetoMac   = snapshot?.tetoMac   ?? null;
    const tetoPap   = snapshot?.tetoPap   ?? null;
    let fonteHabitantes: string | null = snapshot?.habitantes != null ? (snapshot.fonte ?? 'snapshot') : null;

    // 2. Habitantes via IBGE (fallback) — tentativas em cascata da mais recente
    //    pra mais antiga, parando assim que conseguir um valor.
    if (habitantes == null) {
      type Tentativa = { url: string; ano: string; rotulo: string };
      const tentativas: Tentativa[] = [
        // Censo 2022 — variável 93 (População residente), mais recente
        { url: `https://servicodados.ibge.gov.br/api/v3/agregados/4714/periodos/2022/variaveis/93?localidades=N6[${codigoIbge}]`, ano: '2022', rotulo: 'Censo IBGE 2022' },
        // Estimativas populacionais — variável 9324, anos descendentes
        { url: `https://servicodados.ibge.gov.br/api/v3/agregados/6579/periodos/2024/variaveis/9324?localidades=N6[${codigoIbge}]`, ano: '2024', rotulo: 'Estimativa IBGE 2024' },
        { url: `https://servicodados.ibge.gov.br/api/v3/agregados/6579/periodos/2023/variaveis/9324?localidades=N6[${codigoIbge}]`, ano: '2023', rotulo: 'Estimativa IBGE 2023' },
        { url: `https://servicodados.ibge.gov.br/api/v3/agregados/6579/periodos/2021/variaveis/9324?localidades=N6[${codigoIbge}]`, ano: '2021', rotulo: 'Estimativa IBGE 2021' },
      ];

      for (const t of tentativas) {
        try {
          const res = await fetch(t.url, { next: { revalidate: 86400 } });
          if (!res.ok) continue;
          const data = await res.json();
          const valor = data?.[0]?.resultados?.[0]?.series?.[0]?.serie?.[t.ano];
          if (valor && valor !== '-' && valor !== '...') {
            const n = Number(valor);
            if (Number.isFinite(n) && n > 0) {
              habitantes = n;
              fonteHabitantes = t.rotulo;
              break;
            }
          }
        } catch (e) {
          // tenta a próxima
        }
      }
    }

    return NextResponse.json({
      codigoIbge,
      ano: snapshot?.ano ?? ano,
      habitantes,
      eleitores,
      tetoMac,
      tetoPap,
      fonte: snapshot?.fonte ?? null,
      fonteHabitantes,
      hasSnapshot: !!snapshot,
    });
  } catch (error) {
    console.error('GET /api/emendas-portal/municipio/[codigo]/stats error:', error);
    return NextResponse.json({ error: 'Erro ao buscar stats do município' }, { status: 500 });
  }
}
