export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { renderToBuffer, Svg, Path } from '@react-pdf/renderer';
import React from 'react';
import {
  Document, Page, Text, View,
  HeaderBand, DocFooter, renderContent, renderPizza, docStyles as S, stripEmoji, C, type Pill,
} from '@/lib/agent/report/doc-pdf';
import { renderMapaEleitoral, renderMapaEmendasVencedor, renderMapaVotos, coresPorCandidato, tituloCaso, type MapaResult } from '@/lib/agent/report/geo-map';
import { montarRelatorioTerritorial } from '@/lib/agent/report/territorial-doc';

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function fmtMoney(n: number): string {
  if (n >= 1_000_000_000) return `R$ ${(n / 1_000_000_000).toFixed(1).replace('.', ',')}B`;
  if (n >= 1_000_000)     return `R$ ${(n / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (n >= 1_000)         return `R$ ${Math.round(n / 1_000)}K`;
  return `R$ ${n.toLocaleString('pt-BR')}`;
}

const AREA_LABEL: Record<string, string> = {
  SAUDE: 'Saúde', EDUCACAO: 'Educação', SEGURANCA: 'Segurança', INFRAESTRUTURA: 'Infraestrutura',
  ASSISTENCIA_SOCIAL: 'Assistência Social', AGRICULTURA: 'Agricultura', CULTURA: 'Cultura',
  ESPORTE: 'Esporte', MEIO_AMBIENTE: 'Meio Ambiente', TRANSPORTE: 'Transporte',
  HABITACAO: 'Habitação', SANEAMENTO: 'Saneamento', OUTROS: 'Outros',
};

interface ReportInput {
  titulo?: string;
  conteudo?: string;
  tools?: string[];
  visualizacoes?: any[];
  dadosBrutos?: Record<string, any>;
}

// Monta o gráfico de pizza (distribuição) a partir dos dados estruturados.
function buildPizza(input: ReportInput, isEleitoral: boolean, isEmendas: boolean): React.ReactNode | null {
  // Eleições
  if (isEleitoral) {
    const cands: any[] = input.dadosBrutos?.buscar_votacao?.candidatos ?? [];
    // 2+ candidatos → distribuição por candidato (cores consistentes com o mapa)
    if (cands.length >= 2) {
      const base = cands.map(c => ({ label: tituloCaso(c.nomeUrna || c.nome || ''), valor: c.totalVotos || 0, partido: c.partido || '' }));
      const cores = coresPorCandidato(base.map(b => ({ label: b.label, partido: b.partido, peso: b.valor })));
      return renderPizza('Distribuição de votos', base.map(b => ({ label: b.label, valor: b.valor, cor: cores[b.label] })));
    }
    // 1 candidato → distribuição dos votos DELE por município (útil, não "100%")
    if (cands.length === 1) {
      const muns = (cands[0].votosPorMunicipio ?? []).slice(0, 8)
        .map((m: any) => ({ label: String(m.municipio || ''), valor: Number(m.votos) || 0 }));
      return muns.length >= 2 ? renderPizza('Votos por município (principais)', muns) : null;
    }
  }
  // Emendas — distribuição por área temática
  if (isEmendas) {
    const emendas: any[] = input.dadosBrutos?.buscar_emendas?.emendas ?? [];
    if (emendas.length > 0) {
      const byArea: Record<string, number> = {};
      emendas.forEach(e => { byArea[e.area] = (byArea[e.area] || 0) + (e.valorEmpenhado || 0); });
      const itens = Object.entries(byArea).sort((a, b) => b[1] - a[1])
        .map(([area, v]) => ({ label: AREA_LABEL[area] || area, valor: v, valorLabel: fmtMoney(v) }));
      return renderPizza('Distribuição por área', itens);
    }
  }
  // Fallback (inclui demandas) — usa o donut que a Gabi já gerou
  const donut = input.visualizacoes?.find(v => v.tipo === 'donut');
  if (donut?.dados?.itens?.length) {
    return renderPizza(donut.titulo || 'Distribuição', donut.dados.itens.map((it: any) => ({
      label: String(it.label), valor: Number(it.valor) || 0, cor: it.cor,
    })));
  }
  return null;
}

// ─── Seção do mapa ───────────────────────────────────────────────────────────
function MapSection(mapa: MapaResult, titulo: string): React.ReactNode {
  return React.createElement(View, { style: { marginTop: 14 }, wrap: false },
    React.createElement(Text, { style: S.h2 }, titulo),
    React.createElement(View, { style: { alignItems: 'center', paddingVertical: 8, borderWidth: 1, borderColor: C.border, borderRadius: 6 } },
      React.createElement(Svg, { width: mapa.width, height: mapa.height },
        ...mapa.paths.map((p, i) => React.createElement(Path, { key: i, d: p.d, fill: p.fill, stroke: C.white, strokeWidth: 0.3 })),
      ),
      mapa.legend.length > 0 ? React.createElement(View, { style: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 8 } },
        ...mapa.legend.map((l, i) => React.createElement(View, { key: i, style: { flexDirection: 'row', alignItems: 'center', gap: 4 } },
          React.createElement(View, { style: { width: 9, height: 9, borderRadius: 2, backgroundColor: l.cor } }),
          React.createElement(Text, { style: { fontSize: 8, color: C.gray } }, l.label),
        )),
      ) : null,
    ),
  );
}

// ─── Documento ───────────────────────────────────────────────────────────────
function RelatorioDocPDF({ input, tipoLabel, geradoEm, valorPill, mapa, mapaTitulo }: {
  input: ReportInput; tipoLabel: string; geradoEm: string; valorPill: Pill | null; mapa: MapaResult | null; mapaTitulo: string;
}) {
  const conteudo = input.conteudo ?? '';
  const reportTitle = clip(stripEmoji(input.titulo || conteudo.split('\n')[0] || 'Relatório de Dados'), 90);

  const tools = input.tools ?? [];
  const isEleitoral = tools.includes('buscar_votacao');
  const isEmendas   = tools.includes('buscar_emendas') || tools.includes('comparar_parlamentares');
  const pizza = buildPizza(input, isEleitoral, isEmendas);

  const pills: Pill[] = [
    { label: 'Tipo:', value: tipoLabel },
    ...(valorPill ? [valorPill] : []),
    { label: 'Emitido:', value: geradoEm },
  ];

  return React.createElement(Document, null,
    React.createElement(Page, { size: 'A4', style: S.page },
      HeaderBand({ titulo: reportTitle, pills }),
      pizza,
      ...renderContent(conteudo),
      mapa ? MapSection(mapa, mapaTitulo) : null,
      DocFooter(),
    ),
  );
}

// ─── Route handler ────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const body: ReportInput & { tipo?: string; ano?: number; uf?: string; cargo?: string; deputados?: string[] } =
      await request.json();

    // ── Relatório Territorial do DF (por Região Administrativa) ────────────
    // Vive nesta mesma rota para não criar outra serverless function
    // (limite de 12 no plano Hobby do Vercel).
    if (body.tipo === 'territorial') {
      const ano   = body.ano ? Number(body.ano) : 2022;
      const uf    = (body.uf ?? 'DF').toUpperCase();
      const cargo = body.cargo ?? 'Deputado Distrital';
      const nomes = Array.isArray(body.deputados)
        ? body.deputados.map((n: any) => String(n).trim()).filter((n: string) => n.length > 1)
        : [];
      if (uf !== 'DF') {
        return NextResponse.json({ error: 'Relatório territorial disponível apenas para o DF.' }, { status: 400 });
      }
      if (nomes.length === 0) {
        return NextResponse.json({ error: 'Informe ao menos um deputado.' }, { status: 400 });
      }
      const pdf = await montarRelatorioTerritorial({ ano, uf, cargo, nomes });
      return new NextResponse(pdf as any, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="gabi-relatorio-territorial-${Date.now()}.pdf"`,
        },
      });
    }

    const tools = body.tools ?? [];

    const isEleitoral = tools.includes('buscar_votacao');
    const isEmendas   = tools.includes('buscar_emendas') || tools.includes('comparar_parlamentares');
    const isDemandas  = tools.includes('buscar_demandas');
    const tipoLabel = isEleitoral ? 'Eleitoral' : isEmendas ? 'Emendas' : isDemandas ? 'Demandas' : 'Análise';

    const geradoEm = new Date().toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    // Mapa (com fallback silencioso). Regra:
    //  • eleição com 2+ candidatos → vencedor por região
    //  • eleição com 1 candidato   → mapa de calor dos votos DELE
    //  • emendas                   → mapa de calor por valor (município)
    let mapa: MapaResult | null = null;
    let mapaTitulo = 'Mapa';
    const W = 380, H = 300;
    if (isEleitoral) {
      const cands: any[] = body.dadosBrutos?.buscar_votacao?.candidatos ?? [];
      const c = cands[0];
      if (cands.length === 1) {
        // 1 candidato → heatmap dos votos dele
        const valores: Record<string, number> = {};
        (c.votosPorMunicipio ?? []).forEach((m: any) => { if (m.municipio) valores[m.municipio] = m.votos; });
        if (Object.keys(valores).length > 0) {
          mapa = await renderMapaVotos({ uf: c.uf, valores, width: W, height: H });
          mapaTitulo = c.uf === 'BR' ? 'Mapa — votos por estado' : 'Mapa — votos por município';
        }
      } else if (cands.length >= 2 && cands.length <= 6) {
        // comparação de candidatos específicos → vencedor ENTRE eles
        mapa = await renderMapaEleitoral({
          uf: c.uf, ano: Number(c.ano), cargo: c.cargo,
          candidatos: cands.map((x: any) => x.nomeUrna || x.nome),
          width: W, height: H,
        });
        mapaTitulo = 'Mapa — vencedor por região (entre os candidatos)';
      } else if (cands.length > 6) {
        // lista geral (todos os candidatos) → vencedor geral da eleição
        mapa = await renderMapaEleitoral({ uf: c.uf, ano: Number(c.ano), cargo: c.cargo, width: W, height: H });
        mapaTitulo = 'Mapa — vencedor por região';
      }
    } else if (isEmendas) {
      const emendas: any[] = body.dadosBrutos?.buscar_emendas?.emendas ?? [];
      if (emendas.length > 0) {
        const ufCount: Record<string, number> = {};
        emendas.forEach(e => { if (e.uf) ufCount[e.uf] = (ufCount[e.uf] ?? 0) + 1; });
        const uf = Object.entries(ufCount).sort((a, b) => b[1] - a[1])[0]?.[0];
        if (uf) {
          // Colore cada município pelo parlamentar que mais destinou ali.
          mapa = await renderMapaEmendasVencedor({ uf, emendas, width: W, height: H });
          mapaTitulo = 'Mapa — parlamentar que mais destinou por município';
        }
      }
    }

    // Pill de valor total (emendas)
    let valorPill: Pill | null = null;
    if (isEmendas) {
      const tot = body.dadosBrutos?.buscar_emendas?.totalEmpenhado;
      if (typeof tot === 'number' && tot > 0) valorPill = { label: 'Empenhado:', value: fmtMoney(tot) };
    }

    const pdfBuffer = await renderToBuffer(
      React.createElement(RelatorioDocPDF, { input: body, tipoLabel, geradoEm, valorPill, mapa, mapaTitulo }) as any,
    );

    return new NextResponse(pdfBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="gabi-relatorio-${Date.now()}.pdf"`,
      },
    });
  } catch (err) {
    console.error('[/api/agent/relatorio]', err);
    return NextResponse.json({ error: 'Erro ao gerar relatório.' }, { status: 500 });
  }
}
