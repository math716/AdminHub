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
 * Estado de carregamento padronizado. Na tela inteira mostra o esqueleto de
 * uma lista de cartões (a página já parece montada); `inline` mantém os três
 * pontos, para dentro de listas e botões.
 */
export function LoadingState({
  label = 'Carregando',
  inline = false,
  className,
}: LoadingStateProps) {
  if (!inline) {
    return (
      <div className={cn('grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3', className)} aria-busy="true" aria-label={label}>
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="esqueleto rounded-2xl h-40" />)}
      </div>
    );
  }
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-6', className)}>
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#2563EB', animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#2563EB', animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#2563EB', animationDelay: '300ms' }} />
      </div>
      {label && (
        <p className="text-[11px] tracking-widest uppercase" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
      )}
    </div>
  );
}
