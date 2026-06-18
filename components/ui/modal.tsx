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
  dark?: boolean;
}

export function Modal({ isOpen, onClose, title, children, size = 'md', dark = false }: ModalProps) {
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
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className={cn(
              'relative rounded-2xl shadow-2xl',
              'w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto',
              sizes[size]
            )}
            style={dark ? {
              background: 'linear-gradient(160deg, #071d36 0%, #0c2a4f 100%)',
              border: '1px solid rgba(37,99,235,0.2)',
              boxShadow: '0 25px 60px rgba(4,17,31,0.7)'
            } : { background: '#fff', border: '1px solid #e5e7eb' }}
          >
            <div className={cn(
              'sticky top-0 px-6 py-4 border-b flex items-center justify-between rounded-t-2xl',
              dark ? 'border-white/8' : 'bg-white border-gray-200'
            )}
            style={dark ? { background: 'var(--bg-card-raised)', backdropFilter: 'blur(8px)' } : {}}>
              {title && <h2 className={cn('text-lg font-bold tracking-tight', dark ? 'text-white' : 'text-gray-900')}>{title}</h2>}
              <button
                onClick={onClose}
                className={cn('p-2 rounded-lg transition-colors ml-auto', dark ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-gray-100')}
              >
                <X className={cn('h-5 w-5', dark ? 'text-gray-400' : 'text-gray-500')} />
              </button>
            </div>
            <div className="p-6">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
