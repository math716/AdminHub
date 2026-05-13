'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useMapCleanup } from '@/hooks/use-map-cleanup';
import { Loader2, AlertTriangle } from 'lucide-react';

interface BairrosPoligonosMapProps {
  municipio: string;
  uf: string;
  candidatoId?: string;
  nomeCandidato?: string;
  ano?: string;
  /** Permite sobrepor votos calculados com projeções */
  votosPorBairro?: Record<string, number>;
  selectedBairro?: string | null;
  onBairroClick?: (nome: string, votos: number) => void;
  /** Chamado quando os dados de votos são carregados */
  onDataLoaded?: (bairroVotes: Record<string, number>) => void;
  height?: string;
}

function normalizeNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fmtVotos(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return String(v);
}

function BairrosPoligonosMapComponent({
  municipio,
  uf,
  candidatoId,
  nomeCandidato,
  ano,
  votosPorBairro,
  selectedBairro,
  onBairroClick,
  onDataLoaded,
  height = '100%',
}: BairrosPoligonosMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const isInitializingRef = useRef(false);
  const geoLayerRef = useRef<any>(null);
  const voteLabelsGroupRef = useRef<any>(null);
  const selectedLayerRef = useRef<any>(null);
  const selectedBairroRef = useRef<string | null>(selectedBairro ?? null);
  const onBairroClickRef = useRef(onBairroClick);
  const votosPorBairroRef = useRef(votosPorBairro);

  const [loading, setLoading] = useState(true);
  const [geoFeatures, setGeoFeatures] = useState<any[]>([]);
  const [apiVotes, setApiVotes] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const { mapInstanceRef, cleanupMap, registerLayer } = useMapCleanup();

  useEffect(() => { onBairroClickRef.current = onBairroClick; }, [onBairroClick]);
  useEffect(() => { selectedBairroRef.current = selectedBairro ?? null; }, [selectedBairro]);
  useEffect(() => { votosPorBairroRef.current = votosPorBairro; }, [votosPorBairro]);

  // Buscar features + votos da API
  useEffect(() => {
    if (!municipio || !uf) return;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ municipio, uf });
    if (ano) params.set('ano', ano);
    if (candidatoId) params.set('candidatoId', candidatoId);
    else if (nomeCandidato) params.set('nome', nomeCandidato);

    fetch(`/api/tse/bairros-poligonos?${params}`)
      .then(r => r.json())
      .then(data => {
        if (!data.features || data.features.length === 0) {
          setError('Nenhum polígono encontrado para este município');
          setLoading(false);
          return;
        }
        setGeoFeatures(data.features);
        setApiVotes(data.bairroVotes ?? {});
        onDataLoaded?.(data.bairroVotes ?? {});
        setLoading(false);
      })
      .catch(() => {
        setError('Erro ao carregar polígonos');
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [municipio, uf, candidatoId, nomeCandidato, ano]);

  const getEffectiveVotes = useCallback((nome: string): number => {
    const nomeNorm = normalizeNome(nome);
    const override = votosPorBairroRef.current;
    if (override) {
      for (const [k, v] of Object.entries(override)) {
        if (normalizeNome(k) === nomeNorm) return v;
      }
    }
    for (const [k, v] of Object.entries(apiVotes)) {
      if (normalizeNome(k) === nomeNorm) return v;
    }
    return 0;
  }, [apiVotes]);

  const getColor = useCallback((nome: string): string => {
    const effective = { ...(apiVotes ?? {}), ...(votosPorBairroRef.current ?? {}) };
    const allVals = Object.values(effective).filter(v => v > 0);
    if (allVals.length === 0) return '#dce8f5';
    const votos = getEffectiveVotes(nome);
    if (!votos) return '#dce8f5';
    const maxV = Math.max(...allVals, 1);
    const intensity = votos / maxV;
    const lightness = Math.round(85 - intensity * 55);
    const saturation = Math.round(55 + intensity * 35);
    return `hsl(210, ${saturation}%, ${lightness}%)`;
  }, [apiVotes, getEffectiveVotes]);

  const rebuildVoteLabels = useCallback(async (map: any) => {
    const L = (await import('leaflet')).default;
    const geoLayer = geoLayerRef.current;
    if (!geoLayer || !map) return;
    if (voteLabelsGroupRef.current) map.removeLayer(voteLabelsGroupRef.current);

    const group = L.layerGroup().addTo(map);
    voteLabelsGroupRef.current = group;

    geoLayer.eachLayer((layer: any) => {
      const nome = layer.feature?.properties?.NM_BAIRRO ?? '';
      const votos = getEffectiveVotes(nome);
      if (!votos) return;
      try {
        const bounds = layer.getBounds?.();
        if (!bounds?.isValid()) return;
        const center = bounds.getCenter();
        const label = fmtVotos(votos);
        const sz = label.length <= 2 ? 28 : label.length <= 3 ? 32 : label.length <= 4 ? 36 : 40;
        const fs = sz <= 28 ? 9 : 10;
        const marker = L.marker([center.lat, center.lng], {
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
  }, [getEffectiveVotes]);

  // Inicializar mapa quando as features chegarem
  useEffect(() => {
    if (loading || geoFeatures.length === 0 || !mapRef.current) return;
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
        attributionControl: false,
        preferCanvas: false,
      });
      mapInstanceRef.current = map;

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd',
      }).addTo(map);

      map.createPane('bairrosPane');
      map.createPane('voteLabelsPane');
      const bp = map.getPane('bairrosPane');
      const vp = map.getPane('voteLabelsPane');
      if (bp) bp.style.zIndex = '400';
      if (vp) vp.style.zIndex = '450';

      const featureCollection = { type: 'FeatureCollection', features: geoFeatures };

      const style = (feature: any, isSelected = false) => ({
        fillColor: isSelected ? '#1565c0' : getColor(feature?.properties?.NM_BAIRRO ?? ''),
        fillOpacity: isSelected ? 0.35 : 0.12,
        color: isSelected ? '#4a9ede' : '#9ab8d4',
        weight: isSelected ? 2.5 : 1.5,
        opacity: 1,
      });

      // Tooltip custom
      const tooltipEl = L.DomUtil.create('div', '', map.getContainer()) as HTMLElement;
      tooltipEl.style.cssText = [
        'position:absolute', 'z-index:10000', 'pointer-events:none', 'display:none',
        'padding:10px 14px', 'background:rgba(13,27,42,0.97)', 'border-radius:8px',
        'border:1px solid #1b4965', 'min-width:140px', 'box-shadow:0 4px 20px rgba(0,0,0,0.5)',
        'white-space:nowrap', 'font-family:system-ui,sans-serif',
      ].join(';');

      const geoLayer = L.geoJSON(featureCollection as any, {
        pane: 'bairrosPane',
        style: (feature: any) => style(feature, false),
        onEachFeature: (feature: any, layer: any) => {
          const nome: string = feature?.properties?.NM_BAIRRO ?? 'Bairro';

          layer.on('click', () => {
            if (selectedLayerRef.current && selectedLayerRef.current !== layer) {
              selectedLayerRef.current.setStyle(style(selectedLayerRef.current.feature, false));
            }
            layer.setStyle(style(feature, true));
            layer.bringToFront();
            selectedLayerRef.current = layer;
            selectedBairroRef.current = nome;
            const votos = getEffectiveVotes(nome);
            onBairroClickRef.current?.(nome, votos);
            tooltipEl.style.display = 'none';
          });

          layer.on('mouseover', () => {
            if (selectedBairroRef.current !== nome) {
              layer.setStyle({ weight: 2.5, fillOpacity: 0.18, color: '#4a9ede' });
              layer.bringToFront();
            }
            const votos = getEffectiveVotes(nome);
            tooltipEl.innerHTML = [
              `<strong style="color:#7dd3fc;font-size:14px;display:block;margin-bottom:4px;">${nome}</strong>`,
              votos > 0
                ? `<span style="color:#e2e8f0;font-size:13px;">${votos.toLocaleString('pt-BR')} votos</span>`
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
            if (selectedBairroRef.current !== nome) {
              layer.setStyle(style(feature, false));
            }
            tooltipEl.style.display = 'none';
          });
        },
      }).addTo(map);

      geoLayerRef.current = geoLayer;
      registerLayer(geoLayer);

      // Aplicar seleção inicial
      if (selectedBairroRef.current) {
        geoLayer.eachLayer((l: any) => {
          const n = l.feature?.properties?.NM_BAIRRO ?? '';
          if (normalizeNome(n) === normalizeNome(selectedBairroRef.current!)) {
            l.setStyle(style(l.feature, true));
            selectedLayerRef.current = l;
          }
        });
      }

      const bounds = geoLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [30, 30] });
      }

      isInitializingRef.current = false;
      await rebuildVoteLabels(map);
    };

    initMap().catch(() => { isInitializingRef.current = false; });
    return () => { cancelled = true; isInitializingRef.current = false; cleanupMap(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, geoFeatures]);

  // Atualizar cores/labels quando votos mudarem (projeções)
  useEffect(() => {
    const geoLayer = geoLayerRef.current;
    const map = mapInstanceRef.current;
    if (!geoLayer) return;

    geoLayer.eachLayer((l: any) => {
      const nome = l.feature?.properties?.NM_BAIRRO ?? '';
      const isSelected = selectedBairro
        ? normalizeNome(nome) === normalizeNome(selectedBairro)
        : false;
      l.setStyle({
        fillColor: isSelected ? '#1565c0' : getColor(nome),
        fillOpacity: isSelected ? 0.35 : 0.12,
        color: isSelected ? '#4a9ede' : '#9ab8d4',
        weight: isSelected ? 2.5 : 1.5,
      });
      if (isSelected) { l.bringToFront(); selectedLayerRef.current = l; }
    });

    if (map) rebuildVoteLabels(map);
  }, [votosPorBairro, selectedBairro, getColor, rebuildVoteLabels]);

  if (loading) {
    return (
      <div className="w-full h-full bg-[#f0f4f8] rounded-xl flex items-center justify-center" style={{ height }}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
          <span className="text-gray-500 text-sm">Carregando bairros de {municipio}…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full bg-[#f0f4f8] rounded-xl flex items-center justify-center" style={{ height }}>
        <div className="flex flex-col items-center gap-3 text-center p-6">
          <AlertTriangle className="w-10 h-10 text-amber-400" />
          <span className="text-gray-600 font-medium">{error}</span>
        </div>
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
      <div className="absolute bottom-3 left-3 z-[1000] bg-white/90 backdrop-blur-md rounded-xl border border-gray-200 px-3 py-2 text-xs shadow-md">
        <div className="flex items-center gap-2">
          <div className="w-5 h-3 rounded-sm" style={{ background: '#4a9ede', border: '1px solid #9ab8d4', opacity: 0.6 }} />
          <span className="text-gray-600 font-medium">Bairros – {municipio}</span>
        </div>
      </div>
    </div>
  );
}

export default BairrosPoligonosMapComponent;
