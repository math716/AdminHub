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
      <div className="h-full flex items-center justify-center text-gray-400">
        Sem dados disponíveis
      </div>
    );
  }

  // Custom gradient colors for 3D effect
  const getGradientId = (index: number) => `gradient-${index}`;

  return (
    <div className="relative h-full w-full">
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
              <stop offset="50%" stopColor={entry.color} stopOpacity={0.8} />
              <stop offset="100%" stopColor={entry.color} stopOpacity={0.6} />
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
          {/* Shadow layer for 3D depth effect */}
          <Pie
            data={filteredData}
            cx="50%"
            cy="55%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={3}
            dataKey="value"
            stroke="none"
          >
            {filteredData.map((entry, index) => (
              <Cell 
                key={`shadow-${index}`} 
                fill="rgba(0,0,0,0.2)"
              />
            ))}
          </Pie>
          
          {/* Main donut */}
          <Pie
            data={filteredData}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={3}
            dataKey="value"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={1}
          >
            {filteredData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={`url(#${getGradientId(index)})`}
                style={{
                  filter: 'drop-shadow(2px 4px 6px rgba(0,0,0,0.3))',
                }}
              />
            ))}
          </Pie>

          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            wrapperStyle={{ outline: 'none', zIndex: 50 }}
            contentStyle={{
              backgroundColor: 'rgba(13, 27, 42, 0.97)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '10px',
              color: '#fff',
              fontSize: '12px',
              padding: '8px 12px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            }}
            itemStyle={{ color: '#fff', padding: '2px 0' }}
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
          <div className="text-center">
            {centerValue !== undefined && (
              <div className="text-2xl font-bold text-white">{centerValue}</div>
            )}
            {centerLabel && (
              <div className="text-xs text-gray-400">{centerLabel}</div>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      {!hideLegend && (
        <div className="absolute bottom-0 left-0 right-0 flex flex-wrap justify-center gap-3 px-2">
          {filteredData.map((entry, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: entry.color, boxShadow: `0 0 6px ${entry.color}` }}
              />
              <span className="text-xs text-gray-300">{entry.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
