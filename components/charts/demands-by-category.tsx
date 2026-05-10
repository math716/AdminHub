'use client';

import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell, LabelList } from 'recharts';
import { CATEGORY_LABELS, CATEGORY_COLORS } from '@/lib/types';
import { DemandCategory } from '@prisma/client';
import { useEffect, useState } from 'react';

interface Props {
  data: Record<string, number> | undefined;
  darkMode?: boolean;
}

export default function DemandsByCategoryChart({ data, darkMode = false }: Props) {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  const chartData = Object.entries(data ?? {})?.map?.(([key, value]) => ({
    name: CATEGORY_LABELS?.[key as DemandCategory] ?? key,
    value: value ?? 0,
    color: CATEGORY_COLORS?.[key as DemandCategory] ?? '#6B7280',
    fullName: CATEGORY_LABELS?.[key as DemandCategory] ?? key,
  }))?.sort?.((a, b) => (b?.value ?? 0) - (a?.value ?? 0))?.slice(0, 6) ?? [];

  if (!mounted || (chartData?.length ?? 0) === 0) {
    return (
      <div className={`h-full flex items-center justify-center ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
        Sem dados disponíveis
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
        <XAxis 
          type="number" 
          axisLine={false}
          tickLine={false}
          tick={{ fill: darkMode ? '#9CA3AF' : '#6B7280', fontSize: 11 }}
        />
        <YAxis 
          type="category" 
          dataKey="name" 
          axisLine={false}
          tickLine={false}
          tick={{ fill: darkMode ? '#E5E7EB' : '#374151', fontSize: 11 }}
          width={80}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: darkMode ? 'rgba(15, 23, 42, 0.95)' : '#fff',
            border: darkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid #e5e7eb',
            borderRadius: '8px',
            color: darkMode ? '#fff' : '#374151',
            fontSize: '12px',
          }}
          formatter={(value: number, name: string, props: any) => [
            value,
            props?.payload?.fullName || 'Quantidade'
          ]}
        />
        <Bar 
          dataKey="value" 
          radius={[0, 6, 6, 0]}
          barSize={20}
        >
          {chartData?.map?.((entry, index) => (
            <Cell 
              key={`cell-${index}`} 
              fill={entry?.color}
              style={{
                filter: darkMode ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' : 'none',
              }}
            />
          ))}
          <LabelList 
            dataKey="value" 
            position="right" 
            fill={darkMode ? '#fff' : '#374151'}
            fontSize={11}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
