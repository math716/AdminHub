'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'gold';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, children, disabled, ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center justify-center gap-2 font-semibold rounded-xl tracking-wide transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-navy-deep disabled:opacity-50 disabled:cursor-not-allowed';

    const variants = {
      primary:   'bg-blue-action hover:bg-blue-action/85 text-white focus:ring-blue-action/60',
      secondary: 'bg-emerald-700 hover:bg-emerald-800 text-white focus:ring-emerald-600',
      outline:   'border-2 border-blue-bright/60 text-blue-bright hover:bg-blue-bright/10 focus:ring-blue-bright/40',
      ghost:     'text-blue-bright hover:bg-white/[0.08] focus:ring-blue-bright/40',
      danger:    'bg-state-danger hover:bg-state-danger/85 text-white focus:ring-state-danger/60',
      // CTA principal — destaque dourado. Usar em ações de alta importância.
      gold:      'bg-gold hover:bg-gold-light text-navy-deep shadow-gold-glow focus:ring-gold/60',
    };

    const sizes = {
      sm: 'px-3.5 py-1.5 text-xs',
      md: 'px-5 py-2.5 text-sm',
      lg: 'px-7 py-3 text-sm',
    };

    return (
      <button
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';

export { Button };
