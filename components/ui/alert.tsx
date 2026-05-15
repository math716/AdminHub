import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const alertVariants = cva(
  cn(
    'relative w-full rounded-xl border p-4',
    // Posicionamento do ícone (lucide) à esquerda
    '[&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:h-4 [&>svg]:w-4',
    '[&>svg+div]:translate-y-[-3px] [&>svg~*]:pl-7'
  ),
  {
    variants: {
      variant: {
        default:
          'bg-navy-base/75 border-gold/20 text-white backdrop-blur-md [&>svg]:text-gold',
        info:
          'bg-blue-bright/10 border-blue-bright/30 text-blue-bright [&>svg]:text-blue-bright',
        success:
          'bg-state-success/10 border-state-success/35 text-state-success [&>svg]:text-state-success',
        warning:
          'bg-state-warning/10 border-state-warning/35 text-state-warning [&>svg]:text-state-warning',
        destructive:
          'bg-state-danger/10 border-state-danger/40 text-state-danger [&>svg]:text-state-danger',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
));
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn('mb-1 font-semibold leading-none tracking-tight', className)}
    {...props}
  />
));
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('text-sm opacity-90 [&_p]:leading-relaxed', className)}
    {...props}
  />
));
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription };
