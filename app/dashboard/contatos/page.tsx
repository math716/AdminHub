'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  BookUser, Plus, Trash2, Mail, MapPin, Loader2, X, Search,
  User, FileUp, Upload, CheckCircle2, AlertCircle,
  Map as MapIcon, List, Globe, Layers, Building2, ChevronRight,
  Users, MessageSquare, Send, ExternalLink, Copy, Check,
  UserCheck, UserX, Phone, Pencil, Navigation, MousePointer,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import type { ContatoMapItem } from '@/components/maps/contatos-municipio-map';
import { hasBairrosPoligonos } from '@/lib/geojson-manifest';

// ---------------------------------------------------------------------------
// Dynamic map imports
// ---------------------------------------------------------------------------
const BrazilMap = dynamic(() => import('@/components/maps/brazil-map'), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center rounded-xl" style={{ background: 'var(--bg-card-subtle)' }}>
      <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#4a9ede' }} />
    </div>
  ),
});

const StateMap = dynamic(() => import('@/components/maps/state-map'), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center rounded-xl" style={{ background: 'var(--bg-card-subtle)' }}>
      <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#4a9ede' }} />
    </div>
  ),
});

const ContatosBairrosMap = dynamic(() => import('@/components/maps/contatos-bairros-map'), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center rounded-xl" style={{ background: 'var(--bg-card-subtle)' }}>
      <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#4a9ede' }} />
    </div>
  ),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function pointInPolygon(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function pointInFeature(lng: number, lat: number, geometry: any): boolean {
  if (!geometry) return false;
  const rings: number[][][] =
    geometry.type === 'Polygon' ? [geometry.coordinates[0]] :
    geometry.type === 'MultiPolygon' ? geometry.coordinates.map((p: number[][][]) => p[0]) : [];
  return rings.some(r => pointInPolygon(lng, lat, r));
}
function normalizeWA(n: string): string {
  const d = n.replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length >= 10) return `55${d}`;
  return d;
}
function waLink(numero: string, msg: string): string {
  return `https://wa.me/${normalizeWA(numero)}?text=${encodeURIComponent(msg)}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Contato {
  id: string; nome: string; numero: string;
  email?: string; endereco?: string;
  lat?: number; lng?: number;
  createdAt: string; createdBy?: { name: string };
}

const EMPTY_FORM = { nome: '', numero: '', email: '', endereco: '' };

// ── CSV helpers ──────────────────────────────────────────────────────────────
function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const parseRow = (line: string): string[] => {
    const result: string[] = []; let current = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQ && line[i+1] === '"') { current += '"'; i++; } else inQ = !inQ; }
      else if (ch === ',' && !inQ) { result.push(current.trim()); current = ''; }
      else current += ch;
    }
    result.push(current.trim()); return result;
  };
  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).filter(l => l.trim()).map(line => {
    const values = parseRow(line); const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; }); return row;
  });
  return { headers, rows };
}
function normStr(s: string) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
interface DetectedColumns { nome: string; numero: string; email: string; endereco: string; }
function detectColumns(headers: string[]): DetectedColumns {
  const result: DetectedColumns = { nome: '', numero: '', email: '', endereco: '' };
  for (const h of headers) {
    const n = normStr(h);
    if (/carimbo|timestamp|data.hora|submitted/.test(n)) continue;
    if (!result.nome && /nome|name/.test(n)) { result.nome = h; }
    else if (!result.numero && /telefone|celular|whatsapp|numero|fone|phone/.test(n)) { result.numero = h; }
    else if (!result.email && /email/.test(n)) { result.email = h; }
    else if (!result.endereco && /endereco|rua|bairro|logradouro|address/.test(n)) { result.endereco = h; }
  }
  return result;
}
function buildContatosCsv(rows: Record<string, string>[], cols: DetectedColumns) {
  return rows.map(row => ({
    nome: cols.nome ? row[cols.nome]?.trim() ?? '' : '',
    numero: cols.numero ? row[cols.numero]?.trim() ?? '' : '',
    email: cols.email ? row[cols.email]?.trim() ?? '' : '',
    endereco: cols.endereco ? row[cols.endereco]?.trim() ?? '' : '',
  })).filter(c => c.nome && c.numero);
}

function WhatsAppIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function ContatosPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => { if (status === 'unauthenticated') router.push('/login'); }, [status, router]);

  // ── Tab ──
  const [activeTab, setActiveTab] = useState<'lista' | 'mapa'>('lista');

  // ── Contatos ──
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // ── Modal Novo / Editar Contato ──
  const [showModal, setShowModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contato | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [geoLoading, setGeoLoading] = useState(false);
  const [resolvedCoords, setResolvedCoords] = useState<{ lat: number; lng: number } | null>(null);

  // ── Modal CSV ──
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState<1 | 2 | 3>(1);
  const [detectedCols, setDetectedCols] = useState<DetectedColumns>({ nome: '', numero: '', email: '', endereco: '' });
  const [csvPreview, setCsvPreview] = useState<Array<{ nome: string; numero: string; email: string; endereco: string }>>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; errors: number; geocodificados: number } | null>(null);
  const [importError, setImportError] = useState('');

  // ── Re-geocoding ──
  const [reGeocodingId, setReGeocodingId] = useState<string | null>(null);

  // ── Mapa ──
  const [view, setView] = useState<'brasil' | 'estado' | 'municipio'>('brasil');
  const [selectedUf, setSelectedUf] = useState('');
  const [selectedStateName, setSelectedStateName] = useState('');
  const [navMunicipio, setNavMunicipio] = useState<{ codigo: string; nome: string } | null>(null);
  // popup de ação ao clicar em estado ou município
  const [popup, setPopup] = useState<{ type: 'estado' | 'municipio'; uf: string; codigo?: string; nome: string } | null>(null);
  const [contactsByMunCode, setContactsByMunCode] = useState<Record<string, number>>({});
  const [stateContactIds, setStateContactIds] = useState<Set<string>>(new Set());
  // bairros do município navegado
  const [bairroContacts, setBairroContacts] = useState<Record<string, string[]>>({}); // normNome → ids
  const [bairroCount, setBairroCount] = useState<Record<string, number>>({}); // normNome → count
  const [bairroFeatures, setBairroFeatures] = useState<any[]>([]); // features GeoJSON filtradas
  const [selectedBairros, setSelectedBairros] = useState<Set<string>>(new Set());
  const [bairroLoading, setBairroLoading] = useState(false);
  const [munHasBairros, setMunHasBairros] = useState(false);
  const [pipLoading, setPipLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mapSearch, setMapSearch] = useState('');

  // ── Disparo ──
  const [showMsg, setShowMsg] = useState(false);
  const [msgText, setMsgText] = useState('');
  const [copied, setCopied] = useState(false);
  const [sendingApi, setSendingApi] = useState(false);
  const [sendStatus, setSendStatus] = useState<Record<string, 'idle' | 'sending' | 'ok' | 'err'>>({});
  const [sendErrors, setSendErrors] = useState<Record<string, string>>({});

  // ── Fetch ──
  const fetchContatos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/contacts');
      const data = await res.json();
      setContatos(Array.isArray(data) ? data : []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (status === 'authenticated') fetchContatos(); }, [status, fetchContatos]);

  // ── Geocoded subset ──
  const geocodedContacts = useMemo(
    () => contatos.filter(c => c.lat != null && c.lng != null) as (Contato & { lat: number; lng: number })[],
    [contatos]
  );

  // Cache para GeoJSON dos estados (evita re-fetch)
  const geojsonCache = useRef<Record<string, any>>({});

  const fetchStateGeojson = useCallback(async (uf: string) => {
    if (geojsonCache.current[uf]) return geojsonCache.current[uf];
    const res = await fetch(`/api/ibge/geojson?type=estado&uf=${uf}`);
    if (!res.ok) return null;
    const data = await res.json();
    geojsonCache.current[uf] = data;
    return data;
  }, []);

  // ── PiP: compute contacts per municipality ──
  const computePiP = useCallback(async (uf: string) => {
    if (!uf || uf === 'BR') { setContactsByMunCode({}); setStateContactIds(new Set()); return; }
    setPipLoading(true);
    try {
      const geojson = await fetchStateGeojson(uf);
      if (!geojson) return;
      const counts: Record<string, number> = {};
      const inState = new Set<string>();
      for (const f of geojson.features ?? []) {
        const code = String(f.properties?.codarea ?? '');
        if (!code) continue;
        for (const c of geocodedContacts) {
          if (pointInFeature(c.lng, c.lat, f.geometry)) {
            inState.add(c.id);
            counts[code] = (counts[code] ?? 0) + 1;
          }
        }
      }
      setContactsByMunCode(counts);
      setStateContactIds(inState);
    } catch { setContactsByMunCode({}); setStateContactIds(new Set()); }
    finally { setPipLoading(false); }
  }, [geocodedContacts, fetchStateGeojson]);

  // ── PiP: contacts for a single municipality (returns value) ──
  const computeMunicipioContactsForCode = useCallback(async (uf: string, codigo: string): Promise<ContatoMapItem[]> => {
    try {
      const geojson = await fetchStateGeojson(uf);
      if (!geojson) return [];
      const feature = (geojson.features ?? []).find((f: any) =>
        String(f.properties?.codarea ?? '') === String(codigo)
      );
      if (!feature) return [];
      const inside = geocodedContacts.filter(c => pointInFeature(c.lng, c.lat, feature.geometry));
      return inside.map(c => ({ id: c.id, nome: c.nome, numero: c.numero, lat: c.lat, lng: c.lng, endereco: c.endereco }));
    } catch { return []; }
  }, [geocodedContacts, fetchStateGeojson]);

  // ── Handlers de navegação e seleção ──

  const handleStateClick = useCallback((uf: string, name: string) => {
    setPopup({ type: 'estado', uf, nome: name });
  }, []);

  const handleMunicipioClick = useCallback((codigo: string, nome: string) => {
    setPopup({ type: 'municipio', uf: selectedUf, codigo, nome });
  }, [selectedUf]);

  const navigateToState = useCallback((uf: string, nome: string) => {
    setSelectedUf(uf); setSelectedStateName(nome);
    setView('estado'); setPopup(null);
    computePiP(uf);
  }, [computePiP]);

  const selectStateContacts = useCallback(async (uf: string) => {
    setPipLoading(true); setPopup(null);
    try {
      const geojson = await fetchStateGeojson(uf);
      if (!geojson) return;
      const inState = new Set<string>();
      for (const f of geojson.features ?? []) {
        for (const c of geocodedContacts) {
          if (pointInFeature(c.lng, c.lat, f.geometry)) inState.add(c.id);
        }
      }
      setSelectedIds(prev => { const n = new Set(prev); inState.forEach(id => n.add(id)); return n; });
    } finally { setPipLoading(false); }
  }, [geocodedContacts, fetchStateGeojson]);

  const navigateToMunicipio = useCallback(async (codigo: string, nome: string) => {
    setNavMunicipio({ codigo, nome });
    setView('municipio'); setPopup(null);
    setBairroContacts({}); setBairroCount({}); setBairroFeatures([]); setSelectedBairros(new Set());

    const nStr = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    // converte nome para o formato do filename gerado pelo script (underscore)
    const fileNorm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9\s]/g, '_').replace(/\s+/g, '_').trim();

    const isSaoPauloCapital = selectedUf === 'SP' && nStr(nome) === 'SAO PAULO';

    if (isSaoPauloCapital) {
      // São Paulo capital: usa sp-distritos.geojson como proxy de bairros
      setMunHasBairros(true);
      setBairroLoading(true);
      try {
        const [geoState, spRes] = await Promise.all([
          fetchStateGeojson(selectedUf),
          fetch('/geojson/sp-distritos.geojson'),
        ]);
        if (!spRes.ok) return;
        const spGeo = await spRes.json();
        const munFeature = geoState?.features?.find((f: any) => String(f.properties?.codarea ?? '') === String(codigo));
        const contatosMun = munFeature
          ? geocodedContacts.filter(c => pointInFeature(c.lng, c.lat, munFeature.geometry))
          : geocodedContacts;
        // Normaliza propriedades para o formato esperado pelo ContatosBairrosMap
        const features = (spGeo.features ?? []).map((f: any) => ({
          ...f,
          properties: {
            ...f.properties,
            NM_BAIRRO: f.properties?.nm_distrito_municipal ?? f.properties?.ds_nome ?? '',
            NM_MUN: 'São Paulo',
          },
        }));
        const bContacts: Record<string, string[]> = {};
        const bCount: Record<string, number> = {};
        for (const f of features) {
          const normNm = nStr(f.properties?.NM_BAIRRO ?? '');
          const inside = contatosMun.filter(c => pointInFeature(c.lng, c.lat, f.geometry));
          bContacts[normNm] = inside.map(c => c.id);
          bCount[normNm] = inside.length;
        }
        setBairroContacts(bContacts);
        setBairroCount(bCount);
        setBairroFeatures(features);
      } catch {} finally { setBairroLoading(false); }
      return;
    }

    const has = hasBairrosPoligonos(selectedUf, nome);
    setMunHasBairros(has);
    if (!has) return;

    setBairroLoading(true);
    try {
      const nmFile = fileNorm(nome);
      const [geoState, geoBairrosRes] = await Promise.all([
        fetchStateGeojson(selectedUf),
        fetch(`/geojson/municipios/${selectedUf}/${nmFile}.json`),
      ]);
      if (!geoBairrosRes.ok) return;
      const geoBairros = await geoBairrosRes.json();
      const munFeature = geoState?.features?.find((f: any) => String(f.properties?.codarea ?? '') === String(codigo));
      const contatosMun = munFeature
        ? geocodedContacts.filter(c => pointInFeature(c.lng, c.lat, munFeature.geometry))
        : geocodedContacts;
      const bContacts: Record<string, string[]> = {};
      const bCount: Record<string, number> = {};
      const features = geoBairros.features ?? [];
      for (const f of features) {
        const normNm = nStr(f.properties?.NM_BAIRRO ?? '');
        const inside = contatosMun.filter(c => pointInFeature(c.lng, c.lat, f.geometry));
        bContacts[normNm] = inside.map(c => c.id);
        bCount[normNm] = inside.length;
      }
      setBairroContacts(bContacts);
      setBairroCount(bCount);
      setBairroFeatures(features);
    } catch {} finally { setBairroLoading(false); }
  }, [selectedUf, geocodedContacts, fetchStateGeojson]);

  const selectMunicipioContacts = useCallback(async (uf: string, codigo: string) => {
    setPipLoading(true); setPopup(null);
    try {
      const contacts = await computeMunicipioContactsForCode(uf, codigo);
      setSelectedIds(prev => { const n = new Set(prev); contacts.forEach(c => n.add(c.id)); return n; });
    } finally { setPipLoading(false); }
  }, [computeMunicipioContactsForCode]);

  const handleBairroClick = useCallback((normNome: string) => {
    const ids = bairroContacts[normNome] ?? [];
    if (ids.length === 0) return;
    setSelectedBairros(prev => {
      const n = new Set(prev);
      if (n.has(normNome)) {
        n.delete(normNome);
        setSelectedIds(p => { const s = new Set(p); ids.forEach(id => s.delete(id)); return s; });
      } else {
        n.add(normNome);
        setSelectedIds(p => { const s = new Set(p); ids.forEach(id => s.add(id)); return s; });
      }
      return n;
    });
  }, [bairroContacts]);

  const goBack = useCallback(() => {
    if (view === 'municipio') {
      setView('estado'); setNavMunicipio(null);
      setBairroContacts({}); setBairroCount({}); setBairroFeatures([]);
      setSelectedBairros(new Set()); setBairroLoading(false);
      setSelectedIds(new Set());
    } else {
      setView('brasil'); setSelectedUf(''); setSelectedStateName('');
      setContactsByMunCode({}); setStateContactIds(new Set());
      setNavMunicipio(null); setBairroContacts({}); setBairroCount({}); setBairroFeatures([]);
      setSelectedBairros(new Set());
      setSelectedIds(new Set());
    }
    setPopup(null);
  }, [view]);

  const toggleContact = useCallback((id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  // ── Sidebar list para a aba mapa ──
  const mapSidebarContacts = useMemo(() => {
    let base: { id: string; nome: string; numero: string }[];
    if (view === 'municipio') {
      const allIds = Object.values(bairroContacts).flat();
      const seen = new Set<string>();
      base = allIds.filter(id => { if (seen.has(id)) return false; seen.add(id); return true; })
        .map(id => geocodedContacts.find(c => c.id === id)!).filter(Boolean);
    } else if (view === 'estado') {
      base = geocodedContacts.filter(c => stateContactIds.has(c.id));
    } else {
      base = geocodedContacts;
    }
    if (!mapSearch.trim()) return base;
    const q = mapSearch.toLowerCase();
    return base.filter(c => c.nome.toLowerCase().includes(q) || c.numero.includes(q));
  }, [view, bairroContacts, geocodedContacts, stateContactIds, mapSearch]);

  const selectAll = () => setSelectedIds(prev => { const n = new Set(prev); mapSidebarContacts.forEach(c => n.add(c.id)); return n; });
  const clearAll  = () => setSelectedIds(new Set());

  // ── Re-geocode existing contact ──
  const handleReGeocode = useCallback(async (id: string, endereco: string) => {
    if (!endereco.trim() || reGeocodingId) return;
    setReGeocodingId(id);
    try {
      const geoRes = await fetch(`/api/geocode?address=${encodeURIComponent(endereco)}`);
      const geoData = await geoRes.json();
      if (!geoData.results?.[0]) return;
      const { lat, lng } = geoData.results[0];
      await fetch(`/api/contacts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng }),
      });
      setContatos(prev => prev.map(c => c.id === id ? { ...c, lat, lng } : c));
    } finally { setReGeocodingId(null); }
  }, [reGeocodingId]);

  const copyNumbers = async () => {
    const nums = contatos.filter(c => selectedIds.has(c.id)).map(c => normalizeWA(c.numero)).join('\n');
    await navigator.clipboard.writeText(nums);
    setCopied(true); setTimeout(() => setCopied(false), 2500);
  };
  const selectedContactsList = useMemo(() => contatos.filter(c => selectedIds.has(c.id)), [contatos, selectedIds]);


  const openMsgFor = (id: string) => {
    setSelectedIds(new Set([id]));
    setSendStatus({}); setSendErrors({});
    setMsgText(''); setShowMsg(true);
  };

  const handleSendApi = async () => {
    if (!msgText.trim() || sendingApi) return;
    const list = contatos.filter(c => selectedIds.has(c.id));
    setSendingApi(true);
    const statusMap: Record<string, 'idle' | 'sending' | 'ok' | 'err'> = {};
    const errMap: Record<string, string> = {};
    list.forEach(c => { statusMap[c.id] = 'idle'; });
    setSendStatus({ ...statusMap });

    for (const c of list) {
      setSendStatus(prev => ({ ...prev, [c.id]: 'sending' }));
      try {
        const res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ numero: c.numero, message: msgText }),
        });
        const data = await res.json();
        if (res.ok) {
          statusMap[c.id] = 'ok';
        } else {
          statusMap[c.id] = 'err';
          errMap[c.id] = data.error ?? 'Erro desconhecido';
        }
      } catch {
        statusMap[c.id] = 'err';
        errMap[c.id] = 'Falha de rede';
      }
      setSendStatus({ ...statusMap });
      setSendErrors({ ...errMap });
      // Small delay to avoid rate limiting
      if (list.indexOf(c) < list.length - 1) await new Promise(r => setTimeout(r, 500));
    }
    setSendingApi(false);
  };

  // ── Novo contato ──
  const geocodeEndereco = async (endereco: string) => {
    if (!endereco.trim()) return;
    setGeoLoading(true); setResolvedCoords(null);
    try {
      const res = await fetch(`/api/geocode?address=${encodeURIComponent(endereco)}`);
      const data = await res.json();
      if (data.results?.[0]) setResolvedCoords({ lat: data.results[0].lat, lng: data.results[0].lng });
    } finally { setGeoLoading(false); }
  };

  const handleSave = async () => {
    if (!form.nome.trim() || !form.numero.trim()) { setSaveError('Nome e número são obrigatórios.'); return; }
    setSaving(true); setSaveError('');
    try {
      if (editingContact) {
        const body: Record<string, any> = { ...form };
        if (resolvedCoords) { body.lat = resolvedCoords.lat; body.lng = resolvedCoords.lng; }
        const res = await fetch(`/api/contacts/${editingContact.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) { const err = await res.json(); setSaveError(err.error ?? 'Erro ao salvar.'); return; }
        const updated = await res.json();
        setContatos(prev => prev.map(c => c.id === editingContact.id ? { ...c, ...updated } : c));
      } else {
        let lat = resolvedCoords?.lat ?? null;
        let lng = resolvedCoords?.lng ?? null;
        if (!lat && form.endereco.trim()) {
          const res = await fetch(`/api/geocode?address=${encodeURIComponent(form.endereco)}`);
          const data = await res.json();
          if (data.results?.[0]) { lat = data.results[0].lat; lng = data.results[0].lng; }
        }
        const res = await fetch('/api/contacts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, lat, lng }),
        });
        if (!res.ok) { const err = await res.json(); setSaveError(err.error ?? 'Erro ao salvar.'); return; }
        fetchContatos();
      }
      setShowModal(false); setForm({ ...EMPTY_FORM }); setResolvedCoords(null); setEditingContact(null);
    } finally { setSaving(false); }
  };

  const handleDelete = (id: string) => setConfirmDeleteId(id);

  const doDelete = async () => {
    if (!confirmDeleteId) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    try { await fetch(`/api/contacts/${id}`, { method: 'DELETE' }); setContatos(prev => prev.filter(c => c.id !== id)); }
    catch { toast.error('Erro ao remover contato.'); }
  };

  const handleEdit = useCallback((c: Contato) => {
    setEditingContact(c);
    setForm({ nome: c.nome, numero: c.numero, email: c.email ?? '', endereco: c.endereco ?? '' });
    setResolvedCoords(c.lat && c.lng ? { lat: c.lat, lng: c.lng } : null);
    setSaveError('');
    setShowModal(true);
  }, []);

  // ── CSV import ──
  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { headers, rows } = parseCsv(text);
      if (headers.length === 0 || rows.length === 0) { setImportError('Arquivo inválido ou sem dados.'); return; }
      const cols = detectColumns(headers);
      if (!cols.nome || !cols.numero) { setImportError(`Colunas obrigatórias não encontradas.\nEncontradas: ${headers.join(', ')}.\nRenomeie para: Nome, Whatsapp, Email, Endereço.`); return; }
      setCsvPreview(buildContatosCsv(rows, cols)); setDetectedCols(cols); setTotalRows(rows.length); setImportError(''); setImportStep(2);
    };
    reader.onerror = () => setImportError('Erro ao ler o arquivo.');
    reader.readAsText(file, 'UTF-8'); e.target.value = '';
  };

  const handleImport = async () => {
    if (!csvPreview.length) return;
    setImporting(true); setImportError('');
    try {
      const res = await fetch('/api/contacts/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contatos: csvPreview }) });
      const data = await res.json();
      if (!res.ok) { setImportError(data.error ?? 'Erro ao importar.'); return; }
      setImportResult({ imported: data.imported, errors: data.errors, geocodificados: data.geocodificados ?? 0 });
      setImportStep(3); fetchContatos();
    } finally { setImporting(false); }
  };

  const resetImport = () => {
    setShowImportModal(false);
    setTimeout(() => { setImportStep(1); setDetectedCols({ nome: '', numero: '', email: '', endereco: '' }); setCsvPreview([]); setTotalRows(0); setImportResult(null); setImportError(''); }, 300);
  };

  // ── Lista filter ──
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return contatos.filter(c =>
      c.nome.toLowerCase().includes(q) || c.numero.includes(q) || (c.email ?? '').toLowerCase().includes(q) || (c.endereco ?? '').toLowerCase().includes(q)
    );
  }, [contatos, search]);

  const inputClass = 'w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder-[color:var(--text-tertiary)] outline-none transition-all';
  const inputStyle = { background: 'var(--tint-06)', border: '1px solid var(--tint-10)' };

  if (status === 'loading') return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#2563EB' }} />
    </div>
  );

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <PageHeader
        icon={BookUser}
        title="Contatos"
        subtitle={`${contatos.length} contato${contatos.length !== 1 ? 's' : ''} · ${geocodedContacts.length} no mapa`}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:brightness-110"
              style={{ background: 'var(--success)', border: 'none', color: '#FFFFFF' }}>
              <FileUp className="w-4 h-4" /> Importar CSV
            </button>
            <button onClick={() => { setShowModal(true); setForm({ ...EMPTY_FORM }); setResolvedCoords(null); setSaveError(''); setEditingContact(null); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:brightness-110"
              style={{ background: 'var(--brand-cobalt)', color: '#FFFFFF' }}>
              <Plus className="w-4 h-4" /> Novo Contato
            </button>
          </div>
        }
      />

      {/* ── Tabs ── */}
      <div className="flex gap-1 p-1 rounded-xl w-fit"
        style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--border-default)' }}>
        {([['lista', List, 'Lista'], ['mapa', MapIcon, 'Mapa']] as const).map(([tab, Icon, label]) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={activeTab === tab
              ? { background: 'var(--brand-cobalt-soft)', color: 'var(--brand-cobalt-text)', border: '1px solid var(--brand-cobalt)' }
              : { color: 'var(--text-tertiary)', border: '1px solid transparent', background: 'transparent' }
            }>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════ LISTA ══════════════════════════════ */}
      {activeTab === 'lista' && (
        <>
          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--tint-35)' }} />
            <input type="text" placeholder="Buscar por nome, número, email..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm text-[color:var(--text-primary)] placeholder-[color:var(--text-tertiary)] outline-none transition-all"
              style={inputStyle} />
          </div>

          {loading ? (
            <LoadingState />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={BookUser}
              title={search ? 'Nenhum contato encontrado' : 'Nenhum contato cadastrado ainda'}
              description={search ? 'Tente ajustar o termo de busca.' : 'Comece cadastrando o primeiro contato do gabinete.'}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map(c => {
                const initials = c.nome
                  .trim()
                  .split(/\s+/)
                  .slice(0, 2)
                  .map(w => w[0]?.toUpperCase() ?? '')
                  .join('') || '?';
                const isGeocoded = !!(c.lat && c.lng);
                return (
                  <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    whileHover={{ y: -2 }}
                    className="rounded-2xl relative overflow-hidden transition-all"
                    style={{
                      background: 'linear-gradient(135deg, var(--bg-card-raised) 0%, rgba(4,17,31,0.95) 100%)',
                      border: '1px solid rgba(37,99,235,0.18)',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                    }}>
                    {/* Accent stripe lateral dourada */}
                    <div className="absolute left-0 top-0 bottom-0 w-[3px]"
                      style={{ background: 'linear-gradient(180deg, #2563EB 0%, rgba(37,99,235,0.2) 100%)' }} />

                    <div className="p-5 pl-6 flex flex-col gap-4">
                      {/* Header: avatar + nome + status */}
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-base tracking-wide"
                          style={{
                            background: 'linear-gradient(135deg, #2563EB 0%, #8a6f1a 100%)',
                            color: 'var(--bg-page)',
                            boxShadow: '0 2px 8px rgba(37,99,235,0.25)',
                          }}>
                          {initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-[color:var(--text-primary)] text-[15px] leading-tight truncate" title={c.nome}>
                            {c.nome}
                          </h3>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="w-1.5 h-1.5 rounded-full"
                              style={{ background: isGeocoded ? '#4a9ede' : 'var(--tint-25)' }} />
                            <span className="text-[11px] uppercase tracking-wider font-medium"
                              style={{ color: isGeocoded ? 'rgba(74,158,222,0.85)' : 'var(--tint-35)' }}>
                              {isGeocoded ? 'Localizado' : 'Sem localização'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Divisor sutil */}
                      <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(37,99,235,0.18), transparent)' }} />

                      {/* Informações */}
                      <div className="flex flex-col gap-2.5">
                        <div className="flex items-center gap-2.5 text-[13px]">
                          <WhatsAppIcon className="w-4 h-4 text-green-400 flex-shrink-0" />
                          <span style={{ color: 'var(--tint-85)' }}>{c.numero}</span>
                        </div>
                        {c.email && (
                          <div className="flex items-center gap-2.5 text-[13px]">
                            <Mail className="w-4 h-4 flex-shrink-0" style={{ color: '#4a9ede' }} />
                            <span className="truncate" style={{ color: 'var(--tint-75)' }} title={c.email}>{c.email}</span>
                          </div>
                        )}
                        {c.endereco && (
                          <div className="flex items-start gap-2.5 text-[13px]">
                            <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#2563EB' }} />
                            <span className="leading-snug" style={{ color: 'var(--tint-75)' }}>{c.endereco}</span>
                          </div>
                        )}
                      </div>

                      {/* Ações sempre visíveis */}
                      <div className="flex items-center justify-between gap-2 pt-3 mt-1"
                        style={{ borderTop: '1px solid var(--tint-04)' }}>
                        {!isGeocoded && c.endereco ? (
                          <button
                            onClick={() => handleReGeocode(c.id, c.endereco!)}
                            disabled={reGeocodingId === c.id}
                            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg font-medium transition-all hover:opacity-80 disabled:opacity-50"
                            style={{ background: 'rgba(37,99,235,0.1)', color: '#2563EB', border: '1px solid rgba(37,99,235,0.22)' }}>
                            {reGeocodingId === c.id
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <MapPin className="w-3 h-3" />}
                            {reGeocodingId === c.id ? 'Localizando...' : 'Localizar'}
                          </button>
                        ) : <span />}

                        <div className="flex items-center gap-1">
                          <button onClick={() => openMsgFor(c.id)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-green-500/15"
                            style={{ color: 'rgba(37,211,102,0.85)', border: '1px solid rgba(37,211,102,0.2)' }}
                            title="Enviar mensagem">
                            <Send className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleEdit(c)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-yellow-500/15"
                            style={{ color: 'rgba(37,99,235,0.85)', border: '1px solid rgba(37,99,235,0.2)' }}
                            title="Editar contato">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDelete(c.id)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/15"
                            style={{ color: 'var(--tint-45)', border: '1px solid var(--tint-08)' }}
                            title="Excluir contato">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════ MAPA ══════════════════════════════ */}
      {activeTab === 'mapa' && (
        <>
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-sm rounded-xl px-4 py-2.5 w-fit flex-wrap"
            style={{ background: 'var(--bg-card)', border: '1px solid rgba(37,99,235,0.13)' }}>
            <button onClick={view === 'brasil' ? undefined : goBack}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all"
              style={view === 'brasil' ? { background: 'rgba(74,158,222,0.12)', color: '#4a9ede', fontWeight: 600 } : { color: 'var(--tint-55)', cursor: 'pointer' }}>
              <Globe className="h-3.5 w-3.5" /> Brasil
            </button>
            <ChevronRight className="h-3.5 w-3.5" style={{ color: 'var(--tint-25)' }} />
            {view === 'estado' ? (
              <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg font-semibold"
                style={{ background: 'rgba(74,158,222,0.12)', color: '#4a9ede' }}>
                <Layers className="h-3.5 w-3.5" /> {selectedStateName}
              </span>
            ) : view === 'municipio' ? (
              <button onClick={goBack} className="flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all"
                style={{ color: 'var(--tint-55)' }}>
                <Layers className="h-3.5 w-3.5" /> {selectedStateName}
              </button>
            ) : (
              <span className="flex items-center gap-1.5 px-2 py-1" style={{ color: 'var(--tint-25)' }}>
                <Layers className="h-3.5 w-3.5" /> Estado
              </span>
            )}
            {view === 'municipio' && navMunicipio && (
              <>
                <ChevronRight className="h-3.5 w-3.5" style={{ color: 'var(--tint-25)' }} />
                <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg font-semibold"
                  style={{ background: 'rgba(74,158,222,0.12)', color: '#4a9ede' }}>
                  <Building2 className="h-3.5 w-3.5" /> {navMunicipio.nome}
                </span>
              </>
            )}
            {selectedIds.size > 0 && (
              <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full font-semibold"
                style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)' }}>
                {selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Sidebar */}
            <div className="space-y-3">
              {/* Stats */}
              <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid rgba(37,99,235,0.13)' }}>
                <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--tint-45)' }}>
                  {view === 'municipio' ? navMunicipio?.nome : view === 'estado' ? selectedStateName : 'Visão Geral'}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg p-2.5 text-center" style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.15)' }}>
                    <p className="text-lg font-bold" style={{ color: '#2563EB' }}>
                      {view === 'municipio'
                        ? Object.values(bairroContacts).reduce((a, b) => a + b.length, 0)
                        : view === 'estado' ? stateContactIds.size : contatos.length}
                    </p>
                    <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--tint-45)' }}>
                      {view === 'municipio' ? 'neste município' : view === 'estado' ? 'neste estado' : 'total'}
                    </p>
                  </div>
                  <div className="rounded-lg p-2.5 text-center" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)' }}>
                    <p className="text-lg font-bold" style={{ color: '#4ade80' }}>{selectedIds.size}</p>
                    <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--tint-45)' }}>selecionados</p>
                  </div>
                </div>
                {selectedIds.size > 0 && (
                  <button onClick={clearAll} className="mt-2 w-full text-xs text-center py-1 rounded-lg transition-all hover:opacity-70"
                    style={{ color: 'var(--tint-45)', border: '1px solid var(--tint-08)' }}>
                    Limpar seleção
                  </button>
                )}
              </div>


              {/* Search + contacts list */}
              {view !== 'brasil' && (
                <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid rgba(37,99,235,0.13)' }}>
                  <div className="p-2.5" style={{ borderBottom: '1px solid var(--tint-06)' }}>
                    <div className="flex items-center gap-2 rounded-lg px-2.5 py-2"
                      style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)' }}>
                      <Search className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--tint-35)' }} />
                      <input value={mapSearch} onChange={e => setMapSearch(e.target.value)}
                        placeholder="Buscar contatos..."
                        className="flex-1 bg-transparent text-[color:var(--text-primary)] text-xs outline-none placeholder-[color:var(--text-tertiary)]" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--tint-06)' }}>
                    <button onClick={selectAll} className="flex items-center gap-1 text-xs transition-all hover:opacity-70" style={{ color: '#4a9ede' }}>
                      <UserCheck className="h-3.5 w-3.5" /> Todos
                    </button>
                    {selectedIds.size > 0 && (
                      <button onClick={clearAll} className="flex items-center gap-1 text-xs" style={{ color: 'var(--tint-45)' }}>
                        <UserX className="h-3.5 w-3.5" /> Limpar
                      </button>
                    )}
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y" style={{ borderColor: 'var(--tint-04)' }}>
                    {mapSidebarContacts.length === 0 ? (
                      <p className="text-xs text-center py-5" style={{ color: 'var(--tint-35)' }}>
                        {(pipLoading || bairroLoading) ? 'Calculando...' : 'Nenhum contato geolocado aqui'}
                      </p>
                    ) : mapSidebarContacts.map(c => {
                      const sel = selectedIds.has(c.id);
                      return (
                        <button key={c.id} onClick={() => toggleContact(c.id)}
                          className="w-full text-left px-3 py-2.5 transition-all hover:bg-[var(--tint-06)] flex items-center gap-2.5">
                          <span className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-all"
                            style={sel ? { background: '#2563EB' } : { border: '1px solid var(--tint-25)' }}>
                            {sel && <Check className="h-3 w-3 text-[var(--bg-page)]" strokeWidth={3} />}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[color:var(--text-primary)] text-xs font-medium truncate">{c.nome}</p>
                            <p className="text-xs truncate" style={{ color: 'var(--tint-45)' }}>{c.numero}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedIds.size > 0 && (
                <button onClick={() => setShowMsg(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, #2563EB, #3B82F6)', color: 'var(--bg-page)' }}>
                  <MessageSquare className="h-4 w-4" /> Disparar mensagem ({selectedIds.size})
                </button>
              )}
            </div>

            {/* Map */}
            <div className="lg:col-span-3">
              <div className="rounded-2xl overflow-hidden relative" style={{ height: 560, background: 'var(--bg-card-subtle)', border: '1px solid rgba(37,99,235,0.13)' }}>
                {(pipLoading || bairroLoading) && (
                  <div className="absolute inset-0 flex items-center justify-center z-10 rounded-2xl" style={{ background: 'var(--bg-card)' }}>
                    <Loader2 className="h-6 w-6 animate-spin mr-2" style={{ color: '#4a9ede' }} />
                    <span className="text-sm" style={{ color: 'var(--tint-65)' }}>Calculando...</span>
                  </div>
                )}

                {/* Overlay invisível — fecha popup ao clicar fora dele */}
                {popup && (
                  <div className="absolute inset-0 z-[15]" onClick={() => setPopup(null)} />
                )}

                {/* Popup de ação — aparece ao clicar em estado ou município */}
                <AnimatePresence>
                  {popup && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: -8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: -8 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-4 left-1/2 -translate-x-1/2 z-20 rounded-2xl shadow-2xl overflow-hidden"
                      style={{ background: 'rgba(4,17,31,0.95)', border: '1px solid rgba(37,99,235,0.35)', minWidth: 260, backdropFilter: 'blur(12px)' }}
                      onClick={e => e.stopPropagation()}>
                      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--tint-08)' }}>
                        <div className="flex items-center gap-2">
                          {popup.type === 'estado' ? <Layers className="h-3.5 w-3.5" style={{ color: '#2563EB' }} /> : <Building2 className="h-3.5 w-3.5" style={{ color: '#2563EB' }} />}
                          <span className="text-sm font-semibold text-[color:var(--text-primary)]">{popup.nome}</span>
                        </div>
                        <button onClick={() => setPopup(null)} className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-[var(--tint-10)] transition-all" style={{ color: 'var(--tint-45)' }}>
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="p-3 space-y-2">
                        <button
                          onClick={() => popup.type === 'estado'
                            ? navigateToState(popup.uf, popup.nome)
                            : navigateToMunicipio(popup.codigo!, popup.nome)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90"
                          style={{ background: 'rgba(74,158,222,0.12)', border: '1px solid rgba(74,158,222,0.25)', color: '#4a9ede' }}>
                          <Navigation className="h-4 w-4 flex-shrink-0" />
                          <span>Navegar {popup.type === 'estado' ? 'pelo estado' : 'pelo município'}</span>
                        </button>
                        <button
                          onClick={() => popup.type === 'estado'
                            ? selectStateContacts(popup.uf)
                            : selectMunicipioContacts(popup.uf, popup.codigo!)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90"
                          style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#4ade80' }}>
                          <MousePointer className="h-4 w-4 flex-shrink-0" />
                          <span>Selecionar contatos {popup.type === 'estado' ? 'do estado' : 'do município'}</span>
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="h-full p-3">
                  {view === 'brasil' && <BrazilMap onStateClick={handleStateClick} />}
                  {view === 'estado' && (
                    <StateMap uf={selectedUf} stateName={selectedStateName}
                      votesData={contactsByMunCode} onMunicipioClick={handleMunicipioClick}
                      valueLabel="contatos" disableSubdivisao />
                  )}
                  {view === 'municipio' && navMunicipio && bairroLoading && (
                    <div className="h-full flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#4a9ede' }} />
                    </div>
                  )}
                  {view === 'municipio' && navMunicipio && !bairroLoading && munHasBairros && bairroFeatures.length > 0 && (
                    <ContatosBairrosMap
                      municipio={navMunicipio.nome}
                      uf={selectedUf}
                      features={bairroFeatures}
                      contatosPorBairro={bairroCount}
                      selectedBairros={selectedBairros}
                      onBairroClick={handleBairroClick}
                      height="100%"
                    />
                  )}
                  {view === 'municipio' && navMunicipio && !bairroLoading && (!munHasBairros || bairroFeatures.length === 0) && (
                    <div className="h-full flex flex-col items-center justify-center gap-3">
                      <Building2 className="h-12 w-12 opacity-20" style={{ color: '#4a9ede' }} />
                      <p className="text-sm" style={{ color: 'var(--tint-45)' }}>Dados de bairros não disponíveis para {navMunicipio.nome}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ══════════════════ MODAL Novo Contato ══════════════════ */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-4 pb-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl shadow-2xl max-h-[calc(100vh-4rem)] overflow-y-auto"
              style={{ background: 'var(--bg-card)', border: '1px solid rgba(37,99,235,0.25)' }}>
              <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid rgba(37,99,235,0.15)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(37,99,235,0.15)', border: '1px solid rgba(37,99,235,0.3)' }}>
                    <Users className="w-4 h-4" style={{ color: '#2563EB' }} />
                  </div>
                  <h2 className="text-[color:var(--text-primary)] font-semibold">{editingContact ? 'Editar Contato' : 'Novo Contato'}</h2>
                </div>
                <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-[var(--tint-10)]" style={{ color: 'var(--tint-55)' }}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--tint-45)' }}>Nome Completo *</label>
                  <input className={inputClass} style={inputStyle} placeholder="Ex: João da Silva" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-widest mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--tint-45)' }}>
                    <WhatsAppIcon className="w-3.5 h-3.5 text-green-400" /> WhatsApp *
                  </label>
                  <input className={inputClass} style={inputStyle} placeholder="(61) 99999-0000" value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--tint-45)' }}>Email</label>
                  <input type="email" className={inputClass} style={inputStyle} placeholder="joao@email.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--tint-45)' }}>Endereço</label>
                  <div className="flex gap-2">
                    <input className="flex-1 rounded-xl px-3 py-2.5 text-sm text-[color:var(--text-primary)] placeholder-[color:var(--text-tertiary)] outline-none" style={inputStyle}
                      placeholder="Rua, número, cidade-UF" value={form.endereco}
                      onChange={e => { setForm(f => ({ ...f, endereco: e.target.value })); setResolvedCoords(null); }} />
                    <button onClick={() => geocodeEndereco(form.endereco)} disabled={!form.endereco.trim() || geoLoading}
                      className="px-3 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-80 disabled:opacity-40"
                      style={{ background: 'rgba(74,158,222,0.15)', border: '1px solid rgba(74,158,222,0.25)', color: '#4a9ede' }}>
                      {geoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                    </button>
                  </div>
                  {resolvedCoords && (
                    <p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: '#4ade80' }}>
                      <CheckCircle2 className="w-3 h-3" /> Localizado — aparecerá no Mapa de Contatos
                    </p>
                  )}
                </div>
                {saveError && (
                  <div className="flex items-center gap-2 text-sm rounded-xl px-3 py-2.5" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}>
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {saveError}
                  </div>
                )}
              </div>
              <div className="flex gap-3 px-6 py-4" style={{ borderTop: '1px solid rgba(37,99,235,0.15)' }}>
                <button onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:text-white"
                  style={{ border: '1px solid var(--tint-10)', color: 'var(--tint-55)' }}>Cancelar</button>
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #2563EB, #3B82F6)', color: 'var(--bg-page)' }}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editingContact ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  {editingContact ? 'Salvar alterações' : 'Salvar'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ══════════════════ MODAL Importar CSV ══════════════════ */}
      <AnimatePresence>
        {showImportModal && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-4 pb-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg rounded-2xl shadow-2xl max-h-[calc(100vh-4rem)] overflow-y-auto"
              style={{ background: 'var(--bg-card)', border: '1px solid rgba(37,99,235,0.25)' }}>
              <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid rgba(37,99,235,0.15)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(37,99,235,0.15)', border: '1px solid rgba(37,99,235,0.3)' }}>
                    <FileUp className="w-4 h-4" style={{ color: '#2563EB' }} />
                  </div>
                  <h2 className="text-[color:var(--text-primary)] font-semibold">Importar via CSV</h2>
                </div>
                <button onClick={resetImport} className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-[var(--tint-10)]" style={{ color: 'var(--tint-55)' }}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-6">
                {importStep === 1 && (
                  <div className="space-y-4">
                    <p className="text-sm" style={{ color: 'var(--tint-55)' }}>Selecione um arquivo <strong className="text-[color:var(--text-primary)]">.csv</strong> exportado do Google Forms ou de qualquer planilha.</p>
                    <label className="flex flex-col items-center justify-center gap-3 rounded-xl p-8 cursor-pointer transition-all hover:opacity-80"
                      style={{ border: '2px dashed var(--tint-14)', background: 'var(--tint-04)' }}>
                      <Upload className="w-10 h-10" style={{ color: 'var(--tint-35)' }} />
                      <div className="text-center">
                        <p className="text-sm text-[color:var(--text-primary)]">Clique para selecionar</p>
                        <p className="text-xs mt-1" style={{ color: 'var(--tint-35)' }}>Formato .csv</p>
                      </div>
                      <input type="file" accept=".csv,text/csv" onChange={handleCsvFile} className="hidden" />
                    </label>
                    {importError && (
                      <div className="flex items-start gap-2 text-sm rounded-xl px-3 py-2.5 whitespace-pre-line" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}>
                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /><span>{importError}</span>
                      </div>
                    )}
                  </div>
                )}

                {importStep === 2 && (
                  <div className="space-y-4">
                    <div className="rounded-xl p-3 space-y-2" style={{ background: 'var(--tint-04)' }}>
                      <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--tint-35)' }}>Colunas detectadas</p>
                      <div className="flex flex-wrap gap-2">
                        {[['Nome', detectedCols.nome, '#2563EB'], ['WhatsApp', detectedCols.numero, '#4ade80'], ...(detectedCols.email ? [['Email', detectedCols.email, '#4a9ede']] : []), ...(detectedCols.endereco ? [['Endereço', detectedCols.endereco, '#fb923c']] : [])].map(([label, val, color]) => (
                          <span key={label as string} className="text-xs px-2.5 py-1 rounded-full" style={{ background: `${color}18`, color: color as string, border: `1px solid ${color}33` }}>
                            {label as string} → {val as string}
                          </span>
                        ))}
                      </div>
                    </div>
                    <p className="text-sm" style={{ color: 'var(--tint-55)' }}>
                      <span className="text-[color:var(--text-primary)] font-semibold">{csvPreview.length}</span> de {totalRows} linhas serão importadas
                    </p>
                    <div className="max-h-52 overflow-y-auto space-y-1.5">
                      {csvPreview.slice(0, 50).map((c, i) => (
                        <div key={i} className="rounded-lg px-3 py-2 flex items-center gap-3" style={{ background: 'var(--tint-04)' }}>
                          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(37,99,235,0.15)' }}>
                            <User className="w-3.5 h-3.5" style={{ color: '#2563EB' }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[color:var(--text-primary)] text-sm font-medium truncate">{c.nome}</p>
                            <p className="text-xs truncate" style={{ color: 'var(--tint-45)' }}>{c.numero}{c.endereco ? ` · ${c.endereco}` : ''}</p>
                          </div>
                        </div>
                      ))}
                      {csvPreview.length > 50 && <p className="text-xs text-center py-2" style={{ color: 'var(--tint-35)' }}>... e mais {csvPreview.length - 50}</p>}
                    </div>
                    {detectedCols.endereco && (
                      <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs" style={{ background: 'rgba(74,158,222,0.07)', border: '1px solid rgba(74,158,222,0.15)', color: '#4a9ede' }}>
                        <MapPin className="w-3.5 h-3.5 flex-shrink-0" /> Endereços serão geocodificados automaticamente.
                      </div>
                    )}
                    {importError && (
                      <div className="flex items-center gap-2 text-sm rounded-xl px-3 py-2.5" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}>
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />{importError}
                      </div>
                    )}
                    <div className="flex gap-3">
                      <button onClick={() => setImportStep(1)} disabled={importing}
                        className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-40"
                        style={{ border: '1px solid var(--tint-10)', color: 'var(--tint-55)' }}>Voltar</button>
                      <button onClick={handleImport} disabled={importing}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50"
                        style={{ background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80' }}>
                        {importing ? <><Loader2 className="w-4 h-4 animate-spin" /> Importando...</> : <><Upload className="w-4 h-4" /> Importar {csvPreview.length}</>}
                      </button>
                    </div>
                  </div>
                )}

                {importStep === 3 && importResult && (
                  <div className="flex flex-col items-center justify-center py-6 gap-4">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)' }}>
                      <CheckCircle2 className="w-8 h-8" style={{ color: '#4ade80' }} />
                    </div>
                    <div className="text-center space-y-1">
                      <p className="text-[color:var(--text-primary)] font-bold text-lg">{importResult.imported} contato{importResult.imported !== 1 ? 's' : ''} importado{importResult.imported !== 1 ? 's' : ''}!</p>
                      {importResult.geocodificados > 0 && (
                        <p className="text-sm flex items-center justify-center gap-1" style={{ color: '#4a9ede' }}>
                          <MapPin className="w-3.5 h-3.5" /> {importResult.geocodificados} endereço{importResult.geocodificados !== 1 ? 's' : ''} localizado{importResult.geocodificados !== 1 ? 's' : ''} no mapa
                        </p>
                      )}
                      {importResult.errors > 0 && <p className="text-sm" style={{ color: '#fbbf24' }}>{importResult.errors} linha{importResult.errors !== 1 ? 's' : ''} ignorada{importResult.errors !== 1 ? 's' : ''}</p>}
                    </div>
                    <button onClick={resetImport}
                      className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                      style={{ background: 'linear-gradient(135deg, #2563EB, #3B82F6)', color: 'var(--bg-page)' }}>Concluir</button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ══════════════════ MODAL Disparo ══════════════════ */}
      {showMsg && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-4 pb-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-lg rounded-2xl shadow-2xl max-h-[calc(100vh-4rem)] flex flex-col"
            style={{ background: 'var(--bg-card)', border: '1px solid rgba(37,99,235,0.25)' }}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(37,99,235,0.15)' }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(37,211,102,0.15)', border: '1px solid rgba(37,211,102,0.3)' }}>
                  <WhatsAppIcon className="h-4 w-4" style={{ color: '#25d366' }} />
                </div>
                <div>
                  <h2 className="text-[color:var(--text-primary)] font-semibold">Disparar Mensagem</h2>
                  <p className="text-xs" style={{ color: 'var(--tint-45)' }}>
                    {selectedIds.size} contato{selectedIds.size !== 1 ? 's' : ''} selecionado{selectedIds.size !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <button onClick={() => { setShowMsg(false); setSendStatus({}); setSendErrors({}); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-[var(--tint-10)]"
                style={{ color: 'var(--tint-55)' }}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* Message textarea */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--tint-45)' }}>Mensagem</label>
                <textarea value={msgText} onChange={e => setMsgText(e.target.value)} rows={4}
                  placeholder="Digite a mensagem..."
                  disabled={sendingApi}
                  className="w-full rounded-xl px-4 py-3 text-[color:var(--text-primary)] text-sm outline-none resize-none placeholder-[color:var(--text-tertiary)] disabled:opacity-50"
                  style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)' }} />
                <p className="text-[10px] mt-1" style={{ color: 'var(--tint-25)' }}>
                  {msgText.length} caracteres
                </p>
              </div>

              {/* Contacts list with status */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--tint-45)' }}>
                  Contatos selecionados
                </p>
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                  {selectedContactsList.map(c => {
                    const st = sendStatus[c.id];
                    return (
                      <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                        style={{ background: 'var(--tint-04)', border: '1px solid var(--tint-06)' }}>
                        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(37,99,235,0.15)' }}>
                          <Phone className="h-3.5 w-3.5" style={{ color: '#2563EB' }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[color:var(--text-primary)] text-xs font-medium truncate">{c.nome}</p>
                          <p className="text-xs" style={{ color: 'var(--tint-45)' }}>{c.numero}</p>
                          {st === 'err' && sendErrors[c.id] && (
                            <p className="text-[10px] mt-0.5" style={{ color: '#fca5a5' }}>{sendErrors[c.id]}</p>
                          )}
                        </div>
                        {/* Status indicator */}
                        {!st || st === 'idle' ? (
                          msgText.trim() ? (
                            <a href={waLink(c.numero, msgText)} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all hover:opacity-80 flex-shrink-0"
                              style={{ background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.2)', color: '#25d366' }}>
                              <ExternalLink className="h-3 w-3" /> Abrir
                            </a>
                          ) : null
                        ) : st === 'sending' ? (
                          <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: '#2563EB' }} />
                        ) : st === 'ok' ? (
                          <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: '#4ade80' }} />
                        ) : (
                          <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#fca5a5' }} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Summary after send */}
              {!sendingApi && Object.keys(sendStatus).length > 0 && (
                <div className="rounded-xl px-4 py-3 text-xs flex items-center gap-3"
                  style={{ background: 'var(--tint-04)', border: '1px solid var(--tint-08)' }}>
                  <span style={{ color: '#4ade80' }}>
                    ✓ {Object.values(sendStatus).filter(s => s === 'ok').length} enviado{Object.values(sendStatus).filter(s => s === 'ok').length !== 1 ? 's' : ''}
                  </span>
                  {Object.values(sendStatus).filter(s => s === 'err').length > 0 && (
                    <span style={{ color: '#fca5a5' }}>
                      ✗ {Object.values(sendStatus).filter(s => s === 'err').length} com erro
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 flex-shrink-0 gap-3" style={{ borderTop: '1px solid rgba(37,99,235,0.15)' }}>
              <button onClick={copyNumbers}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all hover:opacity-80"
                style={{ background: 'rgba(74,158,222,0.1)', border: '1px solid rgba(74,158,222,0.2)', color: '#4a9ede' }}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copiado!' : 'Copiar números'}
              </button>

              <div className="flex items-center gap-2">
                <button onClick={() => { setShowMsg(false); setSendStatus({}); setSendErrors({}); }}
                  className="px-4 py-2 text-sm font-medium transition-all hover:text-white rounded-xl"
                  style={{ color: 'var(--tint-45)' }}>
                  Fechar
                </button>
                <button
                  onClick={handleSendApi}
                  disabled={!msgText.trim() || sendingApi}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg,#128c7e,#25d366)', color: 'var(--text-primary)' }}>
                  {sendingApi
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando…</>
                    : <><Send className="h-4 w-4" /> Disparar via API</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Remover contato?"
        message="Este contato será excluído permanentemente. Esta ação não pode ser desfeita."
        confirmLabel="Sim, remover"
        variant="danger"
        onConfirm={doDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
