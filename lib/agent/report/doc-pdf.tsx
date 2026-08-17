// Renderização compartilhada do "modelo documento" dos PDFs da Gabi
// (usado por /api/agent/pdf e /api/agent/relatorio, para ficarem idênticos).
// Corrige: (1) emojis/caracteres não suportados que apareciam sobrepostos às
// letras e (2) margens em TODAS as páginas (antes o conteúdo colava no topo
// da folha na virada de página).

import {
  Document, Page, Text, View, StyleSheet, Svg, Rect, Line, Path,
} from '@react-pdf/renderer';
import React from 'react';

// ─── Paleta ──────────────────────────────────────────────────────────────────
export const C = {
  blue: '#1d6fd8', blueDark: '#0c1d38', cyan: '#22d3ee',
  dark: '#0f172a', gray: '#64748b', light: '#f1f5f9',
  border: '#e2e8f0', white: '#ffffff',
};
const CHART_COLORS = ['#1d6fd8', '#10b981', '#f59e0b', '#ef4444', '#a78bfa', '#fb923c'];

// ─── Margens da página (A4 retrato) ─────────────────────────────────────────
const PAD_TOP = 34;
const PAD_BOTTOM = 52;
const PAD_H = 34;
const CONTENT_W = 595.28 - PAD_H * 2; // ~527pt

// ─── Estilos ─────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: C.dark,
    backgroundColor: C.white,
    paddingTop: PAD_TOP,
    paddingBottom: PAD_BOTTOM,
    paddingHorizontal: PAD_H,
  },

  // Header band — "sangra" até as bordas na 1ª página; nas seguintes o
  // paddingTop da página garante a margem superior.
  headerBand: {
    backgroundColor: C.blueDark,
    marginTop: -PAD_TOP,
    marginHorizontal: -PAD_H,
    marginBottom: 18,
    paddingHorizontal: PAD_H,
    paddingTop: 22,
    paddingBottom: 18,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center' },
  headerBadge: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: C.blue,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  headerBadgeText: { fontFamily: 'Helvetica-Bold', fontSize: 14, color: C.white },
  headerMeta: { flex: 1 },
  headerLabel: {
    fontSize: 7, color: C.cyan, fontFamily: 'Helvetica-Bold',
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 3,
  },
  headerTitle: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: C.white, lineHeight: 1.3 },
  headerPills: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 10 },
  pill: {
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4,
    paddingVertical: 3, paddingHorizontal: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  pillLabel: { fontSize: 7, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.8 },
  pillValue: { fontSize: 7.5, color: C.white, fontFamily: 'Helvetica-Bold' },

  // Rótulo "Consulta"
  sectionLabel: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, marginTop: 4, gap: 6 },
  sectionBar: { width: 3, height: 12, backgroundColor: C.blue, borderRadius: 2 },
  sectionLabelText: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.gray, textTransform: 'uppercase', letterSpacing: 1 },
  sectionQuestion: { fontSize: 8.5, color: C.gray, fontStyle: 'italic', flex: 1 },

  // Markdown
  h1: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.dark, marginBottom: 6, marginTop: 10 },
  h2: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.dark, marginBottom: 5, marginTop: 8 },
  h3: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: C.blue, marginBottom: 4, marginTop: 6 },
  p:  { fontSize: 9.5, lineHeight: 1.5, color: '#334155', marginBottom: 4 },
  hr: { borderBottomWidth: 1, borderBottomColor: C.border, marginVertical: 9 },

  bulletRow:  { flexDirection: 'row', marginBottom: 3, paddingLeft: 4 },
  bulletDot:  { fontSize: 9, color: C.blue, marginRight: 6 },
  bulletText: { fontSize: 9.5, lineHeight: 1.4, color: '#334155', flex: 1 },

  // Tabela (sem overflow/borderRadius p/ quebrar limpo entre páginas)
  // Sem borda externa (evita sobreposição das linhas quando a tabela quebra
  // de página no react-pdf). A estrutura vem do cabeçalho azul + linhas.
  tableWrap:    { marginVertical: 6 },
  tableRow:     { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border },
  tableRowLast: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border },
  tableRowAlt:  { backgroundColor: '#f8fafc' },
  tableHdrCell: { paddingVertical: 6, paddingHorizontal: 8, backgroundColor: C.blue },
  tableCell:    { paddingVertical: 5, paddingHorizontal: 8 },
  tableHdrText: { fontSize: 8, color: C.white, fontFamily: 'Helvetica-Bold' },
  tableCellText:{ fontSize: 8.5, color: '#334155' },
  tableCellBold:{ fontSize: 8.5, color: C.dark, fontFamily: 'Helvetica-Bold' },

  // Gráfico
  chartWrap:    { marginTop: 4, marginBottom: 8 },
  chartXLabels: { flexDirection: 'row', marginTop: 3 },
  chartLegend:  { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  legendItem:   { flexDirection: 'row', alignItems: 'center', marginRight: 14, marginTop: 3 },
  legendDot:    { width: 8, height: 8, borderRadius: 2, marginRight: 4 },
  legendText:   { fontSize: 7, color: C.gray },

  // Card de visualização (pizza)
  vizCard:      { borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 14, marginVertical: 8 },
  vizTitle:     { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.gray, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  pieRow:       { flexDirection: 'row', alignItems: 'center', gap: 18 },
  pieLegend:    { flex: 1, gap: 5 },
  pieLegendItem:{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  pieDot:       { width: 9, height: 9, borderRadius: 5, marginRight: 7 },
  pieLabel:     { fontSize: 9, color: '#334155', flex: 1 },
  piePct:       { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.dark, marginLeft: 4 },
  pieVal:       { fontSize: 8, color: C.gray, marginLeft: 6 },

  // Rodapé
  footer: {
    position: 'absolute', bottom: 18, left: PAD_H, right: PAD_H,
    flexDirection: 'row', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: C.border, paddingTop: 6,
  },
  footerText: { fontSize: 7, color: '#94a3b8' },
});

export const docStyles = S;

// ─── Remoção de emojis / caracteres não suportados ──────────────────────────
export function stripEmoji(s: string): string {
  return (s ?? '')
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/[\u{1F000}-\u{1F02F}]/gu, '')
    .replace(/[\u{2190}-\u{21FF}]/gu, '')   // setas
    .replace(/[\u{2300}-\u{27BF}]/gu, '')   // símbolos diversos / dingbats
    .replace(/[\u{2B00}-\u{2BFF}]/gu, '')
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')   // seletores de variação
    .replace(/[\u{200D}]/gu, '')            // zero-width joiner
    .replace(/�/g, '')                 // caractere de substituição
    .replace(/\s{2,}/g, ' ')
    .trimStart();
}

// ─── Parser inline (negrito) ────────────────────────────────────────────────
function parseInline(text: string): React.ReactNode[] {
  return stripEmoji(text)
    .split(/(\*\*[^*]+\*\*)/g)
    .map((p, i) => {
      if (!p) return null;
      if (p.startsWith('**') && p.endsWith('**'))
        return React.createElement(Text, { key: i, style: { fontFamily: 'Helvetica-Bold' } }, p.slice(2, -2));
      return React.createElement(Text, { key: i }, p);
    })
    .filter(Boolean) as React.ReactNode[];
}

// ─── Parser markdown ────────────────────────────────────────────────────────
type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'hr' }
  | { type: 'paragraph'; text: string }
  | { type: 'bullet'; text: string }
  | { type: 'table'; headers: string[]; rows: string[][] };

function parseMarkdown(text: string): Block[] {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed) { i++; continue; }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) { blocks.push({ type: 'hr' }); i++; continue; }

    const hm = trimmed.match(/^(#{1,3})\s+(.+)/);
    if (hm) {
      blocks.push({ type: 'heading', level: Math.min(hm[1].length, 3) as 1 | 2 | 3, text: stripEmoji(hm[2].replace(/\*\*/g, '')) });
      i++; continue;
    }

    if (trimmed.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { tableLines.push(lines[i].trim()); i++; }
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

    blocks.push({ type: 'paragraph', text: trimmed }); i++;
  }

  return blocks;
}

// ─── Números ─────────────────────────────────────────────────────────────────
function parseBrNum(s: string): number | null {
  const c = s.replace(/R\$\s*/g, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.').replace(/%/g, '').trim();
  const n = parseFloat(c);
  return isNaN(n) ? null : n;
}

// ─── Gráfico de barras (SVG) a partir de tabela ─────────────────────────────
function renderBarChart(headers: string[], rows: string[][]): React.ReactNode | null {
  if (headers.length < 2) return null;

  // Só colunas realmente numéricas viram série (ignora "Partido", "Situação"…);
  // ignora colunas de porcentagem (escala diferente) e a linha "Total".
  const ehPct = (h: string) => /%|percent/i.test(h ?? '');
  const ehTotal = (c: string) => (c ?? '').replace(/\*/g, '').trim().toLowerCase() === 'total';
  const linhas = rows.filter(r => !ehTotal(r[0] ?? ''));

  const numericCols: number[] = [];
  for (let ci = 1; ci < headers.length; ci++) {
    if (ehPct(headers[ci])) continue;
    if (linhas.some(r => { const n = parseBrNum(r[ci] ?? ''); return n !== null && n > 0; })) numericCols.push(ci);
  }
  if (numericCols.length === 0) return null;

  const seriesNames = numericCols.map(ci => headers[ci]);
  const dataRowsAll = linhas
    .map(row => ({ label: stripEmoji(row[0]?.replace(/\*\*/g, '') ?? ''), nums: numericCols.map(ci => parseBrNum(row[ci] ?? '')) }))
    .filter(r => r.nums.some(v => v !== null && v > 0));

  if (dataRowsAll.length === 0) return null;

  // Limita a 6 grupos (os maiores) — evita amontoar/sobrepor rótulos no eixo X,
  // independentemente de quantos municípios ou candidatos a tabela tenha.
  const dataRows = [...dataRowsAll]
    .sort((a, b) => Math.max(...b.nums.map(v => v ?? 0)) - Math.max(...a.nums.map(v => v ?? 0)))
    .slice(0, 6);

  const allNums = dataRows.flatMap(r => r.nums.filter(v => v !== null) as number[]);
  const maxVal = Math.max(...allNums, 1);

  const CW = CONTENT_W, CH = 108;
  const numSeries = seriesNames.length;
  const numGroups = dataRows.length;
  const groupW = CW / numGroups;
  const barW = Math.min((groupW - 10) / numSeries, 40);
  const groupPad = (groupW - barW * numSeries) / 2;

  const svgEls: React.ReactNode[] = [];
  [0.25, 0.5, 0.75, 1.0].forEach((r, gi) => {
    const y = CH - r * CH;
    svgEls.push(React.createElement(Line, { key: `g${gi}`, x1: 0, y1: y, x2: CW, y2: y, stroke: '#e2e8f0', strokeWidth: 0.6 }));
  });
  dataRows.forEach((row, ri) => {
    const gx = ri * groupW;
    row.nums.forEach((val, si) => {
      if (val === null) return;
      const bx = gx + groupPad + si * barW;
      const barH = Math.max((val / maxVal) * CH, 2);
      svgEls.push(React.createElement(Rect, { key: `b${ri}-${si}`, x: bx, y: CH - barH, width: barW - 2, height: barH, fill: CHART_COLORS[si % CHART_COLORS.length], rx: 3 }));
    });
  });

  const xLabels = dataRows.map((row, ri) => {
    const label = row.label.length > 16 ? row.label.slice(0, 14) + '…' : row.label;
    return React.createElement(View, { key: ri, style: { flex: 1, alignItems: 'center' } },
      React.createElement(Text, { style: { fontSize: 6.5, color: C.gray, textAlign: 'center' } }, label));
  });

  const legendEls = seriesNames.map((name, si) =>
    React.createElement(View, { key: si, style: S.legendItem },
      React.createElement(View, { style: { ...S.legendDot, backgroundColor: CHART_COLORS[si % CHART_COLORS.length] } }),
      React.createElement(Text, { style: S.legendText }, stripEmoji(name))));

  return React.createElement(View, { style: S.chartWrap, wrap: false },
    React.createElement(Svg, { width: CW, height: CH }, ...svgEls),
    React.createElement(View, { style: S.chartXLabels }, ...xLabels),
    seriesNames.length > 1 ? React.createElement(View, { style: S.chartLegend }, ...legendEls) : null);
}

// ─── Renderização de blocos ─────────────────────────────────────────────────
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
      return React.createElement(View, { key: i, style: S.bulletRow, wrap: false },
        React.createElement(Text, { style: S.bulletDot }, '•'),
        React.createElement(Text, { style: S.bulletText }, ...parseInline(block.text)));
    case 'table': {
      const hasNums = block.rows.some(r => r.slice(1).some(v => parseBrNum(v) !== null && parseBrNum(v)! > 0));
      const chart = hasNums ? renderBarChart(block.headers, block.rows) : null;
      // Coluna de posição/ranking (#, Nº, Posição, Rank): numera as linhas
      // (1º, 2º…) — evita células vazias quando vieram medalhas 🥇🥈🥉 (removidas pelo stripEmoji).
      const rankCol = /^(#|n[ºo.]?|pos(i[çc][aã]o)?|rank(ing)?)$/i.test((block.headers[0] || '').replace(/\*/g, '').trim());
      const colFlex = (ci: number) => (ci === 0 && block.headers.length > 2 ? (rankCol ? 0.5 : 1.7) : 1);

      const tableEl = React.createElement(View, { style: S.tableWrap },
        React.createElement(View, { style: S.tableRow, wrap: false, minPresenceAhead: 48 },
          ...block.headers.map((h, hi) =>
            React.createElement(View, { key: hi, style: { ...S.tableHdrCell, flex: colFlex(hi) } },
              React.createElement(Text, { style: S.tableHdrText }, stripEmoji(h.replace(/\*\*/g, '')))))),
        ...block.rows.map((row, ri) =>
          React.createElement(View, { key: ri, wrap: false, style: [ri === block.rows.length - 1 ? S.tableRowLast : S.tableRow, ri % 2 === 1 ? S.tableRowAlt : {}] },
            ...row.map((cell, ci) =>
              React.createElement(View, { key: ci, style: { ...S.tableCell, flex: colFlex(ci) } },
                React.createElement(Text, { style: ci === 0 ? S.tableCellBold : S.tableCellText },
                  ...(rankCol && ci === 0 ? [`${ri + 1}º`] : parseInline(cell))))))));

      return React.createElement(View, { key: i }, tableEl, chart);
    }
    default:
      return null;
  }
}

export function renderContent(content: string): React.ReactNode[] {
  return parseMarkdown(content).map((b, i) => renderBlock(b, i)).filter(Boolean) as React.ReactNode[];
}

// ─── Gráfico de pizza (donut) ───────────────────────────────────────────────
const PIE_PALETTE = ['#1d4ed8', '#ef4444', '#16a34a', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6', '#fb923c'];

function fp(n: number): string { return parseFloat(n.toFixed(2)).toString(); }

function donutSeg(cx: number, cy: number, R: number, r: number, sa: number, ea: number): string {
  const x1o = cx + R * Math.cos(sa), y1o = cy + R * Math.sin(sa);
  const x2o = cx + R * Math.cos(ea), y2o = cy + R * Math.sin(ea);
  const x1i = cx + r * Math.cos(ea), y1i = cy + r * Math.sin(ea);
  const x2i = cx + r * Math.cos(sa), y2i = cy + r * Math.sin(sa);
  const lg = ea - sa > Math.PI ? 1 : 0;
  return `M${fp(x1o)} ${fp(y1o)} A${fp(R)} ${fp(R)} 0 ${lg} 1 ${fp(x2o)} ${fp(y2o)} L${fp(x1i)} ${fp(y1i)} A${fp(r)} ${fp(r)} 0 ${lg} 0 ${fp(x2i)} ${fp(y2i)}Z`;
}

export interface PieItem { label: string; valor: number; valorLabel?: string; cor?: string }

/** Card com gráfico de pizza (donut) + legenda (label · % · valor). */
export function renderPizza(titulo: string, items: PieItem[]): React.ReactNode | null {
  const clean = (items ?? []).filter(i => (i.valor ?? 0) > 0);
  if (clean.length === 0) return null;
  const total = clean.reduce((s, i) => s + i.valor, 0);

  const size = 128, cx = size / 2, cy = size / 2, R = size * 0.46, r = size * 0.26;
  let paths: React.ReactNode[];
  if (clean.length === 1) {
    // Fatia única (100%): anel completo (dois semicírculos) — evita arco degenerado
    const cor = clean[0].cor || PIE_PALETTE[0];
    paths = [
      React.createElement(Path, { key: 0, d: donutSeg(cx, cy, R, r, -Math.PI / 2, Math.PI / 2), fill: cor }),
      React.createElement(Path, { key: 1, d: donutSeg(cx, cy, R, r, Math.PI / 2, (3 * Math.PI) / 2), fill: cor }),
    ];
  } else {
    const GAP = 0.03;
    let angle = -Math.PI / 2;
    paths = clean.map((it, i) => {
      const sweep = (it.valor / total) * 2 * Math.PI;
      const cor = it.cor || PIE_PALETTE[i % PIE_PALETTE.length];
      const el = sweep > 0.005
        ? React.createElement(Path, { key: i, d: donutSeg(cx, cy, R, r, angle, angle + Math.max(sweep - GAP, 0.001)), fill: cor })
        : null;
      angle += sweep;
      return el;
    }).filter(Boolean) as React.ReactNode[];
  }

  const legend = clean.map((it, i) => {
    const pct = ((it.valor / total) * 100).toFixed(1).replace('.', ',');
    const cor = it.cor || PIE_PALETTE[i % PIE_PALETTE.length];
    return React.createElement(View, { key: i, style: S.pieLegendItem },
      React.createElement(View, { style: { ...S.pieDot, backgroundColor: cor } }),
      React.createElement(Text, { style: S.pieLabel }, it.label.length > 28 ? it.label.slice(0, 26) + '…' : it.label),
      React.createElement(Text, { style: S.piePct }, `${pct}%`),
      React.createElement(Text, { style: S.pieVal }, it.valorLabel ?? it.valor.toLocaleString('pt-BR')),
    );
  });

  return React.createElement(View, { style: S.vizCard, wrap: false },
    titulo ? React.createElement(Text, { style: S.vizTitle }, titulo) : null,
    React.createElement(View, { style: S.pieRow },
      React.createElement(Svg, { width: size, height: size }, ...paths),
      React.createElement(View, { style: S.pieLegend }, ...legend),
    ),
  );
}

// ─── Componentes de página ──────────────────────────────────────────────────
export interface Pill { label: string; value: string }

export function HeaderBand({ titulo, pills }: { titulo: string; pills: Pill[] }): React.ReactNode {
  return React.createElement(View, { style: S.headerBand },
    React.createElement(View, { style: S.headerTop },
      React.createElement(View, { style: S.headerBadge }, React.createElement(Text, { style: S.headerBadgeText }, 'G')),
      React.createElement(View, { style: S.headerMeta },
        React.createElement(Text, { style: S.headerLabel }, 'Relatório preparado pela Gabi · AdminHub'),
        React.createElement(Text, { style: S.headerTitle }, stripEmoji(titulo)),
      ),
    ),
    pills.length > 0 ? React.createElement(View, { style: S.headerPills },
      ...pills.map((p, i) => React.createElement(View, { key: i, style: S.pill },
        React.createElement(Text, { style: S.pillLabel }, p.label + ' '),
        React.createElement(Text, { style: S.pillValue }, p.value),
      )),
    ) : null,
  );
}

export function DocFooter(): React.ReactNode {
  return React.createElement(View, { style: S.footer, fixed: true },
    React.createElement(Text, { style: S.footerText }, 'AdminHub — Gabi IA · Gerado por IA, verifique as informações'),
    React.createElement(Text, { style: S.footerText, render: ({ pageNumber, totalPages }: any) => `Pág. ${pageNumber} / ${totalPages}` }),
  );
}

export { Document, Page, Text, View };
