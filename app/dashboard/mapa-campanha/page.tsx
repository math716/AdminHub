'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { ESTADOS_BRASIL } from '@/lib/types';
import { hasBairrosPoligonos } from '@/lib/geojson-manifest';
import { PERMISSIONS, hasPermission } from '@/lib/permissions';
import { Painel, CampoFiltro, ChipFiltro, Trilha, BarraSimples, Avatar, comAlfa } from '@/components/mapa/comparacao-visual';
import { CabecalhoProjecao, Indicador, PainelCenarios, LinhaMunicipio, AnaliseProjecao } from '@/components/mapa-campanha/projecao-visual';
import { CampoBusca, CartaoProjecaoSalva, corDoCargo, rotuloCargo, type ResumoProjecaoSalva } from '@/components/mapa-campanha/visual';
import { BotaoPrincipal, BotaoSecundario, CartaoMetaCenario, CLASSE_CAMPO, ESTILO_CAMPO, Interruptor, SecaoJanela, SeletorPrioridade } from '@/components/mapa-campanha/janelas-visual';
import { Map, Target, Search, BarChart3, MapPin, Plus, Trash2, CheckCircle, ArrowDown, Loader2, Gauge, Rocket, Shield, Handshake, Users, UserCheck, Vote, Home, Building2, TrendingUp, Pencil, Eye, EyeOff, Layers, Maximize2, Minimize2, ArrowLeft } from 'lucide-react';
import { dfZonaMunicipioKey, isDfZona, getZonaNumber, dfRegiaoKey, isDfRegiao, getRegiaoNome, spDistritoKey, isSpDistrito, getDistritoNome, rjBairroKey, isRjBairro, getRjBairroNome, ceBairroKey, isCeBairro, getCeBairroNome, isMgBairro, getMgBairroNome, MG_MUNICIPIOS_COM_BAIRROS, munBairroKey, isMunBairro, getMunBairroNome, SP_ZONA_DISTRITO_MAP, DF_ZONA_RA_MAP, RJ_ZONA_BAIRRO_MAP, CE_ZONA_BAIRRO_MAP } from './_partes/regioes';
import { CenarioType, FiltroTipo, VisualizacaoMapa, TipoParceria, TIPO_PARCERIA_LABELS, Parceria, ParceriasStats, CandidatoMultiplo, ProjecaoMunicipio, Projecao, ElectoralData, VotoZona, BairroInfo, proximaEleicao, anosNovoCandidato } from './_partes/tipos';



const StateMap = dynamic(() => import('@/components/maps/state-map'), { ssr: false });
const MunicipioMap = dynamic(() => import('@/components/maps/municipio-map'), { ssr: false });
const ZonaPinsMap = dynamic(() => import('@/components/maps/zona-pins-map'), { ssr: false });
const DfRegioesMap   = dynamic(() => import('@/components/maps/df-regioes-map'),   { ssr: false });
const SpDistritosMap = dynamic(() => import('@/components/maps/sp-distritos-map'), { ssr: false });
const RjBairrosMap   = dynamic(() => import('@/components/maps/rj-bairros-map'),   { ssr: false });
const CeBairrosMap   = dynamic(() => import('@/components/maps/ce-bairros-map'),   { ssr: false });
const MgBairrosMap          = dynamic(() => import('@/components/maps/mg-bairros-map'),          { ssr: false });
const BairrosPoligonosMap   = dynamic(() => import('@/components/maps/bairros-poligonos-map'),   { ssr: false });

export default function MapaCampanhaPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const userRole = (session?.user as any)?.role;
  const userPermissions = (session?.user as any)?.permissions ?? [];
  const canAccess = hasPermission({ role: userRole, permissions: userPermissions }, PERMISSIONS.PROJETO_CAMPANHA);

  useEffect(() => {
    if (status === 'authenticated' && !canAccess) {
      router.push('/dashboard');
    }
  }, [status, canAccess, router]);

  // Search states
  const [candidateName, setCandidateName] = useState('');
  const [ano, setAno] = useState('2022');
  const [uf, setUf] = useState('SP');
  // Candidato da pesquisa: a projeção é sempre a próxima eleição do mesmo
  // cargo (ano municipal → prefeito/vereador; ano geral → deputado, senador,
  // governador, presidente). Outro cargo = "Novo candidato", que fica no ano
  // escolhido lá e nunca é trocado.
  const [anoProjecao, setAnoProjecao] = useState(() => String(proximaEleicao(2022)));
  const escolherAnoBase = (valor: string) => {
    setAno(valor);
    setAnoProjecao(String(proximaEleicao(Number(valor))));
  };
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingParceria, setSavingParceria] = useState(false);

  // Data states
  const [electoralData, setElectoralData] = useState<ElectoralData | null>(null);
  const [projecao, setProjecao] = useState<Projecao | null>(null);
  const [projecoesSalvas, setProjecoesSalvas] = useState<Projecao[]>([]);
  const [buscaProjecoes, setBuscaProjecoes] = useState('');
  const [formCollapsed, setFormCollapsed] = useState(false);

  const voltarParaPesquisa = () => {
    setElectoralData(null);
    setProjecao(null);
    setFormCollapsed(false);
  };

  // Cenário and filter states
  const [cenarioAtivo, setCenarioAtivo] = useState<CenarioType>('possivel');
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('todos');

  // Parcerias states
  const [parcerias, setParcerias] = useState<Parceria[]>([]);
  const [pendingParcerias, setPendingParcerias] = useState<Parceria[]>([]);
  const [parceriasStats, setParceriasStats] = useState<ParceriasStats | null>(null);
  const [showParceriaModal, setShowParceriaModal] = useState(false);
  const [confirmRemoveMun, setConfirmRemoveMun] = useState<string | null>(null);
  const [confirmDeleteParceria, setConfirmDeleteParceria] = useState<string | null>(null);
  const [includeParcerias, setIncludeParcerias] = useState(true); // Toggle para simulação
  const [selectedParceria, setSelectedParceria] = useState<Parceria | null>(null);
  const [parceriaForm, setParceriaForm] = useState<Partial<Parceria>>({
    nome: '',
    tipo: 'LIDERANCA',
    responsavel: '',
    contato: '',
    observacoes: '',
    impactoEstimado: 0,
    metaConservadora: 0,
    metaPossivel: 0,
    metaArrojada: 0,
    ativa: true
  });
  const [municipioParaParceria, setMunicipioParaParceria] = useState<string>('');
  const [bairroParaParceria, setBairroParaParceria] = useState<string>('');

  // View states
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState<'historico' | 'projecao'>('historico');
  const [showModal, setShowModal] = useState(false);
  const [selectedMapMunicipio, setSelectedMapMunicipio] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchMunicipio, setSearchMunicipio] = useState('');
  const [selectedMunicipio, setSelectedMunicipio] = useState<{
    nome: string;
    votosBase: number;
    metaConservadora: number;
    metaPossivel: number;
    metaArrojada: number;
    dobradaAtiva?: boolean;
    dobradaNome?: string;
    dobradaPartido?: string;
    dobradaObservacoes?: string;
  } | null>(null);

  // Edit modal states
  const [metaConservadoraTemp, setMetaConservadoraTemp] = useState<number>(0);
  const [metaPossivelTemp, setMetaPossivelTemp] = useState<number>(0);
  const [metaArrojadaTemp, setMetaArrojadaTemp] = useState<number>(0);
  const [prioridadeTemp, setPrioridadeTemp] = useState<string>('MEDIA');
  const [dobradaAtivaTemp, setDobradaAtivaTemp] = useState<boolean>(false);
  const [dobradaNomeTemp, setDobradaNomeTemp] = useState<string>('');
  const [dobradaPartidoTemp, setDobradaPartidoTemp] = useState<string>('');
  const [dobradaObservacoesTemp, setDobradaObservacoesTemp] = useState<string>('');

  // Add new municipality states
  const [novoMunicipioNome, setNovoMunicipioNome] = useState('');
  const [novoMetaConservadora, setNovoMetaConservadora] = useState<number>(0);
  const [novoMetaPossivel, setNovoMetaPossivel] = useState<number>(0);
  const [novoMetaArrojada, setNovoMetaArrojada] = useState<number>(0);
  const [novoMunicipioPrioridade, setNovoMunicipioPrioridade] = useState('MEDIA');
  const [municipiosDisponiveis, setMunicipiosDisponiveis] = useState<string[]>([]);
  const [filtroMunicipios, setFiltroMunicipios] = useState('');

  // Modal de seleção de candidatos múltiplos
  const [showCandidatoModal, setShowCandidatoModal] = useState(false);
  const [candidatosMultiplos, setCandidatosMultiplos] = useState<CandidatoMultiplo[]>([]);
  const [mensagemMultiplos, setMensagemMultiplos] = useState('');

  // Modal — confirmação de exclusão de projeção
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [projecaoParaExcluir, setProjecaoParaExcluir] = useState<{ id: string; nome: string } | null>(null);

  // Modal — novo candidato sem histórico eleitoral
  const [showNovoCandidatoModal, setShowNovoCandidatoModal] = useState(false);
  const [novoCandidatoNome, setNovoCandidatoNome] = useState('');
  const [novoCandidatoPartido, setNovoCandidatoPartido] = useState('');
  const [novoCandidatoCargo, setNovoCandidatoCargo] = useState('DEPUTADO_FEDERAL');
  const [novoCandidatoUf, setNovoCandidatoUf] = useState('SP');
  const [novoCandidatoAnoProjecao, setNovoCandidatoAnoProjecao] = useState(() => anosNovoCandidato('DEPUTADO_FEDERAL')[0]);
  const [novoCandidatoMunicipio, setNovoCandidatoMunicipio] = useState('');
  const [novoCandidatoMunicipioFiltro, setNovoCandidatoMunicipioFiltro] = useState('');
  const [novoCandidatoMunicipioOpcoes, setNovoCandidatoMunicipioOpcoes] = useState<string[]>([]);

  // Visualização por zona eleitoral e bairro (para vereadores)
  const [visualizacaoMapa, setVisualizacaoMapa] = useState<VisualizacaoMapa>('municipio');
  const [votosPorZona, setVotosPorZona] = useState<Record<string, { total: number; zonas: VotoZona[] }>>({});
  // Dados de bairros para vereadores
  const [bairrosInfo, setBairrosInfo] = useState<BairroInfo[]>([]);
  const [mediaVotosBairro, setMediaVotosBairro] = useState<number>(0);
  const [selectedBairro, setSelectedBairro] = useState<BairroInfo | null>(null);
  const [showBairroModal, setShowBairroModal] = useState(false);
  const [municipioVereador, setMunicipioVereador] = useState<string>('');

  // Zonas eleitorais do DF
  const [dfZonas, setDfZonas] = useState<import('@/components/maps/zona-pins-map').ZonaPinData[]>([]);
  const [dfBounds, setDfBounds] = useState<{ minLat: number; maxLat: number; minLng: number; maxLng: number; centerLat: number; centerLng: number } | null>(null);
  const [selectedDfZona, setSelectedDfZona] = useState<number | null>(null);
  const [loadingDfZonas, setLoadingDfZonas] = useState(false);
  const dfZonasCandidatoRef = useRef<string | null>(null);

  // Regiões administrativas do DF
  const [selectedDfRegiao, setSelectedDfRegiao] = useState<string | null>(null);
  const [dfVisualizacao, setDfVisualizacao] = useState<'regioes' | 'zonas'>('regioes');
  const [dfRegioesVotes, setDfRegioesVotes] = useState<Record<string, number>>({});

  // Distritos municipais de São Paulo
  const [spVisualizacao, setSpVisualizacao] = useState<'municipios' | 'distritos'>('municipios');
  const [selectedSpDistrito, setSelectedSpDistrito] = useState<string | null>(null);
  const [spDistritosVotes, setSpDistritosVotes] = useState<Record<string, number>>({});

  // Bairros do Rio de Janeiro capital
  const [rjVisualizacao, setRjVisualizacao] = useState<'municipios' | 'bairros'>('municipios');
  const [selectedRjBairro, setSelectedRjBairro] = useState<string | null>(null);
  const [rjBairrosVotes, setRjBairrosVotes] = useState<Record<string, number>>({});

  // Bairros de Fortaleza (CE)
  const [ceVisualizacao, setCeVisualizacao] = useState<'municipios' | 'bairros'>('municipios');
  const [selectedCeBairro, setSelectedCeBairro] = useState<string | null>(null);
  const [ceBairrosVotes, setCeBairrosVotes] = useState<Record<string, number>>({});

  // Bairros de municípios de MG (IBGE CD2022)
  const [mgVisualizacao, setMgVisualizacao] = useState<'municipios' | 'bairros'>('municipios');
  const [mgBairrosMunicipio, setMgBairrosMunicipio] = useState<string>('');
  const [selectedMgBairro, setSelectedMgBairro] = useState<string | null>(null);
  const [mgBairrosVotes, setMgBairrosVotes] = useState<Record<string, number>>({});

  // Bairros genéricos via polígonos IBGE (todos os estados com GeoJSON exceto MG)
  const [genPoligonosMunicipio, setGenPoligonosMunicipio] = useState<string>('');
  const [genPoligonosUf, setGenPoligonosUf] = useState<string>('');
  const [selectedGenBairro, setSelectedGenBairro] = useState<string | null>(null);
  const [genBairrosApiVotes, setGenBairrosApiVotes] = useState<Record<string, number>>({});


  // Agrega votos por zona do candidato → Regiões Administrativas do DF
  useEffect(() => {
    if (uf !== 'DF' || !electoralData) { setDfRegioesVotes({}); return; }
    const zonas = electoralData.zonas ?? [];
    if (zonas.length === 0) { setDfRegioesVotes({}); return; }
    const raVotes: Record<string, number> = {};
    for (const z of zonas) {
      const raMap = DF_ZONA_RA_MAP[z.zona];
      if (!raMap || !z.votos) continue;
      for (const [ra, frac] of Object.entries(raMap)) {
        raVotes[ra] = (raVotes[ra] ?? 0) + Math.round(z.votos * frac);
      }
    }
    setDfRegioesVotes(raVotes);
  }, [uf, electoralData]);

  // Agrega votos por zona do candidato → Distritos Municipais de SP capital
  useEffect(() => {
    if (uf !== 'SP' || !electoralData) { setSpDistritosVotes({}); return; }
    const zonas = electoralData.zonas ?? [];
    if (zonas.length === 0) { setSpDistritosVotes({}); return; }
    const distVotes: Record<string, number> = {};
    for (const z of zonas) {
      if (z.municipio !== 'SAO PAULO') continue;
      const distMap = SP_ZONA_DISTRITO_MAP[z.zona];
      if (!distMap || !z.votos) continue;
      for (const [dist, frac] of Object.entries(distMap)) {
        distVotes[dist] = (distVotes[dist] ?? 0) + Math.round(z.votos * frac);
      }
    }
    setSpDistritosVotes(distVotes);
  }, [uf, electoralData]);

  // Agrega votos por zona do candidato → Bairros do Rio de Janeiro capital
  useEffect(() => {
    if (uf !== 'RJ' || !electoralData) { setRjBairrosVotes({}); return; }
    const zonas = electoralData.zonas ?? [];
    if (zonas.length === 0) { setRjBairrosVotes({}); return; }
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    const bairroVotes: Record<string, number> = {};
    for (const z of zonas) {
      if (norm(z.municipio) !== 'RIO DE JANEIRO') continue;
      const bairroMap = RJ_ZONA_BAIRRO_MAP[z.zona];
      if (!bairroMap || !z.votos) continue;
      for (const [bairro, frac] of Object.entries(bairroMap)) {
        bairroVotes[bairro] = (bairroVotes[bairro] ?? 0) + Math.round(z.votos * frac);
      }
    }
    setRjBairrosVotes(bairroVotes);
  }, [uf, electoralData]);

  // Agrega votos de bairros de Fortaleza usando CE_ZONA_BAIRRO_MAP (igual ao mapa-eleitoral)
  useEffect(() => {
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    if (uf !== 'CE' || !electoralData?.zonas?.length) { setCeBairrosVotes({}); return; }
    const bairroVotes: Record<string, number> = {};
    for (const z of electoralData.zonas) {
      if (norm(z.municipio) !== 'FORTALEZA') continue;
      const bairroMap = CE_ZONA_BAIRRO_MAP[z.zona];
      if (!bairroMap || !z.votos) continue;
      for (const [bairro, frac] of Object.entries(bairroMap)) {
        bairroVotes[bairro] = (bairroVotes[bairro] ?? 0) + Math.round(z.votos * frac);
      }
    }
    setCeBairrosVotes(bairroVotes);
  }, [uf, electoralData]);

  // Carrega votos P-I-P para MgBairrosMap (fix: antes não populava mgBairrosVotes)
  useEffect(() => {
    if (uf !== 'MG' || !mgBairrosMunicipio) { setMgBairrosVotes({}); return; }
    const params = new URLSearchParams({ municipio: mgBairrosMunicipio, uf: 'MG' });
    if (['2018','2020','2022','2024','2026'].includes(ano) && electoralData?.candidatoId) {
      params.set('candidatoId', electoralData.candidatoId);
      params.set('ano', ano);
    }
    fetch(`/api/tse/bairros-poligonos?${params}`)
      .then(r => r.json())
      .then(data => setMgBairrosVotes(data.bairroVotes ?? {}))
      .catch(() => setMgBairrosVotes({}));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uf, mgBairrosMunicipio, electoralData, ano]);

  // Detecta municípios genéricos com polígonos (todos os estados exceto cidades com mapas específicos)
  useEffect(() => {
    const normMun = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    const isVereadorPrefeito = ['VEREADOR','PREFEITO'].some(c => (electoralData?.cargo ?? '').toUpperCase().includes(c));
    if (!isVereadorPrefeito || !municipioVereador) {
      setGenPoligonosMunicipio('');
      setGenPoligonosUf('');
      return;
    }
    const munNorm = normMun(municipioVereador);
    // Excluir cidades com mapas específicos
    const isEspecial = (uf === 'SP' && munNorm === 'SAO PAULO') ||
                       (uf === 'RJ' && munNorm === 'RIO DE JANEIRO') ||
                       (uf === 'CE' && munNorm === 'FORTALEZA');
    if (isEspecial) { setGenPoligonosMunicipio(''); setGenPoligonosUf(''); return; }
    if (hasBairrosPoligonos(uf, municipioVereador)) {
      setGenPoligonosMunicipio(municipioVereador);
      setGenPoligonosUf(uf);
    } else {
      setGenPoligonosMunicipio('');
      setGenPoligonosUf('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uf, municipioVereador, electoralData]);

  // Sincroniza dfRegioesVotes em entradas DF_REGIAO_ já existentes na projeção
  useEffect(() => {
    if (!Object.keys(dfRegioesVotes).length) return;
    setProjecao(prev => {
      if (!prev) return prev;
      const temRegiao = prev.municipios.some(m => isDfRegiao(m.municipio));
      if (!temRegiao) return prev;
      return {
        ...prev,
        municipios: prev.municipios.map(m => {
          if (!isDfRegiao(m.municipio)) return m;
          const nome = getRegiaoNome(m.municipio);
          const votosBase = dfRegioesVotes[nome] ?? m.votosBase;
          if (m.votosBase === votosBase) return m;
          return {
            ...m,
            votosBase,
            metaConservadora: m.metaConservadora === m.votosBase ? votosBase : m.metaConservadora,
            metaPossivel: m.metaPossivel === m.votosBase ? votosBase : m.metaPossivel,
            metaArrojada: m.metaArrojada === m.votosBase ? votosBase : m.metaArrojada,
          };
        }),
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dfRegioesVotes]);

  // Sincroniza rjBairrosVotes em entradas RJ_BAIRRO_ já existentes na projeção
  useEffect(() => {
    if (!Object.keys(rjBairrosVotes).length) return;
    setProjecao(prev => {
      if (!prev) return prev;
      const temBairro = prev.municipios.some(m => isRjBairro(m.municipio));
      if (!temBairro) return prev;
      return {
        ...prev,
        municipios: prev.municipios.map(m => {
          if (!isRjBairro(m.municipio)) return m;
          const nome = getRjBairroNome(m.municipio);
          const votosBase = rjBairrosVotes[nome] ?? m.votosBase;
          if (m.votosBase === votosBase) return m;
          return {
            ...m,
            votosBase,
            metaConservadora: m.metaConservadora === m.votosBase ? votosBase : m.metaConservadora,
            metaPossivel: m.metaPossivel === m.votosBase ? votosBase : m.metaPossivel,
            metaArrojada: m.metaArrojada === m.votosBase ? votosBase : m.metaArrojada,
          };
        }),
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rjBairrosVotes]);

  // Sincroniza ceBairrosVotes em entradas CE_BAIRRO_ já existentes na projeção
  useEffect(() => {
    if (!Object.keys(ceBairrosVotes).length) return;
    setProjecao(prev => {
      if (!prev) return prev;
      const temBairro = prev.municipios.some(m => isCeBairro(m.municipio));
      if (!temBairro) return prev;
      return {
        ...prev,
        municipios: prev.municipios.map(m => {
          if (!isCeBairro(m.municipio)) return m;
          const nome = getCeBairroNome(m.municipio);
          const votosBase = ceBairrosVotes[nome] ?? m.votosBase;
          if (m.votosBase === votosBase) return m;
          return {
            ...m,
            votosBase,
            metaConservadora: m.metaConservadora === m.votosBase ? votosBase : m.metaConservadora,
            metaPossivel: m.metaPossivel === m.votosBase ? votosBase : m.metaPossivel,
            metaArrojada: m.metaArrojada === m.votosBase ? votosBase : m.metaArrojada,
          };
        }),
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ceBairrosVotes]);

  // Sincroniza spDistritosVotes em entradas SP_DISTRITO_ já existentes na projeção
  useEffect(() => {
    if (!Object.keys(spDistritosVotes).length) return;
    setProjecao(prev => {
      if (!prev) return prev;
      const temDistrito = prev.municipios.some(m => isSpDistrito(m.municipio));
      if (!temDistrito) return prev;
      return {
        ...prev,
        municipios: prev.municipios.map(m => {
          if (!isSpDistrito(m.municipio)) return m;
          const nome = getDistritoNome(m.municipio);
          const votosBase = spDistritosVotes[nome] ?? m.votosBase;
          if (m.votosBase === votosBase) return m;
          return {
            ...m,
            votosBase,
            metaConservadora: m.metaConservadora === m.votosBase ? votosBase : m.metaConservadora,
            metaPossivel: m.metaPossivel === m.votosBase ? votosBase : m.metaPossivel,
            metaArrojada: m.metaArrojada === m.votosBase ? votosBase : m.metaArrojada,
          };
        }),
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spDistritosVotes]);

  // Calcula votos por bairro para o mapa (formato Record<string, number>)
  const getVotosPorBairroMapa = (): Record<string, number> => {
    const result: Record<string, number> = {};
    bairrosInfo.forEach(b => {
      // Usar nome do bairro em maiúsculas como chave
      result[b.bairro.toUpperCase()] = b.votos;
    });
    return result;
  };

  // Total de votos para cálculo de percentuais
  const getTotalVotosBairros = (): number => {
    return bairrosInfo.reduce((acc, b) => acc + b.votos, 0);
  };

  // Load saved projections — de novo a cada volta para a lista: o cartão mostra
  // a meta com parcerias, que podem ter mudado enquanto a projeção estava aberta.
  const naLista = !electoralData;
  useEffect(() => {
    const loadProjecoes = async () => {
      try {
        const res = await fetch('/api/projecoes');
        if (res.ok) {
          const data = await res.json();
          setProjecoesSalvas(data);
        }
      } catch (error) {
        console.error('Erro ao carregar projeções:', error);
      }
    };
    if (canAccess && naLista) {
      loadProjecoes();
    }
  }, [userRole, naLista]);

  // Força Leaflet a recalcular tamanho ao entrar/sair da tela cheia.
  // Dispara em sequencia para cobrir transicoes CSS e garantir que invalidateSize seja chamado.
  useEffect(() => {
    const interval = setInterval(() => window.dispatchEvent(new Event('resize')), 60);
    const stop = setTimeout(() => {
      clearInterval(interval);
      window.dispatchEvent(new Event('resize'));
    }, 500);
    return () => { clearInterval(interval); clearTimeout(stop); };
  }, [mapFullscreen]);

  // Carrega municípios do IBGE quando o modal de novo candidato muda cargo/UF
  useEffect(() => {
    if (!showNovoCandidatoModal) return;
    const cargoUp = novoCandidatoCargo.toUpperCase();
    if (cargoUp !== 'VEREADOR' && cargoUp !== 'PREFEITO') {
      setNovoCandidatoMunicipioOpcoes([]);
      setNovoCandidatoMunicipio('');
      setNovoCandidatoMunicipioFiltro('');
      return;
    }
    setNovoCandidatoMunicipio('');
    setNovoCandidatoMunicipioFiltro('');
    fetch(`/api/ibge/municipios?uf=${novoCandidatoUf}`)
      .then(r => r.ok ? r.json() : [])
      .then((data: { nome: string }[]) =>
        setNovoCandidatoMunicipioOpcoes(data.map(m => m.nome).sort())
      )
      .catch(() => {});
  }, [novoCandidatoCargo, novoCandidatoUf, showNovoCandidatoModal]);

  const searchCandidate = async (candidatoIdParam?: string) => {
    if (!candidateName.trim() && !candidatoIdParam) return;
    setLoading(true);
    try {
      let url = `/api/tse/candidato?ano=${ano}&uf=${uf}`;
      if (candidatoIdParam) {
        url += `&candidatoId=${candidatoIdParam}`;
      } else {
        url += `&candidato=${encodeURIComponent(candidateName)}`;
      }

      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        toast.error(data?.error || 'Candidato não encontrado');
        setLoading(false);
        return;
      }

      // Se encontrou múltiplos candidatos, mostrar modal de seleção
      if (data?.multiplos) {
        const candidatos = data.candidatos || [];
        if (candidatos.length > 0) {
          setCandidatosMultiplos(candidatos);
          setMensagemMultiplos(data.mensagem || `Encontramos ${candidatos.length} candidatos. Selecione um:`);
          setShowCandidatoModal(true);
          setLoading(false);
        } else {
          toast.error('Nenhum candidato encontrado');
          setLoading(false);
        }
        return;
      }

      // Carregar dados do candidato selecionado
      await loadCandidatoData(data);
    } catch (error) {
      console.error('Erro na busca:', error);
      toast.error('Erro ao buscar candidato');
    } finally {
      setLoading(false);
    }
  };

  // Função para carregar dados do candidato após seleção
  const loadCandidatoData = async (data: any) => {
    setElectoralData(data);
    setFormCollapsed(true);
    setShowCandidatoModal(false);
    
    // Limpar dados anteriores
    setBairrosInfo([]);
    setMediaVotosBairro(0);
    setVotosPorZona({});
    setVisualizacaoMapa('municipio');
    setSpVisualizacao('municipios');
    setSelectedSpDistrito(null);
    setMunicipioVereador('');
    setDfZonas([]);
    setDfBounds(null);
    setSelectedDfZona(null);
    setCeVisualizacao('municipios');
    setSelectedCeBairro(null);
    setMgVisualizacao('municipios');
    setMgBairrosMunicipio('');
    setSelectedMgBairro(null);
    setMgBairrosVotes({});
    setGenPoligonosMunicipio('');
    setGenPoligonosUf('');
    setSelectedGenBairro(null);
    setGenBairrosApiVotes({});

    // Para candidatos do DF: sinaliza para o useEffect carregar as zonas
    if (uf === 'DF') {
      dfZonasCandidatoRef.current = null; // reseta para forçar re-trigger
    }

    // Para candidatos municipais (vereador ou prefeito): focar no município automaticamente
    const cargoUp = (data.cargo ?? '').toUpperCase();
    const isMunicipal = cargoUp.includes('VEREADOR') || cargoUp.includes('PREFEITO');

    // variável local para evitar leitura de estado stale nos fallbacks
    let municipioEncontrado = '';

    if (isMunicipal && data.candidatoId) {
      try {
        // Carregar votos por zona
        const resZona = await fetch(`/api/tse/votos-zona?candidatoId=${data.candidatoId}`);
        if (resZona.ok) {
          const zonasData = await resZona.json();
          setVotosPorZona(zonasData.votosPorMunicipio || {});
        }

        // Carregar votos por bairro
        const resBairro = await fetch(`/api/tse/votos-bairro?candidatoId=${data.candidatoId}`);
        if (resBairro.ok) {
          const bairrosData = await resBairro.json();
          setBairrosInfo(bairrosData.bairrosInfo || []);
          setMediaVotosBairro(bairrosData.mediaVotosBairro || 0);

          if (bairrosData.municipiosUnicos?.length > 0) {
            municipioEncontrado = bairrosData.municipiosUnicos[0];
          } else if (bairrosData.bairrosInfo?.length > 0) {
            municipioEncontrado = bairrosData.bairrosInfo[0].municipio;
          }
        }
      } catch (error) {
        console.error('Erro ao carregar dados de zona/bairro:', error);
      }
    }

    // Fallback: usar votosPorNomeMunicipio se a API de bairros não retornou município
    if (isMunicipal && !municipioEncontrado) {
      const munVotos = data.votosPorNomeMunicipio as Record<string, number> | undefined;
      if (munVotos && Object.keys(munVotos).length > 0) {
        municipioEncontrado = Object.entries(munVotos).sort((a, b) => b[1] - a[1])[0][0];
      }
    }

    if (isMunicipal && municipioEncontrado) {
      setMunicipioVereador(municipioEncontrado);
      setVisualizacaoMapa('municipio');
    }

    // Para candidatos estaduais/federais de CE: carregar votos de Fortaleza por bairro
    if (!isMunicipal && data.candidatoId && (uf === 'CE' || data.uf === 'CE')) {
      try {
        const resBairro = await fetch(`/api/tse/votos-bairro?candidatoId=${data.candidatoId}&municipio=FORTALEZA`);
        if (resBairro.ok) {
          const bairrosData = await resBairro.json();
          setBairrosInfo(bairrosData.bairrosInfo || []);
        }
      } catch (error) {
        console.error('Erro ao carregar votos por bairro CE:', error);
      }
    }

    const nomeCandidato = data.candidateName || data.nome;

    const existingProjecao = projecoesSalvas.find(
      p => p.candidatoNome === nomeCandidato && p.anoBase === parseInt(ano) && p.uf === uf
    );

    if (existingProjecao) {
      setProjecao(existingProjecao);
      // Carregar parcerias da projeção existente
      if (existingProjecao.id) {
        loadParcerias(existingProjecao.id);
      }
    } else {
      // Limpar parcerias para nova projeção
      setParcerias([]);
      setPendingParcerias([]);
      setParceriasStats(null);
      let municipiosData: Record<string, number> = {};
      municipiosData = data.votosPorNomeMunicipio || {};

      const municipios: ProjecaoMunicipio[] = Object.entries(municipiosData).map(
        ([municipio, votos]) => ({
          municipio,
          votosBase: votos as number,
          metaConservadora: votos as number,
          metaPossivel: votos as number,
          metaArrojada: votos as number,
          prioridade: 'MEDIA',
          dobradaAtiva: false
        })
      );

      setProjecao({
        id: '',
        candidatoNome: nomeCandidato,
        anoBase: parseInt(ano),
        anoProjecao: parseInt(anoProjecao),
        uf,
        cargo: data.cargo,
        municipios
      });
    }
  };

  // Função para selecionar candidato do modal
  const selectCandidato = async (candidato: CandidatoMultiplo) => {
    setShowCandidatoModal(false);
    setLoading(true);
    try {
      const res = await fetch(`/api/tse/candidato?ano=${ano}&uf=${uf}&candidatoId=${candidato.id}`);
      const data = await res.json();
      if (res.ok) {
        await loadCandidatoData(data);
      } else {
        toast.error(data?.error || 'Erro ao carregar candidato');
      }
    } catch (error) {
      console.error('Erro ao selecionar candidato:', error);
      toast.error('Erro ao carregar dados do candidato');
    } finally {
      setLoading(false);
    }
  };

  const criarNovoCandidato = () => {
    if (!novoCandidatoNome.trim()) return;
    const cargoUp = novoCandidatoCargo.toUpperCase();
    const isMunicipal = cargoUp === 'VEREADOR' || cargoUp === 'PREFEITO';
    const cargoLabel: Record<string, string> = {
      DEPUTADO_FEDERAL: 'Deputado Federal', DEPUTADO_ESTADUAL: 'Deputado Estadual',
      VEREADOR: 'Vereador', PREFEITO: 'Prefeito',
      SENADOR: 'Senador', GOVERNADOR: 'Governador',
    };
    setElectoralData({
      nome: novoCandidatoNome.trim(),
      nomeUrna: novoCandidatoNome.trim().toUpperCase(),
      partido: novoCandidatoPartido.trim() || 'N/A',
      cargo: novoCandidatoCargo,
      totalVotos: 0,
      uf: novoCandidatoUf,
      votosPorMunicipio: {},
      votosPorNomeMunicipio: {},
      votosPorEstado: {},
    });
    const munNormalized = isMunicipal && novoCandidatoMunicipio ? normMunKey(novoCandidatoMunicipio) : '';
    setProjecao({
      id: '',
      candidatoNome: novoCandidatoNome.trim(),
      anoBase: Number(novoCandidatoAnoProjecao),
      anoProjecao: Number(novoCandidatoAnoProjecao),
      uf: novoCandidatoUf,
      cargo: cargoLabel[novoCandidatoCargo] ?? novoCandidatoCargo,
      municipios: munNormalized ? [{
        municipio: munNormalized,
        votosBase: 0,
        metaConservadora: 0,
        metaPossivel: 0,
        metaArrojada: 0,
        prioridade: 'MEDIA',
        dobradaAtiva: false,
      }] : [],
    });
    setUf(novoCandidatoUf);
    setAno(novoCandidatoAnoProjecao);
    setAnoProjecao(novoCandidatoAnoProjecao);
    setParcerias([]);
    setPendingParcerias([]);
    setParceriasStats(null);
    setActiveTab('projecao');
    setShowNovoCandidatoModal(false);

    // Configura visualização do mapa para candidatos municipais
    if (isMunicipal && novoCandidatoMunicipio) {
      setMunicipioVereador(munNormalized || novoCandidatoMunicipio);
      setVisualizacaoMapa('municipio');
      setBairrosInfo([]);
      setMediaVotosBairro(0);
      if (novoCandidatoUf === 'SP' && munNormalized === 'SAO PAULO') {
        setSpVisualizacao('distritos');
      } else if (novoCandidatoUf === 'RJ' && munNormalized === 'RIO DE JANEIRO') {
        setRjVisualizacao('bairros');
      } else if (novoCandidatoUf === 'CE' && munNormalized === 'FORTALEZA') {
        setCeVisualizacao('bairros');
      } else {
        setSpVisualizacao('municipios');
        setRjVisualizacao('municipios');
        setCeVisualizacao('municipios');
        setMgVisualizacao('municipios');
        setMgBairrosMunicipio('');
      }
    } else {
      setVisualizacaoMapa('municipio');
    }

    // reset form
    setNovoCandidatoNome('');
    setNovoCandidatoPartido('');
    setNovoCandidatoCargo('DEPUTADO_FEDERAL');
    setNovoCandidatoAnoProjecao(anosNovoCandidato('DEPUTADO_FEDERAL')[0]);
    setNovoCandidatoMunicipio('');
    setNovoCandidatoMunicipioFiltro('');
  };

  const saveProjecao = async () => {
    if (!projecao) return;
    setSaving(true);
    try {
      const res = await fetch('/api/projecoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...projecao,
          anoProjecao: parseInt(anoProjecao)
        })
      });
      if (res.ok) {
        const saved = await res.json();
        setProjecao(saved);
        setProjecoesSalvas(prev => {
          const idx = prev.findIndex(p => p.id === saved.id);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = saved;
            return updated;
          }
          return [...prev, saved];
        });

        // Salvar parcerias que estavam pendentes (buffered antes da projeção existir)
        if (pendingParcerias.length > 0) {
          const savedMunicipios: ProjecaoMunicipio[] = saved.municipios ?? [];
          for (const pending of pendingParcerias) {
            const munKey = normMunKey(pending.municipio || '');
            const munData = savedMunicipios.find(m => normMunKey(m.municipio) === munKey);
            if (!munData?.id) continue;
            try {
              await fetch('/api/parcerias', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  projecaoMunicipioId: munData.id,
                  bairro: pending.bairro ?? null,
                  nome: pending.nome,
                  tipo: pending.tipo,
                  responsavel: pending.responsavel ?? null,
                  contato: pending.contato ?? null,
                  observacoes: pending.observacoes ?? null,
                  impactoEstimado: pending.impactoEstimado ?? 0,
                  metaConservadora: pending.metaConservadora ?? 0,
                  metaPossivel: pending.metaPossivel ?? 0,
                  metaArrojada: pending.metaArrojada ?? 0,
                }),
              });
            } catch { /* ignora erro individual — a projeção já foi salva */ }
          }
          setPendingParcerias([]);
          await loadParcerias(saved.id);
        }

        toast.success('Projeção salva com sucesso!');
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error((errData as any)?.error || 'Erro ao salvar projeção');
      }
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar projeção');
    } finally {
      setSaving(false);
    }
  };

  const normMunKey = (s: string) =>
    s.toUpperCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[''`´''']/g, ' ')
      .replace(/\s+/g, ' ').trim();

  const updateMunicipioMetas = (
    municipio: string,
    metaConservadora: number,
    metaPossivel: number,
    metaArrojada: number,
    prioridade?: string,
    dobradaAtiva?: boolean,
    dobradaNome?: string,
    dobradaPartido?: string,
    dobradaObservacoes?: string
  ) => {
    if (!projecao) return;
    const munKey = normMunKey(municipio);
    setProjecao(prev => {
      if (!prev) return prev;
      const municipios = prev.municipios.map(m =>
        normMunKey(m.municipio) === munKey
          ? {
              ...m,
              metaConservadora,
              metaPossivel,
              metaArrojada,
              prioridade: prioridade || m.prioridade,
              dobradaAtiva: dobradaAtiva ?? m.dobradaAtiva,
              dobradaNome: dobradaNome ?? m.dobradaNome,
              dobradaPartido: dobradaPartido ?? m.dobradaPartido,
              dobradaObservacoes: dobradaObservacoes ?? m.dobradaObservacoes
            }
          : m
      );
      return { ...prev, municipios };
    });
  };

  // Meta base (sem parcerias)
  const getMetaBase = (mun: ProjecaoMunicipio): number => {
    switch (cenarioAtivo) {
      case 'conservador': return mun.metaConservadora;
      case 'possivel': return mun.metaPossivel;
      case 'arrojado': return mun.metaArrojada;
      default: return mun.metaPossivel;
    }
  };

  // Meta ativa (base + dobradas + parcerias se incluídas) - usada nos cálculos de totais
  const getMetaAtiva = (mun: ProjecaoMunicipio): number => {
    if (includeParcerias) {
      return getMetaFinalMunicipio(mun, cenarioAtivo);
    } else {
      // Sem parcerias - apenas meta base
      return getMetaBase(mun);
    }
  };

  const loadMunicipiosDisponiveis = async () => {
    try {
      const res = await fetch(`/api/ibge/municipios?uf=${uf}`);
      if (res.ok) {
        const data = await res.json();
        const nomes = data.map((m: { nome: string }) => m.nome).sort();
        setMunicipiosDisponiveis(nomes);
      }
    } catch (error) {
      console.error('Erro ao carregar municípios:', error);
    }
  };

  const openAddModal = () => {
    loadMunicipiosDisponiveis();
    setNovoMunicipioNome('');
    setNovoMetaConservadora(0);
    setNovoMetaPossivel(0);
    setNovoMetaArrojada(0);
    setNovoMunicipioPrioridade('MEDIA');
    setFiltroMunicipios('');
    setShowAddModal(true);
  };

  const addNovoMunicipio = () => {
    if (!projecao || !novoMunicipioNome.trim()) {
      toast.error('Selecione um município');
      return;
    }

    const exists = projecao.municipios.some(
      m => m.municipio.toUpperCase() === novoMunicipioNome.toUpperCase()
    );

    if (exists) {
      toast.error('Este município já está na lista de projeção');
      return;
    }

    const novoMunicipio: ProjecaoMunicipio = {
      municipio: novoMunicipioNome.toUpperCase(),
      votosBase: 0,
      metaConservadora: novoMetaConservadora,
      metaPossivel: novoMetaPossivel,
      metaArrojada: novoMetaArrojada,
      prioridade: novoMunicipioPrioridade,
      dobradaAtiva: false
    };

    setProjecao(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        municipios: [...prev.municipios, novoMunicipio]
      };
    });

    setShowAddModal(false);
  };

  const removeMunicipio = (municipio: string) => {
    if (!projecao) return;
    setConfirmRemoveMun(municipio);
  };

  const doRemoveMunicipio = () => {
    if (!confirmRemoveMun) return;
    const municipio = confirmRemoveMun;
    setConfirmRemoveMun(null);
    const munKey = normMunKey(municipio);
    setProjecao(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        municipios: prev.municipios.filter(m => normMunKey(m.municipio) !== munKey)
      };
    });
  };

  const normMun = (s: string) =>
    s.toUpperCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
      .replace(/[''`´''']/g, ' ')                       // apóstrofo → espaço
      .replace(/\s+/g, ' ').trim();                     // espaços múltiplos

  const loadMunicipioData = (municipio: string) => {
    if (!projecao) return false;
    const munData = projecao.municipios.find(m => normMun(m.municipio) === normMun(municipio));
    if (!munData) return false;
    setSelectedMunicipio({
      nome: municipio,
      votosBase: munData.votosBase,
      metaConservadora: munData.metaConservadora,
      metaPossivel: munData.metaPossivel,
      metaArrojada: munData.metaArrojada,
      dobradaAtiva: munData.dobradaAtiva,
      dobradaNome: munData.dobradaNome,
      dobradaPartido: munData.dobradaPartido,
      dobradaObservacoes: munData.dobradaObservacoes
    });
    setMetaConservadoraTemp(munData.metaConservadora);
    setMetaPossivelTemp(munData.metaPossivel);
    setMetaArrojadaTemp(munData.metaArrojada);
    setPrioridadeTemp(munData.prioridade || 'MEDIA');
    setDobradaAtivaTemp(munData.dobradaAtiva || false);
    setDobradaNomeTemp(munData.dobradaNome || '');
    setDobradaPartidoTemp(munData.dobradaPartido || '');
    setDobradaObservacoesTemp(munData.dobradaObservacoes || '');
    return true;
  };

  // Clique no mapa OU na lista: destaca município e abre modal
  const handleMunicipioClick = (municipio: string, codigo?: string) => {
    void codigo;
    if (!projecao) return;
    setSelectedMapMunicipio(municipio);

    if (loadMunicipioData(municipio)) {
      setShowModal(true);
      return;
    }

    // Município ainda não está na projeção — pré-preencher com votos da última eleição
    const munNormLocal = normMunKey(municipio);
    const votosBase = electoralData?.votosPorNomeMunicipio
      ? (Object.entries(electoralData.votosPorNomeMunicipio).find(
          ([k]) => normMunKey(k) === munNormLocal
        )?.[1] ?? 0)
      : 0;
    const novoMun: ProjecaoMunicipio = {
      municipio,
      votosBase,
      metaConservadora: votosBase,
      metaPossivel: votosBase,
      metaArrojada: votosBase,
      prioridade: 'MEDIA',
      dobradaAtiva: false,
    };
    setProjecao(prev => prev ? { ...prev, municipios: [...prev.municipios, novoMun] } : prev);
    setSelectedMunicipio({ nome: municipio, votosBase, metaConservadora: votosBase, metaPossivel: votosBase, metaArrojada: votosBase, dobradaAtiva: false });
    setMetaConservadoraTemp(votosBase);
    setMetaPossivelTemp(votosBase);
    setMetaArrojadaTemp(votosBase);
    setPrioridadeTemp('MEDIA');
    setDobradaAtivaTemp(false);
    setDobradaNomeTemp('');
    setDobradaPartidoTemp('');
    setDobradaObservacoesTemp('');
    setShowModal(true);
  };

  // Carregar parcerias da projeção
  const loadParcerias = async (projecaoId: string) => {
    try {
      const res = await fetch(`/api/parcerias?projecaoId=${projecaoId}`);
      if (res.ok) {
        const data = await res.json();
        setParcerias(data.parcerias || []);
        setParceriasStats(data.stats || null);
      }
    } catch (error) {
      console.error('Erro ao carregar parcerias:', error);
    }
  };

  // Carregar dados de bairros para vereador (usado ao selecionar projeção salva)
  const loadBairrosVereador = async (candidatoNome: string, anoBase: number, ufState: string) => {
    try {
      // Primeiro buscar o candidato para obter o candidatoId
      const resCandidato = await fetch(`/api/tse/candidato?ano=${anoBase}&uf=${ufState}&candidato=${encodeURIComponent(candidatoNome)}`);
      if (!resCandidato.ok) return;
      
      const candidatoData = await resCandidato.json();
      
      // Se encontrou múltiplos candidatos, pegar o primeiro com cargo municipal
      let candidatoId = candidatoData.candidatoId;
      if (candidatoData.multiplos && candidatoData.candidatos) {
        const municipal = candidatoData.candidatos.find((c: any) => {
          const c2 = (c.cargo ?? '').toUpperCase();
          return c2.includes('VEREADOR') || c2.includes('PREFEITO');
        });
        if (municipal) candidatoId = municipal.id;
      }
      
      if (!candidatoId) return;

      // Buscar dados completos para popular zonas (necessário para spDistritosVotes)
      const resFullData = await fetch(`/api/tse/candidato?ano=${anoBase}&uf=${ufState}&candidatoId=${candidatoId}`);
      if (resFullData.ok) {
        const fullData = await resFullData.json();
        if (!fullData.multiplos) {
          setElectoralData((prev: ElectoralData | null) => prev ? {
            ...prev,
            zonas: fullData.zonas ?? prev.zonas,
            votosPorMunicipio: fullData.votosPorMunicipio ?? prev.votosPorMunicipio,
            votosPorNomeMunicipio: fullData.votosPorNomeMunicipio ?? prev.votosPorNomeMunicipio,
            totalVotos: fullData.totalVotos ?? prev.totalVotos,
            candidatoId: fullData.candidatoId ?? prev.candidatoId,
          } : prev);
        }
      }

      // Carregar votos por bairro
      const resBairro = await fetch(`/api/tse/votos-bairro?candidatoId=${candidatoId}`);
      if (resBairro.ok) {
        const bairrosData = await resBairro.json();
        setBairrosInfo(bairrosData.bairrosInfo || []);
        setMediaVotosBairro(bairrosData.mediaVotosBairro || 0);

        let municipioFound = '';
        if (bairrosData.municipiosUnicos && bairrosData.municipiosUnicos.length > 0) {
          municipioFound = bairrosData.municipiosUnicos[0];
        } else if (bairrosData.bairrosInfo && bairrosData.bairrosInfo.length > 0) {
          municipioFound = bairrosData.bairrosInfo[0].municipio;
        }

        if (municipioFound) {
          setMunicipioVereador(municipioFound);
          setVisualizacaoMapa('municipio');
        }
      }
      
      // Carregar votos por zona também
      const resZona = await fetch(`/api/tse/votos-zona?candidatoId=${candidatoId}`);
      if (resZona.ok) {
        const zonasData = await resZona.json();
        setVotosPorZona(zonasData.votosPorMunicipio || {});
      }
    } catch (error) {
      console.error('Erro ao carregar dados de bairros do vereador:', error);
    }
  };

  // Salvar parceria
  const saveParceria = async () => {
    if (savingParceria) return; // bloqueia clique duplo enquanto request em andamento
    if (!parceriaForm.nome || !parceriaForm.tipo) {
      toast.error('Nome e tipo são obrigatórios');
      return;
    }

    setSavingParceria(true);
    try {
      // Usa normMunKey pra casar nomes com acentos diferentes
      // (ex.: "São Paulo" vs "SAO PAULO" vs "São Paulo ")
      const munKey = normMunKey(municipioParaParceria);
      const munData = projecao?.municipios.find(m =>
        normMunKey(m.municipio) === munKey
      );

      if (!munData) {
        toast.error('Município não encontrado na projeção. Adicione-o antes.');
        return;
      }

      // Projeção ainda não salva → buffering local
      if (!munData.id) {
        const isPendingEdit = selectedParceria?.id?.startsWith('pending-');
        const pendingEntry: Parceria = {
          id: isPendingEdit ? selectedParceria!.id! : `pending-${Date.now()}`,
          municipio: municipioParaParceria,
          bairro: bairroParaParceria || null,
          projecaoMunicipioId: '',
          nome: parceriaForm.nome ?? '',
          tipo: (parceriaForm.tipo ?? 'LIDERANCA') as any,
          responsavel: parceriaForm.responsavel ?? null,
          contato: parceriaForm.contato ?? null,
          observacoes: parceriaForm.observacoes ?? null,
          impactoEstimado: parceriaForm.impactoEstimado ?? 0,
          metaConservadora: parceriaForm.metaConservadora ?? 0,
          metaPossivel: parceriaForm.metaPossivel ?? 0,
          metaArrojada: parceriaForm.metaArrojada ?? 0,
          ativa: parceriaForm.ativa ?? true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setPendingParcerias(prev =>
          isPendingEdit
            ? prev.map(p => p.id === selectedParceria!.id ? pendingEntry : p)
            : [...prev, pendingEntry]
        );
        setShowParceriaModal(false);
        setSelectedParceria(null);
        setParceriaForm({ nome: '', tipo: 'LIDERANCA', responsavel: '', contato: '', observacoes: '', impactoEstimado: 0, metaConservadora: 0, metaPossivel: 0, metaArrojada: 0, ativa: true });
        toast.success('Parceria adicionada — será salva junto com a projeção');
        setSavingParceria(false);
        return;
      }

      const payload = {
        ...parceriaForm,
        projecaoMunicipioId: munData.id,
        bairro: bairroParaParceria || null
      };

      const method = selectedParceria?.id && !selectedParceria.id.startsWith('pending-') ? 'PUT' : 'POST';
      if (method === 'PUT') {
        (payload as any).id = selectedParceria!.id;
      }

      const res = await fetch('/api/parcerias', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setShowParceriaModal(false);
        setSelectedParceria(null);
        setParceriaForm({
          nome: '',
          tipo: 'LIDERANCA',
          responsavel: '',
          contato: '',
          observacoes: '',
          impactoEstimado: 0,
          metaConservadora: 0,
          metaPossivel: 0,
          metaArrojada: 0,
          ativa: true
        });
        toast.success('Parceria salva com sucesso!');
        if (projecao?.id) {
          loadParcerias(projecao.id).catch(() => {});
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData?.error || 'Erro ao salvar parceria');
        console.error('Erro ao salvar parceria:', res.status, errData);
      }
    } catch (error) {
      console.error('Erro ao salvar parceria:', error);
      toast.error('Erro ao salvar parceria');
    } finally {
      setSavingParceria(false);
    }
  };

  // Deletar parceria
  const deleteParceria = (id: string) => setConfirmDeleteParceria(id);

  const doDeleteParceria = async () => {
    if (!confirmDeleteParceria) return;
    const id = confirmDeleteParceria;
    setConfirmDeleteParceria(null);

    // Parceria ainda não salva → remove apenas do estado local
    if (id.startsWith('pending-')) {
      setPendingParcerias(prev => prev.filter(p => p.id !== id));
      return;
    }

    try {
      const res = await fetch(`/api/parcerias?id=${id}`, { method: 'DELETE' });
      if (res.ok && projecao?.id) {
        await loadParcerias(projecao.id);
      }
    } catch (error) {
      console.error('Erro ao deletar parceria:', error);
    }
  };

  // Abrir modal de parceria
  const openParceriaModal = (municipio: string, bairro?: string) => {
    setMunicipioParaParceria(municipio);
    setBairroParaParceria(bairro || '');
    setParceriaForm({
      nome: '',
      tipo: 'LIDERANCA',
      responsavel: '',
      contato: '',
      observacoes: '',
      impactoEstimado: 0,
      metaConservadora: 0,
      metaPossivel: 0,
      metaArrojada: 0,
      ativa: true
    });
    setSelectedParceria(null);
    setShowParceriaModal(true);
  };

  // Verifica se uma parceria pertence a um bairro do município dado
  const parceriaBairroDestesMunicipio = (pMun: string, municipioNorm: string): boolean => {
    if (isMunBairro(pMun) && municipioVereador && normMunKey(municipioVereador) === municipioNorm) return true;
    if (isMgBairro(pMun) && mgBairrosMunicipio && normMunKey(mgBairrosMunicipio) === municipioNorm) return true;
    return false;
  };

  // Obter parcerias de um município (inclui parcerias de bairros pertencentes ao município)
  const getParceriasMunicipio = (municipio: string): Parceria[] => {
    const munUp = municipio.toUpperCase();
    const munNorm = normMunKey(municipio);
    const saved = parcerias.filter(p => {
      const pMun = p.municipio ?? '';
      return pMun.toUpperCase() === munUp || parceriaBairroDestesMunicipio(pMun, munNorm);
    });
    const pending = pendingParcerias.filter(p => {
      const pMun = p.municipio ?? '';
      return pMun.toUpperCase() === munUp || parceriaBairroDestesMunicipio(pMun, munNorm);
    });
    return [...saved, ...pending];
  };

  // Verificar se município tem parcerias (inclui bairros)
  const municipioTemParcerias = (municipio: string): boolean => {
    const munUp = municipio.toUpperCase();
    const munNorm = normMunKey(municipio);
    return parcerias.some(p => {
      const pMun = p.municipio ?? '';
      return pMun.toUpperCase() === munUp || parceriaBairroDestesMunicipio(pMun, munNorm);
    }) || pendingParcerias.some(p => {
      const pMun = p.municipio ?? '';
      return pMun.toUpperCase() === munUp || parceriaBairroDestesMunicipio(pMun, munNorm);
    });
  };

  // Calcular soma das metas de parcerias por município
  const getParceriasSumForMunicipio = (municipio: string): { conservadora: number; possivel: number; arrojada: number; impacto: number } => {
    const parceriasMun = getParceriasMunicipio(municipio);
    return {
      conservadora: parceriasMun.reduce((acc, p) => acc + (p.metaConservadora || 0), 0),
      possivel: parceriasMun.reduce((acc, p) => acc + (p.metaPossivel || 0), 0),
      arrojada: parceriasMun.reduce((acc, p) => acc + (p.metaArrojada || 0), 0),
      impacto: parceriasMun.reduce((acc, p) => acc + (p.impactoEstimado || 0), 0)
    };
  };

  // Soma o delta de projeções de bairros para um município (meta - votosBase de cada bairro)
  const getBairrosDeltaMunicipio = (municipio: string, cenario: CenarioType): number => {
    if (!projecao) return 0;
    const munNorm = normMunKey(municipio);
    const bairros = projecao.municipios.filter(m => {
      const mMun = m.municipio;
      if (isMunBairro(mMun) && municipioVereador && normMunKey(municipioVereador) === munNorm) return true;
      if (isMgBairro(mMun) && mgBairrosMunicipio && normMunKey(mgBairrosMunicipio) === munNorm) return true;
      return false;
    });
    return bairros.reduce((acc, m) => {
      const meta = cenario === 'conservador' ? m.metaConservadora
        : cenario === 'arrojado' ? m.metaArrojada
        : m.metaPossivel;
      return acc + Math.max(0, meta - m.votosBase);
    }, 0);
  };

  // Obter meta final (base + parcerias + delta de bairros) para um município
  const getMetaFinalMunicipio = (mun: ProjecaoMunicipio, cenario: CenarioType): number => {
    const parceriasSum = getParceriasSumForMunicipio(mun.municipio);
    const bairrosDelta = getBairrosDeltaMunicipio(mun.municipio, cenario);
    switch (cenario) {
      case 'conservador': return mun.metaConservadora + parceriasSum.conservadora + bairrosDelta;
      case 'possivel': return mun.metaPossivel + parceriasSum.possivel + bairrosDelta;
      case 'arrojado': return mun.metaArrojada + parceriasSum.arrojada + bairrosDelta;
      default: return mun.metaPossivel + parceriasSum.possivel + bairrosDelta;
    }
  };

  // Abrir modal para editar parceria existente
  const editParceria = (parceria: Parceria) => {
    setSelectedParceria(parceria);
    setMunicipioParaParceria(parceria.municipio || '');
    setBairroParaParceria(parceria.bairro || '');
    setParceriaForm({
      nome: parceria.nome,
      tipo: parceria.tipo,
      responsavel: parceria.responsavel || '',
      contato: parceria.contato || '',
      observacoes: parceria.observacoes || '',
      impactoEstimado: parceria.impactoEstimado,
      metaConservadora: parceria.metaConservadora,
      metaPossivel: parceria.metaPossivel,
      metaArrojada: parceria.metaArrojada,
      ativa: parceria.ativa
    });
    setShowParceriaModal(true);
  };

  // Filter municipalities
  const getFilteredMunicipios = () => {
    if (!projecao) return [];
    return projecao.municipios.filter(mun => {
      if (isDfZona(mun.municipio)) return false; // zonas do DF ficam na lista própria
      if (isDfRegiao(mun.municipio)) return false; // regiões do DF ficam na lista própria
      if (isSpDistrito(mun.municipio)) return false; // distritos SP ficam na lista própria
      if (isRjBairro(mun.municipio)) return false; // bairros RJ ficam na lista própria
      if (isCeBairro(mun.municipio)) return false; // bairros CE ficam na lista própria
      if (isMgBairro(mun.municipio)) return false; // bairros MG ficam na lista própria
      if (isMunBairro(mun.municipio)) return false; // bairros municipais ficam na lista própria
      const matchesSearch = searchMunicipio === '' ||
        mun.municipio.toLowerCase().includes(searchMunicipio.toLowerCase());

      if (filtroTipo === 'com_dobrada') {
        return matchesSearch && mun.dobradaAtiva;
      } else if (filtroTipo === 'sem_dobrada') {
        return matchesSearch && !mun.dobradaAtiva;
      } else if (filtroTipo === 'parcerias') {
        return matchesSearch && municipioTemParcerias(mun.municipio);
      }
      return matchesSearch;
    });
  };

  // Zonas do DF filtradas para a lista lateral
  const getFilteredDfZonas = () => {
    if (!projecao || uf !== 'DF') return [];
    const zonaEntries = projecao.municipios.filter(m => isDfZona(m.municipio));
    return zonaEntries
      .sort((a, b) => getZonaNumber(a.municipio) - getZonaNumber(b.municipio))
      .filter(m => searchMunicipio === '' || `zona ${getZonaNumber(m.municipio)}`.includes(searchMunicipio.toLowerCase()));
  };

  // Regiões administrativas do DF filtradas para a lista lateral
  const getFilteredDfRegioes = () => {
    if (!projecao || uf !== 'DF' || dfVisualizacao !== 'regioes') return [];
    return projecao.municipios
      .filter(m => isDfRegiao(m.municipio))
      .filter(m => searchMunicipio === '' || getRegiaoNome(m.municipio).toLowerCase().includes(searchMunicipio.toLowerCase()))
      .sort((a, b) => getRegiaoNome(a.municipio).localeCompare(getRegiaoNome(b.municipio), 'pt-BR'));
  };

  // Distritos de SP filtrados para a lista lateral
  const getFilteredSpDistritos = () => {
    if (!projecao || uf !== 'SP' || spVisualizacao !== 'distritos') return [];
    return projecao.municipios
      .filter(m => isSpDistrito(m.municipio))
      .filter(m => searchMunicipio === '' || getDistritoNome(m.municipio).toLowerCase().includes(searchMunicipio.toLowerCase()))
      .sort((a, b) => getDistritoNome(a.municipio).localeCompare(getDistritoNome(b.municipio), 'pt-BR'));
  };

  // Bairros RJ filtrados para a lista lateral
  const getFilteredRjBairros = () => {
    if (!projecao || uf !== 'RJ' || rjVisualizacao !== 'bairros') return [];
    return projecao.municipios
      .filter(m => isRjBairro(m.municipio))
      .filter(m => searchMunicipio === '' || getRjBairroNome(m.municipio).toLowerCase().includes(searchMunicipio.toLowerCase()))
      .sort((a, b) => getRjBairroNome(a.municipio).localeCompare(getRjBairroNome(b.municipio), 'pt-BR'));
  };

  // Bairros CE filtrados para a lista lateral
  const getFilteredCeBairros = () => {
    if (!projecao || uf !== 'CE' || ceVisualizacao !== 'bairros') return [];
    return projecao.municipios
      .filter(m => isCeBairro(m.municipio))
      .filter(m => searchMunicipio === '' || getCeBairroNome(m.municipio).toLowerCase().includes(searchMunicipio.toLowerCase()))
      .sort((a, b) => getCeBairroNome(a.municipio).localeCompare(getCeBairroNome(b.municipio), 'pt-BR'));
  };

  // Bairros MG filtrados para a lista lateral
  const getFilteredMgBairros = () => {
    if (!projecao || uf !== 'MG' || mgVisualizacao !== 'bairros') return [];
    return projecao.municipios
      .filter(m => isMgBairro(m.municipio))
      .filter(m => searchMunicipio === '' || getMgBairroNome(m.municipio).toLowerCase().includes(searchMunicipio.toLowerCase()))
      .sort((a, b) => getMgBairroNome(a.municipio).localeCompare(getMgBairroNome(b.municipio), 'pt-BR'));
  };

  // Bairros de municípios genéricos filtrados para a lista lateral
  const getFilteredMunBairros = () => {
    if (!projecao || visualizacaoMapa !== 'bairro') return [];
    return projecao.municipios
      .filter(m => isMunBairro(m.municipio))
      .filter(m => searchMunicipio === '' || getMunBairroNome(m.municipio).toLowerCase().includes(searchMunicipio.toLowerCase()))
      .sort((a, b) => getMunBairroNome(a.municipio).localeCompare(getMunBairroNome(b.municipio), 'pt-BR'));
  };

  // Municípios baseados no filtro (para lista e mapa)
  // Entradas especiais (zonas DF, regiões DF, distritos SP) ficam em listas próprias
  const getMunicipiosFiltrados = () => {
    if (!projecao) return [];
    const base = projecao.municipios.filter(m =>
      !isDfZona(m.municipio) && !isDfRegiao(m.municipio) && !isSpDistrito(m.municipio) && !isRjBairro(m.municipio) && !isCeBairro(m.municipio) && !isMgBairro(m.municipio) && !isMunBairro(m.municipio)
    );
    if (filtroTipo === 'com_dobrada') return base.filter(m => m.dobradaAtiva);
    if (filtroTipo === 'sem_dobrada') return base.filter(m => !m.dobradaAtiva);
    if (filtroTipo === 'parcerias') return base.filter(m => municipioTemParcerias(m.municipio));
    return base;
  };

  // Stats calculations - agora baseado no filtro ativo
  const getTotalVotosBase = () => {
    const municipios = getMunicipiosFiltrados();
    return municipios.reduce((acc, m) => acc + m.votosBase, 0);
  };

  // Meta de um município num cenário qualquer — mesma regra de getMetaAtiva
  // (com parcerias e bairros quando a simulação inclui parcerias).
  const getMetaNoCenario = (mun: ProjecaoMunicipio, c: CenarioType): number => {
    if (includeParcerias) return getMetaFinalMunicipio(mun, c);
    return c === 'conservador' ? mun.metaConservadora : c === 'arrojado' ? mun.metaArrojada : mun.metaPossivel;
  };

  // Total de um cenário qualquer — mesma conta de getTotalVotosMeta, que é
  // este total no cenário ativo. Serve para mostrar os três lado a lado.
  const getTotalMetaCenario = (c: CenarioType): number => {
    if (!projecao) return 0;
    const spDistritos = projecao.municipios.filter(m => isSpDistrito(m.municipio));
    if (spDistritos.length > 0) {
      const cityBase = projecao.municipios.find(m => m.municipio === 'SAO PAULO')?.votosBase ?? 0;
      const distritosBase = spDistritos.reduce((acc, m) => acc + m.votosBase, 0);
      const distritosMeta = spDistritos.reduce((acc, m) => acc + getMetaNoCenario(m, c), 0);
      const outrosMeta = getMunicipiosFiltrados()
        .filter(m => m.municipio !== 'SAO PAULO')
        .reduce((acc, m) => acc + getMetaNoCenario(m, c), 0);
      return (cityBase - distritosBase) + distritosMeta + outrosMeta;
    }
    return getMunicipiosFiltrados().reduce((acc, m) => acc + getMetaNoCenario(m, c), 0);
  };

  // Votos que as parcerias somam à meta do cenário (0 quando estão fora da simulação).
  const getParceriasNoCenario = (c: CenarioType): number => {
    if (!includeParcerias) return 0;
    const chave = c === 'conservador' ? 'conservadora' : c === 'arrojado' ? 'arrojada' : 'possivel';
    return getMunicipiosFiltrados().reduce((acc, m) => acc + getParceriasSumForMunicipio(m.municipio)[chave], 0);
  };

  const getTotalVotosMeta = () => {
    if (!projecao) return 0;
    const spDistritos = projecao.municipios.filter(m => isSpDistrito(m.municipio));
    if (spDistritos.length > 0) {
      // Replacement model: SAO PAULO city base minus tracked district bases, plus district metas.
      // Untracked districts implicitly stay at their historical vote share.
      const cityBase = projecao.municipios.find(m => m.municipio === 'SAO PAULO')?.votosBase ?? 0;
      const distritosBase = spDistritos.reduce((acc, m) => acc + m.votosBase, 0);
      const distribusMeta = spDistritos.reduce((acc, m) => acc + getMetaAtiva(m), 0);
      const outrosMeta = getMunicipiosFiltrados()
        .filter(m => m.municipio !== 'SAO PAULO')
        .reduce((acc, m) => acc + getMetaAtiva(m), 0);
      return (cityBase - distritosBase) + distribusMeta + outrosMeta;
    }
    return getMunicipiosFiltrados().reduce((acc, m) => acc + getMetaAtiva(m), 0);
  };

  const getCrescimento = () => {
    const base = getTotalVotosBase();
    const meta = getTotalVotosMeta();
    if (base === 0) return meta > 0 ? '100.0' : '0.0';
    return ((meta - base) / base * 100).toFixed(1);
  };

  const getMunicipiosCount = () => {
    return getMunicipiosFiltrados().length;
  };

  const getDobradasCount = () => {
    if (!projecao) return 0;
    return projecao.municipios.filter(m => m.dobradaAtiva).length;
  };

  const getVotosComDobrada = () => {
    if (!projecao) return 0;
    return projecao.municipios
      .filter(m => m.dobradaAtiva)
      .reduce((acc, m) => acc + getMetaAtiva(m), 0);
  };

  // Textos do balão novo dos mapas: no Histórico são votos; na Projeção, o
  // valor de cada área é a meta do cenário (ou o histórico, onde não há meta).
  const textosBalao = useMemo(() => (activeTab === 'historico'
    ? { dica: 'Clique para selecionar' }
    : { valor: 'no cenário', total: 'do total do cenário', dica: 'Clique para selecionar' }), [activeTab]);
  const textosBalaoEstado = useMemo(() => (activeTab === 'historico'
    ? { dica: 'Clique para abrir a cidade' }
    : { valor: 'no cenário', total: 'do total do cenário no estado', dica: 'Clique para abrir a cidade' }), [activeTab]);

  // Memoizados para evitar que o StateMap reinicialize o mapa a cada render
  const highlightedMunicipios = useMemo(() => {
    if (!projecao) return {};
    const result: Record<string, number> = {};
    projecao.municipios.forEach(m => {
      if (isDfZona(m.municipio)) return;
      if (isDfRegiao(m.municipio)) return;
      if (isSpDistrito(m.municipio)) return;
      if (isRjBairro(m.municipio)) return;
      if (isCeBairro(m.municipio)) return;
      if (isMunBairro(m.municipio)) return;
      result[m.municipio] = activeTab === 'historico' ? m.votosBase : getMetaAtiva(m);
    });
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projecao, activeTab, cenarioAtivo, includeParcerias, parcerias]);

  // votesData para SpDistritosMap: em projeção, substitui o valor histórico pelo meta do cenário ativo
  const spDistritosVotesDisplay = useMemo(() => {
    if (activeTab === 'historico' || !projecao) return spDistritosVotes;
    const result = { ...spDistritosVotes };
    projecao.municipios.forEach(m => {
      if (!isSpDistrito(m.municipio)) return;
      const nome = getDistritoNome(m.municipio);
      result[nome] = getMetaAtiva(m);
    });
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spDistritosVotes, projecao, activeTab, cenarioAtivo, includeParcerias, parcerias]);

  // votesData para RjBairrosMap: em projeção, usa meta do cenário ativo
  const rjBairrosVotesDisplay = useMemo(() => {
    const normBairro = (s: string) =>
      s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    // Base: votos zona-agregados
    const result: Record<string, number> = { ...rjBairrosVotes };
    // Suplementa com dados diretos de bairrosInfo (vereadores/prefeitos)
    bairrosInfo.forEach((b: BairroInfo) => {
      const k = normBairro(b.bairro);
      if (!result[k]) result[k] = b.votos;
    });
    if (activeTab === 'historico' || !projecao) return result;
    // Em aba projeção, sobrepõe com meta ativa para entradas salvas
    projecao.municipios.forEach(m => {
      if (!isRjBairro(m.municipio)) return;
      const nome = getRjBairroNome(m.municipio);
      result[nome] = getMetaAtiva(m);
    });
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rjBairrosVotes, bairrosInfo, projecao, activeTab, cenarioAtivo, includeParcerias, parcerias]);

  const dfRegioesVotesDisplay = useMemo(() => {
    const result = { ...dfRegioesVotes };
    if (activeTab === 'historico' || !projecao) return result;
    projecao.municipios.forEach(m => {
      if (!isDfRegiao(m.municipio)) return;
      const nome = getRegiaoNome(m.municipio);
      result[nome] = getMetaAtiva(m);
    });
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dfRegioesVotes, projecao, activeTab, cenarioAtivo, includeParcerias, parcerias]);

  const ceBairrosVotesDisplay = useMemo(() => {
    const result = { ...ceBairrosVotes };
    if (activeTab === 'historico' || !projecao) return result;
    projecao.municipios.forEach(m => {
      if (!isCeBairro(m.municipio)) return;
      const nome = getCeBairroNome(m.municipio);
      result[nome] = getMetaAtiva(m);
    });
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ceBairrosVotes, projecao, activeTab, cenarioAtivo, includeParcerias, parcerias]);

  const mgBairrosVotesDisplay = useMemo(() => {
    const result = { ...mgBairrosVotes };
    if (activeTab === 'historico' || !projecao) return result;
    projecao.municipios.forEach(m => {
      if (!isMgBairro(m.municipio)) return;
      const nome = getMgBairroNome(m.municipio);
      result[nome] = getMetaAtiva(m);
    });
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mgBairrosVotes, projecao, activeTab, cenarioAtivo, includeParcerias, parcerias]);

  // votesData para BairrosPoligonosMap genérico: API + override de projeção (via MUN_BAIRRO_)
  const genBairrosVotesDisplay = useMemo(() => {
    const norm = (s: string) =>
      s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const result: Record<string, number> = {};
    Object.entries(genBairrosApiVotes).forEach(([k, v]) => { result[norm(k)] = v; });
    if (activeTab === 'historico' || !projecao) return result;
    projecao.municipios.forEach(m => {
      if (!isMunBairro(m.municipio)) return;
      result[getMunBairroNome(m.municipio)] = getMetaAtiva(m);
    });
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genBairrosApiVotes, projecao, activeTab, cenarioAtivo, includeParcerias, parcerias]);

  // votesData para MunicipioMap: em projeção, sobrepõe com meta ativa para bairros municipais
  const munBairrosVotesDisplay = useMemo(() => {
    const norm = (s: string) =>
      s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    const result: Record<string, number> = {};
    bairrosInfo.forEach(b => { result[norm(b.bairro)] = b.votos; });
    if (activeTab === 'historico' || !projecao) return result;
    projecao.municipios.forEach(m => {
      if (!isMunBairro(m.municipio)) return;
      result[getMunBairroNome(m.municipio)] = getMetaAtiva(m);
    });
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bairrosInfo, projecao, activeTab, cenarioAtivo, includeParcerias, parcerias]);

  const filteredMunicipiosSet = useMemo((): Set<string> | null => {
    if (!projecao || filtroTipo === 'todos') return null;
    const filtered = getMunicipiosFiltrados();
    return new Set(filtered.map(m => m.municipio));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projecao, filtroTipo, parcerias]);

  const calcCrescimento = (votosBase: number, meta: number): string => {
    if (votosBase === 0) return meta > 0 ? '+100%' : '0%';
    const diff = ((meta - votosBase) / votosBase * 100).toFixed(1);
    return `${parseFloat(diff) >= 0 ? '+' : ''}${diff}%`;
  };

  // Função para categorizar bairro por votos
  const getBairroCategory = (votos: number): 'acima' | 'abaixo' | 'sem' => {
    if (votos === 0) return 'sem';
    if (votos >= mediaVotosBairro) return 'acima';
    return 'abaixo';
  };

  // Handler para click em bairro
  const handleBairroClick = (bairroNome: string, votos: number) => {
    if (!projecao) return;
    const nomeNorm = bairroNome.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    const key = munBairroKey(nomeNorm);
    const votosBase = votos;
    const munData = projecao.municipios.find(m => m.municipio === key);
    if (munData) {
      setSelectedMunicipio({
        nome: key,
        votosBase: munData.votosBase,
        metaConservadora: munData.metaConservadora,
        metaPossivel: munData.metaPossivel,
        metaArrojada: munData.metaArrojada,
        dobradaAtiva: munData.dobradaAtiva,
        dobradaNome: munData.dobradaNome,
        dobradaPartido: munData.dobradaPartido,
        dobradaObservacoes: munData.dobradaObservacoes,
      });
      setMetaConservadoraTemp(munData.metaConservadora);
      setMetaPossivelTemp(munData.metaPossivel);
      setMetaArrojadaTemp(munData.metaArrojada);
      setPrioridadeTemp(munData.prioridade || 'MEDIA');
      setDobradaAtivaTemp(munData.dobradaAtiva || false);
      setDobradaNomeTemp(munData.dobradaNome || '');
      setDobradaPartidoTemp(munData.dobradaPartido || '');
      setDobradaObservacoesTemp(munData.dobradaObservacoes || '');
    } else {
      const nova: ProjecaoMunicipio = {
        municipio: key,
        votosBase,
        metaConservadora: votosBase,
        metaPossivel: votosBase,
        metaArrojada: votosBase,
        prioridade: 'MEDIA',
        dobradaAtiva: false,
      };
      setProjecao(prev => prev ? { ...prev, municipios: [...prev.municipios, nova] } : prev);
      setSelectedMunicipio({ nome: key, votosBase, metaConservadora: votosBase, metaPossivel: votosBase, metaArrojada: votosBase, dobradaAtiva: false });
      setMetaConservadoraTemp(votosBase);
      setMetaPossivelTemp(votosBase);
      setMetaArrojadaTemp(votosBase);
      setPrioridadeTemp('MEDIA');
      setDobradaAtivaTemp(false);
      setDobradaNomeTemp('');
      setDobradaPartidoTemp('');
      setDobradaObservacoesTemp('');
    }
    setShowModal(true);
  };

  // Carregar zonas do DF a partir dos dados de electoralData
  const carregarDfZonas = async (eData?: ElectoralData | null, anoParam?: string) => {
    const ed = eData ?? electoralData;
    if (!ed) return;
    const anoUso = anoParam ?? ano;
    const cidId = ed.candidatoId;
    const nomeUrna = ed.nomeUrna || ed.candidateName || (ed as any).nome || '';
    if (!cidId && !nomeUrna) return;

    const fetchZonas = async (q: string) => {
      const r = await fetch(`/api/tse/zonas?municipio=BRAS%C3%8DLIA&uf=DF&ano=${anoUso}&${q}`);
      if (!r.ok) return null;
      const d = await r.json();
      return d?.locaisPorZona?.length > 0 ? d : null;
    };

    setLoadingDfZonas(true);
    try {
      // Tentar por candidatoId primeiro; fallback por nome se falhar
      let data = cidId ? await fetchZonas(`candidatoId=${encodeURIComponent(cidId)}`) : null;
      if (!data && nomeUrna) {
        data = await fetchZonas(`nome=${encodeURIComponent(nomeUrna)}`);
      }
      if (data) {
        setDfZonas(data.locaisPorZona);
        setDfBounds(data.bounds ?? null);
        // Popular projeção com as zonas ao carregar (substitui entrada genérica de Brasília)
        setProjecao(prev => {
          if (!prev) return prev;
          const jaTemZonas = prev.municipios.some((m: any) => m.municipio?.startsWith('DF_ZONA_'));
          if (jaTemZonas) return prev;
          const zonasMunicipios = data.locaisPorZona.map((z: any) => ({
            municipio: `DF_ZONA_${String(z.zona).padStart(2, '0')}`,
            votosBase: z.votos,
            metaConservadora: z.votos,
            metaPossivel: z.votos,
            metaArrojada: z.votos,
            prioridade: 'MEDIA',
            dobradaAtiva: false,
          }));
          const semBrasilia = prev.municipios.filter(
            (m: any) => !m.municipio?.startsWith('DF_ZONA_') && m.municipio !== 'BRASÍLIA'
          );
          return { ...prev, municipios: [...semBrasilia, ...zonasMunicipios] };
        });
      }
    } finally {
      setLoadingDfZonas(false);
    }
  };

  // Auto-carregar zonas do DF quando electoralData mudar para candidato do DF
  // (useEffect fica DEPOIS de carregarDfZonas para evitar forward reference)
  useEffect(() => {
    if (uf !== 'DF' || !electoralData || loadingDfZonas) return;
    const key = electoralData.candidatoId ?? electoralData.nomeUrna ?? electoralData.candidateName ?? '';
    if (!key || dfZonasCandidatoRef.current === key) return;
    dfZonasCandidatoRef.current = key;
    carregarDfZonas(electoralData, ano);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uf, electoralData]);

  // Handler para click em zona do DF
  const handleDfZonaClick = (zona: import('@/components/maps/zona-pins-map').ZonaPinData) => {
    if (!projecao) return;
    setSelectedDfZona(zona.zona);
    const key = dfZonaMunicipioKey(zona.zona);
    const munData = projecao.municipios.find(m => m.municipio === key);
    if (munData) {
      setSelectedMunicipio({
        nome: key,
        votosBase: munData.votosBase,
        metaConservadora: munData.metaConservadora,
        metaPossivel: munData.metaPossivel,
        metaArrojada: munData.metaArrojada,
        dobradaAtiva: munData.dobradaAtiva,
        dobradaNome: munData.dobradaNome,
        dobradaPartido: munData.dobradaPartido,
        dobradaObservacoes: munData.dobradaObservacoes,
      });
      setMetaConservadoraTemp(munData.metaConservadora);
      setMetaPossivelTemp(munData.metaPossivel);
      setMetaArrojadaTemp(munData.metaArrojada);
      setPrioridadeTemp(munData.prioridade || 'MEDIA');
      setDobradaAtivaTemp(munData.dobradaAtiva || false);
      setDobradaNomeTemp(munData.dobradaNome || '');
      setDobradaPartidoTemp(munData.dobradaPartido || '');
      setDobradaObservacoesTemp(munData.dobradaObservacoes || '');
    } else {
      // Zona sem projeção ainda — criar
      const nova: ProjecaoMunicipio = {
        municipio: key,
        votosBase: zona.votos,
        metaConservadora: zona.votos,
        metaPossivel: zona.votos,
        metaArrojada: zona.votos,
        prioridade: 'MEDIA',
        dobradaAtiva: false,
      };
      setProjecao(prev => prev ? { ...prev, municipios: [...prev.municipios, nova] } : prev);
      setSelectedMunicipio({ nome: key, votosBase: zona.votos, metaConservadora: zona.votos, metaPossivel: zona.votos, metaArrojada: zona.votos, dobradaAtiva: false });
      setMetaConservadoraTemp(zona.votos);
      setMetaPossivelTemp(zona.votos);
      setMetaArrojadaTemp(zona.votos);
      setPrioridadeTemp('MEDIA');
      setDobradaAtivaTemp(false);
      setDobradaNomeTemp('');
      setDobradaPartidoTemp('');
      setDobradaObservacoesTemp('');
    }
    setShowModal(true);
  };

  // Handler para click em região administrativa do DF
  const handleDfRegiaoClick = (nome: string) => {
    setSelectedDfRegiao(prev => prev === nome ? null : nome);
    if (!projecao) return;
    const key = dfRegiaoKey(nome);
    const votosBase = dfRegioesVotes[nome] ?? 0;
    const munData = projecao.municipios.find(m => m.municipio === key);
    if (munData) {
      setSelectedMunicipio({
        nome: key,
        votosBase: munData.votosBase,
        metaConservadora: munData.metaConservadora,
        metaPossivel: munData.metaPossivel,
        metaArrojada: munData.metaArrojada,
        dobradaAtiva: munData.dobradaAtiva,
        dobradaNome: munData.dobradaNome,
        dobradaPartido: munData.dobradaPartido,
        dobradaObservacoes: munData.dobradaObservacoes,
      });
      setMetaConservadoraTemp(munData.metaConservadora);
      setMetaPossivelTemp(munData.metaPossivel);
      setMetaArrojadaTemp(munData.metaArrojada);
      setPrioridadeTemp(munData.prioridade || 'MEDIA');
      setDobradaAtivaTemp(munData.dobradaAtiva || false);
      setDobradaNomeTemp(munData.dobradaNome || '');
      setDobradaPartidoTemp(munData.dobradaPartido || '');
      setDobradaObservacoesTemp(munData.dobradaObservacoes || '');
    } else {
      const nova: ProjecaoMunicipio = {
        municipio: key,
        votosBase,
        metaConservadora: votosBase,
        metaPossivel: votosBase,
        metaArrojada: votosBase,
        prioridade: 'MEDIA',
        dobradaAtiva: false,
      };
      setProjecao(prev => prev ? { ...prev, municipios: [...prev.municipios, nova] } : prev);
      setSelectedMunicipio({ nome: key, votosBase, metaConservadora: votosBase, metaPossivel: votosBase, metaArrojada: votosBase, dobradaAtiva: false });
      setMetaConservadoraTemp(votosBase);
      setMetaPossivelTemp(votosBase);
      setMetaArrojadaTemp(votosBase);
      setPrioridadeTemp('MEDIA');
      setDobradaAtivaTemp(false);
      setDobradaNomeTemp('');
      setDobradaPartidoTemp('');
      setDobradaObservacoesTemp('');
    }
    setShowModal(true);
  };

  // Handler para click em distrito municipal de SP
  const handleSpDistritoClick = (nome: string) => {
    setSelectedSpDistrito(prev => prev === nome ? null : nome);
    if (!projecao) return;
    const key = spDistritoKey(nome);
    const votosBase = spDistritosVotes[nome] ?? 0;
    const munData = projecao.municipios.find(m => m.municipio === key);
    if (munData) {
      setSelectedMunicipio({
        nome: key,
        votosBase: munData.votosBase,
        metaConservadora: munData.metaConservadora,
        metaPossivel: munData.metaPossivel,
        metaArrojada: munData.metaArrojada,
        dobradaAtiva: munData.dobradaAtiva,
        dobradaNome: munData.dobradaNome,
        dobradaPartido: munData.dobradaPartido,
        dobradaObservacoes: munData.dobradaObservacoes,
      });
      setMetaConservadoraTemp(munData.metaConservadora);
      setMetaPossivelTemp(munData.metaPossivel);
      setMetaArrojadaTemp(munData.metaArrojada);
      setPrioridadeTemp(munData.prioridade || 'MEDIA');
      setDobradaAtivaTemp(munData.dobradaAtiva || false);
      setDobradaNomeTemp(munData.dobradaNome || '');
      setDobradaPartidoTemp(munData.dobradaPartido || '');
      setDobradaObservacoesTemp(munData.dobradaObservacoes || '');
    } else {
      const nova: ProjecaoMunicipio = {
        municipio: key,
        votosBase,
        metaConservadora: votosBase,
        metaPossivel: votosBase,
        metaArrojada: votosBase,
        prioridade: 'MEDIA',
        dobradaAtiva: false,
      };
      setProjecao(prev => prev ? { ...prev, municipios: [...prev.municipios, nova] } : prev);
      setSelectedMunicipio({ nome: key, votosBase, metaConservadora: votosBase, metaPossivel: votosBase, metaArrojada: votosBase, dobradaAtiva: false });
      setMetaConservadoraTemp(votosBase);
      setMetaPossivelTemp(votosBase);
      setMetaArrojadaTemp(votosBase);
      setPrioridadeTemp('MEDIA');
      setDobradaAtivaTemp(false);
      setDobradaNomeTemp('');
      setDobradaPartidoTemp('');
      setDobradaObservacoesTemp('');
    }
    setShowModal(true);
  };

  // Handler para click em bairro do Rio de Janeiro
  const handleRjBairroClick = (nome: string) => {
    const nomeNorm = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    setSelectedRjBairro(prev => prev === nomeNorm ? null : nomeNorm);
    if (!projecao) return;
    const key = rjBairroKey(nomeNorm);
    const normB = (s: string) =>
      s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    const votosBase =
      rjBairrosVotes[nomeNorm] ??
      bairrosInfo.find((b: BairroInfo) => normB(b.bairro) === nomeNorm)?.votos ??
      0;
    const munData = projecao.municipios.find(m => m.municipio === key);
    if (munData) {
      setSelectedMunicipio({
        nome: key,
        votosBase: munData.votosBase,
        metaConservadora: munData.metaConservadora,
        metaPossivel: munData.metaPossivel,
        metaArrojada: munData.metaArrojada,
        dobradaAtiva: munData.dobradaAtiva,
        dobradaNome: munData.dobradaNome,
        dobradaPartido: munData.dobradaPartido,
        dobradaObservacoes: munData.dobradaObservacoes,
      });
      setMetaConservadoraTemp(munData.metaConservadora);
      setMetaPossivelTemp(munData.metaPossivel);
      setMetaArrojadaTemp(munData.metaArrojada);
      setPrioridadeTemp(munData.prioridade || 'MEDIA');
      setDobradaAtivaTemp(munData.dobradaAtiva || false);
      setDobradaNomeTemp(munData.dobradaNome || '');
      setDobradaPartidoTemp(munData.dobradaPartido || '');
      setDobradaObservacoesTemp(munData.dobradaObservacoes || '');
    } else {
      const nova: ProjecaoMunicipio = {
        municipio: key,
        votosBase,
        metaConservadora: votosBase,
        metaPossivel: votosBase,
        metaArrojada: votosBase,
        prioridade: 'MEDIA',
        dobradaAtiva: false,
      };
      setProjecao(prev => prev ? { ...prev, municipios: [...prev.municipios, nova] } : prev);
      setSelectedMunicipio({ nome: key, votosBase, metaConservadora: votosBase, metaPossivel: votosBase, metaArrojada: votosBase, dobradaAtiva: false });
      setMetaConservadoraTemp(votosBase);
      setMetaPossivelTemp(votosBase);
      setMetaArrojadaTemp(votosBase);
      setPrioridadeTemp('MEDIA');
      setDobradaAtivaTemp(false);
      setDobradaNomeTemp('');
      setDobradaPartidoTemp('');
      setDobradaObservacoesTemp('');
    }
    setShowModal(true);
  };

  // Handler para click em bairro de Fortaleza (CE)
  const handleCeBairroClick = (nome: string) => {
    const nomeNorm = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    setSelectedCeBairro(prev => prev === nomeNorm ? null : nomeNorm);
    if (!projecao) return;
    const key = ceBairroKey(nomeNorm);
    const votosBase = ceBairrosVotes[nomeNorm] ?? 0;
    const munData = projecao.municipios.find(m => m.municipio === key);
    if (munData) {
      setSelectedMunicipio({
        nome: key,
        votosBase: munData.votosBase,
        metaConservadora: munData.metaConservadora,
        metaPossivel: munData.metaPossivel,
        metaArrojada: munData.metaArrojada,
        dobradaAtiva: munData.dobradaAtiva,
        dobradaNome: munData.dobradaNome,
        dobradaPartido: munData.dobradaPartido,
        dobradaObservacoes: munData.dobradaObservacoes,
      });
      setMetaConservadoraTemp(munData.metaConservadora);
      setMetaPossivelTemp(munData.metaPossivel);
      setMetaArrojadaTemp(munData.metaArrojada);
      setPrioridadeTemp(munData.prioridade || 'MEDIA');
      setDobradaAtivaTemp(munData.dobradaAtiva || false);
      setDobradaNomeTemp(munData.dobradaNome || '');
      setDobradaPartidoTemp(munData.dobradaPartido || '');
      setDobradaObservacoesTemp(munData.dobradaObservacoes || '');
    } else {
      const nova: ProjecaoMunicipio = {
        municipio: key,
        votosBase,
        metaConservadora: votosBase,
        metaPossivel: votosBase,
        metaArrojada: votosBase,
        prioridade: 'MEDIA',
        dobradaAtiva: false,
      };
      setProjecao(prev => prev ? { ...prev, municipios: [...prev.municipios, nova] } : prev);
      setSelectedMunicipio({ nome: key, votosBase, metaConservadora: votosBase, metaPossivel: votosBase, metaArrojada: votosBase, dobradaAtiva: false });
      setMetaConservadoraTemp(votosBase);
      setMetaPossivelTemp(votosBase);
      setMetaArrojadaTemp(votosBase);
      setPrioridadeTemp('MEDIA');
      setDobradaAtivaTemp(false);
      setDobradaNomeTemp('');
      setDobradaPartidoTemp('');
      setDobradaObservacoesTemp('');
    }
    setShowModal(true);
  };

  // Zonas do DF com dados de projeção sobrepostos para exibição no mapa
  const dfZonasDisplay = useMemo(() => {
    if (!dfZonas.length || !projecao) return dfZonas;
    return dfZonas.map(z => {
      const key = dfZonaMunicipioKey(z.zona);
      const munData = projecao.municipios.find(m => m.municipio === key);
      if (!munData || activeTab === 'historico') return z;
      const meta =
        cenarioAtivo === 'conservador' ? munData.metaConservadora :
        cenarioAtivo === 'arrojado' ? munData.metaArrojada :
        munData.metaPossivel;
      return { ...z, votos: meta };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dfZonas, projecao, activeTab, cenarioAtivo]);

  const filteredBairros = useMemo(() => {
    if (!bairrosInfo || bairrosInfo.length === 0) return [];
    if (searchMunicipio === '') return bairrosInfo;
    const q = searchMunicipio.toLowerCase();
    return bairrosInfo.filter(b =>
      b.bairro.toLowerCase().includes(q) || b.municipio.toLowerCase().includes(q)
    );
  }, [bairrosInfo, searchMunicipio]);

  if ((status === 'loading' && !session)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--bg-card)]">
        <Loader2 className="h-8 w-8 animate-spin text-[color:var(--brand-cobalt)]" />
      </div>
    );
  }

  if (!canAccess) {
    return null;
  }

  const anosOptions = [
    { value: '2026', label: '2026' },
    { value: '2024', label: '2024' },
    { value: '2022', label: '2022' },
    { value: '2020', label: '2020' },
    { value: '2018', label: '2018' }
  ];
  // Candidato novo: o "ano da eleição" é o próprio ano em que vai concorrer.
  if (!anosOptions.some(o => o.value === ano)) anosOptions.unshift({ value: ano, label: ano });

  // Fixo: segue o ano da eleição (ver `escolherAnoBase`) ou o novo candidato.
  const anosProjecaoOptions = [{ value: anoProjecao, label: anoProjecao }];

  const estadosOptions = ESTADOS_BRASIL.map(e => ({ value: e.sigla, label: e.nome }));

  // Nome para mostrar de uma entrada da projeção: zona do DF, região, distrito
  // de SP, bairro do RJ/CE/município — ou o próprio município.
  const nomeDaArea = (n: string): string =>
    isDfZona(n) ? `Zona ${getZonaNumber(n)}`
      : isDfRegiao(n) ? getRegiaoNome(n)
      : isSpDistrito(n) ? getDistritoNome(n)
      : isRjBairro(n) ? getRjBairroNome(n)
      : isCeBairro(n) ? getCeBairroNome(n)
      : isMunBairro(n) ? getMunBairroNome(n)
      : n;

  const prioridadeOptions = [
    { value: 'ALTA', label: 'Alta Prioridade' },
    { value: 'MEDIA', label: 'Média Prioridade' },
    { value: 'BAIXA', label: 'Baixa Prioridade' }
  ];

  // Números do cartão de uma projeção salva — a MESMA conta da tela da
  // projeção ao abrir (cenário realista, parcerias incluídas): meta das
  // cidades + parcerias + o que os bairros acrescentam; em São Paulo capital,
  // a meta pelos distritos. Antes o cartão somava só a meta das cidades, e
  // quem planejou por parceria ou por bairro via a meta igual aos votos.
  const resumoDaProjecao = (proj: Projecao): ResumoProjecaoSalva => {
    const cidades = proj.municipios.filter(m =>
      !isDfZona(m.municipio) && !isDfRegiao(m.municipio) &&
      !isSpDistrito(m.municipio) && !isRjBairro(m.municipio) &&
      !isCeBairro(m.municipio) && !isMgBairro(m.municipio) && !isMunBairro(m.municipio)
    );
    const parc = (m: ProjecaoMunicipio) => m.parceriasSoma?.possivel ?? 0;
    // Bairros de vereador/prefeito: somam o que passa dos votos de cada bairro,
    // e as parcerias deles contam para a cidade.
    const bairros = proj.municipios.filter(m => isMunBairro(m.municipio) || isMgBairro(m.municipio));
    const extraBairros = bairros.reduce((s, m) => s + Math.max(0, (m.metaPossivel || 0) - (m.votosBase || 0)) + parc(m), 0);
    const metaCidade = (m: ProjecaoMunicipio) => (m.metaPossivel || 0) + parc(m);

    const base = cidades.reduce((s, m) => s + (m.votosBase || 0), 0);
    const distritos = proj.municipios.filter(m => isSpDistrito(m.municipio));
    let meta: number;
    if (distritos.length > 0) {
      const baseCapital = proj.municipios.find(m => m.municipio === 'SAO PAULO')?.votosBase ?? 0;
      const baseDistritos = distritos.reduce((s, m) => s + (m.votosBase || 0), 0);
      meta = (baseCapital - baseDistritos)
        + distritos.reduce((s, m) => s + metaCidade(m), 0)
        + cidades.filter(m => m.municipio !== 'SAO PAULO').reduce((s, m) => s + metaCidade(m), 0)
        + extraBairros;
    } else {
      meta = cidades.reduce((s, m) => s + metaCidade(m), 0) + extraBairros;
    }

    return {
      nome: proj.candidatoNome,
      cargo: proj.cargo ?? '',
      uf: proj.uf,
      anoBase: proj.anoBase,
      anoProjecao: proj.anoProjecao,
      base,
      meta,
      municipios: cidades.length,
      dobradas: proj.municipios.filter(m => m.dobradaAtiva).length,
      estreante: base === 0,
    };
  };

  // Abre uma projeção salva: restaura a busca, a projeção e o mapa certo
  // (zonas do DF, distritos de SP, bairros do RJ/CE) a partir do que foi salvo.
  const abrirProjecaoSalva = async (proj: Projecao) => {
    setCandidateName(proj.candidatoNome);
    setAno(proj.anoBase.toString());
    setUf(proj.uf);
    setAnoProjecao(proj.anoProjecao.toString());
    setProjecao(proj);
    const munBase = proj.municipios.filter((m: ProjecaoMunicipio) => !isDfZona(m.municipio) && !isDfRegiao(m.municipio) && !isSpDistrito(m.municipio) && !isRjBairro(m.municipio) && !isCeBairro(m.municipio) && !isMgBairro(m.municipio) && !isMunBairro(m.municipio));
    const isEstreanteSalvo = munBase.reduce((s: number, m: ProjecaoMunicipio) => s + m.votosBase, 0) === 0;
    if (isEstreanteSalvo) setActiveTab('projecao');
    setElectoralData({
      nome: proj.candidatoNome,
      partido: '',
      cargo: proj.cargo || '',
      totalVotos: munBase.reduce((acc: number, m: ProjecaoMunicipio) => acc + m.votosBase, 0),
      uf: proj.uf
    });
    setFormCollapsed(true);
    setSelectedDfZona(null);
    if (proj.id) loadParcerias(proj.id);
    const cargoSalvo = (proj.cargo ?? '').toUpperCase();
    const isMunicipalSalvo = cargoSalvo.includes('VEREADOR') || cargoSalvo.includes('PREFEITO');
    if (isMunicipalSalvo) {
      // Derivar município imediatamente a partir dos dados salvos
      const munFromProj = munBase
        .sort((a, b) => b.metaPossivel - a.metaPossivel || b.votosBase - a.votosBase)[0]?.municipio;
      if (munFromProj) {
        setMunicipioVereador(munFromProj);
        setVisualizacaoMapa('municipio');
      } else {
        // Projeção com entradas de bairros (RJ/SP/CE) mas sem municípios diretos
        const rjBairros = proj.municipios.filter((m: ProjecaoMunicipio) => isRjBairro(m.municipio));
        const spDistritos = proj.municipios.filter((m: ProjecaoMunicipio) => isSpDistrito(m.municipio));
        const ceBairros = proj.municipios.filter((m: ProjecaoMunicipio) => isCeBairro(m.municipio));
        if (rjBairros.length > 0) {
          setMunicipioVereador('RIO DE JANEIRO');
          setVisualizacaoMapa('municipio');
        } else if (spDistritos.length > 0) {
          setMunicipioVereador('SAO PAULO');
          setVisualizacaoMapa('municipio');
        } else if (ceBairros.length > 0) {
          setMunicipioVereador('FORTALEZA');
          setVisualizacaoMapa('municipio');
        }
      }
      // Estreantes não têm histórico no TSE: evitar chamada com ano futuro
      // isEstreanteSalvo é recalculado incluindo entradas de bairros para não bloquear vereadores com projeção por bairro
      const totalBase = proj.municipios.reduce((s: number, m: ProjecaoMunicipio) => s + m.votosBase, 0);
      if (totalBase > 0) {
        loadBairrosVereador(proj.candidatoNome, proj.anoBase, proj.uf);
      }
    } else {
      setBairrosInfo([]);
      setMediaVotosBairro(0);
      setVisualizacaoMapa('municipio');
    }
    // CE: restaurar visualização de bairros se houver entradas CE_BAIRRO_
    if (proj.uf === 'CE') {
      const ceBairroEntries = proj.municipios.filter(m => isCeBairro(m.municipio));
      if (ceBairroEntries.length > 0) {
        setCeVisualizacao('bairros');
      }
    }
    // Carregar zonas do DF se necessário
    if (proj.uf === 'DF') {
      const zonaEntries = proj.municipios.filter(m => isDfZona(m.municipio));
      if (zonaEntries.length === 0) {
        // Projeção salva sem zonas: buscar dados históricos
        fetch(`/api/tse/zonas?municipio=BRAS%C3%8DLIA&uf=DF&ano=${proj.anoBase}&nome=${encodeURIComponent(proj.candidatoNome)}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => {
            if (d) {
              setDfZonas(d.locaisPorZona || []);
              setDfBounds(d.bounds || null);
            }
          })
          .catch(() => {});
      } else {
        // Já tem zonas — reconstruir dfZonas a partir dos dados salvos
        const zonas = zonaEntries.map(m => ({
          zona: getZonaNumber(m.municipio),
          latitude: 0,
          longitude: 0,
          votos: m.votosBase,
          bairros: [],
          locais: [],
        }));
        // Buscar coords reais
        fetch(`/api/tse/zonas?municipio=BRAS%C3%8DLIA&uf=DF&ano=${proj.anoBase}&nome=${encodeURIComponent(proj.candidatoNome)}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => {
            if (d?.locaisPorZona) {
              setDfZonas(d.locaisPorZona);
              setDfBounds(d.bounds || null);
            } else {
              setDfZonas(zonas);
            }
          })
          .catch(() => setDfZonas(zonas));
      }
    } else {
      setDfZonas([]);
      setDfBounds(null);
      // SP: buscar zonas em background para popular spDistritosVotes
      if (proj.uf === 'SP') {
        fetch(`/api/tse/candidato?ano=${proj.anoBase}&uf=SP&candidato=${encodeURIComponent(proj.candidatoNome)}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => {
            if (d && !d.multiplos && d.zonas?.length) {
              setElectoralData(prev => prev ? {
                ...prev,
                zonas: d.zonas,
                candidatoId: d.candidatoId ?? prev.candidatoId,
              } : prev);
            }
          })
          .catch(() => {});
      }
    }
  };

  const cenarioConfig = {
    conservador: { label: 'Conservador', icon: Shield, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500', border: 'border-amber-500', hex: '#F59E0B', bgInactive: 'bg-amber-50 dark:bg-amber-500/20 border-amber-400/60', textInactive: 'text-amber-700 dark:text-amber-300' },
    possivel:    { label: 'Realista',    icon: Gauge,  color: 'text-cyan-600 dark:text-cyan-300',   bg: 'bg-cyan-500',    border: 'border-cyan-500',    hex: '#22D3EE', bgInactive: 'bg-cyan-50 dark:bg-cyan-500/20 border-cyan-400/60',    textInactive: 'text-cyan-700 dark:text-cyan-300'   },
    arrojado:    { label: 'Otimista',   icon: Rocket, color: 'text-[color:var(--success)]',         bg: 'bg-emerald-500', border: 'border-emerald-500', hex: '#10B981', bgInactive: 'bg-emerald-50 dark:bg-emerald-500/20 border-emerald-400/60', textInactive: 'text-emerald-700 dark:text-emerald-300' }
  };

  return (
    <div className="flex flex-col gap-2">
      {!(electoralData && projecao) && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex-shrink-0"
        >
          <PageHeader
            icon={Target}
            title="Projeto de Campanha"
            subtitle="Planeje e projete seus votos para as próximas eleições"
          />
        </motion.div>
      )}

      {/* Search Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex-shrink-0"
      >
        {formCollapsed && electoralData ? (
          <Trilha
            passos={[
              { rotulo: 'Projeto de Campanha', onClick: voltarParaPesquisa },
              { rotulo: candidateName || electoralData.nome || 'Candidato' },
            ]}
            meta={`${ESTADOS_BRASIL.find(e => e.sigla === uf)?.nome ?? uf} · ${ano} → ${anoProjecao}`}
            acoes={
              <>
                <button type="button" onClick={voltarParaPesquisa}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-colors hover:bg-[var(--tint-06)]"
                  style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)', background: 'var(--bg-card)' }}>
                  <ArrowLeft className="h-3.5 w-3.5" /> Voltar
                </button>
                <button type="button" onClick={() => setFormCollapsed(false)}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-colors hover:bg-[var(--tint-06)]"
                  style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)', background: 'var(--bg-card)' }}>
                  <Pencil className="h-3.5 w-3.5" /> Editar busca
                </button>
                <button type="button" onClick={() => setShowNovoCandidatoModal(true)}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-all hover:brightness-110"
                  style={{ background: 'var(--brand-cobalt-soft)', border: '1px solid var(--brand-cobalt)', color: 'var(--brand-cobalt-text)' }}>
                  <Plus className="h-3.5 w-3.5" /> Novo candidato
                </button>
              </>
            }
          />
        ) : (
          <Painel
            titulo="Buscar candidato"
            icone={Search}
            direita={
              <button
                type="button"
                onClick={() => setShowNovoCandidatoModal(true)}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-all hover:brightness-110"
                style={{ background: 'var(--brand-cobalt-soft)', border: '1px solid var(--brand-cobalt)', color: 'var(--brand-cobalt-text)' }}
                title="Projeção para quem ainda não disputou eleição"
              >
                <Plus className="h-3.5 w-3.5" />
                Novo candidato
              </button>
            }
          >
            {/* Tudo numa faixa no computador; no celular cada campo na sua linha. */}
            <div className="grid grid-cols-2 lg:grid-cols-12 gap-3 items-end">
              <CampoBusca rotulo="Nome do candidato" className="col-span-2 lg:col-span-4">
                <Input
                  placeholder="Ex: João Silva, Tarcísio, Lula…"
                  value={candidateName}
                  onChange={(e) => setCandidateName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchCandidate()}
                  className="bg-[var(--bg-card-subtle)]/60 border-[var(--border-default)] text-[color:var(--text-primary)] placeholder:text-slate-600 dark:text-slate-500"
                />
              </CampoBusca>
              <CampoBusca rotulo="Ano da eleição" className="lg:col-span-2">
                <Select value={ano} onChange={(e) => escolherAnoBase(e.target.value)} options={anosOptions} />
              </CampoBusca>
              <CampoBusca rotulo="Estado" className="lg:col-span-2">
                <Select value={uf} onChange={(e) => setUf(e.target.value)} options={estadosOptions} />
              </CampoBusca>
              <CampoBusca rotulo="Projetar para" className="col-span-2 lg:col-span-2">
                <Select value={anoProjecao} onChange={() => {}} options={anosProjecaoOptions} disabled />
              </CampoBusca>
              <div className="col-span-2 lg:col-span-2">
                <Button onClick={() => searchCandidate()} loading={loading} className="w-full font-semibold">
                  <Search className="h-4 w-4 mr-2" />
                  Buscar
                </Button>
              </div>
            </div>
            <p className="mt-3 text-[11px] flex items-center gap-1.5" style={{ color: 'var(--text-tertiary)' }}>
              <Target className="h-3 w-3 flex-shrink-0" />
              A projeção parte dos votos da eleição escolhida e monta as metas de {anoProjecao} cidade por cidade.
            </p>
          </Painel>
        )}
      </motion.div>

      {electoralData && projecao && (
        <>
          {/* Cabeçalho do candidato: quem, onde, abas e salvar */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
          >
            <CabecalhoProjecao
              nome={projecao.candidatoNome || electoralData.nomeUrna || electoralData.candidateName || ''}
              cargo={projecao.cargo || electoralData.cargo || ''}
              estado={ESTADOS_BRASIL.find(e => e.sigla === projecao.uf)?.nome ?? projecao.uf}
              anoBase={projecao.anoBase}
              anoProjecao={projecao.anoProjecao}
              estreante={getTotalVotosBase() === 0}
              abas={[
                ...(electoralData?.candidatoId ? [{ chave: 'historico' as const, rotulo: `Dados ${ano}`, icone: BarChart3 }] : []),
                { chave: 'projecao' as const, rotulo: `Projeção ${anoProjecao}`, icone: Target },
              ]}
              abaAtiva={activeTab}
              onAba={setActiveTab}
              corCenario={cenarioConfig[cenarioAtivo].hex}
              onSalvar={saveProjecao}
              salvando={saving}
            />
          </motion.div>

          {/* Números da projeção */}
          {!mapFullscreen && (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
              <Indicador icone={BarChart3} rotulo={`Votos ${ano}`} cor="#2563eb"
                valor={getTotalVotosBase() > 0 ? getTotalVotosBase().toLocaleString('pt-BR') : '—'}
                detalhe={getTotalVotosBase() > 0 ? 'base da projeção' : 'candidatura nova'}
                destaque={filtroTipo !== 'todos'} />
              <Indicador icone={Target} rotulo={`Meta ${anoProjecao}`} cor={cenarioConfig[cenarioAtivo].hex}
                valor={<span style={{ color: cenarioConfig[cenarioAtivo].hex }}>{getTotalVotosMeta().toLocaleString('pt-BR')}</span>}
                detalhe={`cenário ${cenarioConfig[cenarioAtivo].label.toLowerCase()}`}
                destaque>
                {getTotalVotosBase() > 0 && (
                  <BarraSimples fracao={Math.min(1, getTotalVotosBase() / Math.max(getTotalVotosMeta(), 1))} cor={cenarioConfig[cenarioAtivo].hex} altura={5} />
                )}
              </Indicador>
              <Indicador icone={parseFloat(getCrescimento() as string) >= 0 ? TrendingUp : ArrowDown} rotulo="Crescimento"
                cor={parseFloat(getCrescimento() as string) >= 0 ? '#10b981' : '#ef4444'}
                valor={getTotalVotosBase() > 0
                  ? <span style={{ color: parseFloat(getCrescimento() as string) >= 0 ? 'var(--success)' : 'var(--danger)' }}>{parseFloat(getCrescimento() as string) >= 0 ? '+' : ''}{getCrescimento().toString().replace('.', ',')}%</span>
                  : '—'}
                detalhe={getTotalVotosBase() > 0 ? `${(getTotalVotosMeta() - getTotalVotosBase()) >= 0 ? '+' : '−'}${Math.abs(getTotalVotosMeta() - getTotalVotosBase()).toLocaleString('pt-BR')} votos` : 'sem base para comparar'} />
              <Indicador icone={MapPin} rotulo="Municípios" cor="#0891b2"
                valor={getMunicipiosCount().toLocaleString('pt-BR')}
                detalhe={filtroTipo !== 'todos'
                  ? `de ${projecao.municipios.filter(m => !isDfZona(m.municipio) && !isDfRegiao(m.municipio) && !isSpDistrito(m.municipio) && !isRjBairro(m.municipio) && !isCeBairro(m.municipio) && !isMgBairro(m.municipio) && !isMunBairro(m.municipio)).length.toLocaleString('pt-BR')} no total`
                  : 'na projeção'}
                destaque={filtroTipo !== 'todos'} />
              <Indicador icone={Handshake} rotulo="Dobradas" cor="#3b82f6"
                valor={getDobradasCount().toLocaleString('pt-BR')}
                detalhe={getVotosComDobrada() > 0 ? `${getVotosComDobrada().toLocaleString('pt-BR')} votos na meta` : 'nenhuma ainda'}
                destaque={filtroTipo === 'com_dobrada'} />
              <Indicador icone={Users} rotulo="Parcerias" cor="#d97706"
                valor={(parceriasStats?.total || 0).toLocaleString('pt-BR')}
                detalhe={includeParcerias
                  ? `+${((cenarioAtivo === 'conservador' ? parceriasStats?.metaConservadoraTotal : cenarioAtivo === 'possivel' ? parceriasStats?.metaPossivelTotal : parceriasStats?.metaArrojadaTotal) || 0).toLocaleString('pt-BR')} votos na meta`
                  : 'fora da simulação'}
                destaque={filtroTipo === 'parcerias'}
                apagado={!includeParcerias}
                acao={
                  <button type="button" onClick={() => setIncludeParcerias(!includeParcerias)}
                    className="p-1 rounded-md transition-colors hover:bg-[var(--tint-06)]"
                    style={{ color: includeParcerias ? '#d97706' : 'var(--text-tertiary)' }}
                    title={includeParcerias ? 'Tirar as parcerias da simulação' : 'Pôr as parcerias na simulação'}
                    aria-label={includeParcerias ? 'Tirar as parcerias da simulação' : 'Pôr as parcerias na simulação'}>
                    {includeParcerias ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </button>
                } />
            </div>
          )}

          {/* Main 12-column grid */}
          <div className={mapFullscreen
            ? 'fixed inset-0 z-[2000] bg-[var(--bg-card)] flex'
            // Telas grandes: laterais com largura fixa e o mapa com o resto.
            : 'grid grid-cols-12 2xl:grid-cols-[18rem_minmax(0,1fr)_18rem] gap-4 items-start'
          }>
            {/* LEFT SIDEBAR — scenario + stats + municipality list
                Antes era `hidden md:flex`: no celular o seletor de cenário não
                existia, e a pessoa não tinha como trocar entre Conservador,
                Realista e Otimista. Agora aparece em qualquer largura — no
                celular, logo abaixo do mapa, com a altura do próprio conteúdo. */}
            {!mapFullscreen && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 }}
                className="flex col-span-12 order-2 md:col-span-4 lg:col-span-3 2xl:col-span-1 md:order-1 flex-col md:h-[calc(100vh-160px)] md:min-h-[340px]"
              >
                <PainelCenarios
                  cenarios={(['conservador', 'possivel', 'arrojado'] as CenarioType[]).map(c => ({
                    chave: c,
                    rotulo: cenarioConfig[c].label,
                    descricao: c === 'conservador' ? 'Meta alcançável e segura' : c === 'possivel' ? 'Crescimento equilibrado' : 'Meta ambiciosa de expansão',
                    icone: cenarioConfig[c].icon,
                    cor: cenarioConfig[c].hex,
                    meta: getTotalMetaCenario(c),
                  }))}
                  ativo={cenarioAtivo}
                  onEscolher={setCenarioAtivo}
                  base={getTotalVotosBase()}
                  anoBase={ano}
                  anoProjecao={anoProjecao}
                  parcerias={getParceriasNoCenario(cenarioAtivo)}
                />
              </motion.div>
            )}

            {/* RIGHT SIDEBAR — municipality list
                Antes era `hidden lg:flex`: abaixo de 1024px (celular e tablet) a
                lista de municípios, os filtros e a edição de cada um sumiam.
                Agora, abaixo disso, ela vem numa linha própria depois do mapa,
                com altura fixa e rolagem interna — sem altura a lista cresceria
                até o tamanho de todos os municípios do estado. */}
            {!mapFullscreen && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="flex col-span-12 order-3 lg:col-span-3 2xl:col-span-1 lg:order-3 flex-col h-[34rem] lg:h-[calc(100vh-160px)] lg:min-h-[340px]"
              >
                {/* Municipality List */}
                <Card className="flex flex-col h-full !rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}>
                  <CardHeader className="border-b border-[var(--border-default)] py-3">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-[color:var(--text-primary)] text-sm flex items-center gap-2">
                        {visualizacaoMapa === 'bairro' && ['VEREADOR', 'PREFEITO'].some(c => (electoralData?.cargo ?? '').toUpperCase().includes(c)) ? (
                          <>
                            <Home className="h-4 w-4 text-[color:var(--success)]" />
                            {(electoralData?.cargo ?? '').toUpperCase().includes('PREFEITO')
                              ? 'Município'
                              : uf === 'SP' && normMunKey(municipioVereador) === 'SAO PAULO'
                                ? 'Distritos'
                                : 'Bairros'}
                          </>
                        ) : uf === 'DF' && getFilteredDfZonas().length > 0 ? (
                          <>
                            <Vote className="h-4 w-4 text-sky-400" />
                            Zonas Eleitorais
                          </>
                        ) : (
                          <>
                            <MapPin className="h-4 w-4 text-[color:var(--brand-cobalt)]" />
                            Municípios
                          </>
                        )}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant="info" className="text-xs">
                          {visualizacaoMapa === 'bairro' && ['VEREADOR', 'PREFEITO'].some(c => (electoralData?.cargo ?? '').toUpperCase().includes(c))
                            ? (uf === 'SP' && normMunKey(municipioVereador) === 'SAO PAULO' && Object.keys(spDistritosVotesDisplay).length > 0
                              ? Object.keys(spDistritosVotesDisplay).length
                              : filteredBairros.length)
                            : uf === 'DF' && getFilteredDfZonas().length > 0
                              ? getFilteredDfZonas().length
                              : getFilteredMunicipios().length}
                        </Badge>
                        {visualizacaoMapa !== 'bairro' && !(uf === 'DF' && getFilteredDfZonas().length > 0) && (
                          <button
                            onClick={openAddModal}
                            className="p-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors"
                            title="Adicionar município"
                          >
                            <Plus className="h-4 w-4 text-[color:var(--text-primary)]" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 space-y-2">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600 dark:text-slate-400" />
                        <input
                          type="text"
                          placeholder={visualizacaoMapa === 'bairro' && ['VEREADOR', 'PREFEITO'].some(c => (electoralData?.cargo ?? '').toUpperCase().includes(c))
                            ? "Pesquisar bairro..."
                            : "Pesquisar município..."}
                          value={searchMunicipio}
                          onChange={(e) => {
                            setSearchMunicipio(e.target.value);
                            if (e.target.value && municipiosDisponiveis.length === 0) loadMunicipiosDisponiveis();
                          }}
                          className="w-full bg-[var(--bg-card-subtle)] border border-[var(--border-default)] rounded-lg pl-9 pr-3 py-2 text-sm text-[color:var(--text-primary)] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                        />
                      </div>
                      {/* Filtros - só mostrar para view de municípios */}
                      {!(visualizacaoMapa === 'bairro' && ['VEREADOR', 'PREFEITO'].some(c => (electoralData?.cargo ?? '').toUpperCase().includes(c))) && (
                      <div className="flex gap-1.5 flex-wrap">
                        <ChipFiltro ativo={filtroTipo === 'todos'} onClick={() => setFiltroTipo('todos')}>Todos</ChipFiltro>
                        <ChipFiltro ativo={filtroTipo === 'com_dobrada'} cor="#3b82f6" onClick={() => setFiltroTipo('com_dobrada')}>Com dobrada</ChipFiltro>
                        <ChipFiltro ativo={filtroTipo === 'sem_dobrada'} cor="#64748b" onClick={() => setFiltroTipo('sem_dobrada')}>Sem dobrada</ChipFiltro>
                        <ChipFiltro ativo={filtroTipo === 'parcerias'} cor="#d97706" onClick={() => setFiltroTipo('parcerias')}>Parcerias</ChipFiltro>
                      </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-0 flex-1 overflow-y-auto">
                    {/* Lista municipality content — duplicated from old section below (which will be hidden) */}
                    {visualizacaoMapa === 'bairro' && ['VEREADOR', 'PREFEITO'].some(c => (electoralData?.cargo ?? '').toUpperCase().includes(c)) ? (
                      <div className="divide-y divide-[var(--border-default)]">
                        {uf === 'SP' && normMunKey(municipioVereador) === 'SAO PAULO' && Object.keys(spDistritosVotesDisplay).length > 0 ? (
                          // SP capital — lista de distritos municipais
                          (() => {
                            const allVotes = Object.values(spDistritosVotesDisplay);
                            const media = allVotes.length > 0 ? allVotes.reduce((s, v) => s + v, 0) / allVotes.length : 0;
                            const entries = Object.entries(spDistritosVotesDisplay)
                              .filter(([nome]) => !searchMunicipio || nome.toLowerCase().includes(searchMunicipio.toLowerCase()))
                              .sort(([, a], [, b]) => b - a);
                            if (entries.length === 0) return (
                              <div className="p-4 text-center text-slate-600 dark:text-slate-400 text-sm">Nenhum distrito encontrado</div>
                            );
                            return entries.map(([distrito, votos], idx) => {
                              const percentTotal = electoralData?.totalVotos
                                ? ((votos / electoralData.totalVotos) * 100).toFixed(1)
                                : '0';
                              const category = votos > media ? 'acima' : votos > 0 ? 'abaixo' : 'zero';
                              return (
                                <div
                                  key={idx}
                                  className={`px-3 py-2 hover:bg-[var(--bg-card-subtle)]/50 cursor-pointer transition-colors ${
                                    category === 'acima' ? 'bg-emerald-900/10 border-l-2 border-emerald-500' :
                                    category === 'abaixo' ? 'bg-blue-900/10 border-l-2 border-blue-500' :
                                    'border-l-2 border-[var(--border-default)]'
                                  }`}
                                  onClick={() => handleSpDistritoClick(distrito)}
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                      <span className={`text-xs px-1 py-0.5 rounded ${
                                        category === 'acima' ? 'bg-emerald-600' :
                                        category === 'abaixo' ? 'bg-blue-600' : 'bg-slate-600'
                                      }`}>
                                        {category === 'acima' ? '🟢' : category === 'abaixo' ? '🔵' : '⚫'}
                                      </span>
                                      <span className="text-[color:var(--text-primary)] font-semibold text-xs truncate tracking-wide uppercase">{distrito}</span>
                                    </div>
                                    <Badge variant={category === 'acima' ? 'success' : category === 'abaixo' ? 'info' : 'default'} className="text-xs">
                                      {percentTotal}%
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className={`font-medium ${
                                      category === 'acima' ? 'text-[color:var(--success)]' :
                                      category === 'abaixo' ? 'text-blue-400' : 'text-slate-600 dark:text-slate-400'
                                    }`}>
                                      {votos.toLocaleString()} votos
                                    </span>
                                  </div>
                                </div>
                              );
                            });
                          })()
                        ) : (
                          <>
                            {filteredBairros
                              .sort((a, b) => b.votos - a.votos)
                              .map((bairro, idx) => {
                                const category = getBairroCategory(bairro.votos);
                                const percentTotal = electoralData?.totalVotos
                                  ? ((bairro.votos / electoralData.totalVotos) * 100).toFixed(1)
                                  : '0';
                                return (
                                  <div
                                    key={idx}
                                    className={`px-3 py-2 hover:bg-[var(--bg-card-subtle)]/50 cursor-pointer transition-colors ${
                                      category === 'acima' ? 'bg-emerald-900/10 border-l-2 border-emerald-500' :
                                      category === 'abaixo' ? 'bg-blue-900/10 border-l-2 border-blue-500' :
                                      'border-l-2 border-[var(--border-default)]'
                                    }`}
                                    onClick={() => handleBairroClick(bairro.bairro, bairro.votos)}
                                  >
                                    <div className="flex items-center justify-between mb-1">
                                      <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <span className={`text-xs px-1 py-0.5 rounded ${
                                          category === 'acima' ? 'bg-emerald-600' :
                                          category === 'abaixo' ? 'bg-blue-600' : 'bg-slate-600'
                                        }`}>
                                          {category === 'acima' ? '🟢' : category === 'abaixo' ? '🔵' : '⚫'}
                                        </span>
                                        <span className="text-[color:var(--text-primary)] font-semibold text-xs truncate tracking-wide uppercase">
                                          {bairro.bairro}
                                        </span>
                                      </div>
                                      <Badge variant={category === 'acima' ? 'success' : category === 'abaixo' ? 'info' : 'default'} className="text-xs">
                                        {percentTotal}%
                                      </Badge>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs">
                                      <span className={`font-medium ${
                                        category === 'acima' ? 'text-[color:var(--success)]' :
                                        category === 'abaixo' ? 'text-blue-400' : 'text-slate-600 dark:text-slate-400'
                                      }`}>
                                        {bairro.votos.toLocaleString()} votos
                                      </span>
                                      <span className="text-slate-600 dark:text-slate-500">•</span>
                                      <span className="text-slate-600 dark:text-slate-500">Zonas: {bairro.zonas.join(', ')}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            {filteredBairros.length === 0 && (
                              <div className="p-4 text-center text-slate-600 dark:text-slate-400 text-sm">
                                Nenhum bairro encontrado
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ) : uf === 'DF' && getFilteredDfZonas().length > 0 ? (
                      <div className="divide-y divide-[var(--border-default)]">
                        {getFilteredDfZonas().map((mun, idx) => {
                          const zonaNum = getZonaNumber(mun.municipio);
                          const metaAtiva = getMetaAtiva(mun);
                          const diff = metaAtiva - mun.votosBase;
                          const diffPercent = mun.votosBase > 0 ? ((diff / mun.votosBase) * 100).toFixed(0) : 0;
                          const isSelected = selectedDfZona === zonaNum;
                          return (
                            <div
                              key={idx}
                              className={`px-3 py-2 hover:bg-[var(--bg-card-subtle)]/50 cursor-pointer transition-colors group ${
                                isSelected ? 'bg-sky-900/30 border-l-2 border-sky-400' :
                                mun.dobradaAtiva ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-400 dark:border-blue-500' : ''
                              }`}
                              onClick={() => {
                                const zonaPin = dfZonasDisplay.find(z => z.zona === zonaNum);
                                if (zonaPin) handleDfZonaClick(zonaPin);
                              }}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <Vote className="h-3.5 w-3.5 text-sky-400 flex-shrink-0" />
                                  <span className="text-[color:var(--text-primary)] font-medium text-sm">
                                    Zona {zonaNum}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {mun.dobradaAtiva && (
                                    <Badge variant="info" className="text-xs bg-blue-600">
                                      DOBRADA
                                    </Badge>
                                  )}
                                  {mun.prioridade && mun.prioridade !== 'MEDIA' && (
                                    <Badge
                                      variant={mun.prioridade === 'ALTA' ? 'danger' : 'default'}
                                      className="text-xs"
                                    >
                                      {mun.prioridade === 'ALTA' ? '!' : '○'}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-slate-600 dark:text-slate-400">
                                  {ano}: <span className="text-sky-600 dark:text-sky-400 font-medium">{mun.votosBase.toLocaleString()}</span>
                                </span>
                                <span className="text-slate-600 dark:text-slate-500">→</span>
                                <span className={cenarioConfig[cenarioAtivo].color}>
                                  {metaAtiva.toLocaleString()}
                                </span>
                                {diff !== 0 && (
                                  <span className={`ml-auto ${diff > 0 ? 'text-[color:var(--success)]' : 'text-red-400'}`}>
                                    {diff > 0 ? '+' : ''}{diffPercent}%
                                  </span>
                                )}
                              </div>
                              {mun.dobradaAtiva && mun.dobradaNome && (
                                <div className="mt-1 text-xs text-blue-600 dark:text-blue-300">
                                  🤝 com {mun.dobradaNome}{mun.dobradaPartido ? ` (${mun.dobradaPartido})` : ''}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : uf === 'DF' && dfVisualizacao === 'regioes' && getFilteredDfRegioes().length > 0 ? (
                      <div className="divide-y divide-[var(--border-default)]">
                        {getFilteredDfRegioes().map((mun, idx) => {
                          const regiaoNome = getRegiaoNome(mun.municipio);
                          const metaAtiva = getMetaAtiva(mun);
                          const diff = metaAtiva - mun.votosBase;
                          const diffPercent = mun.votosBase > 0 ? ((diff / mun.votosBase) * 100).toFixed(0) : 0;
                          const isSelected = selectedDfRegiao === regiaoNome;
                          return (
                            <div
                              key={idx}
                              className={`px-3 py-2 hover:bg-[var(--bg-card-subtle)]/50 cursor-pointer transition-colors group ${
                                isSelected ? 'bg-sky-900/30 border-l-2 border-sky-400' :
                                mun.dobradaAtiva ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-400 dark:border-blue-500' : ''
                              }`}
                              onClick={() => handleDfRegiaoClick(regiaoNome)}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <MapPin className="h-3.5 w-3.5 text-[color:var(--brand-cobalt)] flex-shrink-0" />
                                  <span className="text-[color:var(--text-primary)] font-semibold text-xs truncate tracking-wide uppercase">
                                    {regiaoNome}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {mun.dobradaAtiva && (
                                    <Badge variant="info" className="text-xs bg-blue-600">DOBRADA</Badge>
                                  )}
                                  {mun.prioridade && mun.prioridade !== 'MEDIA' && (
                                    <Badge variant={mun.prioridade === 'ALTA' ? 'danger' : 'default'} className="text-xs">
                                      {mun.prioridade === 'ALTA' ? '!' : '○'}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-slate-600 dark:text-slate-400">
                                  {ano}: <span className="text-sky-600 dark:text-sky-400 font-medium">{mun.votosBase.toLocaleString()}</span>
                                </span>
                                <span className="text-slate-600 dark:text-slate-500">→</span>
                                <span className={cenarioConfig[cenarioAtivo].color}>{metaAtiva.toLocaleString()}</span>
                                {diff !== 0 && (
                                  <span className={`ml-auto ${diff > 0 ? 'text-[color:var(--success)]' : 'text-red-400'}`}>
                                    {diff > 0 ? '+' : ''}{diffPercent}%
                                  </span>
                                )}
                              </div>
                              {mun.dobradaAtiva && mun.dobradaNome && (
                                <div className="mt-1 text-xs text-blue-600 dark:text-blue-300">
                                  🤝 com {mun.dobradaNome}{mun.dobradaPartido ? ` (${mun.dobradaPartido})` : ''}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : uf === 'SP' && spVisualizacao === 'distritos' && getFilteredSpDistritos().length > 0 ? (
                      <div className="divide-y divide-[var(--border-default)]">
                        {getFilteredSpDistritos().map((mun, idx) => {
                          const distNome = getDistritoNome(mun.municipio);
                          const metaAtiva = getMetaAtiva(mun);
                          const diff = metaAtiva - mun.votosBase;
                          const diffPercent = mun.votosBase > 0 ? ((diff / mun.votosBase) * 100).toFixed(0) : 0;
                          const isSelected = selectedSpDistrito === distNome;
                          return (
                            <div
                              key={idx}
                              className={`px-3 py-2 hover:bg-[var(--bg-card-subtle)]/50 cursor-pointer transition-colors group ${
                                isSelected ? 'bg-violet-900/30 border-l-2 border-violet-400' :
                                mun.dobradaAtiva ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-400 dark:border-blue-500' : ''
                              }`}
                              onClick={() => handleSpDistritoClick(distNome)}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <MapPin className="h-3.5 w-3.5 text-violet-400 flex-shrink-0" />
                                  <span className="text-[color:var(--text-primary)] font-semibold text-xs truncate tracking-wide uppercase">{distNome}</span>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {mun.dobradaAtiva && <Badge variant="info" className="text-xs bg-blue-600">DOBRADA</Badge>}
                                  {mun.prioridade && mun.prioridade !== 'MEDIA' && (
                                    <Badge variant={mun.prioridade === 'ALTA' ? 'danger' : 'default'} className="text-xs">
                                      {mun.prioridade === 'ALTA' ? '!' : '○'}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-slate-600 dark:text-slate-400">Meta: <span className="text-violet-400 font-medium">{mun.votosBase.toLocaleString()}</span></span>
                                <span className="text-slate-600 dark:text-slate-500">→</span>
                                <span className={cenarioConfig[cenarioAtivo].color}>{metaAtiva.toLocaleString()}</span>
                                {diff !== 0 && <span className={`ml-auto ${diff > 0 ? 'text-[color:var(--success)]' : 'text-red-400'}`}>{diff > 0 ? '+' : ''}{diffPercent}%</span>}
                              </div>
                              {mun.dobradaAtiva && mun.dobradaNome && (
                                <div className="mt-1 text-xs text-blue-600 dark:text-blue-300">🤝 com {mun.dobradaNome}{mun.dobradaPartido ? ` (${mun.dobradaPartido})` : ''}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : uf === 'RJ' && rjVisualizacao === 'bairros' && getFilteredRjBairros().length > 0 ? (
                      <div className="divide-y divide-[var(--border-default)]">
                        {getFilteredRjBairros().map((mun, idx) => {
                          const bairroNome = getRjBairroNome(mun.municipio);
                          const metaAtiva = getMetaAtiva(mun);
                          const diff = metaAtiva - mun.votosBase;
                          const diffPercent = mun.votosBase > 0 ? ((diff / mun.votosBase) * 100).toFixed(0) : 0;
                          const isSelected = selectedRjBairro === bairroNome;
                          return (
                            <div
                              key={idx}
                              className={`px-3 py-2 hover:bg-[var(--bg-card-subtle)]/50 cursor-pointer transition-colors group ${
                                isSelected ? 'bg-emerald-900/30 border-l-2 border-emerald-400' :
                                mun.dobradaAtiva ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-400 dark:border-blue-500' : ''
                              }`}
                              onClick={() => handleRjBairroClick(bairroNome)}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <MapPin className="h-3.5 w-3.5 text-[color:var(--success)] flex-shrink-0" />
                                  <span className="text-[color:var(--text-primary)] font-semibold text-xs truncate tracking-wide uppercase">{bairroNome}</span>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {mun.dobradaAtiva && <Badge variant="info" className="text-xs bg-blue-600">DOBRADA</Badge>}
                                  {mun.prioridade && mun.prioridade !== 'MEDIA' && (
                                    <Badge variant={mun.prioridade === 'ALTA' ? 'danger' : 'default'} className="text-xs">
                                      {mun.prioridade === 'ALTA' ? '!' : '○'}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-slate-600 dark:text-slate-400">Meta: <span className="text-[color:var(--success)] font-medium">{mun.votosBase.toLocaleString()}</span></span>
                                <span className="text-slate-600 dark:text-slate-500">→</span>
                                <span className={cenarioConfig[cenarioAtivo].color}>{metaAtiva.toLocaleString()}</span>
                                {diff !== 0 && <span className={`ml-auto ${diff > 0 ? 'text-[color:var(--success)]' : 'text-red-400'}`}>{diff > 0 ? '+' : ''}{diffPercent}%</span>}
                              </div>
                              {mun.dobradaAtiva && mun.dobradaNome && (
                                <div className="mt-1 text-xs text-blue-600 dark:text-blue-300">🤝 com {mun.dobradaNome}{mun.dobradaPartido ? ` (${mun.dobradaPartido})` : ''}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : uf === 'CE' && ceVisualizacao === 'bairros' && getFilteredCeBairros().length > 0 ? (
                      <div className="divide-y divide-[var(--border-default)]">
                        {getFilteredCeBairros().map((mun, idx) => {
                          const bairroNome = getCeBairroNome(mun.municipio);
                          const metaAtiva = getMetaAtiva(mun);
                          const diff = metaAtiva - mun.votosBase;
                          const diffPercent = mun.votosBase > 0 ? ((diff / mun.votosBase) * 100).toFixed(0) : 0;
                          const isSelected = selectedCeBairro === bairroNome;
                          return (
                            <div
                              key={idx}
                              className={`px-3 py-2 hover:bg-[var(--bg-card-subtle)]/50 cursor-pointer transition-colors group ${
                                isSelected ? 'bg-orange-900/30 border-l-2 border-orange-400' :
                                mun.dobradaAtiva ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-400 dark:border-blue-500' : ''
                              }`}
                              onClick={() => handleCeBairroClick(bairroNome)}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <MapPin className="h-3.5 w-3.5 text-orange-400 flex-shrink-0" />
                                  <span className="text-[color:var(--text-primary)] font-semibold text-xs truncate tracking-wide uppercase">{bairroNome}</span>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {mun.dobradaAtiva && <Badge variant="info" className="text-xs bg-blue-600">DOBRADA</Badge>}
                                  {mun.prioridade && mun.prioridade !== 'MEDIA' && (
                                    <Badge variant={mun.prioridade === 'ALTA' ? 'danger' : 'default'} className="text-xs">
                                      {mun.prioridade === 'ALTA' ? '!' : '○'}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-slate-600 dark:text-slate-400">Meta: <span className="text-orange-400 font-medium">{mun.votosBase.toLocaleString()}</span></span>
                                <span className="text-slate-600 dark:text-slate-500">→</span>
                                <span className={cenarioConfig[cenarioAtivo].color}>{metaAtiva.toLocaleString()}</span>
                                {diff !== 0 && <span className={`ml-auto ${diff > 0 ? 'text-[color:var(--success)]' : 'text-red-400'}`}>{diff > 0 ? '+' : ''}{diffPercent}%</span>}
                              </div>
                              {mun.dobradaAtiva && mun.dobradaNome && (
                                <div className="mt-1 text-xs text-blue-600 dark:text-blue-300">🤝 com {mun.dobradaNome}{mun.dobradaPartido ? ` (${mun.dobradaPartido})` : ''}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : uf === 'MG' && mgVisualizacao === 'bairros' && getFilteredMgBairros().length > 0 ? (
                      <div className="divide-y divide-[var(--border-default)]">
                        {getFilteredMgBairros().map((mun, idx) => {
                          const bairroNome = getMgBairroNome(mun.municipio);
                          const metaAtiva = getMetaAtiva(mun);
                          const diff = metaAtiva - mun.votosBase;
                          const diffPercent = mun.votosBase > 0 ? ((diff / mun.votosBase) * 100).toFixed(0) : 0;
                          const isSelected = selectedMgBairro === bairroNome;
                          return (
                            <div
                              key={idx}
                              className={`px-3 py-2 hover:bg-[var(--bg-card-subtle)]/50 cursor-pointer transition-colors group ${
                                isSelected ? 'bg-violet-900/30 border-l-2 border-violet-400' :
                                mun.dobradaAtiva ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-400 dark:border-blue-500' : ''
                              }`}
                              onClick={() => setSelectedMgBairro(prev => prev === bairroNome ? null : bairroNome)}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <MapPin className="h-3.5 w-3.5 text-violet-400 flex-shrink-0" />
                                  <span className="text-[color:var(--text-primary)] font-semibold text-xs truncate tracking-wide uppercase">{bairroNome}</span>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {mun.dobradaAtiva && <Badge variant="info" className="text-xs bg-blue-600">DOBRADA</Badge>}
                                  {mun.prioridade && mun.prioridade !== 'MEDIA' && (
                                    <Badge variant={mun.prioridade === 'ALTA' ? 'danger' : 'default'} className="text-xs">
                                      {mun.prioridade === 'ALTA' ? '!' : '○'}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-slate-600 dark:text-slate-400">Meta: <span className="text-violet-400 font-medium">{mun.votosBase.toLocaleString()}</span></span>
                                <span className="text-slate-600 dark:text-slate-500">→</span>
                                <span className={cenarioConfig[cenarioAtivo].color}>{metaAtiva.toLocaleString()}</span>
                                {diff !== 0 && <span className={`ml-auto ${diff > 0 ? 'text-[color:var(--success)]' : 'text-red-400'}`}>{diff > 0 ? '+' : ''}{diffPercent}%</span>}
                              </div>
                              {mun.dobradaAtiva && mun.dobradaNome && (
                                <div className="mt-1 text-xs text-blue-600 dark:text-blue-300">🤝 com {mun.dobradaNome}{mun.dobradaPartido ? ` (${mun.dobradaPartido})` : ''}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : visualizacaoMapa === 'bairro' && genPoligonosMunicipio && genPoligonosUf ? (
                      Object.keys(genBairrosApiVotes).length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600 dark:text-slate-400">
                          <MapPin className="h-8 w-8 text-sky-400 opacity-50" />
                          <span className="text-sm text-center px-4">Carregando bairros de {genPoligonosMunicipio}…</span>
                        </div>
                      ) : (
                        <div className="divide-y divide-[var(--border-default)]">
                          {(() => {
                            const normFn = (s: string) =>
                              s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
                            return Object.entries(genBairrosApiVotes)
                              .map(([nome, votosBase]) => {
                                const nomeNorm = normFn(nome);
                                const votosDisplay = genBairrosVotesDisplay[nomeNorm] ?? votosBase;
                                return { nome, votosBase, votosDisplay };
                              })
                              .sort((a, b) => b.votosDisplay - a.votosDisplay)
                              .map(({ nome, votosBase, votosDisplay }, idx) => {
                                const isSelected = selectedGenBairro ? normFn(nome) === normFn(selectedGenBairro) : false;
                                const diff = votosDisplay - votosBase;
                                const diffPercent = votosBase > 0 ? ((diff / votosBase) * 100).toFixed(0) : 0;
                                return (
                                  <div
                                    key={idx}
                                    className={`px-3 py-2 hover:bg-[var(--bg-card-subtle)]/50 cursor-pointer transition-colors group ${
                                      isSelected ? 'bg-sky-900/30 border-l-2 border-sky-400' : ''
                                    }`}
                                    onClick={() => {
                                      setSelectedGenBairro(prev =>
                                        prev && normFn(prev) === normFn(nome) ? null : nome
                                      );
                                      handleBairroClick(nome, votosDisplay);
                                    }}
                                  >
                                    <div className="flex items-center justify-between mb-1">
                                      <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <MapPin className="h-3.5 w-3.5 text-sky-400 flex-shrink-0" />
                                        <span className="text-[color:var(--text-primary)] font-semibold text-xs truncate tracking-wide uppercase">{nome}</span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs">
                                      <span className="text-slate-600 dark:text-slate-400">Votos: <span className="text-sky-400 font-medium">{votosBase.toLocaleString()}</span></span>
                                      {diff !== 0 && (
                                        <>
                                          <span className="text-slate-600 dark:text-slate-500">→</span>
                                          <span className={cenarioConfig[cenarioAtivo].color}>{votosDisplay.toLocaleString()}</span>
                                          <span className={`ml-auto ${diff > 0 ? 'text-[color:var(--success)]' : 'text-red-400'}`}>{diff > 0 ? '+' : ''}{diffPercent}%</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                );
                              });
                          })()}
                        </div>
                      )
                    ) : visualizacaoMapa === 'bairro' && getFilteredMunBairros().length > 0 ? (
                      <div className="divide-y divide-[var(--border-default)]">
                        {getFilteredMunBairros().map((mun, idx) => {
                          const bairroNome = getMunBairroNome(mun.municipio);
                          const metaAtiva = getMetaAtiva(mun);
                          const diff = metaAtiva - mun.votosBase;
                          const diffPercent = mun.votosBase > 0 ? ((diff / mun.votosBase) * 100).toFixed(0) : 0;
                          return (
                            <div
                              key={idx}
                              className={`px-3 py-2 hover:bg-[var(--bg-card-subtle)]/50 cursor-pointer transition-colors group ${
                                mun.dobradaAtiva ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-400 dark:border-blue-500' : ''
                              }`}
                              onClick={() => handleBairroClick(bairroNome, mun.votosBase)}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <MapPin className="h-3.5 w-3.5 text-sky-400 flex-shrink-0" />
                                  <span className="text-[color:var(--text-primary)] font-semibold text-xs truncate tracking-wide uppercase">{bairroNome}</span>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {mun.dobradaAtiva && <Badge variant="info" className="text-xs bg-blue-600">DOBRADA</Badge>}
                                  {mun.prioridade && mun.prioridade !== 'MEDIA' && (
                                    <Badge variant={mun.prioridade === 'ALTA' ? 'danger' : 'default'} className="text-xs">
                                      {mun.prioridade === 'ALTA' ? '!' : '○'}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-slate-600 dark:text-slate-400">Base: <span className="text-sky-400 font-medium">{mun.votosBase.toLocaleString()}</span></span>
                                <span className="text-slate-600 dark:text-slate-500">→</span>
                                <span className={cenarioConfig[cenarioAtivo].color}>{metaAtiva.toLocaleString()}</span>
                                {diff !== 0 && <span className={`ml-auto ${diff > 0 ? 'text-[color:var(--success)]' : 'text-red-400'}`}>{diff > 0 ? '+' : ''}{diffPercent}%</span>}
                              </div>
                              {mun.dobradaAtiva && mun.dobradaNome && (
                                <div className="mt-1 text-xs text-blue-600 dark:text-blue-300">🤝 com {mun.dobradaNome}{mun.dobradaPartido ? ` (${mun.dobradaPartido})` : ''}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="divide-y divide-[var(--border-default)]">
                        {(() => {
                          const lista = getFilteredMunicipios().sort((a, b) => b.votosBase - a.votosBase);
                          const maiorMeta = lista.reduce((mx, m) => Math.max(mx, getMetaAtiva(m)), 0);
                          return lista.map((mun, idx) => {
                            const bairrosDelta = getBairrosDeltaMunicipio(mun.municipio, cenarioAtivo);
                            const isNew = mun.votosBase === 0;
                            return (
                              <LinhaMunicipio
                                key={mun.municipio}
                                posicao={idx + 1}
                                nome={mun.municipio}
                                base={mun.votosBase}
                                meta={getMetaAtiva(mun)}
                                anoBase={ano}
                                maiorMeta={maiorMeta}
                                cor={cenarioConfig[cenarioAtivo].hex}
                                novo={isNew}
                                dobrada={!!mun.dobradaAtiva}
                                dobradaNome={mun.dobradaNome ? `${mun.dobradaNome}${mun.dobradaPartido ? ` (${mun.dobradaPartido})` : ''}` : undefined}
                                prioridadeAlta={mun.prioridade === 'ALTA'}
                                extra={bairrosDelta > 0 ? (
                                  <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(56,189,248,0.15)', color: 'var(--acento-azul)' }}>
                                    +{bairrosDelta.toLocaleString('pt-BR')} bairros
                                  </span>
                                ) : undefined}
                                onClick={() => handleMunicipioClick(mun.municipio)}
                                onRemover={isNew ? () => removeMunicipio(mun.municipio) : undefined}
                              />
                            );
                          });
                        })()}
                        {getFilteredMunicipios().length === 0 && (() => {
                          if (!searchMunicipio.trim()) {
                            return (
                              <div className="p-4 text-center text-slate-600 dark:text-slate-400 text-sm">
                                Nenhum município encontrado
                              </div>
                            );
                          }
                          const q = searchMunicipio.toLowerCase();
                          const sugestoes = municipiosDisponiveis
                            .filter(nome => nome.toLowerCase().includes(q))
                            .filter(nome => !projecao?.municipios.some(m => m.municipio.toUpperCase() === nome.toUpperCase()))
                            .slice(0, 8);
                          if (sugestoes.length === 0) {
                            return (
                              <div className="p-4 text-center text-slate-600 dark:text-slate-400 text-sm">
                                Nenhum município encontrado
                              </div>
                            );
                          }
                          return (
                            <div>
                              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                Adicionar à projeção
                              </p>
                              {sugestoes.map(nome => (
                                <div
                                  key={nome}
                                  className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-[var(--bg-card-subtle)]/70 cursor-pointer border-b border-[var(--border-default)]"
                                  onClick={() => {
                                    if (!projecao) return;
                                    setProjecao(prev => {
                                      if (!prev) return prev;
                                      return {
                                        ...prev,
                                        municipios: [...prev.municipios, {
                                          municipio: nome.toUpperCase(),
                                          votosBase: 0,
                                          metaConservadora: 0,
                                          metaPossivel: 0,
                                          metaArrojada: 0,
                                          prioridade: 'MEDIA',
                                          dobradaAtiva: false,
                                        }],
                                      };
                                    });
                                    setSearchMunicipio('');
                                    toast.success(`${nome} adicionado à projeção`);
                                  }}
                                >
                                  <span className="text-sm text-[color:var(--text-primary)] font-medium">{nome}</span>
                                  <span className="text-[10px] text-emerald-400 font-semibold flex-shrink-0">+ Adicionar</span>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </CardContent>
                </Card>

              </motion.div>
            )}

            {/* MAP — takes remaining space */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className={mapFullscreen ? 'flex-1 min-w-0 relative overflow-hidden' : 'col-span-12 md:col-span-8 lg:col-span-6 2xl:col-span-1 md:order-2 overflow-hidden order-1'}
            >
              <Card
                className={mapFullscreen ? 'h-full rounded-none border-0 bg-transparent overflow-hidden flex flex-col' : '!rounded-2xl overflow-hidden flex flex-col pt-2'}
                style={!mapFullscreen ? { height: 'clamp(400px, calc(100vh - 160px), 900px)', minHeight: '400px', background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' } : undefined}
              >
                <CardHeader className={`border-b border-[var(--tint-06)] py-0.5 px-3 ${mapFullscreen ? 'bg-[var(--bg-card)]/95' : ''}`}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="text-sm 2xl:text-base text-[color:var(--text-primary)] flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--brand-cobalt-soft)', color: 'var(--brand-cobalt-text)' }}>
                        <Map className="h-3.5 w-3.5" />
                      </span>
                      {activeTab === 'historico' ? `Votos em ${ano}` : `Projeção ${cenarioConfig[cenarioAtivo].label} para ${anoProjecao}`}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {/* Indicador de Regiões para DF */}
                      {uf === 'DF' && (
                        <div className="flex bg-[var(--bg-card-subtle)] rounded-lg p-0.5">
                          <button
                            onClick={() => setDfVisualizacao('regioes')}
                            className={`px-2 py-1 text-xs rounded-md transition-all flex items-center gap-1 ${
                              dfVisualizacao === 'regioes' ? 'bg-teal-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:text-white'
                            }`}
                          >
                            <Layers className="h-3 w-3" />
                            Regiões
                          </button>
                        </div>
                      )}
                      {/* Voltar para municípios SP ao sair do mapa de distritos */}
                      {uf === 'SP' && spVisualizacao === 'distritos' && (
                        <button
                          onClick={() => { setSpVisualizacao('municipios'); setSelectedSpDistrito(null); }}
                          className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md text-slate-700 dark:text-slate-300 hover:text-white transition-all"
                          style={{ background: 'rgba(74,158,222,0.12)', border: '1px solid rgba(74,158,222,0.3)' }}
                        >
                          ← São Paulo
                        </button>
                      )}
                      {uf === 'RJ' && rjVisualizacao === 'bairros' && (
                        <button
                          onClick={() => { setRjVisualizacao('municipios'); setSelectedRjBairro(null); }}
                          className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md text-slate-700 dark:text-slate-300 hover:text-white transition-all"
                          style={{ background: 'rgba(5,150,105,0.12)', border: '1px solid rgba(5,150,105,0.3)' }}
                        >
                          ← Rio de Janeiro
                        </button>
                      )}
                      {uf === 'CE' && ceVisualizacao === 'bairros' && (
                        <button
                          onClick={() => { setCeVisualizacao('municipios'); setSelectedCeBairro(null); }}
                          className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md text-slate-700 dark:text-slate-300 hover:text-white transition-all"
                          style={{ background: 'rgba(234,88,12,0.12)', border: '1px solid rgba(234,88,12,0.3)' }}
                        >
                          ← Ceará
                        </button>
                      )}
                      {uf === 'MG' && mgVisualizacao === 'bairros' && (
                        <button
                          onClick={() => { setMgVisualizacao('municipios'); setSelectedMgBairro(null); setMgBairrosMunicipio(''); }}
                          className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md text-slate-700 dark:text-slate-300 hover:text-white transition-all"
                          style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.3)' }}
                        >
                          ← Minas Gerais
                        </button>
                      )}
                      {uf === 'MG' && mgVisualizacao === 'bairros' && (
                        <select
                          value={mgBairrosMunicipio}
                          onChange={e => { setMgBairrosMunicipio(e.target.value); setSelectedMgBairro(null); }}
                          className="px-2 py-1 text-xs rounded-md text-slate-800 dark:text-slate-200 bg-[var(--bg-card-subtle)] border border-[var(--border-default)]"
                        >
                          <option value="">Selecione a cidade</option>
                          {[...MG_MUNICIPIOS_COM_BAIRROS].sort().map(c => (
                            <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>
                          ))}
                        </select>
                      )}
                      {/* Alternância de visualização para vereadores */}
                      {(electoralData.cargo ?? '').toUpperCase().includes('VEREADOR') && (
                        <div className="flex bg-[var(--bg-card-subtle)] rounded-lg p-0.5">
                          <button
                            onClick={() => setVisualizacaoMapa('municipio')}
                            className={`px-2 py-1 text-xs rounded-md transition-all flex items-center gap-1 ${
                              visualizacaoMapa === 'municipio'
                                ? 'bg-cyan-500 text-white'
                                : 'text-slate-600 dark:text-slate-400 hover:text-white'
                            }`}
                          >
                            <MapPin className="h-3 w-3" />
                            Município
                          </button>
                          <button
                            onClick={() => setVisualizacaoMapa('bairro')}
                            className={`px-2 py-1 text-xs rounded-md transition-all flex items-center gap-1 ${
                              visualizacaoMapa === 'bairro'
                                ? 'bg-emerald-500 text-white'
                                : 'text-slate-600 dark:text-slate-400 hover:text-white'
                            }`}
                          >
                            <Home className="h-3 w-3" />
                            Bairros
                          </button>
                        </div>
                      )}
                      <Badge variant={activeTab === 'historico' ? 'info' : 'success'} className="hidden sm:inline-flex">
                        {electoralData.nomeUrna || electoralData.nome} - {electoralData.partido}
                      </Badge>
                    </div>
                  </div>
                  {/* Info de zonas e bairros para vereador */}
                  {(electoralData.cargo ?? '').toUpperCase().includes('VEREADOR') && (bairrosInfo.length > 0 || Object.keys(votosPorZona).length > 0) && (
                    <div className="mt-2 p-2 bg-purple-900/30 border border-purple-500/30 rounded-lg">
                      <div className="flex items-center gap-4 text-xs flex-wrap">
                        <div className="flex items-center gap-2 text-purple-300">
                          <Vote className="h-4 w-4" />
                          <span>
                            Vereador - {Object.values(votosPorZona).reduce((acc, m) => acc + m.zonas.length, 0)} zonas em{' '}
                            {Object.keys(votosPorZona).join(', ')}
                          </span>
                        </div>
                        {bairrosInfo.length > 0 && (
                          <div className="flex items-center gap-2 text-[color:var(--success)]">
                            <Home className="h-4 w-4" />
                            <span>{bairrosInfo.length} bairros com votos</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {/* Legenda para visualização por bairros */}
                  {visualizacaoMapa === 'bairro' && bairrosInfo.length > 0 && (
                    <div className="mt-2 p-2 bg-[var(--bg-card-subtle)]/50 border border-[var(--border-default)] rounded-lg">
                      <div className="flex items-center gap-4 text-xs flex-wrap">
                        <span className="text-slate-600 dark:text-slate-400 font-medium">Legenda:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                          <span className="text-[color:var(--success)]">Acima da média ({mediaVotosBairro}+ votos)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                          <span className="text-blue-400">Abaixo da média</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-full bg-gray-600"></span>
                          <span className="text-gray-400">Sem votos</span>
                        </div>
                      </div>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="p-0 flex-1 min-h-0 relative overflow-hidden">
                  {visualizacaoMapa === 'bairro' && municipioVereador && uf === 'SP' && normMunKey(municipioVereador) === 'SAO PAULO' ? (
                    // SP capital municipal (prefeito/vereador) — polígonos de distritos
                    <SpDistritosMap
                      balaoPremium textosBalao={textosBalao}
                      votesData={spDistritosVotesDisplay}
                      selectedDistrito={selectedSpDistrito}
                      onDistritoClick={handleSpDistritoClick}
                      height="100%"
                    />
                  ) : visualizacaoMapa === 'bairro' && municipioVereador && uf === 'RJ' && normMunKey(municipioVereador) === 'RIO DE JANEIRO' ? (
                    // RJ capital municipal (prefeito/vereador) — polígonos de bairros
                    <RjBairrosMap
                      balaoPremium textosBalao={textosBalao}
                      votesData={rjBairrosVotesDisplay}
                      selectedBairro={selectedRjBairro}
                      onBairroClick={handleRjBairroClick}
                      height="100%"
                    />
                  ) : visualizacaoMapa === 'bairro' && municipioVereador && uf === 'CE' && normMunKey(municipioVereador) === 'FORTALEZA' ? (
                    // CE capital municipal (prefeito/vereador) — polígonos de bairros
                    <CeBairrosMap
                      balaoPremium textosBalao={textosBalao}
                      votesData={ceBairrosVotesDisplay}
                      selectedBairro={selectedCeBairro}
                      onBairroClick={handleCeBairroClick}
                      height="100%"
                    />
                  ) : visualizacaoMapa === 'bairro' && municipioVereador ? (
                    // Outros municípios — pins de bairros
                    // candidatoId só é passado se o ano tem dados TSE reais (histórico eleitoral).
                    // Para anos futuros (ex: 2026) o candidatoId do estado anterior causaria 400
                    // na API de bairros (validação impede ano inválido + candidato).
                    <MunicipioMap
                      balaoPremium textosBalao={textosBalao}
                      municipio={municipioVereador}
                      uf={uf}
                      candidatoId={['2018','2020','2022','2024','2026'].includes(ano) ? electoralData?.candidatoId : undefined}
                      nomeCandidato={['2018','2020','2022','2024','2026'].includes(ano) && electoralData?.candidatoId ? (electoralData?.nomeUrna || electoralData?.nome) : undefined}
                      ano={ano}
                      votosPorBairro={munBairrosVotesDisplay}
                      totalVotos={getTotalVotosBairros() || electoralData?.totalVotos}
                      showLabels={true}
                      height="100%"
                      onBairroClick={(bairroNome, votos) => handleBairroClick(bairroNome, votos ?? 0)}
                    />
                  ) : uf === 'SP' && spVisualizacao === 'distritos' ? (
                    <SpDistritosMap
                      balaoPremium textosBalao={textosBalao}
                      votesData={spDistritosVotesDisplay}
                      selectedDistrito={selectedSpDistrito}
                      onDistritoClick={handleSpDistritoClick}
                      height="100%"
                    />
                  ) : uf === 'DF' && dfVisualizacao === 'regioes' ? (
                    <DfRegioesMap
                      balaoPremium textosBalao={textosBalao}
                      votesData={dfRegioesVotesDisplay}
                      selectedRegiao={selectedDfRegiao}
                      onRegiaoClick={handleDfRegiaoClick}
                      height="100%"
                    />
                  ) : uf === 'DF' && dfVisualizacao === 'zonas' && loadingDfZonas ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600 dark:text-slate-400">
                      <Loader2 className="h-8 w-8 animate-spin text-[color:var(--brand-cobalt)]" />
                      <span className="text-sm">Carregando zonas eleitorais do DF…</span>
                    </div>
                  ) : uf === 'DF' && dfVisualizacao === 'zonas' && dfZonasDisplay.length > 0 ? (
                    <ZonaPinsMap
                      municipio="BRASÍLIA"
                      zonas={dfZonasDisplay}
                      bounds={dfBounds}
                      selectedZona={selectedDfZona}
                      onZonaClick={handleDfZonaClick}
                    />
                  ) : uf === 'DF' && dfVisualizacao === 'zonas' ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600 dark:text-slate-400">
                      <Vote className="h-8 w-8 text-sky-500 opacity-50" />
                      <span className="text-sm">Busque um candidato para ver as zonas eleitorais</span>
                    </div>
                  ) : uf === 'RJ' && rjVisualizacao === 'bairros' ? (
                    <RjBairrosMap
                      balaoPremium textosBalao={textosBalao}
                      votesData={rjBairrosVotesDisplay}
                      selectedBairro={selectedRjBairro}
                      onBairroClick={handleRjBairroClick}
                      height="100%"
                    />
                  ) : uf === 'CE' && ceVisualizacao === 'bairros' ? (
                    <CeBairrosMap
                      balaoPremium textosBalao={textosBalao}
                      votesData={ceBairrosVotesDisplay}
                      selectedBairro={selectedCeBairro}
                      onBairroClick={handleCeBairroClick}
                      height="100%"
                    />
                  ) : uf === 'MG' && mgVisualizacao === 'bairros' && mgBairrosMunicipio ? (
                    <MgBairrosMap
                      balaoPremium textosBalao={textosBalao}
                      municipio={mgBairrosMunicipio}
                      votesData={mgBairrosVotesDisplay}
                      selectedBairro={selectedMgBairro}
                      onBairroClick={(nome) => setSelectedMgBairro(prev => prev === nome ? null : nome)}
                      height="100%"
                    />
                  ) : uf === 'MG' && mgVisualizacao === 'bairros' && !mgBairrosMunicipio ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600 dark:text-slate-400">
                      <MapPin className="h-8 w-8 text-violet-400 opacity-50" />
                      <span className="text-sm">Selecione a cidade acima para ver os bairros</span>
                    </div>
                  ) : visualizacaoMapa === 'bairro' && genPoligonosMunicipio && genPoligonosUf ? (
                    // Municípios genéricos com polígonos IBGE (exceto SP/RJ/CE/MG)
                    <BairrosPoligonosMap
                      balaoPremium textosBalao={textosBalao}
                      municipio={genPoligonosMunicipio}
                      uf={genPoligonosUf}
                      candidatoId={['2018','2020','2022','2024','2026'].includes(ano) ? electoralData?.candidatoId : undefined}
                      nomeCandidato={['2018','2020','2022','2024','2026'].includes(ano) && electoralData?.candidatoId ? (electoralData?.nomeUrna || electoralData?.nome) : undefined}
                      ano={['2018','2020','2022','2024','2026'].includes(ano) ? ano : undefined}
                      votosPorBairro={genBairrosVotesDisplay}
                      selectedBairro={selectedGenBairro}
                      onBairroClick={(nome, votos) => {
                        setSelectedGenBairro(prev => prev === nome ? null : nome);
                        handleBairroClick(nome, votos ?? 0);
                      }}
                      onDataLoaded={(votes) => setGenBairrosApiVotes(votes)}
                      height="100%"
                    />
                  ) : (
                    // Vista de Municípios (padrão)
                    <StateMap
                      balaoPremium textosBalao={textosBalaoEstado}
                      uf={uf}
                      stateName={ESTADOS_BRASIL.find(e => e.sigla === uf)?.nome || uf}
                      votesDataByName={highlightedMunicipios}
                      onMunicipioClick={(codigo, nome) => {
                        if (uf === 'DF') {
                          if (dfZonas.length === 0 && !loadingDfZonas) {
                            carregarDfZonas(electoralData, ano);
                          }
                          return;
                        }
                        handleMunicipioClick(nome, codigo);
                      }}
                      filteredMunicipios={filteredMunicipiosSet}
                      highlightColor={filtroTipo === 'com_dobrada' ? 'blue' : undefined}
                      disableSubdivisao={true}
                      highlightMunicipioNome={selectedMapMunicipio}
                    />
                  )}
                  {/* Botão tela cheia */}
                  <button
                    onClick={() => setMapFullscreen(f => !f)}
                    className="absolute top-3 right-3 z-[1000] bg-slate-800 border border-slate-600 rounded-lg p-2 text-slate-200 hover:bg-slate-700 hover:text-white hover:border-slate-400 transition-all shadow-lg"
                    title={mapFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
                  >
                    {mapFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  </button>
                </CardContent>
              </Card>
            </motion.div>

          </div>

          {/* Análise da projeção: concentração, onde crescer, prioridades e tabela */}
          {!mapFullscreen && (
            <AnaliseProjecao
              linhas={getMunicipiosFiltrados().map(m => ({
                nome: m.municipio,
                base: m.votosBase,
                meta: getMetaAtiva(m),
                prioridade: m.prioridade,
                dobrada: !!m.dobradaAtiva,
                parceria: municipioTemParcerias(m.municipio),
              }))}
              cor={cenarioConfig[cenarioAtivo].hex}
              rotuloCenario={cenarioConfig[cenarioAtivo].label}
              anoBase={ano}
              anoProjecao={anoProjecao}
              onClickLinha={(nome) => { handleMunicipioClick(nome); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            />
          )}
        </>
      )}

      {/* Edit Municipality Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setSelectedMapMunicipio(null); }}
        title={selectedMunicipio?.nome ? nomeDaArea(selectedMunicipio.nome) : ''}
        subtitulo={selectedMunicipio ? `Metas para ${anoProjecao} · ${selectedMunicipio.votosBase > 0 ? `${selectedMunicipio.votosBase.toLocaleString('pt-BR')} votos em ${ano}` : `sem votos em ${ano}`}` : undefined}
        icone={MapPin}
        cor={cenarioConfig[cenarioAtivo].hex}
        size="lg"
        rodape={selectedMunicipio && (
          <>
            <BotaoSecundario onClick={() => { setShowModal(false); setSelectedMapMunicipio(null); }}>Cancelar</BotaoSecundario>
            <BotaoPrincipal icone={CheckCircle} onClick={() => {
              updateMunicipioMetas(
                selectedMunicipio.nome,
                metaConservadoraTemp,
                metaPossivelTemp,
                metaArrojadaTemp,
                prioridadeTemp,
                dobradaAtivaTemp,
                dobradaNomeTemp,
                dobradaPartidoTemp,
                dobradaObservacoesTemp
              );
              setShowModal(false);
              setSelectedMapMunicipio(null);
            }}>Salvar</BotaoPrincipal>
          </>
        )}
      >
        {selectedMunicipio && (
          <div className="space-y-5">
            {/* Metas por cenário */}
            {(() => {
              const parceriasSum = getParceriasSumForMunicipio(selectedMunicipio.nome);
              const bairrosDeltaC = getBairrosDeltaMunicipio(selectedMunicipio.nome, 'conservador');
              const bairrosDeltaP = getBairrosDeltaMunicipio(selectedMunicipio.nome, 'possivel');
              const bairrosDeltaA = getBairrosDeltaMunicipio(selectedMunicipio.nome, 'arrojado');
              const hasBairrosDelta = bairrosDeltaC > 0 || bairrosDeltaP > 0 || bairrosDeltaA > 0;
              const hasParceriasForMeta = parceriasSum.conservadora > 0 || parceriasSum.possivel > 0 || parceriasSum.arrojada > 0 || hasBairrosDelta;
              const colunas = [
                { rotulo: 'Conservadora', cor: cenarioConfig.conservador.hex, meta: metaConservadoraTemp, parc: parceriasSum.conservadora, bairros: bairrosDeltaC },
                { rotulo: 'Realista', cor: cenarioConfig.possivel.hex, meta: metaPossivelTemp, parc: parceriasSum.possivel, bairros: bairrosDeltaP },
                { rotulo: 'Otimista', cor: cenarioConfig.arrojado.hex, meta: metaArrojadaTemp, parc: parceriasSum.arrojada, bairros: bairrosDeltaA },
              ];

              return (
                <>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-bold mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Meta em cada cenário</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <CartaoMetaCenario rotulo="Conservadora" icone={Shield} cor={cenarioConfig.conservador.hex} valor={metaConservadoraTemp} onChange={setMetaConservadoraTemp} base={selectedMunicipio.votosBase} />
                      <CartaoMetaCenario rotulo="Realista" icone={Gauge} cor={cenarioConfig.possivel.hex} valor={metaPossivelTemp} onChange={setMetaPossivelTemp} base={selectedMunicipio.votosBase} />
                      <CartaoMetaCenario rotulo="Otimista" icone={Rocket} cor={cenarioConfig.arrojado.hex} valor={metaArrojadaTemp} onChange={setMetaArrojadaTemp} base={selectedMunicipio.votosBase} />
                    </div>
                  </div>

                  {/* Meta final = meta + parcerias + bairros */}
                  {hasParceriasForMeta && (
                    <SecaoJanela titulo={hasBairrosDelta ? 'Meta final (com parcerias e bairros)' : 'Meta final (com parcerias)'} icone={Users} cor="#d97706">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        {colunas.map(c => (
                          <div key={c.rotulo} className="rounded-xl p-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
                            <p className="font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                              <span className="w-2 h-2 rounded-full" style={{ background: c.cor }} />{c.rotulo}
                            </p>
                            <div className="space-y-1 tabular-nums">
                              <div className="flex justify-between" style={{ color: 'var(--text-secondary)' }}><span>Meta</span><span>{c.meta.toLocaleString('pt-BR')}</span></div>
                              {c.parc > 0 && <div className="flex justify-between" style={{ color: '#d97706' }}><span>+ Parcerias</span><span>+{c.parc.toLocaleString('pt-BR')}</span></div>}
                              {c.bairros > 0 && <div className="flex justify-between" style={{ color: 'var(--acento-azul)' }}><span>+ Bairros</span><span>+{c.bairros.toLocaleString('pt-BR')}</span></div>}
                              <div className="flex justify-between font-bold pt-1" style={{ color: 'var(--text-primary)', borderTop: '1px solid var(--border-default)' }}>
                                <span>Final</span><span>{(c.meta + c.parc + c.bairros).toLocaleString('pt-BR')}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </SecaoJanela>
                  )}
                </>
              );
            })()}

            <SeletorPrioridade valor={prioridadeTemp} onChange={setPrioridadeTemp} />

            {/* Dobrada */}
            <SecaoJanela titulo="Dobrada" icone={Handshake} cor="#3b82f6">
              <Interruptor
                ativo={dobradaAtivaTemp}
                onChange={setDobradaAtivaTemp}
                titulo="Dobrada com deputado federal"
                descricao="Campanha casada neste município"
                icone={Handshake}
                cor="#3b82f6"
              />
              {dobradaAtivaTemp && (
                <div className="space-y-3 mt-4 animate-in slide-in-from-top-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <CampoBusca rotulo="Deputado federal">
                      <input placeholder="Ex: Marcos Pereira" value={dobradaNomeTemp} onChange={(e) => setDobradaNomeTemp(e.target.value)}
                        className={CLASSE_CAMPO} style={ESTILO_CAMPO} />
                    </CampoBusca>
                    <CampoBusca rotulo="Partido (opcional)">
                      <input placeholder="Ex: REPUBLICANOS" value={dobradaPartidoTemp} onChange={(e) => setDobradaPartidoTemp(e.target.value)}
                        className={CLASSE_CAMPO} style={ESTILO_CAMPO} />
                    </CampoBusca>
                  </div>
                  <CampoBusca rotulo="Observações (opcional)">
                    <textarea
                      placeholder="Anotações sobre a articulação política…"
                      value={dobradaObservacoesTemp}
                      onChange={(e) => setDobradaObservacoesTemp(e.target.value)}
                      rows={2}
                      className={`${CLASSE_CAMPO} h-auto py-2.5 resize-none`}
                      style={ESTILO_CAMPO}
                    />
                  </CampoBusca>
                </div>
              )}
            </SecaoJanela>

            {/* Parcerias */}
            <SecaoJanela
              titulo={<>Parcerias <span className="normal-case tracking-normal font-semibold">· {getParceriasMunicipio(selectedMunicipio.nome).length}</span></>}
              icone={Users}
              cor="#d97706"
              direita={
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    openParceriaModal(selectedMunicipio.nome);
                  }}
                  className="inline-flex items-center gap-1 h-8 px-3 rounded-lg text-xs font-semibold text-white transition-all hover:brightness-110"
                  style={{ background: '#d97706' }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar
                </button>
              }
            >
              {getParceriasMunicipio(selectedMunicipio.nome).length > 0 ? (
                <div className="space-y-2 max-h-56 overflow-y-auto scrollbar-dark">
                  {getParceriasMunicipio(selectedMunicipio.nome).map((parceria) => {
                    const pendente = parceria.id?.startsWith('pending-');
                    const pMun = parceria.municipio ?? '';
                    const bairroNome = isMunBairro(pMun) ? getMunBairroNome(pMun) : isMgBairro(pMun) ? getMgBairroNome(pMun) : null;
                    return (
                      <div key={parceria.id} className="group p-3 rounded-xl transition-colors"
                        style={{ background: 'var(--bg-card)', border: pendente ? '1px dashed rgba(217,119,6,0.55)' : '1px solid var(--border-default)' }}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(217,119,6,0.14)', color: '#d97706' }}>
                                {TIPO_PARCERIA_LABELS[parceria.tipo]}
                              </span>
                              {pendente && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--warning)' }}>pendente</span>
                              )}
                              {bairroNome && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(56,189,248,0.15)', color: 'var(--acento-azul)' }}>bairro: {bairroNome}</span>
                              )}
                            </div>
                            <p className="text-sm font-semibold mt-1 break-words" style={{ color: 'var(--text-primary)' }}>
                              {parceria.nome}
                              {parceria.responsavel && <span className="font-normal text-xs ml-1" style={{ color: 'var(--text-tertiary)' }}>({parceria.responsavel})</span>}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowModal(false);
                                editParceria(parceria);
                              }}
                              className="p-1.5 rounded-lg transition-colors hover:bg-[var(--tint-06)]"
                              style={{ color: 'var(--brand-cobalt-text)' }}
                              title="Editar parceria"
                              aria-label="Editar parceria"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteParceria(parceria.id!);
                              }}
                              className="p-1.5 rounded-lg transition-colors hover:bg-red-500/15"
                              style={{ color: '#ef4444' }}
                              title="Excluir parceria"
                              aria-label="Excluir parceria"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] tabular-nums">
                          {([['Conservadora', cenarioConfig.conservador.hex, parceria.metaConservadora], ['Realista', cenarioConfig.possivel.hex, parceria.metaPossivel], ['Otimista', cenarioConfig.arrojado.hex, parceria.metaArrojada]] as const).map(([r, c, v]) => (
                            <span key={r} className="inline-flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                              <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />{r}
                              <b style={{ color: 'var(--text-primary)' }}>{v.toLocaleString('pt-BR')}</b>
                            </span>
                          ))}
                          {parceria.impactoEstimado > 0 && (
                            <span className="ml-auto" style={{ color: 'var(--text-tertiary)' }}>Impacto estimado: {parceria.impactoEstimado.toLocaleString('pt-BR')} votos</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-center py-2" style={{ color: 'var(--text-tertiary)' }}>
                  Nenhuma parceria cadastrada neste município.
                </p>
              )}
            </SecaoJanela>
          </div>
        )}
      </Modal>

      {/* Add Municipality Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Adicionar município"
        subtitulo="Escolha a cidade e as metas de cada cenário"
        icone={Plus}
        cor="#10b981"
        size="lg"
        rodape={
          <>
            <BotaoSecundario onClick={() => setShowAddModal(false)}>Cancelar</BotaoSecundario>
            <BotaoPrincipal icone={Plus} onClick={addNovoMunicipio} disabled={!novoMunicipioNome}>Adicionar</BotaoPrincipal>
          </>
        }
      >
        <div className="space-y-5">
          <CampoBusca rotulo="Município">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: 'var(--text-tertiary)' }} />
              <input
                type="text"
                placeholder="Digite para filtrar…"
                value={filtroMunicipios}
                onChange={(e) => setFiltroMunicipios(e.target.value)}
                className={`${CLASSE_CAMPO} pl-10`}
                style={ESTILO_CAMPO}
              />
            </div>
          </CampoBusca>

          <div className="max-h-48 overflow-y-auto scrollbar-dark rounded-xl" style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--border-default)' }}>
            {municipiosDisponiveis.length === 0 ? (
              <div className="p-4 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                Carregando municípios…
              </div>
            ) : (
              municipiosDisponiveis
                .filter(m =>
                  filtroMunicipios === '' ||
                  m.toLowerCase().includes(filtroMunicipios.toLowerCase())
                )
                .filter(m => {
                  if (!projecao) return true;
                  return !projecao.municipios.some(
                    pm => pm.municipio.toUpperCase() === m.toUpperCase()
                  );
                })
                .slice(0, 50)
                .map((mun) => (
                  <button
                    key={mun}
                    type="button"
                    onClick={() => setNovoMunicipioNome(mun)}
                    className="w-full text-left px-4 py-2 text-sm transition-colors flex items-center justify-between gap-2 hover:bg-[var(--bg-hover)]"
                    style={novoMunicipioNome === mun
                      ? { background: 'rgba(16,185,129,0.14)', color: 'var(--success)', fontWeight: 600 }
                      : { color: 'var(--text-primary)' }}
                  >
                    {mun}
                    {novoMunicipioNome === mun && <CheckCircle className="h-4 w-4 flex-shrink-0" />}
                  </button>
                ))
            )}
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
              Metas {novoMunicipioNome ? `de ${novoMunicipioNome}` : ''}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <CartaoMetaCenario rotulo="Conservadora" icone={Shield} cor={cenarioConfig.conservador.hex} valor={novoMetaConservadora} onChange={setNovoMetaConservadora} />
              <CartaoMetaCenario rotulo="Realista" icone={Gauge} cor={cenarioConfig.possivel.hex} valor={novoMetaPossivel} onChange={setNovoMetaPossivel} />
              <CartaoMetaCenario rotulo="Otimista" icone={Rocket} cor={cenarioConfig.arrojado.hex} valor={novoMetaArrojada} onChange={setNovoMetaArrojada} />
            </div>
          </div>

          <SeletorPrioridade valor={novoMunicipioPrioridade} onChange={setNovoMunicipioPrioridade} />
        </div>
      </Modal>

      {/* Modal de Seleção de Candidatos */}
      <Modal
        isOpen={showCandidatoModal}
        onClose={() => setShowCandidatoModal(false)}
        title="Selecione o candidato"
        subtitulo={mensagemMultiplos || 'Mais de um candidato tem esse nome'}
        icone={Users}
        size="xl"
        rodape={<BotaoSecundario onClick={() => setShowCandidatoModal(false)}>Cancelar</BotaoSecundario>}
      >
        <div className="space-y-2.5">
          {candidatosMultiplos.map((candidato) => {
            const vereador = (candidato.cargo ?? '').toUpperCase().includes('VEREADOR');
            return (
              <div
                key={candidato.id}
                role="button"
                tabIndex={0}
                onClick={() => selectCandidato(candidato)}
                onKeyDown={(e) => { if (e.key === 'Enter') selectCandidato(candidato); }}
                className="group flex items-center gap-3 p-3.5 rounded-xl cursor-pointer transition-all hover:-translate-y-px"
                style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--border-default)' }}
              >
                <Avatar nome={candidato.nomeUrna || candidato.nome} cor={corDoCargo(candidato.cargo)} tamanho={42} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{candidato.nomeUrna}</span>
                    <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--brand-cobalt-soft)', color: 'var(--brand-cobalt-text)' }}>{candidato.numero}</span>
                  </div>
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-tertiary)' }}>{candidato.nome}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[11px]">
                    <span className="px-1.5 py-0.5 rounded font-semibold" style={{ background: 'var(--tint-06)', color: 'var(--text-secondary)' }}>{candidato.partido}</span>
                    <span className="px-1.5 py-0.5 rounded font-semibold" style={{ background: 'var(--tint-06)', color: 'var(--text-secondary)' }}>{rotuloCargo(candidato.cargo)}</span>
                    <span className="px-1.5 py-0.5 rounded font-semibold" style={{ background: 'var(--tint-06)', color: 'var(--text-secondary)' }}>{candidato.ano}</span>
                    {vereador ? (
                      <span className="inline-flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}><MapPin className="h-3 w-3" />{candidato.municipioCandidatura}</span>
                    ) : candidato.municipioPrincipal !== 'N/A' && (
                      <span style={{ color: 'var(--text-tertiary)' }}>Maior votação em {candidato.municipioPrincipal}</span>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-lg tabular-nums" style={{ color: 'var(--brand-cobalt-text)' }}>{candidato.totalVotos.toLocaleString('pt-BR')}</p>
                  <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>votos</p>
                </div>
              </div>
            );
          })}
        </div>
      </Modal>

      {/* Modal — Novo Candidato sem histórico */}
      <Modal
        isOpen={showNovoCandidatoModal}
        onClose={() => setShowNovoCandidatoModal(false)}
        title="Novo candidato"
        subtitulo="Projeção em branco para quem ainda não disputou eleição — as cidades e metas você adiciona depois"
        icone={UserCheck}
        size="md"
        rodape={
          <>
            <BotaoSecundario onClick={() => setShowNovoCandidatoModal(false)}>Cancelar</BotaoSecundario>
            <BotaoPrincipal
              icone={Plus}
              cor="#2563eb"
              onClick={criarNovoCandidato}
              disabled={!novoCandidatoNome.trim() || ((novoCandidatoCargo === 'VEREADOR' || novoCandidatoCargo === 'PREFEITO') && !novoCandidatoMunicipio)}
            >
              Criar projeção
            </BotaoPrincipal>
          </>
        }
      >
        <div className="space-y-4">
          <CampoBusca rotulo="Nome do candidato *">
            <input value={novoCandidatoNome} onChange={(e) => setNovoCandidatoNome(e.target.value)} placeholder="Nome completo"
              className={CLASSE_CAMPO} style={ESTILO_CAMPO} />
          </CampoBusca>

          <div className="grid grid-cols-2 gap-3">
            <CampoBusca rotulo="Partido">
              <input value={novoCandidatoPartido} onChange={(e) => setNovoCandidatoPartido(e.target.value)} placeholder="Ex: PSD, PT, MDB…"
                className={CLASSE_CAMPO} style={ESTILO_CAMPO} />
            </CampoBusca>
            <CampoBusca rotulo="Estado *">
              <select value={novoCandidatoUf} onChange={(e) => setNovoCandidatoUf(e.target.value)} className={CLASSE_CAMPO} style={ESTILO_CAMPO}>
                {ESTADOS_BRASIL.map((e) => (
                  <option key={e.sigla} value={e.sigla}>{e.sigla} — {e.nome}</option>
                ))}
              </select>
            </CampoBusca>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <CampoBusca rotulo="Cargo *">
              <select value={novoCandidatoCargo} onChange={(e) => { setNovoCandidatoCargo(e.target.value); setNovoCandidatoAnoProjecao(anosNovoCandidato(e.target.value)[0]); }} className={CLASSE_CAMPO} style={ESTILO_CAMPO}>
                {[
                  ['DEPUTADO_FEDERAL', 'Deputado Federal'],
                  ['DEPUTADO_ESTADUAL', 'Deputado Estadual'],
                  ['VEREADOR', 'Vereador'],
                  ['PREFEITO', 'Prefeito'],
                  ['SENADOR', 'Senador'],
                  ['GOVERNADOR', 'Governador'],
                ].map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </CampoBusca>
            <CampoBusca rotulo="Ano da projeção *">
              <select value={novoCandidatoAnoProjecao} onChange={(e) => setNovoCandidatoAnoProjecao(e.target.value)} className={CLASSE_CAMPO} style={ESTILO_CAMPO}>
                {anosNovoCandidato(novoCandidatoCargo).map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </CampoBusca>
          </div>

          {/* Município — apenas para Vereador / Prefeito */}
          {(novoCandidatoCargo === 'VEREADOR' || novoCandidatoCargo === 'PREFEITO') && (
            <CampoBusca rotulo="Município *">
              <div className="relative">
                <input
                  value={novoCandidatoMunicipioFiltro}
                  onChange={(e) => {
                    setNovoCandidatoMunicipioFiltro(e.target.value);
                    setNovoCandidatoMunicipio('');
                  }}
                  placeholder={novoCandidatoMunicipioOpcoes.length ? 'Buscar município…' : 'Carregando…'}
                  className={CLASSE_CAMPO}
                  style={{ ...ESTILO_CAMPO, borderColor: novoCandidatoMunicipio ? 'var(--brand-cobalt)' : 'var(--border-default)' }}
                />
                {novoCandidatoMunicipioFiltro && !novoCandidatoMunicipio && novoCandidatoMunicipioOpcoes.length > 0 && (
                  <div
                    className="absolute z-50 w-full mt-1 max-h-44 overflow-y-auto rounded-xl"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-raised)' }}
                  >
                    {novoCandidatoMunicipioOpcoes
                      .filter(m => m.toLowerCase().includes(novoCandidatoMunicipioFiltro.toLowerCase()))
                      .slice(0, 25)
                      .map(m => (
                        <button
                          key={m}
                          type="button"
                          className="w-full text-left px-3.5 py-2 text-sm transition-colors hover:bg-[var(--bg-hover)]"
                          style={{ color: 'var(--text-primary)' }}
                          onMouseDown={() => {
                            setNovoCandidatoMunicipio(m);
                            setNovoCandidatoMunicipioFiltro(m);
                          }}
                        >
                          {m}
                        </button>
                      ))}
                    {novoCandidatoMunicipioOpcoes.filter(m => m.toLowerCase().includes(novoCandidatoMunicipioFiltro.toLowerCase())).length === 0 && (
                      <p className="px-3.5 py-2.5 text-sm" style={{ color: 'var(--text-tertiary)' }}>Nenhum município encontrado</p>
                    )}
                  </div>
                )}
              </div>
              {novoCandidatoMunicipio && (
                <p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: 'var(--brand-cobalt-text)' }}>
                  <CheckCircle className="w-3 h-3" /> {novoCandidatoMunicipio}
                </p>
              )}
            </CampoBusca>
          )}
        </div>
      </Modal>

      {/* Modal de Detalhes do Bairro */}
      <Modal
        isOpen={showBairroModal}
        onClose={() => setShowBairroModal(false)}
        title={selectedBairro ? selectedBairro.bairro : 'Detalhes do bairro'}
        subtitulo={selectedBairro ? `${selectedBairro.municipio}${selectedBairro.zonas.length ? ` · ${selectedBairro.zonas.length === 1 ? 'zona' : 'zonas'} ${selectedBairro.zonas.join(', ')}` : ''}` : undefined}
        icone={Home}
        cor={selectedBairro && getBairroCategory(selectedBairro.votos) === 'acima' ? '#10b981' : '#2563eb'}
        size="lg"
        rodape={<BotaoSecundario onClick={() => setShowBairroModal(false)}>Fechar</BotaoSecundario>}
      >
        {selectedBairro && (() => {
          const categoria = getBairroCategory(selectedBairro.votos);
          const corCategoria = categoria === 'acima' ? '#10b981' : categoria === 'abaixo' ? '#2563eb' : '#64748b';
          const rotuloCategoria = categoria === 'acima' ? 'Acima da média' : categoria === 'abaixo' ? 'Abaixo da média' : 'Sem votos';
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl p-3.5" style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--border-default)' }}>
                  <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--text-tertiary)' }}>Votos recebidos</p>
                  <p className="text-2xl font-bold tabular-nums mt-1" style={{ color: 'var(--text-primary)' }}>{selectedBairro.votos.toLocaleString('pt-BR')}</p>
                </div>
                <div className="rounded-xl p-3.5" style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--border-default)' }}>
                  <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--text-tertiary)' }}>% do total</p>
                  <p className="text-2xl font-bold tabular-nums mt-1" style={{ color: 'var(--text-primary)' }}>
                    {electoralData?.totalVotos ? ((selectedBairro.votos / electoralData.totalVotos) * 100).toFixed(1).replace('.', ',') : '0'}%
                  </p>
                </div>
                <div className="rounded-xl p-3.5" style={{ background: comAlfa(corCategoria, 0.1), border: `1px solid ${comAlfa(corCategoria, 0.35)}` }}>
                  <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--text-tertiary)' }}>Desempenho</p>
                  <p className="text-sm font-bold mt-2 flex items-center gap-1.5" style={{ color: corCategoria }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: corCategoria }} />{rotuloCategoria}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-widest font-bold mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Projeções sugeridas para {anoProjecao}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <CartaoMetaCenario rotulo="Conservadora (+5%)" icone={Shield} cor={cenarioConfig.conservador.hex} valor={Math.round(selectedBairro.votos * 1.05)} />
                  <CartaoMetaCenario rotulo="Realista (+15%)" icone={Gauge} cor={cenarioConfig.possivel.hex} valor={Math.round(selectedBairro.votos * 1.15)} />
                  <CartaoMetaCenario rotulo="Otimista (+30%)" icone={Rocket} cor={cenarioConfig.arrojado.hex} valor={Math.round(selectedBairro.votos * 1.30)} />
                </div>
              </div>

              {selectedBairro.locais && selectedBairro.locais.length > 0 && (
                <SecaoJanela titulo={`Locais de votação · ${selectedBairro.locais.length}`} icone={Building2}>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-dark">
                    {selectedBairro.locais.map((local, idx) => (
                      <div key={idx} className="px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
                        <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{local.nome}</p>
                        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{local.endereco}</p>
                      </div>
                    ))}
                  </div>
                </SecaoJanela>
              )}
            </div>
          );
        })()}
      </Modal>

      {/* Saved Projections */}
      {projecoesSalvas.length > 0 && !electoralData && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Painel
            titulo={<>Projeções salvas <span className="ml-1 normal-case tracking-normal font-semibold" style={{ color: 'var(--text-secondary)' }}>· {projecoesSalvas.length}</span></>}
            icone={Target}
            direita={projecoesSalvas.length > 3 ? (
              <CampoFiltro valor={buscaProjecoes} onChange={setBuscaProjecoes} placeholder="Buscar candidato" />
            ) : undefined}
          >
            {(() => {
              const termo = normMunKey(buscaProjecoes);
              const lista = termo
                ? projecoesSalvas.filter(p => normMunKey(p.candidatoNome).includes(termo))
                : projecoesSalvas;
              if (lista.length === 0) {
                return (
                  <p className="text-sm text-center py-8" style={{ color: 'var(--text-tertiary)' }}>
                    Nenhuma projeção de “{buscaProjecoes.trim()}”.
                  </p>
                );
              }
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {lista.map((proj) => (
                    <CartaoProjecaoSalva
                      key={proj.id}
                      resumo={resumoDaProjecao(proj)}
                      onAbrir={() => abrirProjecaoSalva(proj)}
                      onExcluir={() => {
                        setProjecaoParaExcluir({ id: proj.id, nome: proj.candidatoNome });
                        setShowDeleteModal(true);
                      }}
                    />
                  ))}
                </div>
              );
            })()}
          </Painel>
        </motion.div>
      )}

      {/* Modal de Parceria */}
      <Modal
        isOpen={showParceriaModal}
        onClose={() => {
          setShowParceriaModal(false);
          setSelectedParceria(null);
        }}
        title={`${selectedParceria ? 'Editar' : 'Nova'} parceria`}
        subtitulo={`${municipioParaParceria}${bairroParaParceria ? ` · bairro ${bairroParaParceria}` : ''}`}
        icone={Handshake}
        cor="#d97706"
        size="lg"
        rodape={
          <>
            <BotaoSecundario onClick={() => setShowParceriaModal(false)}>Cancelar</BotaoSecundario>
            <BotaoPrincipal icone={savingParceria ? Loader2 : CheckCircle} cor="#d97706" onClick={saveParceria} disabled={savingParceria}>
              {savingParceria ? 'Salvando…' : 'Salvar parceria'}
            </BotaoPrincipal>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <CampoBusca rotulo="Nome da parceria *" className="sm:col-span-2">
              <input
                type="text"
                value={parceriaForm.nome || ''}
                onChange={(e) => setParceriaForm(prev => ({ ...prev, nome: e.target.value }))}
                placeholder="Ex: Igreja São José, ONG Vida Nova…"
                className={CLASSE_CAMPO}
                style={ESTILO_CAMPO}
              />
            </CampoBusca>
            <CampoBusca rotulo="Tipo *">
              <select
                value={parceriaForm.tipo || 'LIDERANCA'}
                onChange={(e) => setParceriaForm(prev => ({ ...prev, tipo: e.target.value as TipoParceria }))}
                className={CLASSE_CAMPO}
                style={ESTILO_CAMPO}
              >
                {Object.entries(TIPO_PARCERIA_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </CampoBusca>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <CampoBusca rotulo="Responsável">
              <input
                type="text"
                value={parceriaForm.responsavel || ''}
                onChange={(e) => setParceriaForm(prev => ({ ...prev, responsavel: e.target.value }))}
                placeholder="Nome do contato"
                className={CLASSE_CAMPO}
                style={ESTILO_CAMPO}
              />
            </CampoBusca>
            <CampoBusca rotulo="Contato">
              <input
                type="text"
                value={parceriaForm.contato || ''}
                onChange={(e) => setParceriaForm(prev => ({ ...prev, contato: e.target.value }))}
                placeholder="Telefone ou e-mail"
                className={CLASSE_CAMPO}
                style={ESTILO_CAMPO}
              />
            </CampoBusca>
            <CampoBusca rotulo="Impacto estimado (votos)">
              <input
                type="number"
                value={parceriaForm.impactoEstimado || 0}
                onChange={(e) => setParceriaForm(prev => ({ ...prev, impactoEstimado: parseInt(e.target.value) || 0 }))}
                min={0}
                className={CLASSE_CAMPO}
                style={ESTILO_CAMPO}
              />
            </CampoBusca>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Votos que a parceria soma em cada cenário</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <CartaoMetaCenario rotulo="Conservadora" icone={Shield} cor={cenarioConfig.conservador.hex} valor={parceriaForm.metaConservadora || 0}
                onChange={(v) => setParceriaForm(prev => ({ ...prev, metaConservadora: v }))} />
              <CartaoMetaCenario rotulo="Realista" icone={Gauge} cor={cenarioConfig.possivel.hex} valor={parceriaForm.metaPossivel || 0}
                onChange={(v) => setParceriaForm(prev => ({ ...prev, metaPossivel: v }))} />
              <CartaoMetaCenario rotulo="Otimista" icone={Rocket} cor={cenarioConfig.arrojado.hex} valor={parceriaForm.metaArrojada || 0}
                onChange={(v) => setParceriaForm(prev => ({ ...prev, metaArrojada: v }))} />
            </div>
          </div>

          <CampoBusca rotulo="Observações">
            <textarea
              value={parceriaForm.observacoes || ''}
              onChange={(e) => setParceriaForm(prev => ({ ...prev, observacoes: e.target.value }))}
              placeholder="Notas sobre a parceria…"
              rows={3}
              className={`${CLASSE_CAMPO} h-auto py-2.5 resize-none`}
              style={ESTILO_CAMPO}
            />
          </CampoBusca>
        </div>
      </Modal>

      {/* Modal — Confirmação de Exclusão de Projeção */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setProjecaoParaExcluir(null); }}
        title="Excluir projeção"
        icone={Trash2}
        cor="#dc2626"
        size="sm"
        rodape={
          <>
            <BotaoSecundario onClick={() => { setShowDeleteModal(false); setProjecaoParaExcluir(null); }}>Cancelar</BotaoSecundario>
            <BotaoPrincipal icone={Trash2} cor="#dc2626" onClick={async () => {
                if (!projecaoParaExcluir) return;
                const res = await fetch(`/api/projecoes?id=${projecaoParaExcluir.id}`, { method: 'DELETE' });
                if (res.ok) {
                  setProjecoesSalvas((prev: Projecao[]) => prev.filter((p: Projecao) => p.id !== projecaoParaExcluir.id));
                  if (projecao?.id === projecaoParaExcluir.id) setProjecao(null);
                  toast.success('Projeção excluída com sucesso!');
                } else {
                  const errData = await res.json().catch(() => ({}));
                  toast.error((errData as any)?.error || 'Erro ao excluir projeção');
                }
                setShowDeleteModal(false);
                setProjecaoParaExcluir(null);
              }}>Excluir</BotaoPrincipal>
          </>
        }
      >
        <p className="text-sm text-center py-2" style={{ color: 'var(--text-secondary)' }}>
          A projeção de <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{projecaoParaExcluir?.nome}</span> será
          removida de vez, com as metas, dobradas e parcerias.
        </p>
      </Modal>

      <ConfirmDialog
        open={!!confirmRemoveMun}
        title={`Remover ${confirmRemoveMun}?`}
        message="Este município será removido da projeção de campanha."
        confirmLabel="Sim, remover"
        variant="danger"
        onConfirm={doRemoveMunicipio}
        onCancel={() => setConfirmRemoveMun(null)}
      />

      <ConfirmDialog
        open={!!confirmDeleteParceria}
        title="Remover parceria?"
        message="Esta parceria será excluída permanentemente da projeção."
        confirmLabel="Sim, remover"
        variant="danger"
        onConfirm={doDeleteParceria}
        onCancel={() => setConfirmDeleteParceria(null)}
      />
    </div>
  );
}