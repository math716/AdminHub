'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Star, Trash2, MapPin, Calendar, User, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { ESTADOS_BRASIL } from '@/lib/types';

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
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'authenticated' && userRole !== 'CHEFE' && userRole !== 'ADMIN') {
      router.replace('/dashboard');
    }
  }, [status, userRole, router]);

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
    if (userRole === 'CHEFE' || userRole === 'ADMIN') {
      fetchFavorites();
    }
  }, [userRole]);

  const handleDelete = async (id: string) => {
    if (!confirm('Remover este candidato dos favoritos?')) return;

    try {
      const res = await fetch(`/api/favorites/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setFavorites(favorites?.filter?.(f => f?.id !== id) ?? []);
      }
    } catch (error) {
      console.error('Error deleting favorite:', error);
    }
  };

  const getEstadoNome = (sigla: string) => {
    return ESTADOS_BRASIL?.find?.(e => e?.sigla === sigla)?.nome ?? sigla;
  };

  if (status === 'loading' || loading) {
    return <div className="text-center py-12 text-slate-400">Carregando...</div>;
  }

  if (userRole !== 'CHEFE' && userRole !== 'ADMIN') {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Candidatos Favoritos</h1>
          <p className="text-slate-400">Acesse rapidamente os dados eleitorais dos seus candidatos salvos</p>
        </div>
        <Link href="/dashboard/mapa">
          <Button>
            <MapPin className="h-5 w-5 mr-2" />
            Ir para o Mapa
          </Button>
        </Link>
      </div>

      {(favorites?.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Star className="h-12 w-12 text-slate-500 mx-auto mb-4" />
            <p className="text-slate-400 mb-4">Você ainda não tem candidatos favoritos</p>
            <Link href="/dashboard/mapa">
              <Button variant="outline">
                Buscar candidatos no mapa
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {favorites?.map?.((fav, index) => (
            <motion.div
              key={fav?.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card hover>
                <CardContent>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-yellow-100 rounded-full">
                        <Star className="h-5 w-5 text-yellow-500" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-white">{fav?.candidateName}</h3>
                        <p className="text-sm text-slate-400">{fav?.cargo ?? 'Candidato'}</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(fav?.id)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <MapPin className="h-4 w-4" />
                      {getEstadoNome(fav?.uf)}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <Calendar className="h-4 w-4" />
                      Eleição de {fav?.ano}
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t">
                    <Link href={`/dashboard/mapa?candidato=${encodeURIComponent(fav?.candidateName ?? '')}&ano=${fav?.ano}&uf=${fav?.uf}`}>
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
    </div>
  );
}
