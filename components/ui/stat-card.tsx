'use client';

import * as React from 'react';
import { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  /** Cor temática — pinta ícone, label de delta, barra esquerda. Use hex/rgb. */
  color: string;
  /** Delay da animação de entrada. */
  delay?: number;
  /** Barra colorida na esquerda. Default true. */
  leftAccent?: boolean;
  /** @deprecated use leftAccent — mantido por retrocompat. */
  bottomAccent?: boolean;
  className?: string;
  onClick?: () => void;
}

/**
 * Card de KPI padronizado.
 *
 * Visual flat: surface sólida, barra colorida na esquerda na cor da categoria,
 * label em uppercase pequeno, valor grande tabular-nums, ícone sutil à direita.
 *
 * Substitui o antigo card com glass-blur + gradient interno.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  color,
  delay = 0,
  leftAccent = true,
  bottomAccent,
  className,
  onClick,
}: StatCardProps) {
  // Se a chamada antiga passou bottomAccent=false, respeita
  const showAccent = bottomAccent !== undefined ? bottomAccent : leftAccent;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.25 }}
      onClick={onClick}
      className={cn(
        'relative overflow-hidden rounded-xl p-4 transition-colors duration-150',
        onClick && 'cursor-pointer hover:[border-color:var(--border-strong)]',
        className
      )}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-default)',
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p
            className="text-[11px] uppercase tracking-[0.08em] font-semibold truncate"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {label}
          </p>
          <p
            className="text-2xl sm:text-[28px] font-semibold mt-1 tabular-nums leading-none"
            style={{ color: 'var(--text-primary)' }}
          >
            {value}
          </p>
        </div>
        {Icon && (
          <div
            className="p-2.5 rounded-lg flex-shrink-0"
            style={{ background: `${color}1A`, color }}
          >
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
      {showAccent && (
        <div
          className="absolute left-0 top-0 bottom-0 w-[3px]"
          style={{ background: color }}
        />
      )}
    </motion.div>
  );
}
