import { prisma } from '@/lib/db';

// ── Tipos ──────────────────────────────────────────────────────────────────────
export interface DemandasStats {
  total: number;
  pendentes: number;
  emAndamento: number;
  resolvidas: number;
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
  recentDemands: any[];
  timeline: { date: string; count: number; resolved: number }[];
  lastResolvedDate: string | null;
}

export type PeriodoRelatorio = 'MENSAL' | 'ANUAL' | 'CUSTOM';

/**
 * Monta as estatísticas de demandas de um gabinete no formato consumido por
 * `components/pdf/dashboard-report.tsx`. Reutilizado tanto pela rota do botão
 * "Gerar relatório" do dashboard quanto pelo relatório de demandas da Gabi,
 * garantindo PDFs idênticos.
 */
export async function buildDemandasStats(
  gabineteId: string,
  periodo: PeriodoRelatorio = 'MENSAL',
  custom?: { dataInicio?: string | null; dataFim?: string | null },
): Promise<{ stats: DemandasStats; periodoLabel: string }> {
  const scope = { gabineteId };

  const hoje = new Date();
  let dataInicio: Date;
  let dataFim: Date = new Date(hoje);

  if (periodo === 'ANUAL') {
    dataInicio = new Date(hoje.getFullYear(), 0, 1);
  } else if (periodo === 'CUSTOM') {
    dataInicio = custom?.dataInicio ? new Date(custom.dataInicio) : new Date(hoje.getTime() - 30 * 86_400_000);
    dataFim    = custom?.dataFim ? new Date(custom.dataFim + 'T23:59:59') : hoje;
  } else {
    // MENSAL — últimos 30 dias
    dataInicio = new Date(hoje.getTime() - 30 * 86_400_000);
  }

  const periodoLabel = periodo === 'ANUAL'
    ? `Ano ${hoje.getFullYear()}`
    : periodo === 'CUSTOM'
      ? `${dataInicio.toLocaleDateString('pt-BR')} – ${dataFim.toLocaleDateString('pt-BR')}`
      : 'Últimos 30 dias';

  const [total, pendentes, emAndamento, resolvidas, byCategory, byPriority, recentDemands, demands] =
    await Promise.all([
      prisma.demand.count({ where: scope }),
      prisma.demand.count({ where: { ...scope, status: 'PENDENTE' } }),
      prisma.demand.count({ where: { ...scope, status: 'EM_ANDAMENTO' } }),
      prisma.demand.count({ where: { ...scope, status: 'RESOLVIDA' } }),
      prisma.demand.groupBy({ by: ['category'], where: scope, _count: { id: true } }),
      prisma.demand.groupBy({ by: ['priority'], where: scope, _count: { id: true } }),
      prisma.demand.findMany({
        where: scope,
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, status: true, priority: true, createdAt: true },
      }),
      prisma.demand.findMany({
        where: { ...scope, createdAt: { gte: dataInicio, lte: dataFim } },
        select: { createdAt: true, status: true, updatedAt: true },
      }),
    ]);

  const timelineMap: Record<string, number> = {};
  const resolvedMap: Record<string, number> = {};
  demands.forEach((d) => {
    const dateStr = d.createdAt.toISOString().split('T')[0];
    timelineMap[dateStr] = (timelineMap[dateStr] ?? 0) + 1;
    if (d.status === 'RESOLVIDA') {
      const resolvedStr = d.updatedAt.toISOString().split('T')[0];
      resolvedMap[resolvedStr] = (resolvedMap[resolvedStr] ?? 0) + 1;
    }
  });

  const timeline: { date: string; count: number; resolved: number }[] = [];
  let lastResolvedDate: string | null = null;
  const diffDays = Math.max(1, Math.ceil((dataFim.getTime() - dataInicio.getTime()) / 86_400_000));
  for (let i = 0; i < diffDays; i++) {
    const day = new Date(dataInicio);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + i);
    const key = day.toISOString().split('T')[0];
    const resolvedCount = resolvedMap[key] ?? 0;
    if (resolvedCount > 0) lastResolvedDate = day.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    timeline.push({ date: day.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), count: timelineMap[key] ?? 0, resolved: resolvedCount });
  }

  const stats: DemandasStats = {
    total:       total       ?? 0,
    pendentes:   pendentes   ?? 0,
    emAndamento: emAndamento ?? 0,
    resolvidas:  resolvidas  ?? 0,
    byCategory:  Object.fromEntries((byCategory ?? []).map((c) => [c.category, c._count.id ?? 0])),
    byPriority:  Object.fromEntries((byPriority ?? []).map((p) => [p.priority, p._count.id ?? 0])),
    recentDemands: recentDemands ?? [],
    timeline:    timeline ?? [],
    lastResolvedDate: lastResolvedDate ?? null,
  };

  return { stats, periodoLabel };
}
