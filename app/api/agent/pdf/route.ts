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

const BLUE      = '#1d6fd8';
const BLUE_DARK = '#0c1d38';
const CYAN      = '#22d3ee';
const DARK      = '#0f172a';
const GRAY      = '#64748b';
const LIGHT     = '#f1f5f9';
const BORDER    = '#e2e8f0';
const WHITE     = '#ffffff';
const CHART_COLORS = ['#1d6fd8', '#10b981', '#f59e0b', '#ef4444', '#a78bfa', '#fb923c'];

// ─── Estilos ─────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    paddingBottom: 56,
    backgroundColor: '#f8fafc',
    color: DARK,
  },

  // ── Header band ──
  headerBand: {
    backgroundColor: BLUE_DARK,
    paddingHorizontal: 40,
    paddingTop: 24,
    paddingBottom: 20,
    marginBottom: 0,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerBadgeText: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 14,
    color: WHITE,
  },
  headerMeta: {
    flex: 1,
  },
  headerLabel: {
    fontSize: 7,
    color: CYAN,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 15,
    fontFamily: 'Helvetica-Bold',
    color: WHITE,
    lineHeight: 1.3,
  },
  headerPills: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 10,
  },
  pill: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pillLabel: {
    fontSize: 7,
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  pillValue: {
    fontSize: 7.5,
    color: WHITE,
    fontFamily: 'Helvetica-Bold',
  },

  // ── Content area ──
  content: {
    paddingHorizontal: 40,
    paddingTop: 20,
  },

  // ── Section label ──
  sectionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 16,
    gap: 6,
  },
  sectionBar: {
    width: 3,
    height: 12,
    backgroundColor: BLUE,
    borderRadius: 2,
  },
  sectionLabelText: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: GRAY,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionQuestion: {
    fontSize: 8.5,
    color: GRAY,
    fontStyle: 'italic',
    flex: 1,
  },

  // ── Content cards ──
  contentCard: {
    backgroundColor: WHITE,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },

  // ── Markdown ──
  h1: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 6, marginTop: 8 },
  h2: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 5, marginTop: 6 },
  h3: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: BLUE, marginBottom: 4, marginTop: 5 },
  p:  { fontSize: 9, lineHeight: 1.5, color: '#334155', marginBottom: 4 },
  hr: { borderBottomWidth: 1, borderBottomColor: BORDER, marginVertical: 8 },

  bulletRow:  { flexDirection: 'row', marginBottom: 3, paddingLeft: 4 },
  bulletDot:  { fontSize: 9, color: BLUE, marginRight: 6 },
  bulletText: { fontSize: 9, lineHeight: 1.4, color: '#334155', flex: 1 },

  // ── Tabela ──
  tableWrap:    { marginVertical: 6, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: BORDER },
  tableRow:     { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER },
  tableRowLast: { flexDirection: 'row' },
  tableRowAlt:  { backgroundColor: '#f8fafc' },
  tableHdrCell: { paddingVertical: 6, paddingHorizontal: 8, backgroundColor: BLUE },
  tableCell:    { paddingVertical: 5, paddingHorizontal: 8 },
  tableHdrText: { fontSize: 8, color: WHITE, fontFamily: 'Helvetica-Bold' },
  tableCellText:{ fontSize: 8.5, color: '#334155' },
  tableCellBold:{ fontSize: 8.5, color: DARK, fontFamily: 'Helvetica-Bold' },

  // ── Gráfico ──
  chartWrap:    { marginTop: 4, marginBottom: 8 },
  chartXLabels: { flexDirection: 'row', marginTop: 3 },
  chartLegend:  { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  legendItem:   { flexDirection: 'row', alignItems: 'center', marginRight: 14, marginTop: 3 },
  legendDot:    { width: 8, height: 8, borderRadius: 2, marginRight: 4 },
  legendText:   { fontSize: 7, color: GRAY },

  // ── Donut (SVG) ──
  donutRow: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
    marginTop: 6,
    marginBottom: 6,
  },
  donutLegendWrap: {
    flex: 1,
    paddingTop: 4,
  },
  donutLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  donutLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  donutLegendLabel: {
    fontSize: 8.5,
    color: '#334155',
    flex: 1,
  },
  donutLegendPct: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: DARK,
  },

  // ── Rodapé ──
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
  footerText: { fontSize: 7, color: '#94a3b8' },
});

// ─── Inline bold parser ───────────────────────────────────────────────────────

function parseInline(text: string): React.ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((p, i) => {
      if (!p) return null;
      if (p.startsWith('**') && p.endsWith('**'))
        return React.createElement(Text, { key: i, style: { fontFamily: 'Helvetica-Bold' } }, p.slice(2, -2));
      return React.createElement(Text, { key: i }, p);
    })
    .filter(Boolean) as React.ReactNode[];
}

// ─── Markdown parser ──────────────────────────────────────────────────────────

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
      blocks.push({ type: 'hr' }); i++; continue;
    }

    const hm = trimmed.match(/^(#{1,3})\s+(.+)/);
    if (hm) {
      blocks.push({ type: 'heading', level: Math.min(hm[1].length, 3) as 1 | 2 | 3, text: hm[2].replace(/\*\*/g, '') });
      i++; continue;
    }

    if (trimmed.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i].trim()); i++;
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

function fmtBR(n: number): string {
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (n >= 1_000)     return `R$ ${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString('pt-BR');
}

// ─── SVG Bar chart ────────────────────────────────────────────────────────────

function renderBarChart(headers: string[], rows: string[][]): React.ReactNode | null {
  if (headers.length < 2) return null;

  const seriesNames = headers.slice(1);
  const dataRows = rows
    .map(row => ({
      label: row[0]?.replace(/\*\*/g, '') ?? '',
      nums:  row.slice(1).map(parseBrNum),
    }))
    .filter(r => r.nums.some(v => v !== null && v > 0));

  if (dataRows.length === 0) return null;

  const allNums = dataRows.flatMap(r => r.nums.filter(v => v !== null) as number[]);
  const maxVal  = Math.max(...allNums, 1);

  const CW = 515, CH = 110;
  const numSeries = seriesNames.length;
  const numGroups = dataRows.length;
  const groupW    = CW / numGroups;
  const barW      = Math.min((groupW - 10) / numSeries, 40);
  const groupPad  = (groupW - barW * numSeries) / 2;

  const svgEls: React.ReactNode[] = [];

  [0.25, 0.5, 0.75, 1.0].forEach((r, gi) => {
    const y = CH - r * CH;
    svgEls.push(React.createElement(Line, { key: `g${gi}`, x1: 0, y1: y, x2: CW, y2: y, stroke: '#e2e8f0', strokeWidth: 0.6 }));
  });

  dataRows.forEach((row, ri) => {
    const gx = ri * groupW;
    row.nums.forEach((val, si) => {
      if (val === null) return;
      const bx   = gx + groupPad + si * barW;
      const barH = Math.max((val / maxVal) * CH, 2);
      svgEls.push(React.createElement(Rect, {
        key: `b${ri}-${si}`,
        x: bx, y: CH - barH, width: barW - 2, height: barH,
        fill: CHART_COLORS[si % CHART_COLORS.length], rx: 3,
      }));
    });
  });

  const xLabels = dataRows.map((row, ri) => {
    const label = row.label.length > 18 ? row.label.slice(0, 16) + '…' : row.label;
    return React.createElement(View, { key: ri, style: { flex: 1, alignItems: 'center' } },
      React.createElement(Text, { style: { fontSize: 6.5, color: GRAY, textAlign: 'center' } }, label)
    );
  });

  const legendEls = seriesNames.map((name, si) =>
    React.createElement(View, { key: si, style: S.legendItem },
      React.createElement(View, { style: { ...S.legendDot, backgroundColor: CHART_COLORS[si % CHART_COLORS.length] } }),
      React.createElement(Text, { style: S.legendText }, name),
    )
  );

  return React.createElement(View, { style: S.chartWrap },
    React.createElement(Svg, { width: CW, height: CH }, ...svgEls),
    React.createElement(View, { style: S.chartXLabels }, ...xLabels),
    seriesNames.length > 1 ? React.createElement(View, { style: S.chartLegend }, ...legendEls) : null,
  );
}

// ─── Proportion bar (replaces pie chart in PDF, SVG Path not available) ──────

function renderPropBar(items: Array<{ label: string; valor: number }>): React.ReactNode | null {
  if (!items || items.length === 0) return null;

  const total = items.reduce((s, it) => s + it.valor, 0);
  if (total === 0) return null;

  const totalWidth = 200;
  let barX = 0;
  const barEls: React.ReactNode[] = items.map((item, i) => {
    const w = (item.valor / total) * totalWidth;
    const el = React.createElement(Rect, {
      key: i, x: barX, y: 0, width: Math.max(w - 1, 0), height: 12,
      fill: CHART_COLORS[i % CHART_COLORS.length], rx: 2,
    });
    barX += w;
    return el;
  });

  const legendItems = items.map((item, i) => {
    const pct = ((item.valor / total) * 100).toFixed(0);
    return React.createElement(View, { key: i, style: S.donutLegendItem },
      React.createElement(View, { style: { ...S.donutLegendDot, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] } }),
      React.createElement(Text, { style: S.donutLegendLabel },
        item.label.length > 20 ? item.label.slice(0, 18) + '…' : item.label
      ),
      React.createElement(Text, { style: S.donutLegendPct }, `${pct}%`),
    );
  });

  return React.createElement(View, null,
    React.createElement(Svg, { width: totalWidth, height: 12 }, ...barEls),
    React.createElement(View, { style: { marginTop: 8 } }, ...legendItems),
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
      const chart   = hasNums ? renderBarChart(block.headers, block.rows) : null;
      const colFlex = (ci: number) => (ci === 0 && block.headers.length > 2 ? 1.7 : 1);

      const tableEl = React.createElement(View, { style: S.tableWrap },
        React.createElement(View, { style: S.tableRow },
          ...block.headers.map((h, hi) =>
            React.createElement(View, { key: hi, style: { ...S.tableHdrCell, flex: colFlex(hi) } },
              React.createElement(Text, { style: S.tableHdrText }, h.replace(/\*\*/g, ''))
            )
          )
        ),
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
                React.createElement(Text, { style: ci === 0 ? S.tableCellBold : S.tableCellText }, ...parseInline(cell))
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

// ─── Extract data from messages ───────────────────────────────────────────────

interface Msg { role: 'user' | 'assistant'; content: string }

const WELCOME = 'Olá, Sou a Gabi! Assessora Virtual do seu Gabinete, como posso te ajudar hoje?';

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

// Extract numeric summary from text (finds first R$ value)
function extractFirstValue(text: string): string | null {
  const m = text.match(/R\$\s*[\d.,]+(?:\s*(?:milhões?|bilhões?|mil))?/i);
  return m ? m[0] : null;
}

// ─── PDF Component ────────────────────────────────────────────────────────────

function GabiPDF({ titulo, messages, geradoEm }: { titulo: string; messages: Msg[]; geradoEm: string }) {
  const pares = agruparPares(messages);

  // Derive metadata from first user question
  const firstQuestion = pares[0]?.pergunta ?? '';
  const firstAnswer   = pares[0]?.resposta ?? '';
  const reportTitle   = firstQuestion.length > 0
    ? (firstQuestion.length > 80 ? firstQuestion.slice(0, 78) + '…' : firstQuestion)
    : titulo;

  const firstValue = extractFirstValue(firstAnswer);

  return React.createElement(Document, null,
    React.createElement(Page, { size: 'A4', style: S.page },

      // ── Blue header band ──
      React.createElement(View, { style: S.headerBand },
        React.createElement(View, { style: S.headerTop },
          // "G" badge
          React.createElement(View, { style: S.headerBadge },
            React.createElement(Text, { style: S.headerBadgeText }, 'G'),
          ),
          React.createElement(View, { style: S.headerMeta },
            React.createElement(Text, { style: S.headerLabel }, 'Relatório preparado pela Gabi · AdminHub'),
            React.createElement(Text, { style: S.headerTitle }, reportTitle),
          ),
        ),
        // Metadata pills
        React.createElement(View, { style: S.headerPills },
          firstValue && React.createElement(View, { style: S.pill },
            React.createElement(Text, { style: S.pillLabel }, 'Valor: '),
            React.createElement(Text, { style: S.pillValue }, firstValue),
          ),
          React.createElement(View, { style: S.pill },
            React.createElement(Text, { style: S.pillLabel }, 'Emitido: '),
            React.createElement(Text, { style: S.pillValue }, geradoEm),
          ),
          React.createElement(View, { style: S.pill },
            React.createElement(Text, { style: S.pillLabel }, 'Consultas: '),
            React.createElement(Text, { style: S.pillValue }, String(pares.length)),
          ),
        ),
      ),

      // ── Content ──
      React.createElement(View, { style: S.content },
        ...pares.map((par, i) =>
          React.createElement(View, { key: i },
            // Section divider (after first)
            i > 0 ? React.createElement(View, { style: { ...S.hr, marginVertical: 12 } }) : null,

            // Consulta label
            par.pergunta
              ? React.createElement(View, { style: S.sectionLabel },
                  React.createElement(View, { style: S.sectionBar }),
                  React.createElement(Text, { style: S.sectionLabelText }, 'Consulta'),
                  React.createElement(Text, { style: S.sectionQuestion },
                    par.pergunta.length > 110 ? par.pergunta.slice(0, 108) + '…' : par.pergunta
                  ),
                )
              : null,

            // Answer in white card
            React.createElement(View, { style: S.contentCard },
              ...renderContent(par.resposta),
            ),
          )
        ),
      ),

      // ── Footer ──
      React.createElement(View, { style: S.footer, fixed: true },
        React.createElement(Text, { style: S.footerText }, 'AdminHub — Gabi IA · Gerado por IA, verifique as informações'),
        React.createElement(Text, {
          style: S.footerText,
          render: ({ pageNumber, totalPages }: any) => `Pág. ${pageNumber} / ${totalPages}`,
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
