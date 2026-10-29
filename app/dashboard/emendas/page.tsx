'use client';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import dynamic from 'next/dynamic';
import { Landmark, Loader2, Building2, Search, ChevronRight, ChevronDown, Globe, X, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ESTADOS_BRASIL } from '@/lib/types';
import { PERMISSIONS, hasPermission } from '@/lib/permissions';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { AREA_LABELS, AREA_COLORS, formatBRLCompact, type EmendaArea, type ParlamentarCargo } from '@/lib/portal-transparencia';
import { UFS_ESTADUAIS_ATIVAS, ufSoValorDestinado, ufTemEstaduais } from '@/lib/emendas/estados-ativos';
import { PortalEmenda, TransferenciaPix, PortalParlamentar, DestinoRow, MunicipioStats, ResumoEstado, ANOS_DISPONIVEIS, ANO_PADRAO, TEXTOS_BALAO_BRASIL } from './_partes/tipos';
import { cargoExibicao, ResumoGeralCard, EmendasPorAreaCard, SelecionarEstadoCard, Top5ParlamentaresDoMunicipioCard, Top5ParlamentaresEstadoCard, Top5MunicipiosCard, MunicipioPopup, LegendaCores, ParlamentarDashboard, ComparativoAreasCard, DestaqueDoAnoCard } from './_partes/paineis';



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
      <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--acento-azul)' }} />
    </div>
  );
}

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

  // Heatmap Brasil — total empenhado por UF no ano selecionado
  const [brasilHeatmap, setBrasilHeatmap] = useState<Record<string, number>>({});
  const [loadingHeatmap, setLoadingHeatmap] = useState(false);

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
  const [parlamentarDropOpen, setParlamentarDropOpen] = useState(false);
  const [municipioQuery, setMunicipioQuery] = useState('');
  const [municipioResults, setMunicipioResults] = useState<Array<{ codigoIbge: string; nome: string }>>([]);
  const [municipioDropOpen, setMunicipioDropOpen] = useState(false);
  const [selectedParlamentar, setSelectedParlamentar] = useState<PortalParlamentar | null>(null);
  // Textos do balão novo dos mapas: aqui o valor é dinheiro em emendas.
  const textosBalaoEstado = useMemo(() => ({
    sobre: 'Município',
    valor: selectedParlamentar ? `de ${selectedParlamentar.nome.split(' ')[0]}` : 'em emendas',
    total: selectedParlamentar ? 'das emendas dele no estado' : 'do total no estado',
    semDados: selectedParlamentar ? 'Sem emendas deste parlamentar' : 'Sem emendas',
    dica: 'Clique para ver as emendas do município',
    formatarValor: formatBRLCompact,
  }), [selectedParlamentar]);
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

  // ----- Heatmap Brasil — busca totais por UF sempre que o ano muda -----
  useEffect(() => {
    const ctrl = new AbortController();
    setLoadingHeatmap(true);
    fetch(`/api/emendas-portal/brasil?ano=${ano}`, { signal: ctrl.signal })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.totaisPorUF) setBrasilHeatmap(data.totaisPorUF); })
      .catch(() => {})
      .finally(() => setLoadingHeatmap(false));
    return () => ctrl.abort();
  }, [ano]);

  // ----- Resumo do estado (top municípios, totais por área etc) -----
  const fetchResumo = useCallback(async (uf: string, year: number, signal?: AbortSignal, esferaParam?: string): Promise<ResumoEstado | null> => {
    const esq = esferaParam && esferaParam !== 'TODAS' ? `&esfera=${esferaParam}` : '';
    const res = await fetch(`/api/emendas-portal/resumo?uf=${uf}&ano=${year}${esq}`, { signal });
    if (!res.ok) return null;
    return res.json();
  }, []);

  // Fetch primário — ano atual, controla o overlay de carregamento do mapa.
  useEffect(() => {
    if (view !== 'estado' || !selectedUf) return;
    const ctrl = new AbortController();
    setLoadingResumo(true);
    fetchResumo(selectedUf, ano, ctrl.signal, esfera)
      .then((atual) => {
        if (ctrl.signal.aborted) return;
        setResumo(atual);
        // Auto-seleciona favorito pendente (navegação entre estados)
        const pf = pendingFavoritoRef.current;
        if (pf && pf.uf === selectedUf && pf.ano === ano && atual?.parlamentares) {
          pendingFavoritoRef.current = null;
          const normalizar = (s: string) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
          const alvo = normalizar(pf.candidateName);
          const nomesDe = (p: typeof atual.parlamentares[number]) =>
            [normalizar(p.nomeUrna ?? ''), normalizar(p.nome)].filter(Boolean);
          // 1) igualdade exata
          let found = atual.parlamentares.find((p) => nomesDe(p).includes(alvo));
          // 2) um contém o outro — o nome do cadastro local e o do Portal nem
          //    sempre coincidem ("Alberto Fraga" × "FRAGA"), e sem isso o
          //    deep-link abria o estado certo com o parlamentar em branco.
          if (!found && alvo.length > 2) {
            found = atual.parlamentares.find((p) =>
              nomesDe(p).some((n) => n.includes(alvo) || alvo.includes(n)));
          }
          // 3) todas as palavras do alvo aparecem no nome (ordem indiferente)
          if (!found) {
            const palavras = alvo.split(/\s+/).filter((w) => w.length > 2);
            if (palavras.length > 0) {
              found = atual.parlamentares.find((p) =>
                nomesDe(p).some((n) => palavras.every((w) => n.includes(w))));
            }
          }
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
      .finally(() => { if (!ctrl.signal.aborted) setLoadingResumo(false); });
    return () => ctrl.abort();
  }, [view, selectedUf, ano, esfera, fetchResumo]);

  // Fetch secundário — ano anterior para o comparativo por área.
  // Roda em background sem bloquear o overlay do mapa. Usa o MESMO filtro de
  // esfera do ano atual: sem ele, "federais 2025" era comparado com "federais
  // + estaduais 2024" e todas as áreas apareciam em queda.
  useEffect(() => {
    if (view !== 'estado' || !selectedUf) return;
    const ctrl = new AbortController();
    setResumoAnterior(null);
    fetchResumo(selectedUf, ano - 1, ctrl.signal, esfera)
      .then((anterior) => { if (!ctrl.signal.aborted) setResumoAnterior(anterior); })
      .catch(() => {});
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
      // quando município está selecionado (mesmo filtro de esfera do ano atual).
      fetch(`/api/emendas-portal/municipio/${selectedMunicipio.codigo}/emendas?uf=${selectedUf}&ano=${ano - 1}${esfera !== 'TODAS' ? `&esfera=${esfera}` : ''}`, { signal: ctrl.signal }).then((r) => r.json()),
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

  // ----- Autocomplete município -----
  useEffect(() => {
    const q = municipioQuery.trim().toLowerCase();
    if (q.length < 2 || !resumo?.municipiosLista) {
      setMunicipioResults([]);
      return;
    }
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const qNorm = norm(q);
    setMunicipioResults(resumo.municipiosLista.filter(m => norm(m.nome).includes(qNorm)).slice(0, 15));
  }, [municipioQuery, resumo]);

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

  // Deep-link vindo do chat da Gabi: /dashboard/emendas?uf=DF&ano=2026&parlamentar=...
  // Aplica o mesmo recorte que a Gabi mostrou, em vez de abrir o mapa do Brasil
  // vazio e obrigar o usuário a refazer os filtros. Reaproveita a pendência de
  // favorito: assim que o resumo do estado carrega, o parlamentar é selecionado.
  // Lê de window.location para não exigir um <Suspense> em volta da página.
  const deepLinkAplicadoRef = useRef(false);
  useEffect(() => {
    if (deepLinkAplicadoRef.current) return;
    deepLinkAplicadoRef.current = true;
    const qs = new URLSearchParams(window.location.search);
    const uf = (qs.get('uf') ?? '').toUpperCase();
    const anoParam = Number(qs.get('ano'));
    const parlamentar = qs.get('parlamentar') ?? '';
    const cargo = qs.get('cargo') ?? '';
    const esferaParam = (qs.get('esfera') ?? '').toUpperCase();
    if (!uf && !parlamentar) return;

    const anoAlvo = Number.isFinite(anoParam) && anoParam > 1990 ? anoParam : ANO_PADRAO;
    if (anoAlvo !== ANO_PADRAO) setAno(anoAlvo);
    if (esferaParam === 'FEDERAL' || esferaParam === 'ESTADUAL') setEsfera(esferaParam);

    if (uf && ESTADOS_BRASIL.some((e) => e.sigla === uf)) {
      setSelectedUf(uf);
      setSelectedStateName(ESTADOS_BRASIL.find((e) => e.sigla === uf)?.nome ?? uf);
      setView('estado');
      if (parlamentar) {
        pendingFavoritoRef.current = { candidateName: parlamentar, cargo, uf, ano: anoAlvo };
      }
    }
  }, []);

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
    const map = new Map<string, { tipo: string; total: number; qtd: number; semValor: number }>();
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
      const cur = map.get(tipoCurto) ?? { tipo: tipoCurto, total: 0, qtd: 0, semValor: 0 };
      cur.total += e.valorEmpenhado ?? 0;
      cur.qtd++;
      if (e.semValorPublicado) cur.semValor++;
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

  // Interseção: emendas do parlamentar destinadas ao município selecionado.
  // Usa municipioEmendas (mesma fonte do TOP 5) filtrada ao parlamentar — evita
  // a inconsistência com parlamentarEmendas que filtra por uf e pode excluir
  // emendas onde uf=null mesmo que codigoIbge seja do município correto.
  const parlamentarMunicipioEmendas = useMemo(() => {
    if (!selectedParlamentar || !selectedMunicipio) return [];
    const cpf  = selectedParlamentar.cpf;
    const nome = selectedParlamentar.nome.trim().toUpperCase();
    return municipioEmendas.filter((e) =>
      (cpf && e.autorCpf === cpf) ||
      e.autorNome.trim().toUpperCase() === nome
    );
  }, [selectedParlamentar, selectedMunicipio, municipioEmendas]);

  // Quando município + parlamentar selecionados, filtra destinos flat às emendas
  // que foram destinadas ao município — mantém detalhes dos favorecidos mas evita
  // exibir emendas de outros municípios na tabela.
  const parlamentarMunicipioDestinosFlat = useMemo(() => {
    if (!selectedMunicipio || !selectedParlamentar) return parlamentarDestinosFlat;
    if (parlamentarMunicipioEmendas.length === 0) return [];
    const emendaIds = new Set(parlamentarMunicipioEmendas.map((e) => e.idPortal));
    // Emenda dividida entre cidades: só os destinos DESTA (os sem código são
    // os de emenda de um município só, que já é este).
    return parlamentarDestinosFlat.filter((d) => emendaIds.has(d.codigoEmenda)
      && (!d.codigoIbge || d.codigoIbge === selectedMunicipio.codigo));
  }, [selectedMunicipio, selectedParlamentar, parlamentarMunicipioEmendas, parlamentarDestinosFlat]);

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

  // Dados do parlamentar filtrados ao município — alimentam o ParlamentarDashboard
  // quando município está selecionado, para não exibir totais de SP inteiro.
  const parlamentarMunicipioTotalPago = useMemo(
    () => parlamentarMunicipioEmendas.reduce((s, e) => s + (e.valorPago ?? 0), 0),
    [parlamentarMunicipioEmendas],
  );

  const parlamentarMunicipioPorAno = useMemo(() => {
    if (!selectedMunicipio) return parlamentarPorAno;
    const map = new Map<number, number>();
    parlamentarHistorico
      .filter((e) => e.codigoIbge === selectedMunicipio.codigo)
      .forEach((e) => map.set(e.ano, (map.get(e.ano) ?? 0) + e.valorEmpenhado));
    return Array.from(map.entries())
      .map(([ano, total]) => ({ ano, total }))
      .sort((a, b) => a.ano - b.ano);
  }, [selectedMunicipio, parlamentarHistorico, parlamentarPorAno]);

  const parlamentarMunicipioMaxPorAno = useMemo(
    () => parlamentarMunicipioPorAno.reduce((m, x) => Math.max(m, x.total), 1),
    [parlamentarMunicipioPorAno],
  );

  const parlamentarMunicipioPorTipo = useMemo(() => {
    const map = new Map<string, { tipo: string; total: number; qtd: number; semValor: number }>();
    parlamentarMunicipioEmendas.forEach((e) => {
      const tipo = e.tipo ?? 'Não classificada';
      const tipoCurto =
        tipo.match(/individual/i)   ? 'Individual'
        : tipo.match(/bancada/i)    ? 'Bancada'
        : tipo.match(/comiss[ãa]o/i)? 'Comissão'
        : tipo.match(/relator/i)    ? 'Relator'
        : tipo.match(/especiais?/i) ? 'Transf. Especial'
        : tipo;
      const cur = map.get(tipoCurto) ?? { tipo: tipoCurto, total: 0, qtd: 0, semValor: 0 };
      cur.total += e.valorEmpenhado ?? 0;
      cur.qtd++;
      if (e.semValorPublicado) cur.semValor++;
      map.set(tipoCurto, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [parlamentarMunicipioEmendas]);

  const parlamentarMunicipioDestinosBreakdown = useMemo(() => {
    let municipal = 0; let estadual = 0; let qtdMun = 0; let qtdEst = 0;
    parlamentarMunicipioEmendas.forEach((e) => {
      if (e.codigoIbge) { municipal += e.valorEmpenhado ?? 0; qtdMun++; }
      else { estadual += e.valorEmpenhado ?? 0; qtdEst++; }
    });
    return { municipal, estadual, qtdMun, qtdEst };
  }, [parlamentarMunicipioEmendas]);

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
  if ((status === 'loading' && !session)) {
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

      {/* Estaduais só das UFs de lib/emendas/estados-ativos: nos outros
          estados a esfera "Estadual" fica vazia — e vazio sem explicação
          parece defeito. */}
      {view === 'estado' && esfera === 'ESTADUAL' && selectedUf && !ufTemEstaduais(selectedUf) && (
        <div className="rounded-xl px-4 py-3 text-xs"
          style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
          As emendas estaduais de {selectedStateName} ainda não estão disponíveis no sistema — não há fonte oficial
          que traga deputado, cidade e valores. Hoje temos as emendas estaduais de {UFS_ESTADUAIS_ATIVAS.join(', ')};
          as federais aparecem para todos os estados.
        </div>
      )}
      {view === 'estado' && esfera !== 'FEDERAL' && ufSoValorDestinado(selectedUf) && (
        <div className="rounded-xl px-4 py-3 text-xs"
          style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
          O governo de {selectedStateName} publica só o <strong>valor destinado</strong> de cada emenda estadual — não
          publica o empenho nem o pagamento por emenda. Nas estaduais de {selectedStateName}, o valor mostrado é o
          destinado pelo deputado; as federais trazem empenhado e pago normalmente.
        </div>
      )}

      {/* Barra de pesquisa de parlamentar — abaixo do título, visível quando há estado selecionado */}
      {view === 'estado' && (
        <div className="relative">
          {/* As duas linhas de busca quebram no celular: esfera, campo e a
              etiqueta do escolhido lado a lado passavam de 380px, e com um
              parlamentar escolhido o campo de busca sumia e a linha saía da tela. */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Toggle de esfera */}
            <div className="flex rounded-xl overflow-hidden flex-shrink-0" style={{ border: '1px solid var(--border-default)', background: 'var(--bg-card-subtle)' }}>
              {(['TODAS', 'FEDERAL', 'ESTADUAL'] as const).map((e) => (
                <button
                  key={e}
                  onClick={() => { setEsfera(e); setParlamentarDropOpen(false); setMunicipioDropOpen(false); }}
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
            <div className="relative flex-1 min-w-[12rem]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-500" />
              <input
                value={parlamentarQuery}
                onChange={(e) => { setParlamentarQuery(e.target.value); setParlamentarDropOpen(true); }}
                onFocus={() => { if (parlamentarQuery.length >= 2) setParlamentarDropOpen(true); }}
                placeholder="Pesquisar parlamentar…"
                className="w-full rounded-xl pl-10 pr-4 py-2.5 text-sm text-[color:var(--text-primary)] placeholder:text-[color:var(--text-tertiary)] outline-none transition-colors"
                style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--border-default)' }}
              />
            </div>
            {selectedParlamentar && (
              <div
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl flex-shrink-0 max-w-full"
                style={{ background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.3)' }}
              >
                <span className="text-xs text-[color:var(--text-primary)] font-semibold truncate min-w-0 sm:max-w-[160px]">{selectedParlamentar.nome}</span>
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
          {/* OU + busca de município */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2">
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="h-px w-6" style={{ background: 'var(--border-default)' }} />
              <span className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: 'var(--text-tertiary)' }}>OU</span>
              <div className="h-px w-6" style={{ background: 'var(--border-default)' }} />
            </div>
            <div className="relative flex-1 min-w-[12rem]">
              <Building2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-500" />
              <input
                value={municipioQuery}
                onChange={(e) => { setMunicipioQuery(e.target.value); setMunicipioDropOpen(true); }}
                onFocus={() => { if (municipioQuery.length >= 2) setMunicipioDropOpen(true); }}
                placeholder="Município…"
                className="w-full rounded-xl pl-10 pr-4 py-2.5 text-sm text-[color:var(--text-primary)] placeholder:text-[color:var(--text-tertiary)] outline-none transition-colors"
                style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--border-default)' }}
              />
            </div>
            {selectedMunicipio && (
              <div
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl flex-shrink-0 max-w-full"
                style={{ background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.3)' }}
              >
                <span className="text-xs text-[color:var(--text-primary)] font-semibold truncate min-w-0 sm:max-w-[160px]">{selectedMunicipio.nome}</span>
                <button onClick={() => setSelectedMunicipio(null)} className="text-slate-600 dark:text-slate-400 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
          {/* Chips de favoritos — abaixo das duas barras para não deslocar o layout */}
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
          {parlamentarDropOpen && parlamentarQuery.length >= 2 && parlamentarResults.length > 0 && (
            <div
              className="absolute top-full left-0 right-0 mt-1 z-[600] rounded-xl overflow-hidden"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-raised)' }}
            >
              {parlamentarResults.map((p) => (
                <button
                  key={p.idPortal}
                  onClick={() => { setSelectedParlamentar(p); setParlamentarQuery(''); setParlamentarResults([]); setParlamentarDropOpen(false); }}
                  className="w-full text-left px-4 py-2.5 hover:bg-[var(--tint-06)] transition-colors border-b border-[var(--tint-06)] last:border-0"
                >
                  <p className="text-sm text-[color:var(--text-primary)] font-medium">{p.nome}</p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">{cargoExibicao(p.nome, p.cargo)}{p.partido ? ` · ${p.partido}` : ''}</p>
                </button>
              ))}
            </div>
          )}
          {municipioDropOpen && municipioQuery.length >= 2 && municipioResults.length > 0 && (
            <div
              className="absolute top-full left-0 right-0 mt-1 z-[600] rounded-xl overflow-hidden"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-raised)' }}
            >
              {municipioResults.map((m) => (
                <button
                  key={m.codigoIbge}
                  onClick={() => { handleMunicipioClick(m.codigoIbge, m.nome); setMunicipioQuery(''); setMunicipioResults([]); setMunicipioDropOpen(false); }}
                  className="w-full text-left px-4 py-2.5 hover:bg-[var(--tint-06)] transition-colors border-b border-[var(--tint-06)] last:border-0"
                >
                  <p className="text-sm text-[color:var(--text-primary)] font-medium">{m.nome}</p>
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
      <div className="grid grid-cols-12 gap-4 min-w-0">
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
            soValorDestinado={esfera === 'ESTADUAL' && ufSoValorDestinado(selectedUf)}
            parlamentarMunicipioTotal={
              selectedMunicipio && selectedParlamentar
                ? parlamentarMunicipioEmendas.reduce((s, e) => s + (e.valorEmpenhado ?? 0), 0)
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
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}
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
                style={{ background: 'var(--modal-backdrop)', backdropFilter: 'blur(3px)' }}
              >
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-10 w-10 animate-spin" style={{ color: 'var(--acento-azul)' }} />
                  <span className="text-sm font-medium" style={{ color: 'var(--tint-75)' }}>
                    Carregando dados…
                  </span>
                </div>
              </div>
            )}

            {view === 'brasil' && (
              <BrazilMap
                balaoPremium textosBalao={TEXTOS_BALAO_BRASIL}
                onStateClick={handleStateClick}
                darkMode={isDarkTheme}
                highlightedStates={Object.keys(brasilHeatmap).length > 0 ? brasilHeatmap : undefined}
                formatValue={(v) => {
                  if (v >= 1_000_000_000) return `R$ ${(v / 1_000_000_000).toFixed(1)}Bi`;
                  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
                  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
                  return `R$ ${v.toLocaleString('pt-BR')}`;
                }}
                emptyLabel="Clique para ver emendas"
              />
            )}
            {view === 'estado' && selectedUf && (
              <StateMap
                balaoPremium textosBalao={textosBalaoEstado}
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
                choropleth
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
                <p className="text-[10px] uppercase tracking-widest font-bold text-[color:var(--text-tertiary)] mb-1.5">Valor de Emendas (R$)</p>
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
          escopo={selectedMunicipio ? selectedMunicipio.nome : selectedStateName}
          loading={loadingParlamentar}
          totalAno={selectedMunicipio
            ? parlamentarMunicipioEmendas.reduce((s, e) => s + (e.valorEmpenhado ?? 0), 0)
            : parlamentarTotalAno}
          totalPago={selectedMunicipio ? parlamentarMunicipioTotalPago : parlamentarTotalPago}
          porArea={selectedMunicipio
            ? parlamentarMunicipioAreasAtual.map((a) => ({
                name:  AREA_LABELS[a.area],
                value: Math.round(a.total),
                color: AREA_COLORS[a.area] ?? '#94a3b8',
                area:  a.area,
              }))
            : parlamentarPorArea}
          porAno={selectedMunicipio ? parlamentarMunicipioPorAno : parlamentarPorAno}
          maxPorAno={selectedMunicipio ? parlamentarMunicipioMaxPorAno : maxParlamentarPorAno}
          porMunicipio={parlamentarPorMunicipio}
          porTipo={selectedMunicipio ? parlamentarMunicipioPorTipo : parlamentarPorTipo}
          destinos={selectedMunicipio ? parlamentarMunicipioDestinosBreakdown : parlamentarDestinos}
          destinosFlat={parlamentarMunicipioDestinosFlat}
          emendas={selectedMunicipio ? parlamentarMunicipioEmendas : parlamentarEmendas}
          pixPorMunicipio={parlamentarPixPorMunicipio}
          pixTotal={parlamentarPixTotal}
          onMunicipioClick={(m) => setSelectedMunicipio({ codigo: m.codigoIbge, nome: m.nome })}
        />
      )}

    </div>
  );
}