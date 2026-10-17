'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X, type LucideIcon } from 'lucide-react';
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
  /** Linha de apoio abaixo do título. */
  subtitulo?: React.ReactNode;
  /** Ícone ao lado do título (cabeçalho no padrão premium). */
  icone?: LucideIcon;
  /** Cor do ícone e do filete do topo (hex). */
  cor?: string;
  /** Barra fixa no rodapé — os botões ficam sempre à vista, mesmo com rolagem. */
  rodape?: React.ReactNode;
}

/** Hex (#rrggbb) com transparência. */
function comAlfa(hex: string, alfa: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alfa})`;
}

export function Modal({ isOpen, onClose, title, children, size = 'md', subtitulo, icone: Icone, cor = '#2563eb', rodape }: ModalProps) {
  const [mounted, setMounted] = React.useState(false);

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
  };

  React.useEffect(() => {
    setMounted(true);
  }, []);

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

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ padding: '1rem' }}>
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
              'w-[calc(100%-2rem)] altura-janela overflow-y-auto',
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
              className="sticky top-0 z-10 px-6 py-4 flex items-center justify-between gap-3 rounded-t-2xl"
              style={{
                background: 'var(--bg-card)',
                borderBottom: '1px solid var(--border-default)',
              }}
            >
              {Icone && (
                <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] rounded-t-2xl"
                  style={{ background: `linear-gradient(90deg, ${cor}, ${comAlfa(cor, 0.15)})` }} />
              )}
              {Icone && (
                <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: comAlfa(cor, 0.12), color: cor, border: `1px solid ${comAlfa(cor, 0.25)}` }}>
                  <Icone className="h-5 w-5" />
                </span>
              )}
              {(title || subtitulo) && (
                <div className="min-w-0 flex-1">
                  {title && (
                    <h2 className="text-lg font-semibold tracking-tight leading-tight break-words" style={{ color: 'var(--text-primary)' }}>
                      {title}
                    </h2>
                  )}
                  {subtitulo && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{subtitulo}</p>
                  )}
                </div>
              )}
              <button
                onClick={onClose}
                className="p-2 rounded-lg transition-colors ml-auto flex-shrink-0 hover:bg-[var(--tint-06)]"
                style={{ color: 'var(--text-tertiary)' }}
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6">{children}</div>
            {rodape && (
              <div className="sticky bottom-0 z-10 px-6 py-3.5 flex flex-wrap items-center justify-end gap-2.5 rounded-b-2xl"
                style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border-default)' }}>
                {rodape}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
