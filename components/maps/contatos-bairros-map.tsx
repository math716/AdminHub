'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface ContatosBairrosMapProps {
  municipio: string;               // usado no key do wrapper externo
  uf: string;                      // usado no key do wrapper externo
  features: any[];                 // features GeoJSON já filtradas pelo pai
  contatosPorBairro: Record<string, number>;
  selectedBairros?: Set<string>;
  onBairroClick?: (nome: string) => void;
  height?: string;
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function ContatosBairrosMapInner({
  features, contatosPorBairro, selectedBairros, onBairroClick, height = '100%',
}: ContatosBairrosMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const geoLayerRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);

  // Keep latest props accessible inside Leaflet handlers without stale closures
  const propsRef = useRef({ contatosPorBairro, selectedBairros, onBairroClick });
  useEffect(() => { propsRef.current = { contatosPorBairro, selectedBairros, onBairroClick }; });

  // Initialize map only after features are available — same pattern as BairrosPoligonosMap
  useEffect(() => {
    if (!features.length || !containerRef.current) return;

    let cancelled = false;

    const initMap = async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !containerRef.current) return;

      // Clean up previous instance
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        geoLayerRef.current = null;
      }

      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: false,
        scrollWheelZoom: true,
        preferCanvas: false,
      });
      mapRef.current = map;

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd',
        attribution: '',
      }).addTo(map);

      const buildStyle = (feature: any) => {
        const normNm = norm(feature?.properties?.NM_BAIRRO ?? '');
        const { contatosPorBairro: cpb, selectedBairros: sb } = propsRef.current;
        const counts = Object.values(cpb);
        const maxCount = counts.length > 0 ? Math.max(1, ...counts) : 1;
        const count = cpb[normNm] ?? 0;
        const isSel = sb?.has(normNm) ?? false;
        const fillColor = isSel ? '#1d4ed8' : count > 0 ? '#3b82f6' : '#1e3a5f';
        const fillOpacity = isSel ? 0.75 : count > 0 ? 0.25 + (count / maxCount) * 0.55 : 0.15;
        return { color: '#1e40af', weight: isSel ? 2 : 1, fillColor, fillOpacity, opacity: 0.9 };
      };

      const geoLayer = L.geoJSON(
        { type: 'FeatureCollection', features } as any,
        {
          style: buildStyle,
          onEachFeature: (feature: any, layer: any) => {
            const nmBairro = feature.properties?.NM_BAIRRO ?? '';
            const normNm = norm(nmBairro);

            layer.on('click', () => {
              propsRef.current.onBairroClick?.(normNm);
            });

            layer.on('mouseover', (e: any) => {
              const count = propsRef.current.contatosPorBairro[normNm] ?? 0;
              layer.setStyle({ fillOpacity: 0.85, weight: 2 });
              L.popup({ closeButton: false, className: 'bairro-dark-popup' })
                .setLatLng(e.latlng)
                .setContent(
                  `<div style="padding:8px 12px">` +
                  `<strong style="color:#2563EB;font-size:13px">${nmBairro || 'Bairro'}</strong><br>` +
                  `<span style="color:#94a3b8;font-size:12px">${count} contato${count !== 1 ? 's' : ''}</span></div>`
                )
                .openOn(map);
            });

            layer.on('mouseout', () => {
              geoLayer.resetStyle(layer);
              map.closePopup();
            });
          },
        }
      ).addTo(map);

      geoLayerRef.current = geoLayer;

      const bounds = geoLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [24, 24] });
      }

      setMapReady(true);
    };

    initMap().catch(() => {});

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        geoLayerRef.current = null;
      }
      setMapReady(false);
    };
  }, [features]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update polygon styles when selection or counts change — no remount
  useEffect(() => {
    if (!geoLayerRef.current) return;
    const counts = Object.values(contatosPorBairro);
    const maxCount = counts.length > 0 ? Math.max(1, ...counts) : 1;
    geoLayerRef.current.setStyle((feature: any) => {
      const normNm = norm(feature?.properties?.NM_BAIRRO ?? '');
      const count = contatosPorBairro[normNm] ?? 0;
      const isSel = selectedBairros?.has(normNm) ?? false;
      const fillColor = isSel ? '#1d4ed8' : count > 0 ? '#3b82f6' : '#1e3a5f';
      const fillOpacity = isSel ? 0.75 : count > 0 ? 0.25 + (count / maxCount) * 0.55 : 0.15;
      return { color: '#1e40af', weight: isSel ? 2 : 1, fillColor, fillOpacity, opacity: 0.9 };
    });
  }, [selectedBairros, contatosPorBairro]);

  return (
    <div className="relative w-full" style={{ height }}>
      <style>{`
        .bairro-dark-popup .leaflet-popup-content-wrapper {
          background: rgba(4,17,31,0.95) !important;
          border: 1px solid rgba(37,99,235,0.25) !important;
          border-radius: 10px !important;
          box-shadow: 0 4px 20px rgba(0,0,0,0.55) !important;
          padding: 0 !important;
        }
        .bairro-dark-popup .leaflet-popup-content {
          margin: 0 !important;
        }
        .bairro-dark-popup .leaflet-popup-tip {
          background: rgba(4,17,31,0.95) !important;
        }
      `}</style>
      {!mapReady && (
        <div className="absolute inset-0 flex items-center justify-center z-10 rounded-xl"
          style={{ background: 'rgba(7,29,54,0.7)' }}>
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: '#4a9ede' }} />
        </div>
      )}
      <div ref={containerRef} className="w-full h-full rounded-xl"
        style={{ background: 'rgba(7,29,54,0.9)', minHeight: 400 }} />
    </div>
  );
}

// Remonta apenas quando cidade/estado mudam
export default function ContatosBairrosMap(props: ContatosBairrosMapProps) {
  return <ContatosBairrosMapInner key={`${props.uf}-${props.municipio}`} {...props} />;
}
