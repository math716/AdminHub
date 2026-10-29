'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { camadaBase } from '@/lib/maps/basemap';
import { urlDados } from '@/lib/dados-url';
import { Colaborador, DF_ZONAS, DF_ZONA_COORDS, getZoneMarkerHtml, normalizeRegiao } from './tipos';



// ---------------------------------------------------------------------------
// Leaflet map — defined inline; dynamic import of Leaflet happens inside
// via useEffect so SSR is never triggered (no top-level import 'leaflet').
// ---------------------------------------------------------------------------

export interface ColaboradoresMapProps {
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
export interface ZonasMapProps {
  colaboradoresByZona: Record<number, Colaborador[]>;
  selectedZona: number | null;
  onZonaClick: (zona: number) => void;
}

export function ZonasMapInner({ colaboradoresByZona, selectedZona, onZonaClick }: ZonasMapProps) {
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

      camadaBase(L).addTo(map);

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
export function ColaboradoresMapInner({
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
    fetch(urlDados('/geojson/df-regioes-administrativas.geojson'))
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

      camadaBase(L).addTo(map);

      const tooltipEl = L.DomUtil.create('div', '', map.getContainer()) as HTMLElement;
      tooltipEl.style.cssText = [
        'position:absolute', 'z-index:10000', 'pointer-events:none', 'display:none',
        'padding:10px 14px', 'background:var(--bg-card-raised)', 'border-radius:8px',
        'border:1px solid var(--border-default)', 'min-width:160px', 'box-shadow:var(--shadow-raised)',
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
              layer.setStyle({ fillOpacity: 0.1, fillColor: '#f59e0b', weight: 2, color: '#f59e0b', opacity: 0.9 });
            }
            tooltipEl.innerHTML = [
              `<strong style="color:var(--acento-azul);font-size:14px;display:block;margin-bottom:4px;">${nome}</strong>`,
              colabs.length > 0
                ? `<span style="color:var(--text-secondary);font-size:13px;">${colabs.length} colaborador${colabs.length > 1 ? 'es' : ''}</span>`
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
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--acento-azul)' }} />
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
