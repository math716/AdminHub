'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, icon, type, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {icon}
            </div>
          )}
          <input
            type={type}
            className={cn(
              'w-full px-4 py-2.5 rounded-xl text-white text-sm outline-none transition-all duration-200',
              'placeholder:text-white/20',
              icon && 'pl-10',
              error && 'border-red-500/60',
              className
            )}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: error ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.1)',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(74,158,222,0.5)')}
            onBlur={e => (e.currentTarget.style.borderColor = error ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)')}
            ref={ref}
            {...props}
          />
        </div>
        {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';

export { Input };
