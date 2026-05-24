'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
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
  Globe,
  X,
  Calendar,
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
    <div className="h-full flex items-center justify-center rounded-lg" style={{ background: 'rgba(7,29,54,0.5)' }}>
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

interface PortalParlamentar {
  cpf: string | null;
  idPortal: string;
  nome: string;
  nomeUrna: string | null;
  partido: string | null;
  uf: string | null;
  cargo: ParlamentarCargo;
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
  areas: { area: EmendaArea; total: number }[];
  parlamentares: { cpf: string | null; idPortal: string; nome: string; cargo: string; partido: string | null; total: number; qtd: number }[];
  mock: boolean;
  /** "banco" = dados completos do Supabase; "portal" = amostra parcial direto da API */
  fonte?: 'banco' | 'portal';
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------
const ANOS_DISPONIVEIS = [2025, 2024, 2023, 2022, 2021];
const ANO_PADRAO = 2024;

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
export default function EmendasPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
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
  const [loadingParlamentar, setLoadingParlamentar] = useState(false);

  // Resumo do ano anterior (para o comparativo)
  const [resumoAnterior, setResumoAnterior] = useState<ResumoEstado | null>(null);

  // ----- Guards -----
  useEffect(() => {
    if (status === 'authenticated' && !canAccess) router.replace('/dashboard');
  }, [status, canAccess, router]);

  // ----- Resumo do estado (top municípios, totais por área etc) -----
  const fetchResumo = useCallback(async (uf: string, year: number, signal?: AbortSignal): Promise<ResumoEstado | null> => {
    const res = await fetch(`/api/emendas-portal/resumo?uf=${uf}&ano=${year}`, { signal });
    if (!res.ok) return null;
    return res.json();
  }, []);

  useEffect(() => {
    if (view !== 'estado' || !selectedUf) return;
    const ctrl = new AbortController();
    setLoadingResumo(true);
    Promise.all([fetchResumo(selectedUf, ano, ctrl.signal), fetchResumo(selectedUf, ano - 1, ctrl.signal)])
      .then(([atual, anterior]) => {
        setResumo(atual);
        setResumoAnterior(anterior);
      })
      .catch((e: any) => {
        if (e?.name !== 'AbortError') console.error('Erro ao buscar resumo:', e);
      })
      .finally(() => setLoadingResumo(false));
    return () => ctrl.abort();
  }, [view, selectedUf, ano, fetchResumo]);

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
      fetch(`/api/emendas-portal/municipio/${selectedMunicipio.codigo}/emendas?uf=${selectedUf}&ano=${ano}`, { signal: ctrl.signal }).then((r) => r.json()),
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
  }, [selectedMunicipio, ano, selectedUf]);

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
      s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const qNorm = normalizar(q);
    const matches = resumo.parlamentares
      .filter((p) => normalizar(p.nome).includes(qNorm))
      .slice(0, 20)
      .map<PortalParlamentar>((p) => ({
        cpf:      p.cpf,
        idPortal: p.idPortal,
        nome:     p.nome,
        nomeUrna: null,
        partido:  p.partido,
        uf:       selectedUf,
        cargo:    p.cargo as ParlamentarCargo,
      }));
    setParlamentarResults(matches);
  }, [parlamentarQuery, resumo, selectedUf]);

  // ----- Emendas do parlamentar selecionado -----
  useEffect(() => {
    if (!selectedParlamentar) {
      setParlamentarEmendas([]);
      return;
    }
    const ctrl = new AbortController();
    setLoadingParlamentar(true);
    const id = selectedParlamentar.cpf ?? selectedParlamentar.idPortal;
    // Filtra por UF do estado em foco — os números refletem só a fatia
    // do parlamentar naquele estado, não o total nacional dele.
    const ufParam = selectedUf ? `&uf=${selectedUf}` : '';
    fetch(`/api/emendas-portal/parlamentar/${id}?ano=${ano}${ufParam}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((data) => setParlamentarEmendas(Array.isArray(data?.emendas) ? data.emendas : []))
      .catch((e: any) => {
        if (e?.name !== 'AbortError') console.error('Erro ao buscar emendas do parlamentar:', e);
      })
      .finally(() => setLoadingParlamentar(false));
    return () => ctrl.abort();
  }, [selectedParlamentar, ano, selectedUf]);

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

  // Quando há parlamentar selecionado, o mapa e o Top 5 mostram só os
  // municípios beneficiados POR ELE — em vez do total do estado.
  // Esse Record<codigoIbge, valor> é passado direto ao StateMap.
  const parlamentarValorPorMunicipio = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    parlamentarEmendas.forEach((e) => {
      if (!e.codigoIbge) return;
      map[e.codigoIbge] = (map[e.codigoIbge] ?? 0) + (e.valorEmpenhado ?? 0);
    });
    return map;
  }, [parlamentarEmendas]);

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
      if (!e.codigoIbge) return; // ignora emendas sem município identificado
      const cur = map.get(e.codigoIbge) ?? {
        codigoIbge: e.codigoIbge,
        nome:       e.municipioNome ?? e.codigoIbge,
        uf:         e.uf,
        total:      0,
        areas:      new Map<EmendaArea, number>(),
      };
      cur.total += e.valorEmpenhado ?? 0;
      cur.areas.set(e.area, (cur.areas.get(e.area) ?? 0) + (e.valorEmpenhado ?? 0));
      map.set(e.codigoIbge, cur);
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

  const maxParlamentarPorAno = useMemo(
    () => parlamentarPorAno.reduce((m, x) => Math.max(m, x.total), 1),
    [parlamentarPorAno],
  );

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
        <Loader2 className="w-10 h-10 animate-spin" style={{ color: '#c9a227' }} />
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
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-widest text-slate-400">Ano selecionado</span>
            <Select
              value={String(ano)}
              onChange={(e) => setAno(parseInt(e.target.value, 10))}
              options={ANOS_DISPONIVEIS.map((a) => ({ value: String(a), label: String(a) }))}
            />
          </div>
        }
      />

      {/* Mock banner */}
      {resumo?.mock && (
        <div
          className="rounded-xl px-4 py-2.5 flex items-center gap-2 text-xs"
          style={{ background: 'rgba(201,162,39,0.08)', border: '1px solid rgba(201,162,39,0.25)', color: '#e8c660' }}
        >
          <span className="font-semibold">Modo demonstração:</span>
          <span className="text-slate-300">
            os dados exibidos são sintéticos. Configure a variável <code className="px-1.5 py-0.5 rounded bg-black/30">PORTAL_TRANSPARENCIA_API_KEY</code> para usar dados reais do Portal da Transparência.
          </span>
        </div>
      )}

      {/* Amostra parcial banner — quando ainda está usando Portal ao vivo */}
      {resumo && !resumo.mock && resumo.fonte === 'portal' && (
        <div
          className="rounded-xl px-4 py-2.5 flex items-start gap-2 text-xs"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }}
        >
          <span className="font-semibold mt-0.5">⓵ Dados parciais:</span>
          <span className="text-slate-300">
            o ano {ano} ainda não foi sincronizado pro banco local — os números aqui são uma amostra das maiores emendas do Portal da Transparência (limitação técnica da API pública). Para dados completos, execute <code className="px-1.5 py-0.5 rounded bg-black/30">npx tsx scripts/sync-emendas-portal.ts --ano {ano}</code>.
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
          />
          <div className="flex-1 min-h-0">
            <EmendasPorAreaCard
              view={view}
              municipio={selectedMunicipio}
              municipioEmendas={municipioEmendas}
              resumo={resumo}
            />
          </div>
        </div>

        {/* LINHA 1 — Coluna central: Mapa */}
        <div className="col-span-12 md:col-span-6">
          <div
            className="relative rounded-2xl overflow-hidden h-[560px]"
            style={{ background: 'rgba(7,29,54,0.5)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            {/* Header do mapa */}
            <div className="absolute top-3 left-3 right-3 z-[400] flex items-center justify-between pointer-events-none">
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl pointer-events-auto"
                style={{ background: 'rgba(7,29,54,0.85)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(6px)' }}
              >
                <button
                  onClick={view === 'estado' ? handleBackToBrasil : undefined}
                  disabled={view === 'brasil'}
                  className="text-slate-400 hover:text-white text-xs transition-all flex items-center gap-1 disabled:opacity-40 disabled:cursor-default"
                  title="Voltar ao Brasil"
                >
                  <Globe className="w-3.5 h-3.5" />
                  Brasil
                </button>
                {view === 'estado' && (
                  <>
                    <ChevronRight className="w-3 h-3 text-slate-600" />
                    <span className="text-white text-xs font-medium">{selectedStateName}</span>
                  </>
                )}
                {selectedMunicipio && (
                  <>
                    <ChevronRight className="w-3 h-3 text-slate-600" />
                    <span className="text-amber-300 text-xs font-medium">{selectedMunicipio.nome}</span>
                  </>
                )}
              </div>
              <div
                className="px-2.5 py-1 rounded-lg text-[10px] uppercase tracking-widest font-bold pointer-events-auto truncate max-w-[260px]"
                style={{
                  background: selectedParlamentar ? 'rgba(74,158,222,0.15)' : 'rgba(201,162,39,0.15)',
                  border:     `1px solid ${selectedParlamentar ? 'rgba(74,158,222,0.4)' : 'rgba(201,162,39,0.3)'}`,
                  color:      selectedParlamentar ? '#7fb8e0' : '#e8c660',
                }}
                title={selectedParlamentar ? `Filtrado por ${selectedParlamentar.nome}` : undefined}
              >
                {selectedParlamentar
                  ? `Filtrado: ${selectedParlamentar.nome}`
                  : 'Emendas por Município'}
              </div>
            </div>

            {view === 'brasil' && (
              <BrazilMap onStateClick={handleStateClick} darkMode />
            )}
            {view === 'estado' && selectedUf && (
              <StateMap
                uf={selectedUf}
                stateName={selectedStateName}
                /* Quando há parlamentar selecionado, mostra só os municípios
                   que ele beneficiou. Senão, mostra todos do estado. */
                votesData={
                  selectedParlamentar
                    ? parlamentarValorPorMunicipio
                    : (resumo?.valorPorMunicipio ?? {})
                }
                onMunicipioClick={handleMunicipioClick}
                disableSubdivisao
                highlightColor="gold"
                highlightMunicipioNome={selectedMunicipio?.nome ?? null}
                valueLabel={selectedParlamentar ? `de ${selectedParlamentar.nome.split(' ')[0]}` : 'em emendas'}
                darkMode
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
                style={{ background: 'rgba(7,29,54,0.92)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(6px)' }}
              >
                <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1.5">Valor de Emendas (R$)</p>
                <LegendaCores />
              </div>
            )}
          </div>
        </div>

        {/* LINHA 1 — Coluna direita: Top 5 + Parlamentar */}
        <div className="col-span-12 md:col-span-3 space-y-4">
          {view === 'brasil' ? (
            <SelecionarEstadoCard />
          ) : (
            <>
              <Top5MunicipiosCard
                resumo={resumo}
                loading={loadingResumo}
                onClick={(m) => handleMunicipioClick(m.codigoIbge, m.nome)}
                /* Quando há parlamentar selecionado, mostra os municípios
                   beneficiados por ele em vez do agregado do estado. */
                escopoParlamentar={
                  selectedParlamentar
                    ? {
                        nome: selectedParlamentar.nome,
                        municipios: parlamentarPorMunicipio.slice(0, 5).map((m) => ({
                          codigoIbge: m.codigoIbge,
                          nome: m.nome,
                          total: m.total,
                        })),
                      }
                    : null
                }
              />
              <ParlamentarSearchCard
                query={parlamentarQuery}
                setQuery={setParlamentarQuery}
                results={parlamentarResults}
                searching={searchingParlamentar}
                onPick={(p) => {
                  setSelectedParlamentar(p);
                  setParlamentarQuery('');
                  setParlamentarResults([]);
                }}
                topResumo={resumo?.parlamentares ?? []}
                onPickFromResumo={(p) =>
                  setSelectedParlamentar({
                    cpf: p.cpf,
                    idPortal: p.idPortal,
                    nome: p.nome,
                    nomeUrna: null,
                    partido: p.partido,
                    uf: selectedUf,
                    cargo: p.cargo as ParlamentarCargo,
                  })
                }
                selected={selectedParlamentar}
                onClear={() => setSelectedParlamentar(null)}
              />
            </>
          )}
        </div>

        {/* LINHA 2 — Comparativo por Área ocupando 9 colunas (centro + direita) */}
        {view === 'estado' && resumo && (
          <div className="col-span-12 md:col-span-9">
            <ComparativoAreasCard
              ano={ano}
              escopo={selectedMunicipio ? `município de ${selectedMunicipio.nome}` : `estado de ${selectedStateName}`}
              areasAtual={selectedMunicipio && municipioAreasAtual ? municipioAreasAtual : resumo.areas}
              areasAnterior={selectedMunicipio ? municipioAreasAnterior : comparativoAreasAnterior}
            />
          </div>
        )}
      </div>

      {/* Dashboard do parlamentar (aparece quando há parlamentar selecionado) */}
      {selectedParlamentar && (
        <ParlamentarDashboard
          parlamentar={selectedParlamentar}
          ano={ano}
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
          emendas={parlamentarEmendas}
          onMunicipioClick={(m) => setSelectedMunicipio({ codigo: m.codigoIbge, nome: m.nome })}
        />
      )}

      {/* Destaque do ano */}
      {view === 'estado' && resumo && resumo.topMunicipios?.[0] && (
        <DestaqueDoAnoCard
          municipio={resumo.topMunicipios[0]}
          ano={ano}
          stateName={selectedStateName}
          topParlamentar={resumo.parlamentares?.[0]}
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
}: {
  view: 'brasil' | 'estado';
  ano: number;
  stateName: string;
  municipio: { codigo: string; nome: string } | null;
  municipioStats: MunicipioStats | null;
  resumo: ResumoEstado | null;
}) {
  // Quando há município selecionado: mostra só o que foi destinado a ele.
  // Quando NÃO há município (visão do estado): mostra o total municipalizado
  // (que bate com a soma dos top municípios). O total estadual entra como
  // sublinha pra deixar claro que ainda há "verba sem destino municipal".
  const total = municipio
    ? (resumo?.valorPorMunicipio?.[municipio.codigo] ?? 0)
    : (resumo?.totalMunicipalizado ?? 0);
  const totalEstadual = !municipio ? (resumo?.totalEstadual ?? 0) : 0;
  const tetoMac = municipio ? municipioStats?.tetoMac ?? null : null;
  const tetoPap = municipio ? municipioStats?.tetoPap ?? null : null;
  const habitantes = municipio ? municipioStats?.habitantes ?? null : null;
  const eleitores  = municipio ? municipioStats?.eleitores  ?? null : null;

  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: 'rgba(7,29,54,0.55)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-3">Resumo Geral</p>
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
          label={municipio ? 'Total de Emendas' : 'Total Municipalizado'}
          value={formatBRL(total)}
          sub={
            !municipio && totalEstadual > 0
              ? `${formatBRLCompact(totalEstadual)} adicional sem município`
              : `em ${ano}`
          }
        />
        <ResumoStat
          icon={<Building2 className="w-4 h-4" />}
          iconBg="rgba(245,158,11,0.15)"
          iconColor="#f59e0b"
          label="Teto MAC"
          value={
            tetoMac != null
              ? formatBRL(tetoMac)
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
              ? formatBRL(tetoPap)
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
        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
        <p className="text-white font-bold text-base truncate">{value}</p>
        {sub && <p className="text-[10px] text-slate-500">{sub}</p>}
      </div>
    </div>
  );
}

function EmendasPorAreaCard({
  view,
  municipio,
  municipioEmendas,
  resumo,
}: {
  view: 'brasil' | 'estado';
  municipio: { codigo: string; nome: string } | null;
  municipioEmendas: PortalEmenda[];
  resumo: ResumoEstado | null;
}) {
  // Se tem município selecionado, usa as emendas dele. Senão, usa o resumo do estado.
  const areas = useMemo(() => {
    if (municipio) {
      const m = new Map<EmendaArea, number>();
      municipioEmendas.forEach((e) => m.set(e.area, (m.get(e.area) ?? 0) + e.valorEmpenhado));
      return Array.from(m.entries())
        .map(([area, total]) => ({ area, total }))
        .sort((a, b) => b.total - a.total);
    }
    return resumo?.areas ?? [];
  }, [municipio, municipioEmendas, resumo]);

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
      style={{ background: 'rgba(7,29,54,0.55)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-3">Emendas por Área</p>
      {view === 'brasil' || areas.length === 0 ? (
        <p className="text-xs text-slate-500 text-center py-6">
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
                    <span className="text-slate-300 truncate">{AREA_LABELS[a.area]}</span>
                  </div>
                  <span className="text-white font-semibold flex-shrink-0">{formatBRLCompact(a.total)} <span className="text-slate-500">({pct}%)</span></span>
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
      style={{ background: 'rgba(7,29,54,0.55)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-2">Como usar</p>
      <ol className="text-xs text-slate-300 space-y-2 list-decimal list-inside">
        <li>Clique em um estado no mapa</li>
        <li>Escolha um município (popup mostra habitantes, eleitores e tetos)</li>
        <li>Pesquise um parlamentar para ver os gráficos por área e por ano</li>
      </ol>
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
      className="rounded-2xl p-4"
      style={{ background: 'rgba(7,29,54,0.55)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">
        Top 5 Municípios
      </p>
      {isParlamentar && (
        <p className="text-[10px] text-amber-300/80 mb-2 truncate" title={escopoParlamentar.nome}>
          beneficiados por {escopoParlamentar.nome}
        </p>
      )}
      {!isParlamentar && <div className="mb-2" />}

      {loading && !isParlamentar && (
        <div className="py-6 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
        </div>
      )}
      {!loading && top.length === 0 && (
        <p className="text-xs text-slate-500 text-center py-4">
          {isParlamentar
            ? 'Nenhum município identificado (emendas em nível estadual)'
            : 'Sem dados disponíveis'}
        </p>
      )}
      {top.length > 0 && (
        <ol className="space-y-2">
          {top.map((m, i) => (
            <li key={m.codigoIbge}>
              <button
                onClick={() => onClick(m)}
                className="w-full flex items-center gap-2 group hover:bg-white/5 -mx-2 px-2 py-1 rounded-lg transition-colors text-left"
              >
                <span className="text-xs font-bold text-slate-500 w-4">{i + 1}.</span>
                <span className="text-xs text-white truncate flex-1 group-hover:text-amber-300 transition-colors">{m.nome}</span>
                <span className="text-xs font-semibold text-cyan-300">{formatBRL(m.total)}</span>
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
      style={{ background: 'rgba(7,29,54,0.55)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-2">Emendas por Parlamentar</p>

      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pesquisar parlamentar…"
          className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-500/50"
        />
        {searching && <Loader2 className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-slate-500" />}
      </div>

      {query.length >= 2 && results.length > 0 && (
        <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
          {results.map((p) => (
            <button
              key={p.idPortal}
              onClick={() => onPick(p)}
              className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
            >
              <p className="text-xs text-white font-medium truncate">{p.nome}</p>
              <p className="text-[10px] text-slate-500">
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
          style={{ background: 'rgba(201,162,39,0.1)', border: '1px solid rgba(201,162,39,0.25)' }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white font-semibold truncate">{selected.nome}</p>
            <p className="text-[10px] text-amber-300/80">
              {CARGO_LABELS[selected.cargo]}{selected.partido ? ` · ${selected.partido}` : ''}
            </p>
          </div>
          <button onClick={onClear} className="text-slate-500 hover:text-white p-1 rounded-lg">
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
              className="w-full flex items-center gap-2 group text-left hover:bg-white/5 -mx-1 px-1 py-1 rounded-lg transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-white truncate group-hover:text-amber-300">{p.nome}</p>
                <p className="text-[10px] text-slate-500">{CARGO_LABELS[p.cargo as ParlamentarCargo] ?? p.cargo}</p>
              </div>
              <span className="text-[11px] font-semibold text-cyan-300 flex-shrink-0">{formatBRLCompact(p.total)}</span>
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
          background: 'rgba(7,29,54,0.96)',
          border: '1px solid rgba(74,158,222,0.4)',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
        }}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-cyan-300">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              Município
            </span>
            <p className="text-white font-bold text-sm mt-0.5">{municipio.nome}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-0.5 rounded-lg">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {loading ? (
          <div className="py-2 flex items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
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
              value={stats?.tetoMac != null ? formatBRL(stats.tetoMac) : '—'}
              hint={stats?.tetoMac == null ? 'requer cadastro manual (DataSUS)' : undefined}
            />
            <PopupRow
              label="Teto PAP"
              value={stats?.tetoPap != null ? formatBRL(stats.tetoPap) : '—'}
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
      <span className="text-slate-400 flex-shrink-0">{label}</span>
      <div className="text-right min-w-0">
        <span className={value === '—' ? 'text-slate-500' : 'text-white font-semibold'}>{value}</span>
        {hint && <p className="text-[9px] text-slate-500 italic mt-0.5 leading-tight">{hint}</p>}
      </div>
    </div>
  );
}

function LegendaCores() {
  // Mesma escala usada pelo StateMap (interpola entre dois azuis)
  const items = [
    { label: 'Acima de R$ 2 milhões',         color: '#0c4f8a' },
    { label: 'R$ 1 milhão – 2 milhões',       color: '#1d6fb8' },
    { label: 'R$ 500 mil – 1 milhão',         color: '#3a8ed1' },
    { label: 'Até R$ 500 mil',                color: '#7fb8e0' },
    { label: 'Sem emendas',                   color: 'transparent', border: '1px solid rgba(255,255,255,0.3)' },
  ];
  return (
    <div className="space-y-1">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-sm flex-shrink-0"
            style={{ background: it.color, border: (it as any).border ?? 'none' }}
          />
          <span className="text-[10px] text-slate-300">{it.label}</span>
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
  parlamentar, ano, escopo, loading, totalAno, totalPago, porArea, porAno, maxPorAno, porMunicipio, porTipo, destinos, emendas, onMunicipioClick,
}: {
  parlamentar: PortalParlamentar;
  ano: number;
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
  emendas: PortalEmenda[];
  onMunicipioClick?: (m: ParlamentarPorMunicipio) => void;
}) {
  const pctPago = totalAno > 0 ? (totalPago / totalAno) * 100 : 0;
  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: 'rgba(7,29,54,0.55)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-widest font-bold text-amber-300">Dashboard do parlamentar</p>
          <h2 className="text-xl text-white font-bold mt-1">{parlamentar.nome}</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {CARGO_LABELS[parlamentar.cargo]}
            {parlamentar.partido ? ` · ${parlamentar.partido}` : ''}
            {parlamentar.uf ? ` · ${parlamentar.uf}` : ''}
          </p>
        </div>
        <div
          className="rounded-2xl px-5 py-3 text-right"
          style={{
            background: 'linear-gradient(135deg, rgba(201,162,39,0.15), rgba(201,162,39,0.05))',
            border: '1px solid rgba(201,162,39,0.35)',
            boxShadow: 'inset 0 0 18px rgba(201,162,39,0.08)',
          }}
        >
          <p className="text-[10px] uppercase tracking-widest text-amber-300 font-bold">
            Total enviado em {ano}{escopo ? ` · ${escopo}` : ''}
          </p>
          <p className="text-2xl font-bold text-white mt-0.5">
            {loading ? <Loader2 className="w-5 h-5 animate-spin inline" /> : formatBRL(totalAno)}
          </p>
          {!loading && totalAno > 0 && (
            <p className="text-[11px] text-emerald-300 mt-0.5">
              Pago: <span className="font-bold">{formatBRL(totalPago)}</span>
              <span className="text-emerald-400/60"> ({pctPago.toFixed(0)}%)</span>
            </p>
          )}
          {!loading && (destinos.municipal > 0 || destinos.estadual > 0) && (
            <div className="mt-2 text-[10px] text-slate-300 space-y-0.5 text-right">
              <p>
                <span className="text-cyan-300">●</span> A municípios: <span className="font-semibold text-white">{formatBRL(destinos.municipal)}</span>
                <span className="text-slate-500"> ({destinos.qtdMun})</span>
              </p>
              <p>
                <span className="text-violet-400">●</span> Nível UF (sem município): <span className="font-semibold text-white">{formatBRL(destinos.estadual)}</span>
                <span className="text-slate-500"> ({destinos.qtdEst})</span>
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
                    background: 'rgba(255,255,255,0.06)',
                    color: '#cbd5e1',
                    border: '1px solid rgba(255,255,255,0.08)',
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
          <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Donut: Emendas por Área */}
          <div className="rounded-xl p-4" style={{ background: 'rgba(7,29,54,0.5)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-2">Distribuição por área</p>
            {porArea.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-10">Sem emendas em {ano}</p>
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
          <div className="rounded-xl p-4" style={{ background: 'rgba(7,29,54,0.5)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-2">Valor por ano (histórico)</p>
            {porAno.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-10">Sem histórico disponível</p>
            ) : (
              <div className="space-y-2 mt-2">
                {porAno.map((p) => {
                  const pct = Math.max(2, (p.total / maxPorAno) * 100);
                  const isAnoSelecionado = p.ano === ano;
                  return (
                    <div key={p.ano} className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className={isAnoSelecionado ? 'text-amber-300 font-bold' : 'text-slate-300'}>{p.ano}</span>
                        <span className={isAnoSelecionado ? 'text-amber-300 font-bold' : 'text-white font-semibold'}>
                          {formatBRLCompact(p.total)}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            background: isAnoSelecionado
                              ? 'linear-gradient(90deg, #c9a227, #e8c660)'
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
          <div className="rounded-xl p-4" style={{ background: 'rgba(7,29,54,0.5)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-2">Comparativo de áreas em {ano}</p>
            {porArea.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-10">Sem dados</p>
            ) : (
              <div className="space-y-2 mt-2">
                {porArea.map((a) => {
                  const max = porArea[0].value;
                  const pct = Math.max(2, (a.value / max) * 100);
                  return (
                    <div key={a.area} className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-300 truncate">{a.name}</span>
                        <span className="text-white font-semibold">{formatBRLCompact(a.value)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
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
      {!loading && emendas.length > 0 && (
        <EmendasDetalhadasCard ano={ano} emendas={emendas} />
      )}

      {/* Lista de municípios beneficiados pelo parlamentar */}
      {!loading && (
        <MunicipiosBeneficiadosCard
          ano={ano}
          porMunicipio={porMunicipio}
          onClick={onMunicipioClick}
        />
      )}
    </div>
  );
}

function EmendasDetalhadasCard({
  ano, emendas,
}: {
  ano: number;
  emendas: PortalEmenda[];
}) {
  const [expandido, setExpandido] = useState(false);
  const MAX_INICIAL = 10;

  // Ordena por valor empenhado desc
  const ordenadas = useMemo(
    () => [...emendas].sort((a, b) => (b.valorEmpenhado ?? 0) - (a.valorEmpenhado ?? 0)),
    [emendas],
  );
  const visiveis = expandido ? ordenadas : ordenadas.slice(0, MAX_INICIAL);

  // Tipo curto pra caber na coluna + tooltip explicativo no nome completo
  const tipoCurto = (tipo: string | null): { label: string; color: string; hint: string } => {
    const t = (tipo ?? '').toLowerCase();
    if (t.includes('individual') && t.includes('especial'))   return {
      label: 'Individual / Especial',
      color: '#a855f7',
      hint:  'Transferência Especial — o parlamentar destina valor sem definir objeto específico (governo executor decide depois). Conhecida como "Emenda Pix".',
    };
    if (t.includes('individual') && t.includes('finalidade')) return {
      label: 'Individual / Finalidade',
      color: '#3b82f6',
      hint:  'Transferência com Finalidade Definida — o parlamentar destina valor para uma finalidade específica (ex: construção de UBS). Modalidade tradicional.',
    };
    if (t.includes('individual'))                              return {
      label: 'Individual',
      color: '#3b82f6',
      hint:  'Emenda Individual — cota anual de cada parlamentar (deputados e senadores).',
    };
    if (t.includes('bancada'))                                 return {
      label: 'Bancada',
      color: '#10b981',
      hint:  'Emenda de Bancada Estadual — proposta coletiva pelos parlamentares de um estado/DF.',
    };
    if (t.includes('comiss'))                                  return {
      label: 'Comissão',
      color: '#f59e0b',
      hint:  'Emenda de Comissão — proposta por uma comissão temática da Câmara ou Senado.',
    };
    if (t.includes('relator'))                                 return {
      label: 'Relator',
      color: '#ec4899',
      hint:  'Emenda do Relator (RP9) — modalidade que perdeu eficácia após decisão do STF em 2022.',
    };
    return { label: tipo ?? '—', color: '#94a3b8', hint: tipo ?? '' };
  };

  return (
    <div
      className="mt-4 rounded-xl p-4"
      style={{ background: 'rgba(7,29,54,0.5)', border: '1px solid rgba(255,255,255,0.05)' }}
    >
      <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">
          Detalhe das emendas em {ano}
        </p>
        <p className="text-[10px] text-slate-500">
          {emendas.length} {emendas.length === 1 ? 'emenda' : 'emendas'}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left text-[9px] uppercase tracking-widest text-slate-500 border-b border-white/5">
              <th className="py-2 px-2 font-semibold w-12">Nº</th>
              <th className="py-2 px-2 font-semibold">Tipo</th>
              <th className="py-2 px-2 font-semibold">Função</th>
              <th className="py-2 px-2 font-semibold">Município</th>
              <th className="py-2 px-2 font-semibold text-right">Empenhado</th>
              <th className="py-2 px-2 font-semibold text-right">Pago</th>
              <th className="py-2 px-2 font-semibold text-right w-14">%</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((e) => {
              const tipo = tipoCurto(e.tipo);
              const pct = e.valorEmpenhado > 0 ? (e.valorPago / e.valorEmpenhado) * 100 : 0;
              return (
                <tr
                  key={e.idPortal}
                  className="border-b border-white/5 hover:bg-white/5 transition-colors"
                >
                  <td className="py-2 px-2 text-slate-400 font-mono">{e.numero ?? '—'}</td>
                  <td className="py-2 px-2">
                    <span
                      title={tipo.hint}
                      className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold cursor-help"
                      style={{ background: `${tipo.color}22`, color: tipo.color, border: `1px solid ${tipo.color}44` }}
                    >
                      {tipo.label}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-slate-200 truncate max-w-[140px]" title={e.funcao ?? ''}>
                    {e.funcao ?? '—'}
                  </td>
                  <td
                    className="py-2 px-2 text-slate-300 truncate max-w-[180px]"
                    title={e.municipioNome ?? e.objeto ?? ''}
                  >
                    {e.municipioNome
                      ? e.municipioNome
                      : <span className="text-slate-500 italic">{e.objeto ?? 'sem destino'}</span>
                    }
                  </td>
                  <td className="py-2 px-2 text-right text-white font-semibold whitespace-nowrap">
                    {formatBRL(e.valorEmpenhado)}
                  </td>
                  <td className="py-2 px-2 text-right text-emerald-300 whitespace-nowrap">
                    {formatBRL(e.valorPago)}
                  </td>
                  <td className="py-2 px-2 text-right text-slate-400 whitespace-nowrap">
                    {pct.toFixed(0)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {ordenadas.length > MAX_INICIAL && (
        <button
          onClick={() => setExpandido((v) => !v)}
          className="mt-3 w-full text-center text-[11px] text-amber-300 hover:text-amber-200 font-semibold transition-colors py-1.5 rounded-lg hover:bg-amber-300/5"
        >
          {expandido
            ? `Mostrar apenas as ${MAX_INICIAL} maiores`
            : `Ver todas as ${ordenadas.length} emendas`}
        </button>
      )}
    </div>
  );
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
      style={{ background: 'rgba(7,29,54,0.5)', border: '1px solid rgba(255,255,255,0.05)' }}
    >
      <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">
          Municípios beneficiados em {ano}
        </p>
        {porMunicipio.length > 0 && (
          <p className="text-[10px] text-slate-500">
            {porMunicipio.length} {porMunicipio.length === 1 ? 'município' : 'municípios'} ·{' '}
            <span className="text-cyan-300 font-semibold">{formatBRL(total)}</span>
          </p>
        )}
      </div>

      {porMunicipio.length === 0 ? (
        <p className="text-xs text-slate-500 text-center py-6">
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
                  background: 'rgba(7,29,54,0.55)',
                  border: '1px solid rgba(255,255,255,0.04)',
                }}
              >
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-[10px] font-bold text-slate-500 w-5 flex-shrink-0">{i + 1}.</span>
                    <span className="text-white text-sm font-semibold truncate group-hover:text-amber-300 transition-colors">
                      {m.nome}
                    </span>
                    {m.uf && (
                      <span className="text-[10px] text-slate-500 flex-shrink-0">/ {m.uf}</span>
                    )}
                  </div>
                  <span className="text-cyan-300 font-bold text-sm whitespace-nowrap">
                    {formatBRL(m.total)}
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
                      <span className="text-white/70 font-semibold">{formatBRLCompact(valor)}</span>
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>

          {porMunicipio.length > MAX_INICIAL && (
            <button
              onClick={() => setExpandido((v) => !v)}
              className="mt-3 w-full text-center text-[11px] text-amber-300 hover:text-amber-200 font-semibold transition-colors py-1.5 rounded-lg hover:bg-amber-300/5"
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
      style={{ background: 'rgba(7,29,54,0.55)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
        <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">
          Comparativo por área · {escopo}
        </p>
        <p className="text-[10px] text-slate-500">
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
              style={{ background: 'rgba(7,29,54,0.5)', border: '1px solid rgba(255,255,255,0.05)' }}
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
              <p className="text-white font-bold text-lg">{formatBRL(atual)}</p>
              <div className="flex items-center gap-1.5 text-[11px] mt-1">
                <span className={isUp ? 'text-emerald-400' : 'text-rose-400'}>
                  {isUp ? <TrendingUp className="w-3 h-3 inline -mt-0.5" /> : <TrendingDown className="w-3 h-3 inline -mt-0.5" />}
                  {' '}
                  {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
                </span>
                <span className="text-slate-500">vs {ano - 1}</span>
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
      className="rounded-2xl p-5"
      style={{
        background: 'linear-gradient(135deg, rgba(201,162,39,0.08), rgba(74,158,222,0.05))',
        border: '1px solid rgba(201,162,39,0.25)',
      }}
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: 'rgba(201,162,39,0.15)',
            border: '1px solid rgba(201,162,39,0.4)',
            boxShadow: '0 0 18px rgba(201,162,39,0.25)',
          }}
        >
          <Trophy className="w-5 h-5" style={{ color: '#e8c660' }} />
        </div>
        <p className="text-[10px] uppercase tracking-widest font-bold text-amber-300">
          Destaque do ano em {stateName} ({ano})
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top município */}
        <div
          className="rounded-xl p-3.5"
          style={{ background: 'rgba(7,29,54,0.4)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p className="text-[10px] uppercase tracking-widest text-cyan-300/80 font-bold">
            Município que mais recebeu
          </p>
          <p className="text-white font-bold text-base mt-1.5">{municipio.nome}</p>
          <p className="text-cyan-300 font-bold text-xl mt-0.5">{formatBRL(municipio.total)}</p>
          <p className="text-[10px] text-slate-500 mt-1 italic">
            soma do que todos os parlamentares destinaram a esta cidade
          </p>
        </div>

        {/* Top parlamentar */}
        {topParlamentar && (
          <div
            className="rounded-xl p-3.5"
            style={{ background: 'rgba(7,29,54,0.4)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <p className="text-[10px] uppercase tracking-widest text-amber-300/80 font-bold">
              Parlamentar que mais enviou
            </p>
            <p className="text-white font-bold text-base mt-1.5 truncate">{topParlamentar.nome}</p>
            <p className="text-[11px] text-slate-400 -mt-0.5">
              {CARGO_LABELS[topParlamentar.cargo as ParlamentarCargo] ?? topParlamentar.cargo}
              {topParlamentar.partido ? ` · ${topParlamentar.partido}` : ''}
            </p>
            <p className="text-amber-300 font-bold text-xl mt-0.5">{formatBRL(topParlamentar.total)}</p>
            <p className="text-[10px] text-slate-500 mt-1 italic">
              total que este parlamentar enviou ao estado (todos os destinos somados)
            </p>
          </div>
        )}
      </div>

      <p className="text-[10px] text-slate-500 mt-3 text-center italic">
        ⓘ Os dois valores acima medem coisas diferentes — um é &ldquo;recebido pela cidade&rdquo;, outro é &ldquo;enviado pelo parlamentar ao estado todo&rdquo;.
      </p>
    </div>
  );
}
