'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

export interface ContatoMapItem {
  id: string;
  nome: string;
  numero: string;
  lat: number;
  lng: number;
  endereco?: string | null;
}

interface Props {
  contacts: ContatoMapItem[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  height?: string;
  municipio?: string;
  showSpDistritos?: boolean;
  onDistritoSelect?: (nome: string, ids: string[]) => void;
}

const GOLD = '#c9a227';
const BLUE = '#4a9ede';
const DARK = '#071d36';

// Cache do GeoJSON de distritos SP (persiste entre re-renders)
let spDistritosGeoCache: any = null;

// ---------------------------------------------------------------------------
// Ponto dentro de polígono — ray casting (coords GeoJSON = [lng, lat])
// ---------------------------------------------------------------------------
function pointInRing(lat: number, lng: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]; // lng, lat
    const xj = ring[j][0], yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function contactInFeature(lat: number, lng: number, feature: any): boolean {
  const geom = feature.geometry;
  if (!geom) return false;
  if (geom.type === 'Polygon') return pointInRing(lat, lng, geom.coordinates[0]);
  if (geom.type === 'MultiPolygon') {
    return (geom.coordinates as number[][][][]).some(poly => pointInRing(lat, lng, poly[0]));
  }
  return false;
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------
export default function ContatosMunicipioMap({
  contacts,
  selectedIds,
  onToggle,
  height = '100%',
  showSpDistritos = false,
  onDistritoSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<any>(null);
  const markersRef   = useRef<Map<string, any>>(new Map());
  const leafletRef   = useRef<any>(null);
  const spLayerRef   = useRef<any>(null);
  const selectedSpLayerRef = useRef<any>(null);

  // Dispara re-run do efeito de distritos após o mapa estar pronto
  const [mapReady, setMapReady] = useState(false);

  // Ref para sempre ter contacts atuais no handler do polígono
  const contactsRef = useRef(contacts);
  useEffect(() => { contactsRef.current = contacts; }, [contacts]);

  const onDistritoSelectRef = useRef(onDistritoSelect);
  useEffect(() => { onDistritoSelectRef.current = onDistritoSelect; }, [onDistritoSelect]);

  const makeIcon = useCallback((L: any, selected: boolean) => {
    const color = selected ? GOLD : BLUE;
    const ring  = selected ? '#e6b83a' : '#1a5fa8';
    return L.divIcon({
      html: `<div style="
        width:28px;height:28px;border-radius:50%;
        background:${color};
        border:3px solid ${ring};
        box-shadow:0 2px 8px rgba(0,0,0,0.5);
        display:flex;align-items:center;justify-content:center;
        cursor:pointer;
        transition:all 0.15s;
      ">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="white">
          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.7A2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.18 6.18l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
        </svg>
      </div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      className: '',
    });
  }, []);

  // Initial mount — cria o mapa e adiciona os marcadores iniciais
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let cancelled = false;
    (async () => {
      const L = await import('leaflet');
      if (cancelled || !containerRef.current) return;
      leafletRef.current = L;

      const lats = contacts.map(c => c.lat);
      const lngs = contacts.map(c => c.lng);
      const centerLat = lats.length ? lats.reduce((a, b) => a + b, 0) / lats.length : -15.78;
      const centerLng = lngs.length ? lngs.reduce((a, b) => a + b, 0) / lngs.length : -47.93;

      const map = L.map(containerRef.current, {
        center: [centerLat, centerLng],
        zoom: contacts.length ? 12 : 5,
        zoomControl: true,
      });
      mapRef.current = map;

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '',
        maxZoom: 19,
      }).addTo(map);

      contacts.forEach(c => {
        const marker = L.marker([c.lat, c.lng], {
          icon: makeIcon(L, selectedIds.has(c.id)),
        });
        marker.bindTooltip(`
          <div style="background:${DARK};border:1px solid rgba(201,162,39,0.3);border-radius:8px;padding:8px 12px;color:#fff;font-size:12px;min-width:140px">
            <strong style="color:#c9a227">${c.nome}</strong><br>
            <span style="color:rgba(255,255,255,0.6)">${c.numero}</span>
            ${c.endereco ? `<br><span style="color:rgba(255,255,255,0.4);font-size:11px">${c.endereco}</span>` : ''}
          </div>
        `, { className: 'dark-map-tooltip', permanent: false, direction: 'top' });
        marker.on('click', () => onToggle(c.id));
        marker.addTo(map);
        markersRef.current.set(c.id, marker);
      });

      if (contacts.length > 0) {
        const bounds = L.latLngBounds(contacts.map(c => [c.lat, c.lng] as [number, number]));
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14, animate: false });
      }

      if (!cancelled) setMapReady(true);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Atualizar ícones quando seleção muda
  useEffect(() => {
    const L = leafletRef.current;
    if (!L) return;
    markersRef.current.forEach((marker, id) => {
      marker.setIcon(makeIcon(L, selectedIds.has(id)));
    });
  }, [selectedIds, makeIcon]);

  // Adicionar/remover marcadores quando lista de contatos muda
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    const existingIds = new Set(markersRef.current.keys());
    const newIds = new Set(contacts.map(c => c.id));

    existingIds.forEach(id => {
      if (!newIds.has(id)) {
        markersRef.current.get(id)?.remove();
        markersRef.current.delete(id);
      }
    });

    contacts.forEach(c => {
      if (existingIds.has(c.id)) return;
      const marker = L.marker([c.lat, c.lng], { icon: makeIcon(L, selectedIds.has(c.id)) });
      marker.bindTooltip(`
        <div style="background:${DARK};border:1px solid rgba(201,162,39,0.3);border-radius:8px;padding:8px 12px;color:#fff;font-size:12px;min-width:140px">
          <strong style="color:#c9a227">${c.nome}</strong><br>
          <span style="color:rgba(255,255,255,0.6)">${c.numero}</span>
          ${c.endereco ? `<br><span style="color:rgba(255,255,255,0.4);font-size:11px">${c.endereco}</span>` : ''}
        </div>
      `, { className: 'dark-map-tooltip', permanent: false, direction: 'top' });
      marker.on('click', () => onToggle(c.id));
      marker.addTo(map);
      markersRef.current.set(c.id, marker);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts]);

  // Camada selecionável de distritos SP
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;

    // Remover layer anterior se existir
    if (spLayerRef.current && map) {
      map.removeLayer(spLayerRef.current);
      spLayerRef.current = null;
      selectedSpLayerRef.current = null;
    }

    if (!showSpDistritos || !L || !map) return;

    let cancelled = false;

    (async () => {
      try {
        if (!spDistritosGeoCache) {
          const r = await fetch('/geojson/sp-distritos.geojson');
          if (!r.ok || cancelled) return;
          spDistritosGeoCache = await r.json();
        }
        if (cancelled) return;

        const styleNormal = {
          fillColor: '#1a3a5c',
          fillOpacity: 0.07,
          color: '#4a9ede',
          weight: 1.5,
          opacity: 0.5,
        };
        const styleHover = {
          fillOpacity: 0.18,
          color: '#7dd3fc',
          weight: 2,
          opacity: 0.8,
        };
        const styleSelected = {
          fillColor: '#1d4ed8',
          fillOpacity: 0.25,
          color: '#60a5fa',
          weight: 2.5,
          opacity: 1,
        };

        const layer = L.geoJSON(spDistritosGeoCache, {
          style: () => ({ ...styleNormal }),
          onEachFeature: (feature: any, featureLayer: any) => {
            const nome: string =
              feature?.properties?.nm_distrito_municipal ||
              feature?.properties?.ds_nome ||
              '';

            featureLayer.on('mouseover', () => {
              if (selectedSpLayerRef.current !== featureLayer) {
                featureLayer.setStyle(styleHover);
              }
              featureLayer.bindTooltip(
                `<div style="background:rgba(7,29,54,0.95);border:1px solid #1b4965;border-radius:8px;padding:8px 12px;color:#7dd3fc;font-size:12px;font-weight:600;">
                  ${nome}
                  <div style="color:#94a3b8;font-size:10px;margin-top:3px;font-weight:400;">Clique para selecionar contatos</div>
                </div>`,
                { sticky: true, className: 'sp-bairro-tooltip', direction: 'top' }
              ).openTooltip();
            });

            featureLayer.on('mouseout', () => {
              if (selectedSpLayerRef.current !== featureLayer) {
                featureLayer.setStyle(styleNormal);
              }
              featureLayer.closeTooltip();
            });

            featureLayer.on('click', () => {
              // Resetar highlight do bairro anterior
              if (selectedSpLayerRef.current && selectedSpLayerRef.current !== featureLayer) {
                selectedSpLayerRef.current.setStyle(styleNormal);
              }
              featureLayer.setStyle(styleSelected);
              selectedSpLayerRef.current = featureLayer;

              // Point-in-polygon para todos os contatos
              const current = contactsRef.current;
              const matching = current
                .filter(c => contactInFeature(c.lat, c.lng, feature))
                .map(c => c.id);

              onDistritoSelectRef.current?.(nome, matching);
            });
          },
        }).addTo(map);

        spLayerRef.current = layer;
        // Garantir que marcadores ficam acima dos polígonos
        layer.bringToBack();
      } catch (_) {}
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSpDistritos, mapReady]);

  return (
    <>
      <style>{`
        .sp-bairro-tooltip .leaflet-tooltip {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
        .leaflet-tooltip.sp-bairro-tooltip {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
      `}</style>
      <div
        ref={containerRef}
        style={{ height, width: '100%', borderRadius: 8 }}
      />
    </>
  );
}
