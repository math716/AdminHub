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
import { EmendaDocumentosModal } from '@/components/emendas/emenda-documentos-modal';

// ---------------------------------------------------------------------------
// Mapas dinÃ¢micos (Leaflet SSR-off)
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
// PÃ¡gina
// ---------------------------------------------------------------------------
export default function EmendasPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const userRole = (session?.user as any)?.role;
  const userPermissions = (session?.user as any)?.permissions ?? [];
  const canAccess = hasPermission({ role: userRole, permissions: userPermissions }, PERMISSIONS.EMENDAS_MAPA);

  // NavegaÃ§Ã£o: Brasil â†’ Estado â†’ MunicÃ­pio
  const [view, setView] = useState<'brasil' | 'estado'>('brasil');
  const [selectedUf, setSelectedUf] = useState('');
  const [selectedStateName, setSelectedStateName] = useState('');
  const [selectedMunicipio, setSelectedMunicipio] = useState<{ codigo: string; nome: string } | null>(null);

  // Ano
  const [ano, setAno] = useState<number>(ANO_PADRAO);

  // Dados do estado
  const [resumo, setResumo] = useState<ResumoEstado | null>(null);
  const [loadingResumo, setLoadingResumo] = useState(false);

  // Dados do municÃ­pio selecionado
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

  // ----- Resumo do estado (top municÃ­pios, totais por Ã¡rea etc) -----
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

  // ----- Stats + emendas do municÃ­pio selecionado -----
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
      // Emendas do ano anterior â€” pra alimentar o card de comparativo
      // quando municÃ­pio estÃ¡ selecionado.
      fetch(`/api/emendas-portal/municipio/${selectedMunicipio.codigo}/emendas?uf=${selectedUf}&ano=${ano - 1}`, { signal: ctrl.signal }).then((r) => r.json()),
    ])
      .then(([stats, emendas, emendasAnt]) => {
        setMunicipioStats(stats);
        setMunicipioEmendas(Array.isArray(emendas?.emendas) ? emendas.emendas : []);
        setMunicipioEmendasAnterior(Array.isArray(emendasAnt?.emendas) ? emendasAnt.emendas : []);
      })
      .catch((e: any) => {
        if (e?.name !== 'AbortError') console.error('Erro ao buscar municÃ­pio:', e);
      })
      .finally(() => setLoadingMunicipio(false));
    return () => ctrl.abort();
  }, [selectedMunicipio, ano, selectedUf]);

  // ----- Autocomplete parlamentar -----
  // Filtra LOCALMENTE em resumo.parlamentares (lista jÃ¡ carregada do estado).
  // Ã‰ instantÃ¢neo, nÃ£o bate no Portal, e cobre todos os parlamentares que
  // efetivamente enviaram emendas pro estado neste ano.
  useEffect(() => {
    const q = parlamentarQuery.trim().toLowerCase();
    if (q.length < 2 || !resumo?.parlamentares) {
      setParlamentarResults([]);
      return;
    }
    setSearchingParlamentar(false);
    const normalizar = (s: string) =>
      s.normalize('NFD').replace(/[Ì€-Í¯]/g, '').toLowerCase();
    const qNorm = normalizar(q);

    // Quando hÃ¡ municÃ­pio selecionado, restringe ao pool de parlamentares daquele municÃ­pio
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
      .filter((p) => normalizar(p.nome).includes(qNorm))
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

  // ----- Emendas + transferÃªncias Pix + destinos do parlamentar selecionado -----
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
    const ufParam = selectedUf ? `&uf=${selectedUf}` : '';
    Promise.all([
      fetch(`/api/emendas-portal/parlamentar/${id}?ano=${ano}${ufParam}`, { signal: ctrl.signal }).then((r) => r.json()),
      fetch(`/api/emendas-portal/parlamentar/${id}/destinos?ano=${ano}${ufParam}`, { signal: ctrl.signal }).then((r) => r.json()),
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
  }, [selectedParlamentar, ano, selectedUf]);

  // HistÃ³rico completo do parlamentar (todos os anos) â€” tambÃ©m filtrado por UF
  // pro grÃ¡fico "Valor por Ano" refletir o estado em foco.
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
        if (e?.name !== 'AbortError') console.error('Erro ao buscar histÃ³rico:', e);
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

  // ----- CÃ¡lculos derivados (donut/comparativo do parlamentar) -----
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

  // Quebra do total do parlamentar em "destinado a municÃ­pios" vs "destinado
  // ao estado inteiro" â€” ajuda a entender por que a lista de municÃ­pios pode
  // estar vazia mesmo o donut mostrando valores altos (tÃ­pico de senadores).
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

  // Agrega emendas do parlamentar por tipo (Individual, Bancada, ComissÃ£o, ...)
  // Senadores e deputados podem aparecer em emendas de bancada/comissÃ£o tambÃ©m.
  // Mostrar o breakdown ajuda a entender o que vem da cota individual.
  const parlamentarPorTipo = useMemo(() => {
    const map = new Map<string, { tipo: string; total: number; qtd: number }>();
    parlamentarEmendas.forEach((e) => {
      const tipo = e.tipo ?? 'NÃ£o classificada';
      // Encurta tipos longos pra visualizaÃ§Ã£o ("Emenda Individual - ..." â†’ "Individual")
      const tipoCurto =
        tipo.match(/individual/i)        ? 'Individual'
        : tipo.match(/bancada/i)         ? 'Bancada'
        : tipo.match(/comiss[Ã£a]o/i)     ? 'ComissÃ£o'
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

  // Quando hÃ¡ parlamentar selecionado, o mapa mostra os municÃ­pios beneficiados.
  // Prioriza destinosFlat (favorecidos reais de EmendaDocumento) quando disponÃ­vel;
  // fallback para parlamentarEmendas (um municÃ­pio por emenda).
  const parlamentarValorPorMunicipio = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    if (parlamentarDestinosFlat.length > 0) {
      parlamentarDestinosFlat.forEach((d) => {
        if (!d.codigoIbge) return;
        map[d.codigoIbge] = (map[d.codigoIbge] ?? 0) + d.valorEmpenhado;
      });
    } else {
      parlamentarEmendas.forEach((e) => {
        if (!e.codigoIbge) return;
        map[e.codigoIbge] = (map[e.codigoIbge] ?? 0) + (e.valorEmpenhado ?? 0);
      });
    }
    return map;
  }, [parlamentarEmendas, parlamentarDestinosFlat]);

  // VersÃ£o por nome â€” para destinos sem codigoIbge.
  const parlamentarValorPorMunicipioNome = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    if (parlamentarDestinosFlat.length > 0) {
      parlamentarDestinosFlat.forEach((d) => {
        if (d.codigoIbge || !d.municipio) return;
        const nome = d.municipio.toUpperCase();
        map[nome] = (map[nome] ?? 0) + d.valorEmpenhado;
      });
    } else {
      parlamentarEmendas.forEach((e) => {
        if (e.codigoIbge || !e.municipioNome) return;
        const nome = e.municipioNome.toUpperCase();
        map[nome] = (map[nome] ?? 0) + (e.valorEmpenhado ?? 0);
      });
    }
    return map;
  }, [parlamentarEmendas, parlamentarDestinosFlat]);

  // Agrega emendas do parlamentar (ano selecionado) por municÃ­pio, com
  // breakdown de Ã¡reas pra cada um. Usado na nova seÃ§Ã£o "MunicÃ­pios
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

  // AgregaÃ§Ã£o de transferÃªncias Pix por municÃ­pio â€” preenche o card
  // "MunicÃ­pios via Pix" do dashboard. Diferente de parlamentarPorMunicipio
  // (que vem das emendas), aqui o destino Ã© o municÃ­pio REAL onde o Pix
  // caiu, mesmo quando a emenda original foi cadastrada a nÃ­vel UF.
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

  // Top 5 parlamentares que mais enviaram emendas para o municÃ­pio selecionado
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

  // Ãreas do parlamentar (ano atual) â€” formato esperado pelo ComparativoAreasCard
  const parlamentarAreasAtual = useMemo<{ area: EmendaArea; total: number }[]>(() => {
    const m = new Map<EmendaArea, number>();
    parlamentarEmendas.forEach((e) => m.set(e.area, (m.get(e.area) ?? 0) + e.valorEmpenhado));
    return Array.from(m.entries()).map(([area, total]) => ({ area, total }));
  }, [parlamentarEmendas]);

  // Ãreas do parlamentar (ano anterior) â€” derivado do histÃ³rico
  const parlamentarAreasAnterior = useMemo<Map<string, number>>(() => {
    const m = new Map<string, number>();
    parlamentarHistorico
      .filter((e) => e.ano === ano - 1)
      .forEach((e) => m.set(e.area, (m.get(e.area) ?? 0) + e.valorEmpenhado));
    return m;
  }, [parlamentarHistorico, ano]);

  // InterseÃ§Ã£o: emendas do parlamentar filtradas pelo municÃ­pio selecionado
  const parlamentarMunicipioEmendas = useMemo(() => {
    if (!selectedParlamentar || !selectedMunicipio) return [];
    return parlamentarEmendas.filter((e) => e.codigoIbge === selectedMunicipio.codigo);
  }, [selectedParlamentar, selectedMunicipio, parlamentarEmendas]);

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

  // ----- Ãreas do municÃ­pio (atual e anterior) â€” usado quando hÃ¡ municÃ­pio selecionado -----
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
        subtitle="VisÃ£o geral das emendas por estado, municÃ­pio e parlamentar"
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

      {/* Barra de pesquisa de parlamentar â€” abaixo do tÃ­tulo, visÃ­vel quando hÃ¡ estado selecionado */}
      {view === 'estado' && (
        <div className="relative">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={parlamentarQuery}
                onChange={(e) => setParlamentarQuery(e.target.value)}
                placeholder="Pesquisar parlamentarâ€¦"
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-amber-500/50 transition-colors"
              />
            </div>
            {selectedParlamentar && (
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl flex-shrink-0"
                style={{ background: 'rgba(201,162,39,0.1)', border: '1px solid rgba(201,162,39,0.3)' }}
              >
                <span className="text-xs text-white font-semibold truncate max-w-[180px]">{selectedParlamentar.nome}</span>
                <button onClick={() => setSelectedParlamentar(null)} className="text-slate-400 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
          {parlamentarQuery.length >= 2 && parlamentarResults.length > 0 && (
            <div
              className="absolute top-full left-0 right-0 mt-1 z-[500] rounded-xl overflow-hidden"
              style={{ background: 'rgba(7,29,54,0.98)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 12px 32px rgba(0,0,0,0.5)' }}
            >
              {parlamentarResults.map((p) => (
                <button
                  key={p.idPortal}
                  onClick={() => { setSelectedParlamentar(p); setParlamentarQuery(''); setParlamentarResults([]); }}
                  className="w-full text-left px-4 py-2.5 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
                >
                  <p className="text-sm text-white font-medium">{p.nome}</p>
                  <p className="text-[11px] text-slate-400">{CARGO_LABELS[p.cargo]}{p.partido ? ` Â· ${p.partido}` : ''}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Destaque do ano â€” acima do grid principal */}
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
          style={{ background: 'rgba(201,162,39,0.08)', border: '1px solid rgba(201,162,39,0.25)', color: '#e8c660' }}
        >
          <span className="font-semibold">Modo demonstraÃ§Ã£o:</span>
          <span className="text-slate-300">
            os dados exibidos sÃ£o sintÃ©ticos. Configure a variÃ¡vel <code className="px-1.5 py-0.5 rounded bg-black/30">PORTAL_TRANSPARENCIA_API_KEY</code> para usar dados reais do Portal da TransparÃªncia.
          </span>
        </div>
      )}

      {/* Grid principal â€” coluna esquerda ocupa 2 linhas (row-span-2) com
            Resumo Geral e Pizza empilhados encostados. Coluna central+direita
            tem Mapa+Top5/Parl na linha 1 e Comparativo na linha 2.
            Layout:
              â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
              â”‚ Resumo â”‚   Mapa   â”‚ Top 5   â”‚  â† linha 1
              â”‚ Geral  â”‚          â”‚ Parl    â”‚
              â”œ Pizza  â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
              â”‚        â”‚ Comparativo (9)   â”‚  â† linha 2
              â””â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ */}
      <div className="grid grid-cols-12 gap-4">
        {/* COLUNA ESQUERDA â€” Resumo + Pizza encostados (row-span-2 cobre as 2 linhas) */}
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

        {/* LINHA 1 â€” Coluna central: Mapa */}
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
                  : 'Emendas por MunicÃ­pio'}
              </div>
            </div>

            {view === 'brasil' && (
              <BrazilMap onStateClick={handleStateClick} darkMode />
            )}
            {view === 'estado' && selectedUf && (
              <StateMap
                uf={selectedUf}
                stateName={selectedStateName}
                /* Quando hÃ¡ parlamentar selecionado, mostra sÃ³ os municÃ­pios
                   que ele beneficiou. SenÃ£o, mostra todos do estado. */
                votesData={
                  selectedParlamentar
                    ? parlamentarValorPorMunicipio
                    : (resumo?.valorPorMunicipio ?? {})
                }
                votesDataByName={
                  selectedParlamentar ? parlamentarValorPorMunicipioNome : undefined
                }
                onMunicipioClick={handleMunicipioClick}
                disableSubdivisao
                highlightColor="gold"
                highlightMunicipioNome={selectedMunicipio?.nome ?? null}
                valueLabel={selectedParlamentar ? `de ${selectedParlamentar.nome.split(' ')[0]}` : 'em emendas'}
                darkMode
              />
            )}

            {/* Popup do municÃ­pio (habitantes/eleitores/MAC/PAP) */}
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

        {/* LINHA 1 â€” Coluna direita: Top 5 */}
        <div className="col-span-12 md:col-span-3 space-y-4">
          {view === 'brasil' ? (
            <SelecionarEstadoCard />
          ) : selectedMunicipio ? (
            /* MunicÃ­pio selecionado â†’ mostra top 5 parlamentares desse municÃ­pio */
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
          ) : (
            <Top5MunicipiosCard
              resumo={resumo}
              loading={loadingResumo}
              onClick={(m) => handleMunicipioClick(m.codigoIbge, m.nome)}
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
          )}

          {/* Top 5 parlamentares do estado (quando nÃ£o hÃ¡ municÃ­pio selecionado) */}
          {!selectedMunicipio && (
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
          )}
        </div>

        {/* LINHA 2 â€” Comparativo por Ãrea ocupando 9 colunas (centro + direita) */}
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
                  ? `municÃ­pio de ${selectedMunicipio.nome}`
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

      {/* Dashboard do parlamentar (aparece quando hÃ¡ parlamentar selecionado) */}
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

  // â”€â”€ LÃ³gica do card "Total de Emendas" â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Prioridade: ambos â†’ sÃ³ parlamentar â†’ sÃ³ municÃ­pio â†’ estado inteiro
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
    ? `de ${parlamentarTotal > 0 ? formatBRLCompact(parlamentarTotal) : 'â€”'} total do parlamentar no estado`
    : hasParl
    ? `${formatBRLCompact(parlamentarTotalPago)} pago Â· em ${ano}`
    : hasMun
    ? `em ${ano}`
    : (resumo?.totalEstadual ?? 0) > 0
    ? `${formatBRLCompact(resumo!.totalEstadual)} adicional sem municÃ­pio`
    : `em ${ano}`;

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
          label="PopulaÃ§Ã£o Total"
          value={
            view === 'brasil'
              ? 'â€”'
              : municipio
                ? habitantes != null ? habitantes.toLocaleString('pt-BR') : 'â€”'
                : 'Selecione um municÃ­pio'
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
              ? eleitores != null ? eleitores.toLocaleString('pt-BR') : 'â€”'
              : 'Selecione um municÃ­pio'
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
                : 'Selecione um municÃ­pio'
          }
          sub={municipio && tetoMac != null ? 'MÃ©dia e Alta Complexidade Â· anual' : undefined}
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
                : 'Selecione um municÃ­pio'
          }
          sub={municipio && tetoPap != null ? 'AtenÃ§Ã£o PrimÃ¡ria Â· anual' : undefined}
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
      style={{ background: 'rgba(7,29,54,0.55)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-3">Emendas por Ãrea</p>
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
        <li>Escolha um municÃ­pio (popup mostra habitantes, eleitores e tetos)</li>
        <li>Pesquise um parlamentar para ver os grÃ¡ficos por Ã¡rea e por ano</li>
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
      className="rounded-2xl p-4"
      style={{ background: 'rgba(7,29,54,0.55)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">Top 5 Parlamentares</p>
      <p className="text-[10px] text-amber-300/80 mb-2 truncate" title={municipioNome}>
        que mais enviaram para {municipioNome}
      </p>
      {loading && (
        <div className="py-6 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
        </div>
      )}
      {!loading && parlamentares.length === 0 && (
        <p className="text-xs text-slate-500 text-center py-4">Sem dados disponÃ­veis</p>
      )}
      {!loading && parlamentares.length > 0 && (
        <ol className="space-y-2">
          {parlamentares.map((p, i) => (
            <li key={p.idPortal}>
              <button
                onClick={() => onPick(p)}
                className="w-full flex items-center gap-2 group hover:bg-white/5 -mx-2 px-2 py-1 rounded-lg transition-colors text-left"
              >
                <span className="text-xs font-bold text-slate-500 w-4">{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-white truncate group-hover:text-amber-300 transition-colors">{p.nome}</p>
                  <p className="text-[10px] text-slate-500">{CARGO_LABELS[p.cargo]}{p.partido ? ` Â· ${p.partido}` : ''}</p>
                </div>
                <span className="text-xs font-semibold text-cyan-300 flex-shrink-0">{formatBRLCompact(p.total)}</span>
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
      className="rounded-2xl p-4"
      style={{ background: 'rgba(7,29,54,0.55)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-3">Top 5 Parlamentares</p>
      <div className="space-y-1.5">
        {topResumo.slice(0, 5).map((p) => (
          <button
            key={p.idPortal}
            onClick={() => onPick(p)}
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
  // Se hÃ¡ parlamentar selecionado, usa o top dele. SenÃ£o, usa o do estado.
  const top = escopoParlamentar?.municipios ?? resumo?.topMunicipios ?? [];
  const isParlamentar = !!escopoParlamentar;

  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: 'rgba(7,29,54,0.55)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">
        Top 5 MunicÃ­pios
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
            ? 'Nenhum municÃ­pio identificado (emendas em nÃ­vel estadual)'
            : 'Sem dados disponÃ­veis'}
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
                <span className="text-xs font-semibold text-cyan-300">{formatBRLCompact(m.total)}</span>
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
          placeholder="Pesquisar parlamentarâ€¦"
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
                {p.partido ? ` Â· ${p.partido}` : ''}
                {p.uf ? ` Â· ${p.uf}` : ''}
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
              {CARGO_LABELS[selected.cargo]}{selected.partido ? ` Â· ${selected.partido}` : ''}
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
              MunicÃ­pio
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
              value={stats?.habitantes != null ? stats.habitantes.toLocaleString('pt-BR') : 'â€”'}
              hint={stats?.fonteHabitantes ?? undefined}
            />
            <PopupRow
              label="Eleitores"
              value={stats?.eleitores != null ? stats.eleitores.toLocaleString('pt-BR') : 'â€”'}
              hint={stats?.eleitores == null ? 'requer importaÃ§Ã£o do TSE' : undefined}
            />
            <PopupRow
              label="Teto MAC"
              value={stats?.tetoMac != null ? formatBRLCompact(stats.tetoMac) : 'â€”'}
              hint={stats?.tetoMac == null ? 'requer cadastro manual (DataSUS)' : undefined}
            />
            <PopupRow
              label="Teto PAP"
              value={stats?.tetoPap != null ? formatBRLCompact(stats.tetoPap) : 'â€”'}
              hint={stats?.tetoPap == null ? 'fonte SISAPS â€” pendente' : undefined}
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
        <span className={value === 'â€”' ? 'text-slate-500' : 'text-white font-semibold'}>{value}</span>
        {hint && <p className="text-[9px] text-slate-500 italic mt-0.5 leading-tight">{hint}</p>}
      </div>
    </div>
  );
}

function LegendaCores() {
  // Mesmas faixas discretas usadas pelo StateMap em darkMode â€” qualquer mudanÃ§a
  // aqui precisa replicar no getColor de state-map.tsx pra legenda continuar
  // batendo com o desenho.
  const items = [
    { label: 'Acima de R$ 2 milhÃµes',         color: '#0c4f8a' },
    { label: 'R$ 1 milhÃ£o â€“ 2 milhÃµes',       color: '#1d6fb8' },
    { label: 'R$ 500 mil â€“ 1 milhÃ£o',         color: '#3a8ed1' },
    { label: 'AtÃ© R$ 500 mil',                color: '#7fb8e0' },
    { label: 'Sem emendas',                   color: '#15355c', border: '1px solid rgba(255,255,255,0.18)' },
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
      style={{ background: 'rgba(7,29,54,0.55)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-widest font-bold text-amber-300">Dashboard do parlamentar</p>
          <h2 className="text-xl text-white font-bold mt-1">{parlamentar.nome}</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {CARGO_LABELS[parlamentar.cargo]}
            {parlamentar.partido ? ` Â· ${parlamentar.partido}` : ''}
            {parlamentar.uf ? ` Â· ${parlamentar.uf}` : ''}
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
            Total enviado em {ano}{escopo ? ` Â· ${escopo}` : ''}
          </p>
          <p className="text-2xl font-bold text-white mt-0.5">
            {loading ? <Loader2 className="w-5 h-5 animate-spin inline" /> : formatBRLCompact(totalAno)}
          </p>
          {!loading && totalAno > 0 && (
            <p className="text-[11px] text-emerald-300 mt-0.5">
              Pago: <span className="font-bold">{formatBRLCompact(totalPago)}</span>
              <span className="text-emerald-400/60"> ({pctPago.toFixed(0)}%)</span>
            </p>
          )}
          {!loading && (destinos.municipal > 0 || destinos.estadual > 0) && (
            <div className="mt-2 text-[10px] text-slate-300 space-y-0.5 text-right">
              <p>
                <span className="text-cyan-300">â—</span> A municÃ­pios: <span className="font-semibold text-white">{formatBRLCompact(destinos.municipal)}</span>
                <span className="text-slate-500"> ({destinos.qtdMun})</span>
              </p>
              <p>
                <span className="text-violet-400">â—</span> NÃ­vel UF (sem municÃ­pio): <span className="font-semibold text-white">{formatBRLCompact(destinos.estadual)}</span>
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
          {/* Donut: Emendas por Ãrea */}
          <div className="rounded-xl p-4" style={{ background: 'rgba(7,29,54,0.5)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-2">DistribuiÃ§Ã£o por Ã¡rea</p>
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
            <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-2">Valor por ano (histÃ³rico)</p>
            {porAno.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-10">Sem histÃ³rico disponÃ­vel</p>
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

          {/* Barras: Comparativo de todas as Ã¡reas (do ano selecionado) */}
          <div className="rounded-xl p-4" style={{ background: 'rgba(7,29,54,0.5)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-2">Comparativo de Ã¡reas em {ano}</p>
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
      {!loading && (emendas.length > 0 || destinosFlat.length > 0) && (
        <EmendasDetalhadasCard ano={ano} uf={uf} emendas={emendas} destinosFlat={destinosFlat} />
      )}


      {/* Destinos de transferÃªncias Pix (EC 105/2019) â€” preenche quando a
          emenda foi cadastrada a nÃ­vel UF e o municÃ­pio sÃ³ foi decidido
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

  const [emendaSelecionada, setEmendaSelecionada] = useState<{ codigo: string; titulo: string } | null>(null);

  // Filtros
  const [busca, setBusca] = useState('');
  const [funcaoFiltro, setFuncaoFiltro] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('');
  const [valorMin, setValorMin] = useState('');
  const [valorMax, setValorMax] = useState('');

  // Quando hÃ¡ destinosFlat usa-os; caso contrÃ¡rio usa emendas como fallback
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
    s.normalize('NFD').replace(/[Ì€-Í¯]/g, '').toLowerCase();

  const vMinNum = valorMin ? parseFloat(valorMin) : null;
  const vMaxNum = valorMax ? parseFloat(valorMax) : null;
  const q = normalizar(busca.trim());

  // â”€â”€ Flat (destinos reais por favorecido) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const destinosFiltrados = useMemo(() => {
    if (!usandoFlat) return [];
    return destinosFlat.filter((d) => {
      if (q && !normalizar(d.municipio ?? '').includes(q)
             && !normalizar(d.nomeFavorecido ?? '').includes(q)
             && !normalizar(d.funcao ?? '').includes(q)
             && !normalizar(d.numeroEmenda ?? '').includes(q)) return false;
      if (funcaoFiltro && d.funcao !== funcaoFiltro) return false;
      if (tipoFiltro && tipoCurtoLabel(d.tipoEmenda) !== tipoFiltro) return false;
      if (vMinNum !== null && d.valorEmpenhado < vMinNum) return false;
      if (vMaxNum !== null && d.valorEmpenhado > vMaxNum) return false;
      return true;
    });
  }, [usandoFlat, destinosFlat, q, funcaoFiltro, tipoFiltro, vMinNum, vMaxNum]);

  // â”€â”€ Fallback: emendas filtradas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        if (vMinNum !== null && (e.valorEmpenhado ?? 0) < vMinNum) return false;
        if (vMaxNum !== null && (e.valorEmpenhado ?? 0) > vMaxNum) return false;
        return true;
      })
      .sort((a, b) => (b.valorEmpenhado ?? 0) - (a.valorEmpenhado ?? 0));
  }, [usandoFlat, emendas, q, funcaoFiltro, tipoFiltro, vMinNum, vMaxNum]);

  const temFiltro = busca || funcaoFiltro || tipoFiltro || valorMin || valorMax;
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
      style={{ background: 'rgba(7,29,54,0.55)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* â”€â”€ Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div
        className="px-5 py-3.5 flex items-center justify-between gap-4 flex-wrap"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-1 h-4 rounded-full" style={{ background: 'linear-gradient(180deg,#f59e0b,#d97706)' }} />
          <p className="text-xs font-bold text-white tracking-wide">Detalhe das Emendas</p>
          <span className="text-[10px] text-slate-500 font-medium">{ano}</span>
        </div>
        <div className="flex items-center gap-3">
          {semDadosExecucao && (
            <span className="text-[10px] text-amber-400/70 italic hidden sm:block">Sem dados de execuÃ§Ã£o estadual</span>
          )}
          {semDadosPagamento && !semDadosExecucao && (
            <span className="text-[10px] text-amber-400/70 italic hidden sm:block">Sem dados de pagamento estadual</span>
          )}
          <div className="flex items-center gap-2 px-3 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {temFiltro && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
            )}
            <span className="text-[11px] font-semibold text-white">
              {temFiltro ? filtradoQtd : totalItens}
            </span>
            <span className="text-[10px] text-slate-400">{labelItens}</span>
            <span className="text-slate-600 text-[10px]">Â·</span>
            <span className="text-[11px] font-semibold text-emerald-300">{formatBRLCompact(totalValor)}</span>
          </div>
          {temFiltro && (
            <button
              onClick={limparFiltros}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium text-slate-300 hover:text-white transition-colors"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}
            >
              <X className="w-3 h-3" /> Limpar
            </button>
          )}
        </div>
      </div>

      {/* â”€â”€ Barra de filtros â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="px-5 py-3 flex flex-wrap gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        {/* Busca */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={usandoFlat ? 'Buscar favorecido, municÃ­pio ou nÂºâ€¦' : 'Buscar municÃ­pio, funÃ§Ã£o ou nÂºâ€¦'}
            className="w-full h-9 rounded-xl pl-9 pr-3 text-[12px] text-white placeholder-slate-500 outline-none transition-all"
            style={{
              background: busca ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.04)',
              border: busca ? '1px solid rgba(245,158,11,0.35)' : '1px solid rgba(255,255,255,0.08)',
            }}
          />
        </div>

        {/* Ãrea */}
        <div className="relative min-w-[150px]">
          <select
            value={funcaoFiltro}
            onChange={(e) => setFuncaoFiltro(e.target.value)}
            className="w-full h-9 rounded-xl px-3 pr-8 text-[12px] text-white outline-none appearance-none cursor-pointer transition-all"
            style={{
              background: funcaoFiltro ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.04)',
              border: funcaoFiltro ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <option value="" style={{ background: '#0a1f3d' }}>Todas as Ã¡reas</option>
            {funcoes.map((f) => <option key={f} value={f} style={{ background: '#0a1f3d' }}>{f}</option>)}
          </select>
          <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
            <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </div>
        </div>

        {/* Tipo */}
        <div className="relative min-w-[150px]">
          <select
            value={tipoFiltro}
            onChange={(e) => setTipoFiltro(e.target.value)}
            className="w-full h-9 rounded-xl px-3 pr-8 text-[12px] text-white outline-none appearance-none cursor-pointer transition-all"
            style={{
              background: tipoFiltro ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.04)',
              border: tipoFiltro ? '1px solid rgba(16,185,129,0.35)' : '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <option value="" style={{ background: '#0a1f3d' }}>Todos os tipos</option>
            {tiposCurtos.map((t) => <option key={t} value={t} style={{ background: '#0a1f3d' }}>{t}</option>)}
          </select>
          <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
            <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </div>
        </div>

        {/* Faixa de valor */}
        <div className="flex items-center gap-1.5 min-w-[180px]">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-medium pointer-events-none">R$</span>
            <input
              value={valorMin}
              onChange={(e) => setValorMin(e.target.value)}
              placeholder="MÃ­n"
              type="number"
              min={0}
              className="w-full h-9 rounded-xl pl-7 pr-2 text-[12px] text-white placeholder-slate-500 outline-none transition-all"
              style={{
                background: valorMin ? 'rgba(74,158,222,0.1)' : 'rgba(255,255,255,0.04)',
                border: valorMin ? '1px solid rgba(74,158,222,0.35)' : '1px solid rgba(255,255,255,0.08)',
              }}
            />
          </div>
          <div className="w-3 h-px bg-slate-600 flex-shrink-0" />
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-medium pointer-events-none">R$</span>
            <input
              value={valorMax}
              onChange={(e) => setValorMax(e.target.value)}
              placeholder="MÃ¡x"
              type="number"
              min={0}
              className="w-full h-9 rounded-xl pl-7 pr-2 text-[12px] text-white placeholder-slate-500 outline-none transition-all"
              style={{
                background: valorMax ? 'rgba(74,158,222,0.1)' : 'rgba(255,255,255,0.04)',
                border: valorMax ? '1px solid rgba(74,158,222,0.35)' : '1px solid rgba(255,255,255,0.08)',
              }}
            />
          </div>
        </div>
      </div>

      {/* â”€â”€ Tabelas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="px-5 pb-4">
        {/* Vazio */}
        {((usandoFlat && destinosFiltrados.length === 0) || (!usandoFlat && emendasFiltradas.length === 0)) && (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <Search className="w-5 h-5 text-slate-600" />
            <p className="text-[12px] text-slate-500">Nenhum resultado encontrado</p>
            {temFiltro && (
              <button onClick={limparFiltros} className="text-[11px] text-amber-400 hover:text-amber-300 mt-1 transition-colors">
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
                  {(['NÂº', 'Tipo', 'Ãrea', 'Favorecido', 'MunicÃ­pio', 'Empenhado', 'Pago', '%'] as const).map((h, i) => (
                    <th
                      key={h}
                      className={`py-2.5 px-3 text-[9px] uppercase tracking-widest font-bold text-slate-500 whitespace-nowrap ${i >= 5 ? 'text-right' : 'text-left'}`}
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
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
                        titulo: d.numeroEmenda ? `Emenda nÂº ${d.numeroEmenda}` : `Emenda ${d.codigoEmenda}`,
                      })}
                      className="group cursor-pointer transition-colors"
                      style={{ background: par ? 'transparent' : 'rgba(255,255,255,0.015)' }}
                      title="Clique para ver todos os documentos desta emenda"
                    >
                      <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px] whitespace-nowrap group-hover:text-slate-300 transition-colors" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        {d.numeroEmenda ?? 'â€”'}
                      </td>
                      <td className="py-2.5 px-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <span
                          title={tipo.hint}
                          className="inline-block px-2 py-0.5 rounded-full text-[9px] font-semibold cursor-help whitespace-nowrap"
                          style={{ background: `${tipo.color}18`, color: tipo.color, border: `1px solid ${tipo.color}33` }}
                        >
                          {tipo.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 truncate max-w-[110px] group-hover:text-white transition-colors" title={d.funcao ?? ''} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        {d.funcao ?? 'â€”'}
                      </td>
                      <td className="py-2.5 px-3 truncate max-w-[220px]" title={d.nomeFavorecido ?? ''} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <span className="text-slate-200 group-hover:text-white transition-colors font-medium">
                          {d.nomeFavorecido ?? <span className="text-slate-600 italic font-normal">sem favorecido</span>}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 truncate max-w-[150px]" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        {d.municipio ? (
                          <span className="text-slate-400 group-hover:text-slate-200 transition-colors">
                            {d.municipio}
                            {d.uf && <span className="text-slate-600 ml-1 text-[10px]">/ {d.uf}</span>}
                          </span>
                        ) : <span className="text-slate-600">â€”</span>}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-white whitespace-nowrap group-hover:text-amber-200 transition-colors" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        {formatBRLCompact(d.valorEmpenhado)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-emerald-400 whitespace-nowrap" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        {formatBRLCompact(d.valorPago)}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
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
                  {(['NÂº', 'Tipo', 'Ãrea', 'Destino', 'Empenhado', 'Pago', '%'] as const).map((h, i) => (
                    <th
                      key={h}
                      className={`py-2.5 px-3 text-[9px] uppercase tracking-widest font-bold text-slate-500 whitespace-nowrap ${i >= 4 ? 'text-right' : 'text-left'}`}
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
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
                      onClick={() => setEmendaSelecionada({ codigo: e.idPortal, titulo: e.numero ? `Emenda nÂº ${e.numero}` : `Emenda ${e.idPortal}` })}
                      className="group cursor-pointer transition-colors"
                      style={{ background: par ? 'transparent' : 'rgba(255,255,255,0.015)' }}
                      title="Clique para ver favorecidos e breakdown por fase"
                    >
                      <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px] whitespace-nowrap group-hover:text-slate-300 transition-colors" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{e.numero ?? 'â€”'}</td>
                      <td className="py-2.5 px-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <span title={tipo.hint} className="inline-block px-2 py-0.5 rounded-full text-[9px] font-semibold cursor-help whitespace-nowrap" style={{ background: `${tipo.color}18`, color: tipo.color, border: `1px solid ${tipo.color}33` }}>{tipo.label}</span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 truncate max-w-[140px] group-hover:text-white transition-colors" title={e.funcao ?? ''} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{e.funcao ?? 'â€”'}</td>
                      <td className="py-2.5 px-3 text-slate-200 truncate max-w-[200px] font-medium group-hover:text-white transition-colors" title={e.municipioNome ?? e.objeto ?? ''} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        {e.municipioNome ?? <span className="text-slate-600 italic font-normal">{e.objeto ?? 'sem destino'}</span>}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-white whitespace-nowrap group-hover:text-amber-200 transition-colors" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{formatBRLCompact(e.valorEmpenhado)}</td>
                      <td className="py-2.5 px-3 text-right text-emerald-400 whitespace-nowrap" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{formatBRLCompact(e.valorPago)}</td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
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
  if (t.includes('comiss'))      return 'ComissÃ£o';
  if (t.includes('relator'))     return 'Relator';
  return tipo ?? 'â€”';
}

function tipoCurtoInfo(tipo: string | null): { label: string; color: string; hint: string } {
  const t = (tipo ?? '').toLowerCase();
  if (t.includes('individual') && t.includes('especial'))   return { label: 'Individual / Especial',   color: '#a855f7', hint: 'TransferÃªncia Especial ("Emenda Pix") â€” parlamentar destina sem definir objeto.' };
  if (t.includes('individual') && t.includes('finalidade')) return { label: 'Individual / Finalidade', color: '#3b82f6', hint: 'TransferÃªncia com Finalidade Definida â€” destinaÃ§Ã£o para objeto especÃ­fico.' };
  if (t.includes('individual'))  return { label: 'Individual',  color: '#3b82f6', hint: 'Emenda Individual â€” cota anual de cada parlamentar.' };
  if (t.includes('bancada'))     return { label: 'Bancada',     color: '#10b981', hint: 'Emenda de Bancada Estadual â€” proposta coletiva.' };
  if (t.includes('comiss'))      return { label: 'ComissÃ£o',    color: '#f59e0b', hint: 'Emenda de ComissÃ£o â€” proposta por comissÃ£o temÃ¡tica.' };
  if (t.includes('relator'))     return { label: 'Relator',     color: '#ec4899', hint: 'Emenda do Relator (RP9) â€” perdeu eficÃ¡cia apÃ³s STF 2022.' };
  return { label: tipo ?? 'â€”', color: '#94a3b8', hint: tipo ?? '' };
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
          MunicÃ­pios beneficiados em {ano}
        </p>
        {porMunicipio.length > 0 && (
          <p className="text-[10px] text-slate-500">
            {porMunicipio.length} {porMunicipio.length === 1 ? 'municÃ­pio' : 'municÃ­pios'} Â·{' '}
            <span className="text-cyan-300 font-semibold">{formatBRLCompact(total)}</span>
          </p>
        )}
      </div>

      {porMunicipio.length === 0 ? (
        <p className="text-xs text-slate-500 text-center py-6">
          Nenhuma emenda com municÃ­pio identificado em {ano}.
          <br />
          <span className="text-slate-600 text-[10px]">
            (emendas com destino &ldquo;Nacional&rdquo; ou &ldquo;UF&rdquo; nÃ£o aparecem aqui)
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
                    {formatBRLCompact(m.total)}
                  </span>
                </div>
                {/* Chips de Ã¡reas */}
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
                : `Ver todos os ${porMunicipio.length} municÃ­pios`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// Lista de municÃ­pios que receberam TransferÃªncia Especial (Pix) do parlamentar.
// Aparece quando as emendas originais foram cadastradas a nÃ­vel UF e o destino
// real sÃ³ foi resolvido depois via repasse Pix (modalidade EC 105/2019).
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
        background: 'linear-gradient(135deg, rgba(168,85,247,0.06), rgba(7,29,54,0.5))',
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
          <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">
            MunicÃ­pios que receberam Pix em {ano}
          </p>
        </div>
        <p className="text-[10px] text-slate-500">
          {pixPorMunicipio.length} {pixPorMunicipio.length === 1 ? 'municÃ­pio' : 'municÃ­pios'} Â·{' '}
          <span className="text-violet-300 font-semibold">{formatBRLCompact(pixTotal)}</span>
        </p>
      </div>

      <p className="text-[10px] text-slate-500 italic mb-3 leading-snug">
        TransferÃªncias Especiais (EC 105/2019) â€” destinos reais dos repasses Pix do parlamentar
        quando a emenda original foi cadastrada sÃ³ a nÃ­vel UF.
      </p>

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
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-[10px] font-bold text-slate-500 w-5 flex-shrink-0">{i + 1}.</span>
                <span className="text-white text-sm font-semibold truncate group-hover:text-violet-300 transition-colors">
                  {m.nome}
                </span>
                {m.uf && (
                  <span className="text-[10px] text-slate-500 flex-shrink-0">/ {m.uf}</span>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-violet-300 font-bold text-sm whitespace-nowrap">{formatBRLCompact(m.total)}</p>
                <p className="text-[10px] text-slate-500">
                  {m.qtd} {m.qtd === 1 ? 'transferÃªncia' : 'transferÃªncias'}
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
            : `Ver todos os ${pixPorMunicipio.length} municÃ­pios`}
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
  // Cada card mostra UMA Ã¡rea literal (mesmo critÃ©rio do donut acima).
  // O card "OUTRAS ÃREAS" soma tudo que nÃ£o Ã© SaÃºde/EducaÃ§Ã£o/SeguranÃ§a â€”
  // legendado como tal pra evitar confusÃ£o com a Ã¡rea literal "OUTROS".
  const principais: EmendaArea[] = ['SAUDE', 'EDUCACAO', 'SEGURANCA', 'OUTROS'];

  const principaisSomadas: { area: EmendaArea; label: string; atual: number; anterior: number }[] =
    principais.map((area) => {
      if (area === 'OUTROS') {
        // "Outras Ã¡reas" â€” agrega tudo que nÃ£o Ã© uma das 3 principais
        const principaisSet = new Set<EmendaArea>(['SAUDE', 'EDUCACAO', 'SEGURANCA']);
        const atual = areasAtual.reduce((s, a) => s + (principaisSet.has(a.area) ? 0 : a.total), 0);
        const anterior = Array.from(areasAnterior.entries()).reduce(
          (s, [k, v]) => s + (principaisSet.has(k as EmendaArea) ? 0 : v),
          0,
        );
        return { area, label: 'Outras Ã¡reas', atual, anterior };
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
          Comparativo por Ãrea
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
              title={area === 'OUTROS' ? 'Soma de AssistÃªncia Social, Transporte, Cultura, Esporte e outras Ã¡reas que nÃ£o sÃ£o SaÃºde, EducaÃ§Ã£o ou SeguranÃ§a' : undefined}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}>
                  <Landmark className="w-4 h-4" />
                </div>
                <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color }}>
                  {label}
                </span>
              </div>
              <p className="text-white font-bold text-lg">{formatBRLCompact(atual)}</p>
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
      className="rounded-2xl px-5 py-2.5 flex items-center gap-5 flex-wrap"
      style={{
        background: 'linear-gradient(135deg, rgba(201,162,39,0.07) 0%, rgba(7,29,54,0.6) 60%, rgba(74,158,222,0.05) 100%)',
        border: '1px solid rgba(201,162,39,0.18)',
        boxShadow: '0 2px 16px rgba(0,0,0,0.25)',
      }}
    >
      {/* Label */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <Trophy className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#e8c660' }} />
        <p className="text-[9px] uppercase tracking-widest font-bold text-amber-300/70 whitespace-nowrap">
          Destaque {ano} Â· {stateName}
        </p>
      </div>

      {/* Divider */}
      <div className="w-px h-6 flex-shrink-0" style={{ background: 'rgba(255,255,255,0.08)' }} />

      <div className="flex items-center gap-3 flex-wrap flex-1">
        {/* Top municÃ­pio */}
        <div
          className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, rgba(6,182,212,0.08), rgba(6,182,212,0.03))',
            border: '1px solid rgba(6,182,212,0.2)',
          }}
        >
          <div className="flex flex-col leading-tight">
            <span className="text-[8px] uppercase tracking-widest font-semibold text-cyan-400/60">MunicÃ­pio</span>
            <span className="text-white font-bold text-[13px] truncate max-w-[150px] leading-tight">{municipio.nome}</span>
          </div>
          <div
            className="px-2 py-0.5 rounded-lg"
            style={{ background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.25)' }}
          >
            <span className="text-cyan-300 font-bold text-[11px] whitespace-nowrap">{formatBRLCompact(municipio.total)}</span>
          </div>
        </div>

        {/* Top parlamentar */}
        {topParlamentar && (
          <div
            className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, rgba(201,162,39,0.08), rgba(201,162,39,0.03))',
              border: '1px solid rgba(201,162,39,0.2)',
            }}
          >
            <div className="flex flex-col leading-tight">
              <span className="text-[8px] uppercase tracking-widest font-semibold text-amber-300/60">Parlamentar</span>
              <div className="flex items-center gap-1.5">
                <span className="text-white font-bold text-[13px] truncate max-w-[180px] leading-tight">{topParlamentar.nome}</span>
                <span className="text-[9px] text-slate-500 whitespace-nowrap hidden sm:block">
                  {CARGO_LABELS[topParlamentar.cargo as ParlamentarCargo] ?? topParlamentar.cargo}
                  {topParlamentar.partido ? ` Â· ${topParlamentar.partido}` : ''}
                </span>
              </div>
            </div>
            <div
              className="px-2 py-0.5 rounded-lg"
              style={{ background: 'rgba(201,162,39,0.15)', border: '1px solid rgba(201,162,39,0.25)' }}
            >
              <span className="text-amber-300 font-bold text-[11px] whitespace-nowrap">{formatBRLCompact(topParlamentar.total)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

