export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import {
  Document, Page, Text, View, StyleSheet, renderToBuffer,
  Svg, Path, Rect, Line, Circle,
} from '@react-pdf/renderer';
import React from 'react';

// ─── Dimensões (A4 Landscape: 841.89 × 595.28 pt) ───────────────────────────

const W = 841.89;
const H = 595.28;
const PAD_H = 34;
const PAD_V = 24;
const HEADER_H = 86;
const FOOTER_H = 28;
const CONTENT_Y = HEADER_H;
const CONTENT_H = H - HEADER_H - FOOTER_H;

// ─── Paleta ───────────────────────────────────────────────────────────────────

const BLUE      = '#1d6fd8';
const BLUE_MID  = '#1e40af';
const BLUE_DARK = '#0c1d38';
const CYAN      = '#22d3ee';
const WHITE     = '#ffffff';
const DARK      = '#0f172a';
const GRAY      = '#64748b';
const LIGHT_BG  = '#f8fafc';
const BORDER    = '#e2e8f0';
const GREEN     = '#10b981';
const RED_C     = '#ef4444';
const AMBER     = '#f59e0b';
const VIOLET    = '#a78bfa';

const PALETTE   = [BLUE, RED_C, GREEN, AMBER, VIOLET, '#fb923c', '#e879f9', '#34d399'];
const PARTY_CLR: Record<string, string> = {
  PT: '#ef4444', PL: '#1d4ed8', MDB: '#f59e0b', PSOL: '#a855f7',
  REPUBLICANOS: '#22c55e', PSD: '#3b82f6', UNIÃO: '#06b6d4', PP: '#f97316',
};

// ─── Estilos ──────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    backgroundColor: LIGHT_BG,
    color: DARK,
  },
  // Header band
  headerBand: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: HEADER_H,
    backgroundColor: BLUE_DARK,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: PAD_H,
    paddingVertical: 16,
  },
  badge: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: BLUE,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12, flexShrink: 0,
  },
  badgeText: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: WHITE },
  headerMeta: { flex: 1 },
  headerSup: { fontSize: 7, color: CYAN, fontFamily: 'Helvetica-Bold', letterSpacing: 1.5, marginBottom: 4 },
  headerTitle: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: WHITE, lineHeight: 1.25 },
  headerPills: { flexDirection: 'column', alignItems: 'flex-end', gap: 4 },
  pill: {
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4,
    paddingVertical: 3, paddingHorizontal: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  pillKey: { fontSize: 6.5, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.8 },
  pillVal: { fontSize: 7, color: WHITE, fontFamily: 'Helvetica-Bold' },

  // Content wrapper
  content: {
    position: 'absolute',
    top: CONTENT_Y + 16,
    left: PAD_H,
    right: PAD_H,
    bottom: FOOTER_H + 8,
  },

  // Columns
  row: { flexDirection: 'row', gap: 20 },
  col: { flex: 1 },
  dividerV: { width: 1, backgroundColor: BORDER, alignSelf: 'stretch' },

  // Section header
  secTitle: { fontSize: 7.5, color: GRAY, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },

  // White card
  card: {
    backgroundColor: WHITE, borderRadius: 8, padding: 14,
    borderWidth: 1, borderColor: BORDER,
  },

  // KPI row
  kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  kpiCard: {
    flex: 1, backgroundColor: WHITE, borderRadius: 8,
    padding: 10, borderWidth: 1, borderColor: BORDER,
  },
  kpiLabel: { fontSize: 7, color: GRAY, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  kpiValue: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: DARK },
  kpiSub:   { fontSize: 8, color: GRAY, marginTop: 2 },
  kpiGreen: { fontSize: 8, color: GREEN, marginTop: 2, fontFamily: 'Helvetica-Bold' },
  kpiRed:   { fontSize: 8, color: RED_C, marginTop: 2, fontFamily: 'Helvetica-Bold' },

  // Legend item
  legendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6, flexShrink: 0 },
  legendLabel: { fontSize: 8.5, color: '#334155', flex: 1 },
  legendPct:   { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: DARK, marginLeft: 4 },
  legendVal:   { fontSize: 7.5, color: GRAY, marginLeft: 4 },

  // Analysis box
  analysisBox: {
    backgroundColor: 'rgba(29,111,216,0.06)',
    borderRadius: 6, padding: 10,
    borderLeftWidth: 3, borderLeftColor: BLUE,
    marginTop: 10,
  },
  analysisTitle: { fontSize: 7, color: BLUE, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 },
  analysisText:  { fontSize: 8.5, lineHeight: 1.5, color: '#334155' },

  // Table
  tableHead:    { flexDirection: 'row', backgroundColor: BLUE, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  tableHeadCell:{ paddingVertical: 5, paddingHorizontal: 7, color: WHITE, fontSize: 7.5, fontFamily: 'Helvetica-Bold' },
  tableRow:     { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER },
  tableRowAlt:  { backgroundColor: LIGHT_BG },
  tableCell:    { paddingVertical: 4, paddingHorizontal: 7, fontSize: 8, color: '#334155' },
  tableCellBold:{ paddingVertical: 4, paddingHorizontal: 7, fontSize: 8, color: DARK, fontFamily: 'Helvetica-Bold' },

  // Footer
  footer: {
    position: 'absolute', bottom: 8, left: PAD_H, right: PAD_H,
    flexDirection: 'row', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 6,
  },
  footerText: { fontSize: 7, color: '#94a3b8' },

  // Paragraph
  p: { fontSize: 8.5, lineHeight: 1.5, color: '#334155', marginBottom: 4 },
  bullet: { flexDirection: 'row', marginBottom: 3 },
  bulletDot: { fontSize: 9, color: BLUE, marginRight: 5 },
  bulletText: { fontSize: 8.5, lineHeight: 1.4, color: '#334155', flex: 1 },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fp = (n: number) => parseFloat(n.toFixed(3)).toString();

function fmtNum(n: number, money = false): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const pfx = money ? 'R$ ' : '';
  if (abs >= 1_000_000_000) return `${sign}${pfx}${(abs / 1_000_000_000).toFixed(1).replace('.', ',')}B`;
  if (abs >= 1_000_000)     return `${sign}${pfx}${(abs / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (abs >= 1_000)         return `${sign}${pfx}${Math.round(abs / 1_000)}K`;
  return `${sign}${pfx}${abs.toLocaleString('pt-BR')}`;
}

function parseBrNum(s: string): number | null {
  const c = s.replace(/R\$\s*/g, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.').replace(/%/g, '').trim();
  const n = parseFloat(c);
  return isNaN(n) ? null : n;
}

// ─── SVG Donut chart ──────────────────────────────────────────────────────────

function donutSegment(
  cx: number, cy: number, R: number, r: number,
  sa: number, ea: number
): string {
  const x1o = cx + R * Math.cos(sa), y1o = cy + R * Math.sin(sa);
  const x2o = cx + R * Math.cos(ea), y2o = cy + R * Math.sin(ea);
  const x1i = cx + r * Math.cos(ea), y1i = cy + r * Math.sin(ea);
  const x2i = cx + r * Math.cos(sa), y2i = cy + r * Math.sin(sa);
  const lg = ea - sa > Math.PI ? 1 : 0;
  return `M${fp(x1o)} ${fp(y1o)} A${fp(R)} ${fp(R)} 0 ${lg} 1 ${fp(x2o)} ${fp(y2o)} L${fp(x1i)} ${fp(y1i)} A${fp(r)} ${fp(r)} 0 ${lg} 0 ${fp(x2i)} ${fp(y2i)}Z`;
}

function DonutSVG({ items, size = 150 }: { items: { valor: number; color?: string }[]; size?: number }): React.ReactNode {
  const total = items.reduce((s, it) => s + it.valor, 0);
  if (!total) return null;
  const cx = size / 2, cy = size / 2;
  const R = size * 0.42, r = size * 0.22;
  const GAP = items.length > 1 ? 0.018 : 0;
  let angle = -Math.PI / 2;

  const paths = items.map((item, i) => {
    const sweep = (item.valor / total) * 2 * Math.PI;
    const el = sweep > 0.01
      ? React.createElement(Path, { key: i, d: donutSegment(cx, cy, R, r, angle, angle + sweep - GAP), fill: item.color || PALETTE[i % PALETTE.length] })
      : null;
    angle += sweep;
    return el;
  }).filter(Boolean);

  return React.createElement(Svg, { width: size, height: size }, ...paths);
}

// ─── SVG Bar chart (vertical) ─────────────────────────────────────────────────

function BarSVG({
  items, barKeys, width, height,
}: {
  items: any[]; barKeys: string[]; width: number; height: number;
}): React.ReactNode {
  const n = Math.min(items.length, 10);
  const maxVal = Math.max(...items.slice(0, n).flatMap(it => barKeys.map(k => Number(it[k]) || 0)), 1);
  const groupW = width / n;
  const bw = Math.max(Math.floor((groupW - 6) / barKeys.length), 4);
  const els: React.ReactNode[] = [];

  // Grid lines
  [0.25, 0.5, 0.75, 1].forEach((r, gi) =>
    els.push(React.createElement(Line, { key: `g${gi}`, x1: 0, y1: height - r * height, x2: width, y2: height - r * height, stroke: BORDER, strokeWidth: 0.5 }))
  );

  items.slice(0, n).forEach((item, ri) => {
    const gx = ri * groupW + (groupW - bw * barKeys.length) / 2;
    barKeys.forEach((key, ki) => {
      const val = Number(item[key]) || 0;
      const bh = Math.max((val / maxVal) * height, 1);
      els.push(React.createElement(Rect, {
        key: `${ri}-${ki}`,
        x: gx + ki * bw, y: height - bh,
        width: bw - 1, height: bh,
        fill: PALETTE[ki % PALETTE.length], rx: 2,
      }));
    });
  });

  return React.createElement(Svg, { width, height }, ...els);
}

// ─── SVG Horizontal bars ──────────────────────────────────────────────────────

function HBarSVG({
  items, barKeys, width, rowHeight = 10, gap = 4,
}: {
  items: any[]; barKeys: string[]; width: number; rowHeight?: number; gap?: number;
}): React.ReactNode {
  const n = Math.min(items.length, 12);
  const maxVal = Math.max(...items.slice(0, n).flatMap(it => barKeys.map(k => Number(it[k]) || 0)), 1);
  const bh = Math.max(Math.floor((rowHeight - (barKeys.length - 1) * 2) / barKeys.length), 3);
  const totalH = n * (rowHeight + gap);
  const els: React.ReactNode[] = [];

  items.slice(0, n).forEach((item, ri) => {
    const baseY = ri * (rowHeight + gap);
    barKeys.forEach((key, ki) => {
      const val = Number(item[key]) || 0;
      const bw = Math.max((val / maxVal) * width, 1);
      els.push(React.createElement(Rect, {
        key: `${ri}-${ki}`,
        x: 0, y: baseY + ki * (bh + 2),
        width: bw, height: bh,
        fill: PALETTE[ki % PALETTE.length], rx: 2,
      }));
    });
  });

  return React.createElement(Svg, { width, height: totalH }, ...els);
}

// ─── Markdown parser (light) ──────────────────────────────────────────────────

type Block = { type: 'h'; text: string } | { type: 'p'; text: string } | { type: 'li'; text: string };

function parseBlocks(text: string): Block[] {
  return text.split('\n').map(line => {
    const t = line.trim();
    if (!t) return null;
    if (/^#{1,3}\s/.test(t)) return { type: 'h', text: t.replace(/^#+\s*/, '').replace(/\*\*/g, '') };
    if (/^[-*•]\s/.test(t)) return { type: 'li', text: t.replace(/^[-*•]\s*/, '').replace(/\*\*/g, '') };
    if (/^\d+[.)]\s/.test(t)) return { type: 'li', text: t.replace(/^\d+[.)]\s*/, '').replace(/\*\*/g, '') };
    return { type: 'p', text: t.replace(/\*\*/g, '') };
  }).filter(Boolean) as Block[];
}

function renderBlocks(text: string, maxChars = 800): React.ReactNode[] {
  const truncated = text.length > maxChars ? text.slice(0, maxChars) + '…' : text;
  return parseBlocks(truncated).slice(0, 12).map((block, i) => {
    if (block.type === 'h')
      return React.createElement(Text, { key: i, style: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: BLUE, marginBottom: 4, marginTop: 6 } }, block.text);
    if (block.type === 'li')
      return React.createElement(View, { key: i, style: S.bullet },
        React.createElement(Text, { style: S.bulletDot }, '·'),
        React.createElement(Text, { style: S.bulletText }, block.text),
      );
    return React.createElement(Text, { key: i, style: S.p }, block.text);
  });
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Vis { tipo: string; titulo?: string; dados: any }
interface ReportInput {
  titulo?: string;
  conteudo?: string;
  visualizacoes?: Vis[];
  tools?: string[];
}

// ─── Header band ─────────────────────────────────────────────────────────────

function HeaderBand({ titulo, tipo, geradoEm }: { titulo: string; tipo: string; geradoEm: string }) {
  return React.createElement(View, { style: S.headerBand },
    React.createElement(View, { style: S.badge }, React.createElement(Text, { style: S.badgeText }, 'G')),
    React.createElement(View, { style: S.headerMeta },
      React.createElement(Text, { style: S.headerSup }, 'Relatório preparado pela Gabi · AdminHub'),
      React.createElement(Text, { style: S.headerTitle }, titulo.length > 80 ? titulo.slice(0, 78) + '…' : titulo),
    ),
    React.createElement(View, { style: S.headerPills },
      React.createElement(View, { style: S.pill },
        React.createElement(Text, { style: S.pillKey }, 'Tipo: '),
        React.createElement(Text, { style: S.pillVal }, tipo),
      ),
      React.createElement(View, { style: S.pill },
        React.createElement(Text, { style: S.pillKey }, 'Emitido: '),
        React.createElement(Text, { style: S.pillVal }, geradoEm),
      ),
    ),
  );
}

// ─── LAYOUT: ELEITORAL ───────────────────────────────────────────────────────

function layoutEleitoral(vis: Vis[], conteudo: string): React.ReactNode {
  const donut  = vis.find(v => v.tipo === 'donut');
  const barras = vis.find(v => v.tipo === 'barras');

  const donutItems: { label: string; valor: number; color?: string }[] = donut?.dados?.itens ?? [];
  const barItems: any[] = barras?.dados?.itens ?? [];

  // Detect bar keys (candidates names)
  const barKeys: string[] = barItems.length
    ? Object.keys(barItems[0]).filter(k => k !== 'label' && k !== 'cor' && typeof barItems[0][k] === 'number')
    : [];

  const totalVotos = donutItems.reduce((s, it) => s + it.valor, 0);

  // Left column: donut + candidate legend
  const leftCol = React.createElement(View, { style: [S.col, { maxWidth: 270 }] },
    React.createElement(Text, { style: S.secTitle }, donut?.titulo || 'Distribuição'),
    React.createElement(View, { style: [S.card, { alignItems: 'flex-start' }] },

      // Donut chart
      React.createElement(View, { style: { alignItems: 'center', marginBottom: 12 } },
        DonutSVG({ items: donutItems, size: 150 }),
      ),

      // Legend / candidate table
      ...donutItems.map((item, i) => {
        const pct = totalVotos ? ((item.valor / totalVotos) * 100).toFixed(1) : '0';
        const color = item.color || PALETTE[i % PALETTE.length];
        return React.createElement(View, { key: i, style: S.legendRow },
          React.createElement(View, { style: [S.legendDot, { backgroundColor: color }] }),
          React.createElement(Text, { style: S.legendLabel }, item.label.length > 28 ? item.label.slice(0, 26) + '…' : item.label),
          React.createElement(Text, { style: S.legendPct }, `${pct}%`),
          React.createElement(Text, { style: S.legendVal }, fmtNum(item.valor)),
        );
      }),

      // Difference
      donutItems.length === 2 && React.createElement(View, {
        style: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: BORDER },
      },
        React.createElement(Text, { style: { fontSize: 7.5, color: GRAY } }, 'Diferença: '),
        React.createElement(Text, { style: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: DARK } },
          fmtNum(Math.abs(donutItems[0].valor - donutItems[1].valor)) + ' votos'
        ),
      ),
    ),
  );

  // Right column: bar chart (states/municipalities) + analysis
  const rightContent: React.ReactNode[] = [];

  if (barItems.length > 0 && barKeys.length > 0) {
    const CHART_W = 390;
    const CHART_H = barKeys.length > 1 ? 130 : 100;
    const n = Math.min(barItems.length, 8);

    rightContent.push(
      React.createElement(Text, { key: 'bt', style: S.secTitle }, barras?.titulo || 'Por Estado / Município'),
      React.createElement(View, { key: 'bc', style: S.card },
        BarSVG({ items: barItems, barKeys, width: CHART_W, height: CHART_H }),

        // X-axis labels
        React.createElement(View, { style: { flexDirection: 'row', marginTop: 3 } },
          ...barItems.slice(0, n).map((it: any, ri: number) =>
            React.createElement(View, { key: ri, style: { flex: 1, alignItems: 'center' } },
              React.createElement(Text, { style: { fontSize: 6, color: GRAY, textAlign: 'center' } },
                String(it.label || '').length > 10 ? String(it.label).slice(0, 9) + '…' : String(it.label || '')
              ),
            )
          ),
        ),

        // Legend
        barKeys.length > 1 && React.createElement(View, { style: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, gap: 10 } },
          ...barKeys.map((key, ki) =>
            React.createElement(View, { key: ki, style: { flexDirection: 'row', alignItems: 'center', gap: 4 } },
              React.createElement(View, { style: { width: 8, height: 8, borderRadius: 2, backgroundColor: PALETTE[ki % PALETTE.length] } }),
              React.createElement(Text, { style: { fontSize: 7.5, color: GRAY } }, key),
            )
          ),
        ),
      ),
    );
  }

  // Analysis text box
  if (conteudo) {
    const blocks = renderBlocks(conteudo, 600);
    rightContent.push(
      React.createElement(View, { key: 'box', style: [S.analysisBox, { marginTop: barItems.length ? 10 : 0 }] },
        React.createElement(Text, { style: S.analysisTitle }, 'Análise da Gabi'),
        ...blocks,
      ),
    );
  }

  const rightCol = React.createElement(View, { style: S.col }, ...rightContent);

  return React.createElement(View, { style: S.row }, leftCol, React.createElement(View, { style: S.dividerV }), rightCol);
}

// ─── LAYOUT: EMENDAS ─────────────────────────────────────────────────────────

function layoutEmendas(vis: Vis[], conteudo: string): React.ReactNode {
  const donut  = vis.find(v => v.tipo === 'donut');
  const barras = vis.find(v => v.tipo === 'barras');

  const donutItems: { label: string; valor: number }[] = donut?.dados?.itens ?? [];
  const barItems: any[]  = barras?.dados?.itens ?? [];
  const barKeys: string[] = barItems.length
    ? Object.keys(barItems[0]).filter(k => k !== 'label' && k !== 'cor' && typeof barItems[0][k] === 'number')
    : ['valor'];

  const total = donutItems.reduce((s, it) => s + it.valor, 0);

  // Left: donut by area
  const leftContent: React.ReactNode[] = [
    React.createElement(Text, { key: 'lt', style: S.secTitle }, donut?.titulo || 'Por Área'),
    React.createElement(View, { key: 'lc', style: S.card },
      React.createElement(View, { style: { alignItems: 'center', marginBottom: 10 } },
        DonutSVG({ items: donutItems, size: 120 }),
      ),
      ...donutItems.map((item, i) => {
        const pct = total ? ((item.valor / total) * 100).toFixed(1) : '0';
        const color = PALETTE[i % PALETTE.length];
        return React.createElement(View, { key: i, style: S.legendRow },
          React.createElement(View, { style: [S.legendDot, { backgroundColor: color }] }),
          React.createElement(Text, { style: [S.legendLabel, { fontSize: 8 }] }, item.label),
          React.createElement(Text, { style: S.legendPct }, `${pct}%`),
          React.createElement(Text, { style: S.legendVal }, fmtNum(item.valor, true)),
        );
      }),
    ),
  ];

  // Right: bar by municipality + analysis
  const rightContent: React.ReactNode[] = [];
  if (barItems.length > 0) {
    const CHART_W = 370;
    const CHART_H = 110;
    const n = Math.min(barItems.length, 8);
    rightContent.push(
      React.createElement(Text, { key: 'rt', style: S.secTitle }, barras?.titulo || 'Por Município / Parlamentar'),
      React.createElement(View, { key: 'rc', style: S.card },
        BarSVG({ items: barItems, barKeys, width: CHART_W, height: CHART_H }),
        React.createElement(View, { style: { flexDirection: 'row', marginTop: 3 } },
          ...barItems.slice(0, n).map((it: any, ri: number) =>
            React.createElement(View, { key: ri, style: { flex: 1, alignItems: 'center' } },
              React.createElement(Text, { style: { fontSize: 6, color: GRAY, textAlign: 'center' } },
                String(it.label || '').length > 10 ? String(it.label).slice(0, 9) + '…' : String(it.label || '')
              ),
            )
          ),
        ),
      ),
    );
  }

  if (conteudo) {
    rightContent.push(
      React.createElement(View, { key: 'box', style: S.analysisBox },
        React.createElement(Text, { style: S.analysisTitle }, 'Análise da Gabi'),
        ...renderBlocks(conteudo, 500),
      ),
    );
  }

  const leftCol  = React.createElement(View, { style: [S.col, { maxWidth: 260 }] }, ...leftContent);
  const rightCol = React.createElement(View, { style: S.col }, ...rightContent);

  return React.createElement(View, { style: S.row }, leftCol, React.createElement(View, { style: S.dividerV }), rightCol);
}

// ─── LAYOUT: DEMANDAS ────────────────────────────────────────────────────────

function layoutDemandas(vis: Vis[], conteudo: string): React.ReactNode {
  const donut = vis.find(v => v.tipo === 'donut');
  const donutItems: { label: string; valor: number }[] = donut?.dados?.itens ?? [];
  const total = donutItems.reduce((s, it) => s + it.valor, 0);

  const STATUS_COLOR: Record<string, string> = {
    PENDENTE: AMBER, RESOLVIDA: GREEN, CANCELADA: '#94a3b8', EM_ANDAMENTO: BLUE,
  };

  const left = React.createElement(View, { style: [S.col, { maxWidth: 240 }] },
    React.createElement(Text, { style: S.secTitle }, 'Status das Demandas'),
    React.createElement(View, { style: S.card },
      React.createElement(View, { style: { alignItems: 'center', marginBottom: 10 } },
        DonutSVG({
          items: donutItems.map((it, i) => ({ ...it, color: STATUS_COLOR[it.label] || PALETTE[i % PALETTE.length] })),
          size: 120,
        }),
      ),
      ...donutItems.map((item, i) => {
        const pct = total ? ((item.valor / total) * 100).toFixed(1) : '0';
        const color = STATUS_COLOR[item.label] || PALETTE[i % PALETTE.length];
        return React.createElement(View, { key: i, style: S.legendRow },
          React.createElement(View, { style: [S.legendDot, { backgroundColor: color }] }),
          React.createElement(Text, { style: S.legendLabel }, item.label),
          React.createElement(Text, { style: S.legendPct }, `${pct}%`),
          React.createElement(Text, { style: [S.legendVal, { fontFamily: 'Helvetica-Bold', color: DARK }] }, `${item.valor}`),
        );
      }),
    ),
  );

  const right = React.createElement(View, { style: S.col },
    React.createElement(Text, { style: S.secTitle }, 'Análise'),
    conteudo
      ? React.createElement(View, { style: S.analysisBox },
          React.createElement(Text, { style: S.analysisTitle }, 'Resumo da Gabi'),
          ...renderBlocks(conteudo, 700),
        )
      : null,
  );

  return React.createElement(View, { style: S.row }, left, React.createElement(View, { style: S.dividerV }), right);
}

// ─── LAYOUT: GENÉRICO ────────────────────────────────────────────────────────

function layoutGenerico(vis: Vis[], conteudo: string): React.ReactNode {
  const donut  = vis.find(v => v.tipo === 'donut');
  const barras = vis.find(v => v.tipo === 'barras');

  const sections: React.ReactNode[] = [];

  if (donut?.dados?.itens?.length) {
    const items = donut.dados.itens;
    const t = items.reduce((s: number, it: any) => s + it.valor, 0);
    sections.push(
      React.createElement(View, { key: 'donut', style: [S.row, { marginBottom: 14 }] },
        React.createElement(View, { style: { marginRight: 16 } }, DonutSVG({ items, size: 120 })),
        React.createElement(View, { style: { flex: 1, paddingTop: 8 } },
          React.createElement(Text, { style: [S.secTitle, { marginBottom: 10 }] }, donut.titulo || 'Distribuição'),
          ...items.map((item: any, i: number) => {
            const pct = t ? ((item.valor / t) * 100).toFixed(1) : '0';
            return React.createElement(View, { key: i, style: S.legendRow },
              React.createElement(View, { style: [S.legendDot, { backgroundColor: PALETTE[i % PALETTE.length] }] }),
              React.createElement(Text, { style: S.legendLabel }, item.label),
              React.createElement(Text, { style: S.legendPct }, `${pct}%`),
            );
          }),
        ),
      ),
    );
  }

  if (barras?.dados?.itens?.length) {
    const items = barras.dados.itens;
    const barKeys = Object.keys(items[0]).filter(k => k !== 'label' && k !== 'cor' && typeof items[0][k] === 'number');
    const n = Math.min(items.length, 8);
    sections.push(
      React.createElement(View, { key: 'bars', style: S.card },
        React.createElement(Text, { style: [S.secTitle, { marginBottom: 8 }] }, barras.titulo || 'Dados'),
        BarSVG({ items, barKeys, width: 740, height: 100 }),
        React.createElement(View, { style: { flexDirection: 'row', marginTop: 3 } },
          ...items.slice(0, n).map((it: any, ri: number) =>
            React.createElement(View, { key: ri, style: { flex: 1, alignItems: 'center' } },
              React.createElement(Text, { style: { fontSize: 6, color: GRAY } },
                String(it.label || '').slice(0, 10)
              ),
            )
          ),
        ),
      ),
    );
  }

  if (conteudo) {
    sections.push(
      React.createElement(View, { key: 'analysis', style: [S.analysisBox, { marginTop: 10 }] },
        React.createElement(Text, { style: S.analysisTitle }, 'Análise da Gabi'),
        ...renderBlocks(conteudo, 800),
      ),
    );
  }

  return React.createElement(View, null, ...sections);
}

// ─── Documento principal ──────────────────────────────────────────────────────

function RelatorioPDF({ input, geradoEm }: { input: ReportInput; geradoEm: string }) {
  const { titulo = 'Relatório', conteudo = '', visualizacoes = [], tools = [] } = input;

  const isEleitoral = tools.includes('buscar_votacao');
  const isEmendas   = tools.includes('buscar_emendas') || tools.includes('comparar_parlamentares');
  const isDemandas  = tools.includes('buscar_demandas');

  const tipoLabel = isEleitoral ? 'Eleitoral' : isEmendas ? 'Emendas' : isDemandas ? 'Demandas' : 'Análise';

  let mainContent: React.ReactNode;
  if (isEleitoral) mainContent = layoutEleitoral(visualizacoes, conteudo);
  else if (isEmendas) mainContent = layoutEmendas(visualizacoes, conteudo);
  else if (isDemandas) mainContent = layoutDemandas(visualizacoes, conteudo);
  else mainContent = layoutGenerico(visualizacoes, conteudo);

  const reportTitle = titulo || conteudo.split('\n')[0]?.slice(0, 80) || 'Relatório de Dados';

  return React.createElement(Document, null,
    React.createElement(Page, { size: [W, H], style: S.page },

      // Header band
      HeaderBand({ titulo: reportTitle, tipo: tipoLabel, geradoEm }),

      // Content
      React.createElement(View, { style: S.content }, mainContent),

      // Footer
      React.createElement(View, { style: S.footer, fixed: true },
        React.createElement(Text, { style: S.footerText }, 'AdminHub — Gabi IA · Gerado por Inteligência Artificial, verifique as informações'),
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

    const body: ReportInput = await request.json();

    const geradoEm = new Date().toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const pdfBuffer = await renderToBuffer(
      React.createElement(RelatorioPDF, { input: body, geradoEm }) as any
    );

    return new NextResponse(pdfBuffer, {
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
