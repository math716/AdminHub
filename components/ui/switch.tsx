'use client';

import * as React from 'react';
import * as SwitchPrimitives from '@radix-ui/react-switch';

import { cn } from '@/lib/utils';

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    ref={ref}
    className={cn(
      // Trilho
      'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors',
      'border-white/15',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/55 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-deep',
      'disabled:cursor-not-allowed disabled:opacity-50',
      // Estados
      'data-[state=unchecked]:bg-white/[0.08]',
      'data-[state=checked]:bg-gold data-[state=checked]:border-gold/70',
      className
    )}
    {...props}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        'pointer-events-none block h-5 w-5 rounded-full shadow-md ring-0 transition-transform',
        'bg-white',
        'data-[state=checked]:translate-x-[20px] data-[state=unchecked]:translate-x-[2px]'
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
