'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

type Variant = 'panel' | 'raised' | 'subtle';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  /**
   * Variante de surface — default "panel".
   * - panel: bg-card + border default (padrão)
   * - raised: bg-card-raised + sombra mais forte
   * - subtle: bg-card-subtle (sub-região interna)
   */
  variant?: Variant;
  /** Remove o padding default (p-6) — útil quando o conteúdo controla. */
  noPadding?: boolean;
}

const VARIANT_STYLES: Record<Variant, React.CSSProperties> = {
  panel: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
  },
  raised: {
    background: 'var(--bg-card-raised)',
    border: '1px solid var(--border-default)',
    boxShadow: 'var(--shadow-raised)',
  },
  subtle: {
    background: 'var(--bg-card-subtle)',
    border: '1px solid var(--border-subtle)',
  },
};

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, hover = false, variant = 'panel', noPadding = false, style, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-xl',
          !noPadding && 'p-6',
          hover && 'cursor-pointer transition-colors duration-150 hover:[border-color:var(--border-strong)]',
          className
        )}
        style={{
          ...VARIANT_STYLES[variant],
          color: 'var(--text-primary)',
          ...style,
        }}
        {...props}
      />
    );
  }
);
Card.displayName = 'Card';

const Panel = Card;

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 pb-4', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, style, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('text-lg font-semibold', className)}
      style={{ color: 'var(--text-primary)', ...style }}
      {...props}
    />
  )
);
CardTitle.displayName = 'CardTitle';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('', className)} {...props} />
);
CardContent.displayName = 'CardContent';

export { Card, Panel, CardHeader, CardTitle, CardContent };
