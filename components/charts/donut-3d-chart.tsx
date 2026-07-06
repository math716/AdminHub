'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useEffect, useState } from 'react';

interface DonutData {
  name: string;
  value: number;
  color: string;
}

interface Props {
  data: DonutData[];
  title?: string;
  centerValue?: string | number;
  centerLabel?: string;
  /** Esconde a legenda interna (útil quando o card pai já tem sua própria lista). */
  hideLegend?: boolean;
  /** Formatador customizado pro valor do tooltip (ex.: BRL). Padrão: toLocaleString. */
  valueFormatter?: (value: number) => string;
}

export default function Donut3DChart({
  data,
  title,
  centerValue,
  centerLabel,
  hideLegend = false,
  valueFormatter,
}: Props) {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  const filteredData = data?.filter?.((item) => (item?.value ?? 0) > 0) ?? [];
  const total = filteredData.reduce((acc, item) => acc + (item?.value ?? 0), 0);

  if (!mounted || filteredData.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[color:var(--text-tertiary)]">
        Sem dados disponíveis
      </div>
    );
  }

  // Custom gradient colors for 3D effect
  const getGradientId = (index: number) => `gradient-${index}`;

  return (
    <div className={`h-full w-full ${hideLegend ? 'relative' : 'flex flex-col'}`}>
      {/* Chart area */}
      <div className={hideLegend ? 'relative h-full' : 'relative flex-1 min-h-0'}>
      {/* SVG Gradients for 3D effect */}
      <svg width="0" height="0">
        <defs>
          {filteredData.map((entry, index) => (
            <linearGradient
              key={getGradientId(index)}
              id={getGradientId(index)}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor={entry.color} stopOpacity={1} />
              <stop offset="100%" stopColor={entry.color} stopOpacity={1} />
            </linearGradient>
          ))}
          {/* Shadow filter for 3D depth */}
          <filter id="shadow-3d" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="2" dy="4" stdDeviation="4" floodColor="rgba(0,0,0,0.3)" />
          </filter>
        </defs>
      </svg>

      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={filteredData}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={3}
            dataKey="value"
            stroke="var(--tint-08)"
            strokeWidth={1}
          >
            {filteredData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.color}
              />
            ))}
          </Pie>

          <Tooltip
            cursor={{ fill: 'var(--tint-04)' }}
            wrapperStyle={{ outline: 'none', zIndex: 50 }}
            contentStyle={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-default)',
              borderRadius: '10px',
              color: 'var(--text-primary)',
              fontSize: '12px',
              padding: '8px 12px',
              boxShadow: 'var(--shadow-raised)',
            }}
            itemStyle={{ color: 'var(--text-primary)', padding: '2px 0' }}
            labelStyle={{ display: 'none' }}
            separator=" "
            formatter={(value: number, name: string) => {
              const formatted = valueFormatter ? valueFormatter(value) : value.toLocaleString('pt-BR');
              const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
              return [`${formatted} (${pct}%)`, name];
            }}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Center content */}
      {(centerValue !== undefined || centerLabel) && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center px-1">
            {centerValue !== undefined && (
              <div className="text-sm font-bold text-[color:var(--text-primary)] leading-tight">{centerValue}</div>
            )}
            {centerLabel && (
              <div className="text-[10px] text-[color:var(--text-secondary)] leading-tight">{centerLabel}</div>
            )}
          </div>
        </div>
      )}

      </div>{/* end chart area */}

      {/* Legend — below chart, not overlapping */}
      {!hideLegend && (
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 px-2 pt-2 pb-1">
          {filteredData.map((entry, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: entry.color, boxShadow: `0 0 6px ${entry.color}` }}
              />
              <span className="text-xs text-[color:var(--text-secondary)]">{entry.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
