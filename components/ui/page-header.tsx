'use client';

import * as React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  /** Ícone do lado esquerdo (lucide). Se omitido, não renderiza. */
  icon?: LucideIcon;
  /** Cor do ícone — default cobalto. */
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
 * Visual flat: kicker em ardósia, h1 em peso 500/600, sem caixa colorida ao redor
 * do ícone — só o ícone na cor escolhida ao lado do título.
 */
export function PageHeader({
  icon: Icon,
  iconColor = 'var(--brand-cobalt)',
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
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              background: 'var(--brand-cobalt-soft)',
              color: iconColor,
            }}
          >
            <Icon className="w-5 h-5" />
          </div>
        )}
        <div className="min-w-0">
          <h1
            className="text-2xl font-semibold tracking-tight truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              {subtitle}
            </p>
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
