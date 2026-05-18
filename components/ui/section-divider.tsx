'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface SectionDividerProps {
  label: string;
  /** Slot à direita — chips, contagens, etc. */
  trailing?: React.ReactNode;
  className?: string;
}

/**
 * Divisor de seção — label em gold uppercase + linha hairline gradient.
 *
 * Mesmo padrão usado no sidebar. Use para subdividir páginas longas
 * (Configurações, formulários grandes, modais).
 */
export function SectionDivider({ label, trailing, className }: SectionDividerProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span
        className="text-[10px] font-bold uppercase tracking-[0.2em] flex-shrink-0"
        style={{ color: 'rgba(201,162,39,0.75)' }}
      >
        {label}
      </span>
      <span
        className="flex-1 h-px"
        style={{
          background: 'linear-gradient(90deg, rgba(201,162,39,0.3), transparent)',
        }}
      />
      {trailing && <span className="flex-shrink-0">{trailing}</span>}
    </div>
  );
}
