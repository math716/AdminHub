import { Document, Page, Text, View, StyleSheet, Svg, Path, Circle, Image } from '@react-pdf/renderer';

// ── Cores idênticas ao dashboard ───────────────────────────────────────────────
const C = {
  blue:        '#1d4ed8',
  blueDark:    '#1e3a8a',
  blueLight:   '#dbeafe',
  blueMid:     '#bfdbfe',
  pendente:    '#EF4444',
  andamento:   '#2196F3',
  resolvida:   '#4CAF50',
  baixa:       '#4CAF50',
  media:       '#FFC107',
  alta:        '#F44336',
  urgente:     '#DC2626',
  textPrimary: '#0f172a',
  textMuted:   '#64748b',
  textLight:   '#94a3b8',
  bg:          '#f8fafc',
  border:      '#e2e8f0',
  rowAlt:      '#f0f9ff',
  white:       '#ffffff',
};

// ── Pie chart helpers ──────────────────────────────────────────────────────────
function polarXY(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function slicePath(cx: number, cy: number, r: number, start: number, end: number) {
  const s = polarXY(cx, cy, r, start);
  const e = polarXY(cx, cy, r, end);
  const large = end - start > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)} Z`;
}

interface PieEntry { label: string; value: number; color: string }

function DonutChart({ data, size = 110 }: { data: PieEntry[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const cx = size / 2, cy = size / 2, r = size / 2 - 3, ir = r * 0.40;

  if (!total) return (
    <Svg width={size} height={size}>
      <Circle cx={cx} cy={cy} r={r} fill={C.border} />
      <Circle cx={cx} cy={cy} r={ir} fill={C.white} />
    </Svg>
  );
  const valid = data.filter(d => d.value > 0);
  if (valid.length === 1) return (
    <Svg width={size} height={size}>
      <Circle cx={cx} cy={cy} r={r} fill={valid[0].color} />
      <Circle cx={cx} cy={cy} r={ir} fill={C.white} />
    </Svg>
  );
  let angle = 0;
  const slices = valid.map(d => {
    const start = angle;
    angle += (d.value / total) * 360;
    return { color: d.color, start, end: angle - 0.001 };
  });
  return (
    <Svg width={size} height={size}>
      {slices.map((s, i) => (
        <Path key={i} d={slicePath(cx, cy, r, s.start, s.end)} fill={s.color} />
      ))}
      <Circle cx={cx} cy={cy} r={ir} fill={C.white} />
    </Svg>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: C.textPrimary,
    backgroundColor: C.white,
    paddingTop: 26,
    paddingBottom: 34,
    paddingHorizontal: 32,
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: `2.5px solid ${C.blue}`,
    paddingBottom: 8,
    marginBottom: 10,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 60, height: 60, objectFit: 'contain' },
  headerText: { flexDirection: 'column', gap: 1 },
  gabineteName: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.blue },
  reportSubtitle: { fontSize: 8.5, color: C.textMuted },
  headerRight: { alignItems: 'flex-end', gap: 1 },
  dateLabel: { fontSize: 7.5, color: C.textLight },
  dateValue: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.textMuted },
  // Stats
  statsRow: { flexDirection: 'row', gap: 7, marginBottom: 7 },
  statCard: {
    flex: 1,
    backgroundColor: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 5,
    padding: '7 10',
    alignItems: 'center',
  },
  statValue: { fontSize: 20, fontFamily: 'Helvetica-Bold' },
  statLabel: { fontSize: 7.5, color: C.textMuted, marginTop: 1, textAlign: 'center' },
  statSub: { fontSize: 6.5, color: C.textLight, marginTop: 1 },
  // Progress bar
  progressOuter: { flexDirection: 'row', height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: C.border, marginBottom: 3 },
  legendRow: { flexDirection: 'row', gap: 12, marginBottom: 11 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  legendDot: { width: 7, height: 7, borderRadius: 3.5 },
  legendText: { fontSize: 7.5, color: C.textMuted },
  // Section title
  sectionTitle: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    color: C.blue,
    borderBottom: `1px solid ${C.blueMid}`,
    paddingBottom: 3,
    marginBottom: 6,
  },
  // Two-column
  twoCol: { flexDirection: 'row', gap: 13 },
  col: { flex: 1 },
  // Chart box
  chartBox: {
    backgroundColor: C.blueLight,
    border: `1px solid ${C.blueMid}`,
    borderRadius: 6,
    padding: '10 12',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 11,
  },
  chartLegend: { flex: 1, gap: 6 },
  chartRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  chartDot: { width: 9, height: 9, borderRadius: 4.5 },
  chartLabel: { fontSize: 8, color: C.textPrimary, flex: 1 },
  chartVal: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.textPrimary },
  chartPct: { fontSize: 7, color: C.textMuted, marginLeft: 2 },
  // Table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: C.blue,
    padding: '4.5 7',
    borderRadius: 4,
    marginBottom: 1,
  },
  tableRow:    { flexDirection: 'row', padding: '4 7', borderBottom: `1px solid ${C.border}` },
  tableRowAlt: { flexDirection: 'row', padding: '4 7', borderBottom: `1px solid ${C.border}`, backgroundColor: C.rowAlt },
  th:     { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.white },
  td:     { fontSize: 8, color: C.textPrimary },
  tdBold: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.textPrimary },
  badge:     { borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1.5 },
  badgeText: { fontSize: 6.5, fontFamily: 'Helvetica-Bold' },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 14,
    left: 32,
    right: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTop: `1px solid ${C.border}`,
    paddingTop: 4,
  },
  footerText: { fontSize: 7.5, color: C.textLight },
});

// ── Helpers ────────────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  PENDENTE: C.pendente, EM_ANDAMENTO: C.andamento, RESOLVIDA: C.resolvida,
};
const STATUS_LABELS: Record<string, string> = {
  PENDENTE: 'Pendente', EM_ANDAMENTO: 'Em Andamento', RESOLVIDA: 'Resolvida',
};
const PRIORITY_COLORS: Record<string, string> = {
  BAIXA: C.baixa, MEDIA: C.media, ALTA: C.alta, URGENTE: C.urgente,
};
const PRIORITY_LABELS: Record<string, string> = {
  BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta', URGENTE: 'Urgente',
};
const fmt = (n: number) => n.toLocaleString('pt-BR');
const pct = (part: number, total: number) => total ? `${Math.round((part / total) * 100)}%` : '0%';

// ── Props ──────────────────────────────────────────────────────────────────────
interface ReportProps {
  gabineteName: string;
  logoSrc?: string;
  periodoLabel?: string;
  stats: {
    total: number;
    pendentes: number;
    emAndamento: number;
    resolvidas: number;
    byCategory: Record<string, number>;
    byPriority: Record<string, number>;
    recentDemands: any[];
    timeline: { date: string; count: number; resolved: number }[];
    lastResolvedDate: string | null;
  };
}

// ── Document ───────────────────────────────────────────────────────────────────
export default function DashboardReport({ gabineteName, logoSrc, stats, periodoLabel }: ReportProps) {
  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const { total, pendentes, emAndamento, resolvidas, byCategory, byPriority, recentDemands } = stats;

  const resolvedPct  = Math.round(((resolvidas  || 0) / (total || 1)) * 100);
  const andamentoPct = Math.round(((emAndamento || 0) / (total || 1)) * 100);
  const pendentePct  = Math.round(((pendentes   || 0) / (total || 1)) * 100);

  const statusPie: PieEntry[] = [
    { label: 'Resolvidas',   value: resolvidas  || 0, color: C.resolvida },
    { label: 'Em Andamento', value: emAndamento || 0, color: C.andamento },
    { label: 'Pendentes',    value: pendentes   || 0, color: C.pendente  },
  ];
  const priorityPie: PieEntry[] = Object.entries(byPriority || {})
    .map(([k, v]) => ({ label: PRIORITY_LABELS[k] || k, value: v, color: PRIORITY_COLORS[k] || '#9E9E9E' }))
    .sort((a, b) => b.value - a.value);

  const categories = Object.entries(byCategory || {}).sort((a, b) => b[1] - a[1]).slice(0, 7);
  const recent = (recentDemands || []).slice(0, 7);

  return (
    <Document title={`Relatório Dashboard — ${gabineteName}`} author="AdminHub">
      <Page size="A4" orientation="landscape" style={S.page}>

        {/* HEADER */}
        <View style={S.header}>
          <View style={S.headerLeft}>
            {logoSrc && <Image src={logoSrc} style={S.logo} />}
            <View style={S.headerText}>
              <Text style={S.gabineteName}>{gabineteName}</Text>
              <Text style={S.reportSubtitle}>Relatório de Demandas — Dashboard{periodoLabel ? ` · ${periodoLabel}` : ''}</Text>
            </View>
          </View>
          <View style={S.headerRight}>
            <Text style={S.dateLabel}>Gerado em</Text>
            <Text style={S.dateValue}>{today}</Text>
          </View>
        </View>

        {/* STATS */}
        <View style={S.statsRow}>
          {[
            { label: 'Total de Demandas', value: total || 0,      color: C.blue,      sub: '' },
            { label: 'Resolvidas',        value: resolvidas || 0, color: C.resolvida, sub: `${resolvedPct}% do total` },
            { label: 'Em Andamento',      value: emAndamento || 0,color: C.andamento, sub: `${andamentoPct}% do total` },
            { label: 'Pendentes',         value: pendentes || 0,  color: C.pendente,  sub: `${pendentePct}% do total` },
          ].map(c => (
            <View key={c.label} style={[S.statCard, { borderLeft: `3px solid ${c.color}` }]}>
              <Text style={[S.statValue, { color: c.color }]}>{fmt(c.value)}</Text>
              <Text style={S.statLabel}>{c.label}</Text>
              {c.sub ? <Text style={S.statSub}>{c.sub}</Text> : null}
            </View>
          ))}
        </View>

        {/* PROGRESS BAR */}
        <View style={S.progressOuter}>
          <View style={{ width: `${resolvedPct}%`,  backgroundColor: C.resolvida, height: 5 }} />
          <View style={{ width: `${andamentoPct}%`, backgroundColor: C.andamento, height: 5 }} />
          <View style={{ width: `${pendentePct}%`,  backgroundColor: C.pendente,  height: 5 }} />
        </View>
        <View style={S.legendRow}>
          {statusPie.map(s => (
            <View key={s.label} style={S.legendItem}>
              <View style={[S.legendDot, { backgroundColor: s.color }]} />
              <Text style={S.legendText}>{s.label}: {pct(s.value, total)}</Text>
            </View>
          ))}
        </View>

        {/* CHARTS */}
        <View style={S.twoCol}>
          <View style={S.col}>
            <Text style={S.sectionTitle}>Demandas por Status</Text>
            <View style={S.chartBox}>
              <DonutChart data={statusPie} size={112} />
              <View style={S.chartLegend}>
                {statusPie.filter(d => d.value > 0).map(d => (
                  <View key={d.label} style={S.chartRow}>
                    <View style={[S.chartDot, { backgroundColor: d.color }]} />
                    <Text style={S.chartLabel}>{d.label}</Text>
                    <Text style={S.chartVal}>{fmt(d.value)}</Text>
                    <Text style={S.chartPct}>({pct(d.value, total)})</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          <View style={S.col}>
            <Text style={S.sectionTitle}>Demandas por Prioridade</Text>
            <View style={S.chartBox}>
              <DonutChart data={priorityPie} size={112} />
              <View style={S.chartLegend}>
                {priorityPie.filter(d => d.value > 0).map(d => (
                  <View key={d.label} style={S.chartRow}>
                    <View style={[S.chartDot, { backgroundColor: d.color }]} />
                    <Text style={S.chartLabel}>{d.label}</Text>
                    <Text style={S.chartVal}>{fmt(d.value)}</Text>
                    <Text style={S.chartPct}>({pct(d.value, total)})</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>

        {/* TABLES */}
        <View style={S.twoCol}>
          <View style={S.col}>
            <Text style={S.sectionTitle}>Demandas por Categoria</Text>
            <View style={S.tableHeader}>
              <Text style={[S.th, { flex: 4 }]}>Categoria</Text>
              <Text style={[S.th, { flex: 1, textAlign: 'right' }]}>Total</Text>
              <Text style={[S.th, { flex: 1, textAlign: 'right' }]}>%</Text>
            </View>
            {categories.map(([key, value], i) => (
              <View key={key} style={i % 2 === 0 ? S.tableRow : S.tableRowAlt}>
                <Text style={[S.td, { flex: 4 }]}>{key}</Text>
                <Text style={[S.tdBold, { flex: 1, textAlign: 'right' }]}>{fmt(value)}</Text>
                <Text style={[S.td, { flex: 1, textAlign: 'right', color: C.textMuted }]}>{pct(value, total)}</Text>
              </View>
            ))}
          </View>

          <View style={S.col}>
            <Text style={S.sectionTitle}>Demandas Recentes</Text>
            <View style={S.tableHeader}>
              <Text style={[S.th, { flex: 4 }]}>Título</Text>
              <Text style={[S.th, { flex: 2 }]}>Status</Text>
              <Text style={[S.th, { flex: 2 }]}>Prioridade</Text>
            </View>
            {recent.map((d: any, i: number) => (
              <View key={d.id || i} style={i % 2 === 0 ? S.tableRow : S.tableRowAlt}>
                <Text style={[S.td, { flex: 4 }]}>
                  {(d.title || '—').slice(0, 42)}{(d.title || '').length > 42 ? '…' : ''}
                </Text>
                <View style={{ flex: 2 }}>
                  <View style={[S.badge, { backgroundColor: `${STATUS_COLORS[d.status] || '#6B7280'}22` }]}>
                    <Text style={[S.badgeText, { color: STATUS_COLORS[d.status] || '#6B7280' }]}>
                      {STATUS_LABELS[d.status] || d.status}
                    </Text>
                  </View>
                </View>
                <View style={{ flex: 2 }}>
                  <View style={[S.badge, { backgroundColor: `${PRIORITY_COLORS[d.priority] || '#6B7280'}22` }]}>
                    <Text style={[S.badgeText, { color: PRIORITY_COLORS[d.priority] || '#6B7280' }]}>
                      {PRIORITY_LABELS[d.priority] || d.priority}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* FOOTER */}
        <View style={S.footer} fixed>
          <Text style={S.footerText}>AdminHub · {gabineteName}</Text>
          <Text style={S.footerText} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
