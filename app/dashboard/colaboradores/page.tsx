'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  Users2, Plus, Trash2, Loader2, X, Search, FileUp, Upload,
  CheckCircle2, AlertCircle, Pencil,
  Phone, MapPin, User, UserCheck, UserX, ChevronDown,
  Send, Mail, MessageCircle, AtSign, Copy, Check, MessageSquare, ExternalLink,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PERMISSIONS, hasPermission } from '@/lib/permissions';
import GradientCard from '@/components/charts/gradient-card';

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
  padrinho: { id: string; nome: string; cargo: string; partido: string } | null;
  observacao: string | null;
  status: 'ATIVO' | 'INATIVO';
  regioes: ColaboradorRegiao[];
  createdAt: string;
}

interface Padrinho {
  id: string;
  nome: string;
  cargo: string;
  partido: string;
  cor?: string;
  _count: { colaboradores: number };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DF_ZONAS = [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21];

// Approximate geographic centers of each DF electoral zone
const DF_ZONA_COORDS: Record<number, [number, number]> = {
  1:  [-15.7941, -47.8822],  // Plano Piloto / Asa Sul
  2:  [-15.7229, -47.8816],  // Asa Norte / Lago Norte
  3:  [-15.7942, -47.9372],  // Cruzeiro / Sudoeste
  4:  [-15.8316, -48.0554],  // Taguatinga
  5:  [-15.8150, -48.1005],  // Ceilândia Norte
  6:  [-15.8501, -48.1009],  // Ceilândia Sul
  8:  [-15.8831, -48.0810],  // Samambaia
  9:  [-15.8600, -47.9850],  // Lago Sul / Riacho Fundo
  10: [-15.8314, -47.9813],  // Guará
  11: [-16.0202, -48.0196],  // Santa Maria
  13: [-15.6189, -47.6540],  // Planaltina
  14: [-15.6524, -47.7910],  // Sobradinho
  15: [-16.0177, -48.0629],  // Gama
  16: [-15.6731, -48.2038],  // Brazlândia
  17: [-15.9112, -48.0609],  // Recanto das Emas
  18: [-15.9098, -47.8028],  // São Sebastião
  19: [-15.7672, -47.7540],  // Paranoá / Itapoã
  20: [-15.8400, -48.0272],  // Águas Claras / Vicente Pires
  21: [-15.7494, -47.9300],  // Estrutural / Varjão
};

const DF_ZONA_NOMES: Record<number, string> = {
  1:  'Plano Piloto / Asa Sul',
  2:  'Asa Norte / Lago Norte',
  3:  'Cruzeiro / Sudoeste',
  4:  'Taguatinga',
  5:  'Ceilândia Norte',
  6:  'Ceilândia Sul',
  8:  'Samambaia',
  9:  'Lago Sul / Riacho Fundo',
  10: 'Guará',
  11: 'Santa Maria',
  13: 'Planaltina',
  14: 'Sobradinho',
  15: 'Gama',
  16: 'Brazlândia',
  17: 'Recanto das Emas',
  18: 'São Sebastião',
  19: 'Paranoá / Itapoã',
  20: 'Águas Claras / Vicente Pires',
  21: 'Estrutural / Varjão',
};

function getZoneMarkerHtml(zona: number, count: number, isSelected: boolean): string {
  const size = 36;
  const bg = isSelected
    ? 'linear-gradient(135deg,#6d28d9,#a78bfa)'
    : count === 0
      ? 'rgba(109,40,217,0.52)'
      : 'linear-gradient(135deg,#6d28d9,#8b5cf6)';
  const border = isSelected ? '#c4b5fd' : count === 0 ? 'rgba(167,139,250,0.55)' : '#a78bfa';
  return `<div style="
    width:${size}px;height:${size}px;border-radius:50%;
    background:${bg};border:2px solid ${border};
    display:flex;align-items:center;justify-content:center;
    color:#fff;font-weight:700;font-size:11px;font-family:system-ui,sans-serif;
    box-shadow:0 2px 8px rgba(0,0,0,0.28);cursor:pointer;
    transform:translate(-50%,-50%);
  ">${zona}</div>`;
}

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
  cor: '#8b5cf6',
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

// RAs oficiais do DF (normalizadas) — usadas para filtrar contagem no stat card
const DF_RAS_OFICIAIS = new Set([
  'PLANO PILOTO','BRASILIA','ASA SUL','ASA NORTE','LAGO SUL','LAGO NORTE',
  'CRUZEIRO','SUDOESTE','OCTOGONAL','SUDOESTE E OCTOGONAL',
  'TAGUATINGA','CEILANDIA','CEILANDIA NORTE','CEILANDIA SUL',
  'SAMAMBAIA','NUCLEO BANDEIRANTE','RIACHO FUNDO','RIACHO FUNDO II',
  'GUARA','PARK WAY','SIA','SANTA MARIA',
  'PLANALTINA','ARAPOANGA','FERCAL',
  'SOBRADINHO','SOBRADINHO II','GAMA','BRAZLANDIA',
  'RECANTO DAS EMAS','SAO SEBASTIAO','JARDIM BOTANICO',
  'SOL NASCENTE','SOL NASCENTE/POR DO SOL',
  'PARANOA','ITAPOA','AGUAS CLARAS','VICENTE PIRES',
  'ESTRUTURAL','SCIA','VARJAO','CANDANGOLANDIA',
]);

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
  padrinho: string;
}

function detectColabColumns(headers: string[]): DetectedColabCols {
  const result: DetectedColabCols = { nome: '', telefone: '', email: '', endereco: '', funcao: '', observacao: '', regioes: '', padrinho: '' };
  for (const h of headers) {
    const n = normStr(h);
    if (!result.nome && /nome|name/.test(n)) result.nome = h;
    else if (!result.telefone && /telefone|celular|whatsapp|fone|phone/.test(n)) result.telefone = h;
    else if (!result.email && /email/.test(n)) result.email = h;
    else if (!result.endereco && /endereco|rua|logradouro|address/.test(n)) result.endereco = h;
    else if (!result.funcao && /funcao|cargo|role|funcoes/.test(n)) result.funcao = h;
    else if (!result.observacao && /observacao|obs|notas|notes|apelido|alcunha|alias/.test(n)) result.observacao = h;
    else if (!result.regioes && /regiao|regioes|region|regions|\bra\b|cidade|city/.test(n)) result.regioes = h;
    else if (!result.padrinho && /padrinho|apadrinhado|sponsor|godfather/.test(n)) result.padrinho = h;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Leaflet map — defined inline; dynamic import of Leaflet happens inside
// via useEffect so SSR is never triggered (no top-level import 'leaflet').
// ---------------------------------------------------------------------------

interface ColaboradoresMapProps {
  regioes: string[];
  colaboradoresByRegiao: Record<string, Colaborador[]>;
  colaboradores: Colaborador[];
  selectedRegiao: string | null;
  selectedColaboradorId: string | null;
  onRegiaoClick: (nome: string) => void;
  height?: string;
}

// ---------------------------------------------------------------------------
// Zonas electoral map — Leaflet map with zone markers
// ---------------------------------------------------------------------------
interface ZonasMapProps {
  colaboradoresByZona: Record<number, Colaborador[]>;
  selectedZona: number | null;
  onZonaClick: (zona: number) => void;
}

function ZonasMapInner({ colaboradoresByZona, selectedZona, onZonaClick }: ZonasMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<Record<number, any>>({});
  const isInitRef = useRef(false);

  const colabRef = useRef(colaboradoresByZona);
  const selectedRef = useRef(selectedZona);
  const onClickRef = useRef(onZonaClick);

  useEffect(() => { colabRef.current = colaboradoresByZona; }, [colaboradoresByZona]);
  useEffect(() => { selectedRef.current = selectedZona; }, [selectedZona]);
  useEffect(() => { onClickRef.current = onZonaClick; }, [onZonaClick]);

  useEffect(() => {
    if (!mapRef.current || isInitRef.current) return;
    isInitRef.current = true;
    let cancelled = false;

    const initMap = async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !mapRef.current) { isInitRef.current = false; return; }

      if (mapInstanceRef.current) {
        try { mapInstanceRef.current.remove(); } catch (_) {}
        mapInstanceRef.current = null;
        markersRef.current = {};
      }

      const map = L.map(mapRef.current, {
        center: [-15.8267, -48.0],
        zoom: 10,
        zoomControl: true,
        scrollWheelZoom: true,
        attributionControl: true,
      });
      mapInstanceRef.current = map;

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map);

      DF_ZONAS.forEach(zona => {
        const coords = DF_ZONA_COORDS[zona];
        if (!coords) return;
        const count = (colabRef.current[zona] ?? []).length;
        const isSelected = selectedRef.current === zona;

        const icon = L.divIcon({
          html: getZoneMarkerHtml(zona, count, isSelected),
          className: '',
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        });

        const marker = L.marker(coords, { icon })
          .addTo(map)
          .on('click', () => onClickRef.current(zona));

        marker.bindTooltip(
          `Zona ${zona} · ${count} colaborador${count !== 1 ? 'es' : ''}`,
          { direction: 'top', offset: [0, -20], opacity: 0.95 }
        );

        markersRef.current[zona] = marker;
      });

      // Force redraw after CSS layout settles
      setTimeout(() => { if (!cancelled) map.invalidateSize(); }, 150);
      setTimeout(() => { if (!cancelled) map.invalidateSize(); }, 500);

      // Keep in sync with container resize (responsive layout)
      if (typeof ResizeObserver !== 'undefined' && mapRef.current) {
        const ro = new ResizeObserver(() => { if (!cancelled) map.invalidateSize(); });
        ro.observe(mapRef.current);
      }

      isInitRef.current = false;
    };

    initMap().catch(() => { isInitRef.current = false; });

    return () => {
      cancelled = true;
      isInitRef.current = false;
      if (mapInstanceRef.current) {
        try { mapInstanceRef.current.remove(); } catch (_) {}
        mapInstanceRef.current = null;
        markersRef.current = {};
      }
    };
  }, []);

  // Update markers when collaborator data or selection changes
  useEffect(() => {
    if (Object.keys(markersRef.current).length === 0) return;
    import('leaflet').then(({ default: L }) => {
      DF_ZONAS.forEach(zona => {
        const marker = markersRef.current[zona];
        if (!marker) return;
        const count = (colaboradoresByZona[zona] ?? []).length;
        marker.setIcon(L.divIcon({
          html: getZoneMarkerHtml(zona, count, selectedZona === zona),
          className: '',
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        }));
        marker.setTooltipContent(`Zona ${zona} · ${count} colaborador${count !== 1 ? 'es' : ''}`);
      });
    });
  }, [colaboradoresByZona, selectedZona]);

  return (
    <div ref={mapRef} className="w-full h-full" style={{ background: '#f0f4f8' }} />
  );
}

// ---------------------------------------------------------------------------
// RA polygon map
// ---------------------------------------------------------------------------
function ColaboradoresMapInner({
  colaboradoresByRegiao,
  colaboradores,
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
  const colabsRef = useRef(colaboradores);
  const colabsByRegioRef = useRef(colaboradoresByRegiao);
  const selectedRef = useRef(selectedRegiao);
  const onClickRef = useRef(onRegiaoClick);
  const drawPinsRef = useRef<(() => void) | null>(null);

  useEffect(() => { colabsRef.current = colaboradores; }, [colaboradores]);
  useEffect(() => { colabsByRegioRef.current = colaboradoresByRegiao; }, [colaboradoresByRegiao]);
  useEffect(() => { selectedRef.current = selectedRegiao; }, [selectedRegiao]);
  useEffect(() => { onClickRef.current = onRegiaoClick; }, [onRegiaoClick]);

  useEffect(() => {
    fetch('/geojson/df-regioes-administrativas.geojson')
      .then(r => r.json())
      .then(d => { setGeoData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const getRegionStyle = useCallback((_nome: string, isSelected: boolean) => {
    if (isSelected) {
      return { fillColor: '#fff7ed', fillOpacity: 0.28, color: '#f97316', weight: 2.5, opacity: 1 };
    }
    return { fillColor: 'transparent', fillOpacity: 0, color: 'rgba(80,100,120,0.45)', weight: 0.8, opacity: 1 };
  }, []);

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
            for (const [k, v] of Object.entries(colabsByRegioRef.current)) {
              if (normalizeRegiao(k) === norm) { colabs = v as Colaborador[]; break; }
            }
            const isSelected = selectedRef.current
              ? normalizeRegiao(nome) === normalizeRegiao(selectedRef.current)
              : false;
            if (!isSelected) {
              layer.setStyle({ fillOpacity: 0.1, fillColor: '#fbbf24', weight: 2, color: '#fbbf24', opacity: 0.9 });
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

      // ── Individual pins — one per collaborator ──
      const pinsPane = map.createPane('pinsPane');
      pinsPane.style.zIndex = '350';

      const pinMarkers: any[] = [];

      // Deterministic jitter so same collaborator always lands at same offset
      const jitterForId = (id: string, scale: number): [number, number] => {
        let h = 0;
        for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
        return [
          ((h & 0xff) / 255 - 0.5) * scale,
          (((h >> 8) & 0xff) / 255 - 0.5) * scale,
        ];
      };

      const drawPins = () => {
        pinMarkers.forEach(m => { try { m.remove(); } catch (_) {} });
        pinMarkers.length = 0;

        for (const c of colabsRef.current) {
          let lat: number | null = null;
          let lng: number | null = null;

          if (c.lat && c.lng) {
            lat = c.lat;
            lng = c.lng;
          } else {
            const zona = c.regioes.find((r: any) => r.tipo === 'ZONA');
            if (zona) {
              const num = parseInt(zona.regiaoNome.replace('Zona ', ''), 10);
              const coords = DF_ZONA_COORDS[num];
              if (coords) {
                const [jx, jy] = jitterForId(c.id, 0.028);
                lat = coords[0] + jx;
                lng = coords[1] + jy;
              }
            }
          }

          if (lat === null || lng === null) continue;

          const markerCor = (c as any).cor || '#8b5cf6';
          const marker = L.circleMarker([lat, lng] as [number, number], {
            radius: 4,
            fillColor: markerCor,
            fillOpacity: 0.88,
            color: '#00000066',
            weight: 1,
            interactive: true,
            pane: 'pinsPane',
          } as any);

          marker.bindTooltip(c.nome, { direction: 'top', offset: [0, -5], opacity: 0.95 });
          marker.addTo(map);
          pinMarkers.push(marker);
        }
      };

      drawPinsRef.current = drawPins;
      drawPins();

      // Keep in sync with container resize
      if (typeof ResizeObserver !== 'undefined' && mapRef.current) {
        const ro = new ResizeObserver(() => {
          if (!cancelled) map.invalidateSize({ animate: false });
        });
        ro.observe(mapRef.current);
      }

      isInitRef.current = false;
    };

    initMap().catch(() => { isInitRef.current = false; });
    return () => {
      cancelled = true;
      isInitRef.current = false;
      drawPinsRef.current = null;
      if (mapInstanceRef.current) {
        try { mapInstanceRef.current.remove(); } catch (_) {}
        mapInstanceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoData]);

  // Update polygon borders and heat canvas when data or selection changes
  useEffect(() => {
    const geoLayer = geoLayerRef.current;
    if (geoLayer) {
      geoLayer.eachLayer((l: any) => {
        const nome = l.feature?.properties?.nome || '';
        const isSelected = selectedRegiao
          ? normalizeRegiao(nome) === normalizeRegiao(selectedRegiao)
          : false;
        l.setStyle(getRegionStyle(nome, isSelected));
        if (isSelected) { l.bringToFront(); selectedLayerRef.current = l; }
      });
    }
    drawPinsRef.current?.();
  }, [colaboradores, selectedRegiao, getRegionStyle]);

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center rounded-xl" style={{ height, background: 'var(--bg-card-subtle)', minHeight: 400 }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#4a9ede' }} />
      </div>
    );
  }

  return (
    <div className="relative w-full h-full isolate" style={{ minHeight: 320 }}>
      <div
        ref={mapRef}
        className="w-full h-full rounded-xl overflow-hidden"
        style={{ background: '#f0f4f8' }}
      />
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
  const [padrinhos, setPadrinhos] = useState<Padrinho[]>([]);
  const [padrinhoSearch, setPadrinhoSearch] = useState('');
  const [showNovoPadrinho, setShowNovoPadrinho] = useState(false);
  const [openFuncaoDropdown, setOpenFuncaoDropdown] = useState(false);
  const [novoPadrinho, setNovoPadrinho] = useState({ nome: '', cargo: '', partido: '', cor: '#8b5cf6' });
  const [savingPadrinho, setSavingPadrinho] = useState(false);

  // ── UI state ──
  const [dfVisualizacao, setDfVisualizacao] = useState<'regioes' | 'zonas'>('regioes');
  const [districtSearch, setDistrictSearch] = useState('');
  const [showDistrictSuggestions, setShowDistrictSuggestions] = useState(false);
  const districtSearchRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'ATIVO' | 'INATIVO'>('TODOS');
  const [selectedColaboradorId, setSelectedColaboradorId] = useState<string | null>(null);
  const [selectedRegiao, setSelectedRegiao] = useState<string | null>(null);
  const [selectedZona, setSelectedZona] = useState<number | null>(null);
  const [selectedPadrinhoFilter, setSelectedPadrinhoFilter] = useState<string | null>(null);

  // ── Modals ──
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingColaborador, setEditingColaborador] = useState<Colaborador | null>(null);
  const [formRegiaoTab, setFormRegiaoTab] = useState<'ra' | 'zona'>('ra');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showPadrinhosModal, setShowPadrinhosModal] = useState(false);
  const [confirmDeletePadrinhoId, setConfirmDeletePadrinhoId] = useState<string | null>(null);
  const [deletingPadrinho, setDeletingPadrinho] = useState(false);
  const [editingPadrinho, setEditingPadrinho] = useState<Padrinho | null>(null);
  const [editPadrinhoForm, setEditPadrinhoForm] = useState({ nome: '', cargo: '', partido: '', cor: '#8b5cf6' });
  const [savingEditPadrinho, setSavingEditPadrinho] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [viewingColaborador, setViewingColaborador] = useState<Colaborador | null>(null);
  const [colabMsgText, setColabMsgText] = useState('');
  const [colabMsgStatus, setColabMsgStatus] = useState<'idle' | 'sending' | 'ok' | 'err'>('idle');
  const [colabMsgError, setColabMsgError] = useState('');

  // ── Bulk messaging ──
  const [selectedColabIds, setSelectedColabIds] = useState<Set<string>>(new Set());
  const [showBulkMsg, setShowBulkMsg] = useState(false);
  const [bulkMsgText, setBulkMsgText] = useState('');
  const [bulkSendingApi, setBulkSendingApi] = useState(false);
  const [bulkSendStatus, setBulkSendStatus] = useState<Record<string, 'idle' | 'sending' | 'ok' | 'err'>>({});
  const [bulkSendErrors, setBulkSendErrors] = useState<Record<string, string>>({});
  const [bulkCopied, setBulkCopied] = useState(false);

  // ── Modal de disparo ──
  const [showMsgModal, setShowMsgModal] = useState(false);
  const [msgStep, setMsgStep] = useState<1 | 2>(1);
  const [msgFilter, setMsgFilter] = useState<'regiao' | 'padrinho'>('regiao');
  const [msgFilterRegiaoTab, setMsgFilterRegiaoTab] = useState<'ra' | 'zona'>('ra');
  const [msgFilterRegioes, setMsgFilterRegioes] = useState<string[]>([]);
  const [msgFilterPadrinhoId, setMsgFilterPadrinhoId] = useState<string | null>(null);
  const [msgText, setMsgText] = useState('');
  const [msgSendingApi, setMsgSendingApi] = useState(false);
  const [msgSendStatus, setMsgSendStatus] = useState<Record<string, 'idle' | 'sending' | 'ok' | 'err'>>({});
  const [msgSendErrors, setMsgSendErrors] = useState<Record<string, string>>({});

  // ── Form state ──
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  // ── Import state ──
  const [importStep, setImportStep] = useState<1 | 2 | 3>(1);
  const [importPreview, setImportPreview] = useState<Array<Record<string, string>>>([]);
  const [allImportRows, setAllImportRows] = useState<Array<Record<string, string>>>([]);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importCols, setImportCols] = useState<DetectedColabCols>({ nome: '', telefone: '', email: '', endereco: '', funcao: '', observacao: '', regioes: '', padrinho: '' });
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

  const fetchPadrinhos = useCallback(async () => {
    try {
      const res = await fetch('/api/padrinhos');
      if (res.ok) setPadrinhos(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchColaboradores();
      fetchPadrinhos();
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

  // close district search dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (districtSearchRef.current && !districtSearchRef.current.contains(e.target as Node)) {
        setShowDistrictSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Derived data ──
  // Base list respects padrinho filter for map heat and zone counts
  const baseColaboradores = useMemo(() =>
    selectedPadrinhoFilter
      ? colaboradores.filter(c => c.padrinhoId === selectedPadrinhoFilter)
      : colaboradores,
    [colaboradores, selectedPadrinhoFilter]
  );

  const colaboradoresByRegiao = useMemo(() => {
    const map: Record<string, Colaborador[]> = {};
    for (const c of baseColaboradores) {
      for (const r of c.regioes) {
        if (r.tipo !== 'RA') continue;
        if (!map[r.regiaoNome]) map[r.regiaoNome] = [];
        map[r.regiaoNome].push(c);
      }
    }
    return map;
  }, [baseColaboradores]);

  const colaboradoresByZona = useMemo(() => {
    const map: Record<number, Colaborador[]> = {};
    for (const c of baseColaboradores) {
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
  }, [baseColaboradores]);

  const regioesCobertasCount = useMemo(() => {
    const nomes = new Set<string>();
    for (const c of colaboradores) {
      for (const r of c.regioes) {
        if (r.tipo === 'RA' && DF_RAS_OFICIAIS.has(normalizeRegiao(r.regiaoNome))) {
          nomes.add(normalizeRegiao(r.regiaoNome));
        }
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
    if (selectedPadrinhoFilter) list = list.filter(c => c.padrinhoId === selectedPadrinhoFilter);
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
  }, [colaboradores, selectedPadrinhoFilter, selectedRegiao, selectedZona, statusFilter, search]);

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

  const msgRecipients = useMemo(() => {
    let list: Colaborador[] = [];
    if (msgFilter === 'padrinho' && msgFilterPadrinhoId) list = colaboradores.filter(c => c.padrinhoId === msgFilterPadrinhoId);
    else if (msgFilter === 'regiao' && msgFilterRegioes.length > 0) {
      const normalizedSelected = msgFilterRegioes.map(r => normalizeRegiao(r));
      list = colaboradores.filter(c => c.regioes.some(r => normalizedSelected.includes(normalizeRegiao(r.regiaoNome))));
    }
    return list.filter(c => c.telefone);
  }, [msgFilter, msgFilterRegioes, msgFilterPadrinhoId, colaboradores]);

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
      cor: (c as any).cor ?? '#8b5cf6',
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
        cor: form.cor || '#8b5cf6',
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
      setShowNovoPadrinho(false);
      setNovoPadrinho({ nome: '', cargo: '', partido: '', cor: '#8b5cf6' });
      setPadrinhoSearch('');
      fetchColaboradores();
    } catch {
      toast.error('Erro ao salvar colaborador');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/colaboradores/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao deletar');
      toast.success('Colaborador removido');
      setConfirmDeleteId(null);
      if (selectedColaboradorId === id) setSelectedColaboradorId(null);
      fetchColaboradores();
    } catch {
      toast.error('Erro ao remover colaborador');
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    const ids = Array.from(selectedColabIds);
    let errors = 0;
    await Promise.all(
      ids.map(async id => {
        try {
          const res = await fetch(`/api/colaboradores/${id}`, { method: 'DELETE' });
          if (!res.ok) errors++;
        } catch {
          errors++;
        }
      })
    );
    setBulkDeleting(false);
    setConfirmBulkDelete(false);
    setSelectedColabIds(new Set());
    if (selectedColaboradorId && ids.includes(selectedColaboradorId)) setSelectedColaboradorId(null);
    if (errors === 0) toast.success(`${ids.length} colaborador(es) removido(s)`);
    else toast.error(`${errors} erro(s) ao remover colaboradores`);
    fetchColaboradores();
  };

  function normalizeWA(n: string): string {
    const d = n.replace(/\D/g, '');
    if (d.startsWith('55') && d.length >= 12) return d;
    if (d.length >= 10) return `55${d}`;
    return d;
  }

  const handleSendColabMsg = async () => {
    if (!viewingColaborador?.telefone || !colabMsgText.trim() || colabMsgStatus === 'sending') return;
    setColabMsgStatus('sending');
    setColabMsgError('');
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero: viewingColaborador.telefone, message: colabMsgText }),
      });
      const data = await res.json();
      if (res.ok) {
        setColabMsgStatus('ok');
        setColabMsgText('');
        toast.success('Mensagem enviada!');
      } else {
        setColabMsgStatus('err');
        setColabMsgError(data.error ?? 'Erro ao enviar');
      }
    } catch {
      setColabMsgStatus('err');
      setColabMsgError('Falha de rede');
    }
  };

  const handleRegionClick = (nome: string) => {
    const isToggleOff = normalizeRegiao(selectedRegiao ?? '') === normalizeRegiao(nome);
    setSelectedRegiao(isToggleOff ? null : nome);
    setSelectedColaboradorId(null);
    if (!isToggleOff) {
      const ids = Object.entries(colaboradoresByRegiao)
        .filter(([k]) => normalizeRegiao(k) === normalizeRegiao(nome))
        .flatMap(([, cs]) => cs.map(c => c.id));
      if (ids.length > 0) {
        setSelectedColabIds(prev => { const n = new Set(prev); ids.forEach(id => n.add(id)); return n; });
      }
    }
  };

  const clearRegionFilter = () => {
    setSelectedRegiao(null);
    setSelectedColaboradorId(null);
    setDistrictSearch('');
  };

  const handleZonaClick = (zona: number) => {
    const isToggleOff = selectedZona === zona;
    setSelectedZona(isToggleOff ? null : zona);
    setSelectedColaboradorId(null);
    if (!isToggleOff) {
      const ids = (colaboradoresByZona[zona] ?? []).map(c => c.id);
      if (ids.length > 0) {
        setSelectedColabIds(prev => { const n = new Set(prev); ids.forEach(id => n.add(id)); return n; });
      }
    }
  };

  const clearZonaFilter = () => {
    setSelectedZona(null);
    setSelectedColaboradorId(null);
    setDistrictSearch('');
  };

  // ── Bulk messaging ──
  const toggleColabSelection = (id: string) => {
    setSelectedColabIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const clearColabSelection = () => {
    setSelectedColabIds(new Set());
    setShowBulkMsg(false);
    setBulkSendStatus({});
    setBulkSendErrors({});
    setBulkMsgText('');
  };

  const selectAllFiltered = () => {
    setSelectedColabIds(prev => {
      const n = new Set(prev);
      filteredColaboradores.filter(c => c.telefone).forEach(c => n.add(c.id));
      return n;
    });
  };

  const handleBulkSend = async () => {
    if (!bulkMsgText.trim() || bulkSendingApi) return;
    const list = colaboradores.filter(c => selectedColabIds.has(c.id) && c.telefone);
    setBulkSendingApi(true);
    const statusMap: Record<string, 'idle' | 'sending' | 'ok' | 'err'> = {};
    const errMap: Record<string, string> = {};
    list.forEach(c => { statusMap[c.id] = 'idle'; });
    setBulkSendStatus({ ...statusMap });
    for (const c of list) {
      setBulkSendStatus(prev => ({ ...prev, [c.id]: 'sending' }));
      try {
        const res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ numero: c.telefone, message: bulkMsgText }),
        });
        const data = await res.json();
        if (res.ok) { statusMap[c.id] = 'ok'; }
        else { statusMap[c.id] = 'err'; errMap[c.id] = data.error ?? 'Erro desconhecido'; }
      } catch {
        statusMap[c.id] = 'err'; errMap[c.id] = 'Falha de rede';
      }
      setBulkSendStatus({ ...statusMap });
      setBulkSendErrors({ ...errMap });
      if (list.indexOf(c) < list.length - 1) await new Promise(r => setTimeout(r, 500));
    }
    setBulkSendingApi(false);
  };

  const openMsgModal = () => {
    setMsgStep(1);
    setMsgFilter('regiao');
    setMsgFilterRegiaoTab('ra');
    setMsgFilterRegioes([]);
    setMsgFilterPadrinhoId(null);
    setMsgText('');
    setMsgSendStatus({});
    setMsgSendErrors({});
    setMsgSendingApi(false);
    setShowMsgModal(true);
  };

  const handleMsgSend = async () => {
    if (!msgText.trim() || msgSendingApi || msgRecipients.length === 0) return;
    setMsgSendingApi(true);
    const statusMap: Record<string, 'idle' | 'sending' | 'ok' | 'err'> = {};
    const errMap: Record<string, string> = {};
    msgRecipients.forEach(c => { statusMap[c.id] = 'idle'; });
    setMsgSendStatus({ ...statusMap });
    for (const c of msgRecipients) {
      setMsgSendStatus(prev => ({ ...prev, [c.id]: 'sending' }));
      try {
        const res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ numero: c.telefone, message: msgText }),
        });
        const data = await res.json();
        if (res.ok) statusMap[c.id] = 'ok';
        else { statusMap[c.id] = 'err'; errMap[c.id] = data.error ?? 'Erro desconhecido'; }
      } catch {
        statusMap[c.id] = 'err'; errMap[c.id] = 'Falha de rede';
      }
      setMsgSendStatus({ ...statusMap });
      setMsgSendErrors({ ...errMap });
      if (msgRecipients.indexOf(c) < msgRecipients.length - 1) await new Promise(r => setTimeout(r, 500));
    }
    setMsgSendingApi(false);
  };

  const copyBulkNumbers = async () => {
    const nums = colaboradores
      .filter(c => selectedColabIds.has(c.id) && c.telefone)
      .map(c => normalizeWA(c.telefone!))
      .join('\n');
    await navigator.clipboard.writeText(nums);
    setBulkCopied(true);
    setTimeout(() => setBulkCopied(false), 2500);
  };

  const selectedColabList = useMemo(
    () => colaboradores.filter(c => selectedColabIds.has(c.id)),
    [colaboradores, selectedColabIds]
  );

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
        const FIELD_RE = /nome|name|celular|telefone|email|endereco|cidade|city|regiao|region|funcao|cargo|apelido|padrinho|id$/;
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
            padrinhoNome: importCols.padrinho ? row[importCols.padrinho]?.trim() : undefined,
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
    setImportCols({ nome: '', telefone: '', email: '', endereco: '', funcao: '', observacao: '', regioes: '', padrinho: '' });
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

  const handleCriarPadrinho = async () => {
    if (!novoPadrinho.nome.trim() || !novoPadrinho.cargo.trim() || !novoPadrinho.partido.trim()) {
      toast.error('Preencha Nome, Cargo e Partido do padrinho');
      return;
    }
    setSavingPadrinho(true);
    try {
      const res = await fetch('/api/padrinhos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...novoPadrinho, cor: novoPadrinho.cor || '#8b5cf6' }),
      });
      if (!res.ok) throw new Error();
      const criado: Padrinho = await res.json();
      setPadrinhos(prev => [...prev, criado].sort((a, b) => a.nome.localeCompare(b.nome)));
      setShowNovoPadrinho(false);
      setNovoPadrinho({ nome: '', cargo: '', partido: '', cor: '#8b5cf6' });
      toast.success('Padrinho criado!');
    } catch {
      toast.error('Erro ao criar padrinho');
    } finally {
      setSavingPadrinho(false);
    }
  };

  const handleDeletePadrinho = async (id: string) => {
    setDeletingPadrinho(true);
    try {
      const res = await fetch(`/api/padrinhos/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setPadrinhos(prev => prev.filter(p => p.id !== id));
      setConfirmDeletePadrinhoId(null);
      toast.success('Padrinho removido');
      fetchColaboradores();
    } catch {
      toast.error('Erro ao remover padrinho');
    } finally {
      setDeletingPadrinho(false);
    }
  };

  const handleSaveEditPadrinho = async () => {
    if (!editingPadrinho) return;
    setSavingEditPadrinho(true);
    try {
      const res = await fetch(`/api/padrinhos/${editingPadrinho.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editPadrinhoForm, cor: editPadrinhoForm.cor || '#8b5cf6' }),
      });
      if (!res.ok) throw new Error();
      const updated: Padrinho = await res.json();
      setPadrinhos(prev => prev.map(p => p.id === updated.id ? updated : p).sort((a, b) => a.nome.localeCompare(b.nome)));
      setEditingPadrinho(null);
      toast.success('Padrinho atualizado');
    } catch {
      toast.error('Erro ao atualizar padrinho');
    } finally {
      setSavingEditPadrinho(false);
    }
  };

  if (!mounted) return null;
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#4a9ede' }} />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* ── Header ── */}
      <PageHeader
        icon={Users2}
        title="Colaboradores"
        subtitle="Gerencie sua equipe por regiões administrativas do DF"
        actions={
          <div className="grid grid-cols-2 lg:flex items-center gap-2 w-full lg:w-auto">
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all duration-150"
              style={{
                background: 'linear-gradient(135deg, #15803d, #16a34a)',
                boxShadow: '0 4px 14px rgba(21,128,61,0.35)',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              <FileUp className="w-4 h-4" />
              Importar CSV
            </button>
            <button
              onClick={() => setShowPadrinhosModal(true)}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150"
              style={{
                background: 'rgba(109,40,217,0.12)',
                border: '1px solid rgba(109,40,217,0.35)',
                color: '#8b5cf6',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(109,40,217,0.2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(109,40,217,0.12)')}
            >
              <User className="w-4 h-4" />
              Padrinhos
              {padrinhos.length > 0 && (
                <span className="ml-0.5 text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(109,40,217,0.2)' }}>
                  {padrinhos.length}
                </span>
              )}
            </button>
            <button
              onClick={openMsgModal}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all duration-150"
              style={{ background: 'linear-gradient(135deg, #128c7e, #25d366)', boxShadow: '0 4px 14px rgba(37,211,102,0.3)' }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              <MessageSquare className="w-4 h-4" />
              Disparar Mensagem
            </button>
            <button
              onClick={openNew}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all duration-150"
              style={{ background: 'linear-gradient(135deg, #1d6fd8, #4a9ede)', boxShadow: '0 4px 14px rgba(74,158,222,0.35)' }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              <Plus className="w-4 h-4" />
              Novo Colaborador
            </button>
          </div>
        }
      />

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <GradientCard
          title="Total"
          value={loading ? '—' : colaboradores.length}
          subtitle="Colaboradores cadastrados"
          icon={Users2}
          gradient="blue"
          delay={0.05}
        />
        <GradientCard
          title="RAs cobertas"
          value={loading ? '—' : `${regioesCobertasCount} / 33`}
          subtitle="Regiões administrativas"
          icon={MapPin}
          gradient="teal"
          delay={0.1}
        />
        <GradientCard
          title="Zonas cobertas"
          value={loading ? '—' : `${zonasCobertasCount} / 19`}
          subtitle="Zonas eleitorais do DF"
          icon={MapPin}
          gradient="purple"
          delay={0.15}
        />
        <GradientCard
          title="Ativos"
          value={loading ? '—' : ativosCount}
          subtitle="Colaboradores ativos"
          icon={UserCheck}
          gradient="orange"
          delay={0.2}
        />
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Left sidebar */}
        <div
          className="colabs-sidebar lg:col-span-1 rounded-xl flex flex-col gap-3 p-4 h-[60vh] lg:h-[calc(100vh-203px)]"
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

          {/* Padrinho active filter indicator */}
          {selectedPadrinhoFilter && (() => {
            const p = padrinhos.find(x => x.id === selectedPadrinhoFilter);
            return (
              <div
                className="rounded-xl px-3 py-2.5"
                style={{ background: 'linear-gradient(135deg, #4c1d95, #6d28d9)', border: '1px solid rgba(167,139,250,0.4)', boxShadow: '0 0 12px rgba(109,40,217,0.35)' }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(221,214,254,0.7)' }}>
                    Filtrando por padrinho
                  </span>
                  <button onClick={() => setSelectedPadrinhoFilter(null)} title="Remover filtro" className="flex-shrink-0 rounded-md p-0.5 transition-colors hover:bg-white/10">
                    <X className="w-3.5 h-3.5" style={{ color: 'rgba(221,214,254,0.8)' }} />
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
                    {p?.nome.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: '#fff' }}>{p?.nome}</p>
                    {p?.cargo && <p className="text-[10px] truncate" style={{ color: 'rgba(221,214,254,0.7)' }}>{p.cargo}{p.partido ? ` · ${p.partido}` : ''}</p>}
                  </div>
                </div>
              </div>
            );
          })()}

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

          {/* Selection header */}
          {filteredColaboradores.length > 0 && !loading && (
            <div className="flex items-center justify-between text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
              <span>{filteredColaboradores.length} colaboradores</span>
              {filteredColaboradores.filter(c => c.telefone).length > 0 && (
                <button
                  onClick={selectAllFiltered}
                  className="font-semibold transition-colors hover:underline"
                  style={{ color: '#4a9ede' }}
                >
                  Selecionar todos
                </button>
              )}
            </div>
          )}

          {/* Collaborator list */}
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2 scrollbar-dark">
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
                {filteredColaboradores.map(c => {
                  const isChecked = selectedColabIds.has(c.id);
                  return (
                    <motion.div
                      key={c.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.15 }}
                      className="rounded-xl p-3 transition-all duration-150 flex gap-2"
                      style={{
                        background: isChecked ? 'rgba(37,99,235,0.08)' : selectedColaboradorId === c.id ? 'rgba(29,78,216,0.12)' : 'var(--tint-04)',
                        border: isChecked
                          ? '1px solid rgba(37,99,235,0.4)'
                          : selectedColaboradorId === c.id
                            ? '1px solid rgba(29,78,216,0.4)'
                            : '1px solid var(--tint-08)',
                      }}
                    >
                      {/* Checkbox */}
                      {c.telefone && (
                        <button
                          onClick={e => { e.stopPropagation(); toggleColabSelection(c.id); }}
                          className="flex-shrink-0 mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center transition-all"
                          style={{
                            borderColor: isChecked ? '#2563eb' : 'var(--tint-20)',
                            background: isChecked ? '#2563eb' : 'transparent',
                          }}
                        >
                          {isChecked && <Check className="w-2.5 h-2.5 text-white" />}
                        </button>
                      )}
                      {/* Card body */}
                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => { setViewingColaborador(c); setSelectedColaboradorId(c.id); setColabMsgStatus('idle'); setColabMsgText(''); }}
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
                        {c.padrinho && (
                          <span className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                            ↑ {c.padrinho.nome} · {c.padrinho.cargo}
                          </span>
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
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>

          {/* Ações em massa */}
          {selectedColabIds.size > 0 && (
            <div className="flex gap-2">
              <div className="flex-1 flex items-center px-3 py-2 rounded-xl text-xs" style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)', color: 'var(--text-secondary)' }}>
                <span>{selectedColabIds.size} selecionado{selectedColabIds.size !== 1 ? 's' : ''}</span>
              </div>
              <button
                onClick={() => setConfirmBulkDelete(true)}
                className="px-3 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }}
                title={`Remover ${selectedColabIds.size} selecionado(s)`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={clearColabSelection}
                className="px-3 py-2.5 rounded-xl text-xs font-semibold transition-all"
                style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)', color: 'var(--text-secondary)' }}
                title="Limpar seleção"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Right main area */}
        <div className="lg:col-span-3 flex flex-col gap-3 order-2">
          {/* Tab switcher row */}
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            {/* Regiões Admin. | Zonas Eleitorais */}
            <div
              className="flex items-center gap-1 p-1 rounded-xl self-start"
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

            {/* District / Zone search bar */}
            <div ref={districtSearchRef} className="relative w-full sm:max-w-sm md:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-tertiary)' }} />
                <input
                  type="text"
                  value={districtSearch}
                  onChange={e => { setDistrictSearch(e.target.value); setShowDistrictSuggestions(true); }}
                  onFocus={() => setShowDistrictSuggestions(true)}
                  placeholder={dfVisualizacao === 'regioes' ? 'Buscar distrito…' : 'Buscar zona eleitoral…'}
                  className="w-full pl-9 pr-3 py-2 rounded-xl text-sm outline-none"
                  style={{
                    background: 'var(--tint-06)',
                    border: '1px solid var(--tint-10)',
                    color: 'var(--text-primary)',
                  }}
                />
                {showDistrictSuggestions && districtSearch.trim() && (() => {
                  const q = districtSearch.toLowerCase();
                  const suggestions = dfVisualizacao === 'regioes'
                    ? geoRegioes.filter(n => n.toLowerCase().includes(q)).slice(0, 8)
                    : DF_ZONAS
                        .filter(z => {
                          const nome = DF_ZONA_NOMES[z] ?? '';
                          return String(z).includes(q) || nome.toLowerCase().includes(q);
                        })
                        .slice(0, 8);
                  if (suggestions.length === 0) return null;
                  return (
                    <div
                      className="absolute top-full mt-1 left-0 right-0 rounded-xl overflow-hidden shadow-xl z-[2000]"
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--tint-10)' }}
                    >
                      {dfVisualizacao === 'regioes'
                        ? (suggestions as string[]).map(nome => (
                          <button
                            key={nome}
                            onMouseDown={() => {
                              handleRegionClick(nome);
                              setDistrictSearch(nome);
                              setShowDistrictSuggestions(false);
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                            style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--tint-06)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--tint-06)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <span className="font-medium">{nome}</span>
                            <span className="ml-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                              {(Object.entries(colaboradoresByRegiao).find(([k]) => normalizeRegiao(k) === normalizeRegiao(nome))?.[1]?.length ?? 0)} colab.
                            </span>
                          </button>
                        ))
                        : (suggestions as number[]).map(z => (
                          <button
                            key={z}
                            onMouseDown={() => {
                              handleZonaClick(z);
                              setDistrictSearch(`Zona ${z} — ${DF_ZONA_NOMES[z] ?? ''}`);
                              setShowDistrictSuggestions(false);
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                            style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--tint-06)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--tint-06)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <span className="font-medium">Zona {z}</span>
                            <span className="ml-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                              {DF_ZONA_NOMES[z]} · {colaboradoresByZona[z]?.length ?? 0} colab.
                            </span>
                          </button>
                        ))
                      }
                    </div>
                  );
                })()}
              </div>

          </div>

          <div className="flex flex-col gap-3">
                {/* ── Regiões Administrativas view ── */}
                {dfVisualizacao === 'regioes' && (
                  <>
                    {/* Polygon map */}
                    <div
                      className="rounded-xl overflow-hidden h-[55vw] min-h-[320px] lg:h-[calc(100vh-255px)]"
                      style={{ border: '1px solid rgba(74,158,222,0.15)' }}
                    >
                      <ColaboradoresMapInner
                        regioes={geoRegioes}
                        colaboradoresByRegiao={colaboradoresByRegiao}
                        colaboradores={baseColaboradores}
                        selectedRegiao={selectedRegiao}
                        selectedColaboradorId={selectedColaboradorId}
                        onRegiaoClick={handleRegionClick}
                        height="100%"
                      />
                    </div>
                  </>
                )}

                {/* ── Zonas Eleitorais view ── */}
                {dfVisualizacao === 'zonas' && (
                  <>
                    {/* Map + zone list — height lives on the container so children can use h-full */}
                    <div
                      className="flex flex-col lg:flex-row rounded-xl overflow-hidden lg:h-[calc(100vh-255px)]"
                      style={{ border: '1px solid rgba(167,139,250,0.15)' }}
                    >
                      {/* Leaflet map with zone markers */}
                      <div
                        className="flex-1 min-h-0 h-[55vw] min-h-[300px] lg:h-full"
                        style={{ minWidth: 0, overflow: 'hidden' }}
                      >
                        <ZonasMapInner
                          colaboradoresByZona={colaboradoresByZona}
                          selectedZona={selectedZona}
                          onZonaClick={handleZonaClick}
                        />
                      </div>

                      {/* Zone list panel */}
                      <div
                        className="w-full lg:w-60 h-44 lg:h-full flex flex-col flex-shrink-0"
                        style={{ background: 'var(--bg-card)', borderTop: '1px solid rgba(167,139,250,0.15)', borderLeft: '1px solid rgba(167,139,250,0.15)' }}
                      >
                        {/* Panel header */}
                        <div
                          className="flex items-center gap-2 px-3 py-2.5 flex-shrink-0"
                          style={{ borderBottom: '1px solid var(--tint-06)' }}
                        >
                          <MapPin className="w-3.5 h-3.5" style={{ color: '#a78bfa' }} />
                          <span
                            className="text-[11px] font-bold uppercase tracking-widest"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            Zonas Eleitorais
                          </span>
                          <span
                            className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                            style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}
                          >
                            {DF_ZONAS.length}
                          </span>
                        </div>

                        {/* Sorted zone list */}
                        <div className="flex-1 overflow-y-auto scrollbar-dark">
                          {[...DF_ZONAS]
                            .sort((a, b) =>
                              (colaboradoresByZona[b]?.length ?? 0) - (colaboradoresByZona[a]?.length ?? 0)
                            )
                            .map(zona => {
                              const colabs = colaboradoresByZona[zona] ?? [];
                              const isSelected = selectedZona === zona;
                              return (
                                <div
                                  key={zona}
                                  onClick={() => handleZonaClick(zona)}
                                  className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer select-none"
                                  style={{
                                    background: isSelected ? 'rgba(109,40,217,0.12)' : 'transparent',
                                    borderLeft: `3px solid ${isSelected ? '#a78bfa' : 'transparent'}`,
                                    transition: 'background 0.1s',
                                  }}
                                  onMouseEnter={e => {
                                    if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--tint-04)';
                                  }}
                                  onMouseLeave={e => {
                                    if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent';
                                  }}
                                >
                                  <div
                                    className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                                    style={{
                                      background: isSelected
                                        ? 'rgba(109,40,217,0.35)'
                                        : colabs.length > 0
                                          ? 'rgba(109,40,217,0.25)'
                                          : 'rgba(109,40,217,0.14)',
                                      color: isSelected
                                        ? '#c4b5fd'
                                        : colabs.length > 0
                                          ? '#a78bfa'
                                          : '#8b5cf6',
                                    }}
                                  >
                                    {zona}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p
                                      className="text-xs font-semibold"
                                      style={{ color: isSelected ? '#c4b5fd' : 'var(--text-primary)' }}
                                    >
                                      Zona {zona}
                                    </p>
                                    <p className="text-[10px] truncate" style={{ color: isSelected ? '#a78bfa' : '#8b5cf6' }}>
                                      {DF_ZONA_NOMES[zona] ?? ''}
                                    </p>
                                    <p
                                      className="text-[11px]"
                                      style={{ color: isSelected ? '#a78bfa' : 'rgba(139,92,246,0.7)' }}
                                    >
                                      {colabs.length > 0
                                        ? `${colabs.length} colaborador${colabs.length !== 1 ? 'es' : ''}`
                                        : 'sem colaboradores'}
                                    </p>
                                  </div>
                                  {colabs.length > 0 && (
                                    <span
                                      className="text-[11px] font-bold flex-shrink-0"
                                      style={{ color: isSelected ? '#a78bfa' : '#4a9ede' }}
                                    >
                                      {colabs.length}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    </div>
                  </>
                )}
          </div>

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
                className="fixed inset-0"
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
                    onClick={() => {
                      setShowFormModal(false);
                      setShowNovoPadrinho(false);
                      setNovoPadrinho({ nome: '', cargo: '', partido: '', cor: '#8b5cf6' });
                      setPadrinhoSearch('');
                    }}
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
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-primary)', opacity: 0.75 }}>
                      Nome <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Nome completo"
                      value={form.nome}
                      onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                      style={{ background: 'var(--tint-06)', border: '1px solid rgba(148,163,184,0.2)', color: 'var(--text-primary)' }}
                    />
                  </div>

                  {/* Telefone + Email */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-primary)', opacity: 0.75 }}>
                        Telefone
                      </label>
                      <input
                        type="tel"
                        placeholder="(61) 99999-9999"
                        value={form.telefone}
                        onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                        style={{ background: 'var(--tint-06)', border: '1px solid rgba(148,163,184,0.2)', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-primary)', opacity: 0.75 }}>
                        Email
                      </label>
                      <input
                        type="email"
                        placeholder="email@exemplo.com"
                        value={form.email}
                        onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                        style={{ background: 'var(--tint-06)', border: '1px solid rgba(148,163,184,0.2)', color: 'var(--text-primary)' }}
                      />
                    </div>
                  </div>

                  {/* Endereço */}
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-primary)', opacity: 0.75 }}>
                      Endereço
                    </label>
                    <input
                      type="text"
                      placeholder="Rua, número, bairro"
                      value={form.endereco}
                      onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                      style={{ background: 'var(--tint-06)', border: '1px solid rgba(148,163,184,0.2)', color: 'var(--text-primary)' }}
                    />
                  </div>

                  {/* Cor do marcador */}
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-primary)', opacity: 0.75 }}>
                      Cor no mapa
                    </label>
                    <div className="flex items-center gap-3">
                      {/* Swatches de cores predefinidas */}
                      <div className="flex gap-1.5 flex-wrap">
                        {['#8b5cf6','#3b82f6','#22c55e','#ef4444','#f97316','#ec4899','#eab308','#14b8a6','#6366f1','#64748b'].map(cor => (
                          <button
                            key={cor}
                            type="button"
                            onClick={() => setForm(f => ({ ...f, cor }))}
                            title={cor}
                            className="rounded-full transition-transform hover:scale-110"
                            style={{
                              width: 20, height: 20,
                              background: cor,
                              border: form.cor === cor ? '2.5px solid #fff' : '2px solid transparent',
                              boxShadow: form.cor === cor ? `0 0 0 2px ${cor}` : 'none',
                            }}
                          />
                        ))}
                      </div>
                      {/* Input color nativo para cor personalizada */}
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="color"
                          value={form.cor}
                          onChange={e => setForm(f => ({ ...f, cor: e.target.value }))}
                          className="rounded cursor-pointer"
                          style={{ width: 28, height: 28, padding: 2, background: 'var(--tint-06)', border: '1px solid rgba(148,163,184,0.2)' }}
                        />
                        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>personalizar</span>
                      </label>
                    </div>
                  </div>

                  {/* Função + Status */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-primary)', opacity: 0.75 }}>
                        Função
                      </label>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setOpenFuncaoDropdown(o => !o)}
                          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm text-left"
                          style={{ background: 'var(--tint-06)', border: '1px solid rgba(148,163,184,0.2)', color: 'var(--text-primary)' }}
                        >
                          <span>{FUNCOES.find(f => f.value === form.funcao)?.label ?? 'Sem função definida'}</span>
                          <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                        </button>
                        {openFuncaoDropdown && (
                          <div
                            className="absolute z-50 w-full mt-1 rounded-xl overflow-hidden shadow-lg"
                            style={{ background: 'var(--bg-card)', border: '1px solid var(--tint-10)' }}
                          >
                            {FUNCOES.map(fn => (
                              <div
                                key={fn.value}
                                onClick={() => { setForm(f => ({ ...f, funcao: fn.value })); setOpenFuncaoDropdown(false); }}
                                className="px-3 py-2.5 text-sm cursor-pointer"
                                style={{
                                  color: form.funcao === fn.value ? '#4a9ede' : 'var(--text-primary)',
                                  background: form.funcao === fn.value ? 'var(--tint-06)' : 'transparent',
                                }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--tint-06)'}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = form.funcao === fn.value ? 'var(--tint-06)' : 'transparent'}
                              >
                                {fn.label}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-primary)', opacity: 0.75 }}>
                        Status
                      </label>
                      <div className="flex gap-2">
                        {(['ATIVO', 'INATIVO'] as const).map(s => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setForm(f => ({ ...f, status: s }))}
                            className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all"
                            style={{
                              background: form.status === s
                                ? (s === 'ATIVO'
                                    ? 'linear-gradient(135deg, #15803d, #16a34a)'
                                    : 'linear-gradient(135deg, #b91c1c, #dc2626)')
                                : 'var(--tint-06)',
                              color: form.status === s ? '#fff' : 'var(--text-secondary)',
                              border: '1px solid ' + (form.status === s
                                ? (s === 'ATIVO' ? 'rgba(22,163,74,0.6)' : 'rgba(220,38,38,0.6)')
                                : 'var(--tint-10)'),
                              boxShadow: form.status === s
                                ? (s === 'ATIVO'
                                    ? '0 2px 8px rgba(22,163,74,0.35)'
                                    : '0 2px 8px rgba(220,38,38,0.35)')
                                : 'none',
                            }}
                          >
                            {s === 'ATIVO' ? 'Ativo' : 'Inativo'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Padrinho Político */}
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-primary)', opacity: 0.75 }}>
                      Padrinho Político
                    </label>

                    {/* Selected padrinho chip */}
                    {form.padrinhoId && (() => {
                      const p = padrinhos.find(x => x.id === form.padrinhoId);
                      return p ? (
                        <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(167,139,250,0.10)', border: '1px solid rgba(167,139,250,0.25)' }}>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{p.nome}</p>
                            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{p.cargo} · {p.partido}</p>
                          </div>
                          <button onClick={() => { setForm(f => ({ ...f, padrinhoId: '' })); setPadrinhoSearch(''); }}>
                            <X className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
                          </button>
                        </div>
                      ) : null;
                    })()}

                    {/* Search existing padrinhos */}
                    {!form.padrinhoId && (
                      <div className="space-y-1.5">
                        <input
                          type="text"
                          placeholder="Buscar padrinho..."
                          value={padrinhoSearch}
                          onChange={e => setPadrinhoSearch(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                          style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)', color: 'var(--text-primary)' }}
                        />
                        {padrinhoSearch.trim() && (
                          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--tint-10)', maxHeight: 160, overflowY: 'auto' }}>
                            {padrinhos
                              .filter(p => p.nome.toLowerCase().includes(padrinhoSearch.toLowerCase()) ||
                                           p.cargo.toLowerCase().includes(padrinhoSearch.toLowerCase()) ||
                                           p.partido.toLowerCase().includes(padrinhoSearch.toLowerCase()))
                              .map(p => (
                                <div
                                  key={p.id}
                                  onClick={() => { setForm(f => ({ ...f, padrinhoId: p.id })); setPadrinhoSearch(p.nome); }}
                                  className="px-3 py-2 cursor-pointer"
                                  style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--tint-06)' }}
                                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--tint-04)'}
                                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-card)'}
                                >
                                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{p.nome}</p>
                                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{p.cargo} · {p.partido}</p>
                                </div>
                              ))}
                            {padrinhos.filter(p =>
                              p.nome.toLowerCase().includes(padrinhoSearch.toLowerCase()) ||
                              p.cargo.toLowerCase().includes(padrinhoSearch.toLowerCase()) ||
                              p.partido.toLowerCase().includes(padrinhoSearch.toLowerCase())
                            ).length === 0 && (
                              <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-tertiary)', background: 'var(--bg-card)' }}>
                                Nenhum padrinho encontrado
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Regiões & Zonas */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold" style={{ color: 'var(--text-primary)', opacity: 0.75 }}>
                        Áreas de Atuação
                        {(form.regioes.length + form.zonas.length) > 0 && (
                          <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: '#2563eb', color: '#fff' }}>
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
                                  background: selected ? 'linear-gradient(135deg, #1d6fd8, #4a9ede)' : 'var(--tint-06)',
                                  border: '1px solid ' + (selected ? 'transparent' : 'var(--tint-10)'),
                                  color: selected ? '#fff' : 'var(--text-secondary)',
                                  boxShadow: selected ? '0 2px 8px rgba(29,111,216,0.35)' : 'none',
                                }}
                              >
                                <div
                                  className="w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0"
                                  style={{
                                    background: selected ? 'rgba(255,255,255,0.25)' : 'var(--tint-08)',
                                    border: '1px solid ' + (selected ? 'rgba(255,255,255,0.4)' : 'var(--tint-15)'),
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
                                background: selected ? 'linear-gradient(135deg, #6d28d9, #8b5cf6)' : 'var(--tint-06)',
                                border: '1px solid ' + (selected ? 'transparent' : 'var(--tint-10)'),
                                color: selected ? '#fff' : 'var(--text-secondary)',
                                boxShadow: selected ? '0 2px 8px rgba(109,40,217,0.4)' : 'none',
                              }}
                            >
                              <span className="text-base leading-none">{num}</span>
                              {selected && <CheckCircle2 className="w-2.5 h-2.5 mt-1 text-white" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Observação */}
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-primary)', opacity: 0.75 }}>
                      Observação
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Notas sobre este colaborador..."
                      value={form.observacao}
                      onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
                      style={{ background: 'var(--tint-06)', border: '1px solid rgba(148,163,184,0.2)', color: 'var(--text-primary)' }}
                    />
                  </div>
                </div>

                {/* Footer */}
                <div
                  className="flex items-center justify-end gap-3 px-6 py-4"
                  style={{ borderTop: '1px solid var(--tint-08)' }}
                >
                  <button
                    onClick={() => {
                      setShowFormModal(false);
                      setShowNovoPadrinho(false);
                      setNovoPadrinho({ nome: '', cargo: '', partido: '', cor: '#8b5cf6' });
                      setPadrinhoSearch('');
                    }}
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
                        {importing
                          ? `Importando... aguarde`
                          : `Importar ${allImportRows.length} colaborador${allImportRows.length !== 1 ? 'es' : ''}`}
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
        loading={deleting}
        onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)}
        onCancel={() => !deleting && setConfirmDeleteId(null)}
      />

      {/* ── Bulk delete confirmation ── */}
      <ConfirmDialog
        open={confirmBulkDelete}
        title={`Remover ${selectedColabIds.size} colaborador(es)`}
        message={`Você está prestes a remover permanentemente ${selectedColabIds.size} colaborador(es). Esta ação não pode ser desfeita.`}
        confirmLabel="Remover todos"
        cancelLabel="Cancelar"
        variant="danger"
        loading={bulkDeleting}
        onConfirm={handleBulkDelete}
        onCancel={() => !bulkDeleting && setConfirmBulkDelete(false)}
      />

      {/* ── Padrinhos modal ── */}
      <ConfirmDialog
        open={!!confirmDeletePadrinhoId}
        title="Remover padrinho"
        message="O padrinho será desvinculado de todos os colaboradores e removido. Esta ação não pode ser desfeita."
        confirmLabel="Remover"
        cancelLabel="Cancelar"
        variant="danger"
        loading={deletingPadrinho}
        onConfirm={() => confirmDeletePadrinhoId && handleDeletePadrinho(confirmDeletePadrinhoId)}
        onCancel={() => !deletingPadrinho && setConfirmDeletePadrinhoId(null)}
      />

      {/* ── Colaborador detail modal ── */}
      {viewingColaborador && createPortal(
        <AnimatePresence>
          <div className="fixed inset-0 z-[9000] flex items-end sm:items-center justify-center sm:px-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0"
              style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
              onClick={() => { setViewingColaborador(null); setSelectedColaboradorId(null); }}
            />
            <motion.div
              initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col"
              style={{ background: 'var(--bg-card)', maxHeight: '90vh' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between px-6 pt-5 pb-4" style={{ borderBottom: '1px solid var(--tint-06)' }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
                      {viewingColaborador.nome}
                    </h2>
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0"
                      style={{
                        background: viewingColaborador.status === 'ATIVO' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.12)',
                        color: viewingColaborador.status === 'ATIVO' ? '#22c55e' : '#ef4444',
                      }}
                    >
                      {viewingColaborador.status === 'ATIVO' ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  {viewingColaborador.funcao && (
                    <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{viewingColaborador.funcao}</p>
                  )}
                </div>
                <button
                  onClick={() => { setViewingColaborador(null); setSelectedColaboradorId(null); }}
                  className="ml-3 flex-shrink-0 p-1 rounded-lg transition-colors"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="overflow-y-auto flex-1 px-6 py-4 flex flex-col gap-4">
                {/* Contact info */}
                <div className="flex flex-col gap-2">
                  {viewingColaborador.telefone && (
                    <div className="flex items-center gap-2.5">
                      <Phone className="w-4 h-4 flex-shrink-0" style={{ color: '#4a9ede' }} />
                      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{viewingColaborador.telefone}</span>
                    </div>
                  )}
                  {viewingColaborador.email && (
                    <div className="flex items-center gap-2.5">
                      <AtSign className="w-4 h-4 flex-shrink-0" style={{ color: '#4a9ede' }} />
                      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{viewingColaborador.email}</span>
                    </div>
                  )}
                  {viewingColaborador.endereco && (
                    <div className="flex items-start gap-2.5">
                      <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#4a9ede' }} />
                      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{viewingColaborador.endereco}</span>
                    </div>
                  )}
                </div>

                {/* Padrinho */}
                {viewingColaborador.padrinho && (
                  <div className="rounded-xl p-3" style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)' }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-tertiary)' }}>Padrinho Político</p>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{viewingColaborador.padrinho.nome}</p>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {viewingColaborador.padrinho.cargo}{viewingColaborador.padrinho.partido ? ` · ${viewingColaborador.padrinho.partido}` : ''}
                    </p>
                  </div>
                )}

                {/* Regiões */}
                {viewingColaborador.regioes.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-tertiary)' }}>Regiões</p>
                    <div className="flex flex-wrap gap-1.5">
                      {viewingColaborador.regioes.map(r => (
                        <span
                          key={r.id}
                          className="text-xs px-2 py-0.5 rounded-lg"
                          style={r.tipo === 'ZONA'
                            ? { background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }
                            : { background: 'rgba(74,158,222,0.15)', color: '#4a9ede' }}
                        >
                          {r.regiaoNome}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Observação */}
                {viewingColaborador.observacao && (
                  <div className="rounded-xl p-3" style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)' }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-tertiary)' }}>Observação</p>
                    <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{viewingColaborador.observacao}</p>
                  </div>
                )}

                {/* WhatsApp message */}
                {viewingColaborador.telefone ? (
                  <div className="rounded-xl p-4" style={{ background: 'var(--tint-06)', border: '1px solid rgba(37,211,102,0.2)' }}>
                    <div className="flex items-center gap-2 mb-3">
                      <MessageCircle className="w-4 h-4" style={{ color: '#25d366' }} />
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Enviar mensagem WhatsApp</p>
                    </div>
                    <textarea
                      value={colabMsgText}
                      onChange={e => { setColabMsgText(e.target.value); setColabMsgStatus('idle'); }}
                      rows={3}
                      placeholder="Digite a mensagem..."
                      disabled={colabMsgStatus === 'sending'}
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-none placeholder-[color:var(--text-tertiary)] disabled:opacity-50"
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--tint-10)', color: 'var(--text-primary)' }}
                    />
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{colabMsgText.length} caracteres</span>
                      {colabMsgStatus === 'ok' && (
                        <span className="text-xs flex items-center gap-1" style={{ color: '#22c55e' }}>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Enviado
                        </span>
                      )}
                      {colabMsgStatus === 'err' && (
                        <span className="text-xs flex items-center gap-1" style={{ color: '#ef4444' }}>
                          <AlertCircle className="w-3.5 h-3.5" /> {colabMsgError || 'Erro'}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={handleSendColabMsg}
                      disabled={!colabMsgText.trim() || colabMsgStatus === 'sending'}
                      className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg, #128c7e, #25d366)' }}
                    >
                      {colabMsgStatus === 'sending'
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                        : <><Send className="w-4 h-4" /> Enviar</>}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-center py-2" style={{ color: 'var(--text-tertiary)' }}>
                    Sem telefone cadastrado para envio de mensagem.
                  </p>
                )}
              </div>

              {/* Footer actions */}
              <div className="px-6 py-4 flex gap-2" style={{ borderTop: '1px solid var(--tint-06)' }}>
                <button
                  onClick={() => { setViewingColaborador(null); openEdit(viewingColaborador); }}
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                  style={{ background: 'rgba(74,158,222,0.15)', color: '#4a9ede' }}
                >
                  <Pencil className="w-4 h-4" /> Editar
                </button>
                <button
                  onClick={() => { setConfirmDeleteId(viewingColaborador.id); setViewingColaborador(null); }}
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                  style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}
                >
                  <Trash2 className="w-4 h-4" /> Remover
                </button>
              </div>
            </motion.div>
          </div>
        </AnimatePresence>,
        document.body
      )}

      {showPadrinhosModal && createPortal(
        <AnimatePresence>
          <div className="fixed inset-0 z-[9000] flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0"
              style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
              onClick={() => { if (!editingPadrinho) setShowPadrinhosModal(false); }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 20 }}
              transition={{ type: 'spring', damping: 24, stiffness: 260 }}
              className="relative w-full max-w-lg"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 20, boxShadow: 'var(--shadow-raised)', color: 'var(--text-primary)' }}
              onClick={e => e.stopPropagation()}
            >
              <span className="absolute top-0 left-0 right-0 h-[2px] rounded-t-[20px]" style={{ background: 'linear-gradient(90deg, transparent, rgba(109,40,217,0.7), transparent)' }} />

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--tint-06)' }}>
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4" style={{ color: '#8b5cf6' }} />
                  <h2 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>Padrinhos Políticos</h2>
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(109,40,217,0.15)', color: '#8b5cf6' }}>
                    {padrinhos.length}
                  </span>
                </div>
                <button onClick={() => setShowPadrinhosModal(false)}>
                  <X className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
                </button>
              </div>

              {/* List */}
              <div className="overflow-y-auto" style={{ maxHeight: '60vh' }}>
                {padrinhos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <User className="w-10 h-10" style={{ color: 'var(--text-tertiary)' }} />
                    <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Nenhum padrinho cadastrado ainda.</p>
                  </div>
                ) : (
                  padrinhos.map(p => (
                    <div key={p.id}>
                      {editingPadrinho?.id === p.id ? (
                        /* Edit inline */
                        <div className="px-6 py-4 space-y-2" style={{ borderBottom: '1px solid var(--tint-06)', background: 'rgba(109,40,217,0.05)' }}>
                          <input
                            type="text" placeholder="Nome *" value={editPadrinhoForm.nome}
                            onChange={e => setEditPadrinhoForm(f => ({ ...f, nome: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                            style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)', color: 'var(--text-primary)' }}
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="text" placeholder="Cargo" value={editPadrinhoForm.cargo}
                              onChange={e => setEditPadrinhoForm(f => ({ ...f, cargo: e.target.value }))}
                              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                              style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)', color: 'var(--text-primary)' }}
                            />
                            <input
                              type="text" placeholder="Partido" value={editPadrinhoForm.partido}
                              onChange={e => setEditPadrinhoForm(f => ({ ...f, partido: e.target.value }))}
                              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                              style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)', color: 'var(--text-primary)' }}
                            />
                          </div>
                          {/* Cor do padrinho */}
                          <div className="flex items-center gap-2">
                            <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>Cor:</p>
                            <div className="flex gap-1.5 flex-wrap">
                              {['#8b5cf6','#3b82f6','#10b981','#f59e0b','#ef4444','#ec4899','#06b6d4','#f97316','#64748b','#1e293b'].map(c => (
                                <button
                                  key={c} type="button"
                                  onClick={() => setEditPadrinhoForm(f => ({ ...f, cor: c }))}
                                  className="w-5 h-5 rounded-full transition-transform hover:scale-110 flex-shrink-0"
                                  style={{ background: c, outline: editPadrinhoForm.cor === c ? `2px solid ${c}` : 'none', outlineOffset: 2 }}
                                />
                              ))}
                              <input
                                type="color" value={editPadrinhoForm.cor}
                                onChange={e => setEditPadrinhoForm(f => ({ ...f, cor: e.target.value }))}
                                className="w-5 h-5 rounded-full cursor-pointer border-0 p-0"
                                style={{ background: 'none' }}
                                title="Cor personalizada"
                              />
                            </div>
                          </div>
                          <div className="flex gap-2 pt-1">
                            <button onClick={() => setEditingPadrinho(null)}
                              className="flex-1 py-1.5 rounded-lg text-xs font-semibold"
                              style={{ background: 'var(--tint-06)', color: 'var(--text-secondary)' }}>
                              Cancelar
                            </button>
                            <button onClick={handleSaveEditPadrinho} disabled={savingEditPadrinho}
                              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold text-white"
                              style={{ background: 'linear-gradient(135deg,#6d28d9,#8b5cf6)' }}>
                              {savingEditPadrinho && <Loader2 className="w-3 h-3 animate-spin" />}
                              Salvar
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Row — clique para filtrar */
                        <div
                          className="flex items-center gap-3 px-6 py-3.5 cursor-pointer transition-colors"
                          style={{
                            borderBottom: '1px solid var(--tint-06)',
                            background: selectedPadrinhoFilter === p.id ? 'rgba(109,40,217,0.08)' : undefined,
                          }}
                          onClick={() => { setSelectedPadrinhoFilter(prev => prev === p.id ? null : p.id); setShowPadrinhosModal(false); }}
                          onMouseEnter={e => { if (selectedPadrinhoFilter !== p.id) (e.currentTarget as HTMLElement).style.background = 'var(--tint-04)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = selectedPadrinhoFilter === p.id ? 'rgba(109,40,217,0.08)' : ''; }}
                        >
                          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold" style={{ background: `${p.cor || '#8b5cf6'}22`, color: p.cor || '#8b5cf6' }}>
                            {p.nome.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{p.nome}</p>
                              {selectedPadrinhoFilter === p.id && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: 'rgba(109,40,217,0.2)', color: '#8b5cf6' }}>
                                  Filtrando
                                </span>
                              )}
                            </div>
                            <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                              {p.cargo}{p.partido ? ` · ${p.partido}` : ''}
                              {p._count.colaboradores > 0 && (
                                <span className="ml-2 font-semibold" style={{ color: '#8b5cf6' }}>
                                  {p._count.colaboradores} colaborador{p._count.colaboradores !== 1 ? 'es' : ''}
                                </span>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => { setEditingPadrinho(p); setEditPadrinhoForm({ nome: p.nome, cargo: p.cargo, partido: p.partido, cor: p.cor || '#8b5cf6' }); }}
                              className="p-1.5 rounded-lg transition-colors"
                              style={{ color: 'var(--text-tertiary)' }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'var(--tint-06)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setConfirmDeletePadrinhoId(p.id)}
                              className="p-1.5 rounded-lg transition-colors"
                              style={{ color: '#ef4444' }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Footer — criar novo padrinho */}
              <div className="px-6 py-4" style={{ borderTop: '1px solid var(--tint-06)' }}>
                {!showNovoPadrinho ? (
                  <button
                    onClick={() => { setShowNovoPadrinho(true); setNovoPadrinho({ nome: '', cargo: '', partido: '', cor: '#8b5cf6' }); }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90 w-full justify-center"
                    style={{ background: 'linear-gradient(135deg, #6d28d9, #8b5cf6)', color: '#fff' }}
                  >
                    <Plus className="w-4 h-4" />
                    Cadastrar novo padrinho
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs font-bold" style={{ color: '#a78bfa' }}>Novo Padrinho</p>
                    <input
                      type="text"
                      placeholder="Nome completo *"
                      value={novoPadrinho.nome}
                      onChange={e => setNovoPadrinho(p => ({ ...p, nome: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                      style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)', color: 'var(--text-primary)' }}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Cargo *"
                        value={novoPadrinho.cargo}
                        onChange={e => setNovoPadrinho(p => ({ ...p, cargo: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                        style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)', color: 'var(--text-primary)' }}
                      />
                      <input
                        type="text"
                        placeholder="Partido *"
                        value={novoPadrinho.partido}
                        onChange={e => setNovoPadrinho(p => ({ ...p, partido: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                        style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)', color: 'var(--text-primary)' }}
                      />
                    </div>
                    {/* Cor do padrinho */}
                    <div className="flex items-center gap-2">
                      <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>Cor:</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {['#8b5cf6','#3b82f6','#10b981','#f59e0b','#ef4444','#ec4899','#06b6d4','#f97316','#64748b','#1e293b'].map(c => (
                          <button
                            key={c} type="button"
                            onClick={() => setNovoPadrinho(p => ({ ...p, cor: c }))}
                            className="w-5 h-5 rounded-full transition-transform hover:scale-110 flex-shrink-0"
                            style={{ background: c, outline: novoPadrinho.cor === c ? `2px solid ${c}` : 'none', outlineOffset: 2 }}
                          />
                        ))}
                        <input
                          type="color" value={novoPadrinho.cor}
                          onChange={e => setNovoPadrinho(p => ({ ...p, cor: e.target.value }))}
                          className="w-5 h-5 rounded-full cursor-pointer border-0 p-0"
                          style={{ background: 'none' }}
                          title="Cor personalizada"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => { setShowNovoPadrinho(false); setNovoPadrinho({ nome: '', cargo: '', partido: '', cor: '#8b5cf6' }); }}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold"
                        style={{ background: 'var(--tint-06)', color: 'var(--text-secondary)' }}
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleCriarPadrinho}
                        disabled={savingPadrinho}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-white"
                        style={{ background: 'linear-gradient(135deg, #6d28d9, #8b5cf6)' }}
                      >
                        {savingPadrinho && <Loader2 className="w-3 h-3 animate-spin" />}
                        Salvar Padrinho
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </AnimatePresence>,
        document.body
      )}

      {/* ── Bulk messaging modal ── */}
      {showBulkMsg && mounted && createPortal(
        <AnimatePresence>
          <div className="fixed inset-0 z-[9100] flex items-end sm:items-center justify-center sm:px-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0"
              style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
              onClick={() => { if (!bulkSendingApi) setShowBulkMsg(false); }}
            />
            <motion.div
              initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="relative w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col"
              style={{ background: 'var(--bg-card)', maxHeight: '90vh' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-5 pb-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(37,211,102,0.2)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(37,211,102,0.15)' }}>
                    <MessageSquare className="w-4 h-4" style={{ color: '#25d366' }} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                      Disparo via WhatsApp
                    </h2>
                    <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                      {selectedColabList.filter(c => c.telefone).length} colaborador(es) selecionado(s)
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { if (!bulkSendingApi) setShowBulkMsg(false); }}
                  className="p-1.5 rounded-lg hover:bg-[var(--tint-10)] transition-colors"
                >
                  <X className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-dark">
                {/* Message textarea */}
                <textarea
                  value={bulkMsgText}
                  onChange={e => setBulkMsgText(e.target.value)}
                  rows={4}
                  placeholder="Digite a mensagem que será enviada para todos os colaboradores selecionados..."
                  disabled={bulkSendingApi}
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none disabled:opacity-50"
                  style={{
                    background: 'var(--tint-06)',
                    border: '1px solid var(--tint-10)',
                    color: 'var(--text-primary)',
                  }}
                />

                {/* Contacts list with status */}
                <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-dark">
                  {selectedColabList.filter(c => c.telefone).map(c => {
                    const st = bulkSendStatus[c.id];
                    return (
                      <div
                        key={c.id}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                        style={{ background: 'var(--tint-04)', border: '1px solid var(--tint-06)' }}
                      >
                        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(37,211,102,0.12)' }}>
                          <Phone className="w-3.5 h-3.5" style={{ color: '#25d366' }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{c.nome}</p>
                          <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{c.telefone}</p>
                          {st === 'err' && bulkSendErrors[c.id] && (
                            <p className="text-[10px] mt-0.5 text-red-400">{bulkSendErrors[c.id]}</p>
                          )}
                        </div>
                        {/* Status indicator */}
                        {!st || st === 'idle' ? (
                          bulkMsgText.trim() ? (
                            <a
                              href={`https://wa.me/${normalizeWA(c.telefone!)}?text=${encodeURIComponent(bulkMsgText)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium flex-shrink-0 transition-all hover:opacity-80"
                              style={{ background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.25)', color: '#25d366' }}
                            >
                              <ExternalLink className="w-3 h-3" /> Abrir
                            </a>
                          ) : null
                        ) : st === 'sending' ? (
                          <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: '#4a9ede' }} />
                        ) : st === 'ok' ? (
                          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-green-400" />
                        ) : (
                          <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
                        )}
                      </div>
                    );
                  })}
                  {selectedColabList.filter(c => !c.telefone).length > 0 && (
                    <p className="text-[10px] text-center py-1" style={{ color: 'var(--text-tertiary)' }}>
                      {selectedColabList.filter(c => !c.telefone).length} colaborador(es) sem telefone serão ignorados
                    </p>
                  )}
                </div>

                {/* Summary after send */}
                {!bulkSendingApi && Object.keys(bulkSendStatus).length > 0 && (
                  <div className="rounded-xl px-4 py-3 text-xs flex items-center gap-4" style={{ background: 'var(--tint-04)', border: '1px solid var(--tint-08)' }}>
                    <span className="text-green-400 font-semibold">
                      ✓ {Object.values(bulkSendStatus).filter(s => s === 'ok').length} enviado{Object.values(bulkSendStatus).filter(s => s === 'ok').length !== 1 ? 's' : ''}
                    </span>
                    {Object.values(bulkSendStatus).filter(s => s === 'err').length > 0 && (
                      <span className="text-red-400 font-semibold">
                        ✗ {Object.values(bulkSendStatus).filter(s => s === 'err').length} com erro
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 flex-shrink-0 gap-3" style={{ borderTop: '1px solid rgba(37,211,102,0.15)' }}>
                <button
                  onClick={copyBulkNumbers}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all hover:opacity-80"
                  style={{ background: 'rgba(74,158,222,0.1)', border: '1px solid rgba(74,158,222,0.2)', color: '#4a9ede' }}
                >
                  {bulkCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {bulkCopied ? 'Copiado!' : 'Copiar números'}
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setShowBulkMsg(false); setBulkSendStatus({}); setBulkSendErrors({}); }}
                    disabled={bulkSendingApi}
                    className="px-4 py-2 text-sm font-medium transition-all hover:opacity-80 rounded-xl disabled:opacity-40"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Fechar
                  </button>
                  <button
                    onClick={handleBulkSend}
                    disabled={!bulkMsgText.trim() || bulkSendingApi || selectedColabList.filter(c => c.telefone).length === 0}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg, #128c7e, #25d366)', color: '#fff' }}
                  >
                    {bulkSendingApi
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</>
                      : <><Send className="w-4 h-4" /> Disparar via API</>}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </AnimatePresence>,
        document.body
      )}

      {/* ── Modal Disparar Mensagem ── */}
      {typeof window !== 'undefined' && createPortal(
        <AnimatePresence>
          {showMsgModal && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}>
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 16 }}
                transition={{ duration: 0.2 }}
                className="w-full max-w-lg rounded-2xl flex flex-col overflow-hidden"
                style={{ background: 'var(--bg-card)', border: '1px solid rgba(37,211,102,0.2)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)', maxHeight: '90vh' }}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(37,211,102,0.12)' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(37,211,102,0.12)' }}>
                      <MessageSquare className="w-4 h-4" style={{ color: '#25d366' }} />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Disparar Mensagem</h2>
                      <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                        {msgStep === 1 ? 'Selecione os destinatários' : `${msgRecipients.length} destinatário${msgRecipients.length !== 1 ? 's' : ''} com telefone`}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => { if (!msgSendingApi) setShowMsgModal(false); }} className="p-1.5 rounded-lg hover:bg-[var(--tint-10)] transition-colors">
                    <X className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                  </button>
                </div>

                {/* Step indicator */}
                <div className="flex items-center gap-2 px-6 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--tint-08)' }}>
                  {([1, 2] as const).map(s => (
                    <div key={s} className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all" style={{
                        background: msgStep >= s ? 'linear-gradient(135deg,#128c7e,#25d366)' : 'var(--tint-08)',
                        color: msgStep >= s ? '#fff' : 'var(--text-tertiary)',
                      }}>{s}</div>
                      <span className="text-[11px] font-medium" style={{ color: msgStep >= s ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                        {s === 1 ? 'Destinatários' : 'Mensagem'}
                      </span>
                      {s < 2 && <div className="w-6 h-px mx-1" style={{ background: 'var(--tint-10)' }} />}
                    </div>
                  ))}
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-dark">

                  {/* Step 1: filter selection */}
                  {msgStep === 1 && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { id: 'regiao' as const, label: 'Por Região', desc: 'Selecionar RAs ou zonas' },
                          { id: 'padrinho' as const, label: 'Por Padrinho', desc: 'Selecionar um padrinho' },
                        ]).map(opt => (
                          <button
                            key={opt.id}
                            onClick={() => { setMsgFilter(opt.id); setMsgFilterRegioes([]); setMsgFilterPadrinhoId(null); }}
                            className="flex flex-col items-start gap-1 p-3 rounded-xl text-left transition-all"
                            style={{
                              background: msgFilter === opt.id ? 'rgba(37,211,102,0.1)' : 'var(--tint-06)',
                              border: msgFilter === opt.id ? '1.5px solid rgba(37,211,102,0.4)' : '1px solid var(--tint-10)',
                            }}
                          >
                            <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{opt.label}</span>
                            <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{opt.desc}</span>
                          </button>
                        ))}
                      </div>

                      {/* Sub-selection: por região */}
                      {msgFilter === 'regiao' && (
                        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--tint-10)' }}>
                          <div className="flex" style={{ borderBottom: '1px solid var(--tint-10)' }}>
                            {([{ id: 'ra' as const, label: 'Regiões Admin.' }, { id: 'zona' as const, label: 'Zonas Eleitorais' }]).map(t => (
                              <button key={t.id} onClick={() => setMsgFilterRegiaoTab(t.id)}
                                className="flex-1 py-2 text-xs font-semibold transition-all"
                                style={{
                                  background: msgFilterRegiaoTab === t.id ? 'rgba(37,211,102,0.08)' : 'transparent',
                                  color: msgFilterRegiaoTab === t.id ? '#25d366' : 'var(--text-secondary)',
                                  borderRight: t.id === 'ra' ? '1px solid var(--tint-10)' : 'none',
                                }}>
                                {t.label}
                              </button>
                            ))}
                          </div>
                          <div className="p-3 max-h-48 overflow-y-auto scrollbar-dark">
                            {msgFilterRegiaoTab === 'ra' ? (
                              <div className="flex flex-wrap gap-1.5">
                                {geoRegioes.map(ra => {
                                  const active = msgFilterRegioes.includes(ra);
                                  return (
                                    <button key={ra} onClick={() => setMsgFilterRegioes(prev => active ? prev.filter(r => r !== ra) : [...prev, ra])}
                                      className="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all"
                                      style={{
                                        background: active ? 'rgba(37,211,102,0.15)' : 'var(--tint-06)',
                                        border: active ? '1px solid rgba(37,211,102,0.35)' : '1px solid var(--tint-10)',
                                        color: active ? '#25d366' : 'var(--text-secondary)',
                                      }}>
                                      {ra}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {DF_ZONAS.map(z => {
                                  const label = `Zona ${z}`;
                                  const active = msgFilterRegioes.includes(label);
                                  return (
                                    <button key={z} onClick={() => setMsgFilterRegioes(prev => active ? prev.filter(r => r !== label) : [...prev, label])}
                                      className="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all"
                                      style={{
                                        background: active ? 'rgba(109,40,217,0.15)' : 'var(--tint-06)',
                                        border: active ? '1px solid rgba(109,40,217,0.35)' : '1px solid var(--tint-10)',
                                        color: active ? '#a78bfa' : 'var(--text-secondary)',
                                      }}>
                                      Zona {z}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          {msgFilterRegioes.length > 0 && (
                            <div className="px-3 py-2 text-[10px] flex items-center justify-between" style={{ borderTop: '1px solid var(--tint-08)', color: 'var(--text-tertiary)' }}>
                              <span>{msgFilterRegioes.length} região(ões) selecionada(s)</span>
                              <button onClick={() => setMsgFilterRegioes([])} className="hover:underline" style={{ color: '#ef4444' }}>Limpar</button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Sub-selection: por padrinho */}
                      {msgFilter === 'padrinho' && (
                        <div className="space-y-2 max-h-52 overflow-y-auto scrollbar-dark">
                          {padrinhos.length === 0 ? (
                            <p className="text-xs text-center py-4" style={{ color: 'var(--text-tertiary)' }}>Nenhum padrinho cadastrado</p>
                          ) : padrinhos.map(p => (
                            <button key={p.id} onClick={() => setMsgFilterPadrinhoId(p.id === msgFilterPadrinhoId ? null : p.id)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all"
                              style={{
                                background: msgFilterPadrinhoId === p.id ? 'rgba(109,40,217,0.1)' : 'var(--tint-04)',
                                border: msgFilterPadrinhoId === p.id ? '1.5px solid rgba(109,40,217,0.4)' : '1px solid var(--tint-08)',
                              }}>
                              <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold" style={{ background: 'rgba(109,40,217,0.15)', color: '#8b5cf6' }}>
                                {p.nome.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{p.nome}</p>
                                {p.cargo && <p className="text-[10px] truncate" style={{ color: 'var(--text-tertiary)' }}>{p.cargo}{p.partido ? ` · ${p.partido}` : ''}</p>}
                              </div>
                              <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                                {colaboradores.filter(c => c.padrinhoId === p.id && c.telefone).length} contatos
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {/* Step 2: message */}
                  {msgStep === 2 && (
                    <>
                      <textarea
                        value={msgText}
                        onChange={e => setMsgText(e.target.value)}
                        rows={4}
                        placeholder="Digite a mensagem que será enviada..."
                        disabled={msgSendingApi}
                        className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none disabled:opacity-50"
                        style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)', color: 'var(--text-primary)' }}
                        autoFocus
                      />

                      <div className="space-y-1.5 max-h-52 overflow-y-auto scrollbar-dark">
                        {msgRecipients.map(c => {
                          const st = msgSendStatus[c.id];
                          return (
                            <div key={c.id} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: 'var(--tint-04)', border: '1px solid var(--tint-06)' }}>
                              <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(37,211,102,0.12)' }}>
                                <Phone className="w-3 h-3" style={{ color: '#25d366' }} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{c.nome}</p>
                                <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{c.telefone}</p>
                                {st === 'err' && msgSendErrors[c.id] && <p className="text-[10px] mt-0.5 text-red-400">{msgSendErrors[c.id]}</p>}
                              </div>
                              {st === 'sending' && <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" style={{ color: '#4a9ede' }} />}
                              {st === 'ok' && <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-green-400" />}
                              {st === 'err' && <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-red-400" />}
                            </div>
                          );
                        })}
                        {msgRecipients.length === 0 && (
                          <p className="text-xs text-center py-4" style={{ color: 'var(--text-tertiary)' }}>Nenhum destinatário com telefone cadastrado</p>
                        )}
                      </div>

                      {!msgSendingApi && Object.keys(msgSendStatus).length > 0 && (
                        <div className="rounded-xl px-4 py-3 text-xs flex items-center gap-4" style={{ background: 'var(--tint-04)', border: '1px solid var(--tint-08)' }}>
                          <span className="text-green-400 font-semibold">
                            ✓ {Object.values(msgSendStatus).filter(s => s === 'ok').length} enviado{Object.values(msgSendStatus).filter(s => s === 'ok').length !== 1 ? 's' : ''}
                          </span>
                          {Object.values(msgSendStatus).filter(s => s === 'err').length > 0 && (
                            <span className="text-red-400 font-semibold">
                              ✗ {Object.values(msgSendStatus).filter(s => s === 'err').length} com erro
                            </span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 flex-shrink-0 gap-3" style={{ borderTop: '1px solid var(--tint-08)' }}>
                  <button
                    onClick={() => { if (msgStep === 2 && !msgSendingApi) { setMsgStep(1); setMsgSendStatus({}); setMsgSendErrors({}); } else setShowMsgModal(false); }}
                    disabled={msgSendingApi}
                    className="px-4 py-2 text-sm font-medium transition-all hover:opacity-80 rounded-xl disabled:opacity-40"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {msgStep === 1 ? 'Cancelar' : 'Voltar'}
                  </button>

                  {msgStep === 1 ? (
                    <button
                      onClick={() => setMsgStep(2)}
                      disabled={
                        (msgFilter === 'regiao' && msgFilterRegioes.length === 0) ||
                        (msgFilter === 'padrinho' && !msgFilterPadrinhoId) ||
                        msgRecipients.length === 0
                      }
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-40"
                      style={{ background: 'linear-gradient(135deg, #128c7e, #25d366)', color: '#fff' }}
                    >
                      Próximo · {msgRecipients.length} contato{msgRecipients.length !== 1 ? 's' : ''}
                    </button>
                  ) : (
                    <button
                      onClick={handleMsgSend}
                      disabled={!msgText.trim() || msgSendingApi || msgRecipients.length === 0}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-40"
                      style={{ background: 'linear-gradient(135deg, #128c7e, #25d366)', color: '#fff' }}
                    >
                      {msgSendingApi
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</>
                        : <><Send className="w-4 h-4" /> Disparar</>}
                    </button>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
