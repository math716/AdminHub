export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const candidatoId = searchParams.get('candidatoId');
    const municipio = searchParams.get('municipio');

    if (!candidatoId) {
      return NextResponse.json({ error: 'candidatoId é obrigatório' }, { status: 400 });
    }

    // Buscar votos por zona do candidato
    const whereClause: any = { candidatoId };
    if (municipio) {
      whereClause.municipio = { equals: municipio, mode: 'insensitive' };
    }

    const votosZona = await prisma.votoZona.findMany({
      where: whereClause,
      orderBy: [{ municipio: 'asc' }, { zona: 'asc' }]
    });

    // Agrupar por município
    const votosPorMunicipio: Record<string, { total: number; zonas: Array<{ zona: number; votos: number }> }> = {};
    
    for (const voto of votosZona) {
      if (!votosPorMunicipio[voto.municipio]) {
        votosPorMunicipio[voto.municipio] = { total: 0, zonas: [] };
      }
      votosPorMunicipio[voto.municipio].total += voto.votos;
      votosPorMunicipio[voto.municipio].zonas.push({
        zona: voto.zona,
        votos: voto.votos
      });
    }

    // Buscar locais de votacao de TODOS os municipios em uma unica query
    // (eliminando o N+1 antigo: 1 round-trip por municipio).
    const municipiosNomes = Object.keys(votosPorMunicipio);
    const todosLocais = municipiosNomes.length === 0
      ? []
      : await prisma.localVotacao.findMany({
          where: {
            OR: municipiosNomes.map((nome) => ({
              nomeMunicipio: { equals: nome, mode: 'insensitive' as const },
            })),
          },
          select: {
            zona: true,
            nomeLocal: true,
            endereco: true,
            bairro: true,
            latitude: true,
            longitude: true,
            nomeMunicipio: true,
          },
        });

    // Indexa locais por municipio (lowercase) -> por zona
    const locaisPorMunicipioZona = new Map<string, Map<number, any[]>>();
    for (const local of todosLocais) {
      const key = local.nomeMunicipio?.toLowerCase() ?? '';
      let zonaMap = locaisPorMunicipioZona.get(key);
      if (!zonaMap) {
        zonaMap = new Map();
        locaisPorMunicipioZona.set(key, zonaMap);
      }
      const lista = zonaMap.get(local.zona) ?? [];
      // Remove o campo auxiliar antes de devolver
      const { nomeMunicipio: _, ...localSemMun } = local;
      lista.push(localSemMun);
      zonaMap.set(local.zona, lista);
    }

    const zonasInfo: Record<string, Array<{ zona: number; locais: any[] }>> = {};
    for (const municipioNome of municipiosNomes) {
      const zonaMap = locaisPorMunicipioZona.get(municipioNome.toLowerCase()) ?? new Map();
      zonasInfo[municipioNome] = Array.from(zonaMap.entries()).map(
        ([zona, locais]) => ({ zona, locais })
      );
    }

    return NextResponse.json({
      candidatoId,
      totalVotos: votosZona.reduce((acc, v) => acc + v.votos, 0),
      votosPorMunicipio,
      zonasInfo
    });

  } catch (error) {
    console.error('Erro ao buscar votos por zona:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
