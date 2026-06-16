'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import {
  FileText,
  CheckCircle,
  Clock,
  TrendingUp,
  BarChart3,
  Percent,
  AlertTriangle,
  LayoutDashboard
} from 'lucide-react';
import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { STATUS_COLORS, PRIORITY_COLORS, PRIORITY_LABELS, STATUS_LABELS } from '@/lib/types';
import { DemandPriority, DemandStatus } from '@prisma/client';

const Donut3DChart = dynamic(() => import('@/components/charts/donut-3d-chart'), { ssr: false });
const GradientCard = dynamic(() => import('@/components/charts/gradient-card'), { ssr: false });
const MiniLineChart = dynamic(() => import('@/components/charts/mini-line-chart'), { ssr: false });
const DemandsTimelineChart = dynamic(() => import('@/components/charts/demands-timeline'), { ssr: false });
const DemandsByCategoryChart = dynamic(() => import('@/components/charts/demands-by-category'), { ssr: false });

interface DashboardStats {
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

export default function DashboardPage() {
  const { data: session, status: sessionStatus } = useSession() || {};
  const userRole   = (session?.user as any)?.role       || 'ASSESSOR';
  const gabineteId = (session?.user as any)?.gabineteId as string | undefined;
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Aguarda sessão autenticada para garantir que gabineteId já está resolvido
    if (sessionStatus !== 'authenticated') return;
    const fetchStats = async () => {
      setLoading(true);
      setStats(null);
      try {
        const res = await fetch('/api/dashboard/stats', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [sessionStatus, gabineteId]);

  // Calculate percentages
  const resolvedPercent = stats?.total ? Math.round((stats.resolvidas / stats.total) * 100) : 0;
  const pendingPercent = stats?.total ? Math.round((stats.pendentes / stats.total) * 100) : 0;
  const emAndamentoPercent = stats?.total ? Math.round((stats.emAndamento / stats.total) * 100) : 0;

  // Mini chart acumulado do TOTAL de demandas ao longo dos 30 dias
  const miniChartTotal = (() => {
    let acc = 0;
    return stats?.timeline?.map(t => ({ value: (acc += t.count) })) || [];
  })();

  // Mini chart acumulado de RESOLVIDAS ao longo dos 30 dias
  const miniChartResolved = (() => {
    let acc = 0;
    return stats?.timeline?.map(t => ({ value: (acc += t.resolved) })) || [];
  })();

  // Donut chart data for status
  const statusDonutData = [
    { name: 'Pendentes', value: stats?.pendentes ?? 0, color: STATUS_COLORS?.PENDENTE ?? '#FFC107' },
    { name: 'Em Andamento', value: stats?.emAndamento ?? 0, color: STATUS_COLORS?.EM_ANDAMENTO ?? '#2196F3' },
    { name: 'Resolvidas', value: stats?.resolvidas ?? 0, color: STATUS_COLORS?.RESOLVIDA ?? '#4CAF50' },
  ];

  // Donut chart data for priority
  const priorityDonutData = Object.entries(stats?.byPriority ?? {}).map(([key, value]) => ({
    name: PRIORITY_LABELS?.[key as DemandPriority] ?? key,
    value: value ?? 0,
    color: PRIORITY_COLORS?.[key as DemandPriority] ?? '#9E9E9E'
  }));

  // Best performing stats
  const bestCategory = stats?.byCategory
    ? Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1])[0]
    : null;

  // Prioridade mais frequente (para o donut de prioridade)
  const topPriority = priorityDonutData.length
    ? [...priorityDonutData].sort((a, b) => b.value - a.value)[0]
    : null;

  return (
    <div className="space-y-6 relative">
      {/* Sem overlay — fundo já é claro */}

      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        subtitle="Visão geral do gabinete"
      />

      {/* Gradient Cards Row */}
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <GradientCard
          title="Total de Demandas"
          value={loading ? '-' : stats?.total ?? 0}
          subtitle="Categoria mais frequente"
          subtitleValue={bestCategory ? bestCategory[0] : 'N/A'}
          icon={FileText}
          gradient="teal"
          chart={<MiniLineChart data={miniChartTotal} color="#3b82f6" />}
          delay={0.1}
        />

        <GradientCard
          title="Demandas Resolvidas"
          value={loading ? '-' : stats?.resolvidas ?? 0}
          subtitle="Última resolvida"
          subtitleValue={stats?.lastResolvedDate ?? 'Nenhuma ainda'}
          icon={CheckCircle}
          gradient="purple"
          chart={<MiniLineChart data={miniChartResolved} color="#10b981" />}
          delay={0.2}
        />

        <GradientCard
          title="% Resolução Geral"
          value={`${resolvedPercent}%`}
          subtitle="Pendentes"
          subtitleValue={`${pendingPercent}%`}
          icon={Percent}
          gradient="pink"
          chart={
            <div className="flex flex-col justify-end h-full gap-2 pb-1">
              <div className="flex h-2 rounded-full overflow-hidden" style={{ background: '#f3f4f6' }}>
                <div title="Resolvidas" style={{ width: `${resolvedPercent}%`, background: '#d97706' }} />
                <div title="Em Andamento" style={{ width: `${emAndamentoPercent}%`, background: '#fbbf24' }} />
                <div title="Pendentes" style={{ width: `${pendingPercent}%`, background: '#fde68a' }} />
              </div>
              <div className="flex justify-between text-[10px] font-medium" style={{ color: '#6b7280' }}>
                <span>{stats?.resolvidas ?? 0} resolvidas</span>
                <span>{(stats?.pendentes ?? 0) + (stats?.emAndamento ?? 0)} em aberto</span>
              </div>
            </div>
          }
          delay={0.3}
        />
      </div>

      {/* Charts Row */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Donut Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="backdrop-blur-sm rounded-2xl p-5"
          style={{ background: '#ffffff', border: '1px solid #e5eaf3', boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.04)' }}
        >
          <div className="flex items-center gap-2.5 mb-5">
            <div style={{ padding: 7, borderRadius: 9, background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.2)' }}>
              <BarChart3 className="h-4 w-4" style={{ color: '#3b82f6' }} />
            </div>
            <h3 className="font-semibold text-sm" style={{ color: '#111827' }}>Demandas por Status</h3>
          </div>
          <div className="h-[280px]">
            <Donut3DChart
              data={statusDonutData}
              centerValue={stats?.total ?? 0}
              centerLabel="Total"
            />
          </div>
        </motion.div>

        {/* Priority Donut Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="backdrop-blur-sm rounded-2xl p-5"
          style={{ background: '#ffffff', border: '1px solid #e5eaf3', boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.04)' }}
        >
          <div className="flex items-center gap-2.5 mb-5">
            <div style={{ padding: 7, borderRadius: 9, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <AlertTriangle className="h-4 w-4" style={{ color: '#f59e0b' }} />
            </div>
            <h3 className="font-semibold text-sm" style={{ color: '#111827' }}>Demandas por Prioridade</h3>
          </div>
          <div className="h-[280px]">
            <Donut3DChart
              data={priorityDonutData}
              centerValue={topPriority ? topPriority.value : 0}
              centerLabel={topPriority ? topPriority.name : 'Sem dados'}
            />
          </div>
        </motion.div>
      </div>

      {/* Table and Bar Chart Row */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Demands Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="backdrop-blur-sm rounded-2xl p-5"
          style={{ background: '#ffffff', border: '1px solid #e5eaf3', boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.04)' }}
        >
          <div className="flex items-center gap-2.5 mb-5">
            <div style={{ padding: 7, borderRadius: 9, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.2)' }}>
              <FileText className="h-4 w-4" style={{ color: '#10b981' }} />
            </div>
            <h3 className="font-semibold text-sm" style={{ color: '#111827' }}>Demandas Recentes</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs border-b" style={{ color: '#9ca3af', borderColor: '#f3f4f6' }}>
                  <th className="pb-3 font-medium">Título</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Prioridade</th>
                </tr>
              </thead>
              <tbody>
                {stats?.recentDemands?.slice(0, 5)?.map((demand: any, index: number) => (
                  <tr key={demand.id || index} className="last:border-0" style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td className="py-3 text-sm" style={{ color: '#111827' }}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: STATUS_COLORS?.[demand.status as DemandStatus] || '#6B7280' }}
                        />
                        <span className="truncate max-w-[150px]">{demand.title}</span>
                      </div>
                    </td>
                    <td className="py-3">
                      <span 
                        className="text-xs px-2 py-1 rounded-full"
                        style={{ 
                          backgroundColor: `${STATUS_COLORS?.[demand.status as DemandStatus]}20`,
                          color: STATUS_COLORS?.[demand.status as DemandStatus]
                        }}
                      >
                        {STATUS_LABELS?.[demand.status as DemandStatus] || demand.status}
                      </span>
                    </td>
                    <td className="py-3">
                      <span 
                        className="text-xs px-2 py-1 rounded-full"
                        style={{ 
                          backgroundColor: `${PRIORITY_COLORS?.[demand.priority as DemandPriority]}20`,
                          color: PRIORITY_COLORS?.[demand.priority as DemandPriority]
                        }}
                      >
                        {PRIORITY_LABELS?.[demand.priority as DemandPriority] || demand.priority}
                      </span>
                    </td>
                  </tr>
                )) || (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-gray-500">
                      Nenhuma demanda encontrada
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Category Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="backdrop-blur-sm rounded-2xl p-5"
          style={{ background: '#ffffff', border: '1px solid #e5eaf3', boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.04)' }}
        >
          <div className="flex items-center gap-2.5 mb-5">
            <div style={{ padding: 7, borderRadius: 9, background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)' }}>
              <BarChart3 className="h-4 w-4" style={{ color: '#8b5cf6' }} />
            </div>
            <h3 className="font-semibold text-sm" style={{ color: '#111827' }}>Demandas por Categoria</h3>
          </div>
          <div className="h-[280px]">
            <DemandsByCategoryChart data={stats?.byCategory} darkMode={true} />
          </div>
        </motion.div>
      </div>

      {/* Timeline Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="relative z-10 backdrop-blur-sm rounded-2xl p-5"
        style={{ background: '#ffffff', border: '1px solid #e5eaf3', boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.04)' }}
      >
        <div className="flex items-center gap-2.5 mb-5">
          <div style={{ padding: 7, borderRadius: 9, background: 'rgba(74,158,222,0.12)', border: '1px solid rgba(74,158,222,0.2)' }}>
            <TrendingUp className="h-4 w-4" style={{ color: '#4a9ede' }} />
          </div>
          <h3 className="font-semibold text-sm" style={{ color: '#111827' }}>Evolução de Demandas</h3>
        </div>
        <div className="h-[250px]">
          <DemandsTimelineChart data={stats?.timeline} darkMode={true} />
        </div>
      </motion.div>
    </div>
  );
}
