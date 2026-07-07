import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#1e293b',
    backgroundColor: '#ffffff',
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 40,
  },
  // Header
  header: {
    borderBottom: '2px solid #1d4ed8',
    paddingBottom: 12,
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  headerLeft: { flexDirection: 'column', gap: 2 },
  gabineteName: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#1d4ed8' },
  reportTitle: { fontSize: 11, color: '#64748b', marginTop: 2 },
  headerRight: { flexDirection: 'column', alignItems: 'flex-end', gap: 2 },
  dateLabel: { fontSize: 9, color: '#94a3b8' },
  dateValue: { fontSize: 10, color: '#475569', fontFamily: 'Helvetica-Bold' },
  // Section
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#1d4ed8',
    marginBottom: 8,
    marginTop: 16,
    borderBottom: '1px solid #e2e8f0',
    paddingBottom: 4,
  },
  // Stats grid
  statsGrid: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  statCard: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    padding: 10,
    border: '1px solid #e2e8f0',
    alignItems: 'center',
  },
  statValue: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#1e293b' },
  statLabel: { fontSize: 8, color: '#64748b', marginTop: 2, textAlign: 'center' },
  statPct: { fontSize: 8, color: '#94a3b8', marginTop: 1 },
  // Progress bar
  progressBarOuter: {
    height: 6,
    backgroundColor: '#e2e8f0',
    borderRadius: 3,
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: 4,
  },
  // Table
  table: { marginTop: 4 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    padding: '6 8',
    borderRadius: 4,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: 'row',
    padding: '5 8',
    borderBottom: '1px solid #f1f5f9',
    alignItems: 'center',
  },
  tableRowAlt: {
    flexDirection: 'row',
    padding: '5 8',
    borderBottom: '1px solid #f1f5f9',
    backgroundColor: '#fafafa',
    alignItems: 'center',
  },
  thText: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#475569' },
  tdText: { fontSize: 9, color: '#334155' },
  // Badge
  badge: { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 7, fontFamily: 'Helvetica-Bold' },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTop: '1px solid #e2e8f0',
    paddingTop: 6,
  },
  footerText: { fontSize: 8, color: '#94a3b8' },
});

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

interface DashboardReportProps {
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

function fmt(n: number): string {
  return n.toLocaleString('pt-BR');
}

function pct(part: number, total: number): string {
  if (!total) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

export default function DashboardReport({ gabineteName, stats }: DashboardReportProps) {
  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const resolvedPct = Math.round(((stats.resolvidas || 0) / (stats.total || 1)) * 100);
  const pendentePct = Math.round(((stats.pendentes || 0) / (stats.total || 1)) * 100);
  const emAndamentoPct = Math.round(((stats.emAndamento || 0) / (stats.total || 1)) * 100);

  const categoriesEntries = Object.entries(stats.byCategory || {}).sort((a, b) => b[1] - a[1]);
  const priorityEntries = Object.entries(stats.byPriority || {}).sort((a, b) => b[1] - a[1]);

  return (
    <Document title={`Relatório Dashboard — ${gabineteName}`} author="AdminHub">
      <Page size="A4" style={styles.page}>
        {/* HEADER */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.gabineteName}>{gabineteName}</Text>
            <Text style={styles.reportTitle}>Relatório de Demandas — Dashboard</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.dateLabel}>Gerado em</Text>
            <Text style={styles.dateValue}>{today}</Text>
          </View>
        </View>

        {/* RESUMO */}
        <Text style={styles.sectionTitle}>Resumo Geral</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{fmt(stats.total)}</Text>
            <Text style={styles.statLabel}>Total de Demandas</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: '#10B981' }]}>{fmt(stats.resolvidas)}</Text>
            <Text style={styles.statLabel}>Resolvidas</Text>
            <Text style={styles.statPct}>{resolvedPct}% do total</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: '#3B82F6' }]}>{fmt(stats.emAndamento)}</Text>
            <Text style={styles.statLabel}>Em Andamento</Text>
            <Text style={styles.statPct}>{emAndamentoPct}% do total</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: '#F59E0B' }]}>{fmt(stats.pendentes)}</Text>
            <Text style={styles.statLabel}>Pendentes</Text>
            <Text style={styles.statPct}>{pendentePct}% do total</Text>
          </View>
        </View>

        {/* Progress bar visual */}
        <View style={styles.progressBarOuter}>
          <View style={{ width: `${resolvedPct}%`, backgroundColor: '#10B981', height: 6 }} />
          <View style={{ width: `${emAndamentoPct}%`, backgroundColor: '#3B82F6', height: 6 }} />
          <View style={{ width: `${pendentePct}%`, backgroundColor: '#F59E0B', height: 6 }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 4, marginTop: 2 }}>
          {[
            { label: 'Resolvidas', color: '#10B981', pct: resolvedPct },
            { label: 'Em Andamento', color: '#3B82F6', pct: emAndamentoPct },
            { label: 'Pendentes', color: '#F59E0B', pct: pendentePct },
          ].map(item => (
            <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.color }} />
              <Text style={{ fontSize: 8, color: '#64748b' }}>{item.label}: {item.pct}%</Text>
            </View>
          ))}
        </View>

        {/* DEMANDAS POR PRIORIDADE */}
        <Text style={styles.sectionTitle}>Demandas por Prioridade</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.thText, { flex: 3 }]}>Prioridade</Text>
            <Text style={[styles.thText, { flex: 1, textAlign: 'right' }]}>Total</Text>
            <Text style={[styles.thText, { flex: 1, textAlign: 'right' }]}>%</Text>
          </View>
          {priorityEntries.map(([key, value], i) => (
            <View key={key} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
              <View style={{ flex: 3, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: PRIORITY_COLORS[key] || '#9E9E9E' }} />
                <Text style={styles.tdText}>{PRIORITY_LABELS[key] || key}</Text>
              </View>
              <Text style={[styles.tdText, { flex: 1, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{fmt(value)}</Text>
              <Text style={[styles.tdText, { flex: 1, textAlign: 'right', color: '#64748b' }]}>{pct(value, stats.total)}</Text>
            </View>
          ))}
        </View>

        {/* DEMANDAS POR CATEGORIA */}
        <Text style={styles.sectionTitle}>Demandas por Categoria</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.thText, { flex: 4 }]}>Categoria</Text>
            <Text style={[styles.thText, { flex: 1, textAlign: 'right' }]}>Total</Text>
            <Text style={[styles.thText, { flex: 1, textAlign: 'right' }]}>%</Text>
          </View>
          {categoriesEntries.map(([key, value], i) => (
            <View key={key} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
              <Text style={[styles.tdText, { flex: 4 }]}>{key}</Text>
              <Text style={[styles.tdText, { flex: 1, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{fmt(value)}</Text>
              <Text style={[styles.tdText, { flex: 1, textAlign: 'right', color: '#64748b' }]}>{pct(value, stats.total)}</Text>
            </View>
          ))}
        </View>

        {/* DEMANDAS RECENTES */}
        <Text style={styles.sectionTitle}>Demandas Recentes</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.thText, { flex: 4 }]}>Título</Text>
            <Text style={[styles.thText, { flex: 2 }]}>Status</Text>
            <Text style={[styles.thText, { flex: 2 }]}>Prioridade</Text>
          </View>
          {(stats.recentDemands || []).slice(0, 10).map((demand: any, i: number) => (
            <View key={demand.id || i} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
              <Text style={[styles.tdText, { flex: 4 }]}>{(demand.title || '—').slice(0, 50)}{(demand.title || '').length > 50 ? '…' : ''}</Text>
              <View style={{ flex: 2 }}>
                <View style={[styles.badge, { backgroundColor: `${STATUS_COLORS[demand.status] || '#6B7280'}20` }]}>
                  <Text style={[styles.badgeText, { color: STATUS_COLORS[demand.status] || '#6B7280' }]}>
                    {STATUS_LABELS[demand.status] || demand.status}
                  </Text>
                </View>
              </View>
              <View style={{ flex: 2 }}>
                <View style={[styles.badge, { backgroundColor: `${PRIORITY_COLORS[demand.priority] || '#6B7280'}20` }]}>
                  <Text style={[styles.badgeText, { color: PRIORITY_COLORS[demand.priority] || '#6B7280' }]}>
                    {PRIORITY_LABELS[demand.priority] || demand.priority}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* FOOTER */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>AdminHub · {gabineteName}</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
