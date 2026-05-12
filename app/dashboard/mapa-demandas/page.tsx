'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  MapPin, Plus, Search, Filter, X, AlertCircle, Loader2,
  CheckCircle, Clock, AlertTriangle, Camera,
  Navigation, Calendar, User, Phone, Building2,
  Maximize2, Minimize2,
} from 'lucide-react';
import { CATEGORY_LABELS, CATEGORY_COLORS, STATUS_LABELS, STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS } from '@/lib/types';

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

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export default function MapaDemandasPage() {
  const { status } = useSession();
  const router = useRouter();

  const [demands, setDemands] = useState<Demand[]>([]);
  const [agendaEvents, setAgendaEvents] = useState<AgendaEvent[]>([]);
  const [contatos] = useState<Contato[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDemand, setSelectedDemand] = useState<Demand | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<AgendaEvent | null>(null);

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

  // Geocodificação
  const [geoQuery, setGeoQuery] = useState('');
  const [geoResults, setGeoResults] = useState<GeoResult[]>([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [showDemands, setShowDemands] = useState(true);
  const [showAgendas, setShowAgendas] = useState(true);

  // Força o Leaflet a recalcular o tamanho ao entrar/sair da tela cheia
  useEffect(() => {
    const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    return () => clearTimeout(t);
  }, [mapFullscreen]);

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
      const [dRes, aRes] = await Promise.all([
        fetch('/api/demands'),
        fetch('/api/agenda'),
      ]);
      const [dData, aData] = await Promise.all([dRes.json(), aRes.json()]);
      setDemands(Array.isArray(dData) ? dData : []);
      setAgendaEvents(Array.isArray(aData) ? aData.filter((e: AgendaEvent) => e.lat && e.lng) : []);
    } finally {
      setLoading(false);
    }
  };

  // Filtrar demandas — memoizado para não recriar o array a cada render
  const filteredDemands = useMemo(() => demands.filter((d) => {
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

  // Apenas demandas com coordenadas — referência estável para o mapa
  const demandsWithCoords = useMemo(
    () => filteredDemands.filter((d) => d.lat && d.lng),
    [filteredDemands]
  );

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

  // Upload foto
  const handleFotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setForm((f) => ({ ...f, foto: (ev.target?.result as string) ?? '' }));
    reader.readAsDataURL(file);
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

  // Click no mapa — abre popup pelo demanda id
  const handleMapDemandClick = (id: string) => {
    const d = demands.find((x) => x.id === id);
    if (d) { setSelectedDemand(d); setSelectedEvent(null); }
  };
  const handleMapEventClick = (id: string) => {
    const e = agendaEvents.find((x) => x.id === id);
    if (e) { setSelectedEvent(e); setSelectedDemand(null); }
  };

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
          {/* Busca de endereço no mapa */}
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
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${showFilters ? 'bg-sky-600 text-white' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}
          >
            <Filter className="w-4 h-4" />
            Filtros
          </button>
          <button
            onClick={() => { setShowNewModal(true); setForm({ ...EMPTY_FORM }); setSaveError(''); }}
            className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-semibold transition-all"
          >
            <Plus className="w-4 h-4" />
            Nova Demanda
          </button>
        </div>
      </div>

      {/* ── Filtros ── */}
      {showFilters && (
        <div className="flex items-center gap-3 px-4 py-2 border-b border-white/10 bg-white/2 flex-wrap flex-shrink-0">
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Buscar por título, solicitante..."
            className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white placeholder-gray-500 outline-none w-56"
          />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-gray-300 outline-none">
            <option value="">Todos os status</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-gray-300 outline-none">
            <option value="">Todas as categorias</option>
            {categoryKeys.map((k) => <option key={k} value={k}>{CATEGORY_LABELS[k]}</option>)}
          </select>
          <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-gray-300 outline-none">
            <option value="">Todas as prioridades</option>
            {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {(filterStatus || filterCategory || filterPriority || searchText) && (
            <button onClick={() => { setFilterStatus(''); setFilterCategory(''); setFilterPriority(''); setSearchText(''); }}
              className="text-xs text-gray-400 hover:text-white flex items-center gap-1">
              <X className="w-3 h-3" /> Limpar
            </button>
          )}
        </div>
      )}

      {/* ── Conteúdo principal ── */}
      <div className="flex flex-1 min-h-0">
        {/* Painel lateral — lista de demandas */}
        <div className="w-72 flex-shrink-0 flex flex-col border-r border-white/10 overflow-hidden">
          <div className="px-3 py-2 border-b border-white/10 flex-shrink-0 flex items-center justify-between gap-2">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide truncate">
              {filteredDemands.length} demanda{filteredDemands.length !== 1 ? 's' : ''}
              {demandsWithCoords.length < filteredDemands.length && (
                <span className="text-yellow-500/70 ml-1">({filteredDemands.length - demandsWithCoords.length} sem GPS)</span>
              )}
            </p>
            <div className="flex gap-1 flex-shrink-0">
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
                  onClick={() => { setSelectedDemand(d); setSelectedEvent(null); if (d.lat && d.lng) setMapCenter([d.lat, d.lng]); }}
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

            {/* Eventos da agenda com localização */}
            {showAgendas && agendaEvents.length > 0 && (
              <>
                <div className="px-3 py-2 border-b border-white/10 bg-white/2 flex-shrink-0 mt-1">
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest">Eventos da Agenda</p>
                </div>
                {agendaEvents.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => { setSelectedEvent(e); setSelectedDemand(null); if (e.lat && e.lng) setMapCenter([e.lat, e.lng]); }}
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
          </div>
        </div>

        {/* Mapa */}
        <div className={mapFullscreen ? 'fixed inset-0 z-[2000] bg-[#0d1b2a]' : 'flex-1 relative'}>
          <DemandaMapLeaflet
            demands={showDemands ? demandsWithCoords : []}
            agendaEvents={showAgendas ? agendaEvents : []}
            contatos={contatos}
            center={mapCenter}
            selectedDemandId={selectedDemand?.id}
            selectedEventId={selectedEvent?.id}
            onDemandClick={handleMapDemandClick}
            onEventClick={handleMapEventClick}
            showSpDistritos
          />
          <button
            onClick={() => setMapFullscreen(f => !f)}
            className="absolute top-3 left-3 z-[1000] bg-[#0d1b2a]/90 border border-white/10 rounded-lg p-2 text-slate-300 hover:text-white hover:border-white/30 transition-all shadow-lg"
            title={mapFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
          >
            {mapFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Popup detalhe — demanda */}
          {selectedDemand && (
            <div className="absolute top-4 right-4 w-80 bg-[#0d1b2a]/95 backdrop-blur border border-white/10 rounded-2xl shadow-2xl z-[1000] overflow-hidden">
              {selectedDemand.foto && (
                <div className="w-full h-40 bg-black overflow-hidden">
                  <img src={selectedDemand.foto} alt="Foto da demanda" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: CATEGORY_COLORS[selectedDemand.category as keyof typeof CATEGORY_COLORS] ?? '#9e9e9e' }} />
                      <span className="text-xs text-gray-400">{CATEGORY_LABELS[selectedDemand.category as keyof typeof CATEGORY_LABELS]}</span>
                    </div>
                    <h3 className="text-white font-semibold text-sm leading-snug">{selectedDemand.title}</h3>
                  </div>
                  <button onClick={() => setSelectedDemand(null)} className="text-gray-500 hover:text-white flex-shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-2 text-gray-300">
                    <User className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                    <span>{selectedDemand.solicitante}</span>
                  </div>
                  {selectedDemand.contato && (
                    <div className="flex items-center gap-2 text-gray-300">
                      <Phone className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                      <span>{selectedDemand.contato}</span>
                    </div>
                  )}
                  {selectedDemand.endereco && (
                    <div className="flex items-center gap-2 text-gray-300">
                      <MapPin className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                      <span>{selectedDemand.endereco}</span>
                    </div>
                  )}
                  {!selectedDemand.endereco && (
                    <div className="flex items-center gap-2 text-gray-300">
                      <Building2 className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                      <span>{selectedDemand.municipio}, {selectedDemand.estado}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-gray-300">
                    <Calendar className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                    <span>{new Date(selectedDemand.createdAt).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full"
                    style={{ background: (STATUS_COLORS[selectedDemand.status as keyof typeof STATUS_COLORS] ?? '#9e9e9e') + '22', color: STATUS_COLORS[selectedDemand.status as keyof typeof STATUS_COLORS] ?? '#9e9e9e' }}>
                    {STATUS_ICON[selectedDemand.status]}
                    {STATUS_LABELS[selectedDemand.status as keyof typeof STATUS_LABELS]}
                  </span>
                  <span className="text-xs px-2 py-1 rounded-full"
                    style={{ background: (PRIORITY_COLORS[selectedDemand.priority as keyof typeof PRIORITY_COLORS] ?? '#9e9e9e') + '22', color: PRIORITY_COLORS[selectedDemand.priority as keyof typeof PRIORITY_COLORS] ?? '#9e9e9e' }}>
                    {PRIORITY_LABELS[selectedDemand.priority as keyof typeof PRIORITY_LABELS]}
                  </span>
                </div>
                {selectedDemand.description && (
                  <p className="text-gray-400 text-xs mt-2 leading-relaxed line-clamp-3">{selectedDemand.description}</p>
                )}

                {/* Botões de rota — só exibe se a demanda tem coordenadas */}
                {selectedDemand.lat && selectedDemand.lng && (
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <p className="text-xs text-gray-500 mb-2.5">Traçar rota até aqui</p>
                    <div className="flex gap-3">

                      {/* ── Waze ── */}
                      <a
                        href={`https://waze.com/ul?ll=${selectedDemand.lat},${selectedDemand.lng}&navigate=yes`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex flex-col items-center gap-1.5 transition-all hover:scale-105 active:scale-95"
                      >
                        <img src="/waze-logo.png" alt="Waze" className="w-12 h-12 rounded-2xl shadow-lg object-cover" />
                        <span className="text-xs font-semibold text-gray-300">Waze</span>
                      </a>

                      {/* ── Google Maps ── */}
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${selectedDemand.lat},${selectedDemand.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex flex-col items-center gap-1.5 transition-all hover:scale-105 active:scale-95"
                      >
                        <img src="/google-maps-logo.png" alt="Google Maps" className="w-12 h-12 rounded-2xl shadow-lg object-cover" />
                        <span className="text-xs font-semibold text-gray-300">Google Maps</span>
                      </a>

                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Popup detalhe — evento */}
          {selectedEvent && (
            <div className="absolute top-4 right-4 w-80 bg-[#0d1b2a]/95 backdrop-blur border border-white/10 rounded-2xl shadow-2xl z-[1000] overflow-hidden">
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: selectedEvent.cor ?? TIPO_AGENDA_COLORS[selectedEvent.tipo] ?? '#6366f1' }} />
                      <span className="text-xs text-gray-400">{TIPO_AGENDA_LABELS[selectedEvent.tipo]}</span>
                    </div>
                    <h3 className="text-white font-semibold text-sm">{selectedEvent.titulo}</h3>
                  </div>
                  <button onClick={() => setSelectedEvent(null)} className="text-gray-500 hover:text-white flex-shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-2 text-gray-300">
                    <Calendar className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                    <span>{new Date(selectedEvent.data).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  </div>
                  {selectedEvent.local && (
                    <div className="flex items-center gap-2 text-gray-300">
                      <MapPin className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                      <span>{selectedEvent.local}</span>
                    </div>
                  )}
                  {selectedEvent.descricao && (
                    <p className="text-gray-400 mt-2 leading-relaxed">{selectedEvent.descricao}</p>
                  )}
                </div>

                {/* Botões de rota */}
                {selectedEvent.lat && selectedEvent.lng && (
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <p className="text-xs text-gray-500 mb-2.5">Traçar rota até aqui</p>
                    <div className="flex gap-3">
                      <a
                        href={`https://waze.com/ul?ll=${selectedEvent.lat},${selectedEvent.lng}&navigate=yes`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex flex-col items-center gap-1.5 transition-all hover:scale-105 active:scale-95"
                      >
                        <img src="/waze-logo.png" alt="Waze" className="w-12 h-12 rounded-2xl shadow-lg object-cover" />
                        <span className="text-xs font-semibold text-gray-300">Waze</span>
                      </a>
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${selectedEvent.lat},${selectedEvent.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex flex-col items-center gap-1.5 transition-all hover:scale-105 active:scale-95"
                      >
                        <img src="/google-maps-logo.png" alt="Google Maps" className="w-12 h-12 rounded-2xl shadow-lg object-cover" />
                        <span className="text-xs font-semibold text-gray-300">Google Maps</span>
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0d1b2a] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
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
              <div className="grid grid-cols-2 gap-3">
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
              <div className="grid grid-cols-2 gap-3">
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
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-gray-400 font-medium uppercase tracking-widest">Categoria</label>
                  <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-gray-300 text-sm outline-none">
                    {categoryKeys.map((k) => <option key={k} value={k}>{CATEGORY_LABELS[k]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-medium uppercase tracking-widest">Status</label>
                  <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                    className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-gray-300 text-sm outline-none">
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-medium uppercase tracking-widest">Prioridade</label>
                  <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                    className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-gray-300 text-sm outline-none">
                    {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
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
    </div>
  );
}
