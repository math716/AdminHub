export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import {
  Document, Page, Text, View, StyleSheet, renderToBuffer,
  Svg, Path, Rect, Line,
} from '@react-pdf/renderer';
import React from 'react';
import { prisma } from '@/lib/db';
import DashboardReport from '@/components/pdf/dashboard-report';
import { buildDemandasStats } from '@/lib/reports/demandas-stats';
import { renderMapaEleitoral, renderMapaEmendas, type MapaResult } from '@/lib/agent/report/geo-map';
import fs from 'fs';
import path from 'path';

// ─── Dimensões (A4 Landscape: 841.89 × 595.28 pt) ───────────────────────────

const W = 841.89;
const H = 595.28;
const PAD_H = 34;
const HEADER_H = 86;
const FOOTER_H = 28;
const CONTENT_Y = HEADER_H;

// ─── Paleta ───────────────────────────────────────────────────────────────────

const BLUE      = '#1d6fd8';
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

const AREA_LABEL: Record<string, string> = {
  SAUDE: 'Saúde', EDUCACAO: 'Educação', SEGURANCA: 'Segurança', INFRAESTRUTURA: 'Infraestrutura',
  ASSISTENCIA_SOCIAL: 'Assistência Social', AGRICULTURA: 'Agricultura', CULTURA: 'Cultura',
  ESPORTE: 'Esporte', MEIO_AMBIENTE: 'Meio Ambiente', TRANSPORTE: 'Transporte',
  HABITACAO: 'Habitação', SANEAMENTO: 'Saneamento', OUTROS: 'Outros',
};

// ─── Estilos ──────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: { fontFamily: 'Helvetica', backgroundColor: LIGHT_BG, color: DARK },

  headerBand: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: HEADER_H, backgroundColor: BLUE_DARK,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: PAD_H, paddingVertical: 16,
  },
  badge: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: BLUE,
    alignItems: 'center', justifyContent: 'center', marginRight: 12, flexShrink: 0,
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

  content: {
    position: 'absolute', top: CONTENT_Y + 16, left: PAD_H, right: PAD_H, bottom: FOOTER_H + 8,
  },

  row: { flexDirection: 'row', gap: 16 },
  col: { flex: 1 },
  dividerV: { width: 1, backgroundColor: BORDER, alignSelf: 'stretch' },

  secTitle: { fontSize: 7.5, color: GRAY, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },

  card: { backgroundColor: WHITE, borderRadius: 8, padding: 14, borderWidth: 1, borderColor: BORDER },

  kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  kpiCard: { flex: 1, backgroundColor: WHITE, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: BORDER },
  kpiLabel: { fontSize: 6.5, color: GRAY, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  kpiValue: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: DARK },
  kpiSub:   { fontSize: 7.5, color: GRAY, marginTop: 2 },
  kpiGreen: { fontSize: 7.5, color: GREEN, marginTop: 2, fontFamily: 'Helvetica-Bold' },

  legendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, width: '100%' },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6, flexShrink: 0 },
  legendLabel: { fontSize: 8.5, color: '#334155', flex: 1 },
  legendPct:   { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: DARK, marginLeft: 4 },
  legendVal:   { fontSize: 7.5, color: GRAY, marginLeft: 4 },

  analysisBox: {
    backgroundColor: 'rgba(29,111,216,0.06)', borderRadius: 6, padding: 10,
    borderLeftWidth: 3, borderLeftColor: BLUE, marginTop: 10,
  },
  analysisTitle: { fontSize: 7, color: BLUE, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 },

  tableHead:    { flexDirection: 'row', backgroundColor: BLUE, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  tableHeadCell:{ paddingVertical: 5, paddingHorizontal: 6, color: WHITE, fontSize: 7, fontFamily: 'Helvetica-Bold' },
  tableRow:     { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER },
  tableRowAlt:  { backgroundColor: LIGHT_BG },
  tableCell:    { paddingVertical: 4, paddingHorizontal: 6, fontSize: 7.5, color: '#334155' },
  tableCellBold:{ paddingVertical: 4, paddingHorizontal: 6, fontSize: 7.5, color: DARK, fontFamily: 'Helvetica-Bold' },
  execBadge:    { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1.5 },
  execBadgeTxt: { fontSize: 6.5, fontFamily: 'Helvetica-Bold' },

  footer: {
    position: 'absolute', bottom: 8, left: PAD_H, right: PAD_H,
    flexDirection: 'row', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 6,
  },
  footerText: { fontSize: 7, color: '#94a3b8' },

  p: { fontSize: 8.5, lineHeight: 1.5, color: '#334155', marginBottom: 4 },
  bullet: { flexDirection: 'row', marginBottom: 3 },
  bulletDot: { fontSize: 9, color: BLUE, marginRight: 5 },
  bulletText: { fontSize: 8.5, lineHeight: 1.4, color: '#334155', flex: 1 },

  chartLegendRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, gap: 8 },
  chartLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});

// ─── Helpers numéricos / texto ─────────────────────────────────────────────────

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

function stripEmoji(s: string): string {
  return s
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/[\u{1F000}-\u{1F02F}]/gu, '')
    .replace(/[\u{2600}-\u{27FF}]/gu, '')
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
    .replace(/�/g, '')
    .trim();
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

// ─── SVG Donut ──────────────────────────────────────────────────────────────

function donutSegment(cx: number, cy: number, R: number, r: number, sa: number, ea: number): string {
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

// ─── SVG Bar chart (vertical, agrupado) ───────────────────────────────────────

function BarSVG({ items, barKeys, width, height, colors }: {
  items: any[]; barKeys: string[]; width: number; height: number; colors?: string[];
}): React.ReactNode {
  const pal = colors ?? PALETTE;
  const n = Math.min(items.length, 10);
  const maxVal = Math.max(...items.slice(0, n).flatMap(it => barKeys.map(k => Number(it[k]) || 0)), 1);
  const groupW = width / n;
  const bw = Math.max(Math.floor((groupW - 6) / barKeys.length), 4);
  const els: React.ReactNode[] = [];

  [0.25, 0.5, 0.75, 1].forEach((rr, gi) =>
    els.push(React.createElement(Line, { key: `g${gi}`, x1: 0, y1: height - rr * height, x2: width, y2: height - rr * height, stroke: BORDER, strokeWidth: 0.5 })),
  );

  items.slice(0, n).forEach((item, ri) => {
    const gx = ri * groupW + (groupW - bw * barKeys.length) / 2;
    barKeys.forEach((key, ki) => {
      const val = Number(item[key]) || 0;
      const bh = Math.max((val / maxVal) * height, 1);
      els.push(React.createElement(Rect, {
        key: `${ri}-${ki}`, x: gx + ki * bw, y: height - bh,
        width: bw - 1, height: bh, fill: pal[ki % pal.length], rx: 2,
      }));
    });
  });

  return React.createElement(Svg, { width, height }, ...els);
}

// X-axis labels alinhados às barras
function xLabels(items: any[], max = 8): React.ReactNode {
  const n = Math.min(items.length, max);
  return React.createElement(View, { style: { flexDirection: 'row', marginTop: 3 } },
    ...items.slice(0, n).map((it: any, ri: number) =>
      React.createElement(View, { key: ri, style: { flex: 1, alignItems: 'center' } },
        React.createElement(Text, { style: { fontSize: 6, color: GRAY, textAlign: 'center' } },
          clip(String(it.label || ''), 10)),
      )),
  );
}

// ─── Markdown leve ─────────────────────────────────────────────────────────────

type Block = { type: 'h'; text: string } | { type: 'p'; text: string } | { type: 'li'; text: string };

function parseBlocks(text: string): Block[] {
  return text.split('\n').map(line => {
    const t = line.trim();
    if (!t) return null;
    if (t.startsWith('|')) return null;
    if (/^[-=*_]{3,}$/.test(t)) return null;
    if (/^#{1,3}\s/.test(t)) {
      const c = stripEmoji(t.replace(/^#+\s*/, '').replace(/\*\*/g, '')).trim();
      return c ? { type: 'h', text: c } : null;
    }
    if (/^[-*•]\s/.test(t)) {
      const c = stripEmoji(t.replace(/^[-*•]\s*/, '').replace(/\*\*/g, '')).trim();
      return c ? { type: 'li', text: c } : null;
    }
    if (/^\d+[.)]\s/.test(t)) {
      const c = stripEmoji(t.replace(/^\d+[.)]\s*/, '').replace(/\*\*/g, '')).trim();
      return c ? { type: 'li', text: c } : null;
    }
    const c = stripEmoji(t.replace(/\*\*/g, '')).trim();
    return c ? { type: 'p', text: c } : null;
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
        React.createElement(Text, { style: S.bulletText }, block.text));
    return React.createElement(Text, { key: i, style: S.p }, block.text);
  });
}

function AnalysisBox({ conteudo, maxChars = 600, titulo = 'Análise da Gabi' }: { conteudo: string; maxChars?: number; titulo?: string }) {
  return React.createElement(View, { style: S.analysisBox },
    React.createElement(Text, { style: S.analysisTitle }, titulo),
    ...renderBlocks(conteudo, maxChars));
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Vis { tipo: string; titulo?: string; dados: any }
interface ReportInput {
  titulo?: string;
  conteudo?: string;
  visualizacoes?: Vis[];
  tools?: string[];
  dadosBrutos?: Record<string, any>;
}

// ─── Header band ─────────────────────────────────────────────────────────────

function HeaderBand({ titulo, tipo, geradoEm }: { titulo: string; tipo: string; geradoEm: string }) {
  return React.createElement(View, { style: S.headerBand },
    React.createElement(View, { style: S.badge }, React.createElement(Text, { style: S.badgeText }, 'G')),
    React.createElement(View, { style: S.headerMeta },
      React.createElement(Text, { style: S.headerSup }, 'Relatório preparado pela Gabi · AdminHub'),
      React.createElement(Text, { style: S.headerTitle }, clip(stripEmoji(titulo), 80)),
    ),
    React.createElement(View, { style: S.headerPills },
      React.createElement(View, { style: S.pill },
        React.createElement(Text, { style: S.pillKey }, 'Tipo: '),
        React.createElement(Text, { style: S.pillVal }, tipo)),
      React.createElement(View, { style: S.pill },
        React.createElement(Text, { style: S.pillKey }, 'Emitido: '),
        React.createElement(Text, { style: S.pillVal }, geradoEm)),
    ),
  );
}

// ─── Resumo de emendas (a partir de dadosBrutos.buscar_emendas) ──────────────

function resumoEmendas(emendas: any[]) {
  const anos = [...new Set(emendas.map(e => Number(e.ano)).filter(Boolean))].sort((a, b) => a - b);
  const ano = anos.length ? anos[anos.length - 1] : undefined;
  const subset = ano ? emendas.filter(e => Number(e.ano) === ano) : emendas;

  const totalEmp = subset.reduce((s, e) => s + (e.valorEmpenhado || 0), 0);
  const totalPago = subset.reduce((s, e) => s + (e.valorPago || 0), 0);
  const exec = totalEmp > 0 ? Math.round((totalPago / totalEmp) * 100) : 0;
  const municipios = new Set(subset.map(e => e.municipio).filter(Boolean)).size;

  // por área (valor empenhado)
  const areaMap: Record<string, number> = {};
  subset.forEach(e => { areaMap[e.area] = (areaMap[e.area] || 0) + (e.valorEmpenhado || 0); });
  const areaItems = Object.entries(areaMap)
    .map(([area, valor]) => ({ label: AREA_LABEL[area] || area, valor }))
    .sort((a, b) => b.valor - a.valor);
  const topAreaLabel = areaItems[0]?.label ?? '—';
  const topAreaPct = totalEmp > 0 && areaItems[0] ? Math.round((areaItems[0].valor / totalEmp) * 100) : 0;

  // evolução anual (empenhado por ano)
  const evolucao = anos.map(a => ({
    label: String(a),
    valor: emendas.filter(e => Number(e.ano) === a).reduce((s, e) => s + (e.valorEmpenhado || 0), 0),
  }));

  // variação vs primeiro ano
  let variacao: number | null = null;
  if (evolucao.length >= 2 && evolucao[0].valor > 0) {
    variacao = Math.round(((evolucao[evolucao.length - 1].valor - evolucao[0].valor) / evolucao[0].valor) * 100);
  }

  // favorecidos (top por empenhado)
  const favorecidos = [...subset]
    .sort((a, b) => (b.valorEmpenhado || 0) - (a.valorEmpenhado || 0))
    .slice(0, 6)
    .map(e => ({
      favorecido: e.objeto || e.parlamentar || '—',
      municipio: e.municipio || '—',
      empenhado: e.valorEmpenhado || 0,
      exec: e.execucao ?? 0,
    }));

  return { ano, anos, totalEmp, totalPago, exec, municipios, areaItems, topAreaLabel, topAreaPct, evolucao, variacao, favorecidos };
}

// ─── LAYOUT: EMENDAS ─────────────────────────────────────────────────────────

function topGrupos(emendas: any[], chave: (e: any) => string, limite = 5): { label: string; valor: number }[] {
  const acc: Record<string, number> = {};
  emendas.forEach(e => {
    const k = (chave(e) || '').trim();
    if (!k) return;
    acc[k] = (acc[k] ?? 0) + (e.valorEmpenhado || 0);
  });
  return Object.entries(acc)
    .map(([label, valor]) => ({ label, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, limite);
}

function TopPanel({ titulo, itens, cor }: { titulo: string; itens: { label: string; valor: number }[]; cor: string }): React.ReactNode {
  return React.createElement(View, { style: { marginBottom: 12 } },
    React.createElement(Text, { style: S.secTitle }, titulo),
    React.createElement(View, { style: S.card },
      ...(itens.length ? itens.map((it, i) =>
        React.createElement(View, { key: i, style: { flexDirection: 'row', alignItems: 'center', marginBottom: i === itens.length - 1 ? 0 : 6, width: '100%' } },
          React.createElement(Text, { style: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: GRAY, width: 14 } }, `${i + 1}.`),
          React.createElement(Text, { style: { fontSize: 8.5, color: '#334155', flex: 1 } }, clip(it.label, 20)),
          React.createElement(Text, { style: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: cor, marginLeft: 4 } }, fmtNum(it.valor, true)),
        ),
      ) : [React.createElement(Text, { key: 'e', style: { fontSize: 8, color: GRAY } }, 'Sem dados')]),
    ),
  );
}

function layoutEmendas(input: ReportInput, mapa: MapaResult | null): React.ReactNode {
  const conteudo = input.conteudo ?? '';
  const emendas: any[] = input.dadosBrutos?.buscar_emendas?.emendas ?? [];

  // Fallback: sem dados brutos → usa visualizações (donut/barras) de forma simples
  if (emendas.length === 0) {
    return layoutGenerico(input.visualizacoes ?? [], conteudo);
  }

  const R = resumoEmendas(emendas);
  const totalArea = R.areaItems.reduce((s, it) => s + it.valor, 0);

  // ── KPIs (faixa compacta) ──
  const kpis = [
    { label: `Total em ${R.ano ?? ''}`.trim(), value: fmtNum(R.totalEmp, true), sub: R.variacao != null ? `${R.variacao >= 0 ? '▲ +' : '▼ '}${R.variacao}% vs ${R.anos[0]}` : '', green: R.variacao != null && R.variacao >= 0 },
    { label: 'Valor pago', value: fmtNum(R.totalPago, true), sub: `${R.exec}% de execução`, green: false },
    { label: 'Municípios', value: String(R.municipios), sub: '', green: false },
    { label: `Concentração em ${clip(R.topAreaLabel, 14)}`, value: `${R.topAreaPct}%`, sub: 'da carteira', green: false },
  ];
  const kpiRow = React.createElement(View, { style: S.kpiRow },
    ...kpis.map((k, i) => React.createElement(View, { key: i, style: [S.kpiCard, { borderLeftWidth: 3, borderLeftColor: PALETTE[i % PALETTE.length] }] },
      React.createElement(Text, { style: S.kpiLabel }, k.label),
      React.createElement(Text, { style: S.kpiValue }, k.value),
      k.sub ? React.createElement(Text, { style: k.green ? S.kpiGreen : S.kpiSub }, k.sub) : null,
    )),
  );

  // ── Coluna 1 — donut por área + análise ──
  const donutCol = React.createElement(View, { style: [S.col, { maxWidth: 218 }] },
    React.createElement(Text, { style: S.secTitle }, 'Emendas por área'),
    React.createElement(View, { style: S.card },
      React.createElement(View, { style: { alignItems: 'center', marginBottom: 10 } }, DonutSVG({ items: R.areaItems, size: 118 })),
      ...R.areaItems.slice(0, 6).map((item, i) => {
        const pct = totalArea ? ((item.valor / totalArea) * 100).toFixed(1) : '0';
        return React.createElement(View, { key: i, style: S.legendRow },
          React.createElement(View, { style: [S.legendDot, { backgroundColor: PALETTE[i % PALETTE.length] }] }),
          React.createElement(Text, { style: S.legendLabel }, clip(item.label, 16)),
          React.createElement(Text, { style: S.legendPct }, `${pct}%`),
          React.createElement(Text, { style: S.legendVal }, fmtNum(item.valor, true)),
        );
      }),
    ),
  );

  // ── Coluna 2 — mapa do estado (heatmap por valor) ──
  const mapCol = mapa ? React.createElement(View, { style: [S.col, { maxWidth: 288 }] },
    React.createElement(Text, { style: S.secTitle }, 'Emendas por município'),
    React.createElement(View, { style: [S.card, { alignItems: 'center' }] },
      React.createElement(Svg, { width: mapa.width, height: mapa.height },
        ...mapa.paths.map((p, i) => React.createElement(Path, { key: i, d: p.d, fill: p.fill, stroke: WHITE, strokeWidth: 0.3 })),
      ),
      mapa.legend.length > 0 ? React.createElement(View, { style: S.chartLegendRow },
        ...mapa.legend.map((l, i) => React.createElement(View, { key: i, style: S.chartLegendItem },
          React.createElement(View, { style: { width: 8, height: 8, borderRadius: 2, backgroundColor: l.cor } }),
          React.createElement(Text, { style: { fontSize: 6.5, color: GRAY } }, l.partido),
        )),
      ) : null,
    ),
  ) : null;

  // ── Coluna 3 — Top 5 municípios + Top 5 parlamentares ──
  const topMuni = topGrupos(emendas, e => e.municipio);
  const topParl = topGrupos(emendas, e => e.parlamentar);
  const rightCol = React.createElement(View, { style: [S.col, { maxWidth: 230 }] },
    TopPanel({ titulo: 'Top 5 municípios', itens: topMuni, cor: BLUE }),
    TopPanel({ titulo: 'Top 5 parlamentares', itens: topParl, cor: BLUE }),
    conteudo ? AnalysisBox({ conteudo, maxChars: 300 }) : null,
  );

  const cols: React.ReactNode[] = [donutCol];
  if (mapCol) { cols.push(React.createElement(View, { style: S.dividerV }), mapCol); }
  cols.push(React.createElement(View, { style: S.dividerV }), rightCol);

  const body = React.createElement(View, { style: S.row }, ...cols);
  return React.createElement(View, null, kpiRow, body);
}

// ─── LAYOUT: ELEITORAL ───────────────────────────────────────────────────────

function layoutEleitoral(input: ReportInput, mapa: MapaResult | null): React.ReactNode {
  const vis = input.visualizacoes ?? [];
  const conteudo = input.conteudo ?? '';
  const donut  = vis.find(v => v.tipo === 'donut');
  const barras = vis.find(v => v.tipo === 'barras');

  const donutItems: { label: string; valor: number; color?: string }[] = donut?.dados?.itens ?? [];
  const barItems: any[] = barras?.dados?.itens ?? [];
  const barKeys: string[] = barItems.length
    ? Object.keys(barItems[0]).filter(k => k !== 'label' && k !== 'cor' && typeof barItems[0][k] === 'number')
    : [];

  const totalVotos = donutItems.reduce((s, it) => s + it.valor, 0);
  const candidatos: any[] = input.dadosBrutos?.buscar_votacao?.candidatos ?? [];
  const situacaoDe = (label: string) =>
    candidatos.find(c => stripEmoji(label).toLowerCase().includes((c.nomeUrna || c.nome || '').toLowerCase().split(' ')[0]))?.situacao;

  // ── Coluna donut + legenda ──
  const donutCol = React.createElement(View, { style: [S.col, { maxWidth: 218 }] },
    React.createElement(Text, { style: S.secTitle }, donut?.titulo || 'Distribuição de votos'),
    React.createElement(View, { style: S.card },
      React.createElement(View, { style: { alignItems: 'center', marginBottom: 12 } }, DonutSVG({ items: donutItems, size: 126 })),
      ...donutItems.map((item, i) => {
        const pct = totalVotos ? ((item.valor / totalVotos) * 100).toFixed(1) : '0';
        const color = item.color || PALETTE[i % PALETTE.length];
        const sit = situacaoDe(item.label);
        return React.createElement(View, { key: i, style: { marginBottom: 6 } },
          React.createElement(View, { style: S.legendRow },
            React.createElement(View, { style: [S.legendDot, { backgroundColor: color }] }),
            React.createElement(Text, { style: S.legendLabel }, clip(stripEmoji(item.label), 20)),
            React.createElement(Text, { style: S.legendPct }, `${pct}%`),
            React.createElement(Text, { style: S.legendVal }, fmtNum(item.valor)),
          ),
          sit ? React.createElement(Text, { style: { fontSize: 6.5, color: GREEN, marginLeft: 14, fontFamily: 'Helvetica-Bold' } }, String(sit)) : null,
        );
      }),
      donutItems.length === 2 ? React.createElement(View, { style: { marginTop: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: BORDER } },
        React.createElement(Text, { style: { fontSize: 7.5, color: GRAY } }, 'Diferença'),
        React.createElement(Text, { style: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: DARK } },
          fmtNum(Math.abs(donutItems[0].valor - donutItems[1].valor)) + ' votos'),
      ) : null,
    ),
  );

  // ── Coluna mapa (se disponível) ──
  const mapCol = mapa ? React.createElement(View, { style: [S.col, { maxWidth: 288 }] },
    React.createElement(Text, { style: S.secTitle }, 'Mapa — vencedor por região'),
    React.createElement(View, { style: [S.card, { alignItems: 'center' }] },
      React.createElement(Svg, { width: mapa.width, height: mapa.height },
        ...mapa.paths.map((p, i) => React.createElement(Path, { key: i, d: p.d, fill: p.fill, stroke: WHITE, strokeWidth: 0.3 })),
      ),
      mapa.legend.length > 0 ? React.createElement(View, { style: S.chartLegendRow },
        ...mapa.legend.map((l, i) => React.createElement(View, { key: i, style: S.chartLegendItem },
          React.createElement(View, { style: { width: 8, height: 8, borderRadius: 2, backgroundColor: l.cor } }),
          React.createElement(Text, { style: { fontSize: 7, color: GRAY } }, l.partido),
        )),
      ) : null,
    ),
  ) : null;

  // ── Coluna barras + análise ──
  const rightContent: React.ReactNode[] = [];
  if (barItems.length > 0 && barKeys.length > 0) {
    const CHART_W = mapa ? 185 : 390;
    const CHART_H = barKeys.length > 1 ? 120 : 100;
    rightContent.push(
      React.createElement(Text, { key: 'bt', style: S.secTitle }, barras?.titulo || 'Top municípios'),
      React.createElement(View, { key: 'bc', style: S.card },
        BarSVG({ items: barItems, barKeys, width: CHART_W, height: CHART_H }),
        xLabels(barItems),
        barKeys.length > 1 ? React.createElement(View, { style: S.chartLegendRow },
          ...barKeys.map((key, ki) => React.createElement(View, { key: ki, style: S.chartLegendItem },
            React.createElement(View, { style: { width: 8, height: 8, borderRadius: 2, backgroundColor: PALETTE[ki % PALETTE.length] } }),
            React.createElement(Text, { style: { fontSize: 7.5, color: GRAY } }, key),
          )),
        ) : null,
      ),
    );
  }
  if (conteudo) rightContent.push(React.createElement(View, { key: 'ab', style: { marginTop: barItems.length ? 10 : 0 } }, AnalysisBox({ conteudo, maxChars: mapa ? 400 : 600 })));
  const rightCol = React.createElement(View, { style: S.col }, ...rightContent);

  const cols: React.ReactNode[] = [donutCol];
  if (mapCol) { cols.push(React.createElement(View, { style: S.dividerV }), mapCol); }
  cols.push(React.createElement(View, { style: S.dividerV }), rightCol);

  return React.createElement(View, { style: S.row }, ...cols);
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
              React.createElement(Text, { style: S.legendLabel }, clip(String(item.label), 28)),
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
    sections.push(
      React.createElement(View, { key: 'bars', style: S.card },
        React.createElement(Text, { style: [S.secTitle, { marginBottom: 8 }] }, barras.titulo || 'Dados'),
        BarSVG({ items, barKeys: barKeys.length ? barKeys : ['valor'], width: 740, height: 100 }),
        xLabels(items),
      ),
    );
  }

  if (conteudo) sections.push(React.createElement(View, { key: 'analysis', style: { marginTop: 10 } }, AnalysisBox({ conteudo, maxChars: 800 })));

  return React.createElement(View, null, ...sections);
}

// ─── Documento principal ──────────────────────────────────────────────────────

function RelatorioPDF({ input, geradoEm, tipoLabel, mapa }: {
  input: ReportInput; geradoEm: string; tipoLabel: string; mapa: MapaResult | null;
}) {
  const { titulo = 'Relatório', conteudo = '', tools = [] } = input;
  const isEleitoral = tools.includes('buscar_votacao');
  const isEmendas   = tools.includes('buscar_emendas') || tools.includes('comparar_parlamentares');

  let mainContent: React.ReactNode;
  if (isEleitoral) mainContent = layoutEleitoral(input, mapa);
  else if (isEmendas) mainContent = layoutEmendas(input, mapa);
  else mainContent = layoutGenerico(input.visualizacoes ?? [], conteudo);

  const reportTitle = titulo || conteudo.split('\n')[0]?.slice(0, 80) || 'Relatório de Dados';

  return React.createElement(Document, null,
    React.createElement(Page, { size: [W, H], style: S.page },
      HeaderBand({ titulo: reportTitle, tipo: tipoLabel, geradoEm }),
      React.createElement(View, { style: S.content }, mainContent),
      React.createElement(View, { style: S.footer, fixed: true },
        React.createElement(Text, { style: S.footerText }, 'AdminHub — Gabi IA · Gerado por Inteligência Artificial, verifique as informações'),
        React.createElement(Text, { style: S.footerText, render: ({ pageNumber, totalPages }: any) => `Pág. ${pageNumber} / ${totalPages}` }),
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
    const tools = body.tools ?? [];

    const isEleitoral = tools.includes('buscar_votacao');
    const isEmendas   = tools.includes('buscar_emendas') || tools.includes('comparar_parlamentares');
    const isDemandas  = tools.includes('buscar_demandas');

    const geradoEm = new Date().toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    // ── DEMANDAS → reaproveita o relatório do dashboard ──
    if (isDemandas && !isEleitoral && !isEmendas) {
      const gabineteId = (session.user as any)?.gabineteId as string | null;
      if (gabineteId) {
        const dbUser = await prisma.user.findUnique({
          where: { id: (session.user as any).id },
          select: { gabinete: { select: { nome: true } } },
        });
        const gabineteName = (dbUser as any)?.gabinete?.nome ?? 'AdminHub';
        const { stats, periodoLabel } = await buildDemandasStats(gabineteId, 'MENSAL');

        const logoPath = path.join(process.cwd(), 'public', 'logo.png');
        const logoSrc = fs.existsSync(logoPath)
          ? `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`
          : undefined;

        const buffer = await renderToBuffer(
          React.createElement(DashboardReport, { gabineteName, stats, logoSrc, periodoLabel }) as any,
        );
        return new NextResponse(buffer as any, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="gabi-demandas-${Date.now()}.pdf"`,
          },
        });
      }
      // sem gabinete → cai no genérico
    }

    // ── Pré-computa o mapa (com fallback silencioso) ──
    let mapa: MapaResult | null = null;
    if (isEleitoral) {
      const cand = body.dadosBrutos?.buscar_votacao?.candidatos?.[0];
      if (cand) {
        mapa = await renderMapaEleitoral({ uf: cand.uf, ano: Number(cand.ano), cargo: cand.cargo, width: 232, height: 250 });
      }
    } else if (isEmendas) {
      const emendas: any[] = body.dadosBrutos?.buscar_emendas?.emendas ?? [];
      if (emendas.length > 0) {
        // UF predominante entre as emendas
        const ufCount: Record<string, number> = {};
        emendas.forEach(e => { if (e.uf) ufCount[e.uf] = (ufCount[e.uf] ?? 0) + 1; });
        const uf = Object.entries(ufCount).sort((a, b) => b[1] - a[1])[0]?.[0];
        const valores: Record<string, number> = {};
        emendas.forEach(e => { if (e.municipio) valores[e.municipio] = (valores[e.municipio] ?? 0) + (e.valorEmpenhado || 0); });
        if (uf && Object.keys(valores).length > 0) {
          mapa = await renderMapaEmendas({ uf, valores, width: 232, height: 250 });
        }
      }
    }

    const tipoLabel = isEleitoral ? 'Eleitoral' : isEmendas ? 'Emendas' : isDemandas ? 'Demandas' : 'Análise';

    const pdfBuffer = await renderToBuffer(
      React.createElement(RelatorioPDF, { input: body, geradoEm, tipoLabel, mapa }) as any,
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
