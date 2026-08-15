export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { renderToBuffer, Svg, Path } from '@react-pdf/renderer';
import React from 'react';
import {
  Document, Page, Text, View,
  HeaderBand, DocFooter, renderContent, docStyles as S, stripEmoji, C, type Pill,
} from '@/lib/agent/report/doc-pdf';
import { renderMapaEleitoral, type MapaResult } from '@/lib/agent/report/geo-map';

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function fmtMoney(n: number): string {
  if (n >= 1_000_000_000) return `R$ ${(n / 1_000_000_000).toFixed(1).replace('.', ',')}B`;
  if (n >= 1_000_000)     return `R$ ${(n / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (n >= 1_000)         return `R$ ${Math.round(n / 1_000)}K`;
  return `R$ ${n.toLocaleString('pt-BR')}`;
}

interface ReportInput {
  titulo?: string;
  conteudo?: string;
  tools?: string[];
  dadosBrutos?: Record<string, any>;
}

// ─── Seção do mapa (apenas eleições) ─────────────────────────────────────────
function MapSection(mapa: MapaResult): React.ReactNode {
  return React.createElement(View, { style: { marginTop: 14 }, wrap: false },
    React.createElement(Text, { style: S.h2 }, 'Mapa — vencedor por região'),
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
function RelatorioDocPDF({ input, tipoLabel, geradoEm, valorPill, mapa }: {
  input: ReportInput; tipoLabel: string; geradoEm: string; valorPill: Pill | null; mapa: MapaResult | null;
}) {
  const conteudo = input.conteudo ?? '';
  const reportTitle = clip(stripEmoji(input.titulo || conteudo.split('\n')[0] || 'Relatório de Dados'), 90);

  const pills: Pill[] = [
    { label: 'Tipo:', value: tipoLabel },
    ...(valorPill ? [valorPill] : []),
    { label: 'Emitido:', value: geradoEm },
  ];

  return React.createElement(Document, null,
    React.createElement(Page, { size: 'A4', style: S.page },
      HeaderBand({ titulo: reportTitle, pills }),
      ...renderContent(conteudo),
      mapa ? MapSection(mapa) : null,
      DocFooter(),
    ),
  );
}

// ─── Route handler ────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const body: ReportInput = await request.json();
    const tools = body.tools ?? [];

    const isEleitoral = tools.includes('buscar_votacao');
    const isEmendas   = tools.includes('buscar_emendas') || tools.includes('comparar_parlamentares');
    const isDemandas  = tools.includes('buscar_demandas');
    const tipoLabel = isEleitoral ? 'Eleitoral' : isEmendas ? 'Emendas' : isDemandas ? 'Demandas' : 'Análise';

    const geradoEm = new Date().toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    // Mapa — apenas eleições (com fallback silencioso)
    let mapa: MapaResult | null = null;
    if (isEleitoral) {
      const cand = body.dadosBrutos?.buscar_votacao?.candidatos?.[0];
      if (cand) {
        mapa = await renderMapaEleitoral({ uf: cand.uf, ano: Number(cand.ano), cargo: cand.cargo, width: 380, height: 300 });
      }
    }

    // Pill de valor total (emendas)
    let valorPill: Pill | null = null;
    if (isEmendas) {
      const tot = body.dadosBrutos?.buscar_emendas?.totalEmpenhado;
      if (typeof tot === 'number' && tot > 0) valorPill = { label: 'Empenhado:', value: fmtMoney(tot) };
    }

    const pdfBuffer = await renderToBuffer(
      React.createElement(RelatorioDocPDF, { input: body, tipoLabel, geradoEm, valorPill, mapa }) as any,
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
