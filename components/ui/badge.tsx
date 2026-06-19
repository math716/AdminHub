'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variants = {
    default: 'bg-[var(--tint-08)] text-white/70 border-[var(--tint-14)]',
    success: 'bg-emerald-500/15 text-[color:var(--success)] border-emerald-500/25',
    warning: 'bg-amber-500/15 text-[color:var(--brand-cobalt)] border-amber-500/25',
    danger:  'bg-red-500/15 text-red-400 border-red-500/25',
    info:    'bg-[#4a9ede]/15 text-[#4a9ede] border-[#4a9ede]/25',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide border',
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
