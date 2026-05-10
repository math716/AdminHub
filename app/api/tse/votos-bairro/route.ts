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

    // Buscar o candidato para verificar se é vereador
    const candidato = await prisma.candidato.findUnique({
      where: { id: candidatoId },
      select: { id: true, cargo: true, uf: true, nome: true }
    });

    if (!candidato) {
      return NextResponse.json({ error: 'Candidato não encontrado' }, { status: 404 });
    }

    // Buscar votos por zona APENAS do candidato selecionado
    const whereClause: any = { candidatoId };
    if (municipio) {
      whereClause.municipio = { equals: municipio, mode: 'insensitive' };
    }

    const votosZona = await prisma.votoZona.findMany({
      where: whereClause,
      orderBy: [{ municipio: 'asc' }, { zona: 'asc' }]
    });

    if (votosZona.length === 0) {
      return NextResponse.json({
        candidatoId,
        cargo: candidato.cargo,
        votosPorBairro: {},
        bairrosInfo: [],
        totalVotos: 0
      });
    }

    // Obter todos os municípios únicos dos votos deste candidato
    const municipiosUnicos = [...new Set(votosZona.map(v => v.municipio))];
    const zonasUnicas = [...new Set(votosZona.map(v => v.zona))];

    // Para cada município, buscar locais de votação
    const locaisVotacao = await prisma.localVotacao.findMany({
      where: {
        OR: municipiosUnicos.map(mun => ({
          nomeMunicipio: { equals: mun, mode: 'insensitive' as const },
          zona: { in: zonasUnicas }
        }))
      },
      select: {
        nomeMunicipio: true,
        zona: true,
        bairro: true,
        nomeLocal: true,
        endereco: true,
        latitude: true,
        longitude: true
      }
    });

    // Criar mapeamento de zona para votos
    const votosPorZonaMap: Record<string, number> = {};
    for (const voto of votosZona) {
      const key = `${voto.municipio.toUpperCase()}_${voto.zona}`;
      votosPorZonaMap[key] = voto.votos;
    }

    // Agregar votos por bairro
    // Como os votos são por zona e não por bairro, precisamos distribuir
    // Primeiro, agrupar locais por zona
    const locaisPorZona: Record<string, Array<{
      bairro: string;
      nomeLocal: string;
      endereco: string;
      latitude: number | null;
      longitude: number | null;
    }>> = {};

    for (const local of locaisVotacao) {
      const key = `${local.nomeMunicipio.toUpperCase()}_${local.zona}`;
      if (!locaisPorZona[key]) {
        locaisPorZona[key] = [];
      }
      locaisPorZona[key].push({
        bairro: local.bairro || 'Não informado',
        nomeLocal: local.nomeLocal,
        endereco: local.endereco || '',
        latitude: local.latitude,
        longitude: local.longitude
      });
    }

    // Calcular votos por bairro
    // Cada bairro receberá uma proporção dos votos da zona com base no número de locais de votação
    const votosPorBairro: Record<string, {
      votos: number;
      zonas: number[];
      municipio: string;
      locais: Array<{
        nome: string;
        endereco: string;
        latitude: number | null;
        longitude: number | null;
      }>;
    }> = {};

    for (const [zonaKey, votos] of Object.entries(votosPorZonaMap)) {
      const locais = locaisPorZona[zonaKey] || [];
      const [municipioUpper, zonaStr] = zonaKey.split('_');
      const zona = parseInt(zonaStr);

      if (locais.length === 0) {
        // Se não temos locais para essa zona, criar um bairro "Zona X"
        const bairroKey = `${municipioUpper}__ZONA_${zona}`;
        if (!votosPorBairro[bairroKey]) {
          votosPorBairro[bairroKey] = {
            votos: 0,
            zonas: [],
            municipio: municipioUpper,
            locais: []
          };
        }
        votosPorBairro[bairroKey].votos += votos;
        if (!votosPorBairro[bairroKey].zonas.includes(zona)) {
          votosPorBairro[bairroKey].zonas.push(zona);
        }
        continue;
      }

      // Agrupar locais por bairro dentro da zona
      const locaisPorBairro: Record<string, typeof locais> = {};
      for (const local of locais) {
        if (!locaisPorBairro[local.bairro]) {
          locaisPorBairro[local.bairro] = [];
        }
        locaisPorBairro[local.bairro].push(local);
      }

      // Distribuir votos proporcionalmente por número de locais em cada bairro
      const totalLocaisZona = locais.length;
      for (const [bairro, locaisBairro] of Object.entries(locaisPorBairro)) {
        const bairroKey = `${municipioUpper}__${bairro}`;
        const votosBairro = Math.round((locaisBairro.length / totalLocaisZona) * votos);

        if (!votosPorBairro[bairroKey]) {
          votosPorBairro[bairroKey] = {
            votos: 0,
            zonas: [],
            municipio: municipioUpper,
            locais: []
          };
        }
        
        votosPorBairro[bairroKey].votos += votosBairro;
        if (!votosPorBairro[bairroKey].zonas.includes(zona)) {
          votosPorBairro[bairroKey].zonas.push(zona);
        }
        
        // Adicionar locais únicos
        for (const local of locaisBairro) {
          const exists = votosPorBairro[bairroKey].locais.some(
            l => l.nome === local.nomeLocal
          );
          if (!exists) {
            votosPorBairro[bairroKey].locais.push({
              nome: local.nomeLocal,
              endereco: local.endereco,
              latitude: local.latitude,
              longitude: local.longitude
            });
          }
        }
      }
    }

    // Formatar resposta final
    const bairrosInfo = Object.entries(votosPorBairro).map(([key, data]) => {
      const [municipio, bairro] = key.split('__');
      return {
        municipio,
        bairro: bairro.startsWith('ZONA_') ? `Zona ${bairro.replace('ZONA_', '')}` : bairro,
        votos: data.votos,
        zonas: data.zonas,
        locais: data.locais
      };
    }).sort((a, b) => b.votos - a.votos);

    // Calcular estatísticas
    const totalVotos = bairrosInfo.reduce((acc, b) => acc + b.votos, 0);
    const mediaVotos = bairrosInfo.length > 0 ? totalVotos / bairrosInfo.length : 0;

    return NextResponse.json({
      candidatoId,
      cargo: candidato.cargo,
      nome: candidato.nome,
      totalVotos,
      mediaVotosBairro: Math.round(mediaVotos),
      bairrosComVotos: bairrosInfo.filter(b => b.votos > 0).length,
      bairrosInfo,
      municipiosUnicos
    });

  } catch (error) {
    console.error('Erro ao buscar votos por bairro:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
