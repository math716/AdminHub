'use client';

import * as React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Estado vazio padronizado — use sempre que listar algo que pode estar vazio.
 *
 * Ex.: "Nenhuma demanda encontrada", "Você ainda não tem favoritos".
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('rounded-2xl text-center py-12 px-6', className)}
      style={{ background: 'var(--bg-card)', border: '1.5px dashed var(--border-strong)', boxShadow: 'var(--shadow-card)' }}>
      {Icon && (
        <span className="relative inline-flex mb-4">
          <span aria-hidden className="absolute inset-0 rounded-2xl blur-xl" style={{ background: 'var(--brand-cobalt-soft)' }} />
          <span className="relative w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'var(--brand-cobalt-soft)', border: '1px solid var(--border-default)', color: 'var(--brand-cobalt-text)' }}>
            <Icon className="h-6 w-6" />
          </span>
        </span>
      )}
      <p className="text-[color:var(--text-primary)] font-semibold">{title}</p>
      {description && (
        <p className="text-sm mt-1 max-w-md mx-auto" style={{ color: 'var(--text-tertiary)' }}>{description}</p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
