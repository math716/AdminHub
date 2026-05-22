export const dynamic = 'force-dynamic';
// Quando lê do banco, é < 2s. Mantemos 60s pelo fallback ao Portal.
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
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
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const uf = (request.nextUrl.searchParams.get('uf') ?? '').toUpperCase();
    const anoRaw = request.nextUrl.searchParams.get('ano');
    const ano = anoRaw ? parseInt(anoRaw, 10) : new Date().getFullYear();
    if (!uf) return NextResponse.json({ error: 'uf é obrigatório' }, { status: 400 });

    // ── 1) Tenta banco ─────────────────────────────────────────────────
    const totalNoBanco = await prisma.emendaParlamentar.count({
      where: { uf, ano },
    });

    if (totalNoBanco > 0) {
      return await resumoDoBanco(uf, ano);
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
async function resumoDoBanco(uf: string, ano: number) {
  // Carregamos os campos mínimos pra agregar em memória.
  // 5k-50k registros por UF/ano é trivial pro Postgres.
  const emendas = await prisma.emendaParlamentar.findMany({
    where: { uf, ano },
    select: {
      area: true,
      valorEmpenhado: true,
      valorPago: true,
      codigoIbge: true,
      municipioNome: true,
      parlamentar: {
        select: { id: true, cpf: true, idPortal: true, nome: true, cargo: true, partido: true },
      },
    },
  });

  let totalEmpenhado      = 0;
  let totalPago           = 0;
  let totalMunicipalizado = 0;

  const porMunicipio = new Map<string, { codigoIbge: string; nome: string; total: number; qtd: number }>();
  const porArea = new Map<string, number>();
  const porParlamentar = new Map<string, {
    cpf: string | null; idPortal: string; nome: string; cargo: string; partido: string | null; total: number; qtd: number;
  }>();

  emendas.forEach((e) => {
    const valor = e.valorEmpenhado ?? 0;
    totalEmpenhado += valor;
    totalPago += e.valorPago ?? 0;

    if (e.codigoIbge) {
      totalMunicipalizado += valor;
      const cur = porMunicipio.get(e.codigoIbge) ?? {
        codigoIbge: e.codigoIbge,
        nome: e.municipioNome ?? e.codigoIbge,
        total: 0, qtd: 0,
      };
      cur.total += valor;
      cur.qtd++;
      porMunicipio.set(e.codigoIbge, cur);
    }

    porArea.set(e.area, (porArea.get(e.area) ?? 0) + valor);

    if (e.parlamentar) {
      const pk = e.parlamentar.cpf ?? e.parlamentar.idPortal ?? e.parlamentar.nome;
      const curP = porParlamentar.get(pk) ?? {
        cpf:      e.parlamentar.cpf,
        idPortal: e.parlamentar.idPortal ?? e.parlamentar.nome,
        nome:     e.parlamentar.nome,
        cargo:    e.parlamentar.cargo,
        partido:  e.parlamentar.partido,
        total:    0, qtd: 0,
      };
      curP.total += valor;
      curP.qtd++;
      porParlamentar.set(pk, curP);
    }
  });

  const topMunicipios = Array.from(porMunicipio.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const valorPorMunicipio: Record<string, number> = {};
  porMunicipio.forEach((v) => { valorPorMunicipio[v.codigoIbge] = v.total; });

  const areas = Array.from(porArea.entries())
    .map(([area, total]) => ({ area, total }))
    .sort((a, b) => b.total - a.total);

  const parlamentares = Array.from(porParlamentar.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 50);

  return NextResponse.json({
    uf,
    ano,
    totalEmpenhado,
    totalPago,
    totalMunicipalizado,
    totalEstadual: totalEmpenhado - totalMunicipalizado,
    totalEmendas: emendas.length,
    topMunicipios,
    valorPorMunicipio,
    areas,
    parlamentares,
    mock: false,
    fonte: 'banco' as const,
  });
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
      cpf: e.autorCpf, idPortal: e.autorCpf ?? e.autorNome, nome: e.autorNome,
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
    areas:            Array.from(porArea.entries()).map(([area, total]) => ({ area, total })).sort((a, b) => b.total - a.total),
    parlamentares:    Array.from(porParlamentar.values()).sort((a, b) => b.total - a.total).slice(0, 50),
    mock: PORTAL_MOCK_MODE,
    fonte: 'portal' as const,
  });
}
