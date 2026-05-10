'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, options, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {label}
          </label>
        )}
        <div className="relative">
          <select
            className={cn(
              'w-full px-4 py-2.5 rounded-xl text-white text-sm',
              'appearance-none cursor-pointer transition-all duration-200 outline-none',
              error && 'border-red-500/60',
              className
            )}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: error ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.1)',
              colorScheme: 'dark',
            }}
            ref={ref}
            {...props}
          >
            {options?.map?.((option) => (
              <option key={option?.value} value={option?.value} style={{ background: '#071d36', color: '#fff' }}>
                {option?.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: 'rgba(255,255,255,0.4)' }} />
        </div>
        {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
      </div>
    );
  }
);
Select.displayName = 'Select';

export { Select };
