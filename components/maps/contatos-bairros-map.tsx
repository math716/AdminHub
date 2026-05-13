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
  const mapInstanceRef = useRef<any>(null);
  const layersRef = useRef<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    const init = async () => {
      const L = (await import('leaflet')).default;
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      await import('leaflet/dist/leaflet.css');
      if (cancelled || !containerRef.current) return;

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      layersRef.current = [];

      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: false,
        scrollWheelZoom: true,
      });
      mapInstanceRef.current = map;

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

        const counts = Object.values(contatosPorBairro);
        const maxCount = counts.length > 0 ? Math.max(1, ...counts) : 1;
        const allCoords: [number, number][] = [];

        features.forEach((feature: any) => {
          const nmBairro = feature.properties?.NM_BAIRRO ?? '';
          const normNm = norm(nmBairro);
          const count = contatosPorBairro[normNm] ?? 0;
          const isSel = selectedBairros?.has(normNm) ?? false;

          const fillColor = isSel ? '#1d4ed8' : count > 0 ? '#3b82f6' : '#1e3a5f';
          const fillOpacity = isSel ? 0.75 : count > 0 ? 0.25 + (count / maxCount) * 0.55 : 0.15;

          const layer = L.geoJSON(feature, {
            style: { color: '#1e40af', weight: isSel ? 2 : 1, fillColor, fillOpacity, opacity: 0.9 },
          });

          layer.on('click', () => { onBairroClick?.(normNm); });

          layer.on('mouseover', (e: any) => {
            layer.setStyle({ fillOpacity: Math.min(0.9, fillOpacity + 0.2), weight: 2 });
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
            layer.setStyle({ fillOpacity, weight: isSel ? 2 : 1 });
            map.closePopup();
          });

          layer.addTo(map);
          layersRef.current.push(layer);

          const coords = feature.geometry?.type === 'Polygon'
            ? feature.geometry.coordinates[0]
            : feature.geometry?.type === 'MultiPolygon'
              ? feature.geometry.coordinates.flatMap((p: any) => p[0])
              : [];
          coords.forEach((c: [number, number]) => allCoords.push([c[1], c[0]]));
        });

        if (allCoords.length > 0) map.fitBounds(allCoords, { padding: [20, 20] });
        setLoading(false);
      } catch {
        setErrorMsg('Erro ao carregar bairros');
        setLoading(false);
      }
    };

    init();
    return () => { cancelled = true; };
  // remount when municipality or uf changes; selectedBairros/contatosPorBairro handled via key in parent
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [municipio, uf]);

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

export default function ContatosBairrosMap(props: ContatosBairrosMapProps) {
  const key = `${props.uf}-${props.municipio}-${JSON.stringify(Array.from(props.selectedBairros ?? []).sort())}`;
  return <ContatosBairrosMapInner key={key} {...props} />;
}
