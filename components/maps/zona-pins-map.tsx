'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useMapCleanup } from '@/hooks/use-map-cleanup';
import { camadaBase } from '@/lib/maps/basemap';

export interface ZonaPinData {
  zona: number;
  latitude: number;
  longitude: number;
  votos: number;
  bairros: string[];
  locais: any[];
}

interface ZonaPinsMapProps {
  municipio: string;
  zonas: ZonaPinData[];
  bounds: {
    minLat: number; maxLat: number;
    minLng: number; maxLng: number;
    centerLat: number; centerLng: number;
  } | null;
  selectedZona?: number | null;
  onZonaClick?: (zona: ZonaPinData) => void;
}

function formatVotos(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1).replace('.0', '')}k`;
  return v.toString();
}

function ZonaPinsMap({ municipio, zonas, bounds, selectedZona, onZonaClick }: ZonaPinsMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<number, { circle: any; label: any }>>(new Map());
  const isInitializingRef = useRef(false);
  const { mapInstanceRef, cleanupMap, isUnmounted } = useMapCleanup();

  const renderMarkers = useCallback(async (map: any) => {
    const L = (await import('leaflet')).default;

    // Limpar marcadores anteriores
    markersRef.current.forEach(({ circle, label }) => {
      circle.remove();
      label.remove();
    });
    markersRef.current.clear();

    const zonasValidas = zonas.filter(z => z.latitude && z.longitude);
    if (zonasValidas.length === 0) return;

    const maxVotos = Math.max(...zonasValidas.map(z => z.votos), 1);

    zonasValidas.forEach(zona => {
      const isSelected = selectedZona === zona.zona;
      const intensity = maxVotos > 0 ? zona.votos / maxVotos : 0;
      const radius = Math.max(8, Math.min(16, 8 + intensity * 8));

      const color = isSelected ? '#facc15' : '#0891b2';
      const borderColor = isSelected ? '#f59e0b' : '#22d3ee';

      const circle = L.circleMarker([zona.latitude, zona.longitude], {
        radius,
        fillColor: color,
        color: borderColor,
        weight: isSelected ? 3 : 2,
        opacity: 1,
        fillOpacity: 0.88,
      } as any).addTo(map);

      const bairrosText = zona.bairros.length > 0
        ? zona.bairros.slice(0, 3).join(', ') + (zona.bairros.length > 3 ? ` +${zona.bairros.length - 3}` : '')
        : 'Não informado';

      circle.bindTooltip(`
        <div style="background:rgba(13,27,42,0.97);padding:10px 14px;border-radius:10px;border:1px solid #1b4965;min-width:180px;">
          <div style="font-weight:800;color:#38bdf8;font-size:14px;margin-bottom:4px;">Zona ${zona.zona}</div>
          ${zona.votos > 0
            ? `<div style="color:#4ade80;font-size:16px;font-weight:700;margin-bottom:4px;">${zona.votos.toLocaleString('pt-BR')} votos</div>`
            : ''}
          <div style="color:#94a3b8;font-size:10px;margin-top:4px;">${bairrosText}</div>
        </div>
      `, { permanent: false, direction: 'top', className: 'zona-pin-tooltip', offset: [0, -radius] });

      circle.on('click', () => { if (onZonaClick) onZonaClick(zona); });

      // Label com votos dentro do círculo
      const labelIcon = L.divIcon({
        className: '',
        html: `<div style="
          width:${radius * 2}px;height:${radius * 2}px;
          display:flex;align-items:center;justify-content:center;
          font-weight:800;color:${isSelected ? '#0f2942' : '#fff'};
          font-size:${Math.max(8, Math.min(11, radius * 0.65))}px;
          text-shadow:0 1px 2px rgba(0,0,0,0.4);
          pointer-events:none;
        ">${zona.votos > 0 ? formatVotos(zona.votos) : zona.zona}</div>`,
        iconSize: [radius * 2, radius * 2],
        iconAnchor: [radius, radius],
      });

      const label = L.marker([zona.latitude, zona.longitude], { icon: labelIcon, interactive: false }).addTo(map);

      markersRef.current.set(zona.zona, { circle, label });
    });
  }, [zonas, selectedZona, onZonaClick]);

  // Inicializar mapa
  useEffect(() => {
    if (!mapRef.current || zonas.length === 0) return;
    if (isInitializingRef.current) return;
    isInitializingRef.current = true;

    const initMap = async () => {
      if (isUnmounted()) { isInitializingRef.current = false; return; }

      const L = (await import('leaflet')).default;
      cleanupMap();
      markersRef.current.clear();

      const center: [number, number] = bounds
        ? [bounds.centerLat, bounds.centerLng]
        : [-15.78, -47.93];

      const map = L.map(mapRef.current!, {
        center,
        zoom: 11,
        zoomControl: true,
        scrollWheelZoom: true,
        attributionControl: false,
        preferCanvas: false,
      });

      mapInstanceRef.current = map;

      camadaBase(L).addTo(map);

      await renderMarkers(map);

      // Usar bounding box dos centroides das zonas (não dos locais brutos)
      // para manter o zoom próximo ao do Mapa Eleitoral
      const zonasValidas = zonas.filter(z => z.latitude && z.longitude);
      if (zonasValidas.length > 0) {
        const lats = zonasValidas.map(z => z.latitude);
        const lngs = zonasValidas.map(z => z.longitude);
        map.fitBounds(
          [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]],
          { padding: [50, 50] }
        );
      }

      isInitializingRef.current = false;
    };

    initMap();
    return () => { isInitializingRef.current = false; cleanupMap(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zonas, bounds]);

  // Atualizar marcadores quando zona selecionada muda
  useEffect(() => {
    if (!mapInstanceRef.current || markersRef.current.size === 0) return;
    renderMarkers(mapInstanceRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedZona]);

  if (zonas.length === 0) {
    return (
      <div className="w-full h-full bg-[#0d1b2a] rounded-xl flex items-center justify-center">
        <span className="text-slate-600 dark:text-slate-400 text-sm">Nenhuma zona eleitoral encontrada para {municipio}</span>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-sm text-gray-400">
          {zonas.filter(z => z.latitude && z.longitude).length} zonas eleitorais em {municipio}
        </span>
        <span className="text-xs text-slate-600 dark:text-slate-500">Clique em um pin para editar a projeção</span>
      </div>
      <div
        ref={mapRef}
        className="w-full flex-1 rounded-xl overflow-hidden border border-[#1b4965]"
        style={{ background: '#0d1b2a', minHeight: 0 }}
      />
    </div>
  );
}

export default ZonaPinsMap;
