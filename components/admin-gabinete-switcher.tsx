'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Building2, Search, Loader2, ChevronRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Gabinete {
  id: string;
  nome: string;
  descricao: string | null;
  _count: { users: number };
}

interface Props {
  /** Quando true exibe o modal de seleção obrigatória (sem fechar) */
  required?: boolean;
  /** Quando false exibe apenas o modal opcional (com botão fechar) */
  open?: boolean;
  onClose?: () => void;
}

export function AdminGabineteSwitcher({ required = false, open = false, onClose }: Props) {
  const { update } = useSession();
  const [gabinetes, setGabinetes] = useState<Gabinete[]>([]);
  const [search,    setSearch]    = useState('');
  const [loading,   setLoading]   = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);

  const visible = required || open;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/gabinetes');
      if (res.ok) setGabinetes(await res.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const select = async (g: Gabinete) => {
    setSelecting(g.id);
    await update({ gabineteId: g.id, gabineteNome: g.nome });
    // Força reload para que todos os hooks de sessão reflitam o novo gabineteId
    window.location.reload();
  };

  const filtered = gabinetes.filter(g =>
    g.nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .includes(search.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))
  );

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
        onClick={e => { if (!required && e.target === e.currentTarget) onClose?.(); }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-md rounded-2xl overflow-hidden"
          style={{ background: '#071d36', border: '1px solid rgba(37,99,235,0.2)' }}
        >
          {/* Header */}
          <div className="px-6 pt-6 pb-4">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.3)' }}>
                  <Building2 className="w-4 h-4" style={{ color: '#2563EB' }} />
                </div>
                <div>
                  <h2 className="text-[color:var(--text-primary)] font-bold text-base">Selecionar Gabinete</h2>
                  <p className="text-xs" style={{ color: 'var(--tint-45)' }}>
                    {required ? 'Escolha um gabinete para acessar o sistema' : 'Trocar gabinete ativo'}
                  </p>
                </div>
              </div>
              {!required && onClose && (
                <button onClick={onClose}
                  className="p-1.5 rounded-lg transition-all hover:bg-[var(--tint-10)]"
                  style={{ color: 'var(--tint-45)' }}>
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Search */}
            <div className="relative mt-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                style={{ color: 'var(--tint-35)' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar gabinete..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-white placeholder:text-slate-600 outline-none"
                style={{ background: 'var(--tint-04)', border: '1px solid var(--tint-08)' }}
              />
            </div>
          </div>

          {/* List */}
          <div className="max-h-72 overflow-y-auto px-2 pb-4"
            style={{ borderTop: '1px solid var(--tint-06)' }}>
            {loading ? (
              <div className="py-10 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#2563EB' }} />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-center text-sm" style={{ color: 'var(--tint-35)' }}>
                {search ? `Nenhum resultado para "${search}"` : 'Nenhum gabinete encontrado'}
              </div>
            ) : (
              filtered.map(g => (
                <button
                  key={g.id}
                  onClick={() => select(g)}
                  disabled={!!selecting}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl mt-1 transition-all hover:bg-white/[0.06] text-left disabled:opacity-50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(74,158,222,0.12)', border: '1px solid rgba(74,158,222,0.2)' }}>
                      {selecting === g.id
                        ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#4a9ede' }} />
                        : <Building2 className="w-4 h-4" style={{ color: '#4a9ede' }} />
                      }
                    </div>
                    <div className="min-w-0">
                      <p className="text-[color:var(--text-primary)] text-sm font-medium truncate">{g.nome}</p>
                      <p className="text-[11px]" style={{ color: 'var(--tint-35)' }}>
                        {g._count.users} usuário{g._count.users !== 1 ? 's' : ''}
                        {g.descricao ? ` · ${g.descricao}` : ''}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--tint-25)' }} />
                </button>
              ))
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
