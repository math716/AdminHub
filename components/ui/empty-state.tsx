'use client';

import * as React from 'react';
import { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
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
    <Card className={cn('text-center py-12', className)}>
      {Icon && (
        <div
          className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
          style={{
            background: 'rgba(37,99,235,0.10)',
            border: '1px solid rgba(37,99,235,0.22)',
          }}
        >
          <Icon className="h-6 w-6" style={{ color: '#2563EB' }} />
        </div>
      )}
      <p className="text-[color:var(--text-primary)] font-semibold">{title}</p>
      {description && (
        <p className="text-slate-600 dark:text-slate-400 text-sm mt-1 max-w-md mx-auto">{description}</p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </Card>
  );
}
