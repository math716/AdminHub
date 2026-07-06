'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useMapCleanup } from '@/hooks/use-map-cleanup';
import { Loader2 } from 'lucide-react';

interface SpDistritosMapProps {
  votesData?: Record<string, number>;
  selectedDistrito?: string | null;
  onDistritoClick?: (nome: string) => void;
  height?: string;
}

function normalizeNome(nome: string): string {
  return nome
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function fmtVotos(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return String(v);
}

function SpDistritosMapComponent({ votesData, selectedDistrito, onDistritoClick, height = '100%' }: SpDistritosMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const isInitializingRef = useRef(false);
  const geoLayerRef = useRef<any>(null);
  const voteLabelsGroupRef = useRef<any>(null);
  const selectedLayerRef = useRef<any>(null);
  const selectedDistritoRef = useRef<string | null>(selectedDistrito ?? null);
  const onDistritoClickRef = useRef(onDistritoClick);
  const votesDataRef = useRef(votesData);
  const [loading, setLoading] = useState(true);
  const [geoData, setGeoData] = useState<any>(null);

  const { mapInstanceRef, cleanupMap, registerLayer, isUnmounted } = useMapCleanup();

  useEffect(() => { onDistritoClickRef.current = onDistritoClick; }, [onDistritoClick]);
  useEffect(() => { selectedDistritoRef.current = selectedDistrito ?? null; }, [selectedDistrito]);
  useEffect(() => { votesDataRef.current = votesData; }, [votesData]);

  useEffect(() => {
    fetch('/geojson/sp-distritos.geojson')
      .then(r => r.json())
      .then(data => { setGeoData(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const getNome = (feature: any): string =>
    feature?.properties?.nm_distrito_municipal || feature?.properties?.ds_nome || '';

  const getVotos = useCallback((nome: string): number | undefined => {
    const data = votesDataRef.current;
    if (!data) return undefined;
    const nomeNorm = normalizeNome(nome);
    for (const [k, v] of Object.entries(data)) {
      if (normalizeNome(k) === nomeNorm) return v;
    }
    return undefined;
  }, []);

  const getColor = useCallback((nome: string): string => {
    const data = votesDataRef.current;
    if (!data || Object.keys(data).length === 0) return '#dce8f5';
    const nomeNorm = normalizeNome(nome);
    let votos: number | undefined;
    for (const [k, v] of Object.entries(data)) {
      if (normalizeNome(k) === nomeNorm) { votos = v; break; }
    }
    if (votos === undefined || votos === 0) return '#dce8f5';
    const maxV = Math.max(...Object.values(data).filter(v => v > 0), 1);
    const intensity = votos / maxV;
    const lightness = Math.round(85 - intensity * 55);
    const saturation = Math.round(55 + intensity * 35);
    return `hsl(210, ${saturation}%, ${lightness}%)`;
  }, []);

  const rebuildVoteLabels = useCallback(async (map: any) => {
    const L = (await import('leaflet')).default;
    const geoLayer = geoLayerRef.current;
    if (!geoLayer || !map) return;

    if (voteLabelsGroupRef.current) map.removeLayer(voteLabelsGroupRef.current);

    const data = votesDataRef.current;
    if (!data || Object.keys(data).length === 0) {
      voteLabelsGroupRef.current = null;
      return;
    }

    const group = L.layerGroup().addTo(map);
    voteLabelsGroupRef.current = group;

    geoLayer.eachLayer((layer: any) => {
      const nome = getNome(layer.feature);
      const votos = getVotos(nome);
      if (!votos || votos === 0) return;
      try {
        let centerLat: number, centerLng: number;
        const latlngs = layer.getLatLngs?.();
        const ring: any[] = latlngs?.[0] ?? [];
        const n = ring.length;
        if (n >= 3) {
          const lats = ring.map((p: any) => p.lat);
          const minLat = Math.min(...lats);
          const maxLat = Math.max(...lats);
          const threshold = maxLat - (maxLat - minLat) * 0.40;
          const north = ring.filter((p: any) => p.lat >= threshold);
          const pts = north.length >= 3 ? north : ring;
          centerLat = pts.reduce((s: number, p: any) => s + p.lat, 0) / pts.length;
          centerLng = pts.reduce((s: number, p: any) => s + p.lng, 0) / pts.length;
        } else {
          const bc = layer.getBounds().getCenter();
          centerLat = bc.lat; centerLng = bc.lng;
        }
        const label = fmtVotos(votos);
        const sz = label.length <= 2 ? 28 : label.length <= 3 ? 32 : label.length <= 4 ? 36 : 40;
        const fs = sz <= 28 ? 9 : 10;
        const marker = L.marker([centerLat, centerLng], {
          icon: L.divIcon({
            html: `<div style="
              width:${sz}px;height:${sz}px;
              background:rgba(7,29,54,0.88);
              color:#7dd3fc;
              font-size:${fs}px;font-weight:800;
              border-radius:50%;
              border:2px solid rgba(74,158,222,0.5);
              display:flex;align-items:center;justify-content:center;
              pointer-events:none;
              box-shadow:0 2px 6px rgba(0,0,0,0.4);
              font-family:'Segoe UI',system-ui,sans-serif;
              letter-spacing:-0.5px;
            ">${label}</div>`,
            className: '',
            iconSize: [sz, sz] as [number, number],
            iconAnchor: [sz / 2, sz / 2] as [number, number],
          }),
          interactive: false,
          pane: 'voteLabelsPane',
        });
        group.addLayer(marker);
      } catch (_) {}
    });
  }, [getVotos]);

  useEffect(() => {
    if (!geoData || !mapRef.current) return;
    if (isInitializingRef.current) return;
    isInitializingRef.current = true;

    let cancelled = false;

    const initMap = async () => {
      const L = (await import('leaflet')).default;
      if (cancelled) { isInitializingRef.current = false; return; }
      cleanupMap();
      if (!mapRef.current) { isInitializingRef.current = false; return; }

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

      map.createPane('distritosPane');
      map.createPane('voteLabelsPane');
      const distritosPane = map.getPane('distritosPane');
      const voteLabelsPane = map.getPane('voteLabelsPane');
      if (distritosPane) distritosPane.style.zIndex = '400';
      if (voteLabelsPane) voteLabelsPane.style.zIndex = '450';

      const style = (feature: any, isSelected = false) => ({
        fillColor: isSelected ? '#1565c0' : getColor(getNome(feature)),
        fillOpacity: isSelected ? 0.35 : 0.12,
        color: isSelected ? '#4a9ede' : '#9ab8d4',
        weight: isSelected ? 2.5 : 1,
        opacity: 1,
      });

      // Tooltip custom — evita o container padrão do Leaflet que gera quadrado preto
      const tooltipEl = L.DomUtil.create('div', '', map.getContainer()) as HTMLElement;
      tooltipEl.style.cssText = [
        'position:absolute', 'z-index:10000', 'pointer-events:none', 'display:none',
        'padding:10px 14px', 'background:rgba(13,27,42,0.97)', 'border-radius:8px',
        'border:1px solid #1b4965', 'min-width:140px', 'box-shadow:0 4px 20px rgba(0,0,0,0.5)',
        'white-space:nowrap', 'font-family:system-ui,sans-serif',
      ].join(';');

      const geoLayer = L.geoJSON(geoData, {
        pane: 'distritosPane',
        style: (feature: any) => style(feature, false),
        onEachFeature: (feature: any, layer: any) => {
          const nome = getNome(feature);

          layer.on('click', () => {
            if (selectedLayerRef.current && selectedLayerRef.current !== layer) {
              selectedLayerRef.current.setStyle(style(selectedLayerRef.current.feature, false));
            }
            layer.setStyle(style(feature, true));
            layer.bringToFront();
            selectedLayerRef.current = layer;
            selectedDistritoRef.current = nome;
            onDistritoClickRef.current?.(nome);
            tooltipEl.style.display = 'none';
          });

          layer.on('mouseover', () => {
            if (selectedDistritoRef.current !== nome) {
              layer.setStyle({ weight: 2, fillOpacity: 0.18, color: '#4a9ede' });
              layer.bringToFront();
            }
            const v = getVotos(nome);
            tooltipEl.innerHTML = [
              `<strong style="color:#7dd3fc;font-size:14px;display:block;margin-bottom:4px;">${nome}</strong>`,
              v !== undefined
                ? `<span style="color:#e2e8f0;font-size:13px;">${v.toLocaleString('pt-BR')} votos</span>`
                : '<span style="color:#64748b;font-size:12px;">Sem dados de votos</span>',
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
            const mapH = map.getContainer().offsetHeight;
            let left = pt.x + 14;
            let top = pt.y - h - 10;
            if (left + w > mapW) left = pt.x - w - 14;
            if (top < 0) top = pt.y + 10;
            tooltipEl.style.left = left + 'px';
            tooltipEl.style.top = top + 'px';
          });

          layer.on('mouseout', () => {
            if (selectedDistritoRef.current !== nome) {
              layer.setStyle(style(feature, false));
            }
            tooltipEl.style.display = 'none';
          });
        },
      }).addTo(map);

      geoLayerRef.current = geoLayer;
      registerLayer(geoLayer);

      if (selectedDistritoRef.current) {
        geoLayer.eachLayer((layer: any) => {
          const n = getNome(layer.feature);
          if (normalizeNome(n) === normalizeNome(selectedDistritoRef.current!)) {
            layer.setStyle(style(layer.feature, true));
            selectedLayerRef.current = layer;
          }
        });
      }

      // Esconde labels de votos em zoom baixo (mapa mostrando a cidade inteira)
      const updateLabelVisibility = () => {
        const pane = map.getPane('voteLabelsPane');
        if (pane) pane.style.display = map.getZoom() < 11 ? 'none' : '';
      };
      map.on('zoomend', updateLabelVisibility);

      const bounds = geoLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [30, 30] });
        map.once('moveend', updateLabelVisibility);
      }

      isInitializingRef.current = false;

      await rebuildVoteLabels(map);
    };

    initMap().catch(() => { isInitializingRef.current = false; });
    return () => { cancelled = true; isInitializingRef.current = false; cleanupMap(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoData]);

  useEffect(() => {
    const geoLayer = geoLayerRef.current;
    const map = mapInstanceRef.current;
    if (!geoLayer) return;

    geoLayer.eachLayer((l: any) => {
      const nome = getNome(l.feature);
      const isSelected = selectedDistrito ? normalizeNome(nome) === normalizeNome(selectedDistrito) : false;
      l.setStyle({
        fillColor: isSelected ? '#1565c0' : getColor(nome),
        fillOpacity: isSelected ? 0.35 : 0.12,
        color: isSelected ? '#4a9ede' : '#9ab8d4',
        weight: isSelected ? 2.5 : 1,
      });
      if (isSelected) { l.bringToFront(); selectedLayerRef.current = l; }
    });

    if (map) rebuildVoteLabels(map);
  }, [votesData, selectedDistrito, getColor, rebuildVoteLabels]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#f0f4f8] rounded-xl">
        <Loader2 className="h-8 w-8 animate-spin text-sky-400" />
      </div>
    );
  }

  return (
    <div className="relative" style={{ height }}>
      <div
        ref={mapRef}
        className="w-full h-full rounded-xl overflow-hidden"
        style={{ background: '#f0f4f8', minHeight: '400px' }}
      />
      <div className="absolute bottom-3 left-3 z-[1000] bg-white/90 backdrop-blur-md rounded-xl border border-gray-200 px-4 py-2.5 text-xs shadow-md">
        <div className="flex items-center gap-2">
          <div className="w-5 h-3 rounded-sm" style={{ background: '#4a9ede', border: '1px solid #9ab8d4', opacity: 0.6 }} />
          <span className="text-gray-600 font-medium">Distritos Municipais – São Paulo</span>
        </div>
      </div>
    </div>
  );
}

export default SpDistritosMapComponent;
