'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface ContatosBairrosMapProps {
  municipio: string;
  uf: string;
  contatosPorBairro: Record<string, number>;
  selectedBairros?: Set<string>;
  onBairroClick?: (nome: string) => void;
  height?: string;
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function ContatosBairrosMapInner({
  municipio, uf, contatosPorBairro, selectedBairros, onBairroClick, height = '100%',
}: ContatosBairrosMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const geoLayerRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Keep latest props accessible inside Leaflet event handlers without stale closures
  const propsRef = useRef({ contatosPorBairro, selectedBairros, onBairroClick });
  useEffect(() => { propsRef.current = { contatosPorBairro, selectedBairros, onBairroClick }; });

  // Initialize map + load GeoJSON — reruns only when city/state changes
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    const init = async () => {
      const L = (await import('leaflet')).default;
      // @ts-ignore – CSS import without type declarations
      await import('leaflet/dist/leaflet.css');
      if (cancelled || !containerRef.current) return;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        geoLayerRef.current = null;
      }

      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: false,
        scrollWheelZoom: true,
      });
      mapRef.current = map;

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);

      try {
        const res = await fetch(`/geojson/${uf}_bairros_CD2022.json`);
        if (!res.ok) throw new Error('not found');
        const geo = await res.json();
        if (cancelled) return;

        const munNorm = norm(municipio);
        const features = (geo.features ?? []).filter((f: any) => norm(f.properties?.NM_MUN ?? '') === munNorm);

        if (features.length === 0) {
          setErrorMsg('Bairros não disponíveis para este município');
          setLoading(false);
          return;
        }

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

        const geoLayer = L.geoJSON(features, {
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
              L.popup({ closeButton: false, className: 'bairro-popup' })
                .setLatLng(e.latlng)
                .setContent(
                  `<div style="font:13px/1.4 sans-serif;padding:4px 2px">` +
                  `<strong style="color:#fff">${nmBairro}</strong><br>` +
                  `<span style="color:#94a3b8">${count} contato${count !== 1 ? 's' : ''}</span></div>`
                )
                .openOn(map);
            });

            layer.on('mouseout', () => {
              geoLayer.resetStyle(layer);
              map.closePopup();
            });
          },
        }).addTo(map);

        geoLayerRef.current = geoLayer;

        // Collect coordinates for fitBounds
        const allCoords: [number, number][] = [];
        features.forEach((feature: any) => {
          const coords = feature.geometry?.type === 'Polygon'
            ? feature.geometry.coordinates[0]
            : feature.geometry?.type === 'MultiPolygon'
              ? feature.geometry.coordinates.flatMap((p: any) => p[0])
              : [];
          coords.forEach((c: [number, number]) => allCoords.push([c[1], c[0]]));
        });

        if (allCoords.length > 0) map.fitBounds(allCoords, { padding: [20, 20] });

        // Force Leaflet to recalculate container size after React layout
        setTimeout(() => {
          if (!cancelled && mapRef.current) mapRef.current.invalidateSize();
        }, 120);

        setLoading(false);
      } catch {
        setErrorMsg('Erro ao carregar bairros');
        setLoading(false);
      }
    };

    init();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        geoLayerRef.current = null;
      }
    };
  }, [municipio, uf]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update polygon styles reactively when selection or counts change — no remount
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
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 rounded-xl"
          style={{ background: 'rgba(7,29,54,0.7)' }}>
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: '#4a9ede' }} />
        </div>
      )}
      {errorMsg && !loading && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl"
          style={{ background: 'rgba(7,29,54,0.5)' }}>
          <p className="text-sm text-center px-4" style={{ color: 'rgba(255,255,255,0.4)' }}>{errorMsg}</p>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full rounded-xl" />
    </div>
  );
}

// Key only on city+state — selection changes update styles in place without remounting
export default function ContatosBairrosMap(props: ContatosBairrosMapProps) {
  return <ContatosBairrosMapInner key={`${props.uf}-${props.municipio}`} {...props} />;
}
