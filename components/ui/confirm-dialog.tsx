'use client';

import { AlertTriangle, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const isDanger = variant === 'danger';
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const content = (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="absolute inset-0"
            style={{ background: 'var(--bg-card-raised)', backdropFilter: 'blur(3px)' }}
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ type: 'spring', damping: 22, stiffness: 260 }}
            className="relative w-full max-w-sm mx-4"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-default)',
              borderRadius: 18,
              boxShadow: 'var(--shadow-raised)',
              color: 'var(--text-primary)',
            }}
          >
            {/* Top accent line */}
            <span
              className="absolute top-0 left-0 right-0 h-[2px] rounded-t-[18px] pointer-events-none"
              style={{
                background: isDanger
                  ? 'linear-gradient(90deg, transparent, rgba(239,68,68,0.7), transparent)'
                  : 'linear-gradient(90deg, transparent, rgba(74,158,222,0.7), transparent)',
              }}
            />

            <div className="p-6">
              {/* Icon + title */}
              <div className="flex items-start gap-4 mb-4">
                <span
                  className="flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0 mt-0.5"
                  style={{
                    background: isDanger ? 'rgba(239,68,68,0.15)' : 'rgba(74,158,222,0.15)',
                    border: isDanger ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(74,158,222,0.3)',
                  }}
                >
                  {isDanger
                    ? <AlertTriangle className="w-5 h-5" style={{ color: '#ef4444' }} />
                    : <HelpCircle className="w-5 h-5" style={{ color: '#4a9ede' }} />
                  }
                </span>
                <div>
                  <h3 className="text-[color:var(--text-primary)] font-bold text-base leading-snug">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--tint-55)' }}>
                    {message}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 justify-end mt-6">
                <button
                  onClick={onCancel}
                  className="px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150"
                  style={{
                    background: 'var(--tint-06)',
                    color: 'var(--tint-75)',
                    border: '1px solid var(--tint-10)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--tint-10)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--tint-06)')}
                >
                  {cancelLabel}
                </button>
                <button
                  onClick={onConfirm}
                  className="px-4 py-2 rounded-lg text-sm font-bold transition-all duration-150 text-[color:var(--text-primary)]"
                  style={
                    isDanger
                      ? { background: 'linear-gradient(135deg, #dc2626, #ef4444)', boxShadow: '0 4px 14px rgba(220,38,38,0.35)' }
                      : { background: 'linear-gradient(135deg, #1d6fd8, #4a9ede)', boxShadow: '0 4px 14px rgba(74,158,222,0.35)' }
                  }
                >
                  {confirmLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  if (!mounted) return null;
  return createPortal(content, document.body);
}
