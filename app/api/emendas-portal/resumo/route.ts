export const dynamic = 'force-dynamic';
// Pode demorar até ~30s pra estados grandes — Vercel Pro suporta 60s.
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { PORTAL_MOCK_MODE, getAllEmendasDoAno, type PortalEmenda } from '@/lib/portal-transparencia';

// Resumo de emendas para um UF inteiro num determinado ano.
// Retorna: total, top 5 municípios, totais por área, totais por parlamentar.
// Em modo mock, agrega os mocks de TODOS os municípios fictícios.
// Em produção, idealmente esse endpoint consultaria a tabela
// EmendaParlamentar local (sincronizada) — não vai bater no Portal a cada call.
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const uf = (request.nextUrl.searchParams.get('uf') ?? '').toUpperCase();
    const anoRaw = request.nextUrl.searchParams.get('ano');
    const ano = anoRaw ? parseInt(anoRaw, 10) : new Date().getFullYear();
    if (!uf) return NextResponse.json({ error: 'uf é obrigatório' }, { status: 400 });

    // Lista os municípios do UF (IBGE) e agrega.
    const ufCodes: Record<string, number> = {
      AC: 12, AL: 27, AP: 16, AM: 13, BA: 29, CE: 23, DF: 53, ES: 32, GO: 52, MA: 21,
      MT: 51, MS: 50, MG: 31, PA: 15, PB: 25, PR: 41, PE: 26, PI: 22, RJ: 33, RN: 24,
      RS: 43, RO: 11, RR: 14, SC: 42, SP: 35, SE: 28, TO: 17,
    };
    const ufCode = ufCodes[uf];
    if (!ufCode) return NextResponse.json({ error: 'UF inválido' }, { status: 400 });

    // Fonte única: baixa todas as emendas do ano da UF de uma vez. O cache
    // interno garante que detalhe de município e Top 5 batem nos números.
    const all = await getAllEmendasDoAno({ ano, uf });

    // Agregações
    // totalEmpenhado: TUDO (incluindo emendas com localidadeDoGasto = "Nacional"
    // ou "UF inteiro", que não têm município identificado)
    // totalMunicipalizado: só emendas com município identificado (bate com a
    // soma dos top municípios e o valor mostrado no mapa)
    // totalEstadual: emendas direcionadas ao estado todo ou Nacional
    const totalEmpenhado       = all.reduce((s, e) => s + (e.valorEmpenhado ?? 0), 0);
    const totalPago            = all.reduce((s, e) => s + (e.valorPago ?? 0), 0);
    const totalMunicipalizado  = all.reduce((s, e) => s + (e.codigoIbge ? (e.valorEmpenhado ?? 0) : 0), 0);
    const totalEstadual        = totalEmpenhado - totalMunicipalizado;

    const porMunicipio = new Map<string, { codigoIbge: string; nome: string; total: number; qtd: number }>();
    const porArea       = new Map<string, number>();
    const porParlamentar = new Map<string, {
      cpf: string | null; idPortal: string; nome: string; cargo: string; partido: string | null; total: number; qtd: number;
    }>();

    all.forEach((e) => {
      // município
      if (e.codigoIbge) {
        const cur = porMunicipio.get(e.codigoIbge) ?? {
          codigoIbge: e.codigoIbge,
          nome: e.municipioNome ?? e.codigoIbge,
          total: 0,
          qtd: 0,
        };
        cur.total += e.valorEmpenhado ?? 0;
        cur.qtd   += 1;
        porMunicipio.set(e.codigoIbge, cur);
      }
      // área
      porArea.set(e.area, (porArea.get(e.area) ?? 0) + (e.valorEmpenhado ?? 0));
      // parlamentar
      const pk = e.autorCpf ?? e.autorNome;
      const curP = porParlamentar.get(pk) ?? {
        cpf:       e.autorCpf,
        idPortal:  e.autorCpf ?? e.autorNome,
        nome:      e.autorNome,
        cargo:     e.autorCargo,
        partido:   e.autorPartido,
        total:     0,
        qtd:       0,
      };
      curP.total += e.valorEmpenhado ?? 0;
      curP.qtd   += 1;
      porParlamentar.set(pk, curP);
    });

    const topMunicipios = Array.from(porMunicipio.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    const valorPorMunicipio: Record<string, number> = {};
    porMunicipio.forEach((v) => {
      valorPorMunicipio[v.codigoIbge] = v.total;
    });

    const areas = Array.from(porArea.entries())
      .map(([area, total]) => ({ area, total }))
      .sort((a, b) => b.total - a.total);

    const parlamentares = Array.from(porParlamentar.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    return NextResponse.json({
      uf,
      ano,
      totalEmpenhado,
      totalPago,
      totalMunicipalizado,
      totalEstadual,
      totalEmendas: all.length,
      topMunicipios,
      valorPorMunicipio,
      areas,
      parlamentares,
      mock: PORTAL_MOCK_MODE,
    });
  } catch (error) {
    console.error('GET /api/emendas-portal/resumo error:', error);
    return NextResponse.json({ error: 'Erro ao gerar resumo' }, { status: 500 });
  }
}
