export const dynamic = 'force-dynamic'; // auth usa cookies — rota dinâmica; cache fica na camada de dados
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/db';
import { PORTAL_MOCK_MODE, getAllEmendasDoAno, type PortalEmenda } from '@/lib/portal-transparencia';
import { exigirAcesso } from '@/lib/acesso-api';
import { PERMISSIONS } from '@/lib/permissions';
import {
  calcularResumoUf, chaveResumoUf, lerResumoPronto, normalizarNomeParlamentar, type ResumoUf,
} from '@/lib/emendas/resumo-emendas';

// Resumo de emendas pra um UF inteiro num ano: top municípios, totais por
// área, top parlamentares.
//
// Estratégia em camadas:
//   1) Se a tabela emendas_parlamentares tiver registros pro (uf, ano) →
//      consulta o banco (rápido + completo). A conta está em
//      lib/emendas/resumo-emendas.ts; quando ligado, lê antes o resumo pronto
//      calculado no fim da importação (e calcula na hora se ele estiver velho).
//   2) Senão, cai pro Portal ao vivo (lento + parcial). Vale como fallback
//      enquanto a sincronização (scripts/sync-emendas-portal.ts) não rodou.

// Ler o resumo pronto (tabela emendas_resumos). Ligado em 16/10/2026, depois
// que a conferência (workflow "Resumo de Emendas") deu 522 de 522 iguais.
const USAR_RESUMO_PRONTO = true;

export async function GET(request: NextRequest) {
  try {
    const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.EMENDAS_MAPA] });
    if (acesso instanceof NextResponse) return acesso;

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
      return await resumoDoBanco(uf, ano, esfera, totalNoBanco);
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
async function computeResumoBanco(uf: string, ano: number, esferaKey: string, qtdNoBanco: number) {
  if (USAR_RESUMO_PRONTO) {
    const pronto = await lerResumoPronto<ResumoUf>(prisma, chaveResumoUf(uf, ano, esferaKey), qtdNoBanco);
    if (pronto) return pronto;
  }
  return calcularResumoUf(prisma, uf, ano, esferaKey);
}

// Cache de 5 min por (uf, ano, esfera) — elimina o custo de re-processar
// 50k registros a cada requisição para o mesmo estado/ano/filtro.
const getCachedResumoBanco = unstable_cache(
  computeResumoBanco,
  ['resumo-banco'],
  { revalidate: 300 },
);

async function resumoDoBanco(uf: string, ano: number, esfera: 'FEDERAL' | 'ESTADUAL' | null, qtdNoBanco: number) {
  const data = await getCachedResumoBanco(uf, ano, esfera ?? 'TODAS', qtdNoBanco);
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
