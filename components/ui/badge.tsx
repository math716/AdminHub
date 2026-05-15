'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'gold';
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variants = {
    default: 'bg-white/[0.08] text-white/70 border-white/15',
    success: 'bg-state-success/15 text-state-success border-state-success/25',
    warning: 'bg-state-warning/15 text-state-warning border-state-warning/25',
    danger:  'bg-state-danger/15  text-state-danger  border-state-danger/25',
    info:    'bg-blue-bright/15   text-blue-bright   border-blue-bright/25',
    // Destaque identitário — usar com moderação (status de assinante, role admin, etc.)
    gold:    'bg-gold/15          text-gold-light    border-gold/35',
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
