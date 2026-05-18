'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { surface } from '@/lib/theme';

type Variant = 'panel' | 'raised' | 'subtle';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  /**
   * Variante de surface — default "panel".
   * - panel: rgba(7,29,54,0.75) + border gold 15%   (padrão)
   * - raised: rgba(7,29,54,0.85) + border gold 22%  (destaque)
   * - subtle: rgba(255,255,255,0.04) + border 7%    (subcard interno)
   */
  variant?: Variant;
  /** Remove o padding default (p-6) — útil quando o conteúdo controla. */
  noPadding?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, hover = false, variant = 'panel', noPadding = false, style, ...props }, ref) => {
    const s = surface[variant];
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-xl',
          !noPadding && 'p-6',
          hover && 'cursor-pointer transition-all duration-200 hover:border-[rgba(201,162,39,0.32)]',
          className
        )}
        style={{
          background: s.background,
          border: s.border,
          backdropFilter: 'backdropFilter' in s ? (s as any).backdropFilter : 'blur(8px)',
          ...style,
        }}
        {...props}
      />
    );
  }
);
Card.displayName = 'Card';

/** Alias semântico — use `Panel` quando estiver pensando em "container", `Card` quando em "card". */
const Panel = Card;

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 pb-4', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-xl font-semibold text-white', className)} {...props} />
  )
);
CardTitle.displayName = 'CardTitle';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('', className)} {...props} />
);
CardContent.displayName = 'CardContent';

export { Card, Panel, CardHeader, CardTitle, CardContent };
