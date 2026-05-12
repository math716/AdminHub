'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { PRIORITY_LABELS, PRIORITY_COLORS } from '@/lib/types';
import { DemandPriority } from '@prisma/client';

interface Props {
  data: Record<string, number> | undefined;
}

export default function DemandsByPriorityChart({ data }: Props) {
  const chartData = Object.entries(data ?? {})?.map?.(([key, value]) => ({
    name: PRIORITY_LABELS?.[key as DemandPriority] ?? key,
    value: value ?? 0,
    color: PRIORITY_COLORS?.[key as DemandPriority] ?? '#9E9E9E'
  }))?.filter?.((item) => (item?.value ?? 0) > 0) ?? [];

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
          outerRadius={100}
          dataKey="value"
          label={({ name, percent }) => `${name} ${((percent ?? 0) * 100)?.toFixed?.(0)}%`}
          labelLine={false}
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
