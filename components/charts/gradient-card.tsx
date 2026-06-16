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

const palette: Record<string, { color: string; bg: string; glow: string }> = {
  teal:   { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  glow: 'rgba(59,130,246,0.07)'  },
  purple: { color: '#10b981', bg: 'rgba(16,185,129,0.12)',  glow: 'rgba(16,185,129,0.07)'  },
  pink:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  glow: 'rgba(245,158,11,0.07)'  },
  blue:   { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  glow: 'rgba(59,130,246,0.07)'  },
  orange: { color: '#f97316', bg: 'rgba(249,115,22,0.12)',  glow: 'rgba(249,115,22,0.07)'  },
};

export default function GradientCard({
  title, value, subtitle, subtitleValue, icon: Icon, gradient, chart, delay = 0,
}: GradientCardProps) {
  const p = palette[gradient] ?? palette.blue;

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 16,
        padding: '20px 20px 18px',
        background: 'rgba(255,255,255,0.028)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderLeft: `3px solid ${p.color}`,
        boxShadow: '0 8px 32px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.06)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Ambient glow from accent */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `linear-gradient(105deg, ${p.glow} 0%, transparent 45%)`,
      }} />

      {/* Header row */}
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <p style={{
          color: 'rgba(255,255,255,0.38)', fontSize: 11, fontWeight: 600,
          letterSpacing: '0.09em', textTransform: 'uppercase', lineHeight: 1,
        }}>
          {title}
        </p>
        {Icon && (
          <div style={{
            padding: '8px', borderRadius: 10,
            background: p.bg,
            border: `1px solid ${p.color}22`,
            flexShrink: 0,
          }}>
            <Icon style={{ width: 17, height: 17, color: p.color }} />
          </div>
        )}
      </div>

      {/* Value */}
      <p style={{
        position: 'relative',
        color: '#f1f5f9', fontSize: 34, fontWeight: 700,
        letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 10,
      }}>
        {value}
      </p>

      {/* Subtitle */}
      {subtitle && (
        <div style={{ position: 'relative', marginBottom: chart ? 14 : 0 }}>
          <span style={{ color: 'rgba(255,255,255,0.28)', fontSize: 11 }}>{subtitle} </span>
          {subtitleValue !== undefined && subtitleValue !== '' && (
            <span style={{ color: 'rgba(255,255,255,0.62)', fontWeight: 600, fontSize: 12 }}>{subtitleValue}</span>
          )}
        </div>
      )}

      {/* Mini chart */}
      {chart && (
        <div style={{ position: 'relative', height: 52 }}>
          {chart}
        </div>
      )}
    </motion.div>
  );
}
