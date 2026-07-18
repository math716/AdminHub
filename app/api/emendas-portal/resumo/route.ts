export const dynamic = 'force-dynamic'; // auth usa cookies — rota dinâmica; cache fica na camada de dados
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { PORTAL_MOCK_MODE, getAllEmendasDoAno, type PortalEmenda } from '@/lib/portal-transparencia';

// Resumo de emendas pra um UF inteiro num ano: top municípios, totais por
// área, top parlamentares.
//
// Estratégia em camadas:
//   1) Se a tabela emendas_parlamentares tiver registros pro (uf, ano) →
//      consulta o banco (rápido + completo).
//   2) Senão, cai pro Portal ao vivo (lento + parcial). Vale como fallback
//      enquanto a sincronização (scripts/sync-emendas-portal.ts) não rodou.
// Prefixo IBGE de 2 dígitos por UF — usado para garantir que só municípios
// do estado correto apareçam no top 5 (emendas de parlamentares SP podem ter
// codigoIbge apontando para municípios de outros estados).
const UF_IBGE_PREFIX: Record<string, string> = {
  AC:'12', AL:'27', AP:'16', AM:'13', BA:'29', CE:'23', DF:'53',
  ES:'32', GO:'52', MA:'21', MT:'51', MS:'50', MG:'31', PA:'15',
  PB:'25', PR:'41', PE:'26', PI:'22', RJ:'33', RN:'24', RS:'43',
  RO:'11', RR:'14', SC:'42', SP:'35', SE:'28', TO:'17',
};

function normalizarNomeParlamentar(nome: string, nomeUrna?: string | null): string {
  if (nomeUrna) return nomeUrna;
  return nome.replace(/\s*\(.*\)\s*$/, '').trim()
    .toLowerCase().replace(/(^|[\s-])(\S)/g, (_, sep, c) => sep + c.toUpperCase());
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const uf = (request.nextUrl.searchParams.get('uf') ?? '').toUpperCase();
    const anoRaw = request.nextUrl.searchParams.get('ano');
    const ano = anoRaw ? parseInt(anoRaw, 10) : new Date().getFullYear();
    const esferaRaw = request.nextUrl.searchParams.get('esfera'); // 'FEDERAL' | 'ESTADUAL' | null
    const esfera = esferaRaw === 'FEDERAL' || esferaRaw === 'ESTADUAL' ? esferaRaw : null;
    if (!uf) return NextResponse.json({ error: 'uf é obrigatório' }, { status: 400 });

    // ── 1) Tenta banco ─────────────────────────────────────────────────
    const totalNoBanco = await prisma.emendaParlamentar.count({
      where: { uf, ano },
    });

    if (totalNoBanco > 0) {
      return await resumoDoBanco(uf, ano, esfera);
    }

    // ── 2) Fallback: Portal ao vivo ────────────────────────────────────
    return await resumoDoPortal(uf, ano);
  } catch (error) {
    console.error('GET /api/emendas-portal/resumo error:', error);
    return NextResponse.json({ error: 'Erro ao gerar resumo' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Resumo a partir do banco (instantâneo)
// ─────────────────────────────────────────────────────────────────────────

// Separa o cálculo da resposta HTTP para permitir cache via unstable_cache.
// esferaKey é string pois unstable_cache serializa os args como chave de cache.
//
// Estratégia: 4 queries paralelas com GROUP BY no banco em vez de um findMany
// de 50k linhas → JS. Cada query usa o índice (uf, ano, esfera) e retorna
// apenas os agregados necessários.
async function computeResumoBanco(uf: string, ano: number, esferaKey: string) {
  const esfera = esferaKey === 'FEDERAL' || esferaKey === 'ESTADUAL' ? esferaKey as 'FEDERAL' | 'ESTADUAL' : null;
  const where = esfera ? { uf, ano, esfera } : { uf, ano };

  const [totAgg, porAreaRaw, porMunicipioRaw, porParlamentarRaw] = await Promise.all([
    // 1. Totais globais
    prisma.emendaParlamentar.aggregate({
      where,
      _sum: { valorEmpenhado: true, valorPago: true },
      _count: { _all: true },
    }),
    // 2. Por área
    prisma.emendaParlamentar.groupBy({
      by: ['area'],
      where,
      _sum: { valorEmpenhado: true },
    }),
    // 3. Por município (apenas com codigoIbge preenchido)
    prisma.emendaParlamentar.groupBy({
      by: ['codigoIbge', 'municipioNome'],
      where: { ...where, codigoIbge: { not: null } },
      _sum: { valorEmpenhado: true },
      _count: { _all: true },
    }),
    // 4. Por parlamentarId — depois resolve detalhes em batch
    prisma.emendaParlamentar.groupBy({
      by: ['parlamentarId'],
      where: { ...where, parlamentarId: { not: null } },
      _sum: { valorEmpenhado: true },
      _count: { _all: true },
    }),
  ]);

  // Resolver detalhes dos parlamentares em uma única query por ID
  const parlamentarIds = porParlamentarRaw
    .map(p => p.parlamentarId)
    .filter((id): id is string => id !== null);
  const parlamentaresDetalhes = parlamentarIds.length > 0
    ? await prisma.parlamentar.findMany({
        where: { id: { in: parlamentarIds } },
        select: { id: true, cpf: true, idPortal: true, nome: true, nomeUrna: true, cargo: true, partido: true },
      })
    : [];
  const parlamentaresMap = new Map(parlamentaresDetalhes.map(p => [p.id, p]));

  const totalEmpenhado = totAgg._sum.valorEmpenhado ?? 0;
  const totalPago      = totAgg._sum.valorPago      ?? 0;
  const totalEmendas   = totAgg._count._all;

  // Municípios — totalMunicipalizado inclui tudo com codigoIbge;
  // valorPorMunicipio filtra pelo prefixo IBGE do estado
  const ibgePrefix = UF_IBGE_PREFIX[uf];
  let totalMunicipalizado = 0;
  const porMunicipioMap = new Map<string, { codigoIbge: string; nome: string; total: number; qtd: number }>();

  for (const m of porMunicipioRaw) {
    const ibge = m.codigoIbge!;
    const val  = m._sum.valorEmpenhado ?? 0;
    totalMunicipalizado += val;
    if (!ibgePrefix || ibge.startsWith(ibgePrefix)) {
      const cur = porMunicipioMap.get(ibge) ?? { codigoIbge: ibge, nome: m.municipioNome ?? ibge, total: 0, qtd: 0 };
      cur.total += val;
      cur.qtd   += m._count._all;
      porMunicipioMap.set(ibge, cur);
    }
  }

  const topMunicipios = Array.from(porMunicipioMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const valorPorMunicipio: Record<string, number>     = {};
  const valorPorMunicipioNome: Record<string, number> = {};
  porMunicipioMap.forEach(v => {
    valorPorMunicipio[v.codigoIbge] = v.total;
    if (v.nome && v.nome !== v.codigoIbge) valorPorMunicipioNome[v.nome.toUpperCase()] = v.total;
  });

  const municipiosLista = Array.from(porMunicipioMap.values())
    .sort((a, b) => b.total - a.total)
    .map(v => ({ codigoIbge: v.codigoIbge, nome: v.nome }));

  const areas = porAreaRaw
    .map(a => ({ area: a.area, total: a._sum.valorEmpenhado ?? 0 }))
    .sort((a, b) => b.total - a.total);

  const CARGOS_FEDERAIS = new Set(['DEPUTADO_FEDERAL', 'SENADOR']);
  const parlamentares = porParlamentarRaw
    .map(p => {
      if (!p.parlamentarId) return null;
      const parl = parlamentaresMap.get(p.parlamentarId);
      if (!parl) return null;
      return {
        cpf:      parl.cpf,
        idPortal: parl.idPortal ?? parl.nome,
        nome:     normalizarNomeParlamentar(parl.nome, parl.nomeUrna),
        nomeUrna: parl.nomeUrna ?? null,
        cargo:    parl.cargo,
        partido:  parl.partido,
        total:    p._sum.valorEmpenhado ?? 0,
        qtd:      p._count._all,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .filter(p => esfera !== 'ESTADUAL' || !CARGOS_FEDERAIS.has(p.cargo))
    .sort((a, b) => b.total - a.total);

  return {
    uf, ano,
    esfera: esfera ?? 'TODAS',
    totalEmpenhado, totalPago, totalMunicipalizado,
    totalEstadual: totalEmpenhado - totalMunicipalizado,
    totalEmendas,
    topMunicipios, valorPorMunicipio, valorPorMunicipioNome, municipiosLista,
    areas, parlamentares,
    mock: false,
    fonte: 'banco' as const,
  };
}

// Cache de 5 min por (uf, ano, esfera) — elimina o custo de re-processar
// 50k registros a cada requisição para o mesmo estado/ano/filtro.
const getCachedResumoBanco = unstable_cache(
  computeResumoBanco,
  ['resumo-banco'],
  { revalidate: 300 },
);

async function resumoDoBanco(uf: string, ano: number, esfera: 'FEDERAL' | 'ESTADUAL' | null = null) {
  const data = await getCachedResumoBanco(uf, ano, esfera ?? 'TODAS');
  return NextResponse.json(data);
}

// ─────────────────────────────────────────────────────────────────────────
// Fallback: Portal ao vivo (lento e parcial)
// ─────────────────────────────────────────────────────────────────────────
async function resumoDoPortal(uf: string, ano: number) {
  const ufCodes: Record<string, number> = {
    AC: 12, AL: 27, AP: 16, AM: 13, BA: 29, CE: 23, DF: 53, ES: 32, GO: 52, MA: 21,
    MT: 51, MS: 50, MG: 31, PA: 15, PB: 25, PR: 41, PE: 26, PI: 22, RJ: 33, RN: 24,
    RS: 43, RO: 11, RR: 14, SC: 42, SP: 35, SE: 28, TO: 17,
  };
  if (!ufCodes[uf]) {
    return NextResponse.json({ error: 'UF inválido' }, { status: 400 });
  }

  const all = await getAllEmendasDoAno({ ano, uf });

  const totalEmpenhado       = all.reduce((s, e) => s + (e.valorEmpenhado ?? 0), 0);
  const totalPago            = all.reduce((s, e) => s + (e.valorPago ?? 0), 0);
  const totalMunicipalizado  = all.reduce((s, e) => s + (e.codigoIbge ? (e.valorEmpenhado ?? 0) : 0), 0);

  const porMunicipio = new Map<string, { codigoIbge: string; nome: string; total: number; qtd: number }>();
  const porArea = new Map<string, number>();
  const porParlamentar = new Map<string, {
    cpf: string | null; idPortal: string; nome: string; cargo: string; partido: string | null; total: number; qtd: number;
  }>();

  all.forEach((e: PortalEmenda) => {
    if (e.codigoIbge) {
      const cur = porMunicipio.get(e.codigoIbge) ?? {
        codigoIbge: e.codigoIbge,
        nome: e.municipioNome ?? e.codigoIbge,
        total: 0, qtd: 0,
      };
      cur.total += e.valorEmpenhado ?? 0;
      cur.qtd++;
      porMunicipio.set(e.codigoIbge, cur);
    }
    porArea.set(e.area, (porArea.get(e.area) ?? 0) + (e.valorEmpenhado ?? 0));
    const pk = e.autorCpf ?? e.autorNome;
    const curP = porParlamentar.get(pk) ?? {
      cpf: e.autorCpf, idPortal: e.autorCpf ?? e.autorNome, nome: normalizarNomeParlamentar(e.autorNome),
      cargo: e.autorCargo, partido: e.autorPartido, total: 0, qtd: 0,
    };
    curP.total += e.valorEmpenhado ?? 0;
    curP.qtd++;
    porParlamentar.set(pk, curP);
  });

  return NextResponse.json({
    uf,
    ano,
    totalEmpenhado,
    totalPago,
    totalMunicipalizado,
    totalEstadual: totalEmpenhado - totalMunicipalizado,
    totalEmendas: all.length,
    topMunicipios:    Array.from(porMunicipio.values()).sort((a, b) => b.total - a.total).slice(0, 5),
    valorPorMunicipio: Object.fromEntries(Array.from(porMunicipio.values()).map((v) => [v.codigoIbge, v.total])),
    valorPorMunicipioNome: Object.fromEntries(
      Array.from(porMunicipio.values())
        .filter((v) => v.nome && v.nome !== v.codigoIbge)
        .map((v) => [v.nome.toUpperCase(), v.total])
    ),
    municipiosLista: Array.from(porMunicipio.values())
      .sort((a, b) => b.total - a.total)
      .map(v => ({ codigoIbge: v.codigoIbge, nome: v.nome })),
    areas:            Array.from(porArea.entries()).map(([area, total]) => ({ area, total })).sort((a, b) => b.total - a.total),
    parlamentares:    Array.from(porParlamentar.values()).sort((a, b) => b.total - a.total),
    mock: PORTAL_MOCK_MODE,
    fonte: 'portal' as const,
  });
}
