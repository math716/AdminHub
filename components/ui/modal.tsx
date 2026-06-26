'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** @deprecated mantido por retrocompat — modal agora segue o tema. */
  dark?: boolean;
}

export function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
  };

  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-start justify-center" style={{ paddingTop: '8px', paddingBottom: '8px' }}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0"
            style={{ background: 'var(--modal-backdrop)' }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className={cn(
              'relative rounded-2xl shadow-2xl',
              'w-[calc(100%-2rem)] max-h-[calc(100vh-1rem)] overflow-y-auto',
              sizes[size]
            )}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
              boxShadow: 'var(--shadow-raised)',
            }}
          >
            <div
              className="sticky top-0 px-6 py-4 flex items-center justify-between rounded-t-2xl"
              style={{
                background: 'var(--bg-card)',
                borderBottom: '1px solid var(--border-default)',
              }}
            >
              {title && (
                <h2 className="text-lg font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                  {title}
                </h2>
              )}
              <button
                onClick={onClose}
                className="p-2 rounded-lg transition-colors ml-auto"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
