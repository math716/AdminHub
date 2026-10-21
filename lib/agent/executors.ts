import { prisma } from '@/lib/db';
import {
  loadStaticTseData, buscarCandidatoNoJson, buscarCandidatoTolerante, normalizarTextoTse,
  bairrosPorZona, anosDisponiveisTse, sugerirCandidatos, temSegundoTurno,
  loadSecaoMunicipio, votosDoCandidatoPorLocal, type CandidatoJson,
} from '@/lib/tse-static';
import { buscarCandidatoNacional, inferirUfPorNomes, rankingNacional } from '@/lib/tse-index';
import { resolverDeputados } from '@/lib/agent/report/df-territorial';
import { votosNoBairro } from '@/lib/agent/votos-bairro';
import { SQL_DATA_COMEMORATIVA } from '@/lib/agenda-datas';
import { chaveMunicipio } from '@/lib/municipio-nome';
import { filtroEsferaAtiva, UFS_ESTADUAIS_ATIVAS } from '@/lib/emendas/estados-ativos';
import type { Session } from 'next-auth';
import { PERMISSIONS, hasPermission, type Permission } from '@/lib/permissions';

type UserSession = Session & { user: any };

/** Área (permissão) que cada ferramenta da Gabi exige — basta uma das listadas. */
const AREA_DA_FERRAMENTA: Record<string, { permissoes: Permission[]; area: string }> = {
  buscar_emendas:              { permissoes: [PERMISSIONS.EMENDAS_MAPA], area: 'Emendas Parlamentares' },
  comparar_parlamentares:      { permissoes: [PERMISSIONS.EMENDAS_MAPA], area: 'Emendas Parlamentares' },
  buscar_votacao:              { permissoes: [PERMISSIONS.MAPA_ELEITORAL, PERMISSIONS.PROJETO_CAMPANHA], area: 'Mapa Eleitoral' },
  ranking_nacional:            { permissoes: [PERMISSIONS.MAPA_ELEITORAL, PERMISSIONS.PROJETO_CAMPANHA], area: 'Mapa Eleitoral' },
  comparar_votacao:            { permissoes: [PERMISSIONS.MAPA_ELEITORAL, PERMISSIONS.PROJETO_CAMPANHA], area: 'Mapa Eleitoral' },
  gerar_relatorio_territorial: { permissoes: [PERMISSIONS.MAPA_ELEITORAL, PERMISSIONS.PROJETO_CAMPANHA], area: 'Mapa Eleitoral' },
  localizar_parlamentar:       { permissoes: [PERMISSIONS.MAPA_ELEITORAL, PERMISSIONS.PROJETO_CAMPANHA, PERMISSIONS.EMENDAS_MAPA], area: 'Mapa Eleitoral ou Emendas' },
  buscar_demandas:             { permissoes: [PERMISSIONS.DEMANDAS, PERMISSIONS.MAPA_GABINETE], area: 'Demandas' },
  buscar_agenda:               { permissoes: [PERMISSIONS.AGENDA], area: 'Agenda' },
  buscar_contatos:             { permissoes: [PERMISSIONS.CONTATOS], area: 'Contatos' },
  // dados_municipio (IBGE, público) e gerar_visualizacao (desenha o que já veio) ficam livres.
};

// ---------------------------------------------------------------------------
// buscar_emendas
// ---------------------------------------------------------------------------
type FiltrosEmendas = {
  parlamentar_nome?: string;
  cargo?: string;
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
  // Estaduais só das UFs com importação conferida (lib/emendas/estados-ativos).
  return { AND: [filtroEsferaAtiva, {
    // Cargo junto do nome: há homônimos ("Marcos Pereira" é deputado federal
    // E deputado estadual em SP), e só o nome somava os dois.
    ...((a.parlamentar_nome && !ignorar.has('parlamentar')) || a.cargo ? {
      parlamentar: { AND: [
        ...(a.parlamentar_nome && !ignorar.has('parlamentar') ? [filtroNomeParlamentar(a.parlamentar_nome)] : []),
        ...(a.cargo ? [{ cargo: a.cargo as any }] : []),
      ] },
    } : {}),
    ...(a.uf && !ignorar.has('uf') && { uf: a.uf.toUpperCase() }),
    // Município: a emenda que mandou ALGUM pedaço para lá (documentos), ou —
    // quando os documentos não dizem o município — a do cadastro.
    ...(a.municipio && !ignorar.has('municipio') && { OR: [
      { municipios: { some: { municipio: { contains: a.municipio, mode: 'insensitive' as const } } } },
      {
        municipioNome: { contains: a.municipio, mode: 'insensitive' as const },
        municipios: { none: {} },
      },
    ] }),
    ...(a.area && !ignorar.has('area') && { area: a.area as any }),
    ...(a.ano && !ignorar.has('ano') && { ano: Number(a.ano) }),
    ...(a.esfera && !ignorar.has('esfera') && { esfera: a.esfera as any }),
  }] } as any;
}

const ROTULO_FILTRO: Record<string, string> = {
  ano: 'ano', area: 'área temática', municipio: 'município', parlamentar: 'parlamentar',
};

/**
 * As partes batem com o todo?
 *
 * Conferência determinística, feita aqui e não pedida ao modelo: se a soma das
 * áreas não fecha com o total, alguma coisa somou o que não devia. Foi assim
 * que um relatório saiu com R$ 6,1B na capa e R$ 4,5B na tabela — o modelo não
 * tinha como desconfiar, porque os dois números chegaram prontos.
 *
 * Tolerância de um centavo por área: são floats vindos do banco.
 */
export function conferirSomas(
  totais: { total: number; empenhado: number; pago: number },
  porArea: Array<{ emendas: number; empenhado: number; pago: number }>,
): string | undefined {
  if (porArea.length === 0) return undefined;

  const somaEmendas = porArea.reduce((s, a) => s + a.emendas, 0);
  const somaEmp = porArea.reduce((s, a) => s + a.empenhado, 0);
  const somaPago = porArea.reduce((s, a) => s + a.pago, 0);
  const folga = Math.max(0.01 * porArea.length, 1);

  const problemas: string[] = [];
  if (somaEmendas !== totais.total) {
    problemas.push(`as áreas somam ${somaEmendas} emendas, o total diz ${totais.total}`);
  }
  if (Math.abs(somaEmp - totais.empenhado) > folga) {
    problemas.push(`as áreas somam ${somaEmp.toFixed(2)} de empenhado, o total diz ${totais.empenhado.toFixed(2)}`);
  }
  if (Math.abs(somaPago - totais.pago) > folga) {
    problemas.push(`as áreas somam ${somaPago.toFixed(2)} de pago, o total diz ${totais.pago.toFixed(2)}`);
  }
  if (problemas.length === 0) return undefined;

  return `NÃO PUBLIQUE ESTES NÚMEROS: ${problemas.join('; ')}. `
    + 'Diga ao usuário que houve inconsistência ao juntar os dados e refaça a busca '
    + 'com um recorte só, em vez de apresentar valores que não fecham entre si.';
}

/**
 * O recorte destes números, em texto — para a Gabi citar junto do valor.
 *
 * Sem isto ela não tem como saber, olhando duas respostas na mesma conversa,
 * que uma cobre 2026 e a outra cobre todos os anos. Caso real: comparou "Altair
 * com 100%" (só 2026) contra "Bragato com 71%" (todos os anos) na mesma frase,
 * como se fossem a mesma medida. Nenhum dos dois números estava errado; a
 * comparação é que não existia.
 */
function descreverRecorte(a: FiltrosEmendas, ignorados: string[], anos: number[]): string {
  const ign = new Set(ignorados);
  const partes: string[] = [];
  if (a.parlamentar_nome && !ign.has('parlamentar')) partes.push(a.parlamentar_nome);
  if (a.cargo) partes.push(CARGO_CURTO[a.cargo] ?? a.cargo.toLowerCase());
  if (a.uf) partes.push(a.uf.toUpperCase());
  if (a.esfera) partes.push(String(a.esfera).toLowerCase());
  if (a.municipio && !ign.has('municipio')) partes.push(a.municipio);
  if (a.area && !ign.has('area')) partes.push(String(a.area).toLowerCase());
  partes.push(a.ano && !ign.has('ano')
    ? String(a.ano)
    : anos.length > 0
      ? `todos os anos (${anos[0]}–${anos[anos.length - 1]})`
      : 'todos os anos');
  return partes.join(' · ');
}

/**
 * Emenda sem valor publicado: estadual, sem empenhado, sem pago e sem valor
 * destinado. É o que o governo de SP faz com a maioria das transferências
 * voluntárias (91% das de 2025, todas as de 2026) — o arquivo traz as colunas
 * de valor vazias.
 */
const SEM_VALOR_PUBLICADO = { esfera: 'ESTADUAL' as const, valorEmpenhado: 0, valorPago: 0, valorProposto: null };
const semValorPublicadoEm = (e: { esfera: string; valorEmpenhado: number; valorPago: number; valorProposto: number | null }) =>
  e.esfera === 'ESTADUAL' && !e.valorEmpenhado && !e.valorPago && e.valorProposto == null;

const CARGO_CURTO: Record<string, string> = {
  DEPUTADO_FEDERAL: 'deputado federal', DEPUTADO_ESTADUAL: 'deputado estadual', SENADOR: 'senador',
  VEREADOR: 'vereador', BANCADA: 'bancada', COMISSAO: 'comissão', RELATOR: 'relator',
  GOVERNADOR: 'governador', PREFEITO: 'prefeito',
};

/**
 * Quanto cada parlamentar do recorte mandou para cada município — a soma
 * pronta por município (emendas_municipios), o mesmo critério do valor por
 * município. Emenda sem essa soma (estadual, ou federal ainda não
 * reimportada): o município do cadastro.
 */
async function destinosPorParlamentar(
  whereFinal: any,
  rotulo: (id: string | null) => string,
  partido: (id: string) => string,
) {
  const linhas = await prisma.emendaParlamentar.findMany({
    where: whereFinal,
    select: { id: true, parlamentarId: true, municipioNome: true, uf: true, valorEmpenhado: true },
  });
  const pedacos = linhas.length > 0
    ? await prisma.emendaMunicipio.findMany({
        where: { emenda: whereFinal },
        select: { emendaId: true, municipio: true, empenhado: true },
      })
    : [];
  const pedacosPorEmenda = new Map<string, typeof pedacos>();
  for (const d of pedacos) pedacosPorEmenda.set(d.emendaId, [...(pedacosPorEmenda.get(d.emendaId) ?? []), d]);

  const soma = new Map<string, { municipio: string; parlamentar: string; partido: string; valorEmpenhado: number }>();
  const somar = (municipio: string, l: (typeof linhas)[number], valor: number) => {
    const parlamentar = rotulo(l.parlamentarId);
    const chave = `${parlamentar}|${chaveMunicipio(municipio, l.uf ?? undefined)}`;
    const atual = soma.get(chave)
      ?? { municipio, parlamentar, partido: l.parlamentarId ? partido(l.parlamentarId) : '', valorEmpenhado: 0 };
    atual.valorEmpenhado += valor;
    soma.set(chave, atual);
  };
  for (const l of linhas) {
    const ps = pedacosPorEmenda.get(l.id) ?? [];
    if (ps.length > 0) {
      for (const p of ps) if (p.municipio) somar(p.municipio, l, p.empenhado);
    } else if (l.municipioNome) {
      somar(l.municipioNome, l, l.valorEmpenhado);
    }
  }
  return [...soma.values()];
}

/** Sigla do estado pelo começo do código do IBGE do município. */
const UF_POR_PREFIXO_IBGE: Record<string, string> = {
  '12': 'AC', '27': 'AL', '16': 'AP', '13': 'AM', '29': 'BA', '23': 'CE', '53': 'DF',
  '32': 'ES', '52': 'GO', '21': 'MA', '51': 'MT', '50': 'MS', '31': 'MG', '15': 'PA',
  '25': 'PB', '41': 'PR', '26': 'PE', '22': 'PI', '33': 'RJ', '24': 'RN', '43': 'RS',
  '11': 'RO', '14': 'RR', '42': 'SC', '35': 'SP', '28': 'SE', '17': 'TO',
};

type Soma = { empenhado: number; pago: number };
type GrupoComoPrisma<K extends string> = { [k in K]: any } & {
  _count: { _all: number }; _sum: { valorEmpenhado: number | null; valorPago: number | null };
};

/**
 * Quanto de cada emenda do recorte foi para a cidade perguntada, e os totais,
 * áreas e parlamentares somados por esse pedaço (no mesmo formato dos
 * agrupamentos do banco, para o resto da função não mudar).
 *
 * Emenda com a soma por município pronta: o pedaço daquela cidade.
 * Emenda sem (estadual, de um município só): conta inteira, como antes.
 */
async function pedacosNaCidade(whereFinal: any, cidade: string) {
  const [linhas, pedacos] = await Promise.all([
    prisma.emendaParlamentar.findMany({
      where: whereFinal,
      select: { id: true, area: true, parlamentarId: true, valorEmpenhado: true, valorPago: true },
    }),
    prisma.emendaMunicipio.groupBy({
      by: ['emendaId'],
      where: { municipio: { contains: cidade, mode: 'insensitive' }, emenda: whereFinal },
      _sum: { empenhado: true, pago: true },
    }),
  ]);

  const porEmenda = new Map<string, Soma>(
    pedacos.map(p => [p.emendaId, { empenhado: p._sum.empenhado ?? 0, pago: p._sum.pago ?? 0 }]));

  const total: Soma = { empenhado: 0, pago: 0 };
  const area = new Map<string, GrupoComoPrisma<'area'>>();
  const parl = new Map<string, GrupoComoPrisma<'parlamentarId'>>();
  const juntar = <K extends string>(m: Map<string, GrupoComoPrisma<K>>, campo: K, chave: string | null, v: Soma) => {
    const g = m.get(String(chave)) ?? ({ [campo]: chave, _count: { _all: 0 }, _sum: { valorEmpenhado: 0, valorPago: 0 } } as GrupoComoPrisma<K>);
    g._count._all += 1;
    g._sum.valorEmpenhado = (g._sum.valorEmpenhado ?? 0) + v.empenhado;
    g._sum.valorPago = (g._sum.valorPago ?? 0) + v.pago;
    m.set(String(chave), g);
  };
  for (const e of linhas) {
    const v = porEmenda.get(e.id) ?? { empenhado: e.valorEmpenhado, pago: e.valorPago };
    total.empenhado += v.empenhado;
    total.pago += v.pago;
    juntar(area, 'area', e.area, v);
    juntar(parl, 'parlamentarId', e.parlamentarId, v);
  }
  return { porEmenda, total, porArea: [...area.values()], porParlamentar: [...parl.values()] };
}

export async function executarBuscarEmendas(
  args: FiltrosEmendas,
  _session: UserSession,
) {
  // Exige pelo menos um filtro para evitar dumps desnecessários
  if (!args.parlamentar_nome && !args.cargo && !args.uf && !args.municipio && !args.area && !args.ano) {
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

  // Os totais saem de uma AGREGAÇÃO sobre todas as linhas do recorte, não da
  // soma da lista acima — ela é só uma amostra das 100 de maior valor pago.
  //
  // Somar a amostra produzia dois erros que chegavam ao relatório com cara de
  // dado: o "total de emendas" era sempre 100 (o teto da consulta), e a
  // execução passava de 100%, porque ordenar por valor pago seleciona
  // justamente as linhas em que o pago pesa mais que o empenhado. Medido em
  // SP/2026: 101% de execução e "100 emendas" num recorte de milhares.
  const whereFinal = whereEmendas(args, new Set(filtrosIgnorados));

  // Anos que a base REALMENTE cobre neste recorte (ignorando o ano pedido).
  // Sem isto a Gabi só descobre a cobertura quando a busca falha; achando algo,
  // ela afirmava de cabeça — e errou: disse "a base cobre 2022 a 2026" num
  // recorte de SP que começa em 2021.
  const whereSemAno = whereEmendas(args, new Set([...filtrosIgnorados, 'ano']));

  const [resumo, porAreaBruto, porParlamentarBruto, porMunicipioBruto, porUfBruto, anosBruto, porDestino, semDivisao, docsDaLista] = await Promise.all([
    prisma.emendaParlamentar.aggregate({
      where: whereFinal,
      _count: { _all: true },
      _sum: { valorEmpenhado: true, valorPago: true },
    }),
    prisma.emendaParlamentar.groupBy({
      by: ['area'],
      where: whereFinal,
      _count: { _all: true },
      _sum: { valorEmpenhado: true, valorPago: true },
    }),
    // Sem `take`: o mesmo agrupamento serve para o ranking E para saber
    // QUANTOS parlamentares existem no recorte. Contar os nomes distintos da
    // amostra dava um número que era efeito do corte — o relatório de SP/2026
    // saiu intitulado "54 parlamentares" só porque 54 nomes couberam nas 100.
    prisma.emendaParlamentar.groupBy({
      by: ['parlamentarId'],
      where: whereFinal,
      _count: { _all: true },
      _sum: { valorEmpenhado: true, valorPago: true },
    }),
    // Valor por município das emendas SEM a soma por município (estaduais —
    // lá cada emenda é de um município só, e o cadastro diz qual — e federais
    // ainda não reimportadas). As demais vêm da soma pronta logo abaixo.
    prisma.emendaParlamentar.groupBy({
      by: ['municipioNome'],
      where: { AND: [whereFinal, { municipios: { none: {} } }] },
      _sum: { valorEmpenhado: true, valorPago: true },
    }),
    // Também só para o mapa. Diz em QUANTOS estados o recorte se espalha —
    // sem isso o relatório escolhia o estado mais frequente da AMOSTRA e
    // desenhava só ele, calando os demais sem avisar.
    prisma.emendaParlamentar.groupBy({
      by: ['uf'],
      where: whereFinal,
      _sum: { valorEmpenhado: true, valorPago: true },
    }),
    prisma.emendaParlamentar.groupBy({
      by: ['ano'],
      where: whereSemAno,
      _count: { _all: true },
      orderBy: { ano: 'asc' },
    }),
    // Uma emenda federal costuma ser DIVIDIDA entre vários municípios (em 2025,
    // metade delas). O cadastro da emenda guarda um município só, e somar por
    // ele punha o valor inteiro numa cidade: a Gabi disse "Guará, R$ 17 mi"
    // para uma emenda Pix repartida entre 28 municípios, em que Guará recebeu
    // R$ 495 mil. Quem diz para onde foi cada real são os documentos; a soma
    // deles por município vem pronta (lib/emendas/emendas-municipios.ts) —
    // somar os documentos aqui lia centenas de milhares de linhas por estado.
    prisma.emendaMunicipio.groupBy({
      by: ['codigoIbge', 'municipio'],
      where: { emenda: whereFinal },
      _sum: { empenhado: true, pago: true },
    }),
    // Federais ainda sem a soma por município (anos não reimportados): o
    // valor delas vai pelo município do cadastro, que pode ser só um dos
    // vários que a emenda atendeu — a Gabi é avisada.
    prisma.emendaParlamentar.count({
      where: { AND: [whereFinal, { municipios: { none: {} } }, { documentos: { some: {} } }] },
    }),
    // Em quantos municípios cada emenda da lista foi dividida.
    prisma.emendaDocumento.groupBy({
      by: ['emendaId', 'codigoIbgeDestino', 'ufFavorecido', 'municipioFavorecido'],
      where: { emendaId: { in: emendas.map(e => e.id) }, fase: 'Empenho' },
    }),
  ]);

  // Esferas do recorte e emendas sem valor publicado. Um deputado federal pode
  // ter também repasses do governo do estado indicados por ele (em SP, a
  // "Transferência Voluntária"): somar as duas coisas sem dizer dava "47
  // emendas" a quem tinha 5 federais. E o governo de SP não publica valor para
  // a maioria dessas transferências — aparecem com R$ 0, que não é o valor.
  const [porEsferaBruto, semValorPublicado] = await Promise.all([
    prisma.emendaParlamentar.groupBy({
      by: ['esfera'],
      where: whereFinal,
      _count: { _all: true },
      _sum: { valorEmpenhado: true, valorPago: true },
    }),
    prisma.emendaParlamentar.count({ where: { AND: [whereFinal, SEM_VALOR_PUBLICADO] } }),
  ]);

  // Pergunta sobre UMA cidade: cada emenda conta só o pedaço que foi para ela.
  // Sem isto, "quanto Osasco recebeu" somava as emendas inteiras que passaram
  // por Osasco — R$ 8,6 mi de uma emenda em que Osasco recebeu R$ 2 mi.
  const filtroCidade = args.municipio && !filtrosIgnorados.includes('municipio') ? args.municipio : null;
  const pedacoNaCidade = filtroCidade
    ? await pedacosNaCidade(whereFinal, filtroCidade)
    : null;

  const totalEmendas = resumo._count._all;
  const totalEmpenhado = pedacoNaCidade ? pedacoNaCidade.total.empenhado : resumo._sum.valorEmpenhado ?? 0;
  const totalPago = pedacoNaCidade ? pedacoNaCidade.total.pago : resumo._sum.valorPago ?? 0;

  const porParlamentar = (pedacoNaCidade ? pedacoNaCidade.porParlamentar : porParlamentarBruto)
    .filter(p => p.parlamentarId)
    .sort((a, b) => (b._sum.valorEmpenhado ?? 0) - (a._sum.valorEmpenhado ?? 0));
  const top = porParlamentar.slice(0, 15);

  // Nome de quem lidera o ranking — o groupBy devolve só o id.
  const idsTop = top.map(p => p.parlamentarId).filter((i): i is string => !!i);
  const dadosParlamentar = idsTop.length > 0
    ? await prisma.parlamentar.findMany({
        where: { id: { in: idsTop } },
        select: { id: true, nome: true, partido: true, uf: true, cargo: true },
      }).catch(() => [] as any[])
    : [];
  const porId = new Map(dadosParlamentar.map((p: any) => [p.id, p]));
  // Mesmo nome, pessoas diferentes: o nome sozinho não as separa — nem no
  // texto, nem na legenda do mapa (saiu "Marcos Pereira" duas vezes).
  const nomesRepetidos = new Set(
    dadosParlamentar.map((p: any) => p.nome).filter((n: string, i: number, t: string[]) => t.indexOf(n) !== i));
  const rotuloParlamentar = (id: string | null | undefined) => {
    const p = id ? porId.get(id) : undefined;
    if (!p) return 'N/A';
    return nomesRepetidos.has(p.nome) ? `${p.nome} (${CARGO_CURTO[p.cargo] ?? p.cargo})` : p.nome;
  };

  // Busca por nome, sem cargo, que achou mais de uma pessoa: os números acima
  // somam todas. Caso real: "deputado federal Marcos Pereira" trouxe também o
  // deputado estadual homônimo, e a resposta falou em "47 emendas em 2025"
  // (5 do federal + 42 do estadual) como se fossem de um só.
  const homonimos = args.parlamentar_nome && !args.cargo && !filtrosIgnorados.includes('parlamentar') && porParlamentar.length > 1
    ? top.map(p => ({
        nome: porId.get(p.parlamentarId!)?.nome ?? 'N/A',
        cargo: porId.get(p.parlamentarId!)?.cargo ?? '',
        uf: porId.get(p.parlamentarId!)?.uf ?? '',
        partido: porId.get(p.parlamentarId!)?.partido ?? '',
        emendas: p._count._all,
      }))
    : null;

  // Para o mapa "quem mais destinou em cada município" (2 a 6 parlamentares):
  // quanto cada um mandou para cada cidade, pelos documentos. Não vai ao modelo.
  const porMunicipioParlamentar = porParlamentar.length >= 2 && porParlamentar.length <= 6
    ? await destinosPorParlamentar(whereFinal, rotuloParlamentar, (id) => porId.get(id)?.partido ?? '')
        .catch(() => undefined)
    : undefined;

  const anosDisponiveis = anosBruto.map(a => ({ ano: a.ano, emendas: a._count._all }));

  const porArea = (pedacoNaCidade ? pedacoNaCidade.porArea : porAreaBruto)
    .map(a => ({
      area: a.area,
      emendas: a._count._all,
      empenhado: a._sum.valorEmpenhado ?? 0,
      pago: a._sum.valorPago ?? 0,
    }))
    .sort((a, b) => b.empenhado - a.empenhado);

  // Aqui os números vêm todos da mesma consulta, então isto nunca deve disparar
  // — é rede de segurança para quando alguém mexer na montagem do retorno.
  const inconsistencia = conferirSomas(
    { total: totalEmendas, empenhado: totalEmpenhado, pago: totalPago }, porArea);

  // Só documentos de quem recebeu no estado da emenda: a taxa do SERPRO, paga
  // em Brasília, não é um destino da emenda de SP.
  const ufsDoRecorte = new Set(porUfBruto.map(u => String(u.uf ?? '').toUpperCase()).filter(Boolean));
  const ufUnica = ufsDoRecorte.size === 1 ? [...ufsDoRecorte][0] : undefined;
  const porMunicipioMapa = new Map<string, { municipio: string; uf?: string; empenhado: number; pago: number }>();
  const somarMunicipio = (nome: string, uf: string | undefined, empenhado: number, pago: number) => {
    const chave = `${uf ?? ''}|${chaveMunicipio(nome, uf)}`;
    const atual = porMunicipioMapa.get(chave) ?? { municipio: nome, ...(uf && { uf }), empenhado: 0, pago: 0 };
    atual.empenhado += empenhado;
    atual.pago += pago;
    porMunicipioMapa.set(chave, atual);
  };
  for (const d of porDestino) {
    if (!d.municipio) continue;
    somarMunicipio(d.municipio, UF_POR_PREFIXO_IBGE[d.codigoIbge.slice(0, 2)], d._sum.empenhado ?? 0, d._sum.pago ?? 0);
  }
  for (const m of porMunicipioBruto) {
    if (m.municipioNome) somarMunicipio(m.municipioNome, ufUnica, m._sum.valorEmpenhado ?? 0, m._sum.valorPago ?? 0);
  }
  // Pergunta sobre uma cidade: as emendas que passaram por ela também foram
  // para outras — o ranking mostra só a cidade perguntada.
  const chaveCidade = filtroCidade ? chaveMunicipio(filtroCidade) : null;
  const municipiosComValor = [...porMunicipioMapa.values()]
    .filter(m => m.empenhado > 0 || m.pago > 0)
    .filter(m => !chaveCidade || chaveMunicipio(m.municipio).includes(chaveCidade))
    .sort((a, b) => b.empenhado - a.empenhado);

  // Municípios de cada emenda da lista, pelos documentos de empenho: o
  // destino gravado; na transição, quem recebeu no estado da emenda.
  const municipiosDaEmenda = new Map<string, Set<string>>();
  const comDestino = new Set(docsDaLista.filter(d => d.codigoIbgeDestino).map(d => d.emendaId));
  const ufDaEmenda = new Map(emendas.map(e => [e.id, String(e.uf ?? '').toUpperCase()]));
  for (const d of docsDaLista) {
    let chave: string | null = null;
    if (comDestino.has(d.emendaId)) chave = d.codigoIbgeDestino;
    else if (d.municipioFavorecido && String(d.ufFavorecido ?? '').toUpperCase() === ufDaEmenda.get(d.emendaId)) {
      chave = chaveMunicipio(d.municipioFavorecido, ufDaEmenda.get(d.emendaId));
    }
    if (!chave) continue;
    const s = municipiosDaEmenda.get(d.emendaId) ?? new Set<string>();
    s.add(chave);
    municipiosDaEmenda.set(d.emendaId, s);
  }

  return {
    encontrado: true,
    /**
     * O que estes números cobrem, em texto. CITE junto do valor, e nunca
     * compare com um resultado de recorte diferente sem dizer.
     */
    recorte: descreverRecorte(args, filtrosIgnorados, anosDisponiveis.map(a => a.ano)),
    /**
     * Os filtros de fato aplicados. Quem junta dois resultados precisa deles
     * para saber se os recortes se sobrepõem — somar "SP, todos os anos" com
     * "SP, 2022" conta 2022 duas vezes.
     */
    filtros: {
      parlamentar: args.parlamentar_nome && !filtrosIgnorados.includes('parlamentar') ? args.parlamentar_nome : null,
      cargo: args.cargo ?? null,
      uf: args.uf ? args.uf.toUpperCase() : null,
      esfera: args.esfera ?? null,
      municipio: args.municipio && !filtrosIgnorados.includes('municipio') ? args.municipio : null,
      area: args.area && !filtrosIgnorados.includes('area') ? args.area : null,
      ano: args.ano && !filtrosIgnorados.includes('ano') ? Number(args.ano) : null,
    },
    ...(inconsistencia && { inconsistencia }),
    total: totalEmendas,
    totalEmpenhado,
    totalPago,
    /** Quantas vieram na lista `emendas` — quase sempre menor que `total`. */
    mostrando: emendas.length,
    ...(totalEmendas > emendas.length && {
      avisoLista:
        `A lista "emendas" traz apenas as ${emendas.length} de MAIOR VALOR PAGO, de ${totalEmendas} no recorte. ` +
        'Nunca diga que o recorte tem ' + emendas.length + ' emendas, e nunca some a lista para chegar a um total: ' +
        'use "total", "totalEmpenhado", "totalPago", "porArea" e "topParlamentares", que já cobrem TODAS as linhas.',
    }),
    /** Distribuição por área sobre TODAS as linhas — base do gráfico. */
    porArea,
    /** Quantos parlamentares existem no recorte inteiro. */
    totalParlamentares: porParlamentar.length,
    /**
     * Anos que a base cobre neste recorte, com quantas emendas em cada.
     * É o que a Gabi deve citar ao falar de cobertura — nunca de memória.
     */
    anosDisponiveis,
    /**
     * Os municípios que mais receberam — este VAI para o modelo.
     *
     * Sem ele a Gabi respondia que "não existe ranking por município, peça um
     * de cada vez": o `porMunicipio` completo é removido antes de ir ao modelo
     * (são centenas de linhas, só o mapa precisa), e nada ocupava esse lugar.
     * Quinze cobrem a pergunta sem pesar no turno.
     */
    topMunicipios: municipiosComValor.slice(0, 15),
    ...(semDivisao > 0 && {
      avisoMunicipiosAproximados:
        `${semDivisao} emenda(s) federal(is) do recorte ainda não têm o valor dividido por município (o ano está ` +
        'sendo atualizado): nelas o valor inteiro aparece no município principal da emenda. Ao citar valores por ' +
        'município, diga que a divisão por cidade ainda está sendo atualizada para parte das emendas.',
    }),
    ...(porDestino.length > 0 && {
      notaMunicipios:
        'Valor por município somado dos documentos de empenho e de pagamento de cada cidade. O pago por município ' +
        'pode ficar abaixo de "totalPago", que inclui restos a pagar pagos; o total oficial é "totalPago".',
    }),
    /** Valor por município, para o mapa de calor. Removido antes de ir ao modelo. */
    porMunicipio: municipiosComValor,
    /**
     * Valor por estado, sobre TODAS as linhas do recorte — não sobre a amostra.
     *
     * Serve para o relatório saber se o recorte cabe num estado (e aí o mapa é
     * daquele estado, por município) ou se atravessa vários (e aí o mapa é do
     * país). Escolher pelo estado mais frequente da amostra desenhava um
     * estado só e calava os demais.
     */
    porUf: porUfBruto
      .filter(u => u.uf && ((u._sum.valorEmpenhado ?? 0) > 0 || (u._sum.valorPago ?? 0) > 0))
      .map(u => ({
        uf: String(u.uf).toUpperCase(),
        empenhado: u._sum.valorEmpenhado ?? 0,
        pago: u._sum.valorPago ?? 0,
      }))
      .sort((a, b) => b.empenhado - a.empenhado),
    /** Ranking por valor empenhado sobre TODAS as linhas (15 primeiros). */
    ...(porEsferaBruto.length > 1 && {
      porEsfera: porEsferaBruto.map(g => ({
        esfera: g.esfera,
        emendas: g._count._all,
        empenhado: g._sum.valorEmpenhado ?? 0,
        pago: g._sum.valorPago ?? 0,
      })),
      avisoEsferas:
        'O recorte junta emendas FEDERAIS (Orçamento da União) e ESTADUAIS (orçamento do estado — no caso de um ' +
        'deputado federal ou senador, são repasses do governo do estado indicados por ele). Apresente SEPARADO, com ' +
        'a quantidade e o valor de cada uma (veja "porEsfera"); nunca diga um total de emendas somando as duas sem ' +
        'dizer quantas são de cada.',
    }),
    ...(semValorPublicado > 0 && {
      emendasSemValorPublicado: semValorPublicado,
      avisoSemValor:
        `${semValorPublicado} emenda(s) do recorte não têm valor publicado pelo governo do estado (aparecem com ` +
        'valorPublicado=false e valores zerados). NÃO diga que valem R$ 0, que não foram empenhadas nem que estão ' +
        'paradas: o valor simplesmente não foi divulgado. Diga quantas são e que o governo do estado não publicou ' +
        'o valor; os totais em reais cobrem só as que têm valor.',
    }),
    ...(homonimos && {
      homonimos,
      avisoHomonimos:
        `O nome "${args.parlamentar_nome}" corresponde a ${homonimos.length} parlamentares DIFERENTES (veja "homonimos"). ` +
        'Todos os números acima SOMAM todos eles. Se o usuário disse o cargo ("deputado federal", "estadual", "senador"), ' +
        'refaça a busca com "cargo" antes de responder; se não disse, pergunte de qual deles está falando ou apresente ' +
        'cada um separado — nunca some pessoas diferentes como se fossem uma.',
    }),
    ...(porMunicipioParlamentar && { porMunicipioParlamentar }),
    topParlamentares: top.map(p => ({
      nome: rotuloParlamentar(p.parlamentarId),
      partido: porId.get(p.parlamentarId!)?.partido ?? '',
      emendas: p._count._all,
      empenhado: p._sum.valorEmpenhado ?? 0,
      pago: p._sum.valorPago ?? 0,
    })),
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
      parlamentar: nomesRepetidos.has(e.parlamentar?.nome ?? '')
        ? `${e.parlamentar!.nome} (${CARGO_CURTO[e.parlamentar!.cargo] ?? e.parlamentar!.cargo})`
        : e.parlamentar?.nome ?? 'N/A',
      partido: e.parlamentar?.partido ?? '',
      cargo: e.parlamentar?.cargo ?? '',
      ano: e.ano,
      area: e.area,
      // objeto completo pode ter parágrafos — 100 emendas estouravam o turno
      objeto: (e.objeto ?? '').slice(0, 140),
      // Dividida entre vários municípios: dizer um só atribuía a ele o valor
      // inteiro da emenda. O valor de cada cidade está em `topMunicipios`.
      ...((municipiosDaEmenda.get(e.id)?.size ?? 0) > 1
        ? { municipio: `Vários municípios (${municipiosDaEmenda.get(e.id)!.size})`, municipios: municipiosDaEmenda.get(e.id)!.size }
        : { municipio: e.municipioNome ?? '' }),
      uf: e.uf ?? '',
      esfera: e.esfera,
      ...(() => {
        // Pergunta de uma cidade e emenda dividida: o pedaço dela, e de
        // quanto era a emenda inteira.
        const p = pedacoNaCidade?.porEmenda.get(e.id);
        const emp = p ? p.empenhado : e.valorEmpenhado;
        const pago = p ? p.pago : e.valorPago;
        // Governo do estado não publicou o valor: zero aqui não é valor.
        if (semValorPublicadoEm(e)) {
          return { valorEmpenhado: 0, valorPago: 0, valorPublicado: false, execucao: null };
        }
        return {
          valorEmpenhado: emp,
          valorPago: pago,
          ...(p && { valorEmpenhadoEmendaInteira: e.valorEmpenhado }),
          execucao: emp > 0 ? Math.round((pago / emp) * 100) : 0,
        };
      })(),
    })),
  };
}

// ---------------------------------------------------------------------------
// buscar_votacao
// ---------------------------------------------------------------------------

/**
 * Ano usado quando a Gabi não informa a eleição.
 *
 * Era fixo em 2022. Com 2026 na base, "como foi o deputado X?" respondia com
 * a eleição de quatro anos atrás — e "os vereadores de Y" sem ano caía numa
 * eleição GERAL, que não tem vereador. Agora: a mais recente com dados, do
 * tipo certo. Municipal = anos múltiplos de 4 (2020, 2024); geral = os outros
 * (2018, 2022, 2026). Presidente só nos anos que têm o arquivo nacional — em
 * out/2026 o TSE ainda não publicou o de 2026, então presidente cai em 2022.
 */
function anoPadraoVotacao(cargo?: string, uf?: string): string {
  const c = normalizarTextoTse(cargo ?? '');
  const presidencial = c.includes('president') || uf === 'BR';
  const municipal = c.includes('vereador') || c.includes('prefeit');
  const anos = [...anosDisponiveisTse(presidencial ? 'BR' : uf)].sort((a, b) => b - a);
  const escolhido = anos.find(a => (municipal ? a % 4 === 0 : a % 4 === 2));
  return String(escolhido ?? anos[0] ?? 2022);
}

/**
 * Eleição geral mais recente cujos eleitos JÁ tomaram posse (1º de fevereiro
 * do ano seguinte). Em out/2026 é 2022; a partir de fev/2027, 2026.
 */
function anoDaBancadaEmExercicio(uf?: string, agora = new Date()): number {
  const gerais = [...anosDisponiveisTse(uf)].filter(a => a % 4 === 2).sort((a, b) => b - a);
  const emExercicio = gerais.find(a => agora >= new Date(a + 1, 1, 1));
  return emExercicio ?? gerais[gerais.length - 1] ?? 2022;
}

export async function executarBuscarVotacao(
  args: {
    candidato_nome: string;
    ano?: number;
    uf?: string;
    municipio?: string;
    /** Bairro ou distrito da cidade (exige municipio). */
    bairro?: string;
    cargo?: string;
    apenas_eleitos?: boolean;
    limite?: number;
    turno?: number;
  },
  _session: UserSession,
) {
  const turno = Number(args.turno) === 2 ? 2 : 1;
  const ufQuery = args.uf?.toUpperCase();
  const anoStr  = args.ano ? String(args.ano) : anoPadraoVotacao(args.cargo, ufQuery);

  const semNome = !args.candidato_nome || String(args.candidato_nome).trim().length < 2;
  // Sem nome exige cargo, senão misturaria todos os cargos
  if (semNome && !args.cargo) {
    return { encontrado: false, mensagem: 'Para listar/comparar todos os candidatos, informe o cargo (ex: Governador, Prefeito, Presidente).' };
  }

  const cargoNorm      = args.cargo ? normalizarTextoTse(args.cargo) : '';
  const isPresidencial = cargoNorm.includes('president') || ufQuery === 'BR';

  // Presidente num ano sem o arquivo nacional: em out/2026 o TSE publicou os
  // votos de governador, senador e deputados, mas não os de presidente. Sem
  // isto a busca voltava vazia e sem motivo, e a Gabi dizia "não encontrei" —
  // como se não houvesse eleição presidencial. O motivo real vai junto.
  const anosPresidente = anosDisponiveisTse('BR');
  if (isPresidencial && !anosPresidente.includes(Number(anoStr))) {
    return {
      encontrado: false,
      ano: Number(anoStr),
      mensagem: `Os votos para presidente de ${anoStr} ainda não estão na base — o TSE publicou `
        + `primeiro os de governador, senador e deputados. Disponível para presidente: `
        + `${[...anosPresidente].sort((a, b) => b - a).join(' e ')}. Diga isso ao usuário com `
        + 'naturalidade e ofereça a eleição presidencial disponível ou os outros cargos de ' + anoStr + '.',
      anosDisponiveis: anosPresidente,
    };
  }

  // 2º turno pedido onde não houve: diz isso em vez de "não encontrei".
  if (turno === 2 && !temSegundoTurno(anoStr, isPresidencial ? 'BR' : (ufQuery ?? 'BR'))) {
    return {
      encontrado: false,
      ano: Number(anoStr),
      turno: 2,
      mensagem: `Não houve 2º turno ${isPresidencial ? 'para presidente' : `em ${ufQuery ?? 'nenhum estado'}`} em ${anoStr}`
        + (Number(anoStr) === 2026 ? ' — o 2º turno de 2026 é em 25/10 e ainda não está na base' : '')
        + '. Diga isso com naturalidade e ofereça o resultado do 1º turno.',
    };
  }

  // O estado teve 2º turno, mas não para ESTE cargo (MG em 2022: presidente
  // sim, governador não). Sem isto a busca voltava vazia e sem motivo.
  if (turno === 2 && args.cargo && !isPresidencial && ufQuery) {
    const t2 = await loadStaticTseData(anoStr, ufQuery, 2);
    if (t2 && !t2.some(c => normalizarTextoTse(c.cargo).includes(cargoNorm))) {
      return {
        encontrado: false, ano: Number(anoStr), turno: 2,
        mensagem: `Não houve 2º turno para ${args.cargo} em ${ufQuery} em ${anoStr} — o cargo foi decidido `
          + 'no 1º turno. Diga isso com naturalidade e ofereça o resultado do 1º turno.',
      };
    }
  }

  // Para presidentes busca BR; para outros tenta o estado, depois BR
  const ufsParaBuscar = isPresidencial
    ? ['BR']
    : ufQuery
    ? [ufQuery, 'BR']
    : ['BR'];

  for (const uf of ufsParaBuscar) {
    const staticData = await loadStaticTseData(anoStr, uf, turno);
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
    // A DISPUTA inteira do cargo, para os números da eleição (total de
    // candidatos, % do líder, houve 2º turno). Buscando um nome, `todos` tem
    // só aquele candidato — e o Tarcísio saía "líder com 100% dos votos
    // válidos" numa disputa contra ninguém (em 2026 foram 62,65%).
    // Prefeito e vereador disputam numa CIDADE: buscando o nome, a disputa é
    // a da cidade dele (a de mais votos), não a do estado inteiro.
    const cargoAchado = normalizarTextoTse(todos[0]?.cargo ?? '');
    const cidadeDaDisputa = !semNome && /prefeito|vereador/.test(cargoAchado) && todos[0]
      ? (args.municipio?.trim() || Object.entries(todos[0].votos ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] || null)
      : null;
    const votosNaCidade = (c: any, cidade: string): number => {
      const alvo = normalizarTextoTse(cidade);
      for (const [m, v] of Object.entries(c.votos ?? {})) if (normalizarTextoTse(m) === alvo) return v as number;
      return 0;
    };
    const disputa = semNome || todos.length === 0
      ? todos
      : staticData
          .filter(c => normalizarTextoTse(c.cargo) === cargoAchado)
          .filter(c => !cidadeDaDisputa || votosNaCidade(c, cidadeDaDisputa) > 0)
          .sort((a, b) => cidadeDaDisputa
            ? votosNaCidade(b, cidadeDaDisputa) - votosNaCidade(a, cidadeDaDisputa)
            : b.totalVotos - a.totalVotos);
    const totalNoCargo = disputa.length;
    const eleitos = disputa.filter(c => /^eleito/.test(normalizarTextoTse(c.situacao)));
    if (args.apenas_eleitos) {
      const soEleitos = todos.filter(c => /^eleito/.test(normalizarTextoTse(c.situacao)));
      if (soEleitos.length > 0) todos = soEleitos;
    }

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
    const votosNaContagem = (c: any): number =>
      noMunicipio ? votosNoMunicipio(c) : cidadeDaDisputa ? votosNaCidade(c, cidadeDaDisputa) : c.totalVotos;
    const totalVotosValidos = disputa.reduce((s, c) => s + votosNaContagem(c), 0);
    const votosLider = votosNaContagem(disputa[0]);
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

    // Votos reais no BAIRRO pedido (soma dos locais de votação dele). Até 4
    // candidatos, para comparar quem foi melhor num bairro.
    const votosBairro = new Map<CandidatoJson, unknown>();
    const ufCidade = uf === 'BR' ? ufQuery : uf;
    if (args.bairro?.trim() && args.municipio && ufCidade && ufCidade !== 'BR') {
      for (const c of resultados.slice(0, 4)) {
        votosBairro.set(c, await votosNoBairro({
          ano: anoStr, turno, uf: ufCidade, municipio: args.municipio, bairro: args.bairro.trim(),
          candidato: c, disputa,
        }).catch(err => ({ encontrado: false, motivo: `Falha ao ler os votos por local: ${String(err).slice(0, 120)}` })));
      }
    }

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
      // De qual turno são os números — o relatório e o texto precisam dizer.
      turno,
      // Filtrado por município, estes números são DALI — é a resposta certa
      // para "quantos concorreram" e "quantas cadeiras tem a Câmara".
      escopoContagem: cidadeDaDisputa
        ? `disputa de ${cidadeDaDisputa} (${uf})`
        : noMunicipio
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
      liderDaDisputa: disputa[0]?.nomeUrna ?? null,
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
        // % dele sobre TODOS os candidatos do cargo, no recorte da contagem —
        // e o NOME do campo diz qual é o recorte. Era sempre
        // "percentualValidos", e num ranking de Americana a Gabi publicou
        // "30,2% dos válidos de SP" para quem teve 30,2% da CIDADE (e 0,4% do
        // estado).
        [noMunicipio || cidadeDaDisputa ? 'percentualNaCidade' : 'percentualValidos']: totalVotosValidos > 0
          ? Math.round((votosNaContagem(c) / totalVotosValidos) * 1000) / 10
          : 0,
        ...(votosBairro.has(c) && { votosNoBairro: votosBairro.get(c) }),
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
      // Mapa de calor do PDF (um candidato só): TODOS os municípios. A lista
      // acima é cortada nos maiores redutos para caber no turno da Gabi — e o
      // PDF pintava só esses 20, deixando os outros 625 de SP como "sem voto".
      // Este campo não vai para o modelo (o chat o retira, como faz com
      // `porMunicipio` das emendas); só o relatório o lê.
      ...(resultados.length === 1 && {
        mapaVotos: {
          nomeUrna: resultados[0].nomeUrna,
          uf,
          valores: uf === 'BR'
            ? { ...(resultados[0].votosPorEstado ?? {}) }
            : { ...(resultados[0].votos ?? {}) },
        },
      }),
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

  const where = {
    gabineteId: user.gabineteId, // SEMPRE presente — nunca remove isso
    ...(args.status && { status: args.status as any }),
    ...(args.categoria && { category: args.categoria as any }),
    ...(args.prioridade && { priority: args.prioridade as any }),
    ...(args.municipio && {
      municipio: { contains: args.municipio, mode: 'insensitive' as const },
    }),
  };

  const demandas = await prisma.demand.findMany({
    where,
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

  // Contagem sobre TODAS as demandas do recorte, não sobre as 50 trazidas.
  // Contar a lista respondia "temos 50 demandas" a um gabinete com 300, e a
  // divisão por status descrevia só as mais recentes — mesmo defeito que as
  // emendas tinham.
  const [totalNoRecorte, porStatus] = await Promise.all([
    prisma.demand.count({ where }),
    prisma.demand.groupBy({ by: ['status'], where, _count: { _all: true } }),
  ]);

  const contagem = Object.fromEntries(porStatus.map(s => [s.status, s._count._all]));

  return {
    total: totalNoRecorte,
    exibidos: demandas.length,
    ...(totalNoRecorte > demandas.length && {
      avisoCorte: `A lista traz as ${demandas.length} mais recentes, de ${totalNoRecorte} no recorte. ` +
        'Use "total" e "contagemPorStatus" para números — não conte a lista.',
    }),
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

  // Feriados e datas comemorativas que o Google põe na agenda ("Dia do
  // Professor") não são compromissos do gabinete — ficam fora da contagem.
  const datasGoogle = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM agenda_events WHERE "gabineteId" = $1 AND ${SQL_DATA_COMEMORATIVA}`, user.gabineteId);
  if (datasGoogle.length > 0) where.id = { notIn: datasGoogle.map(d => d.id) };

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
      where: { gabineteId: user.gabineteId, ...(where.id && { id: where.id }) },
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
  const uf    = (args.uf ?? 'DF').toUpperCase();
  const cargo = args.cargo ?? 'Deputado Distrital';
  const ehSenado = normalizarTextoTse(cargo).includes('senador');
  // Sem ano informado (era fixo em 2022):
  // - Senado: a bancada EM EXERCÍCIO — a eleição geral mais recente cujos
  //   eleitos já tomaram posse (1º de fevereiro do ano seguinte). Até
  //   fev/2027 é 2022 (+ 2018 no segundo lote); depois vira 2026 (+ 2022)
  //   sozinho, sem ninguém lembrar de trocar.
  // - Deputados: a eleição mais recente com dados (2026); quem não disputou
  //   2026 é procurado na anterior (lote extra abaixo), em vez de sair como
  //   "não localizado".
  const semAnoInformado = !args.ano;
  const ano = args.ano
    ? Number(args.ano)
    : ehSenado
      ? anoDaBancadaEmExercicio(uf)
      : Number(anoPadraoVotacao(cargo, uf));
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
  // A outra eleição da bancada é a ANTERIOR (2026 ↔ 2022, 2022 ↔ 2018); só
  // 2018, a mais antiga da base, olha para a frente. Antes era "se não é 2018,
  // é 2018" — com 2026 isso juntaria os eleitos agora com os de 2018, cujas
  // vagas são justamente as que 2026 renovou.
  const outroCargoDF = normalizarTextoTse(cargo).includes('distrital') ? 'Deputado Federal' : 'Deputado Distrital';
  const lotes = ehSenado
    ? [{ ano, cargo: 'Senador' }, { ano: ano === 2018 ? 2022 : ano - 4, cargo: 'Senador' }]
    : [
        { ano, cargo },
        { ano, cargo: outroCargoDF },
        // Só quando a Gabi não escolheu o ano: o deputado que não disputou a
        // eleição mais recente ainda é achado na anterior.
        ...(semAnoInformado && anosDisponiveisTse(uf).includes(ano - 4)
          ? [{ ano: ano - 4, cargo }, { ano: ano - 4, cargo: outroCargoDF }]
          : []),
      ];

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
    porEleicao: encontrados.map(e => `${e.nome} — ${e.cargo}, eleição de ${e.ano}`),
    faltantes,
    prontoParaGerar: encontrados.length > 0,
    ...(extras.length > 0 && new Set(usados.map(u => u.ano)).size > 1 && {
      observacao: (ehSenado
        ? 'Os parlamentares vêm de eleições diferentes (renovação alternada do Senado). '
        : `Nem todos disputaram ${ano}: quem não aparece nessa eleição veio da anterior — veja \`porEleicao\`. `)
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
// ---------------------------------------------------------------------------
// ranking_nacional — os 27 estados de uma vez, pelo índice.
//
// buscar_votacao abre o arquivo completo da UF, com voto por município de todo
// candidato: SP/2018 sozinho ocupa 428 MB de heap. Varrer o país por ali
// derrubava a função e a pessoa via "falha de conexão". O índice traz o mesmo
// ranking em 14 MB, sem a quebra por município.
// ---------------------------------------------------------------------------
export async function executarRankingNacional(
  args: { anos?: string[]; cargo?: string; por_uf?: number; apenas_eleitos?: boolean },
  _session: UserSession,
) {
  const anos = (args.anos ?? []).map(a => String(a).trim()).filter(Boolean);
  if (anos.length === 0) return { erro: 'Informe ao menos um ano de eleição.' };
  if (!args.cargo?.trim()) return { erro: 'Informe o cargo (ex.: Senador, Governador).' };

  const r = rankingNacional({
    anos,
    cargo: args.cargo,
    porUf: args.por_uf,
    apenasEleitos: args.apenas_eleitos,
  });

  if (!r) {
    return {
      encontrado: false,
      mensagem: `Não há índice nacional para ${anos.join(', ')}. Os anos com índice são 2018, 2022 e 2026.`,
    };
  }

  const estados = Object.keys(r.porUf).sort();

  // O índice cobre o PRIMEIRO TURNO. Para senador e deputado isso é o
  // resultado final; para governador e presidente, não: quem decidiu no
  // segundo turno aparece como "2º TURNO", nunca como eleito. Em 2022 foram
  // 15 governadores eleitos na primeira volta e 12 estados em segundo turno —
  // responder "15 governadores" como se fosse o país inteiro seria errado.
  const ufsEmSegundoTurno = [...new Set(
    estados.flatMap(uf => r.porUf[uf]
      .filter(c => /2.*turno/i.test(String(c.situacao ?? '')))
      .map(() => uf)),
  )];

  return {
    encontrado: estados.length > 0,
    ...(ufsEmSegundoTurno.length > 0 && {
      avisoSegundoTurno:
        `Este levantamento é do PRIMEIRO TURNO. Em ${ufsEmSegundoTurno.length} estado(s) `
        + `(${ufsEmSegundoTurno.join(', ')}) a disputa foi decidida em segundo turno, e o `
        + 'vencedor NÃO consta aqui — quem aparece com "2º TURNO" chegou à segunda volta, '
        + 'não venceu. Diga isso ao apresentar, e não trate os eleitos listados como se '
        + 'fossem todos os do país.',
    }),
    recorte: `${args.cargo} · ${r.anosUsados.join(' + ')}${args.apenas_eleitos ? ' · só eleitos' : ''}`,
    anosUsados: r.anosUsados,
    ...(r.anosSemIndice.length > 0 && {
      avisoAnos: `Sem índice nacional para ${r.anosSemIndice.join(', ')} — estes anos ficaram de fora.`,
    }),
    totalEstados: estados.length,
    totalCandidatos: r.totalCandidatos,
    // O índice não guarda voto por município: dizer isso evita que a Gabi
    // prometa um detalhamento que este caminho não tem.
    semDetalhePorMunicipio:
      'Este recorte traz votos totais por candidato. Para voto por município ou por zona, '
      + 'use buscar_votacao num estado de cada vez.',
    porEstado: Object.fromEntries(estados.map(uf => [
      uf,
      r.porUf[uf].map(c => ({
        nomeUrna: c.nomeUrna,
        nome: c.nome,
        partido: c.partido,
        totalVotos: c.totalVotos,
        situacao: c.situacao,
        ano: c.ano,
      })),
    ])),
  };
}

// ── comparar_votacao ─────────────────────────────────────────────────────────
// O mesmo que o comparador e a evolução do Mapa Eleitoral calculam na tela,
// para a Gabi: quem venceu em cada bairro/zona de uma cidade entre 2–4
// candidatos, ou onde um candidato ganhou e perdeu votos entre duas eleições.
// Linhas COMPLETAS em formato compacto ([área, votos…]) — a tabela do relatório
// precisa de todas, e o formato curto poupa espaço.

const normMun = (s: string) => normalizarTextoTse(s).replace(/['’`´-]/g, ' ').replace(/\s+/g, ' ').trim();

/** Escolhe o candidato pelo nome; com cidade, prefere quem teve voto nela. */
function escolherCandidato(data: CandidatoJson[], nome: string, cargo?: string, municipio?: string) {
  const achados = buscarCandidatoNoJson(data, nome, cargo);
  const lista = achados.length ? achados : [buscarCandidatoTolerante(data, nome, cargo)].filter(Boolean) as CandidatoJson[];
  if (!lista.length) return { candidato: null, alternativas: [] as string[] };
  const alvo = municipio ? normMun(municipio) : '';
  const votosNaCidade = (c: CandidatoJson) =>
    alvo ? Object.entries(c.votos ?? {}).filter(([m]) => normMun(m) === alvo).reduce((s, [, v]) => s + v, 0) : c.totalVotos;
  const ordenados = [...lista].sort((a, b) => votosNaCidade(b) - votosNaCidade(a) || b.totalVotos - a.totalVotos);
  return {
    candidato: ordenados[0],
    alternativas: ordenados.slice(1, 6).map(c => `${c.nomeUrna || c.nome} (${c.partido}, ${c.cargo})`),
  };
}

/** Votos reais por bairro numa cidade (arquivo de seção); null se não houver ou não bater com o oficial. */
async function votosPorBairroReais(ano: string, turno: number, uf: string, municipio: string, c: CandidatoJson) {
  const secao = await loadSecaoMunicipio(ano, turno, uf, municipio);
  if (!secao) return null;
  const porLocal = votosDoCandidatoPorLocal(secao, c.cargo, c.numero);
  if (!porLocal) return null;
  const alvo = normMun(municipio);
  const oficial = (c.zonas ?? []).filter(z => normMun(z.municipio) === alvo).reduce((s, z) => s + z.votos, 0);
  const soma = [...porLocal.values()].reduce((s, v) => s + v, 0);
  // Eleição suplementar juntada ao ano pelo TSE: os locais não batem com o
  // oficial — melhor não dizer nada por bairro do que dizer errado.
  if (soma !== oficial) return null;
  const m = new Map<string, number>();
  secao.locais.forEach((l, i) => {
    const b = (l.b || 'SEM BAIRRO').trim();
    m.set(b, (m.get(b) ?? 0) + (porLocal.get(i) ?? 0));
  });
  return m;
}

function votosPorZona(c: CandidatoJson, municipio: string): Map<number, number> {
  const alvo = normMun(municipio);
  const m = new Map<number, number>();
  for (const z of c.zonas ?? []) if (normMun(z.municipio) === alvo) m.set(z.zona, (m.get(z.zona) ?? 0) + z.votos);
  return m;
}

export async function executarCompararVotacao(args: {
  modo?: 'cidade' | 'evolucao';
  uf?: string; municipio?: string; turno?: number;
  candidatos?: string[]; ano?: string; cargo?: string;
  candidato_antes?: string; ano_antes?: string; cargo_antes?: string;
  candidato_depois?: string; ano_depois?: string; cargo_depois?: string;
}, _session: UserSession) {
  const uf = (args.uf ?? '').toUpperCase().trim();
  if (!uf) return { erro: 'Informe a UF (ou BR para presidente no país).' };
  const municipio = args.municipio?.trim() || '';
  const turno = Number(args.turno) === 2 ? 2 : 1;

  if (args.modo === 'evolucao') {
    const anoA = String(args.ano_antes ?? '').trim(), anoB = String(args.ano_depois ?? '').trim();
    const nomeA = args.candidato_antes?.trim(), nomeB = (args.candidato_depois ?? args.candidato_antes)?.trim();
    if (!anoA || !anoB || !nomeA || !nomeB) return { erro: 'Informe candidato_antes, ano_antes e ano_depois (e candidato_depois, se for outra pessoa).' };
    const [dataA, dataB] = await Promise.all([loadStaticTseData(anoA, uf), loadStaticTseData(anoB, uf)]);
    if (!dataA || !dataB) return { encontrado: false, mensagem: `Sem dados de ${!dataA ? anoA : anoB} para ${uf}.`, anosDisponiveis: anosDisponiveisTse(uf) };
    const a = escolherCandidato(dataA, nomeA, args.cargo_antes, municipio);
    const b = escolherCandidato(dataB, nomeB, args.cargo_depois, municipio);
    if (!a.candidato || !b.candidato) {
      return { encontrado: false, mensagem: `Não encontrei ${!a.candidato ? `${nomeA} em ${anoA}` : `${nomeB} em ${anoB}`} (${uf}).` };
    }
    const cA = a.candidato, cB = b.candidato;
    const rot = [`${anoA} · ${cA.nomeUrna || cA.nome}`, `${anoB} · ${cB.nomeUrna || cB.nome}`];

    let recorte: string;
    let linhas: Array<[string, number, number]>;
    let observacao: string | undefined;
    if (uf === 'BR') {
      recorte = 'por estado';
      const ufs = new Set([...Object.keys(cA.votosPorEstado ?? {}), ...Object.keys(cB.votosPorEstado ?? {})]);
      linhas = [...ufs].map(u => [u === 'ZZ' ? 'Exterior' : u, cA.votosPorEstado?.[u] ?? 0, cB.votosPorEstado?.[u] ?? 0]);
    } else if (municipio) {
      const [bA, bB] = await Promise.all([votosPorBairroReais(anoA, 1, uf, municipio, cA), votosPorBairroReais(anoB, 1, uf, municipio, cB)]);
      if (bA && bB) {
        recorte = `por bairro em ${municipio}`;
        const nomes = new Map<string, string>();
        for (const k of [...bA.keys(), ...bB.keys()]) nomes.set(normMun(k), k);
        const soma = (m: Map<string, number>, alvo: string) => [...m].filter(([k]) => normMun(k) === alvo).reduce((s, [, v]) => s + v, 0);
        linhas = [...nomes].map(([k, nome]) => [nome, soma(bA, k), soma(bB, k)]);
      } else {
        recorte = `por zona em ${municipio}`;
        observacao = 'Um dos dois não tem voto real por local de votação nesta cidade (eleição suplementar juntada pelo TSE): a comparação ficou por zona. Zonas podem ser renumeradas entre eleições — zona que aparece só num ano pode ser essa mudança.';
        const zA = votosPorZona(cA, municipio), zB = votosPorZona(cB, municipio);
        linhas = [...new Set([...zA.keys(), ...zB.keys()])].sort((x, y) => x - y).map(z => [`Zona ${z}`, zA.get(z) ?? 0, zB.get(z) ?? 0]);
      }
    } else {
      recorte = 'por cidade';
      const m = new Map<string, [string, number, number]>();
      for (const [nome, v] of Object.entries(cA.votos ?? {})) { const k = normMun(nome); const x = m.get(k) ?? [nome, 0, 0]; x[1] += v; m.set(k, x); }
      for (const [nome, v] of Object.entries(cB.votos ?? {})) { const k = normMun(nome); const x = m.get(k) ?? [nome, 0, 0]; x[2] += v; m.set(k, x); }
      linhas = [...m.values()];
    }
    linhas.sort((x, y) => (y[2] - y[1]) - (x[2] - x[1]));
    const totA = linhas.reduce((s, l) => s + l[1], 0), totB = linhas.reduce((s, l) => s + l[2], 0);
    const varPct = (x: number, y: number) => (x ? Math.round(((y - x) / x) * 1000) / 10 : null);
    return {
      encontrado: true,
      modo: 'evolucao', uf, municipio: municipio || undefined, recorte,
      antes: { ano: anoA, nome: cA.nomeUrna || cA.nome, partido: cA.partido, cargo: cA.cargo },
      depois: { ano: anoB, nome: cB.nomeUrna || cB.nome, partido: cB.partido, cargo: cB.cargo },
      ...(a.alternativas.length || b.alternativas.length ? { outrosComMesmoNome: { antes: a.alternativas, depois: b.alternativas } } : {}),
      totais: { antes: totA, depois: totB, diferenca: totB - totA, variacaoPct: varPct(totA, totB) },
      areasQueCresceram: linhas.filter(l => l[2] > l[1]).length,
      areasQueCairam: linhas.filter(l => l[2] < l[1]).length,
      colunas: ['área', rot[0], rot[1], 'diferença', 'variação %'],
      linhas: linhas.map(l => [l[0], l[1], l[2], l[2] - l[1], varPct(l[1], l[2])]),
      ...(observacao ? { observacao } : {}),
    };
  }

  // ── modo cidade ──
  const ano = String(args.ano ?? '').trim();
  const nomes = (args.candidatos ?? []).map(n => String(n).trim()).filter(Boolean);
  if (!ano || nomes.length < 2) return { erro: 'Informe o ano e de 2 a 4 candidatos.' };
  if (!municipio) return { erro: 'Informe o município: esta comparação é dentro de uma cidade (por bairro e zona). Para estado ou país, use buscar_votacao com os candidatos.' };
  const data = await loadStaticTseData(ano, uf, turno);
  if (!data) return { encontrado: false, mensagem: `Sem dados de ${ano} (${turno}º turno) para ${uf}.`, anosDisponiveis: anosDisponiveisTse(uf) };
  const escolhas = nomes.slice(0, 4).map(n => ({ pedido: n, ...escolherCandidato(data, n, args.cargo, municipio) }));
  const faltando = escolhas.filter(e => !e.candidato).map(e => e.pedido);
  const cands = escolhas.filter(e => e.candidato).map(e => e.candidato!) ;
  if (cands.length < 2) return { encontrado: false, mensagem: `Não encontrei ${faltando.join(', ')} em ${ano} (${uf}).` };

  const bairros = await Promise.all(cands.map(c => votosPorBairroReais(ano, turno, uf, municipio, c)));
  const comReal = cands.map((_, i) => !!bairros[i]);
  const vencedorDe = (v: number[], nomesCol: string[]) => {
    const tot = v.reduce((s, x) => s + x, 0);
    if (!tot) return null;
    const o = v.map((x, i) => ({ x, i })).sort((p, q) => q.x - p.x);
    const dif = o[0].x - (o[1]?.x ?? 0);
    return { vencedor: dif === 0 ? 'empate' : nomesCol[o[0].i], vantagem: dif };
  };

  // Bairros: só entre quem tem voto real por local.
  const idxReais = cands.map((_, i) => i).filter(i => comReal[i]);
  const nomesReais = idxReais.map(i => cands[i].nomeUrna || cands[i].nome);
  let porBairro: Array<Array<string | number>> = [];
  if (idxReais.length >= 2) {
    const chaves = new Set(idxReais.flatMap(i => [...bairros[i]!.keys()]));
    porBairro = [...chaves].map(b => {
      const v = idxReais.map(i => bairros[i]!.get(b) ?? 0);
      const r = vencedorDe(v, nomesReais);
      return [b, ...v, r?.vencedor ?? '—', r?.vantagem ?? 0];
    }).sort((x, y) => (y.slice(1, -2) as number[]).reduce((s, n) => s + n, 0) - (x.slice(1, -2) as number[]).reduce((s, n) => s + n, 0));
  }
  const nomesTodos = cands.map(c => c.nomeUrna || c.nome);
  const zonas = cands.map(c => votosPorZona(c, municipio));
  const porZona = [...new Set(zonas.flatMap(z => [...z.keys()]))].sort((x, y) => x - y).map(z => {
    const v = zonas.map(m => m.get(z) ?? 0);
    const r = vencedorDe(v, nomesTodos);
    return [`Zona ${z}`, ...v, r?.vencedor ?? '—', r?.vantagem ?? 0];
  });
  const vitorias = (linhas: Array<Array<string | number>>, nome: string, n: number) => linhas.filter(l => l[n + 1] === nome).length;

  return {
    encontrado: true,
    modo: 'cidade', uf, municipio, ano, turno,
    candidatos: cands.map((c, i) => ({
      nome: nomesTodos[i], partido: c.partido, cargo: c.cargo,
      votosNaCidade: [...zonas[i].values()].reduce((s, v) => s + v, 0),
      venceuEmZonas: vitorias(porZona, nomesTodos[i], cands.length),
      venceuEmBairros: comReal[i] ? vitorias(porBairro, nomesTodos[i], idxReais.length) : null,
      votoRealPorLocal: comReal[i],
    })),
    ...(faltando.length ? { naoEncontrados: faltando } : {}),
    colunasBairro: ['bairro', ...nomesReais, 'vencedor', 'vantagem'],
    porBairro,
    colunasZona: ['zona', ...nomesTodos, 'vencedor', 'vantagem'],
    porZona,
    ...(comReal.some(x => !x) ? {
      observacao: `${cands.filter((_, i) => !comReal[i]).map(c => c.nomeUrna || c.nome).join(', ')} não tem voto real por local de votação nesta cidade (eleição suplementar juntada pelo TSE): fica fora da comparação por bairro e entra só na por zona.`,
    } : {}),
  };
}

export async function executarTool(
  nome: string,
  args: Record<string, unknown>,
  session: UserSession,
): Promise<unknown> {
  // A Gabi só busca nas áreas que o usuário tem liberadas — as mesmas que
  // as rotas de API conferem. Sem isto, quem não tem Demandas (por exemplo)
  // perguntava à Gabi e via as demandas do gabinete.
  const regra = AREA_DA_FERRAMENTA[nome];
  const usuario = { role: session?.user?.role, permissions: session?.user?.permissions ?? [] };
  if (regra && !regra.permissoes.some(p => hasPermission(usuario, p))) {
    return {
      erro: `Este usuário não tem acesso à área ${regra.area}. Diga isso a ele e sugira pedir a liberação ` +
        'ao administrador do gabinete. Não tente outra ferramenta para conseguir os mesmos dados.',
    };
  }
  switch (nome) {
    case 'buscar_emendas':
      return executarBuscarEmendas(args as any, session);
    case 'buscar_votacao':
      return executarBuscarVotacao(args as any, session);
    case 'ranking_nacional':
      return executarRankingNacional(args as any, session);
    case 'comparar_votacao':
      return executarCompararVotacao(args as any, session);
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
