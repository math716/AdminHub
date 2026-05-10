'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { STATUS_LABELS, STATUS_COLORS } from '@/lib/types';

interface Props {
  data: {
    pendentes: number;
    emAndamento: number;
    resolvidas: number;
  } | null;
}

export default function DemandsByStatusChart({ data }: Props) {
  const chartData = [
    { name: 'Pendentes', value: data?.pendentes ?? 0, color: STATUS_COLORS?.PENDENTE ?? '#FFC107' },
    { name: 'Em Andamento', value: data?.emAndamento ?? 0, color: STATUS_COLORS?.EM_ANDAMENTO ?? '#2196F3' },
    { name: 'Resolvidas', value: data?.resolvidas ?? 0, color: STATUS_COLORS?.RESOLVIDA ?? '#4CAF50' },
  ]?.filter?.((item) => (item?.value ?? 0) > 0) ?? [];

  if ((chartData?.length ?? 0) === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        Sem dados disponíveis
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={5}
          dataKey="value"
        >
          {chartData?.map?.((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry?.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ fontSize: 11 }}
          formatter={(value: number) => [value, 'Quantidade']}
        />
        <Legend
          verticalAlign="top"
          wrapperStyle={{ fontSize: 11 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
