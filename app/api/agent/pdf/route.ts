export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import {
  Document, Page, Text, View, StyleSheet, renderToBuffer,
  Svg, Rect, Line,
} from '@react-pdf/renderer';
import React from 'react';

// ─── Paleta ──────────────────────────────────────────────────────────────────

const BLUE    = '#1d6fd8';
const DARK    = '#0f172a';
const GRAY    = '#64748b';
const BORDER  = '#e2e8f0';
const CHART_COLORS = ['#1d6fd8', '#10b981', '#f59e0b', '#ef4444'];

// ─── Estilos ─────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 40,
    backgroundColor: '#ffffff',
    color: DARK,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: BLUE,
  },
  headerTitle: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: BLUE },
  headerSub:   { fontSize: 8, color: GRAY, marginTop: 2 },
  headerDate:  { fontSize: 8, color: GRAY, textAlign: 'right' },

  // Mensagem do usuário
  question: {
    backgroundColor: BLUE,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 6,
    marginTop: 14,
  },
  questionLabel: { fontSize: 7, color: '#bfdbfe', marginBottom: 3, fontFamily: 'Helvetica-Bold', letterSpacing: 0.5 },
  questionText:  { fontSize: 9.5, color: '#ffffff', lineHeight: 1.4 },

  // Resposta da Gabi
  answer: {
    borderLeftWidth: 3,
    borderLeftColor: BLUE,
    paddingLeft: 10,
    marginBottom: 12,
  },

  // Markdown
  h1: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 6, marginTop: 8 },
  h2: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 5, marginTop: 6 },
  h3: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: BLUE, marginBottom: 4, marginTop: 5 },
  p:  { fontSize: 9.5, lineHeight: 1.5, color: '#1e293b', marginBottom: 4 },
  hr: { borderBottomWidth: 1, borderBottomColor: BORDER, marginVertical: 6 },

  bulletRow:  { flexDirection: 'row', marginBottom: 3, paddingLeft: 4 },
  bulletDot:  { fontSize: 9, color: BLUE, marginRight: 5 },
  bulletText: { fontSize: 9.5, lineHeight: 1.4, color: '#1e293b', flex: 1 },

  // Tabela
  tableWrap:     { marginVertical: 6, borderWidth: 1, borderColor: BORDER },
  tableRow:      { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER },
  tableRowLast:  { flexDirection: 'row' },
  tableRowAlt:   { backgroundColor: '#f8fafc' },
  tableHdrCell:  { paddingVertical: 5, paddingHorizontal: 8, backgroundColor: BLUE },
  tableCell:     { paddingVertical: 5, paddingHorizontal: 8 },
  tableHdrText:  { fontSize: 8.5, color: '#ffffff', fontFamily: 'Helvetica-Bold' },
  tableCellText: { fontSize: 8.5, color: '#1e293b' },
  tableCellBold: { fontSize: 8.5, color: '#1e293b', fontFamily: 'Helvetica-Bold' },

  // Gráfico
  chartWrap:    { marginTop: 6, marginBottom: 10 },
  chartXLabels: { flexDirection: 'row', marginTop: 3 },
  chartLegend:  { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  legendItem:   { flexDirection: 'row', alignItems: 'center', marginRight: 12, marginTop: 3 },
  legendDot:    { width: 8, height: 8, borderRadius: 2, marginRight: 4 },
  legendText:   { fontSize: 7, color: GRAY },

  // Rodapé
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 6,
  },
  footerText: { fontSize: 7.5, color: '#94a3b8' },
});

// ─── Inline bold parser ───────────────────────────────────────────────────────

function parseInline(text: string): React.ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((p, i) => {
      if (!p) return null;
      if (p.startsWith('**') && p.endsWith('**')) {
        return React.createElement(Text, { key: i, style: { fontFamily: 'Helvetica-Bold' } }, p.slice(2, -2));
      }
      return React.createElement(Text, { key: i }, p);
    })
    .filter(Boolean) as React.ReactNode[];
}

// ─── Markdown block parser ────────────────────────────────────────────────────

type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'hr' }
  | { type: 'paragraph'; text: string }
  | { type: 'bullet'; text: string }
  | { type: 'table'; headers: string[]; rows: string[][] };

function parseMarkdown(text: string): Block[] {
  const lines  = text.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed) { i++; continue; }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      i++; continue;
    }

    const hm = trimmed.match(/^(#{1,3})\s+(.+)/);
    if (hm) {
      blocks.push({ type: 'heading', level: Math.min(hm[1].length, 3) as 1 | 2 | 3, text: hm[2].replace(/\*\*/g, '') });
      i++; continue;
    }

    if (trimmed.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }
      const data = tableLines.filter(l => !/^\|[\s|:-]+\|$/.test(l));
      if (data.length >= 2) {
        const parseRow = (l: string) => l.slice(1, -1).split('|').map(c => c.trim());
        blocks.push({ type: 'table', headers: parseRow(data[0]), rows: data.slice(1).map(parseRow) });
      }
      continue;
    }

    const bm = trimmed.match(/^[-*•]\s+(.+)/);
    if (bm) { blocks.push({ type: 'bullet', text: bm[1] }); i++; continue; }

    const nm = trimmed.match(/^\d+[.)]\s+(.+)/);
    if (nm) { blocks.push({ type: 'bullet', text: nm[1] }); i++; continue; }

    blocks.push({ type: 'paragraph', text: trimmed });
    i++;
  }

  return blocks;
}

// ─── Number parser ────────────────────────────────────────────────────────────

function parseBrNum(s: string): number | null {
  const c = s.replace(/R\$\s*/g, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.').replace(/%/g, '').trim();
  const n = parseFloat(c);
  return isNaN(n) ? null : n;
}

// ─── Bar chart SVG ────────────────────────────────────────────────────────────

function renderChart(headers: string[], rows: string[][]): React.ReactNode | null {
  if (headers.length < 2) return null;

  const seriesNames = headers.slice(1);
  const dataRows = rows
    .map(row => ({
      label: row[0]?.replace(/\*\*/g, '') ?? '',
      raw:   row.slice(1),
      nums:  row.slice(1).map(parseBrNum),
    }))
    .filter(r => r.nums.some(v => v !== null && v > 0));

  if (dataRows.length === 0) return null;

  const allNums = dataRows.flatMap(r => r.nums.filter(v => v !== null) as number[]);
  const maxVal  = Math.max(...allNums, 1);

  // SVG canvas
  const CW = 515;
  const CH = 130;
  const plotH = CH;
  const numSeries  = seriesNames.length;
  const numGroups  = dataRows.length;
  const groupW     = CW / numGroups;
  const barW       = Math.min((groupW - 8) / numSeries, 42);
  const groupPad   = (groupW - barW * numSeries) / 2;

  const svgEls: React.ReactNode[] = [];

  // Grid lines
  [0.25, 0.5, 0.75, 1.0].forEach((r, gi) => {
    const y = plotH - r * plotH;
    svgEls.push(
      React.createElement(Line, { key: `g${gi}`, x1: 0, y1: y, x2: CW, y2: y, stroke: BORDER, strokeWidth: 0.6 })
    );
  });

  // Bars
  dataRows.forEach((row, ri) => {
    const gx = ri * groupW;
    row.nums.forEach((val, si) => {
      if (val === null) return;
      const bx   = gx + groupPad + si * barW;
      const barH = Math.max((val / maxVal) * plotH, 2);
      svgEls.push(
        React.createElement(Rect, {
          key: `b${ri}-${si}`,
          x: bx, y: plotH - barH,
          width: barW - 2, height: barH,
          fill: CHART_COLORS[si % CHART_COLORS.length],
          rx: 2,
        })
      );
    });
  });

  // X labels (outside SVG)
  const xLabels = dataRows.map((row, ri) => {
    const label = row.label.length > 22 ? row.label.slice(0, 20) + '…' : row.label;
    return React.createElement(
      View, { key: ri, style: { flex: 1, alignItems: 'center' } },
      React.createElement(Text, { style: { fontSize: 6.5, color: GRAY, textAlign: 'center' } }, label)
    );
  });

  // Legend
  const legendEls = seriesNames.map((name, si) =>
    React.createElement(View, { key: si, style: S.legendItem },
      React.createElement(View, { style: { ...S.legendDot, backgroundColor: CHART_COLORS[si % CHART_COLORS.length] } }),
      React.createElement(Text, { style: S.legendText }, name),
    )
  );

  return React.createElement(View, { style: S.chartWrap },
    React.createElement(Svg, { width: CW, height: CH }, ...svgEls),
    React.createElement(View, { style: S.chartXLabels }, ...xLabels),
    React.createElement(View, { style: S.chartLegend }, ...legendEls),
  );
}

// ─── Block renderer ───────────────────────────────────────────────────────────

function renderBlock(block: Block, i: number): React.ReactNode {
  switch (block.type) {
    case 'heading': {
      const style = block.level === 1 ? S.h1 : block.level === 2 ? S.h2 : S.h3;
      return React.createElement(Text, { key: i, style }, block.text);
    }

    case 'hr':
      return React.createElement(View, { key: i, style: S.hr });

    case 'paragraph':
      return React.createElement(Text, { key: i, style: S.p }, ...parseInline(block.text));

    case 'bullet':
      return React.createElement(View, { key: i, style: S.bulletRow },
        React.createElement(Text, { style: S.bulletDot }, '•'),
        React.createElement(Text, { style: S.bulletText }, ...parseInline(block.text)),
      );

    case 'table': {
      const hasNums = block.rows.some(r => r.slice(1).some(v => parseBrNum(v) !== null && parseBrNum(v)! > 0));
      const chart   = hasNums ? renderChart(block.headers, block.rows) : null;

      // Distribute column widths: first col wider if more than 2 cols
      const colFlex = (ci: number) => (ci === 0 && block.headers.length > 2 ? 1.6 : 1);

      const tableEl = React.createElement(View, { style: S.tableWrap },
        // Header row
        React.createElement(View, { style: S.tableRow },
          ...block.headers.map((h, hi) =>
            React.createElement(View, { key: hi, style: { ...S.tableHdrCell, flex: colFlex(hi) } },
              React.createElement(Text, { style: S.tableHdrText }, h.replace(/\*\*/g, ''))
            )
          )
        ),
        // Data rows
        ...block.rows.map((row, ri) =>
          React.createElement(View, {
            key: ri,
            style: [
              ri === block.rows.length - 1 ? S.tableRowLast : S.tableRow,
              ri % 2 === 1 ? S.tableRowAlt : {},
            ],
          },
            ...row.map((cell, ci) =>
              React.createElement(View, { key: ci, style: { ...S.tableCell, flex: colFlex(ci) } },
                React.createElement(
                  Text,
                  { style: ci === 0 ? S.tableCellBold : S.tableCellText },
                  ...parseInline(cell),
                )
              )
            )
          )
        ),
      );

      return React.createElement(View, { key: i }, tableEl, chart);
    }

    default:
      return null;
  }
}

function renderContent(content: string): React.ReactNode[] {
  return parseMarkdown(content)
    .map((b, i) => renderBlock(b, i))
    .filter(Boolean) as React.ReactNode[];
}

// ─── Componente PDF ───────────────────────────────────────────────────────────

interface Msg { role: 'user' | 'assistant'; content: string }

const WELCOME = 'Olá, Sou a Gabi! Assessora Virtual do seu Gabinete, como posso te ajudar hoje?';

// Agrupa pares (pergunta → resposta)
function agruparPares(msgs: Msg[]): Array<{ pergunta: string | null; resposta: string }> {
  const pares: Array<{ pergunta: string | null; resposta: string }> = [];
  let perguntaPendente: string | null = null;

  for (const msg of msgs) {
    if (msg.role === 'user') {
      perguntaPendente = msg.content;
    } else if (msg.role === 'assistant' && msg.content.trim() !== WELCOME) {
      pares.push({ pergunta: perguntaPendente, resposta: msg.content });
      perguntaPendente = null;
    }
  }
  return pares;
}

function GabiPDF({ titulo, messages, geradoEm }: { titulo: string; messages: Msg[]; geradoEm: string }) {
  const pares = agruparPares(messages);

  return React.createElement(Document, null,
    React.createElement(Page, { size: 'A4', style: S.page },

      // Header
      React.createElement(View, { style: S.header },
        React.createElement(View, null,
          React.createElement(Text, { style: S.headerTitle }, 'Relatório — Gabi IA'),
          React.createElement(Text, { style: S.headerSub }, 'AdminHub · Análise gerada por Inteligência Artificial'),
        ),
        React.createElement(Text, { style: S.headerDate }, geradoEm),
      ),

      // Título da consulta (primeira pergunta ou título passado)
      React.createElement(Text, {
        style: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 16 },
      }, titulo || (pares[0]?.pergunta ?? 'Relatório de Dados')),

      // Seções: uma por par pergunta→resposta
      ...pares.map((par, i) =>
        React.createElement(View, { key: i },
          // Linha separadora entre seções (a partir da segunda)
          i > 0
            ? React.createElement(View, { style: { ...S.hr, marginVertical: 14 } })
            : null,

          // Label da consulta (se há mais de uma seção ou se não é a primeira)
          par.pergunta && (pares.length > 1 || i > 0)
            ? React.createElement(View, {
                style: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 },
              },
              React.createElement(View, { style: { width: 3, height: 12, backgroundColor: BLUE, borderRadius: 2 } }),
              React.createElement(Text, {
                style: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: GRAY, textTransform: 'uppercase', letterSpacing: 0.8 },
              }, 'Consulta'),
              React.createElement(Text, {
                style: { fontSize: 8.5, color: GRAY, fontStyle: 'italic', flex: 1 },
              }, par.pergunta.length > 120 ? par.pergunta.slice(0, 120) + '…' : par.pergunta),
            )
            : null,

          // Conteúdo da resposta
          ...renderContent(par.resposta),
        )
      ),

      // Rodapé
      React.createElement(View, { style: S.footer, fixed: true },
        React.createElement(Text, { style: S.footerText }, 'AdminHub — Gabi IA · Gerado por IA, verifique as informações'),
        React.createElement(Text, {
          style: S.footerText,
          render: ({ pageNumber, totalPages }: any) => `Página ${pageNumber} de ${totalPages}`,
        }),
      ),
    ),
  );
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const body     = await request.json();
    const messages: Msg[] = Array.isArray(body?.messages) ? body.messages : [];
    const titulo   = body?.titulo ?? '';

    if (messages.length === 0) return NextResponse.json({ error: 'Sem mensagens para exportar' }, { status: 400 });

    const geradoEm = new Date().toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const pdfBuffer = await renderToBuffer(React.createElement(GabiPDF, { titulo, messages, geradoEm }) as any);

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="gabi-${Date.now()}.pdf"`,
      },
    });
  } catch (err) {
    console.error('[/api/agent/pdf]', err);
    return NextResponse.json({ error: 'Erro ao gerar PDF.' }, { status: 500 });
  }
}
