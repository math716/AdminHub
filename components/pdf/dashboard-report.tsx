import { Document, Page, Text, View, StyleSheet, Svg, Path, Circle } from '@react-pdf/renderer';

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
  const cx = size / 2, cy = size / 2, r = size / 2 - 3, ir = r * 0.42;

  if (!total) return (
    <Svg width={size} height={size}>
      <Circle cx={cx} cy={cy} r={r} fill="#e2e8f0" />
      <Circle cx={cx} cy={cy} r={ir} fill="#ffffff" />
    </Svg>
  );

  const valid = data.filter(d => d.value > 0);
  if (valid.length === 1) return (
    <Svg width={size} height={size}>
      <Circle cx={cx} cy={cy} r={r} fill={valid[0].color} />
      <Circle cx={cx} cy={cy} r={ir} fill="#ffffff" />
    </Svg>
  );

  let angle = 0;
  const slices = valid.map(d => {
    const start = angle;
    const sweep = (d.value / total) * 360;
    angle += sweep;
    return { color: d.color, start, end: angle - 0.001 };
  });

  return (
    <Svg width={size} height={size}>
      {slices.map((s, i) => (
        <Path key={i} d={slicePath(cx, cy, r, s.start, s.end)} fill={s.color} />
      ))}
      <Circle cx={cx} cy={cy} r={ir} fill="#ffffff" />
    </Svg>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#1e293b',
    backgroundColor: '#ffffff',
    paddingTop: 28,
    paddingBottom: 36,
    paddingHorizontal: 34,
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottom: '2px solid #1d4ed8',
    paddingBottom: 10,
    marginBottom: 14,
  },
  gabineteName: { fontSize: 17, fontFamily: 'Helvetica-Bold', color: '#1d4ed8' },
  reportSubtitle: { fontSize: 9, color: '#64748b', marginTop: 2 },
  dateLabel: { fontSize: 8, color: '#94a3b8' },
  dateValue: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#475569' },
  // Stats row
  statsRow: { flexDirection: 'row', gap: 7, marginBottom: 8 },
  statCard: {
    flex: 1,
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 5,
    padding: '8 10',
    alignItems: 'center',
  },
  statValue: { fontSize: 19, fontFamily: 'Helvetica-Bold', color: '#1e293b' },
  statLabel: { fontSize: 7.5, color: '#64748b', marginTop: 1, textAlign: 'center' },
  statPct: { fontSize: 7, color: '#94a3b8', marginTop: 1 },
  // Progress bar
  progressRow: { flexDirection: 'row', height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: '#e2e8f0', marginBottom: 3 },
  legendRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  legendDot: { width: 7, height: 7, borderRadius: 3.5 },
  legendText: { fontSize: 7.5, color: '#64748b' },
  // Section title
  sectionTitle: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    color: '#1d4ed8',
    marginBottom: 7,
    borderBottom: '1px solid #e2e8f0',
    paddingBottom: 3,
  },
  // Two-column layout
  twoCol: { flexDirection: 'row', gap: 14 },
  col: { flex: 1 },
  // Chart box
  chartBox: {
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 5,
    padding: '10 12',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  chartLegend: { flex: 1, gap: 5 },
  chartLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  chartLegendDot: { width: 8, height: 8, borderRadius: 4 },
  chartLegendLabel: { fontSize: 8, color: '#334155', flex: 1 },
  chartLegendValue: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#1e293b' },
  chartLegendPct: { fontSize: 7, color: '#94a3b8', marginLeft: 2 },
  // Table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    padding: '5 7',
    borderRadius: 4,
    marginBottom: 1,
  },
  tableRow: { flexDirection: 'row', padding: '4 7', borderBottom: '1px solid #f1f5f9' },
  tableRowAlt: { flexDirection: 'row', padding: '4 7', borderBottom: '1px solid #f1f5f9', backgroundColor: '#fafafa' },
  th: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#475569' },
  td: { fontSize: 8, color: '#334155' },
  tdBold: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#1e293b' },
  badge: { borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1.5 },
  badgeText: { fontSize: 6.5, fontFamily: 'Helvetica-Bold' },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 16,
    left: 34,
    right: 34,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTop: '1px solid #e2e8f0',
    paddingTop: 5,
  },
  footerText: { fontSize: 7.5, color: '#94a3b8' },
});

// ── Static maps ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  PENDENTE: '#F59E0B',
  EM_ANDAMENTO: '#3B82F6',
  RESOLVIDA: '#10B981',
};
const STATUS_LABELS: Record<string, string> = {
  PENDENTE: 'Pendente',
  EM_ANDAMENTO: 'Em Andamento',
  RESOLVIDA: 'Resolvida',
};
const PRIORITY_COLORS: Record<string, string> = {
  BAIXA: '#6B7280',
  MEDIA: '#3B82F6',
  ALTA: '#F59E0B',
  URGENTE: '#EF4444',
};
const PRIORITY_LABELS: Record<string, string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
  URGENTE: 'Urgente',
};

function fmt(n: number) { return n.toLocaleString('pt-BR'); }
function pct(part: number, total: number) { return total ? `${Math.round((part / total) * 100)}%` : '0%'; }

// ── Props ──────────────────────────────────────────────────────────────────────

interface ReportProps {
  gabineteName: string;
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

export default function DashboardReport({ gabineteName, stats }: ReportProps) {
  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const { total, pendentes, emAndamento, resolvidas, byCategory, byPriority, recentDemands } = stats;

  const resolvedPct  = Math.round(((resolvidas   || 0) / (total || 1)) * 100);
  const andamentoPct = Math.round(((emAndamento  || 0) / (total || 1)) * 100);
  const pendentePct  = Math.round(((pendentes    || 0) / (total || 1)) * 100);

  // Pie data — status
  const statusPie: PieEntry[] = [
    { label: 'Resolvidas',   value: resolvidas  || 0, color: '#10B981' },
    { label: 'Em Andamento', value: emAndamento || 0, color: '#3B82F6' },
    { label: 'Pendentes',    value: pendentes   || 0, color: '#F59E0B' },
  ];

  // Pie data — priority
  const priorityPie: PieEntry[] = Object.entries(byPriority || {})
    .map(([k, v]) => ({ label: PRIORITY_LABELS[k] || k, value: v, color: PRIORITY_COLORS[k] || '#9E9E9E' }))
    .sort((a, b) => b.value - a.value);

  const categories = Object.entries(byCategory || {}).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const recent = (recentDemands || []).slice(0, 9);

  return (
    <Document title={`Relatório Dashboard — ${gabineteName}`} author="AdminHub">
      <Page size="A4" orientation="landscape" style={S.page}>

        {/* HEADER */}
        <View style={S.header}>
          <View>
            <Text style={S.gabineteName}>{gabineteName}</Text>
            <Text style={S.reportSubtitle}>Relatório de Demandas — Dashboard</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={S.dateLabel}>Gerado em</Text>
            <Text style={S.dateValue}>{today}</Text>
          </View>
        </View>

        {/* STATS CARDS */}
        <View style={S.statsRow}>
          {[
            { label: 'Total de Demandas', value: total || 0, color: '#1e293b', sub: '' },
            { label: 'Resolvidas',        value: resolvidas || 0, color: '#10B981', sub: `${resolvedPct}% do total` },
            { label: 'Em Andamento',      value: emAndamento || 0, color: '#3B82F6', sub: `${andamentoPct}% do total` },
            { label: 'Pendentes',         value: pendentes || 0, color: '#F59E0B', sub: `${pendentePct}% do total` },
          ].map(c => (
            <View key={c.label} style={S.statCard}>
              <Text style={[S.statValue, { color: c.color }]}>{fmt(c.value)}</Text>
              <Text style={S.statLabel}>{c.label}</Text>
              {c.sub ? <Text style={S.statPct}>{c.sub}</Text> : null}
            </View>
          ))}
        </View>

        {/* PROGRESS BAR */}
        <View style={S.progressRow}>
          <View style={{ width: `${resolvedPct}%`,  backgroundColor: '#10B981', height: 5 }} />
          <View style={{ width: `${andamentoPct}%`, backgroundColor: '#3B82F6', height: 5 }} />
          <View style={{ width: `${pendentePct}%`,  backgroundColor: '#F59E0B', height: 5 }} />
        </View>
        <View style={S.legendRow}>
          {statusPie.map(s => (
            <View key={s.label} style={S.legendItem}>
              <View style={[S.legendDot, { backgroundColor: s.color }]} />
              <Text style={S.legendText}>{s.label}: {pct(s.value, total)}</Text>
            </View>
          ))}
        </View>

        {/* CHARTS ROW */}
        <View style={S.twoCol}>
          {/* Status donut */}
          <View style={S.col}>
            <Text style={S.sectionTitle}>Demandas por Status</Text>
            <View style={S.chartBox}>
              <DonutChart data={statusPie} size={110} />
              <View style={S.chartLegend}>
                {statusPie.filter(d => d.value > 0).map(d => (
                  <View key={d.label} style={S.chartLegendItem}>
                    <View style={[S.chartLegendDot, { backgroundColor: d.color }]} />
                    <Text style={S.chartLegendLabel}>{d.label}</Text>
                    <Text style={S.chartLegendValue}>{fmt(d.value)}</Text>
                    <Text style={S.chartLegendPct}>({pct(d.value, total)})</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* Priority donut */}
          <View style={S.col}>
            <Text style={S.sectionTitle}>Demandas por Prioridade</Text>
            <View style={S.chartBox}>
              <DonutChart data={priorityPie} size={110} />
              <View style={S.chartLegend}>
                {priorityPie.filter(d => d.value > 0).map(d => (
                  <View key={d.label} style={S.chartLegendItem}>
                    <View style={[S.chartLegendDot, { backgroundColor: d.color }]} />
                    <Text style={S.chartLegendLabel}>{d.label}</Text>
                    <Text style={S.chartLegendValue}>{fmt(d.value)}</Text>
                    <Text style={S.chartLegendPct}>({pct(d.value, total)})</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>

        {/* TABLES ROW */}
        <View style={S.twoCol}>
          {/* Category table */}
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
                <Text style={[S.td, { flex: 1, textAlign: 'right', color: '#64748b' }]}>{pct(value, total)}</Text>
              </View>
            ))}
          </View>

          {/* Recent demands table */}
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
                  {(d.title || '—').slice(0, 40)}{(d.title || '').length > 40 ? '…' : ''}
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
