'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading-state';
import { Star, Trash2, MapPin, Calendar, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { ESTADOS_BRASIL } from '@/lib/types';
import { PERMISSIONS, hasPermission } from '@/lib/permissions';

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {favorites?.map?.((fav, index) => (
            <motion.div
              key={fav?.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index * 0.05, 0.3) }}
              whileHover={{ y: -2 }}
            >
              <Card hover className="h-full flex flex-col">
                <CardContent className="flex flex-col flex-1">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="p-2.5 rounded-lg flex-shrink-0"
                        style={{
                          background: 'rgba(37,99,235,0.15)',
                          border: '1px solid rgba(37,99,235,0.35)',
                          boxShadow: 'inset 0 0 10px rgba(37,99,235,0.10)',
                        }}
                      >
                        <Star className="h-5 w-5" style={{ color: '#2563EB' }} fill="#2563EB" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-[color:var(--text-primary)] truncate">{fav?.candidateName}</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 truncate">{fav?.cargo ?? 'Candidato'}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(fav?.id)}
                      className="ml-2 p-1.5 rounded-lg text-slate-600 dark:text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
                      aria-label="Remover favorito"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-4 space-y-2 flex-1">
                    <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <MapPin className="h-4 w-4 text-slate-600 dark:text-slate-500" />
                      {getEstadoNome(fav?.uf)}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <Calendar className="h-4 w-4 text-slate-600 dark:text-slate-500" />
                      Eleição de {fav?.ano}
                    </div>
                  </div>

                  <div
                    className="mt-4 pt-4"
                    style={{ borderTop: '1px solid rgba(37,99,235,0.18)' }}
                  >
                    <Link
                      href={`/dashboard/mapa?candidato=${encodeURIComponent(fav?.candidateName ?? '')}&ano=${fav?.ano}&uf=${fav?.uf}`}
                    >
                      <Button variant="outline" size="sm" className="w-full">
                        Ver no Mapa
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
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
