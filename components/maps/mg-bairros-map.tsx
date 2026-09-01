'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useMapCleanup } from '@/hooks/use-map-cleanup';
import { Loader2 } from 'lucide-react';
import { camadaBase } from '@/lib/maps/basemap';
import { pontoParaRotuloMultiplo } from '@/lib/maps/rotulo-poligono';
import { htmlDaBolha, tamanhoDaBolha } from '@/lib/maps/bolha-votos';

interface MgBairrosMapProps {
  municipio: string;
  votesData?: Record<string, number>;
  selectedBairro?: string | null;
  onBairroClick?: (nome: string) => void;
  height?: string;
}

function normalizeNome(nome: string): string {
  return nome
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fmtVotos(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return String(v);
}

function MgBairrosMapComponent({ municipio, votesData, selectedBairro, onBairroClick, height = '100%' }: MgBairrosMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const isInitializingRef = useRef(false);
  const geoLayerRef = useRef<any>(null);
  const voteLabelsGroupRef = useRef<any>(null);
  const selectedLayerRef = useRef<any>(null);
  const selectedBairroRef = useRef<string | null>(selectedBairro ?? null);
  const onBairroClickRef = useRef(onBairroClick);
  const votesDataRef = useRef(votesData);
  const [loading, setLoading] = useState(true);
  const [geoData, setGeoData] = useState<any>(null);

  const { mapInstanceRef, cleanupMap, registerLayer } = useMapCleanup();

  useEffect(() => { onBairroClickRef.current = onBairroClick; }, [onBairroClick]);
  useEffect(() => { selectedBairroRef.current = selectedBairro ?? null; }, [selectedBairro]);
  useEffect(() => { votesDataRef.current = votesData; }, [votesData]);

  useEffect(() => {
    const munNorm = normalizeNome(municipio);
    fetch('/geojson/MG_bairros_CD2022.json')
      .then(r => r.json())
      .then((data: any) => {
        const filtered = {
          type: 'FeatureCollection',
          features: data.features.filter((f: any) =>
            normalizeNome(f.properties?.NM_MUN ?? '') === munNorm
          ),
        };
        setGeoData(filtered);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [municipio]);

  const getNome = (feature: any): string =>
    feature?.properties?.NM_BAIRRO || feature?.properties?.nm_bairro || '';

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
        const latlngs = layer.getLatLngs?.();
        const ring: any[] = latlngs?.[0]?.[0]?.[0] ?? latlngs?.[0]?.[0] ?? latlngs?.[0] ?? [];
        const n = ring.length;
        // O rotulo vai no ponto INTERNO mais distante das bordas.
        //
        // Antes era a media dos vertices no terco norte do poligono, com a
        // ideia de acompanhar o nucleo urbano. Media de vertices nao e centro:
        // uma borda recortada concentra pontos e arrasta o rotulo para la.
        const geom = layer.feature?.geometry as { type: string; coordinates: any } | undefined;
        let aneis: Array<Array<[number, number]>> = [];
        if (geom?.type === 'Polygon') {
          if (geom.coordinates?.[0]?.length) aneis = [geom.coordinates[0]];
        } else if (geom?.type === 'MultiPolygon') {
          aneis = (geom.coordinates as any[][][]).map((p) => p[0]).filter(Boolean);
        }
        const ponto = pontoParaRotuloMultiplo(aneis);
        const bc = layer.getBounds().getCenter();
        const [centerLat, centerLng] = ponto ?? [bc.lat, bc.lng];
        const label = fmtVotos(votos);
        const sz = tamanhoDaBolha(label);
        const marker = L.marker([centerLat, centerLng], {
          icon: L.divIcon({
            html: htmlDaBolha(label, sz),
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

      camadaBase(L).addTo(map);

      map.createPane('bairrosPane');
      map.createPane('voteLabelsPane');
      const bairrosPane = map.getPane('bairrosPane');
      const voteLabelsPane = map.getPane('voteLabelsPane');
      if (bairrosPane) bairrosPane.style.zIndex = '400';
      if (voteLabelsPane) voteLabelsPane.style.zIndex = '450';

      const style = (feature: any, isSelected = false) => ({
        fillColor: isSelected ? '#1565c0' : getColor(getNome(feature)),
        fillOpacity: isSelected ? 0.35 : 0.12,
        color: isSelected ? '#4a9ede' : '#9ab8d4',
        weight: isSelected ? 2.5 : 1,
        opacity: 1,
      });

      const tooltipEl = L.DomUtil.create('div', '', map.getContainer()) as HTMLElement;
      tooltipEl.style.cssText = [
        'position:absolute', 'z-index:10000', 'pointer-events:none', 'display:none',
        'padding:10px 14px', 'background:rgba(13,27,42,0.97)', 'border-radius:8px',
        'border:1px solid #1b4965', 'min-width:140px', 'box-shadow:0 4px 20px rgba(0,0,0,0.5)',
        'white-space:nowrap', 'font-family:system-ui,sans-serif',
      ].join(';');

      const geoLayer = L.geoJSON(geoData, {
        pane: 'bairrosPane',
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
            selectedBairroRef.current = nome;
            onBairroClickRef.current?.(nome);
            tooltipEl.style.display = 'none';
          });

          layer.on('mouseover', () => {
            if (selectedBairroRef.current !== nome) {
              layer.setStyle({ weight: 2, fillOpacity: 0.18, color: '#2563EB' });
              layer.bringToFront();
            }
            const v = getVotos(nome);
            tooltipEl.innerHTML = [
              `<strong style="color:var(--acento-azul);font-size:14px;display:block;margin-bottom:4px;">${nome}</strong>`,
              v !== undefined
                ? `<span style="color:var(--text-secondary);font-size:13px;">${v.toLocaleString('pt-BR')} votos</span>`
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
            let left = pt.x + 14;
            let top = pt.y - h - 10;
            if (left + w > mapW) left = pt.x - w - 14;
            if (top < 0) top = pt.y + 10;
            tooltipEl.style.left = left + 'px';
            tooltipEl.style.top = top + 'px';
          });

          layer.on('mouseout', () => {
            if (selectedBairroRef.current !== nome) {
              layer.setStyle(style(feature, false));
            }
            tooltipEl.style.display = 'none';
          });
        },
      }).addTo(map);

      geoLayerRef.current = geoLayer;
      registerLayer(geoLayer);

      if (selectedBairroRef.current) {
        geoLayer.eachLayer((layer: any) => {
          const n = getNome(layer.feature);
          if (normalizeNome(n) === normalizeNome(selectedBairroRef.current!)) {
            layer.setStyle(style(layer.feature, true));
            selectedLayerRef.current = layer;
          }
        });
      }

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
      const isSelected = selectedBairro ? normalizeNome(nome) === normalizeNome(selectedBairro) : false;
      l.setStyle({
        fillColor: isSelected ? '#1565c0' : getColor(nome),
        fillOpacity: isSelected ? 0.35 : 0.12,
        color: isSelected ? '#4a9ede' : '#9ab8d4',
        weight: isSelected ? 2.5 : 1,
      });
      if (isSelected) { l.bringToFront(); selectedLayerRef.current = l; }
    });

    if (map) rebuildVoteLabels(map);
  }, [votesData, selectedBairro, getColor, rebuildVoteLabels]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#f0f4f8] rounded-xl">
        <Loader2 className="h-8 w-8 animate-spin text-sky-400" />
      </div>
    );
  }

  return <div ref={mapRef} style={{ width: '100%', height }} />;
}

export default MgBairrosMapComponent;
