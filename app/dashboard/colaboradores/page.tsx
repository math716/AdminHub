'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  Users2, Plus, Trash2, Loader2, X, Search, FileUp, Upload,
  CheckCircle2, AlertCircle, Map as MapIcon, List, Pencil,
  Phone, MapPin, User, UserCheck, UserX, ChevronDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PERMISSIONS, hasPermission } from '@/lib/permissions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ColaboradorRegiao {
  id: string;
  regiaoNome: string;
  uf: string;
  tipo: string; // 'RA' | 'ZONA'
}

interface Colaborador {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  lat: number | null;
  lng: number | null;
  funcao: string | null;
  padrinhoId: string | null;
  padrinho: { id: string; nome: string } | null;
  apadrinhados: { id: string; nome: string }[];
  observacao: string | null;
  status: 'ATIVO' | 'INATIVO';
  regioes: ColaboradorRegiao[];
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DF_ZONAS = [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21];

const FUNCOES = [
  { value: '', label: 'Sem função definida' },
  { value: 'Coordenador Geral', label: 'Coordenador Geral' },
  { value: 'Coordenador Regional', label: 'Coordenador Regional' },
  { value: 'Líder de Bairro', label: 'Líder de Bairro' },
  { value: 'Voluntário', label: 'Voluntário' },
];

const EMPTY_FORM = {
  nome: '',
  telefone: '',
  email: '',
  endereco: '',
  funcao: '',
  padrinhoId: '',
  observacao: '',
  status: 'ATIVO' as 'ATIVO' | 'INATIVO',
  regioes: [] as string[], // RA names
  zonas: [] as string[],   // zone numbers as strings e.g. ['1', '3']
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function normStr(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function normalizeRegiao(nome: string): string {
  return nome.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

// ---------------------------------------------------------------------------
// CSV / XLSX helpers
// ---------------------------------------------------------------------------
function parseCsvText(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { current += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        result.push(current.trim()); current = '';
      } else current += ch;
    }
    result.push(current.trim());
    return result;
  };
  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).filter(l => l.trim()).map(line => {
    const values = parseRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row;
  });
  return { headers, rows };
}

interface DetectedColabCols {
  nome: string;
  telefone: string;
  email: string;
  endereco: string;
  funcao: string;
  observacao: string;
  regioes: string;
}

function detectColabColumns(headers: string[]): DetectedColabCols {
  const result: DetectedColabCols = { nome: '', telefone: '', email: '', endereco: '', funcao: '', observacao: '', regioes: '' };
  for (const h of headers) {
    const n = normStr(h);
    if (!result.nome && /nome|name/.test(n)) result.nome = h;
    else if (!result.telefone && /telefone|celular|whatsapp|fone|phone/.test(n)) result.telefone = h;
    else if (!result.email && /email/.test(n)) result.email = h;
    else if (!result.endereco && /endereco|rua|logradouro|address/.test(n)) result.endereco = h;
    else if (!result.funcao && /funcao|cargo|role|funcoes/.test(n)) result.funcao = h;
    else if (!result.observacao && /observacao|obs|notas|notes|apelido|alcunha|alias/.test(n)) result.observacao = h;
    else if (!result.regioes && /regiao|regioes|region|regions|\bra\b|cidade|city/.test(n)) result.regioes = h;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Leaflet map — defined inline; dynamic import of Leaflet happens inside
// via useEffect so SSR is never triggered (no top-level import 'leaflet').
// ---------------------------------------------------------------------------

interface ColaboradoresMapProps {
  regioes: string[];                          // all region names from GeoJSON
  colaboradoresByRegiao: Record<string, Colaborador[]>; // regiaoNome → colabs
  selectedRegiao: string | null;
  selectedColaboradorId: string | null;
  onRegiaoClick: (nome: string) => void;
  height?: string;
}

function ColaboradoresMapInner({
  colaboradoresByRegiao,
  selectedRegiao,
  onRegiaoClick,
  height = 'calc(100vh - 200px)',
}: ColaboradoresMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const geoLayerRef = useRef<any>(null);
  const selectedLayerRef = useRef<any>(null);
  const hoveredLayerRef = useRef<any>(null);
  const isInitRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [geoData, setGeoData] = useState<any>(null);
  const colabRef = useRef(colaboradoresByRegiao);
  const selectedRef = useRef(selectedRegiao);
  const onClickRef = useRef(onRegiaoClick);

  useEffect(() => { colabRef.current = colaboradoresByRegiao; }, [colaboradoresByRegiao]);
  useEffect(() => { selectedRef.current = selectedRegiao; }, [selectedRegiao]);
  useEffect(() => { onClickRef.current = onRegiaoClick; }, [onRegiaoClick]);

  useEffect(() => {
    fetch('/geojson/df-regioes-administrativas.geojson')
      .then(r => r.json())
      .then(d => { setGeoData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const getRegionColor = useCallback((nome: string) => {
    const data = colabRef.current;
    const norm = normalizeRegiao(nome);
    let count = 0;
    for (const [k, v] of Object.entries(data)) {
      if (normalizeRegiao(k) === norm) { count = v.length; break; }
    }
    if (count === 0) return 'rgba(30,58,95,0.15)';
    const maxCount = Math.max(...Object.values(data).map(v => v.length), 1);
    const intensity = count / maxCount;
    const lightness = Math.round(55 - intensity * 20);
    const saturation = 80;
    return `hsl(210, ${saturation}%, ${lightness}%)`;
  }, []);

  const getRegionStyle = useCallback((nome: string, isSelected: boolean) => {
    const norm = normalizeRegiao(nome);
    let hasColabs = false;
    for (const [k, v] of Object.entries(colabRef.current)) {
      if (normalizeRegiao(k) === norm && v.length > 0) { hasColabs = true; break; }
    }
    if (isSelected) {
      return { fillColor: '#1d4ed8', fillOpacity: 0.55, color: '#60a5fa', weight: 2.5, opacity: 1 };
    }
    if (hasColabs) {
      return { fillColor: getRegionColor(nome), fillOpacity: 0.45, color: '#4a9ede', weight: 1.5, opacity: 1 };
    }
    return { fillColor: 'rgba(30,58,95,0.15)', fillOpacity: 0.15, color: '#9ab8d4', weight: 1, opacity: 0.6 };
  }, [getRegionColor]);

  useEffect(() => {
    if (!geoData || !mapRef.current || isInitRef.current) return;
    isInitRef.current = true;

    let cancelled = false;

    const initMap = async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !mapRef.current) { isInitRef.current = false; return; }

      // cleanup existing
      if (mapInstanceRef.current) {
        try { mapInstanceRef.current.remove(); } catch (_) {}
        mapInstanceRef.current = null;
      }

      const map = L.map(mapRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
        attributionControl: true,
        preferCanvas: false,
      });
      mapInstanceRef.current = map;

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map);

      const tooltipEl = L.DomUtil.create('div', '', map.getContainer()) as HTMLElement;
      tooltipEl.style.cssText = [
        'position:absolute', 'z-index:10000', 'pointer-events:none', 'display:none',
        'padding:10px 14px', 'background:rgba(13,27,42,0.97)', 'border-radius:8px',
        'border:1px solid #1b4965', 'min-width:160px', 'box-shadow:0 4px 20px rgba(0,0,0,0.5)',
        'white-space:nowrap', 'font-family:system-ui,sans-serif',
      ].join(';');

      const geoLayer = L.geoJSON(geoData, {
        style: (feature: any) => {
          const nome = feature?.properties?.nome || '';
          const isSel = selectedRef.current
            ? normalizeRegiao(nome) === normalizeRegiao(selectedRef.current)
            : false;
          return getRegionStyle(nome, isSel);
        },
        onEachFeature: (feature: any, layer: any) => {
          const nome = feature?.properties?.nome || 'Região';

          layer.on('click', () => {
            if (selectedLayerRef.current && selectedLayerRef.current !== layer) {
              const prevNome = selectedLayerRef.current.feature?.properties?.nome || '';
              selectedLayerRef.current.setStyle(getRegionStyle(prevNome, false));
            }
            layer.setStyle(getRegionStyle(nome, true));
            layer.bringToFront();
            selectedLayerRef.current = layer;
            onClickRef.current(nome);
            tooltipEl.style.display = 'none';
          });

          layer.on('mouseover', () => {
            if (hoveredLayerRef.current && hoveredLayerRef.current !== layer) {
              const prev = hoveredLayerRef.current;
              if (prev !== selectedLayerRef.current) {
                const pn = prev.feature?.properties?.nome || '';
                prev.setStyle(getRegionStyle(pn, false));
              }
            }
            hoveredLayerRef.current = layer;
            const norm = normalizeRegiao(nome);
            let colabs: Colaborador[] = [];
            for (const [k, v] of Object.entries(colabRef.current)) {
              if (normalizeRegiao(k) === norm) { colabs = v; break; }
            }
            const isSelected = selectedRef.current
              ? normalizeRegiao(nome) === normalizeRegiao(selectedRef.current)
              : false;
            if (!isSelected) {
              layer.setStyle({ weight: 2.5, fillOpacity: 0.35, color: '#60a5fa' });
            }
            tooltipEl.innerHTML = [
              `<strong style="color:#7dd3fc;font-size:14px;display:block;margin-bottom:4px;">${nome}</strong>`,
              colabs.length > 0
                ? `<span style="color:#e2e8f0;font-size:13px;">${colabs.length} colaborador${colabs.length > 1 ? 'es' : ''}</span>`
                : '<span style="color:#64748b;font-size:12px;">Sem colaboradores</span>',
              '<div style="margin-top:6px;padding-top:5px;border-top:1px solid rgba(27,73,101,0.5);">',
              '<span style="color:#78909c;font-size:10px;">Clique para selecionar</span></div>',
            ].join('');
            tooltipEl.style.display = 'block';
          });

          layer.on('mousemove', (e: any) => {
            const pt = map.latLngToContainerPoint(e.latlng);
            const w = tooltipEl.offsetWidth || 160;
            const h = tooltipEl.offsetHeight || 80;
            const mapW = map.getContainer().offsetWidth;
            let left = pt.x + 14;
            let top = pt.y - h - 10;
            if (left + w > mapW) left = pt.x - w - 14;
            if (top < 0) top = pt.y + 10;
            tooltipEl.style.left = left + 'px';
            tooltipEl.style.top = top + 'px';
          });

          layer.on('mouseout', () => {
            if (hoveredLayerRef.current === layer) hoveredLayerRef.current = null;
            const isSelected = selectedRef.current
              ? normalizeRegiao(nome) === normalizeRegiao(selectedRef.current)
              : false;
            layer.setStyle(getRegionStyle(nome, isSelected));
            tooltipEl.style.display = 'none';
          });
        },
      }).addTo(map);

      geoLayerRef.current = geoLayer;

      // highlight initial selected
      if (selectedRef.current) {
        geoLayer.eachLayer((l: any) => {
          const n = l.feature?.properties?.nome || '';
          if (normalizeRegiao(n) === normalizeRegiao(selectedRef.current!)) {
            l.setStyle(getRegionStyle(n, true));
            l.bringToFront();
            selectedLayerRef.current = l;
          }
        });
      }

      const bounds = geoLayer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });
      isInitRef.current = false;
    };

    initMap().catch(() => { isInitRef.current = false; });
    return () => {
      cancelled = true;
      isInitRef.current = false;
      if (mapInstanceRef.current) {
        try { mapInstanceRef.current.remove(); } catch (_) {}
        mapInstanceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoData]);

  // Update styles when colaboradores or selection changes
  useEffect(() => {
    const geoLayer = geoLayerRef.current;
    if (!geoLayer) return;
    geoLayer.eachLayer((l: any) => {
      const nome = l.feature?.properties?.nome || '';
      const isSelected = selectedRegiao
        ? normalizeRegiao(nome) === normalizeRegiao(selectedRegiao)
        : false;
      l.setStyle(getRegionStyle(nome, isSelected));
      if (isSelected) { l.bringToFront(); selectedLayerRef.current = l; }
    });
  }, [colaboradoresByRegiao, selectedRegiao, getRegionStyle]);

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center rounded-xl" style={{ height, background: 'var(--bg-card-subtle)', minHeight: 400 }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#4a9ede' }} />
      </div>
    );
  }

  return (
    <div className="relative w-full" style={{ height, minHeight: 400 }}>
      <div
        ref={mapRef}
        className="w-full h-full rounded-xl overflow-hidden"
        style={{ background: '#f0f4f8' }}
      />
      <div className="absolute bottom-3 left-3 z-[1000] bg-white/90 backdrop-blur-md rounded-xl border border-gray-200 px-4 py-2.5 text-xs shadow-md">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-3 rounded-sm" style={{ background: '#1d4ed8', opacity: 0.7 }} />
            <span className="text-gray-600">Selecionada</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-3 rounded-sm" style={{ background: 'hsl(210,80%,45%)', opacity: 0.7 }} />
            <span className="text-gray-600">Com colaboradores</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-3 rounded-sm" style={{ background: 'rgba(30,58,95,0.25)' }} />
            <span className="text-gray-600">Vazia</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------
export default function ColaboradoresPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Permission guard
  useEffect(() => {
    if (status === 'unauthenticated') { router.replace('/login'); return; }
    if (status === 'authenticated' && session?.user) {
      const canAccess = hasPermission(session.user as any, PERMISSIONS.COLABORADORES_CAMPANHA);
      if (!canAccess) router.replace('/dashboard');
    }
  }, [status, session, router]);

  // ── Data ──
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [geoRegioes, setGeoRegioes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // ── UI state ──
  const [activeTab, setActiveTab] = useState<'mapa' | 'lista'>('mapa');
  const [dfVisualizacao, setDfVisualizacao] = useState<'regioes' | 'zonas'>('regioes');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'ATIVO' | 'INATIVO'>('TODOS');
  const [selectedColaboradorId, setSelectedColaboradorId] = useState<string | null>(null);
  const [selectedRegiao, setSelectedRegiao] = useState<string | null>(null);
  const [selectedZona, setSelectedZona] = useState<number | null>(null);

  // ── Modals ──
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingColaborador, setEditingColaborador] = useState<Colaborador | null>(null);
  const [formRegiaoTab, setFormRegiaoTab] = useState<'ra' | 'zona'>('ra');
  const [showImportModal, setShowImportModal] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // ── Form state ──
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  // ── Import state ──
  const [importStep, setImportStep] = useState<1 | 2 | 3>(1);
  const [importPreview, setImportPreview] = useState<Array<Record<string, string>>>([]);
  const [allImportRows, setAllImportRows] = useState<Array<Record<string, string>>>([]);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importCols, setImportCols] = useState<DetectedColabCols>({ nome: '', telefone: '', email: '', endereco: '', funcao: '', observacao: '', regioes: '' });
  const [totalImportRows, setTotalImportRows] = useState(0);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; errors: number } | null>(null);
  const [importError, setImportError] = useState('');

  // ── Fetch data ──
  const fetchColaboradores = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/colaboradores');
      const data = await res.json();
      setColaboradores(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Erro ao carregar colaboradores');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchColaboradores();
      // Load GeoJSON region names
      fetch('/geojson/df-regioes-administrativas.geojson')
        .then(r => r.json())
        .then((geo: any) => {
          const nomes: string[] = (geo.features ?? [])
            .map((f: any) => f.properties?.nome as string)
            .filter(Boolean)
            .sort((a: string, b: string) => a.localeCompare(b, 'pt-BR'));
          setGeoRegioes(nomes);
        })
        .catch(() => {});
    }
  }, [status, fetchColaboradores]);

  // ── Derived data ──
  const colaboradoresByRegiao = useMemo(() => {
    const map: Record<string, Colaborador[]> = {};
    for (const c of colaboradores) {
      for (const r of c.regioes) {
        if (r.tipo !== 'RA') continue;
        if (!map[r.regiaoNome]) map[r.regiaoNome] = [];
        map[r.regiaoNome].push(c);
      }
    }
    return map;
  }, [colaboradores]);

  const colaboradoresByZona = useMemo(() => {
    const map: Record<number, Colaborador[]> = {};
    for (const c of colaboradores) {
      for (const r of c.regioes) {
        if (r.tipo !== 'ZONA') continue;
        const num = parseInt(r.regiaoNome.replace('Zona ', ''), 10);
        if (!isNaN(num)) {
          if (!map[num]) map[num] = [];
          map[num].push(c);
        }
      }
    }
    return map;
  }, [colaboradores]);

  const regioesCobertasCount = useMemo(() => {
    const nomes = new Set<string>();
    for (const c of colaboradores) {
      for (const r of c.regioes) {
        if (r.tipo === 'RA') nomes.add(r.regiaoNome);
      }
    }
    return nomes.size;
  }, [colaboradores]);

  const zonasCobertasCount = useMemo(() => {
    const nums = new Set<number>();
    for (const c of colaboradores) {
      for (const r of c.regioes) {
        if (r.tipo === 'ZONA') {
          const num = parseInt(r.regiaoNome.replace('Zona ', ''), 10);
          if (!isNaN(num)) nums.add(num);
        }
      }
    }
    return nums.size;
  }, [colaboradores]);

  const ativosCount = useMemo(() => colaboradores.filter(c => c.status === 'ATIVO').length, [colaboradores]);
  const inativosCount = useMemo(() => colaboradores.filter(c => c.status === 'INATIVO').length, [colaboradores]);

  // Filtered list
  const filteredColaboradores = useMemo(() => {
    let list = colaboradores;
    if (selectedRegiao) {
      list = list.filter(c =>
        c.regioes.some(r => r.tipo === 'RA' && normalizeRegiao(r.regiaoNome) === normalizeRegiao(selectedRegiao))
      );
    }
    if (selectedZona !== null) {
      list = list.filter(c =>
        c.regioes.some(r => r.tipo === 'ZONA' && r.regiaoNome === `Zona ${selectedZona}`)
      );
    }
    if (statusFilter !== 'TODOS') list = list.filter(c => c.status === statusFilter);
    if (search.trim()) {
      const q = normStr(search);
      list = list.filter(c => normStr(c.nome).includes(q));
    }
    return list;
  }, [colaboradores, selectedRegiao, selectedZona, statusFilter, search]);

  const regiaoColaboradores = useMemo(() => {
    if (!selectedRegiao) return [];
    const norm = normalizeRegiao(selectedRegiao);
    return colaboradores.filter(c =>
      c.regioes.some(r => r.tipo === 'RA' && normalizeRegiao(r.regiaoNome) === norm)
    );
  }, [colaboradores, selectedRegiao]);

  const zonaColaboradores = useMemo(() => {
    if (selectedZona === null) return [];
    return colaboradoresByZona[selectedZona] ?? [];
  }, [colaboradoresByZona, selectedZona]);

  // ── Handlers ──
  const openNew = () => {
    setEditingColaborador(null);
    setForm({ ...EMPTY_FORM });
    setFormRegiaoTab('ra');
    setShowFormModal(true);
  };

  const openEdit = (c: Colaborador) => {
    setEditingColaborador(c);
    const hasZonas = c.regioes.some(r => r.tipo === 'ZONA');
    setForm({
      nome: c.nome,
      telefone: c.telefone ?? '',
      email: c.email ?? '',
      endereco: c.endereco ?? '',
      funcao: c.funcao ?? '',
      padrinhoId: c.padrinhoId ?? '',
      observacao: c.observacao ?? '',
      status: c.status,
      regioes: c.regioes.filter(r => r.tipo === 'RA').map(r => r.regiaoNome),
      zonas: c.regioes.filter(r => r.tipo === 'ZONA').map(r => r.regiaoNome.replace('Zona ', '')),
    });
    setFormRegiaoTab(hasZonas ? 'zona' : 'ra');
    setShowFormModal(true);
  };

  const handleSave = async () => {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return; }
    setSaving(true);
    try {
      const body = {
        nome: form.nome.trim(),
        telefone: form.telefone || undefined,
        email: form.email || undefined,
        endereco: form.endereco || undefined,
        funcao: form.funcao || undefined,
        padrinhoId: form.padrinhoId || undefined,
        observacao: form.observacao || undefined,
        status: form.status,
        regioes: form.regioes,
        zonas: form.zonas,
      };
      const url = editingColaborador
        ? `/api/colaboradores/${editingColaborador.id}`
        : '/api/colaboradores';
      const method = editingColaborador ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Erro ao salvar');
      toast.success(editingColaborador ? 'Colaborador atualizado!' : 'Colaborador criado!');
      setShowFormModal(false);
      fetchColaboradores();
    } catch {
      toast.error('Erro ao salvar colaborador');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/colaboradores/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao deletar');
      toast.success('Colaborador removido');
      setConfirmDeleteId(null);
      if (selectedColaboradorId === id) setSelectedColaboradorId(null);
      fetchColaboradores();
    } catch {
      toast.error('Erro ao remover colaborador');
    }
  };

  const handleRegionClick = (nome: string) => {
    setSelectedRegiao(prev => normalizeRegiao(prev ?? '') === normalizeRegiao(nome) ? null : nome);
    setSelectedColaboradorId(null);
  };

  const clearRegionFilter = () => {
    setSelectedRegiao(null);
    setSelectedColaboradorId(null);
  };

  const handleZonaClick = (zona: number) => {
    setSelectedZona(prev => prev === zona ? null : zona);
    setSelectedColaboradorId(null);
  };

  const clearZonaFilter = () => {
    setSelectedZona(null);
    setSelectedColaboradorId(null);
  };

  const switchVisualizacao = (v: 'regioes' | 'zonas') => {
    setDfVisualizacao(v);
    if (v === 'zonas') setSelectedRegiao(null);
    if (v === 'regioes') setSelectedZona(null);
    setSelectedColaboradorId(null);
  };

  // ── Import ──
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    try {
      const isCsv = file.name.endsWith('.csv');
      let rows: Record<string, string>[] = [];
      let headers: string[] = [];

      if (isCsv) {
        const text = await file.text();
        const parsed = parseCsvText(text);
        rows = parsed.rows;
        headers = parsed.headers;
      } else {
        const XLSX = await import('xlsx');
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];

        // Read raw arrays so we can find the actual header row
        // (handles spreadsheets that have a title row before the real headers)
        const rawAll = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });

        // Score each of the first 5 rows: count how many cells look like field names
        const FIELD_RE = /nome|name|celular|telefone|email|endereco|cidade|city|regiao|region|funcao|cargo|apelido|id$/;
        let headerIdx = 0;
        let bestScore = -1;
        for (let i = 0; i < Math.min(5, rawAll.length); i++) {
          const cells = (rawAll[i] as unknown[]).map(v => normStr(String(v)));
          const score = cells.filter(c => FIELD_RE.test(c)).length;
          if (score > bestScore) { bestScore = score; headerIdx = i; }
        }

        const rawHeaders = (rawAll[headerIdx] as unknown[]).map(v => String(v).trim());
        headers = rawHeaders.map((h, i) => h || `_col${i}`);
        rows = rawAll.slice(headerIdx + 1)
          .filter(row => (row as unknown[]).some(v => String(v).trim() !== ''))
          .map(row => {
            const obj: Record<string, string> = {};
            headers.forEach((h, i) => { obj[h] = String((row as unknown[])[i] ?? '').trim(); });
            return obj;
          });
      }

      const cols = detectColabColumns(headers);
      setImportCols(cols);
      setTotalImportRows(rows.length);
      setImportPreview(rows.slice(0, 10));
      setAllImportRows(rows);
      setImportHeaders(headers);
      setImportStep(2);
    } catch {
      setImportError('Erro ao processar arquivo. Verifique o formato.');
    }
  };

  const handleImport = async () => {
    setImporting(true);
    setImportError('');
    try {
      const body = {
        colaboradores: allImportRows
          .filter(row => importCols.nome && row[importCols.nome]?.trim())
          .map(row => ({
            nome: importCols.nome ? row[importCols.nome]?.trim() : '',
            telefone: importCols.telefone ? row[importCols.telefone]?.trim() : undefined,
            email: importCols.email ? row[importCols.email]?.trim() : undefined,
            endereco: importCols.endereco ? row[importCols.endereco]?.trim() : undefined,
            funcao: importCols.funcao ? row[importCols.funcao]?.trim() : undefined,
            observacao: importCols.observacao ? row[importCols.observacao]?.trim() : undefined,
            regioes: importCols.regioes ? row[importCols.regioes]?.trim() : undefined,
          })),
      };
      const res = await fetch('/api/colaboradores/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setImportResult({ imported: data.imported ?? 0, errors: data.errors ?? 0 });
      setImportStep(3);
      if ((data.imported ?? 0) > 0) {
        toast.success(`${data.imported} colaborador(es) importado(s)!`);
        fetchColaboradores();
      }
    } catch {
      setImportError('Erro ao importar. Tente novamente.');
    } finally {
      setImporting(false);
    }
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setImportStep(1);
    setImportPreview([]);
    setAllImportRows([]);
    setImportHeaders([]);
    setImportCols({ nome: '', telefone: '', email: '', endereco: '', funcao: '', observacao: '', regioes: '' });
    setTotalImportRows(0);
    setImportResult(null);
    setImportError('');
  };

  // ── Toggle region in form ──
  const toggleRegiao = (nome: string) => {
    setForm(f => ({
      ...f,
      regioes: f.regioes.includes(nome)
        ? f.regioes.filter(r => r !== nome)
        : [...f.regioes, nome],
    }));
  };

  const toggleZona = (num: string) => {
    setForm(f => ({
      ...f,
      zonas: f.zonas.includes(num)
        ? f.zonas.filter(z => z !== num)
        : [...f.zonas, num],
    }));
  };

  // Padrinho candidates (exclude self when editing)
  const padrinhoOptions = useMemo(() =>
    colaboradores.filter(c => c.id !== editingColaborador?.id),
    [colaboradores, editingColaborador]
  );

  if (!mounted) return null;
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#4a9ede' }} />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* ── Header ── */}
      <PageHeader
        icon={Users2}
        title="Colaboradores de Campanha"
        subtitle="Gerencie sua equipe por regiões administrativas do DF"
        actions={
          <>
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150"
              style={{
                background: 'var(--tint-06)',
                border: '1px solid var(--tint-10)',
                color: 'var(--text-secondary)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--tint-10)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--tint-06)')}
            >
              <FileUp className="w-4 h-4" />
              Importar CSV
            </button>
            <button
              onClick={openNew}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all duration-150"
              style={{ background: 'linear-gradient(135deg, #1d6fd8, #4a9ede)', boxShadow: '0 4px 14px rgba(74,158,222,0.35)' }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              <Plus className="w-4 h-4" />
              Novo Colaborador
            </button>
          </>
        }
      />

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: colaboradores.length, icon: Users2, color: '#4a9ede' },
          { label: 'RAs cobertas', value: `${regioesCobertasCount} / 33`, icon: MapPin, color: '#22c55e' },
          { label: 'Zonas cobertas', value: `${zonasCobertasCount} / 19`, icon: MapPin, color: '#a78bfa' },
          { label: 'Ativos', value: ativosCount, icon: UserCheck, color: '#22c55e' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="rounded-xl p-4 flex items-center gap-3"
            style={{ background: 'var(--bg-card)', border: '1px solid rgba(74,158,222,0.15)' }}
          >
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}1a` }}>
              <Icon className="w-4 h-4" style={{ color }} />
            </div>
            <div>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
              <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{loading ? '—' : value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Left sidebar */}
        <div
          className="md:col-span-1 rounded-xl flex flex-col gap-3 p-4"
          style={{ background: 'var(--bg-card)', border: '1px solid rgba(74,158,222,0.15)' }}
        >
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
            <input
              type="text"
              placeholder="Buscar colaborador..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none"
              style={{
                background: 'var(--tint-06)',
                border: '1px solid var(--tint-10)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Status filter */}
          <div className="flex gap-1">
            {(['TODOS', 'ATIVO', 'INATIVO'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150"
                style={{
                  background: statusFilter === s ? 'linear-gradient(135deg, #1d6fd8, #4a9ede)' : 'var(--tint-06)',
                  color: statusFilter === s ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid ' + (statusFilter === s ? 'transparent' : 'var(--tint-10)'),
                }}
              >
                {s === 'TODOS' ? 'Todos' : s === 'ATIVO' ? 'Ativos' : 'Inativos'}
              </button>
            ))}
          </div>

          {/* Region filter indicator */}
          {selectedRegiao && (
            <div
              className="flex items-center justify-between rounded-lg px-3 py-2 text-xs"
              style={{ background: 'rgba(29,78,216,0.12)', border: '1px solid rgba(29,78,216,0.3)' }}
            >
              <span style={{ color: '#60a5fa' }}>RA: {selectedRegiao}</span>
              <button onClick={clearRegionFilter}>
                <X className="w-3.5 h-3.5" style={{ color: '#60a5fa' }} />
              </button>
            </div>
          )}
          {selectedZona !== null && (
            <div
              className="flex items-center justify-between rounded-lg px-3 py-2 text-xs"
              style={{ background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)' }}
            >
              <span style={{ color: '#a78bfa' }}>Zona Eleitoral {selectedZona}</span>
              <button onClick={clearZonaFilter}>
                <X className="w-3.5 h-3.5" style={{ color: '#a78bfa' }} />
              </button>
            </div>
          )}

          {/* Collaborator list */}
          <div className="flex-1 overflow-y-auto space-y-2 max-h-[calc(100vh-400px)] min-h-[200px] scrollbar-dark">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#4a9ede' }} />
              </div>
            ) : filteredColaboradores.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <Users2 className="w-8 h-8 opacity-30" style={{ color: 'var(--text-tertiary)' }} />
                <p className="text-xs text-center" style={{ color: 'var(--text-tertiary)' }}>
                  {search || selectedRegiao ? 'Nenhum resultado' : 'Nenhum colaborador ainda'}
                </p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {filteredColaboradores.map(c => (
                  <motion.div
                    key={c.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15 }}
                    onClick={() => setSelectedColaboradorId(prev => prev === c.id ? null : c.id)}
                    className="rounded-xl p-3 cursor-pointer transition-all duration-150"
                    style={{
                      background: selectedColaboradorId === c.id ? 'rgba(29,78,216,0.12)' : 'var(--tint-04)',
                      border: selectedColaboradorId === c.id
                        ? '1px solid rgba(29,78,216,0.4)'
                        : '1px solid var(--tint-08)',
                    }}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-sm font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>{c.nome}</p>
                      <span
                        className="flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full font-semibold"
                        style={{
                          background: c.status === 'ATIVO' ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.15)',
                          color: c.status === 'ATIVO' ? '#22c55e' : '#94a3b8',
                        }}
                      >
                        {c.status === 'ATIVO' ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                    {c.funcao && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{c.funcao}</p>
                    )}
                    {c.regioes.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {c.regioes.slice(0, 3).map(r => (
                          <span
                            key={r.id}
                            className="text-[10px] px-1.5 py-0.5 rounded"
                            style={r.tipo === 'ZONA'
                              ? { background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }
                              : { background: 'rgba(74,158,222,0.15)', color: '#4a9ede' }}
                          >
                            {r.regiaoNome}
                          </span>
                        ))}
                        {c.regioes.length > 3 && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded"
                            style={{ background: 'var(--tint-08)', color: 'var(--text-tertiary)' }}
                          >
                            +{c.regioes.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                    {/* Actions (show on selection) */}
                    {selectedColaboradorId === c.id && (
                      <div className="flex gap-1 mt-2 pt-2" style={{ borderTop: '1px solid var(--tint-08)' }}>
                        <button
                          onClick={e => { e.stopPropagation(); openEdit(c); }}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all"
                          style={{ background: 'rgba(74,158,222,0.15)', color: '#4a9ede' }}
                        >
                          <Pencil className="w-3 h-3" /> Editar
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); setConfirmDeleteId(c.id); }}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all"
                          style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}
                        >
                          <Trash2 className="w-3 h-3" /> Remover
                        </button>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* Right main area */}
        <div className="md:col-span-3 flex flex-col gap-3">
          {/* Tab switcher row */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div
              className="flex items-center gap-1 p-1 rounded-xl"
              style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)' }}
            >
              {([
                { id: 'mapa', label: 'Mapa', icon: MapIcon },
                { id: 'lista', label: 'Lista', icon: List },
              ] as const).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150"
                  style={{
                    background: activeTab === id ? 'linear-gradient(135deg, #1d6fd8, #4a9ede)' : 'transparent',
                    color: activeTab === id ? '#fff' : 'var(--text-secondary)',
                  }}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>

            {/* Sub-toggle: Regiões Admin. | Zonas Eleitorais — only in Mapa tab */}
            {activeTab === 'mapa' && (
              <div
                className="flex items-center gap-1 p-1 rounded-xl"
                style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)' }}
              >
                {([
                  { id: 'regioes', label: 'Regiões Admin.' },
                  { id: 'zonas', label: 'Zonas Eleitorais' },
                ] as const).map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => switchVisualizacao(id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150"
                    style={{
                      background: dfVisualizacao === id ? 'linear-gradient(135deg, #6d28d9, #8b5cf6)' : 'transparent',
                      color: dfVisualizacao === id ? '#fff' : 'var(--text-secondary)',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <AnimatePresence mode="wait">
            {activeTab === 'mapa' ? (
              <motion.div
                key="mapa"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col gap-3"
              >
                {/* ── Regiões Administrativas view ── */}
                {dfVisualizacao === 'regioes' && (
                  <>
                    {/* Region detail card */}
                    {selectedRegiao && (
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="rounded-xl p-4"
                        style={{ background: 'var(--bg-card)', border: '1px solid rgba(74,158,222,0.2)' }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <MapPin className="w-4 h-4" style={{ color: '#4a9ede' }} />
                              <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                                {selectedRegiao}
                              </h3>
                              <span
                                className="text-xs px-2 py-0.5 rounded-full"
                                style={{ background: 'rgba(74,158,222,0.15)', color: '#4a9ede' }}
                              >
                                {regiaoColaboradores.length} colaborador{regiaoColaboradores.length !== 1 ? 'es' : ''}
                              </span>
                            </div>
                            {regiaoColaboradores.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {regiaoColaboradores.map(c => (
                                  <div
                                    key={c.id}
                                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs"
                                    style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)' }}
                                  >
                                    <User className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />
                                    <span style={{ color: 'var(--text-primary)' }}>{c.nome}</span>
                                    {c.funcao && (
                                      <span style={{ color: 'var(--text-tertiary)' }}>· {c.funcao}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                Nenhum colaborador nesta região ainda.
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={() => {
                                setForm({ ...EMPTY_FORM, regioes: [selectedRegiao], zonas: [] });
                                setEditingColaborador(null);
                                setShowFormModal(true);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all"
                              style={{ background: 'linear-gradient(135deg, #1d6fd8, #4a9ede)' }}
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Adicionar
                            </button>
                            <button onClick={clearRegionFilter}>
                              <X className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* Polygon map */}
                    <div
                      className="rounded-xl overflow-hidden"
                      style={{ border: '1px solid rgba(74,158,222,0.15)' }}
                    >
                      <ColaboradoresMapInner
                        regioes={geoRegioes}
                        colaboradoresByRegiao={colaboradoresByRegiao}
                        selectedRegiao={selectedRegiao}
                        selectedColaboradorId={selectedColaboradorId}
                        onRegiaoClick={handleRegionClick}
                        height="calc(100vh - 340px)"
                      />
                    </div>
                  </>
                )}

                {/* ── Zonas Eleitorais view ── */}
                {dfVisualizacao === 'zonas' && (
                  <>
                    {/* Zone detail card */}
                    {selectedZona !== null && (
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="rounded-xl p-4"
                        style={{ background: 'var(--bg-card)', border: '1px solid rgba(167,139,250,0.2)' }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <MapPin className="w-4 h-4" style={{ color: '#a78bfa' }} />
                              <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                                Zona Eleitoral {selectedZona}
                              </h3>
                              <span
                                className="text-xs px-2 py-0.5 rounded-full"
                                style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}
                              >
                                {zonaColaboradores.length} colaborador{zonaColaboradores.length !== 1 ? 'es' : ''}
                              </span>
                            </div>
                            {zonaColaboradores.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {zonaColaboradores.map(c => (
                                  <div
                                    key={c.id}
                                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs"
                                    style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)' }}
                                  >
                                    <User className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />
                                    <span style={{ color: 'var(--text-primary)' }}>{c.nome}</span>
                                    {c.funcao && (
                                      <span style={{ color: 'var(--text-tertiary)' }}>· {c.funcao}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                Nenhum colaborador nesta zona ainda.
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={() => {
                                setForm({ ...EMPTY_FORM, regioes: [], zonas: [String(selectedZona)] });
                                setEditingColaborador(null);
                                setFormRegiaoTab('zona');
                                setShowFormModal(true);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all"
                              style={{ background: 'linear-gradient(135deg, #6d28d9, #8b5cf6)' }}
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Adicionar
                            </button>
                            <button onClick={clearZonaFilter}>
                              <X className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* Zone card grid */}
                    <div
                      className="rounded-xl p-5"
                      style={{ background: 'var(--bg-card)', border: '1px solid rgba(167,139,250,0.15)', minHeight: 'calc(100vh - 340px)' }}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                            Zonas Eleitorais do DF
                          </h3>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                            {zonasCobertasCount} de 19 zonas com colaboradores — clique para filtrar
                          </p>
                        </div>
                        {selectedZona !== null && (
                          <button
                            onClick={clearZonaFilter}
                            className="text-xs px-3 py-1 rounded-lg"
                            style={{ background: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.2)' }}
                          >
                            Limpar seleção
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 gap-2.5">
                        {DF_ZONAS.map(zona => {
                          const colabs = colaboradoresByZona[zona] ?? [];
                          const ativos = colabs.filter(c => c.status === 'ATIVO').length;
                          const isSelected = selectedZona === zona;
                          const hasColabs = colabs.length > 0;
                          return (
                            <button
                              key={zona}
                              onClick={() => handleZonaClick(zona)}
                              className="flex flex-col items-center justify-center py-3 px-2 rounded-xl transition-all duration-150 hover:scale-105"
                              style={{
                                background: isSelected
                                  ? 'rgba(109,40,217,0.18)'
                                  : hasColabs
                                    ? 'rgba(139,92,246,0.08)'
                                    : 'var(--tint-04)',
                                border: `1px solid ${isSelected
                                  ? 'rgba(109,40,217,0.5)'
                                  : hasColabs
                                    ? 'rgba(139,92,246,0.25)'
                                    : 'var(--tint-08)'}`,
                              }}
                            >
                              <span
                                className="text-xl font-bold leading-none"
                                style={{
                                  color: isSelected ? '#c4b5fd' : hasColabs ? '#a78bfa' : 'var(--text-tertiary)',
                                }}
                              >
                                {zona}
                              </span>
                              <span
                                className="text-[10px] mt-1.5 font-medium"
                                style={{ color: isSelected ? '#ddd6fe' : 'var(--text-tertiary)' }}
                              >
                                {colabs.length === 0
                                  ? 'vazia'
                                  : `${ativos} ativo${ativos !== 1 ? 's' : ''}`}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Legend */}
                      <div className="flex items-center gap-4 mt-5 pt-4" style={{ borderTop: '1px solid var(--tint-06)' }}>
                        <div className="flex items-center gap-1.5">
                          <div className="w-4 h-3 rounded-sm" style={{ background: 'rgba(109,40,217,0.4)', border: '1px solid rgba(109,40,217,0.5)' }} />
                          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Selecionada</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-4 h-3 rounded-sm" style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.3)' }} />
                          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Com colaboradores</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-4 h-3 rounded-sm" style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-08)' }} />
                          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Vazia</span>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="lista"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="rounded-xl overflow-hidden"
                style={{ background: 'var(--bg-card)', border: '1px solid rgba(74,158,222,0.15)' }}
              >
                {loading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#4a9ede' }} />
                  </div>
                ) : filteredColaboradores.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <Users2 className="w-12 h-12 opacity-20" style={{ color: 'var(--text-tertiary)' }} />
                    <p style={{ color: 'var(--text-tertiary)' }}>Nenhum colaborador encontrado</p>
                    <button
                      onClick={openNew}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white"
                      style={{ background: 'linear-gradient(135deg, #1d6fd8, #4a9ede)' }}
                    >
                      <Plus className="w-4 h-4" /> Novo Colaborador
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--tint-08)' }}>
                          {['Nome', 'Função', 'Telefone', 'Email', 'Regiões', 'Padrinho', 'Status', ''].map(h => (
                            <th
                              key={h}
                              className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                              style={{ color: 'var(--text-tertiary)' }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredColaboradores.map((c, i) => (
                          <tr
                            key={c.id}
                            style={{ borderBottom: i < filteredColaboradores.length - 1 ? '1px solid var(--tint-06)' : 'none' }}
                            className="transition-colors duration-100"
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--tint-04)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <td className="px-4 py-3">
                              <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{c.nome}</p>
                              {c.observacao && (
                                <p className="text-xs mt-0.5 truncate max-w-[180px]" style={{ color: 'var(--text-tertiary)' }}>{c.observacao}</p>
                              )}
                            </td>
                            <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                              {c.funcao ?? <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                            </td>
                            <td className="px-4 py-3">
                              {c.telefone ? (
                                <a
                                  href={`https://wa.me/55${c.telefone.replace(/\D/g, '')}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center gap-1 text-xs"
                                  style={{ color: '#4a9ede' }}
                                >
                                  <Phone className="w-3 h-3" /> {c.telefone}
                                </a>
                              ) : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                            </td>
                            <td className="px-4 py-3">
                              {c.email ? (
                                <a href={`mailto:${c.email}`} className="text-xs" style={{ color: '#4a9ede' }}>
                                  {c.email}
                                </a>
                              ) : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                {c.regioes.slice(0, 2).map(r => (
                                  <span
                                    key={r.id}
                                    className="text-[10px] px-1.5 py-0.5 rounded"
                                    style={{ background: 'rgba(74,158,222,0.12)', color: '#4a9ede' }}
                                  >
                                    {r.regiaoNome}
                                  </span>
                                ))}
                                {c.regioes.length > 2 && (
                                  <span
                                    className="text-[10px] px-1.5 py-0.5 rounded"
                                    style={{ background: 'var(--tint-08)', color: 'var(--text-tertiary)' }}
                                  >
                                    +{c.regioes.length - 2}
                                  </span>
                                )}
                                {c.regioes.length === 0 && <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                              </div>
                            </td>
                            <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                              {c.padrinho?.nome ?? <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className="text-xs px-2.5 py-1 rounded-full font-semibold"
                                style={{
                                  background: c.status === 'ATIVO' ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.15)',
                                  color: c.status === 'ATIVO' ? '#22c55e' : '#94a3b8',
                                }}
                              >
                                {c.status === 'ATIVO' ? 'Ativo' : 'Inativo'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => openEdit(c)}
                                  className="p-1.5 rounded-lg transition-all"
                                  style={{ color: 'var(--text-tertiary)' }}
                                  onMouseEnter={e => (e.currentTarget.style.color = '#4a9ede')}
                                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                                  title="Editar"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteId(c.id)}
                                  className="p-1.5 rounded-lg transition-all"
                                  style={{ color: 'var(--text-tertiary)' }}
                                  onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                                  title="Remover"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Form modal ── */}
      {mounted && createPortal(
        <AnimatePresence>
          {showFormModal && (
            <div className="fixed inset-0 z-[9000] flex items-start justify-center overflow-y-auto py-6 px-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0"
                style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
                onClick={() => setShowFormModal(false)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.94, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: 20 }}
                transition={{ type: 'spring', damping: 24, stiffness: 260 }}
                className="relative w-full max-w-2xl"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 20,
                  boxShadow: 'var(--shadow-raised)',
                  color: 'var(--text-primary)',
                }}
                onClick={e => e.stopPropagation()}
              >
                <span
                  className="absolute top-0 left-0 right-0 h-[2px] rounded-t-[20px] pointer-events-none"
                  style={{ background: 'linear-gradient(90deg, transparent, rgba(74,158,222,0.7), transparent)' }}
                />
                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-6 pb-4" style={{ borderBottom: '1px solid var(--tint-08)' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(74,158,222,0.15)' }}>
                      <Users2 className="w-4 h-4" style={{ color: '#4a9ede' }} />
                    </div>
                    <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                      {editingColaborador ? 'Editar Colaborador' : 'Novo Colaborador'}
                    </h2>
                  </div>
                  <button
                    onClick={() => setShowFormModal(false)}
                    className="p-2 rounded-lg transition-all"
                    style={{ color: 'var(--text-tertiary)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--tint-08)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-5">
                  {/* Nome */}
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      Nome <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Nome completo"
                      value={form.nome}
                      onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                      style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)', color: 'var(--text-primary)' }}
                    />
                  </div>

                  {/* Telefone + Email */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                        Telefone
                      </label>
                      <input
                        type="tel"
                        placeholder="(61) 99999-9999"
                        value={form.telefone}
                        onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                        style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                        Email
                      </label>
                      <input
                        type="email"
                        placeholder="email@exemplo.com"
                        value={form.email}
                        onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                        style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)', color: 'var(--text-primary)' }}
                      />
                    </div>
                  </div>

                  {/* Endereço */}
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      Endereço
                    </label>
                    <input
                      type="text"
                      placeholder="Rua, número, bairro"
                      value={form.endereco}
                      onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                      style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)', color: 'var(--text-primary)' }}
                    />
                  </div>

                  {/* Função + Status */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                        Função
                      </label>
                      <div className="relative">
                        <select
                          value={form.funcao}
                          onChange={e => setForm(f => ({ ...f, funcao: e.target.value }))}
                          className="w-full px-3 py-2.5 rounded-xl text-sm outline-none appearance-none pr-8"
                          style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)', color: 'var(--text-primary)' }}
                        >
                          {FUNCOES.map(fn => (
                            <option key={fn.value} value={fn.value}>{fn.label}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-tertiary)' }} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                        Status
                      </label>
                      <div className="flex gap-2">
                        {(['ATIVO', 'INATIVO'] as const).map(s => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setForm(f => ({ ...f, status: s }))}
                            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
                            style={{
                              background: form.status === s
                                ? (s === 'ATIVO' ? 'rgba(34,197,94,0.2)' : 'rgba(100,116,139,0.15)')
                                : 'var(--tint-06)',
                              color: form.status === s
                                ? (s === 'ATIVO' ? '#22c55e' : '#94a3b8')
                                : 'var(--text-secondary)',
                              border: '1px solid ' + (form.status === s
                                ? (s === 'ATIVO' ? 'rgba(34,197,94,0.3)' : 'rgba(100,116,139,0.2)')
                                : 'var(--tint-10)'),
                            }}
                          >
                            {s === 'ATIVO' ? 'Ativo' : 'Inativo'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Padrinho */}
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      Padrinho Político
                    </label>
                    <div className="relative">
                      <select
                        value={form.padrinhoId}
                        onChange={e => setForm(f => ({ ...f, padrinhoId: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none appearance-none pr-8"
                        style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)', color: 'var(--text-primary)' }}
                      >
                        <option value="">Nenhum</option>
                        {padrinhoOptions.map(c => (
                          <option key={c.id} value={c.id}>{c.nome}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-tertiary)' }} />
                    </div>
                  </div>

                  {/* Regiões & Zonas */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                        Áreas de Atuação
                        {(form.regioes.length + form.zonas.length) > 0 && (
                          <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(74,158,222,0.15)', color: '#4a9ede' }}>
                            {form.regioes.length + form.zonas.length} selecionada{(form.regioes.length + form.zonas.length) !== 1 ? 's' : ''}
                          </span>
                        )}
                      </label>
                      {/* Tab switcher inside modal */}
                      <div
                        className="flex items-center gap-0.5 p-0.5 rounded-lg"
                        style={{ background: 'var(--tint-08)', border: '1px solid var(--tint-10)' }}
                      >
                        {([
                          { id: 'ra', label: 'Regiões Admin.' },
                          { id: 'zona', label: 'Zonas Eleitorais' },
                        ] as const).map(({ id, label }) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setFormRegiaoTab(id)}
                            className="px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all"
                            style={{
                              background: formRegiaoTab === id
                                ? (id === 'ra' ? 'linear-gradient(135deg, #1d6fd8, #4a9ede)' : 'linear-gradient(135deg, #6d28d9, #8b5cf6)')
                                : 'transparent',
                              color: formRegiaoTab === id ? '#fff' : 'var(--text-tertiary)',
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* RA checkbox grid */}
                    {formRegiaoTab === 'ra' && (
                      <div
                        className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-52 overflow-y-auto p-3 rounded-xl scrollbar-dark"
                        style={{ background: 'var(--tint-04)', border: '1px solid var(--tint-08)' }}
                      >
                        {geoRegioes.length === 0 ? (
                          <div className="col-span-full text-center py-4">
                            <Loader2 className="w-4 h-4 animate-spin mx-auto" style={{ color: '#4a9ede' }} />
                          </div>
                        ) : (
                          geoRegioes.map(nome => {
                            const selected = form.regioes.includes(nome);
                            return (
                              <button
                                key={nome}
                                type="button"
                                onClick={() => toggleRegiao(nome)}
                                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-left transition-all"
                                style={{
                                  background: selected ? 'rgba(29,78,216,0.15)' : 'var(--tint-06)',
                                  border: '1px solid ' + (selected ? 'rgba(29,78,216,0.4)' : 'var(--tint-10)'),
                                  color: selected ? '#60a5fa' : 'var(--text-secondary)',
                                }}
                              >
                                <div
                                  className="w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0"
                                  style={{
                                    background: selected ? '#1d4ed8' : 'var(--tint-08)',
                                    border: '1px solid ' + (selected ? '#3b82f6' : 'var(--tint-15)'),
                                  }}
                                >
                                  {selected && <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
                                </div>
                                <span className="truncate">{nome}</span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}

                    {/* Zone checkbox grid */}
                    {formRegiaoTab === 'zona' && (
                      <div
                        className="grid grid-cols-4 sm:grid-cols-5 gap-1.5 max-h-52 overflow-y-auto p-3 rounded-xl scrollbar-dark"
                        style={{ background: 'var(--tint-04)', border: '1px solid var(--tint-08)' }}
                      >
                        {DF_ZONAS.map(num => {
                          const key = String(num);
                          const selected = form.zonas.includes(key);
                          return (
                            <button
                              key={num}
                              type="button"
                              onClick={() => toggleZona(key)}
                              className="flex flex-col items-center justify-center py-2.5 rounded-lg text-xs font-bold transition-all"
                              style={{
                                background: selected ? 'rgba(109,40,217,0.18)' : 'var(--tint-06)',
                                border: '1px solid ' + (selected ? 'rgba(109,40,217,0.45)' : 'var(--tint-10)'),
                                color: selected ? '#c4b5fd' : 'var(--text-secondary)',
                              }}
                            >
                              <span className="text-base leading-none">{num}</span>
                              {selected && <CheckCircle2 className="w-2.5 h-2.5 mt-1" style={{ color: '#a78bfa' }} />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Observação */}
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      Observação
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Notas sobre este colaborador..."
                      value={form.observacao}
                      onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
                      style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)', color: 'var(--text-primary)' }}
                    />
                  </div>
                </div>

                {/* Footer */}
                <div
                  className="flex items-center justify-end gap-3 px-6 py-4"
                  style={{ borderTop: '1px solid var(--tint-08)' }}
                >
                  <button
                    onClick={() => setShowFormModal(false)}
                    className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                    style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)', color: 'var(--text-secondary)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--tint-10)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--tint-06)')}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, #1d6fd8, #4a9ede)', boxShadow: '0 4px 14px rgba(74,158,222,0.35)' }}
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    {editingColaborador ? 'Salvar Alterações' : 'Criar Colaborador'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* ── Import modal ── */}
      {mounted && createPortal(
        <AnimatePresence>
          {showImportModal && (
            <div className="fixed inset-0 z-[9000] flex items-center justify-center px-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0"
                style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
                onClick={closeImportModal}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.94, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: 20 }}
                transition={{ type: 'spring', damping: 24, stiffness: 260 }}
                className="relative w-full max-w-2xl max-h-[90vh] flex flex-col"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 20,
                  boxShadow: 'var(--shadow-raised)',
                  color: 'var(--text-primary)',
                }}
                onClick={e => e.stopPropagation()}
              >
                <span
                  className="absolute top-0 left-0 right-0 h-[2px] rounded-t-[20px] pointer-events-none"
                  style={{ background: 'linear-gradient(90deg, transparent, rgba(74,158,222,0.7), transparent)' }}
                />
                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-6 pb-4" style={{ borderBottom: '1px solid var(--tint-08)' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(74,158,222,0.15)' }}>
                      <Upload className="w-4 h-4" style={{ color: '#4a9ede' }} />
                    </div>
                    <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Importar Colaboradores</h2>
                  </div>
                  <button
                    onClick={closeImportModal}
                    className="p-2 rounded-lg transition-all"
                    style={{ color: 'var(--text-tertiary)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--tint-08)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Steps indicator */}
                <div className="flex items-center gap-2 px-6 py-3" style={{ borderBottom: '1px solid var(--tint-06)' }}>
                  {[1, 2, 3].map(step => (
                    <div key={step} className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{
                          background: importStep >= step ? 'linear-gradient(135deg, #1d6fd8, #4a9ede)' : 'var(--tint-06)',
                          color: importStep >= step ? '#fff' : 'var(--text-tertiary)',
                        }}
                      >
                        {step}
                      </div>
                      <span className="text-xs" style={{ color: importStep === step ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                        {step === 1 ? 'Arquivo' : step === 2 ? 'Pré-visualização' : 'Resultado'}
                      </span>
                      {step < 3 && <div className="w-8 h-px mx-1" style={{ background: 'var(--tint-08)' }} />}
                    </div>
                  ))}
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 scrollbar-dark">
                  {importStep === 1 && (
                    <div className="flex flex-col items-center gap-4">
                      <div
                        className="w-full rounded-xl flex flex-col items-center justify-center gap-3 py-12 cursor-pointer transition-all"
                        style={{ border: '2px dashed var(--tint-15)', background: 'var(--tint-04)' }}
                        onClick={() => document.getElementById('colabFileInput')?.click()}
                        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#4a9ede'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--tint-15)'; }}
                      >
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(74,158,222,0.12)' }}>
                          <FileUp className="w-7 h-7" style={{ color: '#4a9ede' }} />
                        </div>
                        <div className="text-center">
                          <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Clique para selecionar arquivo</p>
                          <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>CSV ou XLSX · Colunas: nome, telefone, email, endereço, função, observação, regiões</p>
                        </div>
                        <input
                          id="colabFileInput"
                          type="file"
                          accept=".csv,.xlsx,.xls"
                          className="hidden"
                          onChange={handleFileChange}
                        />
                      </div>
                      <div className="w-full rounded-xl p-4 text-sm" style={{ background: 'var(--tint-04)', border: '1px solid var(--tint-08)' }}>
                        <p className="font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Dicas de formatação:</p>
                        <ul className="space-y-1" style={{ color: 'var(--text-tertiary)' }}>
                          <li>• Coluna <code className="px-1 rounded" style={{ background: 'var(--tint-10)' }}>nome</code> ou <code className="px-1 rounded" style={{ background: 'var(--tint-10)' }}>nome completo</code> é obrigatória</li>
                          <li>• <code className="px-1 rounded" style={{ background: 'var(--tint-10)' }}>celular</code> / <code className="px-1 rounded" style={{ background: 'var(--tint-10)' }}>telefone</code> → campo Telefone</li>
                          <li>• <code className="px-1 rounded" style={{ background: 'var(--tint-10)' }}>cidade</code> → Regiões de atuação (RA do DF)</li>
                          <li>• <code className="px-1 rounded" style={{ background: 'var(--tint-10)' }}>apelido</code> → Observação</li>
                          <li>• Linhas de título antes do cabeçalho são ignoradas automaticamente</li>
                        </ul>
                      </div>
                      {importError && (
                        <div className="w-full flex items-center gap-2 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          {importError}
                        </div>
                      )}
                    </div>
                  )}

                  {importStep === 2 && (
                    <div className="space-y-4">
                      {/* Row count + column detection status */}
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          {totalImportRows} linha{totalImportRows !== 1 ? 's' : ''} detectada{totalImportRows !== 1 ? 's' : ''}
                          {totalImportRows > 10 && <span style={{ color: 'var(--text-tertiary)' }}> · exibindo as 10 primeiras</span>}
                        </p>
                        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          {importHeaders.length} coluna{importHeaders.length !== 1 ? 's' : ''} no arquivo
                        </span>
                      </div>

                      {/* Column detection summary */}
                      {importCols.nome ? (
                        <div className="rounded-xl p-3" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
                          <p className="text-xs font-semibold mb-2" style={{ color: '#22c55e' }}>Colunas reconhecidas automaticamente:</p>
                          <div className="flex flex-wrap gap-2">
                            {(Object.entries(importCols) as [keyof DetectedColabCols, string][]).map(([field, col]) =>
                              col ? (
                                <span key={field} className="text-[11px] px-2.5 py-1 rounded-full font-medium" style={{ background: 'rgba(74,158,222,0.12)', color: '#4a9ede', border: '1px solid rgba(74,158,222,0.2)' }}>
                                  {field} → <span style={{ color: 'var(--text-secondary)' }}>{col}</span>
                                </span>
                              ) : null
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2 rounded-xl px-4 py-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#ef4444' }} />
                          <div>
                            <p className="text-sm font-semibold" style={{ color: '#ef4444' }}>Coluna "nome" não reconhecida</p>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                              Verifique os cabeçalhos da planilha. O sistema busca colunas com "nome" ou "name" no título.
                              Colunas encontradas: {importHeaders.join(', ')}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Preview table — shows ALL file columns */}
                      {importHeaders.length > 0 && (
                        <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--tint-08)' }}>
                          <table className="w-full text-xs">
                            <thead style={{ background: 'var(--tint-06)' }}>
                              <tr>
                                {importHeaders.slice(0, 7).map(h => {
                                  const detectedAs = (Object.entries(importCols) as [string, string][]).find(([, v]) => v === h)?.[0];
                                  return (
                                    <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                                      {h}
                                      {detectedAs && (
                                        <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase" style={{ background: 'rgba(74,158,222,0.15)', color: '#4a9ede' }}>
                                          {detectedAs}
                                        </span>
                                      )}
                                    </th>
                                  );
                                })}
                                {importHeaders.length > 7 && (
                                  <th className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--text-tertiary)' }}>
                                    +{importHeaders.length - 7} col.
                                  </th>
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {importPreview.map((row, i) => (
                                <tr key={i} style={{ borderTop: '1px solid var(--tint-06)' }}>
                                  {importHeaders.slice(0, 7).map(h => (
                                    <td key={h} className="px-3 py-2 max-w-[150px] truncate" style={{ color: 'var(--text-primary)' }}>
                                      {row[h] || <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                                    </td>
                                  ))}
                                  {importHeaders.length > 7 && <td className="px-3 py-2" />}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {importError && (
                        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          {importError}
                        </div>
                      )}
                    </div>
                  )}

                  {importStep === 3 && importResult && (
                    <div className="flex flex-col items-center justify-center gap-4 py-8">
                      {importResult.imported > 0 ? (
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.15)' }}>
                          <CheckCircle2 className="w-8 h-8" style={{ color: '#22c55e' }} />
                        </div>
                      ) : (
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.15)' }}>
                          <AlertCircle className="w-8 h-8" style={{ color: '#ef4444' }} />
                        </div>
                      )}
                      <div className="text-center">
                        <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                          {importResult.imported > 0 ? 'Importação concluída!' : 'Nenhum registro importado'}
                        </p>
                        <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
                          {importResult.imported} importado{importResult.imported !== 1 ? 's' : ''}
                          {importResult.errors > 0 && ` · ${importResult.errors} erro${importResult.errors !== 1 ? 's' : ''}`}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div
                  className="flex items-center justify-end gap-3 px-6 py-4"
                  style={{ borderTop: '1px solid var(--tint-08)' }}
                >
                  {importStep === 1 && (
                    <button
                      onClick={closeImportModal}
                      className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                      style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)', color: 'var(--text-secondary)' }}
                    >
                      Cancelar
                    </button>
                  )}
                  {importStep === 2 && (
                    <>
                      <button
                        onClick={() => setImportStep(1)}
                        className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                        style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)', color: 'var(--text-secondary)' }}
                      >
                        Voltar
                      </button>
                      <button
                        onClick={handleImport}
                        disabled={importing || !importCols.nome}
                        className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50"
                        style={{ background: 'linear-gradient(135deg, #1d6fd8, #4a9ede)', boxShadow: '0 4px 14px rgba(74,158,222,0.35)' }}
                        title={!importCols.nome ? 'Coluna "nome" não detectada — verifique os cabeçalhos da planilha' : ''}
                      >
                        {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                        Importar {allImportRows.length} colaborador{allImportRows.length !== 1 ? 'es' : ''}
                      </button>
                    </>
                  )}
                  {importStep === 3 && (
                    <button
                      onClick={closeImportModal}
                      className="px-5 py-2 rounded-xl text-sm font-bold text-white"
                      style={{ background: 'linear-gradient(135deg, #1d6fd8, #4a9ede)' }}
                    >
                      Fechar
                    </button>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* ── Delete confirmation ── */}
      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Remover colaborador"
        message="Esta ação não pode ser desfeita. O colaborador será permanentemente removido."
        confirmLabel="Remover"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
