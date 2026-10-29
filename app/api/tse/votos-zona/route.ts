export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exigirAcesso } from '@/lib/acesso-api';
import { PERMISSIONS } from '@/lib/permissions';

export async function GET(request: NextRequest) {
  try {
    const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.MAPA_ELEITORAL, PERMISSIONS.PROJETO_CAMPANHA] });
    if (acesso instanceof NextResponse) return acesso;

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

    // Buscar informações dos locais de votação — query única para todos os municípios
    const municipiosNomes = Object.keys(votosPorMunicipio);
    const zonasInfo: Record<string, Array<{ zona: number; locais: any[] }>> = {};

    if (municipiosNomes.length > 0) {
      const todosLocais = await prisma.localVotacao.findMany({
        where: {
          OR: municipiosNomes.map(nome => ({
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

      // Agrupar por município e zona
      for (const municipioNome of municipiosNomes) {
        const locaisMun = todosLocais.filter(
          l => l.nomeMunicipio.toLowerCase() === municipioNome.toLowerCase()
        );
        const locaisPorZona: Record<number, any[]> = {};
        for (const local of locaisMun) {
          if (!locaisPorZona[local.zona]) locaisPorZona[local.zona] = [];
          locaisPorZona[local.zona].push(local);
        }
        zonasInfo[municipioNome] = Object.entries(locaisPorZona).map(([zona, locais]) => ({
          zona: parseInt(zona),
          locais,
        }));
      }
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
