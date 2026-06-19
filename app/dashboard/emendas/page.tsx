'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import dynamic from 'next/dynamic';
import {
  Landmark,
  Loader2,
  Users,
  Vote,
  Building2,
  Search,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Trophy,
  ChevronRight,
  ChevronDown,
  Globe,
  X,
  Calendar,
  Star,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ESTADOS_BRASIL } from '@/lib/types';
import { PERMISSIONS, hasPermission } from '@/lib/permissions';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import {
  AREA_LABELS,
  AREA_COLORS,
  CARGO_LABELS,
  formatBRL,
  formatBRLCompact,
  type EmendaArea,
  type ParlamentarCargo,
} from '@/lib/portal-transparencia';
import { EmendaDocumentosModal } from '@/components/emendas/emenda-documentos-modal';

// ---------------------------------------------------------------------------
// Mapas dinâmicos (Leaflet SSR-off)
// ---------------------------------------------------------------------------
const BrazilMap = dynamic(() => import('@/components/maps/brazil-map'), {
  ssr: false,
  loading: () => <MapPlaceholder />,
});
const StateMap = dynamic(() => import('@/components/maps/state-map'), {
  ssr: false,
  loading: () => <MapPlaceholder />,
});

function MapPlaceholder() {
  return (
    <div className="h-full flex items-center justify-center rounded-lg" style={{ background: 'var(--bg-card-subtle)' }}>
      <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#4a9ede' }} />
    </div>
  );
}

const Donut3DChart = dynamic(() => import('@/components/charts/donut-3d-chart'), { ssr: false });

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
interface PortalEmenda {
  idPortal: string;
  ano: number;
  numero: string | null;
  tipo: string | null;
  funcao: string | null;
  subfuncao: string | null;
  area: EmendaArea;
  objeto: string | null;
  valorEmpenhado: number;
  valorPago: number;
  valorRestoPago: number;
  valorProposto: number | null;
  orgaoExecutor: string | null;
  beneficiario: string | null;
  cnpjBeneficiario: string | null;
  uf: string | null;
  codigoIbge: string | null;
  municipioNome: string | null;
  autorCpf: string | null;
  autorNome: string;
  autorCargo: ParlamentarCargo;
  autorPartido: string | null;
  autorUf: string | null;
}

interface TransferenciaPix {
  idPortal:         string;
  ano:              number;
  mes:              number | null;
  dataReferencia:   string | null;
  valor:            number;
  uf:               string | null;
  codigoIbge:       string | null;
  municipioNome:    string | null;
  beneficiarioNome: string | null;
  cnpjBeneficiario: string | null;
  emendaIdPortal:   string | null;
}

interface PortalParlamentar {
  cpf: string | null;
  idPortal: string;
  nome: string;
  nomeUrna: string | null;
  partido: string | null;
  uf: string | null;
  cargo: ParlamentarCargo;
}

interface DestinoRow {
  codigoEmenda: string;
  numeroEmenda: string | null;
  tipoEmenda: string | null;
  funcao: string | null;
  nomeFavorecido: string | null;
  cnpjFavorecido: string | null;
  municipio: string | null;
  uf: string | null;
  codigoIbge: string | null;
  valorEmpenhado: number;
  valorPago: number;
  fonte: 'documento' | 'emenda';
}

interface MunicipioStats {
  codigoIbge: string;
  ano: number;
  habitantes: number | null;
  eleitores: number | null;
  tetoMac: number | null;
  tetoPap: number | null;
  fonteHabitantes: string | null;
  hasSnapshot: boolean;
}

interface ResumoEstado {
  uf: string;
  ano: number;
  totalEmpenhado: number;
  totalPago: number;
  totalMunicipalizado: number;
  totalEstadual: number;
  totalEmendas: number;
  topMunicipios: { codigoIbge: string; nome: string; total: number; qtd: number }[];
  valorPorMunicipio: Record<string, number>;
  valorPorMunicipioNome?: Record<string, number>;
  areas: { area: EmendaArea; total: number }[];
  parlamentares: { cpf: string | null; idPortal: string; nome: string; nomeUrna?: string | null; cargo: string; partido: string | null; total: number; qtd: number }[];
  mock: boolean;
  /** "banco" = dados completos do Supabase; "portal" = amostra parcial direto da API */
  fonte?: 'banco' | 'portal';
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------
const ANOS_DISPONIVEIS = [2026, 2025, 2024, 2023, 2022, 2021];
const ANO_PADRAO = 2026;

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
export default function EmendasPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const isDarkTheme = resolvedTheme === 'dark';
  const userRole = (session?.user as any)?.role;
  const userPermissions = (session?.user as any)?.permissions ?? [];
  const canAccess = hasPermission({ role: userRole, permissions: userPermissions }, PERMISSIONS.EMENDAS_MAPA);

  // Navegação: Brasil → Estado → Município
  const [view, setView] = useState<'brasil' | 'estado'>('brasil');
  const [selectedUf, setSelectedUf] = useState('');
  const [selectedStateName, setSelectedStateName] = useState('');
  const [selectedMunicipio, setSelectedMunicipio] = useState<{ codigo: string; nome: string } | null>(null);

  // Ano
  const [ano, setAno] = useState<number>(ANO_PADRAO);

  // Filtro de esfera
  const [esfera, setEsfera] = useState<'TODAS' | 'FEDERAL' | 'ESTADUAL'>('TODAS');

  // Dados do estado
  const [resumo, setResumo] = useState<ResumoEstado | null>(null);
  const [loadingResumo, setLoadingResumo] = useState(false);

  // Dados do município selecionado
  const [municipioStats, setMunicipioStats] = useState<MunicipioStats | null>(null);
  const [municipioEmendas, setMunicipioEmendas] = useState<PortalEmenda[]>([]);
  const [municipioEmendasAnterior, setMunicipioEmendasAnterior] = useState<PortalEmenda[]>([]);
  const [loadingMunicipio, setLoadingMunicipio] = useState(false);

  // Parlamentar selecionado
  const [parlamentarQuery, setParlamentarQuery] = useState('');
  const [parlamentarResults, setParlamentarResults] = useState<PortalParlamentar[]>([]);
  const [searchingParlamentar, setSearchingParlamentar] = useState(false);
  const [selectedParlamentar, setSelectedParlamentar] = useState<PortalParlamentar | null>(null);
  const [parlamentarEmendas, setParlamentarEmendas] = useState<PortalEmenda[]>([]);
  const [parlamentarPix, setParlamentarPix] = useState<TransferenciaPix[]>([]);
  const [parlamentarDestinosFlat, setParlamentarDestinosFlat] = useState<DestinoRow[]>([]);
  const [loadingParlamentar, setLoadingParlamentar] = useState(false);

  // Resumo do ano anterior (para o comparativo)
  const [resumoAnterior, setResumoAnterior] = useState<ResumoEstado | null>(null);

  // ----- Guards -----
  useEffect(() => {
    if (status === 'authenticated' && !canAccess) router.replace('/dashboard');
  }, [status, canAccess, router]);

  // ----- Resumo do estado (top municípios, totais por área etc) -----
  const fetchResumo = useCallback(async (uf: string, year: number, signal?: AbortSignal, esferaParam?: string): Promise<ResumoEstado | null> => {
    const esq = esferaParam && esferaParam !== 'TODAS' ? `&esfera=${esferaParam}` : '';
    const res = await fetch(`/api/emendas-portal/resumo?uf=${uf}&ano=${year}${esq}`, { signal });
    if (!res.ok) return null;
    return res.json();
  }, []);

  useEffect(() => {
    if (view !== 'estado' || !selectedUf) return;
    const ctrl = new AbortController();
    setLoadingResumo(true);
    Promise.all([fetchResumo(selectedUf, ano, ctrl.signal, esfera), fetchResumo(selectedUf, ano - 1, ctrl.signal)])
      .then(([atual, anterior]) => {
        setResumo(atual);
        setResumoAnterior(anterior);
        // Auto-seleciona favorito pendente (navegação entre estados)
        const pf = pendingFavoritoRef.current;
        if (pf && pf.uf === selectedUf && pf.ano === ano && atual?.parlamentares) {
          pendingFavoritoRef.current = null;
          const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
          const found = atual.parlamentares.find(
            (p) => normalizar(p.nomeUrna ?? p.nome) === normalizar(pf.candidateName) ||
                   normalizar(p.nome) === normalizar(pf.candidateName),
          );
          if (found) {
            setSelectedParlamentar({
              cpf: found.cpf,
              idPortal: found.idPortal,
              nome: found.nomeUrna ?? found.nome,
              nomeUrna: found.nomeUrna ?? null,
              partido: found.partido,
              uf: pf.uf,
              cargo: found.cargo as ParlamentarCargo,
            });
          }
        }
      })
      .catch((e: any) => {
        if (e?.name !== 'AbortError') console.error('Erro ao buscar resumo:', e);
      })
      .finally(() => setLoadingResumo(false));
    return () => ctrl.abort();
  }, [view, selectedUf, ano, esfera, fetchResumo]);

  // ----- Stats + emendas do município selecionado -----
  useEffect(() => {
    if (!selectedMunicipio) {
      setMunicipioStats(null);
      setMunicipioEmendas([]);
      setMunicipioEmendasAnterior([]);
      return;
    }
    const ctrl = new AbortController();
    setLoadingMunicipio(true);
    Promise.all([
      fetch(`/api/emendas-portal/municipio/${selectedMunicipio.codigo}/stats?ano=${ano}`, { signal: ctrl.signal }).then((r) => r.json()),
      fetch(`/api/emendas-portal/municipio/${selectedMunicipio.codigo}/emendas?uf=${selectedUf}&ano=${ano}${esfera !== 'TODAS' ? `&esfera=${esfera}` : ''}`, { signal: ctrl.signal }).then((r) => r.json()),
      // Emendas do ano anterior — pra alimentar o card de comparativo
      // quando município está selecionado.
      fetch(`/api/emendas-portal/municipio/${selectedMunicipio.codigo}/emendas?uf=${selectedUf}&ano=${ano - 1}`, { signal: ctrl.signal }).then((r) => r.json()),
    ])
      .then(([stats, emendas, emendasAnt]) => {
        setMunicipioStats(stats);
        setMunicipioEmendas(Array.isArray(emendas?.emendas) ? emendas.emendas : []);
        setMunicipioEmendasAnterior(Array.isArray(emendasAnt?.emendas) ? emendasAnt.emendas : []);
      })
      .catch((e: any) => {
        if (e?.name !== 'AbortError') console.error('Erro ao buscar município:', e);
      })
      .finally(() => setLoadingMunicipio(false));
    return () => ctrl.abort();
  }, [selectedMunicipio, ano, esfera, selectedUf]);

  // ----- Autocomplete parlamentar -----
  // Filtra LOCALMENTE em resumo.parlamentares (lista já carregada do estado).
  // É instantâneo, não bate no Portal, e cobre todos os parlamentares que
  // efetivamente enviaram emendas pro estado neste ano.
  useEffect(() => {
    const q = parlamentarQuery.trim().toLowerCase();
    if (q.length < 2 || !resumo?.parlamentares) {
      setParlamentarResults([]);
      return;
    }
    setSearchingParlamentar(false);
    const normalizar = (s: string) =>
      s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const qNorm = normalizar(q);

    // Quando há município selecionado, restringe ao pool de parlamentares daquele município
    let pool = resumo.parlamentares;
    if (selectedMunicipio && municipioEmendas.length > 0) {
      const cpfsNoMunicipio = new Set(municipioEmendas.map((e) => e.autorCpf).filter(Boolean) as string[]);
      const nomesNoMunicipio = new Set(municipioEmendas.map((e) => normalizar(e.autorNome)));
      pool = resumo.parlamentares.filter((p) =>
        (p.cpf && cpfsNoMunicipio.has(p.cpf)) ||
        nomesNoMunicipio.has(normalizar(p.nome))
      );
    }

    const matches = pool
      .filter((p) => normalizar(p.nome).includes(qNorm) && p.cargo !== 'VEREADOR')
      .slice(0, 20)
      .map<PortalParlamentar>((p) => ({
        cpf:      p.cpf,
        idPortal: p.idPortal,
        nome:     p.nomeUrna ?? p.nome,
        nomeUrna: p.nomeUrna ?? null,
        partido:  p.partido,
        uf:       selectedUf,
        cargo:    p.cargo as ParlamentarCargo,
      }));
    setParlamentarResults(matches);
  }, [parlamentarQuery, resumo, selectedUf, selectedMunicipio, municipioEmendas]);

  // ----- Emendas + transferências Pix + destinos do parlamentar selecionado -----
  useEffect(() => {
    if (!selectedParlamentar) {
      setParlamentarEmendas([]);
      setParlamentarPix([]);
      setParlamentarDestinosFlat([]);
      return;
    }
    const ctrl = new AbortController();
    setLoadingParlamentar(true);
    const id = selectedParlamentar.cpf ?? selectedParlamentar.idPortal;
    const ufParam     = selectedUf ? `&uf=${selectedUf}` : '';
    const esferaParam = esfera !== 'TODAS' ? `&esfera=${esfera}` : '';
    Promise.all([
      fetch(`/api/emendas-portal/parlamentar/${id}?ano=${ano}${ufParam}${esferaParam}`, { signal: ctrl.signal }).then((r) => r.json()),
      fetch(`/api/emendas-portal/parlamentar/${id}/destinos?ano=${ano}${ufParam}${esferaParam}`, { signal: ctrl.signal }).then((r) => r.json()),
    ])
      .then(([data, destData]) => {
        setParlamentarEmendas(Array.isArray(data?.emendas) ? data.emendas : []);
        setParlamentarPix(Array.isArray(data?.transferenciasPix) ? data.transferenciasPix : []);
        setParlamentarDestinosFlat(Array.isArray(destData?.destinos) ? destData.destinos : []);
      })
      .catch((e: any) => {
        if (e?.name !== 'AbortError') console.error('Erro ao buscar emendas do parlamentar:', e);
      })
      .finally(() => setLoadingParlamentar(false));
    return () => ctrl.abort();
  }, [selectedParlamentar, ano, selectedUf, esfera]);

  // Favoritos (parlamentares salvos)
  const [favorites, setFavorites] = useState<{ id: string; candidateName: string; ano: number; uf: string | null; cargo: string }[]>([]);
  const [savingFavorite, setSavingFavorite] = useState(false);
  const [showFavDropdown, setShowFavDropdown] = useState(false);
  const favDropRef = useRef<HTMLDivElement>(null);
  const pendingFavoritoRef = useRef<{ candidateName: string; cargo: string; uf: string; ano: number } | null>(null);

  useEffect(() => {
    if (!showFavDropdown) return;
    const handler = (e: MouseEvent) => {
      if (favDropRef.current && !favDropRef.current.contains(e.target as Node)) {
        setShowFavDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showFavDropdown]);

  useEffect(() => {
    if (!canAccess) return;
    fetch('/api/favorites?tipo=EMENDAS')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => { if (Array.isArray(data)) setFavorites(data); })
      .catch(() => {});
  }, [canAccess]);

  // Histórico completo do parlamentar (todos os anos) — também filtrado por UF
  // pro gráfico "Valor por Ano" refletir o estado em foco.
  const [parlamentarHistorico, setParlamentarHistorico] = useState<PortalEmenda[]>([]);
  useEffect(() => {
    if (!selectedParlamentar) {
      setParlamentarHistorico([]);
      return;
    }
    const ctrl = new AbortController();
    const id = selectedParlamentar.cpf ?? selectedParlamentar.idPortal;
    const ufParam = selectedUf ? `?uf=${selectedUf}` : '';
    fetch(`/api/emendas-portal/parlamentar/${id}${ufParam}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((data) => setParlamentarHistorico(Array.isArray(data?.emendas) ? data.emendas : []))
      .catch((e: any) => {
        if (e?.name !== 'AbortError') console.error('Erro ao buscar histórico:', e);
      });
    return () => ctrl.abort();
  }, [selectedParlamentar, selectedUf]);

  // ----- Favoritos -----
  const isSavedParlamentar = selectedParlamentar
    ? favorites.some((f) => f.candidateName === selectedParlamentar.nome && f.ano === ano && f.uf === selectedUf)
    : false;

  const savedParlamentaresDoEstado = favorites.filter((f) => f.uf === selectedUf && f.ano === ano);

  const handleToggleFavorite = useCallback(async () => {
    if (!selectedParlamentar) return;
    setSavingFavorite(true);
    const existing = favorites.find((f) => f.candidateName === selectedParlamentar.nome && f.ano === ano && f.uf === selectedUf);
    try {
      if (existing) {
        await fetch(`/api/favorites/${existing.id}`, { method: 'DELETE' });
        setFavorites((prev) => prev.filter((f) => f.id !== existing.id));
      } else {
        const res = await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidateName: selectedParlamentar.nome, ano, cargo: selectedParlamentar.cargo, uf: selectedUf, tipo: 'EMENDAS' }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.error('Erro ao favoritar:', err?.error ?? res.status);
        } else {
          const data = await res.json();
          if (data?.id) setFavorites((prev) => [...prev, data]);
        }
      }
    } catch (e) {
      console.error('Erro ao salvar favorito:', e);
    } finally {
      setSavingFavorite(false);
    }
  }, [selectedParlamentar, favorites, ano, selectedUf]);

  const handleSelectFavorito = useCallback((fav: { candidateName: string; cargo: string }) => {
    const fromResumo = resumo?.parlamentares.find(
      (p) => (p.nomeUrna ?? p.nome).toLowerCase() === fav.candidateName.toLowerCase() ||
             p.nome.toLowerCase() === fav.candidateName.toLowerCase(),
    );
    if (fromResumo) {
      setSelectedParlamentar({
        cpf: fromResumo.cpf,
        idPortal: fromResumo.idPortal,
        nome: fromResumo.nomeUrna ?? fromResumo.nome,
        nomeUrna: fromResumo.nomeUrna ?? null,
        partido: fromResumo.partido,
        uf: selectedUf,
        cargo: fromResumo.cargo as ParlamentarCargo,
      });
    } else {
      setSelectedParlamentar({
        cpf: null,
        idPortal: fav.candidateName,
        nome: fav.candidateName,
        nomeUrna: null,
        partido: null,
        uf: selectedUf,
        cargo: fav.cargo as ParlamentarCargo,
      });
    }
  }, [resumo, selectedUf]);

  const handleClickEmendaFavorito = useCallback((fav: { id: string; candidateName: string; ano: number; uf: string | null; cargo: string }) => {
    const favUf = fav.uf ?? selectedUf;
    const favAno = fav.ano;
    const sameSate = favUf === selectedUf && view === 'estado';
    const sameYear = favAno === ano;

    if (sameSate && sameYear) {
      handleSelectFavorito({ candidateName: fav.candidateName, cargo: fav.cargo });
      return;
    }

    // Precisa navegar para o estado/ano correto; registra pendência
    pendingFavoritoRef.current = { candidateName: fav.candidateName, cargo: fav.cargo, uf: favUf, ano: favAno };
    if (!sameYear) setAno(favAno);
    if (!sameSate) {
      const estado = ESTADOS_BRASIL.find((e) => e.sigla === favUf);
      setSelectedUf(favUf);
      setSelectedStateName(estado?.nome ?? favUf);
      setView('estado');
      setSelectedMunicipio(null);
    }
  }, [selectedUf, view, ano, handleSelectFavorito]);

  // ----- Handlers -----
  const handleStateClick = useCallback((uf: string, name: string) => {
    setSelectedUf(uf);
    setSelectedStateName(name);
    setView('estado');
    setSelectedMunicipio(null);
  }, []);

  const handleMunicipioClick = useCallback((codigo: string, nome: string) => {
    setSelectedMunicipio({ codigo, nome });
  }, []);

  const handleBackToBrasil = useCallback(() => {
    setView('brasil');
    setSelectedUf('');
    setSelectedStateName('');
    setSelectedMunicipio(null);
    setResumo(null);
    setResumoAnterior(null);
  }, []);

  // ----- Cálculos derivados (donut/comparativo do parlamentar) -----
  const parlamentarPorArea = useMemo(() => {
    const map = new Map<EmendaArea, number>();
    parlamentarEmendas.forEach((e) => {
      map.set(e.area, (map.get(e.area) ?? 0) + e.valorEmpenhado);
    });
    return Array.from(map.entries())
      .map(([area, value]) => ({
        name:  AREA_LABELS[area],
        value: Math.round(value),
        color: AREA_COLORS[area],
        area,
      }))
      .sort((a, b) => b.value - a.value);
  }, [parlamentarEmendas]);

  const parlamentarTotalAno = useMemo(
    () => parlamentarEmendas.reduce((s, e) => s + (e.valorEmpenhado ?? 0), 0),
    [parlamentarEmendas],
  );

  const parlamentarTotalPago = useMemo(
    () => parlamentarEmendas.reduce((s, e) => s + (e.valorPago ?? 0), 0),
    [parlamentarEmendas],
  );

  const parlamentarPorAno = useMemo(() => {
    const map = new Map<number, number>();
    parlamentarHistorico.forEach((e) => {
      map.set(e.ano, (map.get(e.ano) ?? 0) + e.valorEmpenhado);
    });
    return Array.from(map.entries())
      .map(([ano, total]) => ({ ano, total }))
      .sort((a, b) => a.ano - b.ano);
  }, [parlamentarHistorico]);

  // Quebra do total do parlamentar em "destinado a municípios" vs "destinado
  // ao estado inteiro" — ajuda a entender por que a lista de municípios pode
  // estar vazia mesmo o donut mostrando valores altos (típico de senadores).
  const parlamentarDestinos = useMemo(() => {
    let municipal = 0;
    let estadual  = 0;
    let qtdMun    = 0;
    let qtdEst    = 0;
    parlamentarEmendas.forEach((e) => {
      if (e.codigoIbge) {
        municipal += e.valorEmpenhado ?? 0;
        qtdMun++;
      } else {
        estadual += e.valorEmpenhado ?? 0;
        qtdEst++;
      }
    });
    return { municipal, estadual, qtdMun, qtdEst };
  }, [parlamentarEmendas]);

  // Agrega emendas do parlamentar por tipo (Individual, Bancada, Comissão, ...)
  // Senadores e deputados podem aparecer em emendas de bancada/comissão também.
  // Mostrar o breakdown ajuda a entender o que vem da cota individual.
  const parlamentarPorTipo = useMemo(() => {
    const map = new Map<string, { tipo: string; total: number; qtd: number }>();
    parlamentarEmendas.forEach((e) => {
      const tipo = e.tipo ?? 'Não classificada';
      // Encurta tipos longos pra visualização ("Emenda Individual - ..." → "Individual")
      const tipoCurto =
        tipo.match(/individual/i)        ? 'Individual'
        : tipo.match(/bancada/i)         ? 'Bancada'
        : tipo.match(/comiss[ãa]o/i)     ? 'Comissão'
        : tipo.match(/relator/i)         ? 'Relator'
        : tipo.match(/especiais?/i)      ? 'Transf. Especial'
        : tipo;
      const cur = map.get(tipoCurto) ?? { tipo: tipoCurto, total: 0, qtd: 0 };
      cur.total += e.valorEmpenhado ?? 0;
      cur.qtd++;
      map.set(tipoCurto, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [parlamentarEmendas]);

  // Quando há parlamentar selecionado, o mapa mostra os municípios beneficiados.
  // Usa parlamentarDestinosFlat como fonte primária — ela já expande
  // EmendaDocumento por favorecido e cai de volta para EmendaParlamentar quando
  // não há documentos. Isso garante que o mapa reflita todos os municípios que
  // aparecem na tabela de destinos (federal + estadual).
  const parlamentarValorPorMunicipio = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    if (parlamentarDestinosFlat.length > 0) {
      parlamentarDestinosFlat.forEach((d) => {
        if (!d.codigoIbge) return;
        map[d.codigoIbge] = (map[d.codigoIbge] ?? 0) + (d.valorEmpenhado ?? 0);
      });
    } else {
      // Fallback enquanto destinos ainda não carregaram ou não existem
      parlamentarEmendas.forEach((e) => {
        if (!e.codigoIbge) return;
        map[e.codigoIbge] = (map[e.codigoIbge] ?? 0) + (e.valorEmpenhado ?? 0);
      });
    }
    return map;
  }, [parlamentarDestinosFlat, parlamentarEmendas]);

  // Versão por nome — fallback para quando o lookup por código IBGE falha.
  // Inclui TODOS os municípios com nome (com ou sem codigoIbge).
  const parlamentarValorPorMunicipioNome = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    if (parlamentarDestinosFlat.length > 0) {
      parlamentarDestinosFlat.forEach((d) => {
        if (!d.municipio) return;
        const nome = d.municipio.toUpperCase();
        map[nome] = (map[nome] ?? 0) + (d.valorEmpenhado ?? 0);
      });
    } else {
      parlamentarEmendas.forEach((e) => {
        if (!e.municipioNome) return;
        const nome = e.municipioNome.toUpperCase();
        map[nome] = (map[nome] ?? 0) + (e.valorEmpenhado ?? 0);
      });
    }
    return map;
  }, [parlamentarDestinosFlat, parlamentarEmendas]);

  // Props estabilizadas para StateMap — evita recriar objeto vazio a cada render
  // enquanto resumo ainda carrega, o que causaria cascade de re-inicializações do mapa.
  const mapVotesData = useMemo<Record<string, number>>(
    () => selectedParlamentar ? parlamentarValorPorMunicipio : (resumo?.valorPorMunicipio ?? {}),
    [selectedParlamentar, parlamentarValorPorMunicipio, resumo],
  );
  const mapVotesDataByName = useMemo<Record<string, number> | undefined>(
    () => selectedParlamentar ? parlamentarValorPorMunicipioNome : (resumo?.valorPorMunicipioNome ?? undefined),
    [selectedParlamentar, parlamentarValorPorMunicipioNome, resumo],
  );

  // Agrega emendas do parlamentar (ano selecionado) por município, com
  // breakdown de áreas pra cada um. Usado na nova seção "Municípios
  // beneficiados" do dashboard do parlamentar.
  const parlamentarPorMunicipio = useMemo(() => {
    const map = new Map<string, {
      codigoIbge: string;
      nome: string;
      uf: string | null;
      total: number;
      areas: Map<EmendaArea, number>;
    }>();
    parlamentarEmendas.forEach((e) => {
      // Usa codigoIbge como chave; quando ausente (emendas estaduais) usa municipioNome
      const key = e.codigoIbge ?? (e.municipioNome ? `nome:${e.municipioNome.toUpperCase()}` : null);
      if (!key) return;
      const cur = map.get(key) ?? {
        codigoIbge: e.codigoIbge ?? '',
        nome:       e.municipioNome ?? e.codigoIbge ?? '',
        uf:         e.uf,
        total:      0,
        areas:      new Map<EmendaArea, number>(),
      };
      cur.total += e.valorEmpenhado ?? 0;
      cur.areas.set(e.area, (cur.areas.get(e.area) ?? 0) + (e.valorEmpenhado ?? 0));
      map.set(key, cur);
    });
    return Array.from(map.values())
      .map((m) => ({
        codigoIbge: m.codigoIbge,
        nome:       m.nome,
        uf:         m.uf,
        total:      m.total,
        areas:      Array.from(m.areas.entries())
                      .map(([area, valor]) => ({ area, valor }))
                      .sort((a, b) => b.valor - a.valor),
      }))
      .sort((a, b) => b.total - a.total);
  }, [parlamentarEmendas]);

  // Top 5 municípios por valor recebido — usa dados de documento (mesma fonte
  // que "Detalhe das Emendas") para refletir os valores reais por favorecido.
  // Se destinos ainda não carregaram, cai para dados de emenda.
  const parlamentarTop5PorDestino = useMemo(() => {
    if (parlamentarDestinosFlat.length > 0) {
      const nomeToIbge = new Map<string, string>();
      parlamentarEmendas.forEach((e) => {
        if (e.municipioNome && e.codigoIbge) {
          nomeToIbge.set(e.municipioNome.toUpperCase(), e.codigoIbge);
        }
      });
      const map = new Map<string, { nome: string; codigoIbge: string; total: number }>();
      parlamentarDestinosFlat.forEach((d) => {
        if (!d.municipio) return;
        const key = d.municipio.toUpperCase();
        const cur = map.get(key) ?? { nome: d.municipio, codigoIbge: nomeToIbge.get(key) ?? '', total: 0 };
        cur.total += d.valorEmpenhado ?? 0;
        map.set(key, cur);
      });
      return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 5);
    }
    return parlamentarPorMunicipio.slice(0, 5).map((m) => ({
      nome: m.nome, codigoIbge: m.codigoIbge, total: m.total,
    }));
  }, [parlamentarDestinosFlat, parlamentarEmendas, parlamentarPorMunicipio]);

  // Agregação de transferências Pix por município — preenche o card
  // "Municípios via Pix" do dashboard. Diferente de parlamentarPorMunicipio
  // (que vem das emendas), aqui o destino é o município REAL onde o Pix
  // caiu, mesmo quando a emenda original foi cadastrada a nível UF.
  const parlamentarPixPorMunicipio = useMemo(() => {
    const map = new Map<string, {
      codigoIbge: string;
      nome:       string;
      uf:         string | null;
      total:      number;
      qtd:        number;
    }>();
    parlamentarPix.forEach((t) => {
      if (!t.codigoIbge) return;
      const cur = map.get(t.codigoIbge) ?? {
        codigoIbge: t.codigoIbge,
        nome:       t.municipioNome ?? t.codigoIbge,
        uf:         t.uf,
        total:      0,
        qtd:        0,
      };
      cur.total += t.valor ?? 0;
      cur.qtd++;
      map.set(t.codigoIbge, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [parlamentarPix]);

  const parlamentarPixTotal = useMemo(
    () => parlamentarPix.reduce((s, t) => s + (t.valor ?? 0), 0),
    [parlamentarPix],
  );

  // Top 5 parlamentares que mais enviaram emendas para o município selecionado
  const top5ParlamentaresDoMunicipio = useMemo(() => {
    if (!selectedMunicipio || municipioEmendas.length === 0) return [];
    type ParlItem = { cpf: string | null; idPortal: string; nome: string; total: number; cargo: ParlamentarCargo; partido: string | null };
    const map = new Map<string, ParlItem>();
    municipioEmendas.forEach((e) => {
      const key = e.autorCpf ?? e.autorNome;
      if (!map.has(key)) {
        const fromResumo = resumo?.parlamentares.find((r) => e.autorCpf ? r.cpf === e.autorCpf : r.nome.toUpperCase() === e.autorNome.toUpperCase());
        map.set(key, {
          cpf:      e.autorCpf,
          idPortal: fromResumo?.idPortal ?? e.autorCpf ?? e.autorNome,
          nome:     fromResumo?.nome ?? e.autorNome,
          total:    0,
          cargo:    e.autorCargo,
          partido:  fromResumo?.partido ?? e.autorPartido,
        });
      }
      map.get(key)!.total += e.valorEmpenhado ?? 0;
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [selectedMunicipio, municipioEmendas, resumo]);

  const maxParlamentarPorAno = useMemo(
    () => parlamentarPorAno.reduce((m, x) => Math.max(m, x.total), 1),
    [parlamentarPorAno],
  );

  // Áreas do parlamentar (ano atual) — formato esperado pelo ComparativoAreasCard
  const parlamentarAreasAtual = useMemo<{ area: EmendaArea; total: number }[]>(() => {
    const m = new Map<EmendaArea, number>();
    parlamentarEmendas.forEach((e) => m.set(e.area, (m.get(e.area) ?? 0) + e.valorEmpenhado));
    return Array.from(m.entries()).map(([area, total]) => ({ area, total }));
  }, [parlamentarEmendas]);

  // Áreas do parlamentar (ano anterior) — derivado do histórico
  const parlamentarAreasAnterior = useMemo<Map<string, number>>(() => {
    const m = new Map<string, number>();
    parlamentarHistorico
      .filter((e) => e.ano === ano - 1)
      .forEach((e) => m.set(e.area, (m.get(e.area) ?? 0) + e.valorEmpenhado));
    return m;
  }, [parlamentarHistorico, ano]);

  // Interseção: emendas do parlamentar filtradas pelo município selecionado.
  // Para emendas federais o codigoIbge está nos documentos (parlamentarDestinosFlat),
  // não na emenda raiz — cruza os dois para não retornar vazio.
  const parlamentarMunicipioEmendas = useMemo(() => {
    if (!selectedParlamentar || !selectedMunicipio) return [];

    if (parlamentarDestinosFlat.length > 0) {
      const emendasNoMunicipio = new Set(
        parlamentarDestinosFlat
          .filter((d) => d.codigoIbge === selectedMunicipio.codigo)
          .map((d) => d.codigoEmenda),
      );
      if (emendasNoMunicipio.size > 0) {
        return parlamentarEmendas.filter((e) => emendasNoMunicipio.has(e.idPortal));
      }
    }

    // Fallback: codigoIbge direto (emendas estaduais importadas)
    return parlamentarEmendas.filter((e) => e.codigoIbge === selectedMunicipio.codigo);
  }, [selectedParlamentar, selectedMunicipio, parlamentarEmendas, parlamentarDestinosFlat]);

  const parlamentarMunicipioAreasAtual = useMemo<{ area: EmendaArea; total: number }[]>(() => {
    const m = new Map<EmendaArea, number>();
    parlamentarMunicipioEmendas.forEach((e) => m.set(e.area, (m.get(e.area) ?? 0) + e.valorEmpenhado));
    return Array.from(m.entries()).map(([area, total]) => ({ area, total }));
  }, [parlamentarMunicipioEmendas]);

  const parlamentarMunicipioAreasAnterior = useMemo<Map<string, number>>(() => {
    if (!selectedMunicipio) return new Map();
    const m = new Map<string, number>();
    parlamentarHistorico
      .filter((e) => e.ano === ano - 1 && e.codigoIbge === selectedMunicipio.codigo)
      .forEach((e) => m.set(e.area, (m.get(e.area) ?? 0) + e.valorEmpenhado));
    return m;
  }, [parlamentarHistorico, ano, selectedMunicipio]);

  const comparativoAreasAnterior = useMemo(() => {
    if (!resumoAnterior) return new Map<string, number>();
    const m = new Map<string, number>();
    resumoAnterior.areas.forEach((a) => m.set(a.area, a.total));
    return m;
  }, [resumoAnterior]);

  // ----- Áreas do município (atual e anterior) — usado quando há município selecionado -----
  const municipioAreasAtual = useMemo(() => {
    if (!selectedMunicipio) return null;
    const m = new Map<EmendaArea, number>();
    municipioEmendas.forEach((e) => m.set(e.area, (m.get(e.area) ?? 0) + e.valorEmpenhado));
    return Array.from(m.entries()).map(([area, total]) => ({ area, total }));
  }, [selectedMunicipio, municipioEmendas]);

  const municipioAreasAnterior = useMemo(() => {
    if (!selectedMunicipio) return new Map<string, number>();
    const m = new Map<string, number>();
    municipioEmendasAnterior.forEach((e) => {
      m.set(e.area, (m.get(e.area) ?? 0) + e.valorEmpenhado);
    });
    return m;
  }, [selectedMunicipio, municipioEmendasAnterior]);

  // ----- Render -----
  if (status === 'loading') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin" style={{ color: '#2563EB' }} />
      </div>
    );
  }
  if (!canAccess) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <PageHeader
        icon={Landmark}
        title="Mapa de Emendas"
        subtitle="Visão geral das emendas por estado, município e parlamentar"
        actions={
          <div className="flex items-center gap-3">
            {/* Botão de favoritos com dropdown */}
            <div className="relative" ref={favDropRef}>
              <button
                onClick={() => setShowFavDropdown((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-colors"
                style={{
                  background: favorites.length > 0 ? 'rgba(37,99,235,0.12)' : 'var(--tint-04)',
                  border: `1px solid ${favorites.length > 0 ? 'rgba(37,99,235,0.35)' : 'var(--tint-10)'}`,
                  color: favorites.length > 0 ? 'var(--brand-cobalt-text)' : '#64748b',
                }}
              >
                <Star className={`w-4 h-4 ${favorites.length > 0 ? 'fill-amber-400 text-[color:var(--brand-cobalt)]' : ''}`} />
                <span className="text-xs font-medium">Favoritos</span>
                {favorites.length > 0 && (
                  <span
                    className="text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center"
                    style={{ background: '#2563EB', color: '#07121e' }}
                  >
                    {favorites.length}
                  </span>
                )}
                <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showFavDropdown ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {showFavDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 z-50 w-72 rounded-xl py-1"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-raised)' }}
                  >
                    {favorites.length === 0 ? (
                      <p className="px-4 py-5 text-center text-xs text-slate-600 dark:text-slate-500">Nenhum parlamentar favoritado</p>
                    ) : (
                      favorites.map((fav) => (
                        <div key={fav.id} className="flex items-center gap-1 px-1">
                          <button
                            onClick={() => { handleClickEmendaFavorito(fav); setShowFavDropdown(false); }}
                            className="flex-1 flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-colors hover:bg-[var(--tint-06)] text-left"
                            style={{ color: 'var(--brand-cobalt-text)' }}
                          >
                            <Star className="w-3 h-3 fill-amber-400 text-[color:var(--brand-cobalt)] flex-shrink-0" />
                            <span className="font-medium flex-1 truncate">{fav.candidateName}</span>
                            <span className="text-slate-600 dark:text-slate-500 flex-shrink-0">{fav.uf} · {fav.ano}</span>
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                await fetch(`/api/favorites/${fav.id}`, { method: 'DELETE' });
                                setFavorites((prev) => prev.filter((f) => f.id !== fav.id));
                              } catch {}
                            }}
                            title="Remover dos favoritos"
                            className="p-1.5 mr-1 rounded text-slate-600 hover:text-red-400 transition-colors flex-shrink-0"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <span className="text-xs uppercase tracking-widest text-slate-600 dark:text-slate-400">Ano selecionado</span>
            <Select
              value={String(ano)}
              onChange={(e) => setAno(parseInt(e.target.value, 10))}
              options={ANOS_DISPONIVEIS.map((a) => ({ value: String(a), label: String(a) }))}
            />
          </div>
        }
      />

      {/* Barra de pesquisa de parlamentar — abaixo do título, visível quando há estado selecionado */}
      {view === 'estado' && (
        <div className="relative">
          <div className="flex items-center gap-2">
            {/* Toggle de esfera */}
            <div className="flex rounded-xl overflow-hidden flex-shrink-0" style={{ border: '1px solid var(--border-default)', background: 'var(--bg-card-subtle)' }}>
              {(['TODAS', 'FEDERAL', 'ESTADUAL'] as const).map((e) => (
                <button
                  key={e}
                  onClick={() => setEsfera(e)}
                  className="px-3 py-2.5 text-xs font-medium transition-colors"
                  style={esfera === e
                    ? { background: 'var(--brand-cobalt-soft)', color: 'var(--brand-cobalt-text)' }
                    : { color: 'var(--text-tertiary)' }}
                >
                  {e === 'TODAS' ? 'Todas' : e === 'FEDERAL' ? 'Federal' : 'Estadual'}
                </button>
              ))}
            </div>
            {/* Input de busca */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-500" />
              <input
                value={parlamentarQuery}
                onChange={(e) => setParlamentarQuery(e.target.value)}
                placeholder="Pesquisar parlamentar…"
                className="w-full rounded-xl pl-10 pr-4 py-2.5 text-sm text-[color:var(--text-primary)] placeholder:text-[color:var(--text-tertiary)] outline-none transition-colors"
                style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--border-default)' }}
              />
            </div>
            {selectedParlamentar && (
              <div
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl flex-shrink-0"
                style={{ background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.3)' }}
              >
                <span className="text-xs text-[color:var(--text-primary)] font-semibold truncate max-w-[160px]">{selectedParlamentar.nome}</span>
                <button
                  onClick={handleToggleFavorite}
                  disabled={savingFavorite}
                  title={isSavedParlamentar ? 'Remover dos favoritos' : 'Salvar parlamentar'}
                  className="transition-colors disabled:opacity-50 ml-0.5"
                >
                  <Star className={`w-3.5 h-3.5 ${isSavedParlamentar ? 'fill-amber-400 text-[color:var(--brand-cobalt)]' : 'text-slate-600 dark:text-slate-400 hover:text-[color:var(--brand-cobalt)]'}`} />
                </button>
                <button onClick={() => setSelectedParlamentar(null)} className="text-slate-600 dark:text-slate-400 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
          {/* Chips de parlamentares salvos */}
          {savedParlamentaresDoEstado.length > 0 && !selectedParlamentar && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {savedParlamentaresDoEstado.map((f) => (
                <button
                  key={f.id}
                  onClick={() => handleSelectFavorito(f)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors"
                  style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.2)', color: 'var(--brand-cobalt-text)' }}
                >
                  <Star className="w-2.5 h-2.5 fill-amber-400 text-[color:var(--brand-cobalt)]" />
                  {f.candidateName}
                </button>
              ))}
            </div>
          )}
          {parlamentarQuery.length >= 2 && parlamentarResults.length > 0 && (
            <div
              className="absolute top-full left-0 right-0 mt-1 z-[500] rounded-xl overflow-hidden"
              style={{ background: 'rgba(7,29,54,0.98)', border: '1px solid var(--tint-10)', boxShadow: '0 12px 32px rgba(0,0,0,0.5)' }}
            >
              {parlamentarResults.map((p) => (
                <button
                  key={p.idPortal}
                  onClick={() => { setSelectedParlamentar(p); setParlamentarQuery(''); setParlamentarResults([]); }}
                  className="w-full text-left px-4 py-2.5 hover:bg-[var(--tint-06)] transition-colors border-b border-[var(--tint-06)] last:border-0"
                >
                  <p className="text-sm text-[color:var(--text-primary)] font-medium">{p.nome}</p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">{CARGO_LABELS[p.cargo]}{p.partido ? ` · ${p.partido}` : ''}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Destaque do ano — acima do grid principal */}
      {view === 'estado' && resumo && resumo.topMunicipios?.[0] && (
        <DestaqueDoAnoCard
          municipio={resumo.topMunicipios[0]}
          ano={ano}
          stateName={selectedStateName}
          topParlamentar={resumo.parlamentares?.[0]}
        />
      )}

      {/* Mock banner */}
      {resumo?.mock && (
        <div
          className="rounded-xl px-4 py-2.5 flex items-center gap-2 text-xs"
          style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.25)', color: 'var(--brand-cobalt-text)' }}
        >
          <span className="font-semibold">Modo demonstração:</span>
          <span className="text-slate-700 dark:text-slate-300">
            os dados exibidos são sintéticos. Configure a variável <code className="px-1.5 py-0.5 rounded bg-black/30">PORTAL_TRANSPARENCIA_API_KEY</code> para usar dados reais do Portal da Transparência.
          </span>
        </div>
      )}

      {/* Grid principal — coluna esquerda ocupa 2 linhas (row-span-2) com
            Resumo Geral e Pizza empilhados encostados. Coluna central+direita
            tem Mapa+Top5/Parl na linha 1 e Comparativo na linha 2.
            Layout:
              ┌────────┬──────────┬─────────┐
              │ Resumo │   Mapa   │ Top 5   │  ← linha 1
              │ Geral  │          │ Parl    │
              ├ Pizza  ├──────────┴─────────┤
              │        │ Comparativo (9)   │  ← linha 2
              └────────┴────────────────────┘ */}
      <div className="grid grid-cols-12 gap-4">
        {/* COLUNA ESQUERDA — Resumo + Pizza encostados (row-span-2 cobre as 2 linhas) */}
        <div className="col-span-12 md:col-span-3 md:row-span-2 flex flex-col gap-4">
          <ResumoGeralCard
            view={view}
            ano={ano}
            stateName={selectedStateName}
            municipio={selectedMunicipio}
            municipioStats={municipioStats}
            resumo={resumo}
            parlamentar={selectedParlamentar}
            parlamentarTotal={parlamentarTotalAno}
            parlamentarTotalPago={parlamentarTotalPago}
            parlamentarMunicipioTotal={
              selectedMunicipio && selectedParlamentar
                ? (parlamentarValorPorMunicipio[selectedMunicipio.codigo] ?? 0)
                : null
            }
          />
          <div className="flex-1 min-h-0">
            <EmendasPorAreaCard
              view={view}
              municipio={selectedMunicipio}
              parlamentar={selectedParlamentar}
              emendas={
                selectedParlamentar && selectedMunicipio
                  ? parlamentarMunicipioEmendas
                  : selectedParlamentar
                  ? parlamentarEmendas
                  : municipioEmendas
              }
              resumo={resumo}
            />
          </div>
        </div>

        {/* LINHA 1 — Coluna central: Mapa */}
        <div className="col-span-12 md:col-span-7">
          <div
            className="relative rounded-2xl overflow-hidden h-[560px]"
            style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--tint-06)' }}
          >
            {/* Header do mapa */}
            <div className="absolute top-3 left-3 right-3 z-[400] flex items-center justify-between pointer-events-none">
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl pointer-events-auto"
                style={{ background: 'var(--bg-card-raised)', border: '1px solid var(--tint-10)', backdropFilter: 'blur(6px)' }}
              >
                <button
                  onClick={view === 'estado' ? handleBackToBrasil : undefined}
                  disabled={view === 'brasil'}
                  className="text-slate-600 dark:text-slate-400 hover:text-white text-xs transition-all flex items-center gap-1 disabled:opacity-40 disabled:cursor-default"
                  title="Voltar ao Brasil"
                >
                  <Globe className="w-3.5 h-3.5" />
                  Brasil
                </button>
                {view === 'estado' && (
                  <>
                    <ChevronRight className="w-3 h-3 text-slate-600" />
                    <span className="text-[color:var(--text-primary)] text-xs font-medium">{selectedStateName}</span>
                  </>
                )}
                {selectedMunicipio && (
                  <>
                    <ChevronRight className="w-3 h-3 text-slate-600" />
                    <span className="text-[color:var(--brand-cobalt-text)] text-xs font-medium">{selectedMunicipio.nome}</span>
                  </>
                )}
              </div>
              <div
                className="px-2.5 py-1 rounded-lg text-[10px] uppercase tracking-widest font-bold pointer-events-auto truncate max-w-[260px]"
                style={{
                  background: selectedParlamentar ? 'rgba(74,158,222,0.15)' : 'rgba(37,99,235,0.15)',
                  border:     `1px solid ${selectedParlamentar ? 'rgba(74,158,222,0.4)' : 'rgba(37,99,235,0.3)'}`,
                  color:      selectedParlamentar ? '#7fb8e0' : 'var(--brand-cobalt-text)',
                }}
                title={selectedParlamentar ? `Filtrado por ${selectedParlamentar.nome}` : undefined}
              >
                {selectedParlamentar
                  ? `Filtrado: ${selectedParlamentar.nome}`
                  : 'Emendas por Município'}
              </div>
            </div>

            {/* Overlay de carregamento quando esfera muda */}
            {loadingResumo && (
              <div
                className="absolute inset-0 z-[500] flex items-center justify-center"
                style={{ background: 'rgba(4,17,31,0.65)', backdropFilter: 'blur(3px)' }}
              >
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-10 w-10 animate-spin" style={{ color: '#4a9ede' }} />
                  <span className="text-sm font-medium" style={{ color: 'var(--tint-75)' }}>
                    Carregando dados…
                  </span>
                </div>
              </div>
            )}

            {view === 'brasil' && (
              <BrazilMap onStateClick={handleStateClick} darkMode={isDarkTheme} />
            )}
            {view === 'estado' && selectedUf && (
              <StateMap
                uf={selectedUf}
                stateName={selectedStateName}
                /* Quando há parlamentar selecionado, mostra só os municípios
                   que ele beneficiou. Senão, mostra todos do estado. */
                votesData={mapVotesData}
                votesDataByName={mapVotesDataByName}
                onMunicipioClick={handleMunicipioClick}
                disableSubdivisao
                highlightColor="gold"
                highlightMunicipioNome={selectedMunicipio?.nome ?? null}
                valueLabel={selectedParlamentar ? `de ${selectedParlamentar.nome.split(' ')[0]}` : 'em emendas'}
                darkMode={isDarkTheme}
              />
            )}

            {/* Popup do município (habitantes/eleitores/MAC/PAP) */}
            {selectedMunicipio && (
              <MunicipioPopup
                municipio={selectedMunicipio}
                stats={municipioStats}
                loading={loadingMunicipio}
                onClose={() => setSelectedMunicipio(null)}
              />
            )}

            {/* Legenda de cores */}
            {view === 'estado' && (
              <div
                className="absolute bottom-3 right-3 z-[400] rounded-xl px-3 py-2.5 pointer-events-none"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-raised)' }}
              >
                <p className="text-[10px] uppercase tracking-widest font-bold text-slate-600 dark:text-slate-400 mb-1.5">Valor de Emendas (R$)</p>
                <LegendaCores />
              </div>
            )}
          </div>
        </div>

        {/* LINHA 1 — Coluna direita: Top 5 */}
        <div className="col-span-12 md:col-span-2 flex flex-col gap-4 h-[560px]">
          {view === 'brasil' ? (
            <SelecionarEstadoCard />
          ) : selectedMunicipio ? (
            /* Município selecionado → mostra top 5 parlamentares desse município */
            <div className="flex-1 min-h-0">
              <Top5ParlamentaresDoMunicipioCard
                municipioNome={selectedMunicipio.nome}
                parlamentares={top5ParlamentaresDoMunicipio}
                loading={loadingMunicipio}
                onPick={(p) => {
                  setSelectedParlamentar({
                    cpf: p.cpf, idPortal: p.idPortal, nome: p.nome,
                    nomeUrna: null, partido: p.partido, uf: selectedUf,
                    cargo: p.cargo,
                  });
                }}
              />
            </div>
          ) : (
            <div className="flex-1 min-h-0">
              <Top5MunicipiosCard
                resumo={resumo}
                loading={loadingResumo}
                onClick={(m) => handleMunicipioClick(m.codigoIbge, m.nome)}
                escopoParlamentar={
                  selectedParlamentar
                    ? { nome: selectedParlamentar.nome, municipios: parlamentarTop5PorDestino }
                    : null
                }
              />
            </div>
          )}

          {/* Top 5 parlamentares do estado (quando não há município selecionado) */}
          {!selectedMunicipio && (
            <div className="flex-1 min-h-0">
              <Top5ParlamentaresEstadoCard
                topResumo={resumo?.parlamentares ?? []}
                onPick={(p) =>
                  setSelectedParlamentar({
                    cpf: p.cpf, idPortal: p.idPortal, nome: p.nome,
                    nomeUrna: null, partido: p.partido, uf: selectedUf,
                    cargo: p.cargo as ParlamentarCargo,
                  })
                }
              />
            </div>
          )}
        </div>

        {/* LINHA 2 — Comparativo por Área ocupando 9 colunas (centro + direita) */}
        {view === 'estado' && resumo && (
          <div className="col-span-12 md:col-span-9">
            <ComparativoAreasCard
              ano={ano}
              escopo={
                selectedParlamentar && selectedMunicipio
                  ? `${selectedParlamentar.nome.split(' ')[0]} em ${selectedMunicipio.nome}`
                  : selectedParlamentar
                  ? selectedParlamentar.nome
                  : selectedMunicipio
                  ? `município de ${selectedMunicipio.nome}`
                  : `estado de ${selectedStateName}`
              }
              areasAtual={
                selectedParlamentar && selectedMunicipio
                  ? parlamentarMunicipioAreasAtual
                  : selectedParlamentar
                  ? parlamentarAreasAtual
                  : selectedMunicipio && municipioAreasAtual
                  ? municipioAreasAtual
                  : resumo.areas
              }
              areasAnterior={
                selectedParlamentar && selectedMunicipio
                  ? parlamentarMunicipioAreasAnterior
                  : selectedParlamentar
                  ? parlamentarAreasAnterior
                  : selectedMunicipio
                  ? municipioAreasAnterior
                  : comparativoAreasAnterior
              }
            />
          </div>
        )}
      </div>

      {/* Dashboard do parlamentar (aparece quando há parlamentar selecionado) */}
      {selectedParlamentar && (
        <ParlamentarDashboard
          parlamentar={selectedParlamentar}
          ano={ano}
          uf={selectedUf}
          escopo={selectedStateName}
          loading={loadingParlamentar}
          totalAno={parlamentarTotalAno}
          totalPago={parlamentarTotalPago}
          porArea={parlamentarPorArea}
          porAno={parlamentarPorAno}
          maxPorAno={maxParlamentarPorAno}
          porMunicipio={parlamentarPorMunicipio}
          porTipo={parlamentarPorTipo}
          destinos={parlamentarDestinos}
          destinosFlat={parlamentarDestinosFlat}
          emendas={parlamentarEmendas}
          pixPorMunicipio={parlamentarPixPorMunicipio}
          pixTotal={parlamentarPixTotal}
          onMunicipioClick={(m) => setSelectedMunicipio({ codigo: m.codigoIbge, nome: m.nome })}
        />
      )}

    </div>
  );
}

// ===========================================================================
// Componentes internos
// ===========================================================================

function ResumoGeralCard({
  view,
  ano,
  stateName,
  municipio,
  municipioStats,
  resumo,
  parlamentar,
  parlamentarTotal,
  parlamentarTotalPago,
  parlamentarMunicipioTotal,
}: {
  view: 'brasil' | 'estado';
  ano: number;
  stateName: string;
  municipio: { codigo: string; nome: string } | null;
  municipioStats: MunicipioStats | null;
  resumo: ResumoEstado | null;
  parlamentar: PortalParlamentar | null;
  parlamentarTotal: number;
  parlamentarTotalPago: number;
  parlamentarMunicipioTotal: number | null;
}) {
  const tetoMac   = municipio ? municipioStats?.tetoMac   ?? null : null;
  const tetoPap   = municipio ? municipioStats?.tetoPap   ?? null : null;
  const habitantes = municipio ? municipioStats?.habitantes ?? null : null;
  const eleitores  = municipio ? municipioStats?.eleitores  ?? null : null;

  // ── Lógica do card "Total de Emendas" ──────────────────────────────────
  // Prioridade: ambos → só parlamentar → só município → estado inteiro
  const hasBoth = !!(parlamentar && municipio);
  const hasParl = !!parlamentar && !municipio;
  const hasMun  = !!municipio   && !parlamentar;

  const totalLabel = hasBoth
    ? `${parlamentar!.nome.split(' ')[0]} em ${municipio!.nome}`
    : hasParl
    ? 'Total do Parlamentar'
    : hasMun
    ? 'Total de Emendas'
    : 'Total Municipalizado';

  const totalValue = hasBoth
    ? (parlamentarMunicipioTotal ?? 0)
    : hasParl
    ? parlamentarTotal
    : hasMun
    ? (resumo?.valorPorMunicipio?.[municipio!.codigo] ?? 0)
    : (resumo?.totalMunicipalizado ?? 0);

  const totalSub = hasBoth
    ? `de ${parlamentarTotal > 0 ? formatBRLCompact(parlamentarTotal) : '—'} total do parlamentar no estado`
    : hasParl
    ? `${formatBRLCompact(parlamentarTotalPago)} pago · em ${ano}`
    : hasMun
    ? `em ${ano}`
    : (resumo?.totalEstadual ?? 0) > 0
    ? `${formatBRLCompact(resumo!.totalEstadual)} adicional sem município`
    : `em ${ano}`;

  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--tint-06)' }}
    >
      <p className="text-[10px] uppercase tracking-widest font-bold text-slate-600 dark:text-slate-400 mb-3">Resumo Geral</p>
      <div className="space-y-3">
        <ResumoStat
          icon={<Users className="w-4 h-4" />}
          iconBg="rgba(74,158,222,0.15)"
          iconColor="#4a9ede"
          label="População Total"
          value={
            view === 'brasil'
              ? '—'
              : municipio
                ? habitantes != null ? habitantes.toLocaleString('pt-BR') : '—'
                : 'Selecione um município'
          }
          sub={view === 'estado' && municipio ? 'habitantes' : undefined}
        />
        <ResumoStat
          icon={<Vote className="w-4 h-4" />}
          iconBg="rgba(99,102,241,0.15)"
          iconColor="#6366f1"
          label="Eleitores"
          value={
            municipio
              ? eleitores != null ? eleitores.toLocaleString('pt-BR') : '—'
              : 'Selecione um município'
          }
          sub={municipio ? 'eleitores' : undefined}
        />
        <ResumoStat
          icon={<Landmark className="w-4 h-4" />}
          iconBg="rgba(16,185,129,0.15)"
          iconColor="#10b981"
          label={totalLabel}
          value={formatBRLCompact(totalValue)}
          sub={totalSub}
        />
        <ResumoStat
          icon={<Building2 className="w-4 h-4" />}
          iconBg="rgba(245,158,11,0.15)"
          iconColor="#f59e0b"
          label="Teto MAC"
          value={
            tetoMac != null
              ? formatBRLCompact(tetoMac)
              : municipio
                ? 'sem dados'
                : 'Selecione um município'
          }
          sub={municipio && tetoMac != null ? 'Média e Alta Complexidade · anual' : undefined}
        />
        <ResumoStat
          icon={<Building2 className="w-4 h-4" />}
          iconBg="rgba(20,184,166,0.15)"
          iconColor="#14b8a6"
          label="Teto PAP"
          value={
            tetoPap != null
              ? formatBRLCompact(tetoPap)
              : municipio
                ? 'sem dados'
                : 'Selecione um município'
          }
          sub={municipio && tetoPap != null ? 'Atenção Primária · anual' : undefined}
        />
      </div>
    </div>
  );
}

function ResumoStat({
  icon, iconBg, iconColor, label, value, sub,
}: { icon: React.ReactNode; iconBg: string; iconColor: string; label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: iconBg, color: iconColor, border: `1px solid ${iconColor}33` }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-slate-600 dark:text-slate-500 font-semibold">{label}</p>
        <p className="text-[color:var(--text-primary)] font-bold text-base truncate">{value}</p>
        {sub && <p className="text-[10px] text-slate-600 dark:text-slate-500">{sub}</p>}
      </div>
    </div>
  );
}

function EmendasPorAreaCard({
  view,
  municipio,
  parlamentar,
  emendas,
  resumo,
}: {
  view: 'brasil' | 'estado';
  municipio: { codigo: string; nome: string } | null;
  parlamentar: PortalParlamentar | null;
  emendas: PortalEmenda[];
  resumo: ResumoEstado | null;
}) {
  const areas = useMemo(() => {
    if (municipio || parlamentar) {
      const m = new Map<EmendaArea, number>();
      emendas.forEach((e) => m.set(e.area, (m.get(e.area) ?? 0) + e.valorEmpenhado));
      return Array.from(m.entries())
        .map(([area, total]) => ({ area, total }))
        .sort((a, b) => b.total - a.total);
    }
    return resumo?.areas ?? [];
  }, [municipio, parlamentar, emendas, resumo]);

  const data = useMemo(
    () =>
      areas.map((a) => ({
        name:  AREA_LABELS[a.area],
        value: Math.round(a.total),
        color: AREA_COLORS[a.area],
      })),
    [areas],
  );

  const total = areas.reduce((s, a) => s + a.total, 0);

  return (
    <div
      className="rounded-2xl p-4 h-full"
      style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--tint-06)' }}
    >
      <p className="text-[10px] uppercase tracking-widest font-bold text-slate-600 dark:text-slate-400 mb-3">Emendas por Área</p>
      {view === 'brasil' || areas.length === 0 ? (
        <p className="text-xs text-slate-600 dark:text-slate-500 text-center py-6">
          {view === 'brasil' ? 'Selecione um estado no mapa' : 'Sem dados para o ano selecionado'}
        </p>
      ) : (
        <>
          <div className="h-44 relative">
            <Donut3DChart
              data={data.slice(0, 6)}
              centerValue={formatBRLCompact(total)}
              centerLabel="total"
              hideLegend
              valueFormatter={formatBRL}
            />
          </div>
          <div className="mt-3 space-y-1.5">
            {areas.slice(0, 4).map((a) => {
              const pct = total > 0 ? ((a.total / total) * 100).toFixed(0) : '0';
              return (
                <div key={a.area} className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: AREA_COLORS[a.area] }} />
                    <span className="text-slate-700 dark:text-slate-300 truncate">{AREA_LABELS[a.area]}</span>
                  </div>
                  <span className="text-[color:var(--text-primary)] font-semibold flex-shrink-0">{formatBRLCompact(a.total)} <span className="text-slate-600 dark:text-slate-500">({pct}%)</span></span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function SelecionarEstadoCard() {
  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--tint-06)' }}
    >
      <p className="text-[10px] uppercase tracking-widest font-bold text-slate-600 dark:text-slate-400 mb-2">Como usar</p>
      <ol className="text-xs text-slate-700 dark:text-slate-300 space-y-2 list-decimal list-inside">
        <li>Clique em um estado no mapa</li>
        <li>Escolha um município (popup mostra habitantes, eleitores e tetos)</li>
        <li>Pesquise um parlamentar para ver os gráficos por área e por ano</li>
      </ol>
    </div>
  );
}

function Top5ParlamentaresDoMunicipioCard({
  municipioNome, parlamentares, loading, onPick,
}: {
  municipioNome: string;
  parlamentares: { cpf: string | null; idPortal: string; nome: string; total: number; cargo: ParlamentarCargo; partido: string | null }[];
  loading: boolean;
  onPick: (p: { cpf: string | null; idPortal: string; nome: string; total: number; cargo: ParlamentarCargo; partido: string | null }) => void;
}) {
  return (
    <div
      className="rounded-2xl p-4 h-full flex flex-col"
      style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--tint-06)' }}
    >
      <p className="text-[10px] uppercase tracking-widest font-bold text-slate-600 dark:text-slate-400 mb-1 flex-shrink-0">Top 5 Parlamentares</p>
      <p className="text-[10px] text-[color:var(--brand-cobalt-text)]/80 mb-2 truncate flex-shrink-0" title={municipioNome}>
        que mais enviaram para {municipioNome}
      </p>
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-slate-600 dark:text-slate-500" />
        </div>
      )}
      {!loading && parlamentares.length === 0 && (
        <p className="text-xs text-slate-600 dark:text-slate-500 text-center py-4">Sem dados disponíveis</p>
      )}
      {!loading && parlamentares.length > 0 && (
        <ol className="flex-1 overflow-y-auto space-y-2 pr-0.5">
          {parlamentares.map((p, i) => (
            <li key={p.idPortal}>
              <button
                onClick={() => onPick(p)}
                className="w-full flex items-center gap-2 group hover:bg-[var(--tint-06)] -mx-2 px-2 py-1 rounded-lg transition-colors text-left"
              >
                <span className="text-xs font-bold text-slate-600 dark:text-slate-500 w-4">{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-[color:var(--text-primary)] truncate group-hover:text-[color:var(--brand-cobalt-text)] transition-colors">{p.nome}</p>
                  <p className="text-[10px] text-slate-600 dark:text-slate-500">{CARGO_LABELS[p.cargo]}{p.partido ? ` · ${p.partido}` : ''}</p>
                </div>
                <span className="text-xs font-semibold text-[color:var(--brand-cobalt-text)] flex-shrink-0">{formatBRLCompact(p.total)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Top5ParlamentaresEstadoCard({
  topResumo, onPick,
}: {
  topResumo: { cpf: string | null; idPortal: string; nome: string; cargo: string; partido: string | null; total: number }[];
  onPick: (p: { cpf: string | null; idPortal: string; nome: string; cargo: string; partido: string | null; total: number }) => void;
}) {
  if (topResumo.length === 0) return null;
  return (
    <div
      className="rounded-2xl p-4 h-full flex flex-col"
      style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--tint-06)' }}
    >
      <p className="text-[10px] uppercase tracking-widest font-bold text-slate-600 dark:text-slate-400 mb-3 flex-shrink-0">Top 5 Parlamentares</p>
      <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
        {topResumo.slice(0, 5).map((p) => (
          <button
            key={p.idPortal}
            onClick={() => onPick(p)}
            className="w-full flex items-center gap-2 group text-left hover:bg-[var(--tint-06)] -mx-1 px-1 py-1 rounded-lg transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-[color:var(--text-primary)] truncate group-hover:text-[color:var(--brand-cobalt-text)]">{p.nome}</p>
              <p className="text-[10px] text-slate-600 dark:text-slate-500">{CARGO_LABELS[p.cargo as ParlamentarCargo] ?? p.cargo}</p>
            </div>
            <span className="text-[11px] font-semibold text-[color:var(--brand-cobalt-text)] flex-shrink-0">{formatBRLCompact(p.total)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Top5MunicipiosCard({
  resumo,
  loading,
  onClick,
  escopoParlamentar,
}: {
  resumo: ResumoEstado | null;
  loading: boolean;
  onClick: (m: { codigoIbge: string; nome: string }) => void;
  /** Quando set, mostra o top 5 do parlamentar em vez do agregado do estado. */
  escopoParlamentar?: {
    nome: string;
    municipios: { codigoIbge: string; nome: string; total: number }[];
  } | null;
}) {
  // Se há parlamentar selecionado, usa o top dele. Senão, usa o do estado.
  const top = escopoParlamentar?.municipios ?? resumo?.topMunicipios ?? [];
  const isParlamentar = !!escopoParlamentar;

  return (
    <div
      className="rounded-2xl p-4 h-full flex flex-col"
      style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--tint-06)' }}
    >
      <p className="text-[10px] uppercase tracking-widest font-bold text-slate-600 dark:text-slate-400 mb-1 flex-shrink-0">
        Top 5 Municípios
      </p>
      {isParlamentar && (
        <p className="text-[10px] text-[color:var(--brand-cobalt-text)]/80 mb-2 truncate flex-shrink-0" title={escopoParlamentar.nome}>
          beneficiados por {escopoParlamentar.nome}
        </p>
      )}
      {!isParlamentar && <div className="mb-2 flex-shrink-0" />}

      {loading && !isParlamentar && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-slate-600 dark:text-slate-500" />
        </div>
      )}
      {!loading && top.length === 0 && (
        <p className="text-xs text-slate-600 dark:text-slate-500 text-center py-4">
          {isParlamentar
            ? 'Nenhum município identificado (emendas em nível estadual)'
            : 'Sem dados disponíveis'}
        </p>
      )}
      {!loading && top.length > 0 && (
        <ol className="flex-1 overflow-y-auto space-y-2 pr-0.5">
          {top.map((m, i) => (
            <li key={m.codigoIbge}>
              <button
                onClick={() => onClick(m)}
                className="w-full flex items-center gap-2 group hover:bg-[var(--tint-06)] -mx-2 px-2 py-1 rounded-lg transition-colors text-left"
              >
                <span className="text-xs font-bold text-slate-600 dark:text-slate-500 w-4">{i + 1}.</span>
                <span className="text-xs text-[color:var(--text-primary)] truncate flex-1 group-hover:text-[color:var(--brand-cobalt-text)] transition-colors">{m.nome}</span>
                <span className="text-xs font-semibold text-[color:var(--brand-cobalt-text)]">{formatBRLCompact(m.total)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ParlamentarSearchCard({
  query, setQuery, results, searching, onPick, topResumo, onPickFromResumo, selected, onClear,
}: {
  query: string;
  setQuery: (v: string) => void;
  results: PortalParlamentar[];
  searching: boolean;
  onPick: (p: PortalParlamentar) => void;
  topResumo: { cpf: string | null; idPortal: string; nome: string; cargo: string; partido: string | null; total: number }[];
  onPickFromResumo: (p: { cpf: string | null; idPortal: string; nome: string; cargo: string; partido: string | null; total: number }) => void;
  selected: PortalParlamentar | null;
  onClear: () => void;
}) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--tint-06)' }}
    >
      <p className="text-[10px] uppercase tracking-widest font-bold text-slate-600 dark:text-slate-400 mb-2">Emendas por Parlamentar</p>

      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pesquisar parlamentar…"
          className="w-full bg-[var(--tint-06)] border border-[var(--tint-10)] rounded-xl pl-8 pr-3 py-2 text-xs text-[color:var(--text-primary)] placeholder-slate-500 outline-none focus:border-amber-500/50"
        />
        {searching && <Loader2 className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-slate-600 dark:text-slate-500" />}
      </div>

      {query.length >= 2 && results.length > 0 && (
        <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
          {results.map((p) => (
            <button
              key={p.idPortal}
              onClick={() => onPick(p)}
              className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-[var(--tint-06)] transition-colors"
            >
              <p className="text-xs text-[color:var(--text-primary)] font-medium truncate">{p.nome}</p>
              <p className="text-[10px] text-slate-600 dark:text-slate-500">
                {CARGO_LABELS[p.cargo]}
                {p.partido ? ` · ${p.partido}` : ''}
                {p.uf ? ` · ${p.uf}` : ''}
              </p>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="mt-3 flex items-center gap-2 px-2.5 py-2 rounded-xl"
          style={{ background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.25)' }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-xs text-[color:var(--text-primary)] font-semibold truncate">{selected.nome}</p>
            <p className="text-[10px] text-[color:var(--brand-cobalt-text)]/80">
              {CARGO_LABELS[selected.cargo]}{selected.partido ? ` · ${selected.partido}` : ''}
            </p>
          </div>
          <button onClick={onClear} className="text-slate-600 dark:text-slate-500 hover:text-white p-1 rounded-lg">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {!selected && topResumo.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {topResumo.slice(0, 5).map((p) => (
            <button
              key={p.idPortal}
              onClick={() => onPickFromResumo(p)}
              className="w-full flex items-center gap-2 group text-left hover:bg-[var(--tint-06)] -mx-1 px-1 py-1 rounded-lg transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-[color:var(--text-primary)] truncate group-hover:text-[color:var(--brand-cobalt-text)]">{p.nome}</p>
                <p className="text-[10px] text-slate-600 dark:text-slate-500">{CARGO_LABELS[p.cargo as ParlamentarCargo] ?? p.cargo}</p>
              </div>
              <span className="text-[11px] font-semibold text-[color:var(--brand-cobalt-text)] flex-shrink-0">{formatBRLCompact(p.total)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MunicipioPopup({
  municipio, stats, loading, onClose,
}: {
  municipio: { codigo: string; nome: string };
  stats: MunicipioStats | null;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 6 }}
        className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-[450] rounded-xl px-4 py-3 pointer-events-auto min-w-[220px]"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-default)',
          boxShadow: 'var(--shadow-raised)',
        }}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[color:var(--brand-cobalt-text)]">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              Município
            </span>
            <p className="text-[color:var(--text-primary)] font-bold text-sm mt-0.5">{municipio.nome}</p>
          </div>
          <button onClick={onClose} className="text-slate-600 dark:text-slate-400 hover:text-white p-0.5 rounded-lg">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {loading ? (
          <div className="py-2 flex items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-slate-600 dark:text-slate-500" />
          </div>
        ) : (
          <div className="space-y-1.5 text-[11px]">
            <PopupRow
              label="Habitantes"
              value={stats?.habitantes != null ? stats.habitantes.toLocaleString('pt-BR') : '—'}
              hint={stats?.fonteHabitantes ?? undefined}
            />
            <PopupRow
              label="Eleitores"
              value={stats?.eleitores != null ? stats.eleitores.toLocaleString('pt-BR') : '—'}
              hint={stats?.eleitores == null ? 'requer importação do TSE' : undefined}
            />
            <PopupRow
              label="Teto MAC"
              value={stats?.tetoMac != null ? formatBRLCompact(stats.tetoMac) : '—'}
              hint={stats?.tetoMac == null ? 'requer cadastro manual (DataSUS)' : undefined}
            />
            <PopupRow
              label="Teto PAP"
              value={stats?.tetoPap != null ? formatBRLCompact(stats.tetoPap) : '—'}
              hint={stats?.tetoPap == null ? 'fonte SISAPS — pendente' : undefined}
            />
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function PopupRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-slate-600 dark:text-slate-400 flex-shrink-0">{label}</span>
      <div className="text-right min-w-0">
        <span className={value === '—' ? 'text-slate-600 dark:text-slate-500' : 'text-[color:var(--text-primary)] font-semibold'}>{value}</span>
        {hint && <p className="text-[9px] text-slate-600 dark:text-slate-500 italic mt-0.5 leading-tight">{hint}</p>}
      </div>
    </div>
  );
}

function LegendaCores() {
  // Mesmas faixas discretas usadas pelo StateMap em darkMode — qualquer mudança
  // aqui precisa replicar no getColor de state-map.tsx pra legenda continuar
  // batendo com o desenho.
  const items = [
    { label: 'Acima de R$ 2 milhões',         color: '#0c4f8a' },
    { label: 'R$ 1 milhão – 2 milhões',       color: '#1d6fb8' },
    { label: 'R$ 500 mil – 1 milhão',         color: '#3a8ed1' },
    { label: 'Até R$ 500 mil',                color: '#7fb8e0' },
    { label: 'Sem emendas',                   color: '#15355c', border: '1px solid var(--tint-18)' },
  ];
  return (
    <div className="space-y-1">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-sm flex-shrink-0"
            style={{ background: it.color, border: (it as any).border ?? 'none' }}
          />
          <span className="text-[10px] text-slate-700 dark:text-slate-300">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

interface ParlamentarPorMunicipio {
  codigoIbge: string;
  nome:       string;
  uf:         string | null;
  total:      number;
  areas:      { area: EmendaArea; valor: number }[];
}

function ParlamentarDashboard({
  parlamentar, ano, uf, escopo, loading, totalAno, totalPago, porArea, porAno, maxPorAno, porMunicipio, porTipo, destinos, destinosFlat, emendas, pixPorMunicipio, pixTotal, onMunicipioClick,
}: {
  parlamentar: PortalParlamentar;
  ano: number;
  uf?: string;
  escopo?: string;
  loading: boolean;
  totalAno: number;
  totalPago: number;
  porArea: { name: string; value: number; color: string; area: EmendaArea }[];
  porAno: { ano: number; total: number }[];
  maxPorAno: number;
  porMunicipio: ParlamentarPorMunicipio[];
  porTipo: { tipo: string; total: number; qtd: number }[];
  destinos: { municipal: number; estadual: number; qtdMun: number; qtdEst: number };
  destinosFlat: DestinoRow[];
  emendas: PortalEmenda[];
  pixPorMunicipio: { codigoIbge: string; nome: string; uf: string | null; total: number; qtd: number }[];
  pixTotal: number;
  onMunicipioClick?: (m: ParlamentarPorMunicipio) => void;
}) {
  const pctPago = totalAno > 0 ? (totalPago / totalAno) * 100 : 0;
  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--tint-06)' }}
    >
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-widest font-bold text-[color:var(--brand-cobalt-text)]">Dashboard do parlamentar</p>
          <h2 className="text-xl text-[color:var(--text-primary)] font-bold mt-1">{parlamentar.nome}</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            {CARGO_LABELS[parlamentar.cargo]}
            {parlamentar.partido ? ` · ${parlamentar.partido}` : ''}
            {parlamentar.uf ? ` · ${parlamentar.uf}` : ''}
          </p>
        </div>
        <div
          className="rounded-2xl px-5 py-3 text-right"
          style={{
            background: 'linear-gradient(135deg, rgba(37,99,235,0.15), rgba(37,99,235,0.05))',
            border: '1px solid rgba(37,99,235,0.35)',
            boxShadow: 'inset 0 0 18px rgba(37,99,235,0.08)',
          }}
        >
          <p className="text-[10px] uppercase tracking-widest text-[color:var(--brand-cobalt-text)] font-bold">
            Total enviado em {ano}{escopo ? ` · ${escopo}` : ''}
          </p>
          <p className="text-2xl font-bold text-[color:var(--text-primary)] mt-0.5">
            {loading ? <Loader2 className="w-5 h-5 animate-spin inline" /> : formatBRLCompact(totalAno)}
          </p>
          {!loading && totalAno > 0 && (
            <p className="text-[11px] text-[color:var(--success)] mt-0.5">
              Pago: <span className="font-bold">{formatBRLCompact(totalPago)}</span>
              <span className="text-[color:var(--success)]/60"> ({pctPago.toFixed(0)}%)</span>
            </p>
          )}
          {!loading && (destinos.municipal > 0 || destinos.estadual > 0) && (
            <div className="mt-2 text-[10px] text-slate-700 dark:text-slate-300 space-y-0.5 text-right">
              <p>
                <span className="text-[color:var(--brand-cobalt-text)]">●</span> A municípios: <span className="font-semibold text-[color:var(--text-primary)]">{formatBRLCompact(destinos.municipal)}</span>
                <span className="text-slate-600 dark:text-slate-500"> ({destinos.qtdMun})</span>
              </p>
              <p>
                <span className="text-violet-400">●</span> Nível UF (sem município): <span className="font-semibold text-[color:var(--text-primary)]">{formatBRLCompact(destinos.estadual)}</span>
                <span className="text-slate-600 dark:text-slate-500"> ({destinos.qtdEst})</span>
              </p>
            </div>
          )}
          {!loading && porTipo.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2 justify-end max-w-[360px]">
              {porTipo.map((t) => (
                <span
                  key={t.tipo}
                  className="text-[9px] px-1.5 py-0.5 rounded-md font-semibold"
                  style={{
                    background: 'var(--tint-06)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--tint-08)',
                  }}
                  title={`${t.qtd} ${t.qtd === 1 ? 'emenda' : 'emendas'}`}
                >
                  {t.tipo}: {formatBRLCompact(t.total)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-10 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-slate-600 dark:text-slate-500" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Donut: Emendas por Área */}
          <div className="rounded-xl p-4" style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--tint-04)' }}>
            <p className="text-[10px] uppercase tracking-widest font-bold text-slate-600 dark:text-slate-400 mb-2">Distribuição por área</p>
            {porArea.length === 0 ? (
              <p className="text-xs text-slate-600 dark:text-slate-500 text-center py-10">Sem emendas em {ano}</p>
            ) : (
              <>
                <div className="h-56 relative">
                  <Donut3DChart
                    data={porArea.slice(0, 6)}
                    centerValue={formatBRLCompact(totalAno)}
                    centerLabel={`em ${ano}`}
                    valueFormatter={formatBRL}
                  />
                </div>
              </>
            )}
          </div>

          {/* Linha: Valor por Ano */}
          <div className="rounded-xl p-4" style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--tint-04)' }}>
            <p className="text-[10px] uppercase tracking-widest font-bold text-slate-600 dark:text-slate-400 mb-2">Valor por ano (histórico)</p>
            {porAno.length === 0 ? (
              <p className="text-xs text-slate-600 dark:text-slate-500 text-center py-10">Sem histórico disponível</p>
            ) : (
              <div className="space-y-2 mt-2">
                {porAno.map((p) => {
                  const pct = Math.max(2, (p.total / maxPorAno) * 100);
                  const isAnoSelecionado = p.ano === ano;
                  return (
                    <div key={p.ano} className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className={isAnoSelecionado ? 'text-[color:var(--brand-cobalt-text)] font-bold' : 'text-slate-700 dark:text-slate-300'}>{p.ano}</span>
                        <span className={isAnoSelecionado ? 'text-[color:var(--brand-cobalt-text)] font-bold' : 'text-[color:var(--text-primary)] font-semibold'}>
                          {formatBRLCompact(p.total)}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-[var(--tint-06)] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            background: isAnoSelecionado
                              ? 'linear-gradient(90deg, #2563EB, var(--brand-cobalt-text))'
                              : 'linear-gradient(90deg, #4a9ede, #6cb9ed)',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Barras: Comparativo de todas as áreas (do ano selecionado) */}
          <div className="rounded-xl p-4" style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--tint-04)' }}>
            <p className="text-[10px] uppercase tracking-widest font-bold text-slate-600 dark:text-slate-400 mb-2">Comparativo de áreas em {ano}</p>
            {porArea.length === 0 ? (
              <p className="text-xs text-slate-600 dark:text-slate-500 text-center py-10">Sem dados</p>
            ) : (
              <div className="space-y-2 mt-2">
                {porArea.map((a) => {
                  const max = porArea[0].value;
                  const pct = Math.max(2, (a.value / max) * 100);
                  return (
                    <div key={a.area} className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-700 dark:text-slate-300 truncate">{a.name}</span>
                        <span className="text-[color:var(--text-primary)] font-semibold">{formatBRLCompact(a.value)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-[var(--tint-06)] overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: a.color, boxShadow: `0 0 6px ${a.color}66` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tabela detalhada das emendas individuais */}
      {!loading && (emendas.length > 0 || destinosFlat.length > 0) && (
        <EmendasDetalhadasCard ano={ano} uf={uf} emendas={emendas} destinosFlat={destinosFlat} />
      )}


      {/* Destinos de transferências Pix (EC 105/2019) — preenche quando a
          emenda foi cadastrada a nível UF e o município só foi decidido
          depois via Pix Parlamentar. */}
      {!loading && pixPorMunicipio.length > 0 && (
        <MunicipiosPixCard
          ano={ano}
          pixPorMunicipio={pixPorMunicipio}
          pixTotal={pixTotal}
          onClick={(m) => onMunicipioClick?.({
            codigoIbge: m.codigoIbge,
            nome:       m.nome,
            uf:         m.uf,
            total:      m.total,
            areas:      [],
          })}
        />
      )}
    </div>
  );
}

function EmendasDetalhadasCard({
  ano, uf, emendas, destinosFlat,
}: {
  ano: number;
  uf?: string;
  emendas: PortalEmenda[];
  destinosFlat: DestinoRow[];
}) {
  const semDadosPagamento = emendas.length > 0
    && emendas.every((e) => e.autorCargo === 'DEPUTADO_ESTADUAL' && e.valorPago === 0);
  const semDadosExecucao = semDadosPagamento
    && emendas.every((e) => e.valorEmpenhado === 0);

  const [emendaSelecionada, setEmendaSelecionada] = useState<{
    codigo: string;
    titulo: string;
    filtroFavorecido?: { cnpj: string | null; nome: string | null; municipio: string | null; uf: string | null };
  } | null>(null);

  // Filtros
  const [busca, setBusca] = useState('');
  const [funcaoFiltro, setFuncaoFiltro] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('');
  const [valorColuna, setValorColuna] = useState<'empenhado' | 'pago'>('empenhado');
  const [valorMin, setValorMin] = useState('');
  const [valorMax, setValorMax] = useState('');

  // Quando há destinosFlat usa-os; caso contrário usa emendas como fallback
  const usandoFlat = destinosFlat.length > 0;

  // Dropdowns: populados a partir dos destinos flat (ou emendas no fallback)
  const funcoes = useMemo(() => {
    const s = new Set<string>();
    if (usandoFlat) destinosFlat.forEach((d) => { if (d.funcao) s.add(d.funcao); });
    else            emendas.forEach((e) => { if (e.funcao) s.add(e.funcao); });
    return Array.from(s).sort();
  }, [usandoFlat, destinosFlat, emendas]);

  const tiposCurtos = useMemo(() => {
    const s = new Set<string>();
    if (usandoFlat) destinosFlat.forEach((d) => { if (d.tipoEmenda) s.add(tipoCurtoLabel(d.tipoEmenda)); });
    else            emendas.forEach((e) => { if (e.tipo) s.add(tipoCurtoLabel(e.tipo)); });
    return Array.from(s).sort();
  }, [usandoFlat, destinosFlat, emendas]);

  const normalizar = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const vMinNum = valorMin ? parseFloat(valorMin) : null;
  const vMaxNum = valorMax ? parseFloat(valorMax) : null;
  const q = normalizar(busca.trim());

  // ── Flat (destinos reais por favorecido) ──────────────────────────────────
  const destinosFiltrados = useMemo(() => {
    if (!usandoFlat) return [];
    return destinosFlat.filter((d) => {
      if (q && !normalizar(d.municipio ?? '').includes(q)
             && !normalizar(d.nomeFavorecido ?? '').includes(q)
             && !normalizar(d.funcao ?? '').includes(q)
             && !normalizar(d.numeroEmenda ?? '').includes(q)) return false;
      if (funcaoFiltro && d.funcao !== funcaoFiltro) return false;
      if (tipoFiltro && tipoCurtoLabel(d.tipoEmenda) !== tipoFiltro) return false;
      const valFiltro = valorColuna === 'pago' ? d.valorPago : d.valorEmpenhado;
      if (valorColuna === 'pago' && d.valorPago === 0) return false;
      if (vMinNum !== null && valFiltro < vMinNum) return false;
      if (vMaxNum !== null && valFiltro > vMaxNum) return false;
      return true;
    });
  }, [usandoFlat, destinosFlat, q, funcaoFiltro, tipoFiltro, valorColuna, vMinNum, vMaxNum]);

  // ── Fallback: emendas filtradas ───────────────────────────────────────────
  const emendasFiltradas = useMemo(() => {
    if (usandoFlat) return [];
    return [...emendas]
      .filter((e) => {
        if (q && !normalizar(e.municipioNome ?? '').includes(q)
               && !normalizar(e.funcao ?? '').includes(q)
               && !normalizar(e.objeto ?? '').includes(q)
               && !normalizar(e.numero ?? '').includes(q)) return false;
        if (funcaoFiltro && e.funcao !== funcaoFiltro) return false;
        if (tipoFiltro && tipoCurtoLabel(e.tipo) !== tipoFiltro) return false;
        const valFiltro = valorColuna === 'pago' ? (e.valorPago ?? 0) : (e.valorEmpenhado ?? 0);
        if (valorColuna === 'pago' && (e.valorPago ?? 0) === 0) return false;
        if (vMinNum !== null && valFiltro < vMinNum) return false;
        if (vMaxNum !== null && valFiltro > vMaxNum) return false;
        return true;
      })
      .sort((a, b) => (b.valorEmpenhado ?? 0) - (a.valorEmpenhado ?? 0));
  }, [usandoFlat, emendas, q, funcaoFiltro, tipoFiltro, valorColuna, vMinNum, vMaxNum]);

  const temFiltro = busca || funcaoFiltro || tipoFiltro || valorMin || valorMax || valorColuna !== 'empenhado';
  const totalItens   = usandoFlat ? destinosFlat.length   : emendas.length;
  const filtradoQtd  = usandoFlat ? destinosFiltrados.length : emendasFiltradas.length;
  const totalValor   = usandoFlat
    ? (temFiltro ? destinosFiltrados : destinosFlat).reduce((s, d) => s + d.valorEmpenhado, 0)
    : (temFiltro ? emendasFiltradas  : emendas).reduce((s, e) => s + (e.valorEmpenhado ?? 0), 0);

  const labelItens = usandoFlat ? 'destinos' : (emendas.length === 1 ? 'emenda' : 'emendas');

  const limparFiltros = () => { setBusca(''); setFuncaoFiltro(''); setTipoFiltro(''); setValorMin(''); setValorMax(''); };

  return (
    <div
      className="mt-4 rounded-2xl overflow-hidden"
      style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--tint-06)' }}
    >
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div
        className="px-5 py-3.5 flex items-center justify-between gap-4 flex-wrap"
        style={{ borderBottom: '1px solid var(--tint-06)', background: 'rgba(255,255,255,0.02)' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-1 h-4 rounded-full" style={{ background: 'linear-gradient(180deg,#f59e0b,#d97706)' }} />
          <p className="text-xs font-bold text-[color:var(--text-primary)] tracking-wide">Detalhe das Emendas</p>
          <span className="text-[10px] text-slate-600 dark:text-slate-500 font-medium">{ano}</span>
        </div>
        <div className="flex items-center gap-3">
          {semDadosExecucao && (
            <span className="text-[10px] text-[color:var(--brand-cobalt)]/70 italic hidden sm:block">Sem dados de execução estadual</span>
          )}
          {semDadosPagamento && !semDadosExecucao && (
            <span className="text-[10px] text-[color:var(--brand-cobalt)]/70 italic hidden sm:block">Sem dados de pagamento estadual</span>
          )}
          <div className="flex items-center gap-2 px-3 py-1 rounded-full" style={{ background: 'var(--tint-04)', border: '1px solid var(--tint-08)' }}>
            {temFiltro && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
            )}
            <span className="text-[11px] font-semibold text-[color:var(--text-primary)]">
              {temFiltro ? filtradoQtd : totalItens}
            </span>
            <span className="text-[10px] text-slate-600 dark:text-slate-400">{labelItens}</span>
            <span className="text-slate-600 text-[10px]">·</span>
            <span className="text-[11px] font-semibold text-[color:var(--success)]">{formatBRLCompact(totalValor)}</span>
          </div>
          {temFiltro && (
            <button
              onClick={limparFiltros}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium text-slate-700 dark:text-slate-300 hover:text-white transition-colors"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}
            >
              <X className="w-3 h-3" /> Limpar
            </button>
          )}
        </div>
      </div>

      {/* ── Barra de filtros ─────────────────────────────────────────────── */}
      <div className="px-5 py-3 flex flex-wrap gap-2" style={{ borderBottom: '1px solid var(--tint-04)' }}>
        {/* Busca */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600 dark:text-slate-500 pointer-events-none" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={usandoFlat ? 'Buscar favorecido, município ou nº…' : 'Buscar município, função ou nº…'}
            className="w-full h-9 rounded-xl pl-9 pr-3 text-[12px] text-[color:var(--text-primary)] placeholder-slate-500 outline-none transition-all"
            style={{
              background: busca ? 'rgba(245,158,11,0.08)' : 'var(--tint-04)',
              border: busca ? '1px solid rgba(245,158,11,0.35)' : '1px solid var(--tint-08)',
            }}
          />
        </div>

        {/* Área */}
        <div className="relative min-w-[150px]">
          <select
            value={funcaoFiltro}
            onChange={(e) => setFuncaoFiltro(e.target.value)}
            className="w-full h-9 rounded-xl px-3 pr-8 text-[12px] text-[color:var(--text-primary)] outline-none appearance-none cursor-pointer transition-all"
            style={{
              background: funcaoFiltro ? 'rgba(99,102,241,0.12)' : 'var(--tint-04)',
              border: funcaoFiltro ? '1px solid rgba(99,102,241,0.4)' : '1px solid var(--tint-08)',
            }}
          >
            <option value="" style={{ background: '#0a1f3d' }}>Todas as áreas</option>
            {funcoes.map((f) => <option key={f} value={f} style={{ background: '#0a1f3d' }}>{f}</option>)}
          </select>
          <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
            <svg className="w-3 h-3 text-slate-600 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </div>
        </div>

        {/* Tipo */}
        <div className="relative min-w-[150px]">
          <select
            value={tipoFiltro}
            onChange={(e) => setTipoFiltro(e.target.value)}
            className="w-full h-9 rounded-xl px-3 pr-8 text-[12px] text-[color:var(--text-primary)] outline-none appearance-none cursor-pointer transition-all"
            style={{
              background: tipoFiltro ? 'rgba(16,185,129,0.1)' : 'var(--tint-04)',
              border: tipoFiltro ? '1px solid rgba(16,185,129,0.35)' : '1px solid var(--tint-08)',
            }}
          >
            <option value="" style={{ background: '#0a1f3d' }}>Todos os tipos</option>
            {tiposCurtos.map((t) => <option key={t} value={t} style={{ background: '#0a1f3d' }}>{t}</option>)}
          </select>
          <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
            <svg className="w-3 h-3 text-slate-600 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </div>
        </div>

        {/* Coluna de valor + faixa */}
        <div className="flex items-center gap-1.5">
          {/* Toggle Empenhado / Pago */}
          <div className="flex rounded-xl overflow-hidden border border-[var(--tint-10)] flex-shrink-0">
            {(['empenhado', 'pago'] as const).map((col) => (
              <button
                key={col}
                onClick={() => { setValorColuna(col); setValorMin(''); setValorMax(''); }}
                className="h-9 px-3 text-[11px] font-semibold transition-all whitespace-nowrap"
                style={{
                  background: valorColuna === col ? 'rgba(74,158,222,0.2)' : 'var(--tint-04)',
                  color: valorColuna === col ? '#4a9ede' : '#64748b',
                  borderRight: col === 'empenhado' ? '1px solid var(--tint-08)' : undefined,
                }}
              >
                {col === 'empenhado' ? 'Empenhado' : 'Pago'}
              </button>
            ))}
          </div>
          {/* Faixa de valor */}
          <div className="flex items-center gap-1.5 min-w-[160px]">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-600 dark:text-slate-500 font-medium pointer-events-none">R$</span>
              <input
                value={valorMin}
                onChange={(e) => setValorMin(e.target.value)}
                placeholder="Mín"
                type="number"
                min={0}
                className="w-full h-9 rounded-xl pl-7 pr-2 text-[12px] text-[color:var(--text-primary)] placeholder-slate-500 outline-none transition-all"
                style={{
                  background: valorMin ? 'rgba(74,158,222,0.1)' : 'var(--tint-04)',
                  border: valorMin ? '1px solid rgba(74,158,222,0.35)' : '1px solid var(--tint-08)',
                }}
              />
            </div>
            <div className="w-3 h-px bg-slate-600 flex-shrink-0" />
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-600 dark:text-slate-500 font-medium pointer-events-none">R$</span>
              <input
                value={valorMax}
                onChange={(e) => setValorMax(e.target.value)}
                placeholder="Máx"
                type="number"
                min={0}
                className="w-full h-9 rounded-xl pl-7 pr-2 text-[12px] text-[color:var(--text-primary)] placeholder-slate-500 outline-none transition-all"
                style={{
                  background: valorMax ? 'rgba(74,158,222,0.1)' : 'var(--tint-04)',
                  border: valorMax ? '1px solid rgba(74,158,222,0.35)' : '1px solid var(--tint-08)',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabelas ──────────────────────────────────────────────────────── */}
      <div className="px-5 pb-4">
        {/* Vazio */}
        {((usandoFlat && destinosFiltrados.length === 0) || (!usandoFlat && emendasFiltradas.length === 0)) && (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <Search className="w-5 h-5 text-slate-600" />
            <p className="text-[12px] text-slate-600 dark:text-slate-500">Nenhum resultado encontrado</p>
            {temFiltro && (
              <button onClick={limparFiltros} className="text-[11px] text-[color:var(--brand-cobalt)] hover:text-[color:var(--brand-cobalt-text)] mt-1 transition-colors">
                Limpar filtros
              </button>
            )}
          </div>
        )}

        {/* Flat */}
        {usandoFlat && destinosFiltrados.length > 0 && (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-[12px] border-separate border-spacing-0">
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                  {(['Nº', 'Tipo', 'Área', 'Favorecido', 'Município', 'Empenhado', 'Pago', '%'] as const).map((h, i) => (
                    <th
                      key={h}
                      className={`py-2.5 px-3 text-[9px] uppercase tracking-widest font-bold text-slate-600 dark:text-slate-500 whitespace-nowrap ${i >= 5 ? 'text-right' : 'text-left'}`}
                      style={{ borderBottom: '1px solid var(--tint-06)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {destinosFiltrados.map((d, i) => {
                  const tipo = tipoCurtoInfo(d.tipoEmenda);
                  const pct  = d.valorEmpenhado > 0 ? (d.valorPago / d.valorEmpenhado) * 100 : 0;
                  const par  = i % 2 === 0;
                  return (
                    <tr
                      key={`${d.codigoEmenda}-${d.cnpjFavorecido ?? d.nomeFavorecido ?? i}`}
                      onClick={() => setEmendaSelecionada({
                        codigo: d.codigoEmenda,
                        titulo: d.numeroEmenda ? `Emenda nº ${d.numeroEmenda}` : `Emenda ${d.codigoEmenda}`,
                        filtroFavorecido: { cnpj: d.cnpjFavorecido, nome: d.nomeFavorecido, municipio: d.municipio, uf: d.uf },
                      })}
                      className="group cursor-pointer transition-colors hover:bg-[var(--brand-cobalt-soft)]"
                      style={{ background: par ? 'transparent' : 'var(--tint-04)' }}
                      title="Clique para ver todos os documentos desta emenda"
                    >
                      <td className="py-2.5 px-3 font-mono text-[11px] whitespace-nowrap transition-colors text-slate-600 dark:text-slate-500 group-hover:text-[color:var(--brand-cobalt-text)]" style={{ borderBottom: '1px solid var(--tint-04)' }}>
                        {d.numeroEmenda ?? '—'}
                      </td>
                      <td className="py-2.5 px-3" style={{ borderBottom: '1px solid var(--tint-04)' }}>
                        <span
                          title={tipo.hint}
                          className="inline-block px-2 py-0.5 rounded-full text-[9px] font-semibold cursor-help whitespace-nowrap"
                          style={{ background: `${tipo.color}18`, color: tipo.color, border: `1px solid ${tipo.color}33` }}
                        >
                          {tipo.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 truncate max-w-[110px] transition-colors text-slate-700 dark:text-slate-300 group-hover:text-[color:var(--brand-cobalt-text)]" title={d.funcao ?? ''} style={{ borderBottom: '1px solid var(--tint-04)' }}>
                        {d.funcao ?? '—'}
                      </td>
                      <td className="py-2.5 px-3 truncate max-w-[220px]" title={d.nomeFavorecido ?? ''} style={{ borderBottom: '1px solid var(--tint-04)' }}>
                        <span className="font-medium transition-colors text-slate-800 dark:text-slate-200 group-hover:text-[color:var(--brand-cobalt-text)]">
                          {d.nomeFavorecido ?? <span className="text-slate-600 italic font-normal">sem favorecido</span>}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 truncate max-w-[150px]" style={{ borderBottom: '1px solid var(--tint-04)' }}>
                        {d.municipio ? (
                          <span className="transition-colors text-slate-600 dark:text-slate-400 group-hover:text-[color:var(--brand-cobalt-text)]">
                            {d.municipio}
                            {d.uf && <span className="text-slate-500 ml-1 text-[10px]">/ {d.uf}</span>}
                          </span>
                        ) : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold whitespace-nowrap transition-colors text-[color:var(--text-primary)] group-hover:text-[color:var(--brand-cobalt-text)]" style={{ borderBottom: '1px solid var(--tint-04)' }}>
                        {formatBRLCompact(d.valorEmpenhado)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-[color:var(--success)] whitespace-nowrap" style={{ borderBottom: '1px solid var(--tint-04)' }}>
                        {formatBRLCompact(d.valorPago)}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap" style={{ borderBottom: '1px solid var(--tint-04)' }}>
                        <span
                          className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold"
                          style={{
                            background: pct >= 80 ? 'rgba(16,185,129,0.12)' : pct >= 40 ? 'rgba(245,158,11,0.12)' : 'rgba(100,116,139,0.12)',
                            color:      pct >= 80 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#64748b',
                          }}
                        >
                          {pct.toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Fallback por emenda */}
        {!usandoFlat && emendasFiltradas.length > 0 && (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-[12px] border-separate border-spacing-0">
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                  {(['Nº', 'Tipo', 'Área', 'Destino', 'Empenhado', 'Pago', '%'] as const).map((h, i) => (
                    <th
                      key={h}
                      className={`py-2.5 px-3 text-[9px] uppercase tracking-widest font-bold text-slate-600 dark:text-slate-500 whitespace-nowrap ${i >= 4 ? 'text-right' : 'text-left'}`}
                      style={{ borderBottom: '1px solid var(--tint-06)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {emendasFiltradas.map((e, i) => {
                  const tipo = tipoCurtoInfo(e.tipo);
                  const pct  = e.valorEmpenhado > 0 ? (e.valorPago / e.valorEmpenhado) * 100 : 0;
                  const par  = i % 2 === 0;
                  return (
                    <tr
                      key={e.idPortal}
                      onClick={() => setEmendaSelecionada({ codigo: e.idPortal, titulo: e.numero ? `Emenda nº ${e.numero}` : `Emenda ${e.idPortal}` })}
                      className="group cursor-pointer transition-colors"
                      style={{ background: par ? 'transparent' : 'rgba(255,255,255,0.015)' }}
                      title="Clique para ver favorecidos e breakdown por fase"
                    >
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-500 font-mono text-[11px] whitespace-nowrap group-hover:text-slate-700 dark:text-slate-300 transition-colors" style={{ borderBottom: '1px solid var(--tint-04)' }}>{e.numero ?? '—'}</td>
                      <td className="py-2.5 px-3" style={{ borderBottom: '1px solid var(--tint-04)' }}>
                        <span title={tipo.hint} className="inline-block px-2 py-0.5 rounded-full text-[9px] font-semibold cursor-help whitespace-nowrap" style={{ background: `${tipo.color}18`, color: tipo.color, border: `1px solid ${tipo.color}33` }}>{tipo.label}</span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 truncate max-w-[140px] transition-colors" title={e.funcao ?? ''} style={{ borderBottom: '1px solid var(--tint-04)' }}>{e.funcao ?? '—'}</td>
                      <td className="py-2.5 px-3 text-slate-800 dark:text-slate-200 truncate max-w-[200px] font-medium transition-colors" title={e.municipioNome ?? e.objeto ?? ''} style={{ borderBottom: '1px solid var(--tint-04)' }}>
                        {e.municipioNome ?? <span className="text-slate-600 italic font-normal">{e.objeto ?? 'sem destino'}</span>}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-[color:var(--text-primary)] whitespace-nowrap group-hover:text-[color:var(--brand-cobalt-text)] transition-colors" style={{ borderBottom: '1px solid var(--tint-04)' }}>{formatBRLCompact(e.valorEmpenhado)}</td>
                      <td className="py-2.5 px-3 text-right text-[color:var(--success)] whitespace-nowrap" style={{ borderBottom: '1px solid var(--tint-04)' }}>{formatBRLCompact(e.valorPago)}</td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap" style={{ borderBottom: '1px solid var(--tint-04)' }}>
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: pct >= 80 ? 'rgba(16,185,129,0.12)' : pct >= 40 ? 'rgba(245,158,11,0.12)' : 'rgba(100,116,139,0.12)', color: pct >= 80 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#64748b' }}>{pct.toFixed(0)}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <EmendaDocumentosModal
        codigoEmenda={emendaSelecionada?.codigo ?? null}
        tituloFallback={emendaSelecionada?.titulo}
        filtroUf={uf}
        filtroFavorecido={emendaSelecionada?.filtroFavorecido}
        onClose={() => setEmendaSelecionada(null)}
      />
    </div>
  );
}

// Extrai label curto do tipo de emenda (usado nos filtros e na tabela)
function tipoCurtoLabel(tipo: string | null): string {
  const t = (tipo ?? '').toLowerCase();
  if (t.includes('individual') && t.includes('especial'))   return 'Individual / Especial';
  if (t.includes('individual') && t.includes('finalidade')) return 'Individual / Finalidade';
  if (t.includes('individual'))  return 'Individual';
  if (t.includes('bancada'))     return 'Bancada';
  if (t.includes('comiss'))      return 'Comissão';
  if (t.includes('relator'))     return 'Relator';
  return tipo ?? '—';
}

function tipoCurtoInfo(tipo: string | null): { label: string; color: string; hint: string } {
  const t = (tipo ?? '').toLowerCase();
  if (t.includes('individual') && t.includes('especial'))   return { label: 'Individual / Especial',   color: '#a855f7', hint: 'Transferência Especial ("Emenda Pix") — parlamentar destina sem definir objeto.' };
  if (t.includes('individual') && t.includes('finalidade')) return { label: 'Individual / Finalidade', color: '#3b82f6', hint: 'Transferência com Finalidade Definida — destinação para objeto específico.' };
  if (t.includes('individual'))  return { label: 'Individual',  color: '#3b82f6', hint: 'Emenda Individual — cota anual de cada parlamentar.' };
  if (t.includes('bancada'))     return { label: 'Bancada',     color: '#10b981', hint: 'Emenda de Bancada Estadual — proposta coletiva.' };
  if (t.includes('comiss'))      return { label: 'Comissão',    color: '#f59e0b', hint: 'Emenda de Comissão — proposta por comissão temática.' };
  if (t.includes('relator'))     return { label: 'Relator',     color: '#ec4899', hint: 'Emenda do Relator (RP9) — perdeu eficácia após STF 2022.' };
  return { label: tipo ?? '—', color: '#94a3b8', hint: tipo ?? '' };
}

function MunicipiosBeneficiadosCard({
  ano, porMunicipio, onClick,
}: {
  ano: number;
  porMunicipio: ParlamentarPorMunicipio[];
  onClick?: (m: ParlamentarPorMunicipio) => void;
}) {
  const [expandido, setExpandido] = useState(false);
  const MAX_INICIAL = 8;
  const visiveis = expandido ? porMunicipio : porMunicipio.slice(0, MAX_INICIAL);
  const total = porMunicipio.reduce((s, m) => s + m.total, 0);

  return (
    <div
      className="mt-4 rounded-xl p-4"
      style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--tint-04)' }}
    >
      <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <p className="text-[10px] uppercase tracking-widest font-bold text-slate-600 dark:text-slate-400">
          Municípios beneficiados em {ano}
        </p>
        {porMunicipio.length > 0 && (
          <p className="text-[10px] text-slate-600 dark:text-slate-500">
            {porMunicipio.length} {porMunicipio.length === 1 ? 'município' : 'municípios'} ·{' '}
            <span className="text-[color:var(--brand-cobalt-text)] font-semibold">{formatBRLCompact(total)}</span>
          </p>
        )}
      </div>

      {porMunicipio.length === 0 ? (
        <p className="text-xs text-slate-600 dark:text-slate-500 text-center py-6">
          Nenhuma emenda com município identificado em {ano}.
          <br />
          <span className="text-slate-600 text-[10px]">
            (emendas com destino &ldquo;Nacional&rdquo; ou &ldquo;UF&rdquo; não aparecem aqui)
          </span>
        </p>
      ) : (
        <>
          <div className="space-y-2">
            {visiveis.map((m, i) => (
              <button
                key={m.codigoIbge}
                onClick={onClick ? () => onClick(m) : undefined}
                disabled={!onClick}
                className="w-full text-left px-3 py-2.5 rounded-xl transition-colors group disabled:cursor-default"
                style={{
                  background: 'var(--bg-card-subtle)',
                  border: '1px solid var(--tint-04)',
                }}
              >
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-500 w-5 flex-shrink-0">{i + 1}.</span>
                    <span className="text-[color:var(--text-primary)] text-sm font-semibold truncate group-hover:text-[color:var(--brand-cobalt-text)] transition-colors">
                      {m.nome}
                    </span>
                    {m.uf && (
                      <span className="text-[10px] text-slate-600 dark:text-slate-500 flex-shrink-0">/ {m.uf}</span>
                    )}
                  </div>
                  <span className="text-[color:var(--brand-cobalt-text)] font-bold text-sm whitespace-nowrap">
                    {formatBRLCompact(m.total)}
                  </span>
                </div>
                {/* Chips de áreas */}
                <div className="flex flex-wrap gap-1.5 pl-7">
                  {m.areas.map(({ area, valor }) => (
                    <span
                      key={area}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium"
                      style={{
                        background: `${AREA_COLORS[area]}22`,
                        color: AREA_COLORS[area],
                        border: `1px solid ${AREA_COLORS[area]}44`,
                      }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: AREA_COLORS[area] }} />
                      {AREA_LABELS[area]}
                      <span className="text-[color:var(--text-primary)]/70 font-semibold">{formatBRLCompact(valor)}</span>
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>

          {porMunicipio.length > MAX_INICIAL && (
            <button
              onClick={() => setExpandido((v) => !v)}
              className="mt-3 w-full text-center text-[11px] text-[color:var(--brand-cobalt-text)] hover:text-[color:var(--brand-cobalt-text)] font-semibold transition-colors py-1.5 rounded-lg hover:bg-amber-300/5"
            >
              {expandido
                ? `Mostrar apenas os ${MAX_INICIAL} maiores`
                : `Ver todos os ${porMunicipio.length} municípios`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// Lista de municípios que receberam Transferência Especial (Pix) do parlamentar.
// Aparece quando as emendas originais foram cadastradas a nível UF e o destino
// real só foi resolvido depois via repasse Pix (modalidade EC 105/2019).
function MunicipiosPixCard({
  ano, pixPorMunicipio, pixTotal, onClick,
}: {
  ano: number;
  pixPorMunicipio: { codigoIbge: string; nome: string; uf: string | null; total: number; qtd: number }[];
  pixTotal: number;
  onClick?: (m: { codigoIbge: string; nome: string; uf: string | null; total: number; qtd: number }) => void;
}) {
  const [expandido, setExpandido] = useState(false);
  const MAX_INICIAL = 8;
  const visiveis = expandido ? pixPorMunicipio : pixPorMunicipio.slice(0, MAX_INICIAL);
  return (
    <div
      className="mt-4 rounded-xl p-4"
      style={{
        background: 'linear-gradient(135deg, rgba(168,85,247,0.06), var(--bg-card-subtle))',
        border: '1px solid rgba(168,85,247,0.25)',
      }}
    >
      <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest"
            style={{ background: 'rgba(168,85,247,0.18)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.35)' }}
          >
            Pix
          </span>
          <p className="text-[10px] uppercase tracking-widest font-bold text-slate-600 dark:text-slate-400">
            Municípios que receberam Pix em {ano}
          </p>
        </div>
        <p className="text-[10px] text-slate-600 dark:text-slate-500">
          {pixPorMunicipio.length} {pixPorMunicipio.length === 1 ? 'município' : 'municípios'} ·{' '}
          <span className="text-violet-300 font-semibold">{formatBRLCompact(pixTotal)}</span>
        </p>
      </div>

      <p className="text-[10px] text-slate-600 dark:text-slate-500 italic mb-3 leading-snug">
        Transferências Especiais (EC 105/2019) — destinos reais dos repasses Pix do parlamentar
        quando a emenda original foi cadastrada só a nível UF.
      </p>

      <div className="space-y-2">
        {visiveis.map((m, i) => (
          <button
            key={m.codigoIbge}
            onClick={onClick ? () => onClick(m) : undefined}
            disabled={!onClick}
            className="w-full text-left px-3 py-2.5 rounded-xl transition-colors group disabled:cursor-default"
            style={{
              background: 'var(--bg-card-subtle)',
              border: '1px solid var(--tint-04)',
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-[10px] font-bold text-slate-600 dark:text-slate-500 w-5 flex-shrink-0">{i + 1}.</span>
                <span className="text-[color:var(--text-primary)] text-sm font-semibold truncate group-hover:text-violet-300 transition-colors">
                  {m.nome}
                </span>
                {m.uf && (
                  <span className="text-[10px] text-slate-600 dark:text-slate-500 flex-shrink-0">/ {m.uf}</span>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-violet-300 font-bold text-sm whitespace-nowrap">{formatBRLCompact(m.total)}</p>
                <p className="text-[10px] text-slate-600 dark:text-slate-500">
                  {m.qtd} {m.qtd === 1 ? 'transferência' : 'transferências'}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {pixPorMunicipio.length > MAX_INICIAL && (
        <button
          onClick={() => setExpandido((v) => !v)}
          className="mt-3 w-full text-center text-[11px] text-violet-300 hover:text-violet-200 font-semibold transition-colors py-1.5 rounded-lg hover:bg-violet-300/5"
        >
          {expandido
            ? `Mostrar apenas os ${MAX_INICIAL} maiores`
            : `Ver todos os ${pixPorMunicipio.length} municípios`}
        </button>
      )}
    </div>
  );
}

function ComparativoAreasCard({
  ano, escopo, areasAtual, areasAnterior,
}: {
  ano: number;
  escopo: string;
  areasAtual: { area: EmendaArea; total: number }[];
  areasAnterior: Map<string, number>;
}) {
  // Cada card mostra UMA área literal (mesmo critério do donut acima).
  // O card "OUTRAS ÁREAS" soma tudo que não é Saúde/Educação/Segurança —
  // legendado como tal pra evitar confusão com a área literal "OUTROS".
  const principais: EmendaArea[] = ['SAUDE', 'EDUCACAO', 'SEGURANCA', 'OUTROS'];

  const principaisSomadas: { area: EmendaArea; label: string; atual: number; anterior: number }[] =
    principais.map((area) => {
      if (area === 'OUTROS') {
        // "Outras áreas" — agrega tudo que não é uma das 3 principais
        const principaisSet = new Set<EmendaArea>(['SAUDE', 'EDUCACAO', 'SEGURANCA']);
        const atual = areasAtual.reduce((s, a) => s + (principaisSet.has(a.area) ? 0 : a.total), 0);
        const anterior = Array.from(areasAnterior.entries()).reduce(
          (s, [k, v]) => s + (principaisSet.has(k as EmendaArea) ? 0 : v),
          0,
        );
        return { area, label: 'Outras áreas', atual, anterior };
      }
      const atual = areasAtual.find((a) => a.area === area)?.total ?? 0;
      const anterior = areasAnterior.get(area) ?? 0;
      return { area, label: AREA_LABELS[area], atual, anterior };
    });

  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--tint-06)' }}
    >
      <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
        <p className="text-[10px] uppercase tracking-widest font-bold text-slate-600 dark:text-slate-400">
          Comparativo por Área
        </p>
        <p className="text-[10px] text-slate-600 dark:text-slate-500">
          {ano} vs. {ano - 1}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {principaisSomadas.map(({ area, label, atual, anterior }) => {
          const delta = anterior > 0 ? ((atual - anterior) / anterior) * 100 : atual > 0 ? 100 : 0;
          const isUp = delta >= 0;
          const color = AREA_COLORS[area];
          return (
            <div
              key={area}
              className="rounded-xl p-3.5"
              style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--tint-04)' }}
              title={area === 'OUTROS' ? 'Soma de Assistência Social, Transporte, Cultura, Esporte e outras áreas que não são Saúde, Educação ou Segurança' : undefined}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}>
                  <Landmark className="w-4 h-4" />
                </div>
                <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color }}>
                  {label}
                </span>
              </div>
              <p className="text-[color:var(--text-primary)] font-bold text-lg">{formatBRLCompact(atual)}</p>
              <div className="flex items-center gap-1.5 text-[11px] mt-1">
                <span className={isUp ? 'text-[color:var(--success)]' : 'text-rose-400'}>
                  {isUp ? <TrendingUp className="w-3 h-3 inline -mt-0.5" /> : <TrendingDown className="w-3 h-3 inline -mt-0.5" />}
                  {' '}
                  {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
                </span>
                <span className="text-slate-600 dark:text-slate-500">vs {ano - 1}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DestaqueDoAnoCard({
  municipio, ano, stateName, topParlamentar,
}: {
  municipio: { codigoIbge: string; nome: string; total: number };
  ano: number;
  stateName: string;
  topParlamentar?: { nome: string; cargo: string; partido: string | null; total: number };
}) {
  return (
    <div
      className="rounded-2xl px-5 py-2.5 flex items-center gap-5 flex-wrap"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-default)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      {/* Label */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <Trophy className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--brand-cobalt-text)' }} />
        <p className="text-[9px] uppercase tracking-widest font-bold text-[color:var(--brand-cobalt-text)]/70 whitespace-nowrap">
          Destaque {ano} · {stateName}
        </p>
      </div>

      {/* Divider */}
      <div className="w-px h-6 flex-shrink-0" style={{ background: 'var(--tint-08)' }} />

      <div className="flex items-center gap-3 flex-wrap flex-1">
        {/* Top município */}
        <div
          className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, rgba(6,182,212,0.08), rgba(6,182,212,0.03))',
            border: '1px solid rgba(6,182,212,0.2)',
          }}
        >
          <div className="flex flex-col leading-tight">
            <span className="text-[8px] uppercase tracking-widest font-semibold text-[color:var(--brand-cobalt)]/60">Município</span>
            <span className="text-[color:var(--text-primary)] font-bold text-[13px] truncate max-w-[150px] leading-tight">{municipio.nome}</span>
          </div>
          <div
            className="px-2 py-0.5 rounded-lg"
            style={{ background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.25)' }}
          >
            <span className="text-[color:var(--brand-cobalt-text)] font-bold text-[11px] whitespace-nowrap">{formatBRLCompact(municipio.total)}</span>
          </div>
        </div>

        {/* Top parlamentar */}
        {topParlamentar && (
          <div
            className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, rgba(37,99,235,0.08), rgba(37,99,235,0.03))',
              border: '1px solid rgba(37,99,235,0.2)',
            }}
          >
            <div className="flex flex-col leading-tight">
              <span className="text-[8px] uppercase tracking-widest font-semibold text-[color:var(--brand-cobalt-text)]/60">Parlamentar</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[color:var(--text-primary)] font-bold text-[13px] truncate max-w-[180px] leading-tight">{topParlamentar.nome}</span>
                <span className="text-[9px] text-slate-600 dark:text-slate-500 whitespace-nowrap hidden sm:block">
                  {CARGO_LABELS[topParlamentar.cargo as ParlamentarCargo] ?? topParlamentar.cargo}
                  {topParlamentar.partido ? ` · ${topParlamentar.partido}` : ''}
                </span>
              </div>
            </div>
            <div
              className="px-2 py-0.5 rounded-lg"
              style={{ background: 'rgba(37,99,235,0.15)', border: '1px solid rgba(37,99,235,0.25)' }}
            >
              <span className="text-[color:var(--brand-cobalt-text)] font-bold text-[11px] whitespace-nowrap">{formatBRLCompact(topParlamentar.total)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
