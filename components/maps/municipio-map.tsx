'use client';

import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef, memo } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useMapCleanup } from '@/hooks/use-map-cleanup';
import { camadaBase } from '@/lib/maps/basemap';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
interface BairroLocal {
  codLocal: string;
  nome: string;
  endereco: string;
  zona: number;
  lat: number | null;
  lng: number | null;
  /** Votos REAIS do candidato neste local (só quando fonte = 'secao'). */
  votos?: number;
  secoes?: number;
}

/**
 * De onde vêm os votos do mapa:
 * - 'secao': votos reais por local de votação (arquivo de seção do TSE);
 * - 'estimativa': votos da zona repartidos pelas seções — não é o voto real do bairro;
 * - undefined: sem candidato, só os locais.
 */
export type FonteVotos = 'secao' | 'estimativa' | undefined;

interface BairroData {
  nome: string;
  votos?: number;
  lat?: number;
  lng?: number;
  locais?: BairroLocal[];
}

export interface BairroExposed {
  nome: string;
  votos: number;
  locais: BairroLocal[];
  fonte?: FonteVotos;
}

export interface MunicipioMapHandle {
  highlightBairro: (bairroNome: string) => void;
  clearHighlight: () => void;
  zoomToZona: (zona: number, fallbackLat?: number, fallbackLng?: number) => void;
}

export interface FocusZonaRequest {
  zona: number;
  lat?: number;
  lng?: number;
  nonce: number; // sempre diferente para re-triggerar mesmo na mesma zona
}

interface MunicipioMapProps {
  municipio: string;
  uf: string;
  candidatoId?: string;
  nomeCandidato?: string;
  ano?: string;
  /** 1º ou 2º turno (padrão 1). */
  turno?: number;
  votosPorBairro?: Record<string, number>;
  totalVotos?: number;
  selectedBairro?: string | null;
  showLabels?: boolean;
  height?: string;
  focusZona?: FocusZonaRequest | null;
  onBairroClick?: (bairro: string, votos: number) => void;
  onBairroHover?: (bairro: string | null) => void;
  /** Chamado quando os dados de bairros são carregados — permite que o pai acesse votos e locais */
  onDataLoaded?: (bairros: BairroExposed[]) => void;
}

// ---------------------------------------------------------------------------
// Helper: gera opções de ícone de pin SVG (não depende de L)
// ---------------------------------------------------------------------------
interface PinIconOptions {
  className: string;
  html: string;
  iconSize: [number, number];
  iconAnchor: [number, number];
  tooltipAnchor: [number, number];
}

function makePinIconOptions(color: string, isSelected: boolean, size = 26): PinIconOptions {
  const border = isSelected ? '#facc15' : 'var(--tint-45)';
  const bw = isSelected ? 2.5 : 1;
  const h = Math.round(size * 1.42);
  return {
    className: 'bairro-pin',
    html: `<svg width="${size}" height="${h}" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg" style="display:block;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.6));">
      <path d="M14 1C7.1 1 1 7.1 1 14c0 9.8 13 25 13 25S27 23.8 27 14C27 7.1 20.9 1 14 1z" fill="${color}" stroke="${border}" stroke-width="${bw}"/>
      <circle cx="14" cy="13" r="5" fill="var(--tint-25)"/>
    </svg>`,
    iconSize: [size, h],
    iconAnchor: [size / 2, h],
    tooltipAnchor: [0, -(h + 4)],
  };
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------
const MunicipioMapComponent = forwardRef<MunicipioMapHandle, MunicipioMapProps>(({
  municipio,
  uf,
  candidatoId,
  nomeCandidato,
  ano,
  turno = 1,
  votosPorBairro = {},
  totalVotos = 0,
  selectedBairro = null,
  showLabels = true,
  height = '600px',
  focusZona = null,
  onBairroClick,
  onBairroHover,
  onDataLoaded,
}, ref) => {
  const mapRef = useRef<HTMLDivElement>(null);
  // Um pino por LOCAL DE VOTAÇÃO (chave "zona-nºlocal"), no endereço real.
  // Antes era um pino por bairro, na média das coordenadas das escolas — um
  // ponto onde não havia escola nenhuma, enquanto a escola real ficava sem
  // pino (Rua da Mooca, 363, out/2026).
  const layersRef = useRef<Map<string, any>>(new Map());
  // cor, tamanho e bairro de cada pino (para restaurar ao desselecionar)
  const markerDataRef = useRef<Map<string, { color: string; size: number; bairro: string }>>(new Map());
  // votos de cada pino — somados nos círculos de agrupamento
  const votosRef = useRef<Map<string, number>>(new Map());
  // zona → pinos (para o zoom por zona)
  const zonaMarkersRef = useRef<Map<number, string[]>>(new Map());
  // Leaflet stored after async import so highlight/clear can use it synchronously
  const leafletRef = useRef<any>(null);
  // Callback refs — updated every render, never stale, never in dep arrays
  const onBairroClickRef = useRef(onBairroClick);
  const onBairroHoverRef = useRef(onBairroHover);
  onBairroClickRef.current = onBairroClick;
  onBairroHoverRef.current = onBairroHover;
  // Bairro selecionado, lido ao terminar de desenhar os pinos: a seleção pode
  // chegar antes deles (ou o mapa ser redesenhado ao trocar de turno).
  const selectedBairroRef = useRef(selectedBairro);
  selectedBairroRef.current = selectedBairro;

  const [loading, setLoading] = useState(true);
  const [bairros, setBairros] = useState<BairroData[]>([]);
  const [fonte, setFonte] = useState<FonteVotos>(undefined);
  const [error, setError] = useState<string | null>(null);
  const isInitializingRef = useRef(false);

  const { mapInstanceRef, cleanupMap, isUnmounted } = useMapCleanup();

  const getColor = useCallback((votos: number | undefined, maxValue: number) => {
    if (votos === undefined || votos === 0) return '#4a5568';
    const intensity = votos / maxValue;
    if (intensity < 0.25) return '#7dd3fc';
    if (intensity < 0.5)  return '#38bdf8';
    if (intensity < 0.75) return '#0891b2';
    return '#22c55e';
  }, []);

  const highlightBairro = useCallback((bairroNome: string) => {
    const L = leafletRef.current;
    if (!L || !mapInstanceRef.current) return;
    const normalizedName = bairroNome.toUpperCase();
    const doBairro: [number, number][] = [];
    layersRef.current.forEach((marker, key) => {
      const data = markerDataRef.current.get(key);
      if (!data) return;
      const isSelected = data.bairro === normalizedName;
      marker.setIcon(L.divIcon(makePinIconOptions(data.color, isSelected, data.size)));
      marker.setZIndexOffset(isSelected ? 1000 : 0);
      if (isSelected && marker.getLatLng) {
        const ll = marker.getLatLng();
        doBairro.push([ll.lat, ll.lng]);
      }
    });
    // Mostra todos os locais do bairro, sem aproximar demais quando é um só.
    if (doBairro.length > 0) {
      mapInstanceRef.current.fitBounds(L.latLngBounds(doBairro), {
        padding: [60, 60], maxZoom: 15, animate: true,
      });
    }
  }, []);

  const clearHighlight = useCallback(() => {
    const L = leafletRef.current;
    if (!L) return;
    layersRef.current.forEach((marker, key) => {
      const data = markerDataRef.current.get(key);
      if (!data) return;
      marker.setIcon(L.divIcon(makePinIconOptions(data.color, false, data.size)));
      marker.setZIndexOffset(0);
    });
  }, []);

  const zoomToZona = useCallback((zona: number, fallbackLat?: number, fallbackLng?: number) => {
    const map = mapInstanceRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;

    const keys = zonaMarkersRef.current.get(zona) ?? [];
    const latlngs = keys
      .map(k => layersRef.current.get(k)?.getLatLng())
      .filter(Boolean)
      .map((ll: any) => [ll.lat, ll.lng] as [number, number]);

    if (latlngs.length > 0) {
      map.fitBounds(L.latLngBounds(latlngs), { padding: [60, 60], maxZoom: 14, animate: true });
    } else if (fallbackLat && fallbackLng) {
      map.setView([fallbackLat, fallbackLng], 13, { animate: true });
    }
  }, []);

  useImperativeHandle(ref, () => ({ highlightBairro, clearHighlight, zoomToZona }));

  // Buscar dados de bairros
  useEffect(() => {
    const fetchBairros = async () => {
      setLoading(true);
      setError(null);
      try {
        const tseParams = new URLSearchParams({ municipio, uf });
        if (candidatoId) tseParams.set('candidatoId', candidatoId);
        else if (nomeCandidato) tseParams.set('nome', nomeCandidato);
        if (ano) tseParams.set('ano', ano);
        if (turno === 2) tseParams.set('turno', '2');

        const tseRes = await fetch(`/api/tse/bairros?${tseParams.toString()}`);
        if (tseRes.ok) {
          const tseData = await tseRes.json();
          if (tseData.bairros && tseData.bairros.length > 0) {
            setFonte(tseData.fonte);
            setBairros(tseData.bairros.map((b: any) => ({
              nome: b.nome,
              lat: b.lat,
              lng: b.lng,
              votos: b.votos ?? 0,
              locais: b.locais ?? [],
            })));
            onDataLoaded?.(tseData.bairros.map((b: any) => ({
              nome: b.nome,
              votos: b.votos ?? 0,
              locais: b.locais ?? [],
              fonte: tseData.fonte,
            })));
            setLoading(false);
            return;
          }
        }
        setError('Nenhum bairro encontrado para este município');
        onDataLoaded?.([]);
      } catch {
        setError('Erro ao carregar bairros');
        onDataLoaded?.([]);
      } finally {
        setLoading(false);
      }
    };

    if (municipio && uf) fetchBairros();
  }, [municipio, uf, candidatoId, nomeCandidato, ano, turno]); // eslint-disable-line react-hooks/exhaustive-deps

  // Inicializar mapa — não depende de selectedBairro nem dos callbacks
  useEffect(() => {
    if (loading || !mapRef.current) return;
    if (isInitializingRef.current) return;
    isInitializingRef.current = true;

    let cancelled = false;

    const initMap = async () => {
      const L = (await import('leaflet')).default;
      if (cancelled) { isInitializingRef.current = false; return; }
      leafletRef.current = L;

      cleanupMap();
      layersRef.current.clear();
      markerDataRef.current.clear();
      votosRef.current.clear();
      zonaMarkersRef.current.clear();

      const map = L.map(mapRef.current!, {
        center: [-22.9, -47.0],
        zoom: 13,
        zoomControl: true,
        scrollWheelZoom: true,
        attributionControl: false,
        preferCanvas: false, // regular markers need DOM renderer
      });

      mapInstanceRef.current = map;

      camadaBase(L).addTo(map);

      // Camada para os círculos de cluster
      const clusterLayerGroup = L.layerGroup().addTo(map);

      // Helper: extrai [lat, lng] de um marker Leaflet
      const getLL = (m: any): [number, number] => { const ll = m.getLatLng(); return [ll.lat, ll.lng]; };

      // Formata votos para exibição compacta no círculo
      const fmtVotos = (v: number) => {
        if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')}M`;
        if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
        return String(v);
      };

      // Agrupa markers por proximidade em pixels e atualiza a camada de clusters
      const recluster = () => {
        clusterLayerGroup.clearLayers();
        const THRESHOLD = 60; // pixels

        const items = Array.from(layersRef.current.entries()).map(([key, marker]) => ({
          key,
          marker,
          pt: map.latLngToContainerPoint(marker.getLatLng()),
        }));

        const assigned = new Set<string>();
        const groups: Array<{ keys: string[]; latlngs: [number, number][] }> = [];

        for (const item of items) {
          if (assigned.has(item.key)) continue;
          const group: typeof groups[0] = { keys: [item.key], latlngs: [getLL(item.marker)] };
          assigned.add(item.key);
          for (const other of items) {
            if (assigned.has(other.key)) continue;
            const dx = item.pt.x - other.pt.x;
            const dy = item.pt.y - other.pt.y;
            if (Math.sqrt(dx * dx + dy * dy) < THRESHOLD) {
              group.keys.push(other.key);
              group.latlngs.push(getLL(other.marker));
              assigned.add(other.key);
            }
          }
          groups.push(group);
        }

        groups.forEach(group => {
          const isCluster = group.keys.length > 1;
          group.keys.forEach(key => {
            const m = layersRef.current.get(key);
            if (m) {
              const el = m.getElement?.();
              if (el) {
                el.style.display = isCluster ? 'none' : '';
                if (isCluster) m.closeTooltip?.();
              }
            }
          });

          if (isCluster) {
            const avgLat = group.latlngs.reduce((s, ll) => s + ll[0], 0) / group.latlngs.length;
            const avgLng = group.latlngs.reduce((s, ll) => s + ll[1], 0) / group.latlngs.length;
            const totalVotosCluster = group.keys.reduce((s, k) => s + (votosRef.current.get(k) ?? 0), 0);
            const label = fmtVotos(totalVotosCluster);
            const size = label.length <= 3 ? 28 : label.length <= 5 ? 36 : 44;
            const circle = L.marker([avgLat, avgLng], {
              icon: L.divIcon({
                html: `<div style="
                  width:${size}px;height:${size}px;
                  background:rgba(8,145,178,0.85);
                  border:2px solid var(--tint-55);
                  border-radius:50%;
                  display:flex;align-items:center;justify-content:center;
                  color:#fff;font-size:11px;font-weight:700;
                  box-shadow:0 2px 6px rgba(0,0,0,0.4);
                  cursor:pointer;
                ">${label}</div>`,
                className: '',
                iconSize: [size, size],
                iconAnchor: [size / 2, size / 2],
              }),
              zIndexOffset: 500,
            });
            circle.on('click', () => {
              const bounds = L.latLngBounds(group.latlngs);
              map.fitBounds(bounds, { padding: [60, 60], maxZoom: map.getZoom() + 2 });
            });
            clusterLayerGroup.addLayer(circle);
          }
        });
      };

      map.on('zoomend moveend', recluster);

      const normKey = (s: string) =>
        s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
      const getVotosBairro = (b: BairroData): number => {
        // votosPorBairro tem prioridade (permite sobrepor com projeções)
        const override = votosPorBairro[normKey(b.nome)];
        if (override !== undefined) return override;
        return b.votos ?? 0;
      };
      const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

      // Valor de cada PINO (local de votação):
      // - votos reais do local, quando o bairro mostra o voto real (fonte 'secao'
      //   e nenhuma projeção por cima);
      // - senão, o valor do bairro (estimativa ou meta da projeção) — repartido
      //   entre os locais só para a soma dos agrupamentos não contar o bairro
      //   várias vezes; a cor e o balão usam o valor do bairro.
      type Pino = { key: string; local: BairroLocal; bairro: BairroData; valor: number; valorCor: number; real: boolean };
      const pinos: Pino[] = [];
      for (const b of bairros) {
        const valorBairro = getVotosBairro(b);
        const comCoord = (b.locais ?? []).filter(l => l.lat != null && l.lng != null);
        const real = fonte === 'secao' && valorBairro === (b.votos ?? 0);
        for (const l of comCoord) {
          pinos.push({
            key: `${l.zona}-${l.codLocal}`,
            local: l, bairro: b, real,
            valor: real ? (l.votos ?? 0) : valorBairro / comCoord.length,
            valorCor: real ? (l.votos ?? 0) : valorBairro,
          });
        }
      }

      const maxValue = Math.max(1, ...pinos.map(p => p.valorCor));
      // Total do município: soma dos bairros (com projeção, a soma das metas).
      const calcTotalVotos = bairros.reduce((s, b) => s + getVotosBairro(b), 0) || 1;
      const pct = (v: number) => ((v / calcTotalVotos) * 100).toFixed(1).replace('.', ',');

      const bounds: [number, number][] = [];

      pinos.forEach(({ key, local, bairro, valor, valorCor, real }) => {
        const color = getColor(valorCor, maxValue);
        const size = valorCor > 0 ? Math.round(20 + Math.min((valorCor / maxValue) * 12, 12)) : 20;
        const nomeBairro = bairro.nome.toUpperCase();
        bounds.push([local.lat!, local.lng!]);

        markerDataRef.current.set(key, { color, size, bairro: nomeBairro });
        votosRef.current.set(key, valor);

        const marker = L.marker([local.lat!, local.lng!], {
          icon: L.divIcon(makePinIconOptions(color, false, size)),
          riseOnHover: true,
        });
        marker.addTo(map);
        layersRef.current.set(key, marker);

        if (local.zona) {
          const prev = zonaMarkersRef.current.get(local.zona) ?? [];
          zonaMarkersRef.current.set(local.zona, [...prev, key]);
        }

        const valorBairro = getVotosBairro(bairro);
        const linhaVotos = real
          ? `<div style="color:var(--text-secondary);font-size:17px;font-weight:700;">${(local.votos ?? 0).toLocaleString('pt-BR')} votos neste local</div>
             <div style="color:var(--text-tertiary);font-size:12px;">Bairro: ${valorBairro.toLocaleString('pt-BR')} votos · ${pct(valorBairro)}% do município</div>`
          : (candidatoId || nomeCandidato || valorBairro > 0)
            ? `<div style="color:var(--text-secondary);font-size:15px;font-weight:700;">Bairro: ${valorBairro.toLocaleString('pt-BR')} votos</div>
               <div style="color:var(--text-tertiary);font-size:11px;">${fonte === 'estimativa' ? 'Estimativa: votos da zona repartidos pelas seções' : `${pct(valorBairro)}% do município`}</div>`
            : '';

        marker.bindTooltip(
          `<div style="background:var(--bg-card-raised);padding:10px 14px;border-radius:10px;border:1px solid var(--border-default);box-shadow:var(--shadow-raised);min-width:180px;max-width:260px;white-space:normal;">
            <div style="font-weight:600;color:var(--acento-azul);font-size:13px;margin-bottom:2px;">${esc(local.nome)}</div>
            <div style="color:var(--text-tertiary);font-size:11px;margin-bottom:6px;">${esc(local.endereco)} · ${esc(bairro.nome)}</div>
            ${linhaVotos}
            <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:3px;">
              <span style="background:var(--brand-cobalt-soft);color:var(--brand-cobalt-text);border-radius:4px;padding:1px 7px;font-size:10px;font-weight:600;">Zona ${local.zona}</span>
              ${local.secoes ? `<span style="background:var(--tint-06);color:var(--text-secondary);border-radius:4px;padding:1px 7px;font-size:10px;">${local.secoes} seções</span>` : ''}
            </div>
          </div>`,
          { permanent: false, direction: 'top', className: 'bairro-tooltip', interactive: false }
        );

        marker.on('click', () => {
          marker.closeTooltip();
          onBairroClickRef.current?.(bairro.nome, valorBairro);
        });
        marker.on('mouseover', () => {
          marker.openTooltip();
          onBairroHoverRef.current?.(bairro.nome);
        });
        marker.on('mouseout', () => {
          marker.closeTooltip();
          onBairroHoverRef.current?.(null);
        });
      });

      if (bounds.length > 0) {
        // Enquadra só quando a caixa do mapa já tem largura. Criado com
        // largura 0 (ainda em layout), o Leaflet enquadrava tudo no zoom máximo
        // — 19, nível de prédio — e nenhum pino aparecia na tela.
        const enquadrar = () => {
          map.invalidateSize();
          map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40] });
        };
        let tentativas = 0;
        const quandoTiverLargura = () => {
          if (cancelled) return;
          if (map.getContainer().clientWidth > 0 || ++tentativas > 60) enquadrar();
          else requestAnimationFrame(quandoTiverLargura);
        };
        quandoTiverLargura();
      }

      // Primeira clusterização após o mapa ajustar os bounds
      // A seleção é reaplicada DEPOIS do enquadramento inicial: aplicada no
      // meio da animação, o encaixe no bairro brigava com o da cidade.
      map.once('moveend', () => {
        recluster();
        if (selectedBairroRef.current) highlightBairro(selectedBairroRef.current);
      });

      isInitializingRef.current = false;
    };

    initMap().catch(() => { isInitializingRef.current = false; });

    return () => {
      cancelled = true;
      isInitializingRef.current = false;
      cleanupMap();
    };
  }, [loading, bairros, votosPorBairro, totalVotos, showLabels, getColor, cleanupMap]); // eslint-disable-line react-hooks/exhaustive-deps

  // Atualizar highlight quando selectedBairro mudar — sem re-init do mapa
  useEffect(() => {
    if (selectedBairro) highlightBairro(selectedBairro);
    else clearHighlight();
  }, [selectedBairro, highlightBairro, clearHighlight]);

  // Zoom para zona eleitoral quando focusZona mudar
  useEffect(() => {
    if (!focusZona) return;
    zoomToZona(focusZona.zona, focusZona.lat, focusZona.lng);
  }, [focusZona, zoomToZona]);

  if (loading) {
    return (
      <div className="w-full bg-[#0d1b2a] rounded-xl flex items-center justify-center" style={{ height }}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
          <span className="text-gray-400">Carregando bairros de {municipio}...</span>
        </div>
      </div>
    );
  }

  if (error || bairros.length === 0) {
    return (
      <div className="w-full bg-[#0d1b2a] rounded-xl flex items-center justify-center" style={{ height }}>
        <div className="flex flex-col items-center gap-3 text-center p-6">
          <AlertTriangle className="w-10 h-10 text-[color:var(--brand-cobalt)]" />
          <span className="text-gray-300 font-medium">Dados de bairros não disponíveis</span>
          <span className="text-gray-500 text-sm max-w-md">
            Os locais de votação de {municipio} não possuem coordenadas geográficas cadastradas.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-sm text-gray-400">
          {bairros.reduce((s, b) => s + (b.locais ?? []).length, 0).toLocaleString('pt-BR')} locais de votação
          {' · '}{bairros.length} bairros em {municipio}
          {/* Sem o voto real por local, o número do bairro é a fatia da zona —
              quem lê precisa saber antes de tirar conclusão de bairro. */}
          {fonte === 'estimativa' && (
            <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded"
              style={{ background: 'var(--tint-06)', color: 'var(--text-secondary)' }}
              title="Votos da zona eleitoral repartidos pelas seções de cada local — não é o voto real do bairro">
              votos por bairro estimados
            </span>
          )}
        </span>
        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-[#4a5568]"></div>
            <span className="text-gray-500">0</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-[#7dd3fc]"></div>
            <span className="text-gray-500">Baixo</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-[#38bdf8]"></div>
            <span className="text-gray-500">Médio</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-[#22c55e]"></div>
            <span className="text-gray-500">Alto</span>
          </div>
        </div>
      </div>
      <div
        ref={mapRef}
        className="w-full flex-1 rounded-xl overflow-hidden border border-[#1b4965]"
        style={{ background: '#0d1b2a', minHeight: '500px' }}
      />
    </div>
  );
});

MunicipioMapComponent.displayName = 'MunicipioMap';
const MunicipioMap = memo(MunicipioMapComponent);
export default MunicipioMap;