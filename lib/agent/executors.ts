import { prisma } from '@/lib/db';
import { loadStaticTseData, buscarCandidatoNoJson, normalizarTextoTse, bairrosPorZona } from '@/lib/tse-static';
import type { Session } from 'next-auth';

type UserSession = Session & { user: any };

// ---------------------------------------------------------------------------
// buscar_emendas
// ---------------------------------------------------------------------------
export async function executarBuscarEmendas(
  args: {
    parlamentar_nome?: string;
    uf?: string;
    municipio?: string;
    area?: string;
    ano?: number;
    esfera?: string;
  },
  _session: UserSession,
) {
  // Exige pelo menos um filtro para evitar dumps desnecessários
  if (!args.parlamentar_nome && !args.uf && !args.municipio && !args.area && !args.ano) {
    return { erro: 'Informe ao menos um filtro (parlamentar, UF, município, área ou ano).' };
  }

  const emendas = await prisma.emendaParlamentar.findMany({
    where: {
      ...(args.parlamentar_nome && {
        parlamentar: {
          nome: { contains: args.parlamentar_nome, mode: 'insensitive' },
        },
      }),
      ...(args.uf && { uf: args.uf.toUpperCase() }),
      ...(args.municipio && {
        municipioNome: { contains: args.municipio, mode: 'insensitive' },
      }),
      ...(args.area && { area: args.area as any }),
      ...(args.ano && { ano: Number(args.ano) }),
      ...(args.esfera && { esfera: args.esfera as any }),
    },
    include: {
      parlamentar: {
        select: { nome: true, partido: true, uf: true, cargo: true },
      },
    },
    orderBy: { valorPago: 'desc' },
    take: 100,
  });

  if (emendas.length === 0) {
    return { encontrado: false, mensagem: 'Nenhuma emenda encontrada com esses filtros.' };
  }

  const totalEmpenhado = emendas.reduce((s, e) => s + e.valorEmpenhado, 0);
  const totalPago = emendas.reduce((s, e) => s + e.valorPago, 0);

  return {
    encontrado: true,
    total: emendas.length,
    totalEmpenhado,
    totalPago,
    execucaoGeral: totalEmpenhado > 0
      ? Math.round((totalPago / totalEmpenhado) * 100)
      : 0,
    emendas: emendas.map(e => ({
      parlamentar: e.parlamentar?.nome ?? 'N/A',
      partido: e.parlamentar?.partido ?? '',
      cargo: e.parlamentar?.cargo ?? '',
      ano: e.ano,
      area: e.area,
      objeto: e.objeto ?? '',
      municipio: e.municipioNome ?? '',
      uf: e.uf ?? '',
      esfera: e.esfera,
      valorEmpenhado: e.valorEmpenhado,
      valorPago: e.valorPago,
      execucao: e.valorEmpenhado > 0
        ? Math.round((e.valorPago / e.valorEmpenhado) * 100)
        : 0,
    })),
  };
}

// ---------------------------------------------------------------------------
// buscar_votacao
// ---------------------------------------------------------------------------
export async function executarBuscarVotacao(
  args: {
    candidato_nome: string;
    ano?: number;
    uf?: string;
    municipio?: string;
    cargo?: string;
  },
  _session: UserSession,
) {
  const anoStr  = args.ano ? String(args.ano) : '2022';
  const ufQuery = args.uf?.toUpperCase();

  const semNome = !args.candidato_nome || String(args.candidato_nome).trim().length < 2;
  // Sem nome exige cargo, senão misturaria todos os cargos
  if (semNome && !args.cargo) {
    return { encontrado: false, mensagem: 'Para listar/comparar todos os candidatos, informe o cargo (ex: Governador, Prefeito, Presidente).' };
  }

  const cargoNorm      = args.cargo ? normalizarTextoTse(args.cargo) : '';
  const isPresidencial = cargoNorm.includes('president') || ufQuery === 'BR';

  // Para presidentes busca BR; para outros tenta o estado, depois BR
  const ufsParaBuscar = isPresidencial
    ? ['BR']
    : ufQuery
    ? [ufQuery, 'BR']
    : ['BR'];

  for (const uf of ufsParaBuscar) {
    const staticData = loadStaticTseData(anoStr, uf);
    if (!staticData) continue;

    const todos = buscarCandidatoNoJson(staticData, semNome ? '' : args.candidato_nome, args.cargo)
      .sort((a, b) => b.totalVotos - a.totalVotos);
    const resultados = todos.slice(0, semNome ? 12 : 5);

    if (resultados.length === 0) continue;

    // Contexto da eleição inteira (para "quantos candidatos" e "houve 2º turno")
    const totalVotosValidos = todos.reduce((s, c) => s + c.totalVotos, 0);
    const pctLider = totalVotosValidos > 0 ? (todos[0].totalVotos / totalVotosValidos) * 100 : 0;
    // 2º turno só existe em cargos majoritários (governador/prefeito/presidente)
    const majoritario = /governador|prefeito|president/.test(cargoNorm);

    // Quebra por zona eleitoral (+ bairros de cada zona) quando um município
    // é informado. Dados do TSE vão até a zona/seção — não há contagem por
    // bairro; os bairros vêm dos locais de votação de cada zona.
    const muniNorm = args.municipio ? normalizarTextoTse(args.municipio) : '';
    const bairrosZona = muniNorm && uf !== 'BR' ? bairrosPorZona(uf, args.municipio!) : {};

    return {
      encontrado: true,
      granularidade: muniNorm ? 'zona_eleitoral' : 'municipio',
      totalCandidatos: todos.length,
      liderPercentualValidos: Math.round(pctLider * 10) / 10,
      houveSegundoTurno: majoritario ? pctLider < 50 : false,
      candidatos: resultados.map(c => ({
        nome: c.nome,
        nomeUrna: c.nomeUrna,
        partido: c.partido,
        cargo: c.cargo,
        ano: parseInt(anoStr),
        uf,
        situacao: c.situacao,
        totalVotos: c.totalVotos,
        votosPorMunicipio: uf === 'BR'
          ? Object.entries(c.votosPorEstado ?? {})
              .sort((a, b) => b[1] - a[1])
              .slice(0, 10)
              .map(([estado, votos]) => ({ municipio: estado, votos }))
          : Object.entries(c.votos ?? {})
              .sort((a, b) => b[1] - a[1])
              .slice(0, 20)
              .map(([municipio, votos]) => ({ municipio, votos })),
        // Detalhe por zona eleitoral do município solicitado (com bairros)
        votosPorZona: muniNorm
          ? (c.zonas ?? [])
              .filter(z => normalizarTextoTse(z.municipio) === muniNorm)
              .sort((a, b) => b.votos - a.votos)
              .slice(0, 30)
              .map(z => ({ zona: z.zona, votos: z.votos, bairros: bairrosZona[z.zona] ?? [] }))
          : undefined,
      })),
    };
  }

  return { encontrado: false, mensagem: 'Nenhum candidato encontrado com esses filtros.' };
}

// ---------------------------------------------------------------------------
// comparar_parlamentares
// ---------------------------------------------------------------------------
export async function executarCompararParlamentares(
  args: {
    parlamentares: string[];
    ano?: number;
    uf?: string;
  },
  _session: UserSession,
) {
  if (!Array.isArray(args.parlamentares) || args.parlamentares.length < 2) {
    return { erro: 'Informe ao menos 2 parlamentares para comparar.' };
  }

  const resultados = await Promise.all(
    args.parlamentares.slice(0, 5).map(async (nome) => {
      const parl = await prisma.parlamentar.findFirst({
        where: { nome: { contains: nome, mode: 'insensitive' } },
        include: {
          emendas: {
            where: {
              ...(args.ano && { ano: Number(args.ano) }),
              ...(args.uf && { uf: args.uf.toUpperCase() }),
            },
            select: {
              valorEmpenhado: true,
              valorPago: true,
              area: true,
              municipioNome: true,
            },
          },
        },
      });

      if (!parl) return { nome, naoEncontrado: true };

      const totalEmpenhado = parl.emendas.reduce((s, e) => s + e.valorEmpenhado, 0);
      const totalPago = parl.emendas.reduce((s, e) => s + e.valorPago, 0);

      // Agrupa por área
      const porArea = Object.entries(
        parl.emendas.reduce<Record<string, number>>((acc, e) => {
          acc[e.area] = (acc[e.area] ?? 0) + e.valorPago;
          return acc;
        }, {}),
      )
        .map(([area, valor]) => ({ area, valor }))
        .sort((a, b) => b.valor - a.valor);

      return {
        nome: parl.nome,
        partido: parl.partido ?? '',
        cargo: parl.cargo,
        uf: parl.uf ?? '',
        totalEmendas: parl.emendas.length,
        totalEmpenhado,
        totalPago,
        execucao: totalEmpenhado > 0
          ? Math.round((totalPago / totalEmpenhado) * 100)
          : 0,
        porArea,
      };
    }),
  );

  return { parlamentares: resultados };
}

// ---------------------------------------------------------------------------
// dados_municipio
// ---------------------------------------------------------------------------
export async function executarDadosMunicipio(
  args: { municipio: string; uf?: string; ano?: number },
  _session: UserSession,
) {
  const stats = await prisma.municipioStats.findFirst({
    where: {
      nome: { contains: args.municipio, mode: 'insensitive' },
      ...(args.uf && { uf: args.uf.toUpperCase() }),
      ...(args.ano && { ano: Number(args.ano) }),
    },
    orderBy: { ano: 'desc' },
  });

  if (!stats) {
    return {
      encontrado: false,
      mensagem: `Dados não encontrados para "${args.municipio}"${args.uf ? ` (${args.uf})` : ''}.`,
    };
  }

  return {
    encontrado: true,
    municipio: stats.nome,
    uf: stats.uf,
    codigoIbge: stats.codigoIbge,
    ano: stats.ano,
    habitantes: stats.habitantes,
    eleitores: stats.eleitores,
    tetoMac: stats.tetoMac,
    tetoPap: stats.tetoPap,
    fonte: stats.fonte,
  };
}

// ---------------------------------------------------------------------------
// buscar_demandas  — SEMPRE escopado ao gabinete do usuário logado
// ---------------------------------------------------------------------------
export async function executarBuscarDemandas(
  args: {
    status?: string;
    categoria?: string;
    prioridade?: string;
    municipio?: string;
  },
  session: UserSession,
) {
  const user = session.user as any;
  if (!user?.gabineteId) {
    return { erro: 'Usuário sem gabinete associado — não é possível buscar demandas.' };
  }

  const demandas = await prisma.demand.findMany({
    where: {
      gabineteId: user.gabineteId, // SEMPRE presente — nunca remove isso
      ...(args.status && { status: args.status as any }),
      ...(args.categoria && { category: args.categoria as any }),
      ...(args.prioridade && { priority: args.prioridade as any }),
      ...(args.municipio && {
        municipio: { contains: args.municipio, mode: 'insensitive' },
      }),
    },
    select: {
      title: true,
      solicitante: true,
      municipio: true,
      estado: true,
      category: true,
      status: true,
      priority: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  // Contagem por status para dar contexto
  const contagem = demandas.reduce<Record<string, number>>((acc, d) => {
    acc[d.status] = (acc[d.status] ?? 0) + 1;
    return acc;
  }, {});

  return {
    total: demandas.length,
    contagemPorStatus: contagem,
    demandas: demandas.map(d => ({
      titulo: d.title,
      solicitante: d.solicitante,
      municipio: d.municipio,
      estado: d.estado,
      categoria: d.category,
      status: d.status,
      prioridade: d.priority,
      criadaEm: d.createdAt.toISOString().split('T')[0],
    })),
  };
}

// ---------------------------------------------------------------------------
// gerar_visualizacao  — sem acesso ao banco, apenas formata o payload
// ---------------------------------------------------------------------------
export async function executarGerarVisualizacao(
  args: { tipo: string; titulo?: string; dados: object },
  _session: UserSession,
) {
  return {
    tipo: args.tipo,
    titulo: args.titulo ?? '',
    dados: args.dados,
  };
}

// ---------------------------------------------------------------------------
// Dispatcher central — chamado pelo loop de tool use
// ---------------------------------------------------------------------------
export async function executarTool(
  nome: string,
  args: Record<string, unknown>,
  session: UserSession,
): Promise<unknown> {
  switch (nome) {
    case 'buscar_emendas':
      return executarBuscarEmendas(args as any, session);
    case 'buscar_votacao':
      return executarBuscarVotacao(args as any, session);
    case 'comparar_parlamentares':
      return executarCompararParlamentares(args as any, session);
    case 'dados_municipio':
      return executarDadosMunicipio(args as any, session);
    case 'buscar_demandas':
      return executarBuscarDemandas(args as any, session);
    case 'gerar_visualizacao':
      return executarGerarVisualizacao(args as any, session);
    default:
      return { erro: `Ferramenta desconhecida: ${nome}` };
  }
}
