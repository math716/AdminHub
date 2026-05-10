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

    // Buscar informações dos locais de votação para cada zona
    const zonasInfo: Record<string, Array<{ zona: number; locais: any[] }>> = {};
    
    for (const municipioNome of Object.keys(votosPorMunicipio)) {
      const locaisVotacao = await prisma.localVotacao.findMany({
        where: {
          nomeMunicipio: { equals: municipioNome, mode: 'insensitive' }
        },
        select: {
          zona: true,
          nomeLocal: true,
          endereco: true,
          bairro: true,
          latitude: true,
          longitude: true
        }
      });

      // Agrupar locais por zona
      const locaisPorZona: Record<number, any[]> = {};
      for (const local of locaisVotacao) {
        if (!locaisPorZona[local.zona]) {
          locaisPorZona[local.zona] = [];
        }
        locaisPorZona[local.zona].push(local);
      }

      zonasInfo[municipioNome] = Object.entries(locaisPorZona).map(([zona, locais]) => ({
        zona: parseInt(zona),
        locais
      }));
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
