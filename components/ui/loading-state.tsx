'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface LoadingStateProps {
  label?: string;
  /** Modo inline para usar dentro de listas (sem padding gigante). */
  inline?: boolean;
  className?: string;
}

/**
 * Estado de carregamento padronizado — três dots gold pulsando,
 * mesmo padrão usado no layout.tsx do dashboard.
 */
export function LoadingState({
  label = 'Carregando',
  inline = false,
  className,
}: LoadingStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3',
        inline ? 'py-6' : 'py-16',
        className
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className="w-1.5 h-1.5 rounded-full animate-bounce"
          style={{ background: '#2563EB', animationDelay: '0ms' }}
        />
        <span
          className="w-1.5 h-1.5 rounded-full animate-bounce"
          style={{ background: '#2563EB', animationDelay: '150ms' }}
        />
        <span
          className="w-1.5 h-1.5 rounded-full animate-bounce"
          style={{ background: '#2563EB', animationDelay: '300ms' }}
        />
      </div>
      {label && (
        <p
          className="text-[11px] tracking-widest uppercase"
          style={{ color: 'var(--tint-35)' }}
        >
          {label}
        </p>
      )}
    </div>
  );
}
