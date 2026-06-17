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
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'size' | 'value'> {
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
  (
    {
      className,
      label,
      error,
      options,
      value,
      onChange,
      disabled,
      placeholder,
      name,
      id,
    },
    ref,
  ) => {
    const handleValueChange = (newValue: string) => {
      // Reconvert the internal sentinel '__NONE__' back to ''
      const outValue = newValue === '__NONE__' ? '' : newValue;
      onChange?.({
        target: { value: outValue },
      } as React.ChangeEvent<HTMLSelectElement>);
    };

    // Radix Select does not handle value="" gracefully — map '' to a sentinel
    const radixValue =
      value === '' || value === undefined ? '__NONE__' : value;

    // Build options, ensuring a sentinel entry exists when value can be empty
    const hasBlankOption = options?.some((o) => o.value === '');
    const radixOptions: SelectOption[] = hasBlankOption
      ? options.map((o) => (o.value === '' ? { ...o, value: '__NONE__' } : o))
      : options ?? [];

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
          value={radixValue}
          onValueChange={handleValueChange}
          disabled={disabled}
          name={name}
        >
          {/* ── Trigger ── */}
          <Radix.Trigger
            ref={ref}
            id={id}
            className={cn(
              'group w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl text-sm text-white',
              'transition-all duration-150 outline-none cursor-pointer',
              'hover:bg-white/[0.09] hover:[border-color:rgba(255,255,255,0.22)]',
              'data-[state=open]:bg-white/[0.09] data-[state=open]:[border-color:rgba(37,99,235,0.45)]',
              'data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed',
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
              className="z-[9999] overflow-hidden select-dropdown-content"
              style={{
                minWidth: 'var(--radix-select-trigger-width)',
                background: 'rgba(5,18,36,0.98)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(37,99,235,0.2)',
                borderRadius: '0.875rem',
                boxShadow:
                  '0 24px 64px rgba(0,0,0,0.72), 0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
                transformOrigin: 'var(--radix-select-content-transform-origin)',
                animation: 'selectSlideIn 0.15s cubic-bezier(0.16,1,0.3,1)',
              }}
              position="popper"
              sideOffset={6}
              avoidCollisions
              collisionPadding={12}
            >
              <Radix.ScrollUpButton
                className="flex items-center justify-center h-6 select-none"
                style={{ color: 'rgba(255,255,255,0.3)' }}
              >
                <ChevronDown className="h-3.5 w-3.5 rotate-180" />
              </Radix.ScrollUpButton>

              <Radix.Viewport className="p-1.5" style={{ maxHeight: 'min(220px, calc(var(--radix-select-content-available-height) - 16px))' }}>
                {radixOptions.map((opt) => (
                  <Radix.Item
                    key={opt.value}
                    value={opt.value}
                    disabled={opt.disabled}
                    className="select-item group relative flex items-center pl-3 pr-8 py-2.5 rounded-lg text-sm cursor-pointer outline-none select-none"
                  >
                    {/* Gold left accent bar — rendered via CSS class */}
                    <span className="select-item-accent absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[55%] rounded-r-full" />

                    <Radix.ItemText>{opt.label}</Radix.ItemText>

                    <Radix.ItemIndicator className="absolute right-3 flex items-center">
                      <Check className="h-3.5 w-3.5" style={{ color: '#2563EB' }} />
                    </Radix.ItemIndicator>
                  </Radix.Item>
                ))}
              </Radix.Viewport>

              <Radix.ScrollDownButton
                className="flex items-center justify-center h-6 select-none"
                style={{ color: 'rgba(255,255,255,0.3)' }}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Radix.ScrollDownButton>
            </Radix.Content>
          </Radix.Portal>
        </Radix.Root>

        {error && (
          <p className="mt-1.5 text-xs" style={{ color: '#f87171' }}>
            {error}
          </p>
        )}
      </div>
    );
  },
);
Select.displayName = 'Select';

export { Select };
