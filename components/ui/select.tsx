'use client';

import * as React from 'react';
import * as Radix from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'size'> {
  label?: string;
  error?: string;
  options: SelectOption[];
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  placeholder?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const Select = React.forwardRef<HTMLButtonElement, SelectProps>(
  ({ className, label, error, options, value, onChange, disabled, placeholder, name, id }, ref) => {

    const handleValueChange = (newValue: string) => {
      onChange?.({ target: { value: newValue } } as React.ChangeEvent<HTMLSelectElement>);
    };

    return (
      <div className={cn('w-full', className)}>
        {label && (
          <label
            htmlFor={id}
            className="block text-xs font-semibold uppercase tracking-widest mb-1.5"
            style={{ color: 'rgba(255,255,255,0.45)' }}
          >
            {label}
          </label>
        )}

        <Radix.Root
          value={value ?? ''}
          onValueChange={handleValueChange}
          disabled={disabled}
          name={name}
        >
          {/* ── Trigger ── */}
          <Radix.Trigger
            ref={ref}
            id={id}
            className={cn(
              'group w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl text-sm',
              'transition-all duration-150 outline-none cursor-pointer',
              'hover:bg-white/[0.09] hover:[border-color:rgba(255,255,255,0.22)]',
              'data-[state=open]:bg-white/[0.09] data-[state=open]:[border-color:rgba(201,162,39,0.45)]',
              'data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed',
              'focus-visible:ring-2 focus-visible:ring-amber-500/30',
            )}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: error
                ? '1px solid rgba(239,68,68,0.55)'
                : '1px solid rgba(255,255,255,0.11)',
            }}
          >
            <Radix.Value
              placeholder={
                <span style={{ color: 'rgba(255,255,255,0.28)' }}>
                  {placeholder ?? 'Selecionar…'}
                </span>
              }
            />
            <Radix.Icon asChild>
              <ChevronDown
                className="h-4 w-4 flex-shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180"
                style={{ color: 'rgba(255,255,255,0.38)' }}
              />
            </Radix.Icon>
          </Radix.Trigger>

          {/* ── Dropdown panel ── */}
          <Radix.Portal>
            <Radix.Content
              className={cn(
                'z-[9999] overflow-hidden',
                'w-[var(--radix-select-trigger-width)]',
                // open
                'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97]',
                'data-[state=open]:data-[side=bottom]:slide-in-from-top-1',
                'data-[state=open]:data-[side=top]:slide-in-from-bottom-1',
                // close
                'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.97]',
              )}
              style={{
                background: 'rgba(5,18,36,0.98)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(201,162,39,0.18)',
                borderRadius: '0.875rem',
                boxShadow:
                  '0 24px 64px rgba(0,0,0,0.72), 0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
              }}
              position="popper"
              sideOffset={6}
              avoidCollisions
            >
              <Radix.ScrollUpButton
                className="flex items-center justify-center h-7 select-none"
                style={{ color: 'rgba(255,255,255,0.3)' }}
              >
                <ChevronDown className="h-3.5 w-3.5 rotate-180" />
              </Radix.ScrollUpButton>

              <Radix.Viewport className="p-1.5 max-h-60">
                {options?.map?.((opt) => (
                  <Radix.Item
                    key={opt.value}
                    value={opt.value}
                    disabled={opt.disabled}
                    className={cn(
                      'group relative flex items-center gap-2 pl-3 pr-8 py-2.5 rounded-lg text-sm',
                      'cursor-pointer outline-none select-none transition-all duration-100',
                      'text-white/65',
                      'data-[highlighted]:bg-white/[0.07] data-[highlighted]:text-white',
                      'data-[state=checked]:bg-[rgba(201,162,39,0.08)] data-[state=checked]:text-[#e6c84a] data-[state=checked]:font-medium',
                      'data-[disabled]:opacity-35 data-[disabled]:pointer-events-none',
                    )}
                  >
                    {/* Gold left accent — visible when selected */}
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[55%] rounded-r-full opacity-0 group-data-[state=checked]:opacity-100 transition-opacity duration-150"
                      style={{ background: 'linear-gradient(to bottom, #e6c84a, #c9a227)' }}
                    />

                    <Radix.ItemText>{opt.label}</Radix.ItemText>

                    {/* Checkmark — visible when selected */}
                    <Radix.ItemIndicator className="absolute right-3 flex items-center">
                      <Check className="h-3.5 w-3.5" style={{ color: '#c9a227' }} />
                    </Radix.ItemIndicator>
                  </Radix.Item>
                ))}
              </Radix.Viewport>

              <Radix.ScrollDownButton
                className="flex items-center justify-center h-7 select-none"
                style={{ color: 'rgba(255,255,255,0.3)' }}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Radix.ScrollDownButton>
            </Radix.Content>
          </Radix.Portal>
        </Radix.Root>

        {error && (
          <p className="mt-1.5 text-xs" style={{ color: '#f87171' }}>{error}</p>
        )}
      </div>
    );
  }
);
Select.displayName = 'Select';

export { Select };
