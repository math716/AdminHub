'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface GradientCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  subtitleValue?: string | number;
  icon?: LucideIcon;
  gradient: 'teal' | 'purple' | 'pink' | 'blue' | 'orange';
  chart?: ReactNode;
  delay?: number;
}

const palette: Record<string, { accent: string; iconBg: string; iconBorder: string; chartColor: string }> = {
  teal:   { accent: '#2563eb', iconBg: '#eff6ff', iconBorder: '#bfdbfe', chartColor: '#3b82f6' },
  purple: { accent: '#059669', iconBg: '#ecfdf5', iconBorder: '#6ee7b7', chartColor: '#10b981' },
  pink:   { accent: '#d97706', iconBg: '#fffbeb', iconBorder: '#fde68a', chartColor: '#f59e0b' },
  blue:   { accent: '#2563eb', iconBg: '#eff6ff', iconBorder: '#bfdbfe', chartColor: '#3b82f6' },
  orange: { accent: '#ea580c', iconBg: '#fff7ed', iconBorder: '#fdba74', chartColor: '#f97316' },
};

export default function GradientCard({
  title, value, subtitle, subtitleValue, icon: Icon, gradient, chart, delay = 0,
}: GradientCardProps) {
  const p = palette[gradient] ?? palette.blue;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      style={{
        background: '#ffffff',
        border: '1px solid #e5eaf3',
        borderTop: `3px solid ${p.accent}`,
        borderRadius: 14,
        padding: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.04)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <p style={{
          color: '#6b7280', fontSize: 11, fontWeight: 600,
          letterSpacing: '0.07em', textTransform: 'uppercase',
        }}>
          {title}
        </p>
        {Icon && (
          <div style={{
            padding: 9, borderRadius: 10,
            background: p.iconBg, border: `1px solid ${p.iconBorder}`,
          }}>
            <Icon style={{ width: 17, height: 17, color: p.accent }} />
          </div>
        )}
      </div>

      {/* Value */}
      <p style={{
        color: '#111827', fontSize: 34, fontWeight: 700,
        letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 10,
      }}>
        {value}
      </p>

      {/* Subtitle */}
      {subtitle && (
        <div style={{ marginBottom: chart ? 14 : 0 }}>
          <span style={{ color: '#9ca3af', fontSize: 11 }}>{subtitle} </span>
          {subtitleValue !== undefined && subtitleValue !== '' && (
            <span style={{ color: '#374151', fontWeight: 600, fontSize: 12 }}>{subtitleValue}</span>
          )}
        </div>
      )}

      {/* Chart slot — passa chartColor via data attribute para o componente pai injetar */}
      {chart && (
        <div style={{ height: 52, marginTop: 4 }} data-chart-color={p.chartColor}>
          {chart}
        </div>
      )}
    </motion.div>
  );
}
