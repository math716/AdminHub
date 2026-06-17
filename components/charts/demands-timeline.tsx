'use client';

import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { useEffect, useState } from 'react';

interface Props {
  data: { date: string; count: number }[] | undefined;
  darkMode?: boolean;
}

export default function DemandsTimelineChart({ data, darkMode = false }: Props) {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  const chartData = data?.map?.(item => ({
    ...item,
    formattedDate: new Date(item?.date)?.toLocaleDateString?.('pt-BR', { day: '2-digit', month: 'short' }) ?? item?.date
  })) ?? [];

  if (!mounted || (chartData?.length ?? 0) === 0) {
    return (
      <div className={`h-full flex items-center justify-center ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
        Sem dados disponíveis
      </div>
    );
  }

  const gradientId = darkMode ? 'timelineGradientDark' : 'timelineGradientLight';
  const strokeColor = darkMode ? '#1D4ED8' : '#1e3a5f';
  const gradientStart = darkMode ? '#1D4ED8' : '#1e3a5f';
  const gradientEnd = darkMode ? 'rgba(201, 150, 26, 0.1)' : 'rgba(30, 58, 95, 0.1)';

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={gradientStart} stopOpacity={0.4} />
            <stop offset="95%" stopColor={gradientEnd} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <XAxis 
          dataKey="formattedDate" 
          tick={{ fill: darkMode ? '#9CA3AF' : '#6B7280', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis 
          tick={{ fill: darkMode ? '#9CA3AF' : '#6B7280', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: darkMode ? 'rgba(15, 23, 42, 0.95)' : '#fff',
            border: darkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid #e5e7eb',
            borderRadius: '8px',
            color: darkMode ? '#fff' : '#374151',
            fontSize: '12px',
          }}
          formatter={(value: number) => [value, 'Demandas']}
          labelFormatter={(label) => `Data: ${label}`}
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke={strokeColor}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{ r: 4, fill: strokeColor }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
