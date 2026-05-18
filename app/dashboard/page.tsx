'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
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
  timeline: { date: string; count: number }[];
}

export default function DashboardPage() {
  const { data: session } = useSession() || {};
  const userRole = (session?.user as any)?.role || 'ASSESSOR';
  const gabineteName = (session?.user as any)?.gabineteName || 'AdminHub';
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/dashboard/stats');
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
  }, []);

  // Calculate percentages
  const resolvedPercent = stats?.total ? Math.round((stats.resolvidas / stats.total) * 100) : 0;
  const pendingPercent = stats?.total ? Math.round((stats.pendentes / stats.total) * 100) : 0;
  
  // Mini chart acumulado: mostra o crescimento total de demandas ao longo dos ultimos 30 dias
  const miniChartData = (() => {
    let acc = 0;
    return stats?.timeline?.map(t => ({ value: (acc += t.count) })) || [];
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

  return (
    <div className="space-y-6 relative">
      {/* Grade sutil de fundo */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        subtitle="Visão geral do gabinete"
        actions={
          <div className="text-right">
            <p className="text-sm text-slate-400">{gabineteName}</p>
            <Badge variant={userRole === 'ADMIN' ? 'danger' : userRole === 'CHEFE' ? 'success' : 'info'}>
              {userRole === 'ADMIN' ? 'Administrador' : userRole === 'CHEFE' ? 'Chefe de Gabinete' : 'Assessor'}
            </Badge>
          </div>
        }
      />

      {/* Gradient Cards Row */}
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <GradientCard
          title="Total de Demandas"
          value={loading ? '-' : stats?.total ?? 0}
          subtitle="Mês com mais demandas"
          subtitleValue={bestCategory ? bestCategory[0] : 'N/A'}
          icon={FileText}
          gradient="teal"
          chart={<MiniLineChart data={miniChartData} color="#fff" />}
          delay={0.1}
        />

        <GradientCard
          title="Demandas Resolvidas"
          value={loading ? '-' : stats?.resolvidas ?? 0}
          subtitle="Taxa de resolução"
          subtitleValue={`${resolvedPercent}%`}
          icon={CheckCircle}
          gradient="purple"
          chart={<MiniLineChart data={miniChartData} color="#fff" />}
          delay={0.2}
        />

        <GradientCard
          title="% Resolução Geral"
          value={`${resolvedPercent}%`}
          subtitle="Pendentes"
          subtitleValue={`${pendingPercent}%`}
          icon={Percent}
          gradient="pink"
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
          style={{ background: 'rgba(7,29,54,0.75)', border: '1px solid rgba(201,162,39,0.18)' }}
        >
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-5 w-5" style={{ color: '#c9a227' }} />
            <h3 className="text-white font-semibold">Demandas por Status</h3>
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
          style={{ background: 'rgba(7,29,54,0.75)', border: '1px solid rgba(201,162,39,0.18)' }}
        >
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-5 w-5" style={{ color: '#c9a227' }} />
            <h3 className="text-white font-semibold">Demandas por Prioridade</h3>
          </div>
          <div className="h-[280px]">
            <Donut3DChart 
              data={priorityDonutData}
              centerValue={`${resolvedPercent}%`}
              centerLabel="Resolvidas"
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
          style={{ background: 'rgba(7,29,54,0.75)', border: '1px solid rgba(201,162,39,0.18)' }}
        >
          <div className="flex items-center gap-2 mb-4">
            <FileText className="h-5 w-5" style={{ color: '#c9a227' }} />
            <h3 className="text-white font-semibold">Demandas Recentes</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs border-b" style={{ color: '#8fa3bf', borderColor: 'rgba(30,74,128,0.5)' }}>
                  <th className="pb-3 font-medium">Título</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Prioridade</th>
                </tr>
              </thead>
              <tbody>
                {stats?.recentDemands?.slice(0, 5)?.map((demand: any, index: number) => (
                  <tr key={demand.id || index} className="last:border-0" style={{ borderBottom: '1px solid rgba(30,74,128,0.3)' }}>
                    <td className="py-3 text-white text-sm">
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
          style={{ background: 'rgba(7,29,54,0.75)', border: '1px solid rgba(201,162,39,0.18)' }}
        >
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-5 w-5" style={{ color: '#c9a227' }} />
            <h3 className="text-white font-semibold">Demandas por Categoria</h3>
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
        style={{ background: 'rgba(7,29,54,0.75)', border: '1px solid rgba(201,162,39,0.18)' }}
      >
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-5 w-5" style={{ color: '#c9a227' }} />
          <h3 className="text-white font-semibold">Evolução de Demandas</h3>
        </div>
        <div className="h-[250px]">
          <DemandsTimelineChart data={stats?.timeline} darkMode={true} />
        </div>
      </motion.div>
    </div>
  );
}
