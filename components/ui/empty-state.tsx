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
            background: 'rgba(201,162,39,0.10)',
            border: '1px solid rgba(201,162,39,0.22)',
          }}
        >
          <Icon className="h-6 w-6" style={{ color: '#c9a227' }} />
        </div>
      )}
      <p className="font-semibold" style={{ color: '#111827' }}>{title}</p>
      {description && (
        <p className="text-sm mt-1 max-w-md mx-auto" style={{ color: '#6b7280' }}>{description}</p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </Card>
  );
}
