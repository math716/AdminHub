'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading-state';
import { Star, Trash2, MapPin, Calendar, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { ESTADOS_BRASIL } from '@/lib/types';
import { PERMISSIONS, hasPermission } from '@/lib/permissions';
import { Avatar, CampoFiltro, comAlfa } from '@/components/mapa/comparacao-visual';
import { corDoCargo, rotuloCargo } from '@/components/mapa-campanha/visual';

interface Favorite {
  id: string;
  candidateName: string;
  ano: number;
  cargo: string | null;
  uf: string;
  createdAt: string;
}

export default function FavoritosPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const userRole = (session?.user as any)?.role;
  const userPermissions = (session?.user as any)?.permissions ?? [];
  const canAccess = hasPermission({ role: userRole, permissions: userPermissions }, PERMISSIONS.MAPA_ELEITORAL);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const visiveis = (favorites ?? []).filter(f => !busca.trim() || semAcento(f?.candidateName ?? '').includes(semAcento(busca.trim())));

  useEffect(() => {
    if (status === 'authenticated' && !canAccess) {
      router.replace('/dashboard');
    }
  }, [status, canAccess, router]);

  useEffect(() => {
    const fetchFavorites = async () => {
      try {
        const res = await fetch('/api/favorites');
        if (res.ok) {
          const data = await res.json();
          setFavorites(data ?? []);
        }
      } catch (error) {
        console.error('Error fetching favorites:', error);
      } finally {
        setLoading(false);
      }
    };
    if (canAccess) {
      fetchFavorites();
    }
  }, [canAccess]);

  const handleDelete = (id: string) => setConfirmDeleteId(id);

  const doDelete = async () => {
    if (!confirmDeleteId) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    try {
      const res = await fetch(`/api/favorites/${id}`, { method: 'DELETE' });
      if (res.ok) setFavorites(favorites?.filter?.(f => f?.id !== id) ?? []);
    } catch (error) {
      console.error('Error deleting favorite:', error);
    }
  };

  const getEstadoNome = (sigla: string) => {
    return ESTADOS_BRASIL?.find?.(e => e?.sigla === sigla)?.nome ?? sigla;
  };

  if (status === 'loading' || loading) {
    return <LoadingState />;
  }

  if (!canAccess) {
    return null;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Star}
        title="Candidatos Favoritos"
        subtitle="Acesse rapidamente os dados eleitorais dos seus candidatos salvos"
        actions={
          <Link href="/dashboard/mapa">
            <Button>
              <MapPin className="h-5 w-5 mr-2" />
              Ir para o Mapa
            </Button>
          </Link>
        }
      />

      {(favorites?.length ?? 0) === 0 ? (
        <EmptyState
          icon={Star}
          title="Você ainda não tem candidatos favoritos"
          description="Busque candidatos no Mapa Eleitoral e salve-os aqui para acesso rápido."
          action={
            <Link href="/dashboard/mapa">
              <Button variant="outline">
                Buscar candidatos no mapa
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {(favorites?.length ?? 0) > 6 && (
            <div className="flex justify-end">
              <CampoFiltro valor={busca} onChange={setBusca} placeholder="Buscar candidato" />
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {visiveis.map((fav, index) => {
              const cor = corDoCargo(fav?.cargo ?? '');
              return (
                <motion.div
                  key={fav?.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.04, 0.3) }}
                >
                  <Link
                    href={`/dashboard/mapa?candidato=${encodeURIComponent(fav?.candidateName ?? '')}&ano=${fav?.ano}&uf=${fav?.uf}`}
                    className="group relative block rounded-2xl p-4 overflow-hidden transition-all hover:-translate-y-0.5"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}
                  >
                    <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${cor}, ${comAlfa(cor, 0.25)})` }} />
                    <span aria-hidden className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none rounded-2xl"
                      style={{ boxShadow: `inset 0 0 0 1px ${comAlfa(cor, 0.5)}` }} />
                    <div className="flex items-start gap-3">
                      <Avatar nome={fav?.candidateName ?? ''} cor={cor} tamanho={42} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-bold leading-snug line-clamp-2" style={{ color: 'var(--text-primary)' }} title={fav?.candidateName}>{fav?.candidateName}</p>
                        <p className="text-[11.5px] mt-0.5 truncate" style={{ color: 'var(--text-tertiary)' }}>{fav?.cargo ? rotuloCargo(fav.cargo) : 'Candidato'}</p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(fav?.id); }}
                        className="acao-no-hover p-1.5 rounded-lg transition-all hover:bg-red-500/15 flex-shrink-0"
                        style={{ color: '#ef4444' }}
                        aria-label="Remover favorito"
                        title="Remover favorito"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold" style={{ background: 'var(--tint-06)', color: 'var(--text-secondary)' }}>
                        <MapPin className="h-3 w-3" /> {getEstadoNome(fav?.uf)}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold" style={{ background: comAlfa(cor, 0.14), color: cor }}>
                        <Calendar className="h-3 w-3" /> Eleição {fav?.ano}
                      </span>
                    </div>
                    <div className="flex items-center justify-end mt-3.5 pt-3" style={{ borderTop: '1px solid var(--border-default)' }}>
                      <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--brand-cobalt-text)' }}>
                        Ver no mapa <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
          {visiveis.length === 0 && (
            <p className="text-sm text-center py-8" style={{ color: 'var(--text-tertiary)' }}>Nenhum favorito com “{busca.trim()}”.</p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Remover favorito?"
        message="Este candidato será removido da sua lista de favoritos."
        confirmLabel="Sim, remover"
        variant="danger"
        onConfirm={doDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
