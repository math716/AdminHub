'use client';

import * as React from 'react';
import { LucideIcon } from 'lucide-react';
import { brand } from '@/lib/theme';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  /** Ícone do lado esquerdo (lucide). Se omitido, não renderiza box. */
  icon?: LucideIcon;
  /** Cor do ícone — default gold da marca. */
  iconColor?: string;
  title: string;
  subtitle?: React.ReactNode;
  /** Slot à direita — tipicamente botões de ação. */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Cabeçalho padronizado para todas as páginas do dashboard.
 *
 * - h1 sempre `text-2xl font-bold tracking-tight`
 * - Subtítulo sempre `text-slate-400 text-sm`
 * - Ícone (opcional) em box gold com borda
 * - Actions alinhadas à direita
 *
 * Use em vez de inventar header novo em cada página.
 */
export function PageHeader({
  icon: Icon,
  iconColor = brand.gold,
  title,
  subtitle,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4',
        className
      )}
    >
      <div className="flex items-center gap-3 md:gap-4 min-w-0">
        {Icon && (
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: `${iconColor}26`,
              border: `1px solid ${iconColor}55`,
              boxShadow: `inset 0 0 12px ${iconColor}1A`,
            }}
          >
            <Icon className="w-5 h-5" style={{ color: iconColor }} />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight truncate" style={{ color: '#111827' }}>{title}</h1>
          {subtitle && (
            <p className="text-sm mt-0.5" style={{ color: '#6b7280' }}>{subtitle}</p>
          )}
        </div>
      </div>

      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0 self-stretch sm:self-auto">
          {actions}
        </div>
      )}
    </div>
  );
}
