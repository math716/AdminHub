/**
 * Resumo de Emendas — a conta da tela (totais, por área, por município, por
 * parlamentar) e o mapa do Brasil (total por estado).
 *
 * A conta é a MESMA que as rotas /api/emendas-portal/resumo e /brasil faziam
 * ao abrir a tela (2 a 6 s nos estados grandes). Ela também pode ser feita no
 * fim de cada importação e guardada pronta na tabela `emendas_resumos`
 * (scripts/atualizar-resumo-emendas.ts); a tela lê o resultado pronto.
 *
 * Proteção contra número velho: o resumo guarda uma "impressão" do banco no
 * momento da conta — quantas emendas o recorte tinha e a última alteração de
 * emendas e de parlamentares. Se qualquer uma mudou, o resumo é ignorado e a
 * tela faz a conta na hora, como antes.
 *
 * Recebe o PrismaClient por parâmetro para servir à rota (lib/db) e ao script
 * (cliente próprio) — por isso não importa '@/lib/db'.
 */

import type { PrismaClient } from '@prisma/client';

// Prefixo IBGE de 2 dígitos por UF — usado para garantir que só municípios
// do estado correto apareçam no top 5 (emendas de parlamentares SP podem ter
// codigoIbge apontando para municípios de outros estados).
export const UF_IBGE_PREFIX: Record<string, string> = {
  AC:'12', AL:'27', AP:'16', AM:'13', BA:'29', CE:'23', DF:'53',
  ES:'32', GO:'52', MA:'21', MT:'51', MS:'50', MG:'31', PA:'15',
  PB:'25', PR:'41', PE:'26', PI:'22', RJ:'33', RN:'24', RS:'43',
  RO:'11', RR:'14', SC:'42', SP:'35', SE:'28', TO:'17',
};

export function normalizarNomeParlamentar(nome: string, nomeUrna?: string | null): string {
  if (nomeUrna) return nomeUrna;
  return nome.replace(/\s*\(.*\)\s*$/, '').trim()
    .toLowerCase().replace(/(^|[\s-])(\S)/g, (_, sep, c) => sep + c.toUpperCase());
}

export type EsferaChave = 'FEDERAL' | 'ESTADUAL' | 'TODAS';

/**
 * Versão da conta. Mudou a conta, sobe o número: resumo guardado com versão
 * diferente é ignorado (a tela calcula na hora) e o script recalcula.
 *   2 — valor por município pelos documentos (emenda dividida entre cidades).
 */
export const VERSAO_CONTA = 2;
export const ESFERAS: EsferaChave[] = ['TODAS', 'FEDERAL', 'ESTADUAL'];

// ─────────────────────────────────────────────────────────────────────────
// A conta (igual à que a rota fazia)
// ─────────────────────────────────────────────────────────────────────────

// Estratégia: 4 queries paralelas com GROUP BY no banco em vez de um findMany
// de 50k linhas → JS. Cada query usa o índice (uf, ano, esfera) e retorna
// apenas os agregados necessários.
export async function calcularResumoUf(db: PrismaClient, uf: string, ano: number, esferaKey: string) {
  const esfera = esferaKey === 'FEDERAL' || esferaKey === 'ESTADUAL' ? esferaKey as 'FEDERAL' | 'ESTADUAL' : null;
  const where = esfera ? { uf, ano, esfera } : { uf, ano };

  const [totAgg, porAreaRaw, porDestinoRaw, porMunicipioRaw, porParlamentarRaw] = await Promise.all([
    // 1. Totais globais
    db.emendaParlamentar.aggregate({
      where,
      _sum: { valorEmpenhado: true, valorPago: true },
      _count: { _all: true },
    }),
    // 2. Por área
    db.emendaParlamentar.groupBy({
      by: ['area'],
      where,
      _sum: { valorEmpenhado: true },
    }),
    // 3. Por município, das emendas cujos documentos dizem a cidade.
    //
    // Uma emenda federal costuma ser DIVIDIDA entre vários municípios (metade
    // das de 2025), e o cadastro da emenda guarda um só: somar por ele punha o
    // valor inteiro numa cidade e nada nas outras. A soma dos documentos por
    // município vem pronta (lib/emendas/emendas-municipios.ts) — somá-los
    // aqui levava 20 s em SP e estourava o tempo do banco.
    db.$queryRawUnsafe<{ codigo: string; nome: string | null; total: number | null; qtd: number }[]>(`
      SELECT m."codigoIbge" AS codigo, max(m."municipio") AS nome,
             sum(m."empenhado")::float AS total,
             count(*)::int AS qtd
      FROM emendas_municipios m
      JOIN emendas_parlamentares e ON e.id = m."emendaId"
      WHERE e.uf = $1 AND e.ano = $2 AND ($3::text IS NULL OR e.esfera::text = $3)
      GROUP BY 1`, uf, ano, esfera),
    // 3b. Por município, das demais (estaduais, e federais ainda sem a soma
    // por município): o município do cadastro, como antes.
    db.emendaParlamentar.groupBy({
      by: ['codigoIbge', 'municipioNome'],
      where: { ...where, codigoIbge: { not: null }, municipios: { none: {} } },
      _sum: { valorEmpenhado: true },
      _count: { _all: true },
    }),
    // 4. Por parlamentarId — depois resolve detalhes em batch
    db.emendaParlamentar.groupBy({
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
    ? await db.parlamentar.findMany({
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

  const somar = (ibge: string, nome: string | null, val: number, qtd: number) => {
    totalMunicipalizado += val;
    if (!ibgePrefix || ibge.startsWith(ibgePrefix)) {
      const cur = porMunicipioMap.get(ibge) ?? { codigoIbge: ibge, nome: nome ?? ibge, total: 0, qtd: 0 };
      cur.total += val;
      cur.qtd   += qtd;
      porMunicipioMap.set(ibge, cur);
    }
  };
  for (const d of porDestinoRaw) somar(d.codigo, d.nome, d.total ?? 0, d.qtd);
  for (const m of porMunicipioRaw) somar(m.codigoIbge!, m.municipioNome, m._sum.valorEmpenhado ?? 0, m._count._all);

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
    versaoConta: VERSAO_CONTA,
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

export type ResumoUf = Awaited<ReturnType<typeof calcularResumoUf>>;

/** Total empenhado por estado no ano — o mapa do Brasil da tela de Emendas. */
export async function calcularTotaisBrasil(db: PrismaClient, ano: number) {
  const grupos = await db.emendaParlamentar.groupBy({
    by: ['uf'],
    where: { ano, uf: { not: null } },
    _sum: { valorEmpenhado: true },
  });

  const totaisPorUF: Record<string, number> = {};
  for (const g of grupos) {
    if (g.uf) {
      totaisPorUF[g.uf] = g._sum.valorEmpenhado ?? 0;
    }
  }
  return { versaoConta: VERSAO_CONTA, ano, totaisPorUF };
}

// ─────────────────────────────────────────────────────────────────────────
// Resumo pronto (tabela emendas_resumos)
// ─────────────────────────────────────────────────────────────────────────

export const chaveResumoUf = (uf: string, ano: number, esfera: string) => `uf:${uf}:${ano}:${esfera}`;
export const chaveResumoBrasil = (ano: number) => `brasil:${ano}`;

/** Cria a tabela e o índice se ainda não existirem (mesmo SQL da migration). */
export const SQL_CRIAR_RESUMO = [
  `CREATE TABLE IF NOT EXISTS "emendas_resumos" (
    "chave"               TEXT PRIMARY KEY,
    "dados"               JSONB NOT NULL,
    "qtdEmendas"          INTEGER NOT NULL,
    "versaoEmendas"       TIMESTAMP(3),
    "versaoParlamentares" TIMESTAMP(3),
    "calculadoEm"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  // Deixa instantânea a pergunta "qual a última alteração nas emendas?".
  `CREATE INDEX IF NOT EXISTS "emendas_parlamentares_updatedAt_idx" ON "emendas_parlamentares"("updatedAt")`,
  // O índice de "updatedAt" dos documentos NÃO é criado aqui: é a migration
  // 20261017000000, rodada à mão. CONCURRENTLY não roda pela conexão do
  // pooler (vira transação — erro 25001), e sem CONCURRENTLY a criação
  // travaria a tabela de documentos durante a importação.
];

export interface Impressao {
  versaoEmendas: Date | null;
  versaoParlamentares: Date | null;
}

/**
 * Última alteração em emendas (ou nos documentos delas — o valor por
 * município sai deles) e em parlamentares. Vale para todo o banco.
 */
export async function impressaoDoBanco(db: PrismaClient): Promise<Impressao> {
  const [r] = await db.$queryRawUnsafe<{ ve: Date | null; vp: Date | null }[]>(`
    SELECT GREATEST((SELECT max("updatedAt") FROM emendas_parlamentares),
                    (SELECT max("updatedAt") FROM emendas_documentos)) AS ve,
           (SELECT max("updatedAt") FROM parlamentares)                AS vp`);
  return { versaoEmendas: r?.ve ?? null, versaoParlamentares: r?.vp ?? null };
}

const mesmaData = (a: Date | null, b: Date | null) =>
  (a?.getTime() ?? null) === (b?.getTime() ?? null);

/**
 * Resumo pronto, se ainda valer: o recorte tem o mesmo número de emendas e
 * nada mudou no banco desde a conta. Qualquer dúvida (tabela ainda não criada,
 * erro, resumo velho) → null, e quem chamou faz a conta na hora.
 */
export async function lerResumoPronto<T>(db: PrismaClient, chave: string, qtdAtual: number): Promise<T | null> {
  try {
    const linha = await db.emendaResumo.findUnique({ where: { chave } });
    if (!linha || linha.qtdEmendas !== qtdAtual) return null;
    if ((linha.dados as { versaoConta?: number } | null)?.versaoConta !== VERSAO_CONTA) return null;
    const agora = await impressaoDoBanco(db);
    if (!mesmaData(linha.versaoEmendas, agora.versaoEmendas)) return null;
    if (!mesmaData(linha.versaoParlamentares, agora.versaoParlamentares)) return null;
    return linha.dados as T;
  } catch {
    return null;
  }
}
