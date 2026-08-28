'use client';

import { useEffect, useRef, useState } from 'react';
import { CATEGORY_COLORS } from '@/lib/types';
import { useMapCleanup } from '@/hooks/use-map-cleanup';
import { camadaBase } from '@/lib/maps/basemap';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
interface Demand {
  id: string;
  title: string;
  solicitante: string;
  contato?: string;
  endereco?: string;
  municipio: string;
  estado: string;
  category: string;
  status: string;
  priority: string;
  foto?: string;
  lat?: number;
  lng?: number;
  createdAt: string;
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

interface Props {
  demands: Demand[];
  agendaEvents: AgendaEvent[];
  contatos?: Contato[];
  center?: [number, number] | null;
  selectedDemandId?: string;
  selectedEventId?: string;
  onDemandClick: (id: string) => void;
  onEventClick: (id: string) => void;
  showSpDistritos?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers de cor
// ---------------------------------------------------------------------------
const STATUS_COLORS: Record<string, string> = {
  PENDENTE: '#EF4444', EM_ANDAMENTO: '#2196F3', RESOLVIDA: '#4CAF50',
};
const STATUS_LABELS: Record<string, string> = {
  PENDENTE: 'Pendente', EM_ANDAMENTO: 'Em Andamento', RESOLVIDA: 'Resolvida',
};
const CATEGORY_LABELS: Record<string, string> = {
  SAUDE: 'Saúde', EDUCACAO: 'Educação', INFRAESTRUTURA: 'Infraestrutura',
  ASSISTENCIA_SOCIAL: 'Assist. Social', SEGURANCA: 'Segurança',
  TRANSPORTE: 'Transporte', MEIO_AMBIENTE: 'Meio Ambiente',
  CULTURA: 'Cultura', ESPORTE: 'Esporte', OUTROS: 'Outros',
};
const TIPO_AGENDA_COLORS: Record<string, string> = {
  REUNIAO: '#6366f1', VISITA: '#f59e0b', EVENTO: '#ec4899', COMPROMISSO: '#14b8a6',
};
const TIPO_AGENDA_LABELS: Record<string, string> = {
  REUNIAO: 'Reunião', VISITA: 'Visita', EVENTO: 'Evento', COMPROMISSO: 'Compromisso',
};

// Cache módulo para não refazer o fetch a cada reinicialização do mapa
let spDistritosGeoCache: any = null;

// Gera SVG de pin para demanda — color = status, dotColor = cor hex da categoria
function demandaPinSvg(color: string, dotColor: string, foto?: string, selected = false): string {
  const size = selected ? 44 : 36;
  const h = Math.round(size * 1.45);
  const border = selected ? 'var(--text-primary)' : 'var(--tint-45)';
  const bw = selected ? 3 : 1.5;

  if (foto) {
    return `<div style="position:relative;width:${size}px;height:${h}px;">
      <svg width="${size}" height="${h}" viewBox="0 0 44 64" xmlns="http://www.w3.org/2000/svg" style="position:absolute;top:0;left:0;filter:drop-shadow(0 3px 8px rgba(0,0,0,0.7))">
        <path d="M22 2C12.6 2 5 9.6 5 19c0 13.5 17 43 17 43S39 32.5 39 19C39 9.6 31.4 2 22 2z" fill="${color}" stroke="${border}" stroke-width="${bw}"/>
      </svg>
      <div style="position:absolute;top:3px;left:50%;transform:translateX(-50%);width:${size - 8}px;height:${size - 8}px;border-radius:50%;overflow:hidden;border:2px solid ${border};">
        <img src="${foto}" style="width:100%;height:100%;object-fit:cover;" />
      </div>
      <div style="position:absolute;bottom:${h - 58}px;right:-2px;width:12px;height:12px;border-radius:50%;background:${dotColor};border:1.5px solid #0d1b2a;"></div>
    </div>`;
  }

  return `<svg width="${size}" height="${h}" viewBox="0 0 44 64" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 3px 8px rgba(0,0,0,0.7))">
    <path d="M22 2C12.6 2 5 9.6 5 19c0 13.5 17 43 17 43S39 32.5 39 19C39 9.6 31.4 2 22 2z" fill="${color}" stroke="${border}" stroke-width="${bw}"/>
  </svg>`;
}

// Gera SVG de pin para evento de agenda
function eventoPinSvg(color: string, selected = false): string {
  const size = selected ? 40 : 32;
  const h = Math.round(size * 1.45);
  const border = selected ? 'var(--text-primary)' : 'var(--tint-45)';
  const bw = selected ? 3 : 1.5;
  return `<svg width="${size}" height="${h}" viewBox="0 0 40 58" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 3px 8px rgba(0,0,0,0.6))">
    <path d="M20 2C11.2 2 4 9.2 4 18c0 12.3 16 38 16 38S36 30.3 36 18C36 9.2 28.8 2 20 2z" fill="${color}" stroke="${border}" stroke-width="${bw}"/>
    <path d="M13 14h14v2H13z M13 19h14v1.5H13z M13 23h10v1.5H13z" fill="var(--text-primary)"/>
    <rect x="12" y="11" width="16" height="15" rx="2" fill="none" stroke="var(--tint-65)" stroke-width="1.2"/>
  </svg>`;
}

function contatoPinSvg(): string {
  return `<svg width="30" height="43" viewBox="0 0 30 43" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 3px 8px rgba(0,0,0,0.7))">
    <path d="M15 1C7.8 1 2 6.8 2 14c0 9.8 13 28 13 28S28 23.8 28 14C28 6.8 22.2 1 15 1z" fill="#14b8a6" stroke="var(--tint-55)" stroke-width="1.5"/>
    <circle cx="15" cy="12" r="4" fill="var(--text-primary)"/>
    <path d="M8 22c0-3.9 3.1-6 7-6s7 2.1 7 6" fill="var(--text-primary)"/>
  </svg>`;
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------
export default function DemandaMapLeaflet({
  demands,
  agendaEvents,
  contatos = [],
  center,
  selectedDemandId,
  selectedEventId,
  onDemandClick,
  onEventClick,
  showSpDistritos = false,
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const { mapInstanceRef, cleanupMap, isUnmounted } = useMapCleanup();
  const markersRef = useRef<Map<string, any>>(new Map());
  const lRef = useRef<any>(null); // instância do Leaflet, disponível após init
  const [mapReady, setMapReady] = useState(false);

  // Callback refs — sempre atuais sem precisar de deps
  const onDemandClickRef = useRef(onDemandClick);
  const onEventClickRef = useRef(onEventClick);
  onDemandClickRef.current = onDemandClick;
  onEventClickRef.current = onEventClick;

  // ── Effect 1: Inicializa mapa UMA VEZ (tiles + GeoJSON IBGE, sem marcadores)
  useEffect(() => {
    if (!mapRef.current) return;
    let cancelled = false;

    (async () => {
      if (isUnmounted()) return;
      const L = (await import('leaflet')).default;
      if (cancelled || isUnmounted() || !mapRef.current) return;

      cleanupMap();
      markersRef.current.forEach(m => { try { m.remove(); } catch {} });
      markersRef.current.clear();

      const map = L.map(mapRef.current!, {
        center: [-15.78, -47.93],
        zoom: 5,
        zoomControl: false,
        attributionControl: false,
        preferCanvas: false,
      });
      mapInstanceRef.current = map;
      lRef.current = L;

      L.control.zoom({ position: 'bottomright' }).addTo(map);
      camadaBase(L).addTo(map);

      // ── Contornos de estados e municípios
      const CODE_TO_UF: Record<string, string> = {
        '12':'AC','27':'AL','16':'AP','13':'AM','29':'BA','23':'CE','53':'DF',
        '32':'ES','52':'GO','21':'MA','51':'MT','50':'MS','31':'MG','15':'PA',
        '25':'PB','41':'PR','26':'PE','22':'PI','33':'RJ','24':'RN','43':'RS',
        '11':'RO','14':'RR','42':'SC','35':'SP','28':'SE','17':'TO',
      };
      const muniCache = new Set<string>();
      const isMapStale = () => cancelled || isUnmounted() || mapInstanceRef.current !== map;
      const muniLayerGroup = L.layerGroup();
      if (!isMapStale()) muniLayerGroup.addTo(map);
      const stateFeatures: any[] = [];

      try {
        const res = await fetch('/api/ibge/geojson?type=brasil');
        if (res.ok && !isMapStale()) {
          const data = await res.json();
          if (!isMapStale()) {
            L.geoJSON(data, {
              style: () => ({ weight: 0.8, color: 'rgba(80,140,200,0.6)', fillOpacity: 0, interactive: false }),
            }).addTo(map);
            stateFeatures.push(...(data.features ?? []));
          }
        }
      } catch (_) {}

      const loadVisibleMunis = async () => {
        if (isMapStale() || map.getZoom() < 7) return;
        const bounds = map.getBounds();
        const ufsToLoad = stateFeatures
          .filter((f: any) => {
            const uf = CODE_TO_UF[f?.properties?.codarea ?? ''];
            if (!uf || muniCache.has(uf)) return false;
            try { return bounds.intersects(L.geoJSON(f).getBounds()); }
            catch (_) { return false; }
          })
          .map((f: any) => CODE_TO_UF[f?.properties?.codarea ?? ''])
          .filter(Boolean);

        for (const uf of ufsToLoad) {
          if (muniCache.has(uf) || isMapStale()) break;
          muniCache.add(uf);
          try {
            const res = await fetch(`/api/ibge/geojson?type=estado&uf=${uf}`);
            if (!res.ok || isMapStale()) continue;
            const data = await res.json();
            if (!isMapStale()) {
              L.geoJSON(data, {
                style: () => ({ weight: 0.4, color: 'rgba(80,140,200,0.35)', fillOpacity: 0, interactive: false }),
              }).addTo(muniLayerGroup);
            }
          } catch (_) {}
        }
      };

      map.on('zoomend moveend', loadVisibleMunis);
      loadVisibleMunis();

      // ── Camada visual dos distritos de SP
      if (showSpDistritos) {
        (async () => {
          try {
            if (!spDistritosGeoCache) {
              const r = await fetch('/geojson/sp-distritos.geojson');
              if (!r.ok || isMapStale()) return;
              spDistritosGeoCache = await r.json();
            }
            if (isMapStale()) return;

            const spLayer = L.geoJSON(spDistritosGeoCache, {
              style: () => ({
                weight: 1,
                color: 'rgba(100,180,240,0.45)',
                fillOpacity: 0,
                interactive: false,
              }),
            });

            const updateVisibility = () => {
              if (isMapStale()) return;
              if (map.getZoom() >= 11) {
                if (!map.hasLayer(spLayer)) spLayer.addTo(map);
              } else {
                if (map.hasLayer(spLayer)) map.removeLayer(spLayer);
              }
            };
            map.on('zoomend', updateVisibility);
            updateVisibility();
          } catch (_) {}
        })();
      }

      if (!cancelled && !isUnmounted()) setMapReady(true);
    })();

    return () => {
      cancelled = true;
      setMapReady(false);
      lRef.current = null;
      cleanupMap();
      markersRef.current.forEach(m => { try { m.remove(); } catch {} });
      markersRef.current.clear();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Effect 2: Atualiza marcadores quando os dados mudam (SEM reconstruir o mapa)
  useEffect(() => {
    const L = lRef.current;
    const map = mapInstanceRef.current;
    if (!mapReady || !L || !map) return;

    // Remove marcadores antigos do mapa (mantém o mapa, tiles e GeoJSON intactos)
    markersRef.current.forEach(m => { try { m.remove(); } catch {} });
    markersRef.current.clear();

    const allBounds: [number, number][] = [];

    // ── Pins de demandas
    demands.forEach((d) => {
      if (!d.lat || !d.lng) return;
      const catColor = CATEGORY_COLORS[d.category as keyof typeof CATEGORY_COLORS] ?? '#9e9e9e';
      const statusColor = STATUS_COLORS[d.status] ?? '#9e9e9e';
      const isSelected = d.id === selectedDemandId;
      const size = isSelected ? 44 : 36;
      const h = Math.round(size * 1.45);
      const html = demandaPinSvg(statusColor, catColor, d.foto, isSelected);
      const marker = L.marker([d.lat, d.lng], {
        icon: L.divIcon({ html, className: '', iconSize: [size, h], iconAnchor: [size / 2, h], tooltipAnchor: [0, -(h + 4)] }),
        zIndexOffset: isSelected ? 1000 : 0,
      });
      marker.addTo(map);
      marker.on('click', () => onDemandClickRef.current(d.id));
      marker.bindTooltip(
        `<div style="background:rgba(13,27,42,0.97);padding:10px 14px;border-radius:10px;border:1px solid #1b4965;min-width:180px;max-width:240px;">
          ${d.foto ? `<img src="${d.foto}" style="width:100%;height:80px;object-fit:cover;border-radius:6px;margin-bottom:8px;" />` : ''}
          <div style="font-weight:600;color:#7dd3fc;font-size:13px;margin-bottom:3px;">${d.title}</div>
          <div style="color:#94a3b8;font-size:11px;margin-bottom:2px;">${d.solicitante}</div>
          ${d.endereco ? `<div style="color:#64748b;font-size:11px;">${d.endereco}</div>` : `<div style="color:#64748b;font-size:11px;">${d.municipio}, ${d.estado}</div>`}
          <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">
            <span style="background:${catColor}22;color:${catColor};border-radius:4px;padding:2px 7px;font-size:10px;">${CATEGORY_LABELS[d.category] ?? d.category}</span>
            <span style="background:${statusColor}22;color:${statusColor};border-radius:4px;padding:2px 7px;font-size:10px;">${STATUS_LABELS[d.status] ?? d.status}</span>
          </div>
        </div>`,
        { permanent: false, direction: 'top', className: 'demanda-tooltip', offset: [0, -h] }
      );
      markersRef.current.set(`d-${d.id}`, marker);
      allBounds.push([d.lat, d.lng]);
    });

    // ── Pins de eventos
    agendaEvents.forEach((e) => {
      if (!e.lat || !e.lng) return;
      const eColor = e.cor ?? TIPO_AGENDA_COLORS[e.tipo] ?? '#6366f1';
      const isSelected = e.id === selectedEventId;
      const size = isSelected ? 40 : 32;
      const h = Math.round(size * 1.45);
      const html = eventoPinSvg(eColor, isSelected);
      const marker = L.marker([e.lat, e.lng], {
        icon: L.divIcon({ html, className: '', iconSize: [size, h], iconAnchor: [size / 2, h], tooltipAnchor: [0, -(h + 4)] }),
        zIndexOffset: isSelected ? 900 : 0,
      });
      marker.addTo(map);
      marker.on('click', () => onEventClickRef.current(e.id));
      marker.bindTooltip(
        `<div style="background:rgba(13,27,42,0.97);padding:10px 14px;border-radius:10px;border:1px solid ${eColor}44;min-width:160px;">
          <div style="font-weight:600;color:${eColor};font-size:13px;margin-bottom:3px;">${e.titulo}</div>
          <div style="color:#94a3b8;font-size:11px;">${TIPO_AGENDA_LABELS[e.tipo]} · ${new Date(e.data).toLocaleDateString('pt-BR')}</div>
          ${e.local ? `<div style="color:#64748b;font-size:11px;margin-top:2px;">${e.local}</div>` : ''}
        </div>`,
        { permanent: false, direction: 'top', className: 'demanda-tooltip', offset: [0, -h] }
      );
      markersRef.current.set(`e-${e.id}`, marker);
      allBounds.push([e.lat, e.lng]);
    });

    // ── Pins de contatos
    contatos.forEach((c) => {
      if (!c.lat || !c.lng) return;
      const html = contatoPinSvg();
      const marker = L.marker([c.lat, c.lng], {
        icon: L.divIcon({ html, className: '', iconSize: [30, 43], iconAnchor: [15, 43], tooltipAnchor: [0, -47] }),
        zIndexOffset: 0,
      });
      marker.addTo(map);
      marker.bindTooltip(
        `<div style="background:rgba(13,27,42,0.97);padding:10px 14px;border-radius:10px;border:1px solid #14b8a622;min-width:160px;">
          <div style="font-weight:600;color:#2dd4bf;font-size:13px;margin-bottom:3px;">${c.nome}</div>
          <div style="color:#94a3b8;font-size:11px;margin-bottom:2px;">📞 ${c.numero}</div>
          ${c.email ? `<div style="color:#94a3b8;font-size:11px;margin-bottom:2px;">✉ ${c.email}</div>` : ''}
          ${c.endereco ? `<div style="color:#64748b;font-size:11px;">${c.endereco}</div>` : ''}
        </div>`,
        { permanent: false, direction: 'top', className: 'demanda-tooltip', offset: [0, -43] }
      );
      markersRef.current.set(`c-${c.id}`, marker);
      allBounds.push([c.lat, c.lng]);
    });

    // Ajustar bounds apenas quando há marcadores
    if (allBounds.length > 0) {
      try {
        map.fitBounds(L.latLngBounds(allBounds), { padding: [60, 60], maxZoom: 14 });
      } catch (_) {}
    }
  }, [mapReady, demands, agendaEvents, contatos, selectedDemandId, selectedEventId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Effect 3: Centralizar quando o centro externo mudar
  useEffect(() => {
    if (!center || !mapInstanceRef.current) return;
    mapInstanceRef.current.setView(center, Math.max(mapInstanceRef.current.getZoom(), 14), { animate: true });
  }, [center]);

  return (
    <>
      <style>{`
        .demanda-tooltip .leaflet-tooltip {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
        .leaflet-tooltip.demanda-tooltip {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
      `}</style>
      <div ref={mapRef} className="w-full h-full" style={{ background: '#0d1b2a' }} />
    </>
  );
}
