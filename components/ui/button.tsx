'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, children, disabled, style, ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center justify-center gap-2 font-medium rounded-lg tracking-wide transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-transparent disabled:opacity-50 disabled:cursor-not-allowed';

    const sizes = {
      sm: 'px-3 py-1.5 text-xs',
      md: 'px-4 py-2.5 text-sm',
      lg: 'px-6 py-3 text-sm',
    };

    const variantStyles: Record<NonNullable<ButtonProps['variant']>, React.CSSProperties> = {
      primary: {
        background: 'var(--brand-cobalt)',
        color: '#FFFFFF',
      },
      secondary: {
        background: 'var(--success)',
        color: '#FFFFFF',
      },
      outline: {
        background: 'transparent',
        border: '1px solid var(--brand-cobalt)',
        color: 'var(--brand-cobalt)',
      },
      ghost: {
        background: 'transparent',
        color: 'var(--brand-cobalt-text)',
      },
      danger: {
        background: 'var(--danger)',
        color: '#FFFFFF',
      },
    };

    return (
      <button
        className={cn(baseStyles, sizes[size], 'hover:brightness-110 active:brightness-95', className)}
        ref={ref}
        disabled={disabled || loading}
        style={{ ...variantStyles[variant], ...style }}
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
