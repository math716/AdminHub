import { prisma } from '@/lib/db';
import {
  loadStaticTseData, buscarCandidatoNoJson, buscarCandidatoTolerante, normalizarTextoTse,
  bairrosPorZona, anosDisponiveisTse, sugerirCandidatos,
} from '@/lib/tse-static';
import { buscarCandidatoNacional, inferirUfPorNomes } from '@/lib/tse-index';
import { resolverDeputados } from '@/lib/agent/report/df-territorial';
import type { Session } from 'next-auth';

type UserSession = Session & { user: any };

// ---------------------------------------------------------------------------
// buscar_emendas
// ---------------------------------------------------------------------------
type FiltrosEmendas = {
  parlamentar_nome?: string;
  uf?: string;
  municipio?: string;
  area?: string;
  ano?: number;
  esfera?: string;
};

// Casa o nome do parlamentar por PALAVRAS (todas presentes, em qualquer ordem):
// "Alberto Fraga" acha "João Alberto Fraga Silva" e "Fraga, Alberto" — o
// `contains` de frase inteira falhava nesses casos.
function filtroNomeParlamentar(nome: string) {
  const palavras = nome.trim().split(/\s+/).filter(p => p.length > 2);
  if (palavras.length === 0) return { nome: { contains: nome, mode: 'insensitive' as const } };
  return { AND: palavras.map(p => ({ nome: { contains: p, mode: 'insensitive' as const } })) };
}

function whereEmendas(a: FiltrosEmendas, ignorar: Set<string> = new Set()) {
  return {
    ...(a.parlamentar_nome && !ignorar.has('parlamentar') && { parlamentar: filtroNomeParlamentar(a.parlamentar_nome) }),
    ...(a.uf && !ignorar.has('uf') && { uf: a.uf.toUpperCase() }),
    ...(a.municipio && !ignorar.has('municipio') && { municipioNome: { contains: a.municipio, mode: 'insensitive' as const } }),
    ...(a.area && !ignorar.has('area') && { area: a.area as any }),
    ...(a.ano && !ignorar.has('ano') && { ano: Number(a.ano) }),
    ...(a.esfera && !ignorar.has('esfera') && { esfera: a.esfera as any }),
  } as any;
}

const ROTULO_FILTRO: Record<string, string> = {
  ano: 'ano', area: 'área temática', municipio: 'município', parlamentar: 'parlamentar',
};

export async function executarBuscarEmendas(
  args: FiltrosEmendas,
  _session: UserSession,
) {
  // Exige pelo menos um filtro para evitar dumps desnecessários
  if (!args.parlamentar_nome && !args.uf && !args.municipio && !args.area && !args.ano) {
    return { erro: 'Informe ao menos um filtro (parlamentar, UF, município, área ou ano).' };
  }

  const buscar = (ignorar: Set<string>) => prisma.emendaParlamentar.findMany({
    where: whereEmendas(args, ignorar),
    include: { parlamentar: { select: { nome: true, partido: true, uf: true, cargo: true } } },
    orderBy: { valorPago: 'desc' },
    take: 100,
  });

  // Busca com os filtros pedidos. Se vier vazio, RELAXA progressivamente em vez
  // de devolver "não encontrei": é quase sempre um filtro apertado demais
  // (ano sem dado, área classificada como OUTROS, grafia do município).
  let emendas = await buscar(new Set());
  const filtrosIgnorados: string[] = [];

  if (emendas.length === 0) {
    const escada: string[][] = [['ano'], ['ano', 'area'], ['ano', 'area', 'municipio']];
    for (const combo of escada) {
      const aplicaveis = combo.filter(f =>
        (f === 'ano' && args.ano) || (f === 'area' && args.area) || (f === 'municipio' && args.municipio));
      if (aplicaveis.length === 0) continue;
      const r = await buscar(new Set(aplicaveis));
      if (r.length > 0) {
        emendas = r;
        filtrosIgnorados.push(...aplicaveis);
        break;
      }
    }
  }

  if (emendas.length === 0) {
    // Ainda vazio: em vez de um beco sem saída, devolve o que EXISTE por perto
    // para a Gabi conduzir a conversa com dados concretos.
    const [anosComDados, semelhantes] = await Promise.all([
      prisma.emendaParlamentar.groupBy({
        by: ['ano'],
        where: whereEmendas(args, new Set(['ano', 'area', 'municipio'])) as any,
        _count: { _all: true },
        orderBy: { ano: 'desc' },
        take: 8,
      }).catch(() => [] as any[]),
      args.parlamentar_nome
        ? prisma.parlamentar.findMany({
            where: filtroNomeParlamentar(args.parlamentar_nome) as any,
            select: { nome: true, partido: true, uf: true, cargo: true },
            take: 5,
          }).catch(() => [] as any[])
        : Promise.resolve([] as any[]),
    ]);

    // Nome não bateu nem por palavras: tenta por QUALQUER palavra (sobrenome)
    let alternativos = semelhantes;
    if (alternativos.length === 0 && args.parlamentar_nome) {
      const palavras = args.parlamentar_nome.trim().split(/\s+/).filter(p => p.length > 2);
      if (palavras.length > 0) {
        alternativos = await prisma.parlamentar.findMany({
          where: { OR: palavras.map(p => ({ nome: { contains: p, mode: 'insensitive' as const } })) } as any,
          select: { nome: true, partido: true, uf: true, cargo: true },
          take: 5,
        }).catch(() => [] as any[]);
      }
    }

    return {
      encontrado: false,
      anosComDados: anosComDados.map((a: any) => ({ ano: a.ano, emendas: a._count?._all ?? 0 })),
      parlamentaresSemelhantes: alternativos,
      orientacao:
        'Não há registros para essa combinação exata de filtros. Use "anosComDados" e ' +
        '"parlamentaresSemelhantes" para propor ao usuário o recorte mais próximo que EXISTE ' +
        '(ex.: outro ano, ou o nome como está cadastrado) e refaça a busca — não responda que ' +
        'os dados não existem sem antes oferecer essas alternativas concretas.',
    };
  }

  const totalEmpenhado = emendas.reduce((s, e) => s + e.valorEmpenhado, 0);
  const totalPago = emendas.reduce((s, e) => s + e.valorPago, 0);

  return {
    encontrado: true,
    total: emendas.length,
    totalEmpenhado,
    totalPago,
    // Quando a busca exata falhou e o resultado veio de um filtro relaxado,
    // avisa a Gabi para ela deixar isso claro na resposta (transparência sem
    // expor mecânica: "não há registros de 2025; trouxe os de 2024").
    ...(filtrosIgnorados.length > 0 && {
      filtrosIgnorados,
      aviso: `Sem registros para o(s) filtro(s) de ${filtrosIgnorados.map(f => ROTULO_FILTRO[f] ?? f).join(' e ')} ` +
        'pedido(s). Estes resultados são do recorte mais próximo disponível — diga isso ao usuário ' +
        'naturalmente, informando o período/escopo que os dados realmente cobrem.',
    }),
    execucaoGeral: totalEmpenhado > 0
      ? Math.round((totalPago / totalEmpenhado) * 100)
      : 0,
    emendas: emendas.map(e => ({
      parlamentar: e.parlamentar?.nome ?? 'N/A',
      partido: e.parlamentar?.partido ?? '',
      cargo: e.parlamentar?.cargo ?? '',
      ano: e.ano,
      area: e.area,
      // objeto completo pode ter parágrafos — 100 emendas estouravam o turno
      objeto: (e.objeto ?? '').slice(0, 140),
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
    apenas_eleitos?: boolean;
    limite?: number;
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
    const staticData = await loadStaticTseData(anoStr, uf);
    if (!staticData) continue;

    let todos = buscarCandidatoNoJson(staticData, semNome ? '' : args.candidato_nome, args.cargo)
      .sort((a, b) => b.totalVotos - a.totalVotos);
    // Fallback tolerante: nomes com palavra extra ("Delegada Doutora Jane"
    // → DOUTORA JANE) ou títulos que não fazem parte do nome de urna.
    if (todos.length === 0 && !semNome) {
      const t = buscarCandidatoTolerante(staticData, args.candidato_nome, args.cargo);
      if (t) todos = [t];
    }

    // Recorte por MUNICÍPIO. Sem isto, "vereadores de Ubatuba" devolvia os
    // vereadores mais votados de SP inteiro (a base tem 70 mil só neste
    // cargo, quase todos da capital) — o município era usado apenas para
    // detalhar zonas, nunca para filtrar. Com nome de candidato não filtramos:
    // saber que ele teve zero voto ali também é resposta.
    const muniNorm = args.municipio ? normalizarTextoTse(args.municipio) : '';
    const votosNoMunicipio = (c: any): number => {
      if (!muniNorm) return 0;
      for (const [m, v] of Object.entries(c.votos ?? {})) {
        if (normalizarTextoTse(m) === muniNorm) return v as number;
      }
      return 0;
    };
    if (muniNorm && uf !== 'BR' && semNome) {
      todos = todos
        .filter(c => votosNoMunicipio(c) > 0)
        .sort((a, b) => votosNoMunicipio(b) - votosNoMunicipio(a));
    }
    // "eleitos" ≠ situacao.includes('eleito'): isso casaria "NÃO ELEITO"
    // também. Os eleitos são os que a situação começa com ELEITO
    // (ELEITO POR QP + ELEITO POR MÉDIA) — no RJ/2022, exatamente 70.
    const totalNoCargo = todos.length;
    const eleitos = todos.filter(c => /^eleito/.test(normalizarTextoTse(c.situacao)));
    if (args.apenas_eleitos && eleitos.length > 0) todos = eleitos;

    // Uma bancada inteira (ex.: 70 deputados estaduais) não cabia no corte fixo
    // de 12. O teto é maior, mas ainda limitado para o turno não estourar.
    const limitePedido = Number(args.limite);
    const limite = semNome
      ? Math.min(Number.isFinite(limitePedido) && limitePedido > 0 ? limitePedido : 12, 80)
      : 5;
    const resultados = todos.slice(0, limite);

    if (resultados.length === 0) continue;

    // Contexto da eleição inteira (para "quantos candidatos" e "houve 2º turno").
    // Filtrado por município, o denominador são os votos DALI — usar o total do
    // estado faria o líder de Ubatuba parecer ter 0,01% dos votos.
    const noMunicipio = !!muniNorm && uf !== 'BR' && semNome;
    const totalVotosValidos = todos.reduce(
      (s, c) => s + (noMunicipio ? votosNoMunicipio(c) : c.totalVotos), 0);
    const votosLider = noMunicipio ? votosNoMunicipio(todos[0]) : todos[0].totalVotos;
    const pctLider = totalVotosValidos > 0 ? (votosLider / totalVotosValidos) * 100 : 0;
    // 2º turno só existe em cargos majoritários (governador/prefeito/presidente).
    // Para PREFEITO há um segundo requisito, na Constituição (art. 29, II): só
    // há segundo turno em município com mais de 200 mil ELEITORES. Sem essa
    // checagem, qualquer cidade pequena cujo prefeito venceu com menos de 50%
    // aparecia como tendo ido a segundo turno — falso e verificável.
    const majoritario = /governador|prefeito|president/.test(cargoNorm);
    let houveSegundoTurno: boolean | null = majoritario ? pctLider < 50 : false;
    let eleitoradoMunicipio: number | null = null;
    if (/prefeito/.test(cargoNorm)) {
      if (muniNorm) {
        const st = await prisma.municipioStats.findFirst({
          where: { nome: { contains: args.municipio!, mode: 'insensitive' }, uf },
          orderBy: { ano: 'desc' },
          select: { eleitores: true },
        }).catch(() => null);
        eleitoradoMunicipio = st?.eleitores ?? null;
      }
      // Sem o eleitorado não dá para afirmar nem negar — null impede a Gabi
      // de chutar (o campo `notaSegundoTurno` diz o que fazer).
      houveSegundoTurno = eleitoradoMunicipio === null
        ? null
        : eleitoradoMunicipio > 200_000 && pctLider < 50;
    }

    // Quebra por zona eleitoral (+ bairros de cada zona) quando um município
    // é informado. Dados do TSE vão até a zona/seção — não há contagem por
    // bairro; os bairros vêm dos locais de votação de cada zona.
    const bairrosZona = muniNorm && uf !== 'BR' ? await bairrosPorZona(uf, args.municipio!) : {};

    const detalheMunicipios =
      resultados.length > 40 ? 2 :
      resultados.length > 20 ? 3 :
      resultados.length > 12 ? 6 : (uf === 'BR' ? 10 : 20);

    return {
      encontrado: true,
      granularidade: muniNorm ? 'zona_eleitoral' : 'municipio',
      // Nome do município consultado — o relatório usa para desenhar o mapa da
      // cidade por bairros em vez do mapa do estado com um ponto pintado.
      municipioConsultado: args.municipio ?? null,
      // Filtrado por município, estes números são DALI — é a resposta certa
      // para "quantos concorreram" e "quantas cadeiras tem a Câmara".
      escopoContagem: noMunicipio
        // Para cargo municipal isto é a eleição inteira daquela cidade. Para
        // cargo estadual são os que receberam votos ali — não "os deputados de
        // Ubatuba"; a Gabi precisa da diferença para não escrever besteira.
        ? `candidatos com votos em ${args.municipio} (${uf})`
        : (uf === 'BR' ? 'nacional' : `estado ${uf}`),
      totalCandidatos: totalNoCargo,
      totalEleitos: eleitos.length,
      filtradoPorEleitos: !!args.apenas_eleitos && eleitos.length > 0,
      exibidos: resultados.length,
      ...(resultados.length < todos.length && {
        avisoCorte: `Exibindo ${resultados.length} de ${todos.length}. Para mais, chame de novo ` +
          'com "limite" maior (teto 80).',
      }),
      liderPercentualValidos: Math.round(pctLider * 10) / 10,
      houveSegundoTurno,
      ...(eleitoradoMunicipio !== null && { eleitoradoMunicipio }),
      ...(houveSegundoTurno === null && {
        notaSegundoTurno: 'Não foi possível confirmar o eleitorado do município, e segundo turno '
          + 'para prefeito só existe acima de 200 mil eleitores. Não afirme nem negue o segundo '
          + 'turno — apresente o resultado sem tocar no assunto.',
      }),
      candidatos: resultados.map(c => ({
        nome: c.nome,
        nomeUrna: c.nomeUrna,
        partido: c.partido,
        cargo: c.cargo,
        ano: parseInt(anoStr),
        uf,
        situacao: c.situacao,
        totalVotos: c.totalVotos,
        // Consulta com município: o número que interessa é o de lá. Para
        // vereador coincide com o total; para deputado, não.
        ...(muniNorm && uf !== 'BR' && { votosNoMunicipio: votosNoMunicipio(c) }),
        // Quanto mais candidatos na resposta, menos municípios por candidato —
        // 70 deputados × 20 municípios estouraria o limite do turno. Num
        // ranking de bancada, o principal reduto de cada um já basta.
        votosPorMunicipio: uf === 'BR'
          ? Object.entries(c.votosPorEstado ?? {})
              .sort((a, b) => b[1] - a[1])
              .slice(0, detalheMunicipios)
              .map(([estado, votos]) => ({ municipio: estado, votos }))
          : Object.entries(c.votos ?? {})
              .sort((a, b) => b[1] - a[1])
              .slice(0, detalheMunicipios)
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

  // Sem UF: em vez de devolver a tarefa ao usuário, DESCOBRE o estado pelo nome
  // no índice nacional e refaz a busca sozinha. Pedir a UF de volta era a
  // resposta mais comum e mais inútil da Gabi.
  const semUf = !ufQuery && !isPresidencial;
  if (semUf) {
    const palpites = args.candidato_nome
      ? buscarCandidatoNacional(args.candidato_nome, anoStr, args.cargo)
      : null;

    if (palpites && palpites.length > 0) {
      const ufInferida = palpites[0].uf;
      // Uma única tentativa com a UF descoberta — sem risco de recursão infinita.
      const refeita: any = await executarBuscarVotacao(
        { ...args, uf: ufInferida }, _session,
      );
      if (refeita?.encontrado) {
        return {
          ...refeita,
          ufInferida,
          // A Gabi precisa DIZER o recorte que assumiu, e oferecer trocar se
          // houver o mesmo nome em outro estado.
          avisoUf: `O estado não foi informado; localizei "${args.candidato_nome}" em ${ufInferida} ` +
            'e usei esse recorte. Diga isso naturalmente ao usuário.',
          ...(new Set(palpites.map(p => p.uf)).size > 1 && {
            tambemEncontradoEm: [...new Set(palpites.map(p => p.uf))].filter(u => u !== ufInferida),
          }),
        };
      }
    }

    return {
      encontrado: false,
      anosDisponiveis: anosDisponiveisTse(),
      ...(palpites && palpites.length > 0 && {
        candidatosParecidos: palpites.map(p => ({
          nomeUrna: p.nomeUrna, uf: p.uf, cargo: p.cargo, partido: p.partido, totalVotos: p.totalVotos,
        })),
      }),
      orientacao: palpites && palpites.length > 0
        ? 'Não achei com esse recorte, mas "candidatosParecidos" mostra onde esse nome aparece — ' +
          'escolha o mais provável e refaça a busca com a "uf" dele.'
        : `Para localizar "${args.candidato_nome ?? ''}" é preciso o ESTADO: os resultados de cargos estaduais/municipais são organizados por UF. Deduza pelo contexto da conversa ou pergunte de forma natural de que estado é o candidato, e repita a busca informando "uf".`,
    };
  }

  // Nada encontrado COM a UF: devolve o que existe por perto — nomes parecidos
  // (grafia de urna costuma diferir) e os anos que a base realmente cobre.
  const ufAlvo = ufQuery ?? 'BR';
  const anosDisponiveis = anosDisponiveisTse(ufAlvo);
  let sugestoes: any[] = [];
  if (args.candidato_nome) {
    for (const ano of [anoStr, ...anosDisponiveis.map(String)]) {
      const base = await loadStaticTseData(ano, ufAlvo);
      if (!base) continue;
      // Busca em TODOS os cargos, ordenada por relevância do nome: é comum a
      // pessoa ter concorrido a outro cargo (ex.: pediram distrital, era
      // federal), e filtrar por cargo esconderia justamente o nome certo.
      const achados = sugerirCandidatos(base, args.candidato_nome, undefined, 5);
      if (achados.length > 0) {
        sugestoes = achados.map(x => ({ ...x, ano: Number(ano), uf: ufAlvo }));
        break;
      }
    }
  }

  return {
    encontrado: false,
    anosDisponiveis,
    sugestoes,
    orientacao:
      'Não houve correspondência exata. Se "sugestoes" trouxer nomes, escolha o mais provável ' +
      '(o nome de urna costuma ser diferente do nome civil, e o cargo pode ser outro) e REFAÇA a busca ' +
      'com esse nome — ou confirme com o usuário citando as opções. Se o ano pedido não estiver em ' +
      '"anosDisponiveis", proponha o ano mais próximo que existe. Nunca encerre dizendo apenas que não encontrou.',
  };
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
// localizar_parlamentar — "onde essa pessoa aparece na base?"
// Resolve pedidos vagos ANTES de buscar: descobre UF, cargo, grafia de urna e
// anos com dados, para a Gabi montar a consulta certa em vez de errar o filtro.
// ---------------------------------------------------------------------------
export async function executarLocalizarParlamentar(
  args: { nome: string; uf?: string },
  _session: UserSession,
) {
  const nome = (args.nome ?? '').trim();
  if (nome.length < 3) return { erro: 'Informe ao menos 3 caracteres do nome.' };

  const palavras = nome.split(/\s+/).filter(p => p.length > 2);

  // 1) Base de emendas — diz UF e cargo, e serve de bússola para a busca eleitoral
  let registros: any[] = [];
  try {
    registros = await prisma.parlamentar.findMany({
      where: palavras.length > 0
        ? ({ AND: palavras.map(p => ({ nome: { contains: p, mode: 'insensitive' as const } })) } as any)
        : ({ nome: { contains: nome, mode: 'insensitive' as const } } as any),
      select: { id: true, nome: true, partido: true, uf: true, cargo: true },
      take: 8,
    });
    if (registros.length === 0 && palavras.length > 0) {
      registros = await prisma.parlamentar.findMany({
        where: { OR: palavras.map(p => ({ nome: { contains: p, mode: 'insensitive' as const } })) } as any,
        select: { id: true, nome: true, partido: true, uf: true, cargo: true },
        take: 8,
      });
    }
  } catch { registros = []; }

  const emEmendas = await Promise.all(registros.map(async (p) => {
    let anos: number[] = [];
    try {
      const g = await prisma.emendaParlamentar.groupBy({
        by: ['ano'], where: { parlamentarId: p.id } as any, orderBy: { ano: 'desc' }, take: 10,
      });
      anos = g.map((x: any) => x.ano);
    } catch { /* sem dados */ }
    return { nome: p.nome, partido: p.partido ?? '', uf: p.uf ?? '', cargo: p.cargo ?? '', anosComEmendas: anos };
  }));

  // 2) Base eleitoral — o índice NACIONAL vem sempre primeiro.
  //
  // Antes ele era só um fallback para quando a busca na UF conhecida não
  // achasse nada. Só que a busca por UF quase sempre acha ALGUMA coisa: ela
  // devolve sugestões por semelhança. Procurando "André do Prado" com a UF
  // errada, vinha "ANDRE CECILIANO" do RJ, o fallback nunca rodava, e a Gabi
  // apresentava um suplente do RJ como se fosse o deputado de SP.
  const nomeNorm = normalizarTextoTse(nome);
  const emEleicoes: any[] = [];

  for (const ano of anosDisponiveisTse()) {
    for (const c of buscarCandidatoNacional(nome, String(ano)) ?? []) {
      emEleicoes.push({
        nomeUrna: c.nomeUrna, nome: c.nome, cargo: c.cargo,
        partido: c.partido, totalVotos: c.totalVotos, situacao: c.situacao,
        ano, uf: c.uf,
        // Nome de urna idêntico ao pedido é resposta, não palpite.
        exato: normalizarTextoTse(c.nomeUrna) === nomeNorm || normalizarTextoTse(c.nome) === nomeNorm,
      });
    }
  }
  // Nome exato primeiro; depois por votação, entre TODOS os anos. Varrer ano a
  // ano e cortar no primeiro deixava a eleição municipal (centenas de milhares
  // de candidatos) dominar com homônimos irrelevantes.
  emEleicoes.sort((a, b) => Number(b.exato) - Number(a.exato) || b.totalVotos - a.totalVotos);

  // Só quando o índice nacional não conhece o nome (candidato de eleição
  // municipal, que fica fora do índice) recorre às sugestões por UF.
  const ufBusca = (args.uf ?? registros.find(r => r.uf)?.uf ?? '').toUpperCase();
  if (emEleicoes.length === 0 && ufBusca) {
    for (const ano of anosDisponiveisTse(ufBusca)) {
      const base = await loadStaticTseData(String(ano), ufBusca);
      if (!base) continue;
      for (const sug of sugerirCandidatos(base, nome, undefined, 3)) {
        emEleicoes.push({ ...sug, ano, uf: ufBusca, exato: false });
      }
      if (emEleicoes.length >= 6) break;
    }
  }

  emEleicoes.splice(6); // no máximo 6 no retorno
  const ufsEncontradas = [...new Set(emEleicoes.map((e: any) => e.uf).filter(Boolean))];

  return {
    encontrado: emEmendas.length > 0 || emEleicoes.length > 0,
    consultado: nome,
    emEmendas,                                   // onde tem emendas (UF, cargo, anos)
    emEleicoes,                                  // grafia de urna, cargo, ano e UF reais
    ufsEncontradas,                              // estados onde o nome aparece
    orientacao:
      'Use este retorno para montar a consulta CERTA: "emEleicoes" traz o nome de urna, o cargo, o ' +
      'ano e a UF reais (use-os em buscar_votacao ou gerar_relatorio_territorial); "emEmendas" traz ' +
      'a UF, o cargo e os anos com emendas (use-os em buscar_emendas). Se "ufsEncontradas" tem UMA ' +
      'entrada, use-a direto — NÃO pergunte o estado ao usuário, você já o descobriu. Depois de ' +
      'localizar, SIGA e entregue a análise — não devolva a busca ao usuário como se fosse tarefa dele.',
  };
}

// ---------------------------------------------------------------------------
// buscar_agenda — compromissos do gabinete do usuário logado.
// SEMPRE escopado por gabineteId, igual a buscar_demandas.
// ---------------------------------------------------------------------------
const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export async function executarBuscarAgenda(
  args: {
    ano?: number;
    mes?: number;
    data_inicio?: string;
    data_fim?: string;
    tipo?: string;
    local?: string;
    apenas_futuros?: boolean;
  },
  session: UserSession,
) {
  const user = session.user as any;
  if (!user?.gabineteId) {
    return { erro: 'Usuário sem gabinete associado — não é possível buscar a agenda.' };
  }

  // Janela de datas: ano/mês explícitos, intervalo livre, ou "daqui pra frente".
  let inicio: Date | undefined;
  let fim: Date | undefined;
  if (args.data_inicio || args.data_fim) {
    if (args.data_inicio) inicio = new Date(`${args.data_inicio}T00:00:00`);
    if (args.data_fim) fim = new Date(`${args.data_fim}T23:59:59`);
  } else if (args.ano) {
    const m = args.mes ? Number(args.mes) : null;
    if (m && m >= 1 && m <= 12) {
      inicio = new Date(args.ano, m - 1, 1, 0, 0, 0);
      fim = new Date(args.ano, m, 0, 23, 59, 59);
    } else {
      inicio = new Date(args.ano, 0, 1, 0, 0, 0);
      fim = new Date(args.ano, 11, 31, 23, 59, 59);
    }
  }
  if (args.apenas_futuros) {
    const agora = new Date();
    if (!inicio || inicio < agora) inicio = agora;
  }

  const where: any = {
    gabineteId: user.gabineteId, // SEMPRE presente — nunca remove isso
    ...(args.tipo && { tipo: args.tipo as any }),
    ...(args.local && {
      OR: [
        { local: { contains: args.local, mode: 'insensitive' } },
        { endereco: { contains: args.local, mode: 'insensitive' } },
      ],
    }),
    ...((inicio || fim) && { data: { ...(inicio && { gte: inicio }), ...(fim && { lte: fim }) } }),
  };

  // `total` vem de count() — a lista é limitada, e usar o length dela faria a
  // Gabi afirmar "50 compromissos" num ano com centenas.
  const [total, eventos, porTipo] = await Promise.all([
    prisma.agendaEvent.count({ where }),
    prisma.agendaEvent.findMany({
      where,
      select: {
        titulo: true, descricao: true, data: true, dataFim: true,
        local: true, endereco: true, tipo: true,
      },
      orderBy: { data: 'desc' },
      take: 60,
    }),
    prisma.agendaEvent.groupBy({ by: ['tipo'], where, _count: { _all: true } }),
  ]);

  if (total === 0) {
    // Sem resultados: diz o que a agenda REALMENTE cobre, para a Gabi propor o
    // recorte mais próximo em vez de responder "não encontrei".
    const existentes = await prisma.agendaEvent.findMany({
      where: { gabineteId: user.gabineteId },
      select: { data: true },
      orderBy: { data: 'desc' },
      take: 500,
    });
    const anos = [...new Set(existentes.map(e => e.data.getFullYear()))].sort((a, b) => b - a);
    return {
      encontrado: false,
      total: 0,
      anosComAgenda: anos,
      totalNoGabinete: existentes.length,
      orientacao: anos.length > 0
        ? 'Não há compromissos nesse recorte. Use "anosComAgenda" para oferecer o período mais ' +
          'próximo que EXISTE e refaça a busca — não responda que os dados não existem.'
        : 'A agenda deste gabinete ainda não tem compromissos registrados. Oriente o usuário a ' +
          'cadastrá-los no módulo Agenda.',
    };
  }

  const contagemPorTipo = Object.fromEntries(porTipo.map(t => [t.tipo, t._count._all]));
  const contagemPorMes: Record<string, number> = {};
  for (const e of eventos) {
    const k = `${MESES_PT[e.data.getMonth()]}/${e.data.getFullYear()}`;
    contagemPorMes[k] = (contagemPorMes[k] ?? 0) + 1;
  }

  const fmt = (d: Date) => d.toISOString().split('T')[0];
  const hora = (d: Date) => d.toISOString().slice(11, 16);

  return {
    encontrado: true,
    total,
    exibidos: eventos.length,
    periodo: { de: inicio ? fmt(inicio) : null, ate: fim ? fmt(fim) : null },
    contagemPorTipo,
    contagemPorMes,
    compromissos: eventos.map(e => ({
      titulo: e.titulo,
      descricao: (e.descricao ?? '').slice(0, 160),
      data: fmt(e.data),
      hora: hora(e.data),
      dataFim: e.dataFim ? fmt(e.dataFim) : null,
      tipo: e.tipo,
      local: e.local ?? '',
      endereco: e.endereco ?? '',
    })),
  };
}

// ---------------------------------------------------------------------------
// buscar_contatos — base de contatos do gabinete do usuário logado.
// SEMPRE escopado por gabineteId.
// ---------------------------------------------------------------------------
export async function executarBuscarContatos(
  args: { nome?: string; termo?: string; com_email?: boolean; com_localizacao?: boolean },
  session: UserSession,
) {
  const user = session.user as any;
  if (!user?.gabineteId) {
    return { erro: 'Usuário sem gabinete associado — não é possível buscar contatos.' };
  }

  const busca = args.nome ?? args.termo;
  const where: any = {
    gabineteId: user.gabineteId, // SEMPRE presente — nunca remove isso
    ...(busca && {
      OR: [
        { nome: { contains: busca, mode: 'insensitive' } },
        { email: { contains: busca, mode: 'insensitive' } },
        { endereco: { contains: busca, mode: 'insensitive' } },
        { numero: { contains: busca, mode: 'insensitive' } },
      ],
    }),
    ...(args.com_email && { email: { not: null } }),
    ...(args.com_localizacao && { lat: { not: null } }),
  };

  const [total, contatos, totalGabinete, comEmail, comLocalizacao] = await Promise.all([
    prisma.contato.count({ where }),
    prisma.contato.findMany({
      where,
      select: { nome: true, numero: true, email: true, endereco: true, lat: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 60,
    }),
    prisma.contato.count({ where: { gabineteId: user.gabineteId } }),
    prisma.contato.count({ where: { gabineteId: user.gabineteId, email: { not: null } } }),
    prisma.contato.count({ where: { gabineteId: user.gabineteId, lat: { not: null } } }),
  ]);

  if (total === 0) {
    return {
      encontrado: false,
      total: 0,
      totalNoGabinete: totalGabinete,
      orientacao: totalGabinete > 0
        ? `Nenhum contato bate com esse filtro, mas o gabinete tem ${totalGabinete} contatos ` +
          'cadastrados. Ofereça o panorama geral ou peça a grafia do nome.'
        : 'A base de contatos deste gabinete está vazia. Oriente o usuário a cadastrar ou a ' +
          'importar por planilha no módulo Importação.',
    };
  }

  return {
    encontrado: true,
    total,
    exibidos: contatos.length,
    resumoDaBase: { totalNoGabinete: totalGabinete, comEmail, comLocalizacao },
    contatos: contatos.map(c => ({
      nome: c.nome,
      telefone: c.numero,
      email: c.email ?? '',
      endereco: c.endereco ?? '',
      temLocalizacao: c.lat != null,
      cadastradoEm: c.createdAt.toISOString().split('T')[0],
    })),
  };
}

// ---------------------------------------------------------------------------
// gerar_relatorio_territorial — valida os nomes e prepara o relatório por RA.
// NÃO devolve o dataset inteiro (evita estourar o turno) — o PDF é montado no
// endpoint /api/agent/relatorio-territorial a partir destes parâmetros.
// ---------------------------------------------------------------------------
export async function executarGerarRelatorioTerritorial(
  args: { deputados?: string[]; ano?: number; uf?: string; cargo?: string },
  _session: UserSession,
) {
  const ano   = args.ano ? Number(args.ano) : 2022;
  const uf    = (args.uf ?? 'DF').toUpperCase();
  const cargo = args.cargo ?? 'Deputado Distrital';
  const nomes = Array.isArray(args.deputados)
    ? args.deputados.map(n => String(n).trim()).filter(n => n.length > 1)
    : [];

  if (nomes.length === 0) {
    return { encontrado: false, mensagem: 'Informe ao menos um deputado para o relatório territorial.' };
  }
  if (uf !== 'DF') {
    return { encontrado: false, mensagem: 'O relatório territorial por Região Administrativa está disponível para o DF.' };
  }

  // Eleições a varrer, em ordem. O SENADO renova de forma alternada, então os
  // 3 senadores em exercício vêm de duas eleições (2018 e 2022) — varrer um ano
  // só devolveria uma bancada incompleta. Para deputado, o fallback continua
  // sendo o outro cargo do DF (distrital ↔ federal).
  const ehSenado = normalizarTextoTse(cargo).includes('senador');
  const lotes = ehSenado
    ? [{ ano, cargo: 'Senador' }, { ano: ano === 2018 ? 2022 : 2018, cargo: 'Senador' }]
    : [{ ano, cargo }, { ano, cargo: normalizarTextoTse(cargo).includes('distrital') ? 'Deputado Federal' : 'Deputado Distrital' }];

  const encontrados: Array<{ nome: string; ano: number; cargo: string }> = [];
  const usados: Array<{ ano: number; cargo: string }> = [];
  let faltantes = nomes;

  for (const lote of lotes) {
    if (faltantes.length === 0) break;
    const r = await resolverDeputados(faltantes, lote.ano, uf, lote.cargo);
    if (r.encontrados.length > 0) {
      encontrados.push(...r.encontrados.map(e => ({
        nome: e.cand.nomeUrna, ano: lote.ano, cargo: lote.cargo,
      })));
      usados.push(lote);
    }
    faltantes = r.faltantes;
  }

  // O PDF varre o primeiro lote e, com os nomes que sobrarem, os seguintes.
  const principal = usados[0] ?? lotes[0];
  const extras = usados.slice(1);

  return {
    tipo: 'relatorio_territorial',
    ano: principal.ano, uf, cargo: principal.cargo,
    tambemEm: extras.length > 0 ? extras : undefined,  // reenviado ao endpoint do PDF
    solicitados: nomes.length,
    deputados: nomes,                                  // reenviados ao endpoint do PDF
    encontrados: encontrados.map(e => e.nome),
    // Quem veio de qual eleição — a Gabi precisa disso para não dizer que os
    // três senadores são da mesma eleição.
    porEleicao: encontrados.map(e => `${e.nome} — ${e.cargo}, eleito em ${e.ano}`),
    faltantes,
    prontoParaGerar: encontrados.length > 0,
    ...(extras.length > 0 && {
      observacao: 'Os parlamentares vêm de eleições diferentes (renovação alternada do Senado). '
        + 'Diga isso ao usuário com naturalidade e lembre que votos de eleições distintas não se '
        + 'comparam diretamente — o que se compara é o padrão territorial de cada um.',
    }),
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
    case 'buscar_agenda':
      return executarBuscarAgenda(args as any, session);
    case 'buscar_contatos':
      return executarBuscarContatos(args as any, session);
    case 'localizar_parlamentar':
      return executarLocalizarParlamentar(args as any, session);
    case 'gerar_relatorio_territorial':
      return executarGerarRelatorioTerritorial(args as any, session);
    case 'gerar_visualizacao':
      return executarGerarVisualizacao(args as any, session);
    default:
      return { erro: `Ferramenta desconhecida: ${nome}` };
  }
}
