'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  MapPin, Plus, Search, Filter, X, AlertCircle, Loader2,
  CheckCircle, Clock, AlertTriangle, Camera,
  Navigation, Calendar, User, Phone, Building2,
  Maximize2, Minimize2, ChevronDown, ChevronLeft, ChevronRight,
  DollarSign, Paperclip, FileText, Download, Trash2,
} from 'lucide-react';
import { CATEGORY_LABELS, CATEGORY_COLORS, STATUS_LABELS, STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS } from '@/lib/types';
import { Select } from '@/components/ui/select';
import { compressImage } from '@/lib/compress-image';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
interface Demand {
  id: string;
  title: string;
  description?: string;
  solicitante: string;
  contato?: string;
  estado: string;
  municipio: string;
  bairro?: string;
  endereco?: string;
  lat?: number;
  lng?: number;
  foto?: string;
  category: string;
  status: string;
  priority: string;
  observations?: string;
  createdAt: string;
  createdBy?: { name: string };
}

interface AgendaEvent {
  id: string;
  titulo: string;
  descricao?: string;
  data: string;
  local?: string;
  endereco?: string;
  lat?: number;
  lng?: number;
  tipo: string;
  cor?: string;
}

interface Contato {
  id: string;
  nome: string;
  numero: string;
  email?: string;
  endereco?: string;
  lat?: number;
  lng?: number;
}

interface Emenda {
  id: string;
  titulo: string;
  descricao?: string;
  valor?: number;
  autor?: string;
  numero?: string;
  ano?: number;
  tipo: string;
  orgaoExecutor?: string;
  status: string;
  beneficiario?: string;
  estado?: string;
  municipio?: string;
  bairro?: string;
  endereco?: string;
  lat?: number;
  lng?: number;
  documento?: string;
  documentoNome?: string;
  observations?: string;
  createdAt: string;
}

interface GeoResult {
  lat: number;
  lng: number;
  displayName: string;
  endereco: string;
}

// ---------------------------------------------------------------------------
// Mapa dinâmico (sem SSR)
// ---------------------------------------------------------------------------
const DemandaMapLeaflet = dynamic(() => import('@/components/maps/demanda-map-leaflet'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#0d1b2a]">
      <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
    </div>
  ),
});

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------
const STATUS_ICON: Record<string, React.ReactNode> = {
  PENDENTE:     <Clock className="w-3.5 h-3.5" />,
  EM_ANDAMENTO: <AlertCircle className="w-3.5 h-3.5" />,
  RESOLVIDA:    <CheckCircle className="w-3.5 h-3.5" />,
};

const TIPO_AGENDA_LABELS: Record<string, string> = {
  REUNIAO: 'Reunião', VISITA: 'Visita', EVENTO: 'Evento', COMPROMISSO: 'Compromisso',
};
const TIPO_AGENDA_COLORS: Record<string, string> = {
  REUNIAO: '#6366f1', VISITA: '#f59e0b', EVENTO: '#ec4899', COMPROMISSO: '#14b8a6',
};

const EMENDA_STATUS_LABELS: Record<string, string> = {
  PROPOSTA: 'Proposta', EMPENHADA: 'Empenhada', PAGA: 'Paga', CANCELADA: 'Cancelada',
};
const EMENDA_STATUS_COLORS: Record<string, string> = {
  PROPOSTA: '#6366f1', EMPENHADA: '#f59e0b', PAGA: '#10b981', CANCELADA: '#64748b',
};
const EMENDA_TIPO_LABELS: Record<string, string> = {
  INDIVIDUAL: 'Individual', BANCADA: 'Bancada', COMISSAO: 'Comissão', RELATOR: 'Relator',
};
const formatBRL = (n?: number | null) =>
  typeof n === 'number'
    ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
    : '';

// ---------------------------------------------------------------------------
// Formulário de nova demanda (modal)
// ---------------------------------------------------------------------------
const EMPTY_FORM = {
  title: '', description: '', solicitante: '', contato: '',
  estado: '', municipio: '', bairro: '', endereco: '',
  category: 'OUTROS', status: 'PENDENTE', priority: 'MEDIA',
  observations: '', lat: null as number | null, lng: null as number | null,
  foto: '' as string,
};

const EMPTY_EMENDA_FORM = {
  titulo: '', descricao: '', valor: '' as string,
  autor: '', numero: '', ano: '' as string,
  tipo: 'INDIVIDUAL', orgaoExecutor: '', status: 'PROPOSTA',
  beneficiario: '', estado: '', municipio: '', bairro: '', endereco: '',
  observations: '', lat: null as number | null, lng: null as number | null,
  documento: '' as string,
  documentoNome: '' as string,
};

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export default function MapaDemandasPage() {
  const { status, data: session } = useSession();
  const userRole = (session?.user as any)?.role || 'ASSESSOR';
  const canDeleteEmenda = userRole === 'CHEFE' || userRole === 'ADMIN';
  const router = useRouter();

  const [demands, setDemands] = useState<Demand[]>([]);
  const [agendaEvents, setAgendaEvents] = useState<AgendaEvent[]>([]);
  const [emendas, setEmendas] = useState<Emenda[]>([]);
  const [contatos] = useState<Contato[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDemand, setSelectedDemand] = useState<Demand | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<AgendaEvent | null>(null);
  const [selectedEmenda, setSelectedEmenda] = useState<Emenda | null>(null);

  // Filtros
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [searchText, setSearchText] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Modal nova demanda
  const [showNewModal, setShowNewModal] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Modal nova emenda
  const [showNewEmendaModal, setShowNewEmendaModal] = useState(false);
  const [emendaForm, setEmendaForm] = useState({ ...EMPTY_EMENDA_FORM });
  const [savingEmenda, setSavingEmenda] = useState(false);
  const [emendaSaveError, setEmendaSaveError] = useState('');
  const emendaDocInputRef = useRef<HTMLInputElement>(null);

  // Geocodificação
  const [geoQuery, setGeoQuery] = useState('');
  const [geoResults, setGeoResults] = useState<GeoResult[]>([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [showDemands, setShowDemands] = useState(true);
  const [showAgendas, setShowAgendas] = useState(true);
  const [showEmendas, setShowEmendas] = useState(true);

  // Demandas concluídas — seção colapsável com seleção individual para exibir no mapa
  const [concluidasOpen, setConcluidasOpen] = useState(false);
  const [selectedConcluidaIds, setSelectedConcluidaIds] = useState<Set<string>>(new Set());

  // Sidebar mobile
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Força o Leaflet a recalcular o tamanho ao entrar/sair da tela cheia ou recolher painel
  useEffect(() => {
    const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    return () => clearTimeout(t);
  }, [mapFullscreen]);

  useEffect(() => {
    const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 320);
    return () => clearTimeout(t);
  }, [sidebarCollapsed]);

  // Foto
  const fotoInputRef = useRef<HTMLInputElement>(null);

  // Auth guard
  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  // Carregar dados
  useEffect(() => {
    if (status !== 'authenticated') return;
    fetchAll();
  }, [status]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      // Endpoint combinado: 1 cold-start em vez de 3, 1 conexao DB em vez de 3.
      const res = await fetch('/api/dashboard/mapa-gabinete');
      const data = await res.json();
      setDemands(Array.isArray(data?.demands) ? data.demands : []);
      setAgendaEvents(Array.isArray(data?.agendaEvents)
        ? data.agendaEvents.filter((e: AgendaEvent) => e.lat && e.lng)
        : []);
      setEmendas(Array.isArray(data?.emendas) ? data.emendas : []);
    } finally {
      setLoading(false);
    }
  };

  // Filtrar demandas ativas (excluindo RESOLVIDA — aparecem na seção colapsável)
  const filteredDemands = useMemo(() => demands.filter((d) => {
    if (d.status === 'RESOLVIDA') return false;
    if (filterStatus && d.status !== filterStatus) return false;
    if (filterCategory && d.category !== filterCategory) return false;
    if (filterPriority && d.priority !== filterPriority) return false;
    if (searchText) {
      const q = searchText.toLowerCase();
      return (
        d.title.toLowerCase().includes(q) ||
        d.solicitante.toLowerCase().includes(q) ||
        (d.endereco ?? '').toLowerCase().includes(q) ||
        (d.municipio ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  }), [demands, filterStatus, filterCategory, filterPriority, searchText]);

  // Demandas concluídas (RESOLVIDA) — respeitam filtros de categoria/prioridade/busca
  const demandsResolvidas = useMemo(() => demands.filter((d) => {
    if (d.status !== 'RESOLVIDA') return false;
    if (filterCategory && d.category !== filterCategory) return false;
    if (filterPriority && d.priority !== filterPriority) return false;
    if (searchText) {
      const q = searchText.toLowerCase();
      return (
        d.title.toLowerCase().includes(q) ||
        d.solicitante.toLowerCase().includes(q) ||
        (d.endereco ?? '').toLowerCase().includes(q) ||
        (d.municipio ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  }), [demands, filterCategory, filterPriority, searchText]);

  // Demandas com GPS para o mapa: ativas + concluídas explicitamente selecionadas
  const demandsWithCoords = useMemo(() => {
    const ativas = filteredDemands.filter((d) => d.lat && d.lng);
    const concluidas = demandsResolvidas.filter((d) => d.lat && d.lng && selectedConcluidaIds.has(d.id));
    return [...ativas, ...concluidas];
  }, [filteredDemands, demandsResolvidas, selectedConcluidaIds]);

  const toggleConcluida = useCallback((d: Demand) => {
    setSelectedConcluidaIds(prev => {
      const next = new Set(prev);
      if (next.has(d.id)) { next.delete(d.id); }
      else { next.add(d.id); selectDemandWithFoto(d); if (d.lat && d.lng) setMapCenter([d.lat, d.lng]); }
      return next;
    });
  }, []);

  // Geocodificar endereço
  const geocode = useCallback(async () => {
    if (!geoQuery.trim()) return;
    setGeoLoading(true);
    setGeoResults([]);
    try {
      const res = await fetch(`/api/geocode?address=${encodeURIComponent(geoQuery)}`);
      const data = await res.json();
      setGeoResults(data.results ?? []);
    } finally {
      setGeoLoading(false);
    }
  }, [geoQuery]);

  const geocodeFormAddress = useCallback(async () => {
    const addr = form.endereco || `${form.municipio} ${form.estado}`;
    if (!addr.trim()) return;
    setGeoLoading(true);
    try {
      const res = await fetch(`/api/geocode?address=${encodeURIComponent(addr)}`);
      const data = await res.json();
      if (data.results?.[0]) {
        const r = data.results[0];
        setForm((f) => ({ ...f, lat: r.lat, lng: r.lng, endereco: f.endereco || r.endereco }));
        setMapCenter([r.lat, r.lng]);
      }
    } finally {
      setGeoLoading(false);
    }
  }, [form.endereco, form.municipio, form.estado]);

  // Upload foto — comprime no client (foto da camera de 5MB vira ~300KB).
  const handleFotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { dataUrl } = await compressImage(file);
      setForm((f) => ({ ...f, foto: dataUrl }));
    } catch {
      // fallback: usa o arquivo original sem comprimir
      const reader = new FileReader();
      reader.onload = (ev) => setForm((f) => ({ ...f, foto: (ev.target?.result as string) ?? '' }));
      reader.readAsDataURL(file);
    }
  };

  // Salvar demanda
  const handleSave = async () => {
    if (!form.title || !form.solicitante || !form.municipio || !form.estado) {
      setSaveError('Preencha: título, solicitante, município e estado.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      // Geocodificar automaticamente se há endereço mas não há coordenadas
      let payload = { ...form };
      if (!payload.lat && (payload.endereco || payload.municipio)) {
        const addr = payload.endereco || `${payload.municipio}, ${payload.estado}`;
        try {
          const gRes = await fetch(`/api/geocode?address=${encodeURIComponent(addr)}`);
          const gData = await gRes.json();
          if (gData.results?.[0]) {
            payload = { ...payload, lat: gData.results[0].lat, lng: gData.results[0].lng };
          }
        } catch { /* geocodificação falhou — salva sem coordenadas */ }
      }

      const res = await fetch('/api/demands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Erro');
      setShowNewModal(false);
      setForm({ ...EMPTY_FORM });
      await fetchAll();
    } catch (err: any) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Garante que `foto` esteja carregada antes de exibir o card. A listagem
  // /api/demands pode (por otimizacao de payload) omitir o campo `foto`
  // base64 — entao buscamos a demanda completa sob demanda.
  const selectDemandWithFoto = async (d: Demand) => {
    setSelectedDemand(d);
    setSelectedEvent(null);
    setSelectedEmenda(null);
    if (d.foto) return;
    try {
      const res = await fetch(`/api/demands/${d.id}`);
      if (!res.ok) return;
      const full = await res.json();
      if (!full?.foto) return;
      setSelectedDemand((cur) => (cur?.id === d.id ? { ...cur, ...full } : cur));
      setDemands((arr) => arr.map((x) => (x.id === d.id ? { ...x, ...full } : x)));
    } catch {}
  };

  // Click no mapa — abre popup pelo demanda id
  const handleMapDemandClick = (id: string) => {
    const d = demands.find((x) => x.id === id);
    if (d) selectDemandWithFoto(d);
  };
  const handleMapEventClick = (id: string) => {
    const e = agendaEvents.find((x) => x.id === id);
    if (e) { setSelectedEvent(e); setSelectedDemand(null); setSelectedEmenda(null); }
  };

  // Mesma logica do selectDemandWithFoto para emenda (documento pode ser pesado).
  const selectEmendaWithDoc = async (em: Emenda) => {
    setSelectedEmenda(em);
    setSelectedDemand(null);
    setSelectedEvent(null);
    if (em.documento) return;
    try {
      const res = await fetch(`/api/emendas/${em.id}`);
      if (!res.ok) return;
      const full = await res.json();
      if (!full?.documento) return;
      setSelectedEmenda((cur) => (cur?.id === em.id ? { ...cur, ...full } : cur));
      setEmendas((arr) => arr.map((x) => (x.id === em.id ? { ...x, ...full } : x)));
    } catch {}
  };

  const handleMapEmendaClick = (id: string) => {
    const em = emendas.find((x) => x.id === id);
    if (em) selectEmendaWithDoc(em);
  };

  const handleDeleteEmenda = async (id: string) => {
    if (!canDeleteEmenda) return;
    if (!confirm('Tem certeza que deseja excluir esta emenda? Esta ação não pode ser desfeita.')) return;
    try {
      const res = await fetch(`/api/emendas/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data?.error || 'Erro ao excluir emenda.');
        return;
      }
      setSelectedEmenda(null);
      setEmendas((arr) => arr.filter((x) => x.id !== id));
    } catch {
      alert('Erro ao excluir emenda.');
    }
  };

  // Upload de documento da emenda (PDF, DOC, DOCX, XLS, XLSX, imagens, etc).
  // Imagens passam por compressao no client; PDFs/DOCs passam direto.
  const handleEmendaDocumentoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const MAX_MB = 5;
    if (file.size > MAX_MB * 1024 * 1024) {
      setEmendaSaveError(`Arquivo muito grande. Limite: ${MAX_MB} MB.`);
      e.target.value = '';
      return;
    }
    try {
      const { dataUrl } = await compressImage(file);
      setEmendaForm((f) => ({ ...f, documento: dataUrl, documentoNome: file.name }));
    } catch {
      const reader = new FileReader();
      reader.onload = (ev) => setEmendaForm((f) => ({
        ...f,
        documento: (ev.target?.result as string) ?? '',
        documentoNome: file.name,
      }));
      reader.readAsDataURL(file);
    }
  };

  // Geocodificar endereco da emenda
  const geocodeEmendaAddress = useCallback(async () => {
    const addr = emendaForm.endereco || [emendaForm.municipio, emendaForm.estado].filter(Boolean).join(' ');
    if (!addr.trim()) return;
    setGeoLoading(true);
    try {
      const res = await fetch(`/api/geocode?address=${encodeURIComponent(addr)}`);
      const data = await res.json();
      if (data.results?.[0]) {
        const r = data.results[0];
        setEmendaForm((f) => ({ ...f, lat: r.lat, lng: r.lng, endereco: f.endereco || r.endereco }));
        setMapCenter([r.lat, r.lng]);
      }
    } finally {
      setGeoLoading(false);
    }
  }, [emendaForm.endereco, emendaForm.municipio, emendaForm.estado]);

  // Salvar emenda
  const handleSaveEmenda = async () => {
    if (!emendaForm.titulo.trim()) {
      setEmendaSaveError('Preencha ao menos o título.');
      return;
    }
    setSavingEmenda(true);
    setEmendaSaveError('');
    try {
      let payload: any = { ...emendaForm };
      if (!payload.lat && (payload.endereco || payload.municipio)) {
        const addr = payload.endereco || [payload.municipio, payload.estado].filter(Boolean).join(', ');
        try {
          const gRes = await fetch(`/api/geocode?address=${encodeURIComponent(addr)}`);
          const gData = await gRes.json();
          if (gData.results?.[0]) {
            payload = { ...payload, lat: gData.results[0].lat, lng: gData.results[0].lng };
          }
        } catch {}
      }
      const res = await fetch('/api/emendas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Erro');
      setShowNewEmendaModal(false);
      setEmendaForm({ ...EMPTY_EMENDA_FORM });
      await fetchAll();
    } catch (err: any) {
      setEmendaSaveError(err.message);
    } finally {
      setSavingEmenda(false);
    }
  };

  const emendasWithCoords = useMemo(() => emendas.filter((em) => em.lat && em.lng), [emendas]);

  if (status === 'loading' || loading) {
    return (
      <div className="-m-4 -mt-16 lg:-m-8 h-screen flex items-center justify-center bg-[#0a1628]">
        <Loader2 className="w-10 h-10 animate-spin text-sky-400" />
      </div>
    );
  }

  const categoryKeys = Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[];

  return (
    <div className="-m-4 -mt-16 lg:-m-8 h-screen flex flex-col bg-[#0a1628] overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <MapPin className="w-6 h-6 text-sky-400" />
          <div>
            <h1 className="text-white font-bold text-lg leading-tight">Mapa do Gabinete</h1>
            <p className="text-gray-400 text-xs">
              {demandsWithCoords.length} demanda{demandsWithCoords.length !== 1 ? 's' : ''} no mapa
              {agendaEvents.length > 0 && ` · ${agendaEvents.length} evento${agendaEvents.length !== 1 ? 's' : ''} da agenda`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Busca de endereço no mapa — só desktop */}
          <div className="relative hidden md:flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2">
            <Navigation className="w-4 h-4 text-gray-400" />
            <input
              value={geoQuery}
              onChange={(e) => setGeoQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && geocode()}
              placeholder="Buscar endereço no mapa..."
              className="bg-transparent text-white text-sm w-52 outline-none placeholder-gray-500"
            />
            {geoLoading
              ? <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
              : <button onClick={geocode} className="text-sky-400 hover:text-sky-300"><Search className="w-4 h-4" /></button>
            }
            {geoResults.length > 0 && (
              <div className="absolute top-full left-0 mt-1 w-80 bg-[#0d1b2a] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                {geoResults.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => { setMapCenter([r.lat, r.lng]); setGeoResults([]); setGeoQuery(r.endereco); }}
                    className="w-full text-left px-4 py-2.5 hover:bg-white/5 text-sm text-gray-300 border-b border-white/5 last:border-0"
                  >
                    <div className="font-medium text-white truncate">{r.endereco}</div>
                    <div className="text-xs text-gray-500 truncate">{r.displayName}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Lista — mobile only */}
          <button
            onClick={() => setMobileSidebar(true)}
            className="md:hidden flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-white/5 text-gray-300 hover:bg-white/10 transition-all"
          >
            <Filter className="w-4 h-4" />
            Lista
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`hidden md:flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${showFilters ? 'bg-sky-600 text-white' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}
          >
            <Filter className="w-4 h-4" />
            Filtros
          </button>
          <button
            onClick={() => { setShowNewModal(true); setForm({ ...EMPTY_FORM }); setSaveError(''); }}
            className="flex items-center gap-1.5 px-3 md:px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-semibold transition-all"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nova Demanda</span>
          </button>
          <button
            onClick={() => { setShowNewEmendaModal(true); setEmendaForm({ ...EMPTY_EMENDA_FORM }); setEmendaSaveError(''); }}
            className="flex items-center gap-1.5 px-3 md:px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold transition-all"
          >
            <DollarSign className="w-4 h-4" />
            <span className="hidden sm:inline">Nova Emenda</span>
          </button>
        </div>
      </div>

      {/* ── Filtros (desktop) ── */}
      {showFilters && (
        <div className="hidden md:flex items-center gap-3 px-4 py-2 border-b border-white/10 bg-white/2 flex-wrap flex-shrink-0">
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Buscar por título, solicitante..."
            className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white placeholder-gray-500 outline-none w-56"
          />
          <Select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            options={[{ value: '', label: 'Todos os status' }, ...Object.entries(STATUS_LABELS).filter(([k]) => k !== 'RESOLVIDA').map(([k, v]) => ({ value: k, label: v }))]}
          />
          <Select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            options={[{ value: '', label: 'Todas as categorias' }, ...categoryKeys.map((k) => ({ value: k, label: CATEGORY_LABELS[k] }))]}
          />
          <Select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            options={[{ value: '', label: 'Todas as prioridades' }, ...Object.entries(PRIORITY_LABELS).map(([k, v]) => ({ value: k, label: v }))]}
          />
          {(filterStatus || filterCategory || filterPriority || searchText) && (
            <button onClick={() => { setFilterStatus(''); setFilterCategory(''); setFilterPriority(''); setSearchText(''); }}
              className="text-xs text-gray-400 hover:text-white flex items-center gap-1">
              <X className="w-3 h-3" /> Limpar
            </button>
          )}
        </div>
      )}

      {/* ── Conteúdo principal ── */}
      <div className="flex flex-1 min-h-0 gap-3 p-3 overflow-hidden">
        {/* Painel lateral — lista de demandas (desktop) */}
        <div className={`hidden md:flex flex-shrink-0 flex-col border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 bg-[#0d1b2a] ${sidebarCollapsed ? 'w-0 border-transparent' : 'w-72'}`}>
          <div className="px-3 py-2 border-b border-white/10 flex-shrink-0 flex items-center justify-between gap-2">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide truncate">
              {filteredDemands.length} demanda{filteredDemands.length !== 1 ? 's' : ''}
              {demandsWithCoords.length < filteredDemands.length && (
                <span className="text-yellow-500/70 ml-1">({filteredDemands.length - demandsWithCoords.length} sem GPS)</span>
              )}
            </p>
            <div className="flex gap-1 flex-shrink-0 items-center">
              <button
                onClick={() => setShowDemands(v => !v)}
                title={showDemands ? 'Ocultar demandas' : 'Exibir demandas'}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all ${showDemands ? 'bg-sky-500/20 border-sky-500/50 text-sky-400' : 'bg-white/5 border-white/10 text-gray-500 hover:text-gray-300'}`}
              >
                <MapPin className="w-3 h-3" />
                Demandas
              </button>
              <button
                onClick={() => setShowAgendas(v => !v)}
                title={showAgendas ? 'Ocultar agenda' : 'Exibir agenda'}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all ${showAgendas ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400' : 'bg-white/5 border-white/10 text-gray-500 hover:text-gray-300'}`}
              >
                <Calendar className="w-3 h-3" />
                Agenda
              </button>
              <button
                onClick={() => setShowEmendas(v => !v)}
                title={showEmendas ? 'Ocultar emendas' : 'Exibir emendas'}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all ${showEmendas ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'bg-white/5 border-white/10 text-gray-500 hover:text-gray-300'}`}
              >
                <DollarSign className="w-3 h-3" />
                Emendas
              </button>
              <button
                onClick={() => setSidebarCollapsed(true)}
                title="Recolher painel"
                className="p-1 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-all"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {showDemands && filteredDemands.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2">
                <MapPin className="w-8 h-8 text-gray-600" />
                <p className="text-gray-500 text-sm">Nenhuma demanda encontrada</p>
              </div>
            ) : showDemands ? (
              filteredDemands.map((d) => (
                <button
                  key={d.id}
                  onClick={() => { selectDemandWithFoto(d); if (d.lat && d.lng) setMapCenter([d.lat, d.lng]); }}
                  className={`w-full text-left px-3 py-2.5 border-b border-white/5 hover:bg-white/5 transition-all ${selectedDemand?.id === d.id ? 'bg-sky-900/30 border-l-2 border-l-sky-400' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: CATEGORY_COLORS[d.category as keyof typeof CATEGORY_COLORS] ?? '#9e9e9e' }} />
                        <span className="text-white text-xs font-semibold truncate">{d.title}</span>
                      </div>
                      <p className="text-gray-500 text-xs truncate">{d.solicitante}</p>
                      {d.endereco && <p className="text-gray-600 text-xs truncate mt-0.5">{d.endereco}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="text-xs px-1.5 py-0.5 rounded flex items-center gap-1"
                        style={{ background: (STATUS_COLORS[d.status as keyof typeof STATUS_COLORS] ?? '#9e9e9e') + '22', color: STATUS_COLORS[d.status as keyof typeof STATUS_COLORS] ?? '#9e9e9e' }}>
                        {STATUS_ICON[d.status]} {STATUS_LABELS[d.status as keyof typeof STATUS_LABELS]}
                      </span>
                      {!d.lat && <span className="text-yellow-600 text-xs">Sem GPS</span>}
                    </div>
                  </div>
                </button>
              ))
            ) : null}

            {/* Seção colapsável — demandas concluídas */}
            {showDemands && demandsResolvidas.length > 0 && (
              <div className="border-t border-white/10">
                <button
                  onClick={() => setConcluidasOpen(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/5 transition-all"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                    <span className="text-xs font-semibold text-green-400">
                      Concluídas ({demandsResolvidas.length})
                    </span>
                    {selectedConcluidaIds.size > 0 && (
                      <span className="text-[10px] bg-green-500/20 text-green-400 border border-green-500/30 px-1.5 py-0.5 rounded-full">
                        {selectedConcluidaIds.size} no mapa
                      </span>
                    )}
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${concluidasOpen ? 'rotate-180' : ''}`} />
                </button>

                {concluidasOpen && demandsResolvidas.map((d) => {
                  const isSel = selectedConcluidaIds.has(d.id);
                  return (
                    <button
                      key={d.id}
                      onClick={() => toggleConcluida(d)}
                      className={`w-full text-left px-3 py-2.5 border-b border-white/5 hover:bg-white/5 transition-all flex items-start gap-2.5 ${isSel ? 'bg-green-900/20 border-l-2 border-l-green-500' : ''}`}
                    >
                      <span className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-all ${isSel ? 'bg-green-500 border-green-500' : 'border-white/20 bg-white/5'}`}>
                        {isSel && <CheckCircle className="w-2.5 h-2.5 text-white" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: CATEGORY_COLORS[d.category as keyof typeof CATEGORY_COLORS] ?? '#9e9e9e' }} />
                          <span className={`text-xs font-semibold truncate ${isSel ? 'text-green-300' : 'text-gray-400'}`}>{d.title}</span>
                        </div>
                        <p className="text-gray-600 text-xs truncate">{d.solicitante}</p>
                        {d.endereco && <p className="text-gray-700 text-xs truncate mt-0.5">{d.endereco}</p>}
                        {!d.lat && <span className="text-yellow-600 text-[10px]">Sem GPS</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Eventos da agenda com localização */}
            {showAgendas && agendaEvents.length > 0 && (
              <>
                <div className="px-3 py-2 border-b border-white/10 bg-white/2 flex-shrink-0 mt-1">
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest">Eventos da Agenda</p>
                </div>
                {agendaEvents.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => { setSelectedEvent(e); setSelectedDemand(null); setSelectedEmenda(null); if (e.lat && e.lng) setMapCenter([e.lat, e.lng]); }}
                    className={`w-full text-left px-3 py-2.5 border-b border-white/5 hover:bg-white/5 transition-all ${selectedEvent?.id === e.id ? 'bg-indigo-900/30 border-l-2 border-l-indigo-400' : ''}`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: e.cor ?? TIPO_AGENDA_COLORS[e.tipo] ?? '#6366f1' }} />
                      <span className="text-white text-xs font-semibold truncate">{e.titulo}</span>
                    </div>
                    <p className="text-gray-500 text-xs">{TIPO_AGENDA_LABELS[e.tipo]} · {new Date(e.data).toLocaleDateString('pt-BR')}</p>
                    {e.local && <p className="text-gray-600 text-xs truncate">{e.local}</p>}
                  </button>
                ))}
              </>
            )}
            {showEmendas && emendas.length > 0 && (
              <>
                <div className="px-3 py-2 border-b border-white/10 bg-white/2 flex-shrink-0 mt-1">
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest">Emendas Parlamentares</p>
                </div>
                {emendas.map((em) => (
                  <button
                    key={em.id}
                    onClick={() => { selectEmendaWithDoc(em); if (em.lat && em.lng) setMapCenter([em.lat, em.lng]); }}
                    className={`w-full text-left px-3 py-2.5 border-b border-white/5 hover:bg-white/5 transition-all ${selectedEmenda?.id === em.id ? 'bg-emerald-900/30 border-l-2 border-l-emerald-400' : ''}`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: EMENDA_STATUS_COLORS[em.status] ?? '#10b981' }} />
                      <span className="text-white text-xs font-semibold truncate">{em.titulo}</span>
                    </div>
                    <p className="text-gray-500 text-xs">
                      {EMENDA_TIPO_LABELS[em.tipo]}
                      {typeof em.valor === 'number' && <span className="text-amber-400/90 ml-1">· {formatBRL(em.valor)}</span>}
                    </p>
                    {em.beneficiario && <p className="text-gray-600 text-xs truncate">{em.beneficiario}</p>}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>

        {/* Drawer mobile — lista de demandas */}
        {mobileSidebar && (
          <>
            <div className="md:hidden fixed inset-0 bg-black/60 z-[1500]" onClick={() => setMobileSidebar(false)} />
            <div className="md:hidden fixed inset-y-0 right-0 w-full max-w-xs bg-[#0a1628] border-l border-white/10 z-[1600] flex flex-col">
              <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between gap-2 flex-shrink-0">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                  {filteredDemands.length} demanda{filteredDemands.length !== 1 ? 's' : ''}
                </p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setShowDemands(v => !v)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all ${showDemands ? 'bg-sky-500/20 border-sky-500/50 text-sky-400' : 'bg-white/5 border-white/10 text-gray-500'}`}>
                    <MapPin className="w-3 h-3" />Demandas
                  </button>
                  <button onClick={() => setShowAgendas(v => !v)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all ${showAgendas ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400' : 'bg-white/5 border-white/10 text-gray-500'}`}>
                    <Calendar className="w-3 h-3" />Agenda
                  </button>
                  <button onClick={() => setShowEmendas(v => !v)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all ${showEmendas ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'bg-white/5 border-white/10 text-gray-500'}`}>
                    <DollarSign className="w-3 h-3" />Emendas
                  </button>
                  <button onClick={() => setMobileSidebar(false)} className="ml-1 p-1.5 text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
                </div>
              </div>
              {/* Filtros mobile */}
              <div className="px-3 py-1.5 border-b border-white/10 flex flex-col gap-1.5 flex-shrink-0">
                <input value={searchText} onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Buscar..." className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 outline-none" />
                <div className="grid grid-cols-2 gap-2">
                  <Select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    options={[{ value: '', label: 'Todos status' }, ...Object.entries(STATUS_LABELS).filter(([k]) => k !== 'RESOLVIDA').map(([k, v]) => ({ value: k, label: v }))]}
                  />
                  <Select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    options={[{ value: '', label: 'Todas cat.' }, ...categoryKeys.map((k) => ({ value: k, label: CATEGORY_LABELS[k] }))]}
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {filteredDemands.map((d) => (
                  <button key={d.id}
                    onClick={() => { selectDemandWithFoto(d); if (d.lat && d.lng) setMapCenter([d.lat, d.lng]); setMobileSidebar(false); }}
                    className={`w-full text-left px-3 py-2.5 border-b border-white/5 hover:bg-white/5 transition-all ${selectedDemand?.id === d.id ? 'bg-sky-900/30 border-l-2 border-l-sky-400' : ''}`}>
                    <p className="text-white text-xs font-semibold truncate mb-0.5">{d.title}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                        style={{ background: (STATUS_COLORS[d.status as keyof typeof STATUS_COLORS] ?? '#9e9e9e') + '22', color: STATUS_COLORS[d.status as keyof typeof STATUS_COLORS] ?? '#9e9e9e' }}>
                        {STATUS_LABELS[d.status as keyof typeof STATUS_LABELS]}
                      </span>
                      <span className="text-gray-500 text-[10px] truncate">{d.solicitante}</span>
                    </div>
                  </button>
                ))}
                {agendaEvents.length > 0 && showAgendas && (
                  <>
                    <div className="px-3 py-2 border-b border-white/10 bg-white/2 flex-shrink-0 mt-1">
                      <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest">Agenda</p>
                    </div>
                    {agendaEvents.map((e) => (
                      <button key={e.id}
                        onClick={() => { setSelectedEvent(e); setSelectedDemand(null); setSelectedEmenda(null); if (e.lat && e.lng) setMapCenter([e.lat, e.lng]); setMobileSidebar(false); }}
                        className={`w-full text-left px-3 py-2.5 border-b border-white/5 hover:bg-white/5 transition-all ${selectedEvent?.id === e.id ? 'bg-indigo-900/30 border-l-2 border-l-indigo-400' : ''}`}>
                        <p className="text-white text-xs font-semibold truncate">{e.titulo}</p>
                        <p className="text-gray-500 text-[10px]">{TIPO_AGENDA_LABELS[e.tipo]} · {new Date(e.data).toLocaleDateString('pt-BR')}</p>
                      </button>
                    ))}
                  </>
                )}
                {emendas.length > 0 && showEmendas && (
                  <>
                    <div className="px-3 py-2 border-b border-white/10 bg-white/2 flex-shrink-0 mt-1">
                      <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest">Emendas</p>
                    </div>
                    {emendas.map((em) => (
                      <button key={em.id}
                        onClick={() => { selectEmendaWithDoc(em); if (em.lat && em.lng) setMapCenter([em.lat, em.lng]); setMobileSidebar(false); }}
                        className={`w-full text-left px-3 py-2.5 border-b border-white/5 hover:bg-white/5 transition-all ${selectedEmenda?.id === em.id ? 'bg-emerald-900/30 border-l-2 border-l-emerald-400' : ''}`}>
                        <p className="text-white text-xs font-semibold truncate">{em.titulo}</p>
                        <p className="text-gray-500 text-[10px]">
                          {EMENDA_TIPO_LABELS[em.tipo]}
                          {typeof em.valor === 'number' && <span className="text-amber-400/90 ml-1">· {formatBRL(em.valor)}</span>}
                        </p>
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {/* Mapa */}
        <div className={mapFullscreen ? 'fixed inset-0 z-[2000] bg-[#0d1b2a]' : 'flex-1 relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-[#0d1b2a]'}>
          <DemandaMapLeaflet
            demands={showDemands ? demandsWithCoords : []}
            agendaEvents={showAgendas ? agendaEvents : []}
            emendas={showEmendas ? emendasWithCoords : []}
            contatos={contatos}
            center={mapCenter}
            selectedDemandId={selectedDemand?.id}
            selectedEventId={selectedEvent?.id}
            selectedEmendaId={selectedEmenda?.id}
            onDemandClick={handleMapDemandClick}
            onEventClick={handleMapEventClick}
            onEmendaClick={handleMapEmendaClick}
            showSpDistritos
          />

          {/* Botão expandir painel — canto superior esquerdo */}
          {sidebarCollapsed && (
            <button
              onClick={() => setSidebarCollapsed(false)}
              title="Expandir painel lateral"
              className="absolute top-3 left-3 z-[1000] flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold tracking-wide text-slate-200 hover:text-white bg-[#0d1b2a]/95 backdrop-blur-md border border-white/20 hover:border-sky-400/50 hover:bg-[#111f35] transition-all duration-200 shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
            >
              <ChevronRight className="w-4 h-4" />
              <span className="hidden sm:inline">Painel</span>
            </button>
          )}

          {/* Botão tela cheia — canto superior direito */}
          <button
            onClick={() => setMapFullscreen(f => !f)}
            className="absolute top-3 right-3 z-[1000] p-2.5 rounded-2xl text-slate-200 hover:text-white bg-[#0d1b2a]/95 backdrop-blur-md border border-white/20 hover:border-white/40 hover:bg-[#111f35] transition-all duration-200 shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
            title={mapFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
          >
            {mapFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Popup detalhe — demanda */}
          {selectedDemand && (
            <div className="absolute bottom-0 left-0 right-0 md:bottom-auto md:top-14 md:right-3 md:left-auto md:w-64 w-full bg-[#0a1628] border-t md:border border-white/15 md:rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.7)] z-[1000] overflow-hidden max-h-[65vh] overflow-y-auto">
              {selectedDemand.foto
                ? <div className="w-full h-32 bg-black overflow-hidden flex-shrink-0">
                    <img src={selectedDemand.foto} alt="Foto da demanda" className="w-full h-full object-cover" />
                  </div>
                : <div className="h-1 w-full flex-shrink-0" style={{ background: CATEGORY_COLORS[selectedDemand.category as keyof typeof CATEGORY_COLORS] ?? '#4a9ede' }} />
              }
              <div className="p-3">
                <div className="flex items-start justify-between gap-2 mb-2.5">
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: CATEGORY_COLORS[selectedDemand.category as keyof typeof CATEGORY_COLORS] ?? '#9e9e9e' }} />
                      <span className="text-[11px] font-semibold" style={{ color: CATEGORY_COLORS[selectedDemand.category as keyof typeof CATEGORY_COLORS] ?? '#9e9e9e' }}>
                        {CATEGORY_LABELS[selectedDemand.category as keyof typeof CATEGORY_LABELS]}
                      </span>
                    </div>
                    <h3 className="text-white font-bold text-sm leading-snug">{selectedDemand.title}</h3>
                  </div>
                  <button onClick={() => setSelectedDemand(null)} className="text-gray-500 hover:text-white transition-colors flex-shrink-0 p-0.5 rounded-lg hover:bg-white/10">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-1.5 text-[11px] bg-white/5 rounded-xl p-2.5 mb-2.5 border border-white/5">
                  <div className="flex items-center gap-2 text-gray-200">
                    <User className="w-3 h-3 text-sky-400 flex-shrink-0" />
                    <span>{selectedDemand.solicitante}</span>
                  </div>
                  {selectedDemand.contato && (
                    <div className="flex items-center gap-2 text-gray-200">
                      <Phone className="w-3 h-3 text-sky-400 flex-shrink-0" />
                      <span>{selectedDemand.contato}</span>
                    </div>
                  )}
                  {selectedDemand.endereco
                    ? <div className="flex items-center gap-2 text-gray-200">
                        <MapPin className="w-3 h-3 text-sky-400 flex-shrink-0" />
                        <span>{selectedDemand.endereco}</span>
                      </div>
                    : <div className="flex items-center gap-2 text-gray-200">
                        <Building2 className="w-3 h-3 text-sky-400 flex-shrink-0" />
                        <span>{selectedDemand.municipio}, {selectedDemand.estado}</span>
                      </div>
                  }
                  <div className="flex items-center gap-2 text-gray-200">
                    <Calendar className="w-3 h-3 text-sky-400 flex-shrink-0" />
                    <span>{new Date(selectedDemand.createdAt).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 mb-2.5">
                  <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-lg font-semibold"
                    style={{ background: (STATUS_COLORS[selectedDemand.status as keyof typeof STATUS_COLORS] ?? '#9e9e9e') + '30', color: STATUS_COLORS[selectedDemand.status as keyof typeof STATUS_COLORS] ?? '#9e9e9e', border: `1px solid ${(STATUS_COLORS[selectedDemand.status as keyof typeof STATUS_COLORS] ?? '#9e9e9e')}50` }}>
                    {STATUS_ICON[selectedDemand.status]}
                    {STATUS_LABELS[selectedDemand.status as keyof typeof STATUS_LABELS]}
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-lg font-semibold"
                    style={{ background: (PRIORITY_COLORS[selectedDemand.priority as keyof typeof PRIORITY_COLORS] ?? '#9e9e9e') + '30', color: PRIORITY_COLORS[selectedDemand.priority as keyof typeof PRIORITY_COLORS] ?? '#9e9e9e', border: `1px solid ${(PRIORITY_COLORS[selectedDemand.priority as keyof typeof PRIORITY_COLORS] ?? '#9e9e9e')}50` }}>
                    {PRIORITY_LABELS[selectedDemand.priority as keyof typeof PRIORITY_LABELS]}
                  </span>
                </div>

                {selectedDemand.description && (
                  <p className="text-gray-300 text-[11px] leading-relaxed line-clamp-2 mb-2.5">{selectedDemand.description}</p>
                )}

                {selectedDemand.lat && selectedDemand.lng && (
                  <div className="pt-2.5 border-t border-white/10">
                    <p className="text-[11px] text-gray-400 font-medium mb-2">Traçar rota até aqui</p>
                    <div className="flex gap-3">
                      <a href={`https://waze.com/ul?ll=${selectedDemand.lat},${selectedDemand.lng}&navigate=yes`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex-1 flex flex-col items-center gap-1 transition-all hover:scale-105 active:scale-95">
                        <img src="/waze-logo.png" alt="Waze" className="w-10 h-10 rounded-xl shadow-lg object-cover" />
                        <span className="text-[11px] font-semibold text-gray-200">Waze</span>
                      </a>
                      <a href={`https://www.google.com/maps/dir/?api=1&destination=${selectedDemand.lat},${selectedDemand.lng}`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex-1 flex flex-col items-center gap-1 transition-all hover:scale-105 active:scale-95">
                        <img src="/google-maps-logo.png" alt="Google Maps" className="w-10 h-10 rounded-xl shadow-lg object-cover" />
                        <span className="text-[11px] font-semibold text-gray-200">Google Maps</span>
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Popup detalhe — evento */}
          {selectedEvent && (
            <div className="absolute bottom-0 left-0 right-0 md:bottom-auto md:top-14 md:right-4 md:left-auto md:w-80 w-full bg-[#0a1628] border-t md:border border-white/15 md:rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.7)] z-[1000] overflow-hidden max-h-[60vh] overflow-y-auto">
              <div className="h-1 w-full flex-shrink-0" style={{ background: selectedEvent.cor ?? TIPO_AGENDA_COLORS[selectedEvent.tipo] ?? '#6366f1' }} />
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: selectedEvent.cor ?? TIPO_AGENDA_COLORS[selectedEvent.tipo] ?? '#6366f1' }} />
                      <span className="text-xs font-semibold" style={{ color: selectedEvent.cor ?? TIPO_AGENDA_COLORS[selectedEvent.tipo] ?? '#6366f1' }}>
                        {TIPO_AGENDA_LABELS[selectedEvent.tipo]}
                      </span>
                    </div>
                    <h3 className="text-white font-bold text-sm">{selectedEvent.titulo}</h3>
                  </div>
                  <button onClick={() => setSelectedEvent(null)} className="text-gray-500 hover:text-white transition-colors flex-shrink-0 p-0.5 rounded-lg hover:bg-white/10">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-2 text-xs bg-white/5 rounded-xl p-3 mb-3 border border-white/5">
                  <div className="flex items-center gap-2.5 text-gray-200">
                    <Calendar className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                    <span>{new Date(selectedEvent.data).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  </div>
                  {selectedEvent.local && (
                    <div className="flex items-center gap-2.5 text-gray-200">
                      <MapPin className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                      <span>{selectedEvent.local}</span>
                    </div>
                  )}
                </div>

                {selectedEvent.descricao && (
                  <p className="text-gray-300 text-xs leading-relaxed mb-3">{selectedEvent.descricao}</p>
                )}

                {selectedEvent.lat && selectedEvent.lng && (
                  <div className="pt-3 border-t border-white/10">
                    <p className="text-xs text-gray-400 font-medium mb-2.5">Traçar rota até aqui</p>
                    <div className="flex gap-3">
                      <a href={`https://waze.com/ul?ll=${selectedEvent.lat},${selectedEvent.lng}&navigate=yes`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex-1 flex flex-col items-center gap-1.5 transition-all hover:scale-105 active:scale-95">
                        <img src="/waze-logo.png" alt="Waze" className="w-12 h-12 rounded-2xl shadow-lg object-cover" />
                        <span className="text-xs font-semibold text-gray-200">Waze</span>
                      </a>
                      <a href={`https://www.google.com/maps/dir/?api=1&destination=${selectedEvent.lat},${selectedEvent.lng}`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex-1 flex flex-col items-center gap-1.5 transition-all hover:scale-105 active:scale-95">
                        <img src="/google-maps-logo.png" alt="Google Maps" className="w-12 h-12 rounded-2xl shadow-lg object-cover" />
                        <span className="text-xs font-semibold text-gray-200">Google Maps</span>
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Popup detalhe — emenda */}
          {selectedEmenda && (
            <div className="absolute bottom-0 left-0 right-0 md:bottom-auto md:top-14 md:right-3 md:left-auto md:w-72 w-full bg-[#0a1628] border-t md:border border-white/15 md:rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.7)] z-[1000] overflow-hidden max-h-[65vh] overflow-y-auto">
              <div className="h-1 w-full flex-shrink-0" style={{ background: EMENDA_STATUS_COLORS[selectedEmenda.status] ?? '#10b981' }} />
              <div className="p-3">
                <div className="flex items-start justify-between gap-2 mb-2.5">
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: EMENDA_STATUS_COLORS[selectedEmenda.status] ?? '#10b981' }} />
                      <span className="text-[11px] font-semibold" style={{ color: EMENDA_STATUS_COLORS[selectedEmenda.status] ?? '#10b981' }}>
                        Emenda {EMENDA_TIPO_LABELS[selectedEmenda.tipo]}
                      </span>
                    </div>
                    <h3 className="text-white font-bold text-sm leading-snug">{selectedEmenda.titulo}</h3>
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    {canDeleteEmenda && (
                      <button
                        onClick={() => handleDeleteEmenda(selectedEmenda.id)}
                        title="Excluir emenda"
                        className="text-gray-500 hover:text-red-400 transition-colors p-1 rounded-lg hover:bg-red-500/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button onClick={() => setSelectedEmenda(null)} className="text-gray-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {typeof selectedEmenda.valor === 'number' && (
                  <div className="flex items-center gap-1.5 text-amber-300 text-base font-bold mb-2.5">
                    <DollarSign className="w-4 h-4" />
                    <span>{formatBRL(selectedEmenda.valor)}</span>
                  </div>
                )}

                <div className="space-y-1.5 text-[11px] bg-white/5 rounded-xl p-2.5 mb-2.5 border border-white/5">
                  {selectedEmenda.autor && (
                    <div className="flex items-center gap-2 text-gray-200">
                      <User className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                      <span>
                        {selectedEmenda.autor}
                        {selectedEmenda.numero && <span className="text-gray-500"> · nº {selectedEmenda.numero}</span>}
                        {selectedEmenda.ano && <span className="text-gray-500"> ({selectedEmenda.ano})</span>}
                      </span>
                    </div>
                  )}
                  {selectedEmenda.beneficiario && (
                    <div className="flex items-center gap-2 text-gray-200">
                      <CheckCircle className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                      <span>{selectedEmenda.beneficiario}</span>
                    </div>
                  )}
                  {selectedEmenda.orgaoExecutor && (
                    <div className="flex items-center gap-2 text-gray-200">
                      <Building2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                      <span>{selectedEmenda.orgaoExecutor}</span>
                    </div>
                  )}
                  {selectedEmenda.endereco
                    ? <div className="flex items-center gap-2 text-gray-200">
                        <MapPin className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                        <span>{selectedEmenda.endereco}</span>
                      </div>
                    : (selectedEmenda.municipio || selectedEmenda.estado) && (
                      <div className="flex items-center gap-2 text-gray-200">
                        <MapPin className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                        <span>{[selectedEmenda.municipio, selectedEmenda.estado].filter(Boolean).join(', ')}</span>
                      </div>
                    )
                  }
                </div>

                <div className="flex items-center gap-1.5 mb-2.5">
                  <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-lg font-semibold"
                    style={{ background: (EMENDA_STATUS_COLORS[selectedEmenda.status] ?? '#10b981') + '30', color: EMENDA_STATUS_COLORS[selectedEmenda.status] ?? '#10b981', border: `1px solid ${(EMENDA_STATUS_COLORS[selectedEmenda.status] ?? '#10b981')}50` }}>
                    {EMENDA_STATUS_LABELS[selectedEmenda.status] ?? selectedEmenda.status}
                  </span>
                </div>

                {selectedEmenda.descricao && (
                  <p className="text-gray-300 text-[11px] leading-relaxed line-clamp-3 mb-2.5">{selectedEmenda.descricao}</p>
                )}

                {selectedEmenda.documento && (
                  <a
                    href={selectedEmenda.documento}
                    download={selectedEmenda.documentoNome || 'documento'}
                    className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors rounded-xl px-3 py-2 mb-2.5"
                  >
                    <FileText className="w-4 h-4 text-emerald-300 flex-shrink-0" />
                    <span className="text-[11px] text-emerald-100 truncate flex-1">
                      {selectedEmenda.documentoNome || 'Documento anexado'}
                    </span>
                    <Download className="w-3.5 h-3.5 text-emerald-300 flex-shrink-0" />
                  </a>
                )}

                {selectedEmenda.lat && selectedEmenda.lng && (
                  <div className="pt-2.5 border-t border-white/10">
                    <p className="text-[11px] text-gray-400 font-medium mb-2">Traçar rota até aqui</p>
                    <div className="flex gap-3">
                      <a href={`https://waze.com/ul?ll=${selectedEmenda.lat},${selectedEmenda.lng}&navigate=yes`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex-1 flex flex-col items-center gap-1 transition-all hover:scale-105 active:scale-95">
                        <img src="/waze-logo.png" alt="Waze" className="w-10 h-10 rounded-xl shadow-lg object-cover" />
                        <span className="text-[11px] font-semibold text-gray-200">Waze</span>
                      </a>
                      <a href={`https://www.google.com/maps/dir/?api=1&destination=${selectedEmenda.lat},${selectedEmenda.lng}`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex-1 flex flex-col items-center gap-1 transition-all hover:scale-105 active:scale-95">
                        <img src="/google-maps-logo.png" alt="Google Maps" className="w-10 h-10 rounded-xl shadow-lg object-cover" />
                        <span className="text-[11px] font-semibold text-gray-200">Google Maps</span>
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal nova demanda ── */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-[#0d1b2a] border border-white/10 rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <Plus className="w-5 h-5 text-sky-400" />
                <h2 className="text-white font-semibold">Nova Demanda</h2>
              </div>
              <button onClick={() => setShowNewModal(false)} className="text-gray-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Título */}
              <div>
                <label className="text-xs text-gray-400 font-medium uppercase tracking-widest">Título *</label>
                <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none focus:border-sky-500"
                  placeholder="Descreva a demanda em uma linha" />
              </div>

              {/* Solicitante + Contato */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 font-medium uppercase tracking-widest">Solicitante *</label>
                  <input value={form.solicitante} onChange={(e) => setForm((f) => ({ ...f, solicitante: e.target.value }))}
                    className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none focus:border-sky-500"
                    placeholder="Nome completo" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-medium uppercase tracking-widest">Contato</label>
                  <input value={form.contato} onChange={(e) => setForm((f) => ({ ...f, contato: e.target.value }))}
                    className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none focus:border-sky-500"
                    placeholder="Telefone ou email" />
                </div>
              </div>

              {/* Estado + Município */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 font-medium uppercase tracking-widest">Estado *</label>
                  <input value={form.estado} onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value }))}
                    className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none focus:border-sky-500"
                    placeholder="UF (ex: SP)" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-medium uppercase tracking-widest">Município *</label>
                  <input value={form.municipio} onChange={(e) => setForm((f) => ({ ...f, municipio: e.target.value }))}
                    className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none focus:border-sky-500"
                    placeholder="Nome do município" />
                </div>
              </div>

              {/* Endereço + Geocodificar */}
              <div>
                <label className="text-xs text-gray-400 font-medium uppercase tracking-widest">Endereço completo</label>
                <div className="flex gap-2 mt-1">
                  <input value={form.endereco} onChange={(e) => setForm((f) => ({ ...f, endereco: e.target.value }))}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none focus:border-sky-500"
                    placeholder="Rua, número, bairro" />
                  <button onClick={geocodeFormAddress} disabled={geoLoading}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-sky-700 hover:bg-sky-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50">
                    {geoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
                    Localizar
                  </button>
                </div>
                {form.lat && form.lng && (
                  <p className="text-xs text-green-400 mt-1 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Localização: {form.lat.toFixed(5)}, {form.lng.toFixed(5)}
                  </p>
                )}
              </div>

              {/* Categoria + Status + Prioridade */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-gray-400 font-medium uppercase tracking-widest">Categoria</label>
                  <Select
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    options={categoryKeys.map((k) => ({ value: k, label: CATEGORY_LABELS[k] }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-medium uppercase tracking-widest">Status</label>
                  <Select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                    options={Object.entries(STATUS_LABELS).map(([k, v]) => ({ value: k, label: v }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-medium uppercase tracking-widest">Prioridade</label>
                  <Select
                    value={form.priority}
                    onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                    options={Object.entries(PRIORITY_LABELS).map(([k, v]) => ({ value: k, label: v }))}
                    className="mt-1"
                  />
                </div>
              </div>

              {/* Descrição */}
              <div>
                <label className="text-xs text-gray-400 font-medium uppercase tracking-widest">Descrição</label>
                <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none focus:border-sky-500 resize-none"
                  placeholder="Detalhes da demanda..." />
              </div>

              {/* Foto */}
              <div>
                <label className="text-xs text-gray-400 font-medium uppercase tracking-widest">Foto (opcional)</label>
                <div className="mt-1 flex items-center gap-3">
                  <button onClick={() => fotoInputRef.current?.click()}
                    className="flex items-center gap-2 px-3.5 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-gray-300 hover:bg-white/10">
                    <Camera className="w-4 h-4" />
                    {form.foto ? 'Trocar foto' : 'Adicionar foto'}
                  </button>
                  {form.foto && (
                    <div className="flex items-center gap-2">
                      <img src={form.foto} alt="Preview" className="w-12 h-12 rounded-lg object-cover border border-white/10" />
                      <button onClick={() => setForm((f) => ({ ...f, foto: '' }))} className="text-gray-500 hover:text-red-400">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
                <input ref={fotoInputRef} type="file" accept="image/*" onChange={handleFotoChange} className="hidden" />
              </div>

              {saveError && (
                <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 border border-red-500/20 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  {saveError}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-white/10">
              <button onClick={() => setShowNewModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-white text-sm font-medium transition-colors rounded-xl">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-semibold disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Salvar Demanda
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal nova emenda ── */}
      {showNewEmendaModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-[#0d1b2a] border border-white/10 rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <DollarSign className="w-5 h-5 text-emerald-400" />
                <h2 className="text-white font-semibold">Nova Emenda Parlamentar</h2>
              </div>
              <button onClick={() => setShowNewEmendaModal(false)} className="text-gray-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs text-gray-400 font-medium uppercase tracking-widest">Título *</label>
                <input value={emendaForm.titulo} onChange={(e) => setEmendaForm((f) => ({ ...f, titulo: e.target.value }))}
                  className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none focus:border-emerald-500"
                  placeholder="Ex: Reforma da UBS Vila Nova" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-gray-400 font-medium uppercase tracking-widest">Valor (R$)</label>
                  <input value={emendaForm.valor} onChange={(e) => setEmendaForm((f) => ({ ...f, valor: e.target.value }))}
                    type="number" min="0" step="1000"
                    className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none focus:border-emerald-500"
                    placeholder="500000" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-medium uppercase tracking-widest">Ano</label>
                  <input value={emendaForm.ano} onChange={(e) => setEmendaForm((f) => ({ ...f, ano: e.target.value }))}
                    type="number" min="2000" max="2100"
                    className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none focus:border-emerald-500"
                    placeholder="2026" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-medium uppercase tracking-widest">Número</label>
                  <input value={emendaForm.numero} onChange={(e) => setEmendaForm((f) => ({ ...f, numero: e.target.value }))}
                    className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none focus:border-emerald-500"
                    placeholder="123" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 font-medium uppercase tracking-widest">Autor / Parlamentar</label>
                  <input value={emendaForm.autor} onChange={(e) => setEmendaForm((f) => ({ ...f, autor: e.target.value }))}
                    className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none focus:border-emerald-500"
                    placeholder="Nome do parlamentar" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-medium uppercase tracking-widest">Beneficiário</label>
                  <input value={emendaForm.beneficiario} onChange={(e) => setEmendaForm((f) => ({ ...f, beneficiario: e.target.value }))}
                    className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none focus:border-emerald-500"
                    placeholder="Entidade ou município beneficiado" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-gray-400 font-medium uppercase tracking-widest">Tipo</label>
                  <Select
                    value={emendaForm.tipo}
                    onChange={(e) => setEmendaForm((f) => ({ ...f, tipo: e.target.value }))}
                    options={Object.entries(EMENDA_TIPO_LABELS).map(([k, v]) => ({ value: k, label: v }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-medium uppercase tracking-widest">Status</label>
                  <Select
                    value={emendaForm.status}
                    onChange={(e) => setEmendaForm((f) => ({ ...f, status: e.target.value }))}
                    options={Object.entries(EMENDA_STATUS_LABELS).map(([k, v]) => ({ value: k, label: v }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-medium uppercase tracking-widest">Órgão Executor</label>
                  <input value={emendaForm.orgaoExecutor} onChange={(e) => setEmendaForm((f) => ({ ...f, orgaoExecutor: e.target.value }))}
                    className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none focus:border-emerald-500"
                    placeholder="Ministério..." />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 font-medium uppercase tracking-widest">Estado</label>
                  <input value={emendaForm.estado} onChange={(e) => setEmendaForm((f) => ({ ...f, estado: e.target.value }))}
                    className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none focus:border-emerald-500"
                    placeholder="UF (ex: SP)" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-medium uppercase tracking-widest">Município</label>
                  <input value={emendaForm.municipio} onChange={(e) => setEmendaForm((f) => ({ ...f, municipio: e.target.value }))}
                    className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none focus:border-emerald-500"
                    placeholder="Nome do município" />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 font-medium uppercase tracking-widest">Endereço completo</label>
                <div className="flex gap-2 mt-1">
                  <input value={emendaForm.endereco} onChange={(e) => setEmendaForm((f) => ({ ...f, endereco: e.target.value }))}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none focus:border-emerald-500"
                    placeholder="Rua, número, bairro (opcional)" />
                  <button onClick={geocodeEmendaAddress} disabled={geoLoading}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50">
                    {geoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
                    Localizar
                  </button>
                </div>
                {emendaForm.lat && emendaForm.lng && (
                  <p className="text-xs text-green-400 mt-1 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Localização: {emendaForm.lat.toFixed(5)}, {emendaForm.lng.toFixed(5)}
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs text-gray-400 font-medium uppercase tracking-widest">Descrição</label>
                <textarea value={emendaForm.descricao} onChange={(e) => setEmendaForm((f) => ({ ...f, descricao: e.target.value }))}
                  rows={3}
                  className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none focus:border-emerald-500 resize-none"
                  placeholder="Detalhes da emenda..." />
              </div>

              <div>
                <label className="text-xs text-gray-400 font-medium uppercase tracking-widest">Documento (opcional)</label>
                <p className="text-[11px] text-gray-500 mt-0.5">PDF, DOC, DOCX, XLS, XLSX ou imagem — máx 5 MB</p>
                <div className="mt-1.5 flex items-center gap-3">
                  <button onClick={() => emendaDocInputRef.current?.click()}
                    className="flex items-center gap-2 px-3.5 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-gray-300 hover:bg-white/10">
                    <Paperclip className="w-4 h-4" />
                    {emendaForm.documento ? 'Trocar documento' : 'Anexar documento'}
                  </button>
                  {emendaForm.documento && (
                    <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5">
                      <FileText className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span className="text-xs text-gray-200 truncate max-w-[180px]" title={emendaForm.documentoNome || 'documento'}>
                        {emendaForm.documentoNome || 'documento'}
                      </span>
                      <button onClick={() => setEmendaForm((f) => ({ ...f, documento: '', documentoNome: '' }))} className="text-gray-500 hover:text-red-400">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
                <input
                  ref={emendaDocInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/*"
                  onChange={handleEmendaDocumentoChange}
                  className="hidden"
                />
              </div>

              {emendaSaveError && (
                <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 border border-red-500/20 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  {emendaSaveError}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-white/10">
              <button onClick={() => setShowNewEmendaModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-white text-sm font-medium transition-colors rounded-xl">
                Cancelar
              </button>
              <button onClick={handleSaveEmenda} disabled={savingEmenda}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold disabled:opacity-50">
                {savingEmenda ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Salvar Emenda
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
