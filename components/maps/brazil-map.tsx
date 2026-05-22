'use client';

import { useEffect, useState, useRef, memo } from 'react';
import { ESTADOS_BRASIL } from '@/lib/types';
import { useMapCleanup } from '@/hooks/use-map-cleanup';

interface BrazilMapProps {
  onStateClick: (uf: string, name: string) => void;
  highlightedStates?: Record<string, number>;
  /** Tema escuro com tile CartoDB Dark Matter (pro dashboard de emendas) */
  darkMode?: boolean;
}

const codeToUf: Record<string, string> = {
  '12': 'AC', '27': 'AL', '16': 'AP', '13': 'AM', '29': 'BA', '23': 'CE', '53': 'DF',
  '32': 'ES', '52': 'GO', '21': 'MA', '51': 'MT', '50': 'MS', '31': 'MG', '15': 'PA',
  '25': 'PB', '41': 'PR', '26': 'PE', '22': 'PI', '33': 'RJ', '24': 'RN', '43': 'RS',
  '11': 'RO', '14': 'RR', '42': 'SC', '35': 'SP', '28': 'SE', '17': 'TO'
};

// Centroides aproximados dos estados brasileiros [lat, lng]
const STATE_CENTROIDS: Record<string, [number, number]> = {
  'AC': [-9.0, -70.8], 'AL': [-9.7, -36.6], 'AP': [1.4, -51.8], 'AM': [-3.4, -65.0],
  'BA': [-12.9, -41.7], 'CE': [-5.5, -39.3], 'DF': [-15.8, -47.9], 'ES': [-19.2, -40.3],
  'GO': [-15.8, -49.6], 'MA': [-4.9, -45.3], 'MT': [-12.7, -55.9], 'MS': [-20.5, -54.8],
  'MG': [-18.5, -44.6], 'PA': [-3.4, -52.0], 'PB': [-7.2, -36.8], 'PR': [-24.9, -51.5],
  'PE': [-8.3, -37.9], 'PI': [-7.7, -42.7], 'RJ': [-22.2, -43.0], 'RN': [-5.8, -36.5],
  'RS': [-30.2, -53.2], 'RO': [-10.9, -62.8], 'RR': [2.0, -61.4], 'SC': [-27.3, -50.2],
  'SP': [-22.2, -48.7], 'SE': [-10.6, -37.4], 'TO': [-10.2, -48.3]
};

function BrazilMapComponent({ onStateClick, highlightedStates, darkMode = false }: BrazilMapProps) {
  const [geoData, setGeoData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef<HTMLDivElement>(null);
  const isInitializingRef = useRef(false);
  const labelsLayerRef = useRef<any>(null);

  const { mapInstanceRef, registerLayer, cleanupMap, isUnmounted } = useMapCleanup();

  // Ref para onStateClick – evita reinicialização do mapa ao digitar no formulário pai
  const onStateClickRef = useRef(onStateClick);
  useEffect(() => { onStateClickRef.current = onStateClick; }, [onStateClick]);

  useEffect(() => {
    let cancelled = false;
    const fetchGeoData = async () => {
      try {
        const res = await fetch('/api/ibge/geojson?type=brasil');
        if (res.ok && !cancelled) {
          const data = await res.json();
          setGeoData(data);
        }
      } catch (error) {
        if (!cancelled) console.error('Error fetching geojson:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchGeoData();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (loading || !geoData || !mapRef.current) return;
    if (isInitializingRef.current) return;
    isInitializingRef.current = true;

    // Flag local por execução — evita que initMap em andamento (após await) continue
    // após o cleanup ter rodado e um novo initMap ter iniciado (race condition).
    let cancelled = false;

    const initMap = async () => {
      const L = (await import('leaflet')).default;

      if (cancelled) {
        isInitializingRef.current = false;
        return;
      }

      cleanupMap();

      if (!mapRef.current) {
        isInitializingRef.current = false;
        return;
      }

      const map = L.map(mapRef.current, {
        center: [-14.235, -51.925],
        zoom: 4,
        zoomControl: true,
        scrollWheelZoom: true,
        minZoom: 3,
        maxZoom: 14,
        attributionControl: true
      });

      // Atribuir imediatamente para que cleanupMap() de execuções concorrentes
      // consiga destruir este mapa caso o efeito seja cancelado.
      mapInstanceRef.current = map;

      const tileUrl = darkMode
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
      L.tileLayer(tileUrl, {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(map);

      const hasVotes = highlightedStates && Object.keys(highlightedStates).length > 0;

      const getColor = (codarea: string) => {
        const uf = codeToUf[codarea] || '';
        const value = highlightedStates?.[uf] ?? 0;
        if (value === 0) return darkMode ? 'transparent' : '#dce8f5';
        const maxValue = Math.max(...Object.values(highlightedStates || { _: 1 }));
        const intensity = value / maxValue;

        if (darkMode) {
          // Mais valor = cor mais escura/saturada (legenda: #7fb8e0 → #0c4f8a)
          const lightness  = 70 - (intensity * 40); // 70% (pouco) → 30% (muito)
          const saturation = 60 + (intensity * 25); // 60% → 85%
          return `hsl(209, ${saturation}%, ${lightness}%)`;
        }
        // Modo claro original
        const lightness = 85 - (intensity * 55);
        return `hsl(210, 75%, ${lightness}%)`;
      };

      const getFillOpacity = (codarea: string): number => {
        const uf = codeToUf[codarea] || '';
        const value = highlightedStates?.[uf] ?? 0;
        if (!darkMode) return 0; // modo claro mantém só bordas
        if (!value) return 0;
        const maxValue = Math.max(...Object.values(highlightedStates || { _: 1 }));
        const intensity = value / maxValue;
        return 0.65 + intensity * 0.3;
      };

      const style = (feature: any) => {
        const codarea = feature?.properties?.codarea || '';
        return {
          fillColor: getColor(codarea),
          weight: 1.2,
          opacity: 0.9,
          color: darkMode ? 'rgba(74,158,222,0.6)' : '#7aadcc',
          fillOpacity: getFillOpacity(codarea),
        };
      };

      const geoLayer = L.geoJSON(geoData, {
        style: style,
        onEachFeature: (feature: any, layer: any) => {
          const codarea = feature?.properties?.codarea || '';
          const uf = codeToUf[codarea] || '';
          const estado = ESTADOS_BRASIL.find((e) => e.sigla === uf);
          const votes = highlightedStates?.[uf];

          layer.on('click', () => {
            if (uf && estado) {
              onStateClickRef.current(uf, estado.nome);
            }
          });

          layer.on('mouseover', (e: any) => {
            e.target.setStyle({
              weight: 2.5,
              color: '#1565c0',
              fillOpacity: 0.1
            });
            e.target.bringToFront();
          });

          layer.on('mouseout', (e: any) => {
            geoLayer.resetStyle(e.target);
          });

          if (estado) {
            layer.bindTooltip(
              `<div style="
                padding: 10px 14px;
                background: rgba(10, 25, 47, 0.97);
                border-radius: 8px;
                border: 1px solid rgba(79,195,247,0.4);
                min-width: 160px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.6);
              ">
                <div style="font-weight: 700; color: #4fc3f7; font-size: 14px; margin-bottom: 4px;">${estado.nome}</div>
                <div style="color: #78909c; font-size: 11px; margin-bottom: 6px;">${uf}</div>
                ${votes
                  ? `<div style="color: #e0f7fa; font-size: 13px; font-weight: 600;">${votes.toLocaleString('pt-BR')} votos</div>`
                  : '<div style="color: #546e7a; font-size: 11px;">Clique para ver municípios</div>'
                }
              </div>`,
              { sticky: true, className: 'dark-tooltip' }
            );
          }
        }
      }).addTo(map);

      const bounds = geoLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [30, 30] });
      }

      // Adicionar rótulos de votos (números como imagens) nos estados
      const labelsGroup = L.layerGroup().addTo(map);
      labelsLayerRef.current = labelsGroup;

      if (hasVotes) {
        Object.entries(highlightedStates || {}).forEach(([uf, votos]) => {
          if (!votos || votos === 0) return;
          const centroid = STATE_CENTROIDS[uf];
          if (!centroid) return;

          const maxValue = Math.max(...Object.values(highlightedStates || { _: 1 }));
          const intensity = votos / maxValue;

          // Tamanho do badge baseado na intensidade
          const size = Math.max(32, Math.min(56, 32 + intensity * 24));
          const fontSize = Math.max(9, Math.min(13, 9 + intensity * 4));

          const votosFormatado = votos >= 1000000
            ? `${(votos / 1000000).toFixed(1)}M`
            : votos >= 1000
              ? `${(votos / 1000).toFixed(0)}k`
              : votos.toString();

          const bgColor = `hsl(200, 70%, ${70 - intensity * 40}%)`;
          const textColor = intensity > 0.5 ? '#0a1929' : '#e0f7fa';

          const icon = L.divIcon({
            className: 'state-vote-badge',
            html: `<div style="
              background: ${bgColor};
              color: ${textColor};
              border: 2px solid rgba(255,255,255,0.3);
              border-radius: 50%;
              width: ${size}px;
              height: ${size}px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: ${fontSize}px;
              font-weight: 800;
              box-shadow: 0 2px 8px rgba(0,0,0,0.6), 0 0 0 1px rgba(79,195,247,0.3);
              white-space: nowrap;
              pointer-events: none;
              font-family: system-ui, sans-serif;
              letter-spacing: -0.3px;
            ">${votosFormatado}</div>`,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2]
          });

          L.marker(centroid, { icon, interactive: false, zIndexOffset: 100 }).addTo(labelsGroup);
        });
      }

      // Controlar visibilidade dos rótulos por zoom
      const updateLabelsVisibility = () => {
        const zoom = map.getZoom();
        if (zoom >= 5) {
          if (!map.hasLayer(labelsGroup)) labelsGroup.addTo(map);
        } else {
          if (map.hasLayer(labelsGroup)) map.removeLayer(labelsGroup);
        }
      };
      map.on('zoomend', updateLabelsVisibility);

      registerLayer(geoLayer);
      registerLayer(labelsGroup);
      isInitializingRef.current = false;
    };

    initMap().catch(() => { isInitializingRef.current = false; });

    return () => {
      cancelled = true;
      isInitializingRef.current = false;
      cleanupMap();
    };
  // onStateClick é acessado via ref para evitar reinicialização do mapa ao digitar no formulário pai
  }, [loading, geoData, highlightedStates, cleanupMap, registerLayer, isUnmounted]);

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-[#f0f4f8] rounded-lg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto mb-3"></div>
          <p className="text-gray-500">Carregando mapa...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={mapRef}
      className="h-full w-full rounded-lg brazil-map-container"
      style={{ minHeight: '500px', background: '#f0f4f8' }}
    />
  );
}

export default memo(BrazilMapComponent);
