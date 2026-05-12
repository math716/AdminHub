'use client';

import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { useEffect, useState } from 'react';

interface Props {
  data: { value: number }[];
  color?: string;
}

export default function MiniLineChart({ data, color = '#fff' }: Props) {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !data || data.length === 0) {
    return null;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="miniChartGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill="url(#miniChartGradient)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
