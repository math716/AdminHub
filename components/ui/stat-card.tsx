'use client';

import * as React from 'react';
import { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  /** Cor temática — pinta label, ícone, borda, glow. */
  color: string;
  /** Delay da animação de entrada. */
  delay?: number;
  /** Linha gradient fina no rodapé. Default true. */
  bottomAccent?: boolean;
  className?: string;
  onClick?: () => void;
}

/**
 * Card de KPI padronizado.
 *
 * Visual: linha gradient na cor temática no rodapé, label na cor com glow,
 * valor grande em branco, box do ícone tingido. Hover sutil em scale.
 *
 * Usado em Demandas, Agenda, Configurações etc — qualquer faixa de métricas.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  color,
  delay = 0,
  bottomAccent = true,
  className,
  onClick,
}: StatCardProps) {
  const tint = `${color}1A`;   // 10% alpha
  const border = `${color}40`; // 25% alpha

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      whileHover={{ y: -2 }}
      onClick={onClick}
      className={cn(
        'relative overflow-hidden rounded-xl p-4',
        onClick && 'cursor-pointer',
        className
      )}
      style={{
        background: '#ffffff',
        border: `1px solid #e5eaf3`,
        borderTop: `3px solid ${color}`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.04)',
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p
            className="text-[11px] uppercase tracking-widest font-semibold truncate"
            style={{ color, textShadow: `0 0 12px ${color}55` }}
          >
            {label}
          </p>
          <p className="text-2xl sm:text-3xl font-bold mt-1 tabular-nums leading-none" style={{ color: '#111827' }}>
            {value}
          </p>
        </div>
        {Icon && (
          <div
            className="p-2.5 rounded-lg flex-shrink-0"
            style={{ background: tint, border: `1px solid ${border}` }}
          >
            <Icon className="h-5 w-5" style={{ color }} />
          </div>
        )}
      </div>
      {bottomAccent && (
        <div
          className="absolute left-0 right-0 bottom-0 h-[2px]"
          style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
        />
      )}
    </motion.div>
  );
}
