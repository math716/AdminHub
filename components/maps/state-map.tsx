'use client';

import { useEffect, useState, useRef, useCallback, memo } from 'react';
import { Layers, Eye, EyeOff, Loader2, MapPin, Info } from 'lucide-react';
import { useMapCleanup, throttle } from '@/hooks/use-map-cleanup';
import { isTouchDevice } from '@/hooks/use-is-touch';

interface StateMapProps {
  uf: string;
  stateName: string;
  votesData?: Record<string, number>;
  votesDataByName?: Record<string, number>;
  onMunicipioClick?: (codigo: string, nome: string) => void;
  filteredMunicipios?: Set<string> | null;
  highlightColor?: string;
  disableSubdivisao?: boolean;
  highlightMunicipioNome?: string | null;
  valueLabel?: string;
}

const UF_CODES: Record<string, string> = {
  'AC': '12', 'AL': '27', 'AP': '16', 'AM': '13', 'BA': '29', 'CE': '23', 'DF': '53',
  'ES': '32', 'GO': '52', 'MA': '21', 'MT': '51', 'MS': '50', 'MG': '31', 'PA': '15',
  'PB': '25', 'PR': '41', 'PE': '26', 'PI': '22', 'RJ': '33', 'RN': '24', 'RS': '43',
  'RO': '11', 'RR': '14', 'SC': '42', 'SP': '35', 'SE': '28', 'TO': '17'
};

// Debounce helper
function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timeoutId: NodeJS.Timeout;
  return ((...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  }) as T;
}

type SubdivisaoTipo = 'bairros' | 'bairrosTSE' | 'setores' | null;

function StateMapComponent({ uf, stateName, votesData, votesDataByName, onMunicipioClick, filteredMunicipios, highlightColor, disableSubdivisao, highlightMunicipioNome, valueLabel = 'votos' }: StateMapProps) {
  const [geoData, setGeoData] = useState<any>(null);
  const [codigoToNome, setCodigoToNome] = useState<Record<string, string>>({});
  const [nomeToCodigoRef, setNomeToCodigoRef] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const mapRef = useRef<HTMLDivElement>(null);
  
  // Usar hook de cleanup para gerenciamento de memória
  const { mapInstanceRef, registerLayer, removeLayer, cleanupMap, safeTimeout, isUnmounted } = useMapCleanup();
  
  // Layers refs
  const subdivisaoLayerRef = useRef<any>(null);
  const labelsLayerRef = useRef<any>(null);
  const municipiosLayerRef = useRef<any>(null);
  const municipioSelectedLayerRef = useRef<any>(null);
  
  // Flag para evitar inicializações duplicadas
  const isInitializingRef = useRef(false);
  const hasInitializedRef = useRef(false);
  const [isReinitializing, setIsReinitializing] = useState(false);
  
  // Map de layers por nome para acesso O(1)
  const subdivisaoLayersMapRef = useRef<Map<string, any>>(new Map());

  // Refs para callbacks externos – evita reinicializar o mapa ao digitar no formulário pai
  const onMunicipioClickRef = useRef(onMunicipioClick);
  const loadSubdivisaoRef = useRef<typeof loadSubdivisao | null>(null);
  const selectedMunicipioRef = useRef<string | null>(null);
  const disableSubdivisaoRef = useRef(disableSubdivisao);
  const codigoToNomeRef = useRef(codigoToNome);
  useEffect(() => { onMunicipioClickRef.current = onMunicipioClick; }, [onMunicipioClick]);
  useEffect(() => { disableSubdivisaoRef.current = disableSubdivisao; }, [disableSubdivisao]);
  useEffect(() => { codigoToNomeRef.current = codigoToNome; }, [codigoToNome]);

  // Destaque programático (ex: clique na lista lateral) — usa refs para evitar closure stale
  useEffect(() => {
    if (!highlightMunicipioNome || !disableSubdivisao) return;
    // Evita re-aplicar se já está selecionado (ex: clique direto no mapa)
    if (selectedMunicipioRef.current?.toUpperCase() === highlightMunicipioNome.toUpperCase()) return;

    const geoLayer = municipiosLayerRef.current;
    const map = mapInstanceRef.current;
    if (!geoLayer || !map) return;

    const nomeMap = codigoToNomeRef.current;
    let targetLayer: any = null;
    geoLayer.eachLayer((l: any) => {
      geoLayer.resetStyle(l);
      l.setStyle({ fillOpacity: 0, opacity: 0.4 });
      const codarea = l.feature?.properties?.codarea || '';
      const layerNome = nomeMap[codarea] || '';
      if (layerNome.toUpperCase() === highlightMunicipioNome.toUpperCase()) targetLayer = l;
    });
    if (targetLayer) {
      targetLayer.setStyle({ weight: 3, color: '#1565c0', fillColor: '#1976d2', fillOpacity: 0.15, opacity: 1 });
      municipioSelectedLayerRef.current = targetLayer;
      selectedMunicipioRef.current = highlightMunicipioNome;
      targetLayer.bringToFront();
      try {
        const bounds = targetLayer.getBounds();
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [60, 60] });
      } catch (_) {}
    }
  }, [highlightMunicipioNome, disableSubdivisao]);

  const [showSubdivisao, setShowSubdivisao] = useState(true);
  const [subdivisaoTipo, setSubdivisaoTipo] = useState<SubdivisaoTipo>(null);
  const [selectedMunicipio, setSelectedMunicipio] = useState<string | null>(null);
  const [selectedMunicipioCodigo, setSelectedMunicipioCodigo] = useState<string | null>(null);
  const [loadingSubdivisao, setLoadingSubdivisao] = useState(false);
  const [subdivisaoData, setSubdivisaoData] = useState<any>(null);
  const [subdivisaoCache, setSubdivisaoCache] = useState<Record<string, any>>({});
  
  // Ref para hover (evita re-renders)
  const hoveredItemRef = useRef<string | null>(null);
  const [hoveredItemDisplay, setHoveredItemDisplay] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const ufCode = UF_CODES[uf];
        
        const [geoRes, nomesRes] = await Promise.all([
          fetch(`/api/ibge/geojson?type=estado&uf=${uf}`),
          fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${ufCode}/municipios`)
        ]);
        
        if (geoRes.ok) setGeoData(await geoRes.json());
        
        if (nomesRes.ok) {
          const nomesData = await nomesRes.json();
          const codeToName: Record<string, string> = {};
          const nameToCode: Record<string, string> = {};
          nomesData.forEach((m: any) => { 
            codeToName[String(m.id)] = m.nome;
            nameToCode[m.nome.toUpperCase()] = String(m.id);
          });
          setCodigoToNome(codeToName);
          setNomeToCodigoRef(nameToCode);
        }
      } catch (error) {
        console.error('Error fetching state data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [uf]);

  // Manter ref de selectedMunicipio em sincronia para uso nos handlers do mapa
  useEffect(() => { selectedMunicipioRef.current = selectedMunicipio; }, [selectedMunicipio]);

  // Função para carregar subdivisão (bairros ou setores)
  const loadSubdivisao = useCallback(async (municipioNome: string, codigoMunicipio: string) => {
    // Verificar cache primeiro
    const cacheKey = `${municipioNome}-${uf}`;
    if (subdivisaoCache[cacheKey]) {
      const cached = subdivisaoCache[cacheKey];
      setSubdivisaoData(cached.data);
      setSubdivisaoTipo(cached.tipo);
      setLoadingSubdivisao(false);
      return;
    }

    setLoadingSubdivisao(true);

    try {
      // 1. Tentar locais de votação TSE (cobertura nacional)
      const tseRes = await fetch(`/api/tse/bairros?municipio=${encodeURIComponent(municipioNome)}&uf=${uf}`);
      if (tseRes.ok) {
        const tseData = await tseRes.json();
        if (tseData.total > 0) {
          setSubdivisaoData(tseData);
          setSubdivisaoTipo('bairrosTSE');
          setSubdivisaoCache(prev => ({
            ...prev,
            [cacheKey]: { data: tseData, tipo: 'bairrosTSE' }
          }));
          setLoadingSubdivisao(false);
          return;
        }
      }

      // 2. Tentar bairros OSM (polígonos, cobertura parcial)
      const bairrosRes = await fetch(`/api/osm/bairros?municipio=${encodeURIComponent(municipioNome)}&uf=${uf}`);
      if (bairrosRes.ok) {
        const bairrosData = await bairrosRes.json();
        if (bairrosData.hasPolygons && bairrosData.total > 0) {
          setSubdivisaoData(bairrosData);
          setSubdivisaoTipo('bairros');
          setSubdivisaoCache(prev => ({
            ...prev,
            [cacheKey]: { data: bairrosData, tipo: 'bairros' }
          }));
          setLoadingSubdivisao(false);
          return;
        }
      }

      // 3. Fallback: setores censitários IBGE
      const setoresRes = await fetch(
        `/api/ibge/setores?codigo=${codigoMunicipio}&municipio=${encodeURIComponent(municipioNome)}&uf=${uf}`
      );
      if (setoresRes.ok) {
        const setoresData = await setoresRes.json();
        if (setoresData.hasPolygons && setoresData.total > 0) {
          setSubdivisaoData(setoresData);
          setSubdivisaoTipo('setores');
          setSubdivisaoCache(prev => ({
            ...prev,
            [cacheKey]: { data: setoresData, tipo: 'setores' }
          }));
          setLoadingSubdivisao(false);
          return;
        }
      }

      // Nenhuma subdivisão disponível
      setSubdivisaoData(null);
      setSubdivisaoTipo(null);
      
    } catch (error) {
      console.error('Erro ao carregar subdivisão:', error);
      setSubdivisaoData(null);
      setSubdivisaoTipo(null);
    } finally {
      setLoadingSubdivisao(false);
    }
  }, [uf, subdivisaoCache]);

  // Manter ref de loadSubdivisao em sincronia para uso no initMap sem re-inicializar o mapa
  useEffect(() => { loadSubdivisaoRef.current = loadSubdivisao; }, [loadSubdivisao]);

  // Desabilitar/habilitar interatividade dos municípios
  const setMunicipiosInteractivity = useCallback((enabled: boolean) => {
    if (!municipiosLayerRef.current) return;
    
    municipiosLayerRef.current.eachLayer((layer: any) => {
      if (layer.getElement) {
        const el = layer.getElement();
        if (el) el.style.pointerEvents = enabled ? 'auto' : 'none';
      }
    });
  }, []);

  // Cores baseadas no tipo de subdivisão – estilo Google Maps (fundo claro)
  const getSubdivisaoColors = useCallback((tipo: SubdivisaoTipo) => {
    if (tipo === 'setores') {
      // Roxo suave – setores censitários IBGE
      return { fill: '#7c3aed', fillHover: '#8b5cf6', line: '#5b21b6', lineHover: '#7c3aed' };
    }
    if (tipo === 'bairrosTSE') {
      // Laranja – locais de votação TSE
      return { fill: '#f97316', fillHover: '#fb923c', line: '#c2410c', lineHover: '#f97316' };
    }
    // Azul Google Maps – bairros OSM (polígonos reais)
    return { fill: '#1a73e8', fillHover: '#1558b0', line: '#1a73e8', lineHover: '#0d47a1' };
  }, []);

  // Função de highlight otimizada - SEM re-render
  const highlightItem = useCallback((nome: string | null) => {
    const prevHovered = hoveredItemRef.current;
    if (prevHovered === nome) return;
    
    const layersMap = subdivisaoLayersMapRef.current;
    const colors = getSubdivisaoColors(subdivisaoTipo);
    
    // Reset anterior
    if (prevHovered && layersMap.has(prevHovered)) {
      const prevLayer = layersMap.get(prevHovered);
      prevLayer.setStyle({
        fillColor: colors.fill,
        fillOpacity: 0,
        color: colors.line,
        weight: 1.8,
        opacity: 0.85
      });
    }

    // Highlight novo
    if (nome && layersMap.has(nome)) {
      const layer = layersMap.get(nome);
      layer.setStyle({
        fillColor: colors.fillHover,
        fillOpacity: 0.1,
        color: colors.lineHover,
        weight: 2.5,
        opacity: 1
      });
      layer.bringToFront();
    }

    // Efeito de foco nos outros
    if (nome) {
      layersMap.forEach((layer, layerNome) => {
        if (layerNome !== nome && layerNome !== prevHovered) {
          layer.setStyle({ fillOpacity: 0 });
        }
      });
    } else {
      // Reset todos para normal
      layersMap.forEach((layer) => {
        layer.setStyle({
          fillColor: colors.fill,
          fillOpacity: 0,
          color: colors.line,
          weight: 1.8,
          opacity: 0.85
        });
      });
    }
    
    hoveredItemRef.current = nome;
  }, [subdivisaoTipo, getSubdivisaoColors]);

  // Debounced highlight para UI display
  const debouncedSetDisplay = useCallback(
    debounce((nome: string | null) => setHoveredItemDisplay(nome), 50),
    []
  );

  // Renderizar camadas de subdivisão - SEM dependência de hover
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Limpar layers anteriores
    if (subdivisaoLayerRef.current) {
      map.removeLayer(subdivisaoLayerRef.current);
      subdivisaoLayerRef.current = null;
    }
    if (labelsLayerRef.current) {
      map.removeLayer(labelsLayerRef.current);
      labelsLayerRef.current = null;
    }
    subdivisaoLayersMapRef.current.clear();
    hoveredItemRef.current = null;

    const hasTSEData = subdivisaoTipo === 'bairrosTSE' && subdivisaoData?.bairros?.length > 0;
    const hasPolyData = subdivisaoData?.geojson?.features?.length > 0;

    if (!showSubdivisao || (!hasTSEData && !hasPolyData)) {
      if (municipioSelectedLayerRef.current) {
        municipioSelectedLayerRef.current.setStyle({ fillOpacity: 0.15 });
      }
      setMunicipiosInteractivity(true);
      return;
    }

    const renderSubdivisao = async () => {
      const L = (await import('leaflet')).default;

      if (municipioSelectedLayerRef.current) {
        municipioSelectedLayerRef.current.setStyle({ fillOpacity: 0.1 });
      }
      setMunicipiosInteractivity(false);

      // ── Bairros TSE — pins SVG + clustering ───────────────────────────────
      if (subdivisaoTipo === 'bairrosTSE' && subdivisaoData?.bairros) {
        const bairros: Array<{
          nome: string; lat: number; lng: number; totalLocais: number;
          locais: Array<{ codLocal: string; nome: string; endereco: string; zona: number }>;
        }> = subdivisaoData.bairros;

        const maxLocais = Math.max(...bairros.map(b => b.totalLocais), 1);

        const makePinHtml = (intensity: number, size = 26) => {
          const lightness = 85 - intensity * 55;
          const saturation = 55 + intensity * 35;
          const color = `hsl(210, ${saturation}%, ${lightness}%)`;
          const h = Math.round(size * 1.42);
          return {
            html: `<svg width="${size}" height="${h}" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg" style="display:block;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.6));">
              <path d="M14 1C7.1 1 1 7.1 1 14c0 9.8 13 25 13 25S27 23.8 27 14C27 7.1 20.9 1 14 1z" fill="${color}" stroke="rgba(255,255,255,0.45)" stroke-width="1"/>
              <circle cx="14" cy="13" r="5" fill="rgba(255,255,255,0.22)"/>
            </svg>`,
            iconSize: [size, h] as [number, number],
            iconAnchor: [size / 2, h] as [number, number],
          };
        };

        const pinsGroup = L.layerGroup().addTo(map);
        const clusterLayerGroup = L.layerGroup().addTo(map);
        const pinMarkersMap = new Map<string, { marker: any; latlng: [number, number]; totalLocais: number }>();

        for (const bairro of bairros) {
          const intensity = bairro.totalLocais / maxLocais;
          const size = Math.round(22 + Math.min(intensity * 12, 12));
          const pin = makePinHtml(intensity, size);

          const marker = L.marker([bairro.lat, bairro.lng], {
            icon: L.divIcon({ className: 'bairro-pin', ...pin }),
            riseOnHover: true,
            pane: 'bairrosFillPane',
          });

          subdivisaoLayersMapRef.current.set(bairro.nome, marker);

          const locaisHtml = bairro.locais.slice(0, 6).map(l =>
            `<div style="padding:3px 0;border-top:1px solid rgba(255,255,255,0.08);font-size:11px;color:#94a3b8;">
              <span style="color:#7dd3fc">Z${l.zona}</span> ${l.nome}
            </div>`
          ).join('') + (bairro.locais.length > 6
            ? `<div style="font-size:10px;color:#64748b;padding-top:4px">+${bairro.locais.length - 6} locais</div>`
            : '');

          marker.bindTooltip(`
            <div style="padding:10px 14px;background:rgba(10,25,41,0.97);border-radius:8px;
                        border:1px solid #1b4965;min-width:180px;max-width:240px;
                        box-shadow:0 4px 20px rgba(0,0,0,0.5);">
              <strong style="color:#7dd3fc;font-size:13px;display:block;margin-bottom:6px;">${bairro.nome}</strong>
              <span style="color:#e2e8f0;font-size:12px;">${bairro.totalLocais} local${bairro.totalLocais !== 1 ? 'is' : ''} de votação</span>
              <div style="margin-top:6px;">${locaisHtml}</div>
            </div>`,
            { sticky: true, direction: 'top', opacity: 1, className: 'bairro-tooltip' }
          );

          marker.on('mouseover', () => debouncedSetDisplay(bairro.nome));
          marker.on('mouseout', () => debouncedSetDisplay(null));

          pinsGroup.addLayer(marker);
          pinMarkersMap.set(bairro.nome, { marker, latlng: [bairro.lat, bairro.lng], totalLocais: bairro.totalLocais });
        }

        subdivisaoLayerRef.current = pinsGroup as any;

        // Clustering
        const reclusterBairros = () => {
          clusterLayerGroup.clearLayers();
          const THRESHOLD = 60;
          const items = Array.from(pinMarkersMap.entries()).map(([key, d]) => ({
            key, ...d, pt: map.latLngToContainerPoint(d.marker.getLatLng()),
          }));
          const assigned = new Set<string>();
          const groups: Array<{ keys: string[]; latlngs: [number, number][]; total: number }> = [];
          for (const item of items) {
            if (assigned.has(item.key)) continue;
            const group = { keys: [item.key], latlngs: [item.latlng] as [number,number][], total: item.totalLocais };
            assigned.add(item.key);
            for (const other of items) {
              if (assigned.has(other.key)) continue;
              const dx = item.pt.x - other.pt.x;
              const dy = item.pt.y - other.pt.y;
              if (Math.sqrt(dx * dx + dy * dy) < THRESHOLD) {
                group.keys.push(other.key);
                group.latlngs.push(other.latlng);
                group.total += other.totalLocais;
                assigned.add(other.key);
              }
            }
            groups.push(group);
          }
          groups.forEach(group => {
            const isCluster = group.keys.length > 1;
            group.keys.forEach(key => {
              const el = pinMarkersMap.get(key)?.marker.getElement?.();
              if (el) el.style.display = isCluster ? 'none' : '';
            });
            if (isCluster) {
              const avgLat = group.latlngs.reduce((s, ll) => s + ll[0], 0) / group.latlngs.length;
              const avgLng = group.latlngs.reduce((s, ll) => s + ll[1], 0) / group.latlngs.length;
              const label = String(group.total);
              const size = label.length <= 2 ? 36 : label.length <= 4 ? 44 : 52;
              const circle = L.marker([avgLat, avgLng], {
                icon: L.divIcon({
                  html: `<div style="width:${size}px;height:${size}px;background:rgba(8,145,178,0.85);border:2.5px solid rgba(255,255,255,0.6);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,0.45);cursor:pointer;">${label}</div>`,
                  className: '',
                  iconSize: [size, size],
                  iconAnchor: [size / 2, size / 2],
                }),
                zIndexOffset: 500,
              });
              circle.on('click', () => {
                map.fitBounds(L.latLngBounds(group.latlngs), { padding: [60, 60], maxZoom: map.getZoom() + 2 });
              });
              clusterLayerGroup.addLayer(circle);
            }
          });
        };

        map.on('zoomend moveend', reclusterBairros);
        map.once('moveend', reclusterBairros);

        const latlngs = bairros.map(b => L.latLng(b.lat, b.lng));
        if (latlngs.length > 0) {
          map.fitBounds(L.latLngBounds(latlngs), { padding: [60, 60], maxZoom: 14 });
        }
        return;
      }
      // ── fim bairrosTSE ─────────────────────────────────────────────────────

      // GeoJSON: apenas bordas finas (Voyager já exibe nomes dos bairros)
      const subdivisaoLayer = L.geoJSON(subdivisaoData.geojson, {
        pane: 'bairrosFillPane',
        interactive: false,
        style: () => ({
          fillColor: 'transparent',
          fillOpacity: 0,
          color: 'rgba(100,160,220,0.35)',
          weight: 1.2,
          opacity: 0.7,
        }),
      }).addTo(map);

      subdivisaoLayerRef.current = subdivisaoLayer;

      const bounds = subdivisaoLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
      }
    };

    renderSubdivisao();
  }, [showSubdivisao, subdivisaoData, subdivisaoTipo, setMunicipiosInteractivity, highlightItem, debouncedSetDisplay, getSubdivisaoColors]);

  // Inicializar mapa
  useEffect(() => {
    if (loading || !geoData || !mapRef.current || Object.keys(codigoToNome).length === 0) return;

    // Evitar inicializações duplicadas
    if (isInitializingRef.current) return;
    isInitializingRef.current = true;

    // Reinicialização (não-primeira): mostrar overlay enquanto o mapa rebuilda
    if (hasInitializedRef.current) {
      setIsReinitializing(true);
    }

    let cancelled = false;
    const isTouch = isTouchDevice();

    const initMap = async () => {
      const L = (await import('leaflet')).default;

      if (cancelled) {
        isInitializingRef.current = false;
        setIsReinitializing(false);
        return;
      }

      // Cleanup anterior
      cleanupMap();

      if (!mapRef.current) {
        isInitializingRef.current = false;
        setIsReinitializing(false);
        return;
      }

      const map = L.map(mapRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
        attributionControl: true,
        preferCanvas: true
      });

      // Atribuir imediatamente para que cleanupMap() de execuções concorrentes
      // consiga destruir este mapa caso o efeito seja cancelado.
      mapInstanceRef.current = map;

      // Tile layer claro (CartoDB Positron – similar ao Google Maps, gratuito)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(map);

      // Panes para z-index
      map.createPane('municipiosPane');
      map.createPane('bairrosFillPane');
      map.createPane('labelsPane');
      map.createPane('voteLabelsPane');

      const municipiosPane = map.getPane('municipiosPane');
      const bairrosFillPane = map.getPane('bairrosFillPane');
      const labelsPane = map.getPane('labelsPane');
      const voteLabelsPane = map.getPane('voteLabelsPane');

      if (municipiosPane) municipiosPane.style.zIndex = '400';
      if (bairrosFillPane) bairrosFillPane.style.zIndex = '450';
      if (labelsPane) labelsPane.style.zIndex = '470';
      if (voteLabelsPane) voteLabelsPane.style.zIndex = '480';

      // Normalize municipality name for comparison (removes accents, apostrophes, etc.)
      const normalizeName = (name: string): string => {
        return name
          .toUpperCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // Remove accents
          .replace(/[''`´']/g, ' ')        // Replace apostrophes with space
          .replace(/\s+/g, ' ')            // Normalize multiple spaces
          .trim();
      };

      const getVotos = (codarea: string, nomeMun: string): number | undefined => {
        if (votesData?.[codarea] !== undefined) return votesData[codarea];
        if (votesDataByName && nomeMun) {
          const nomeNormalizado = normalizeName(nomeMun);
          // Try exact match first
          if (votesDataByName[nomeMun.toUpperCase()] !== undefined) return votesDataByName[nomeMun.toUpperCase()];
          // Try normalized match
          for (const key of Object.keys(votesDataByName)) {
            const keyNormalizado = normalizeName(key);
            if (keyNormalizado === nomeNormalizado) return votesDataByName[key];
          }
        }
        return undefined;
      };

      const allVotes = Object.values(votesData || {}).concat(Object.values(votesDataByName || {}));
      const maxValue = allVotes.length > 0 ? Math.max(...allVotes.filter(v => v > 0)) : 1;

      const getColor = (votos: number | undefined, isHighlighted: boolean) => {
        if (votos === undefined || votos === 0) return '#dce8f5'; // cinza-azulado claro para fundo branco

        // Se tem filtro ativo e highlightColor definido, usar para destacados
        if (highlightColor && isHighlighted) {
          const intensity = votos / maxValue;
          if (highlightColor === 'blue') {
            const lightness = 85 - (intensity * 55);
            return `hsl(210, 80%, ${lightness}%)`;
          }
        }

        const intensity = votos / maxValue;
        // Choropleth claro→escuro para fundo branco: azul claro (pouco) a azul escuro (muito)
        const lightness = 85 - (intensity * 55); // 85% (quase branco) → 30% (azul escuro)
        const saturation = 55 + (intensity * 35); // 55 → 90%
        return `hsl(210, ${saturation}%, ${lightness}%)`;
      };

      // Verificar se município está no filtro
      const isMunicipioFiltered = (nomeMun: string): boolean => {
        if (!filteredMunicipios) return true; // Sem filtro = todos visíveis
        const nomeNormalizado = normalizeName(nomeMun);
        for (const filteredName of filteredMunicipios) {
          if (normalizeName(filteredName) === nomeNormalizado) return true;
        }
        return false;
      };

      const style = (feature: any) => {
        const codarea = feature?.properties?.codarea || '';
        const nomeMun = codigoToNome[codarea] || '';
        const votos = getVotos(codarea, nomeMun);
        const isFiltered = isMunicipioFiltered(nomeMun);

        const fillOpacity = 0;
        const borderOpacity = filteredMunicipios ? (isFiltered ? 1 : 0.3) : 1;
        
        return {
          fillColor: getColor(votos, isFiltered),
          weight: isFiltered ? 1.5 : 0.8,
          opacity: borderOpacity,
          color: isFiltered ? '#5b8db8' : '#9ab8d4', // bordas azul-acinzentado para mapa claro
          fillOpacity: fillOpacity
        };
      };

      const geoLayer = L.geoJSON(geoData, {
        pane: 'municipiosPane',
        style: style,
        onEachFeature: (feature: any, layer: any) => {
          const codarea = feature?.properties?.codarea || '';
          const nome = codigoToNome[codarea] || `Município ${codarea}`;
          const votos = getVotos(codarea, nome);

          layer.on('click', () => {
            setHoveredItemDisplay(null);

            if (disableSubdivisaoRef.current) {
              // Modo campanha: zoom no município + destacar + apagar os demais
              // Restaurar estilo de todos os municípios e redefinir opacidade
              geoLayer.eachLayer((l: any) => {
                geoLayer.resetStyle(l);
                l.setStyle({ fillOpacity: 0, opacity: 0.4 });
              });

              // Destacar o município clicado
              layer.setStyle({
                weight: 3,
                color: '#1565c0',
                fillColor: '#1976d2',
                fillOpacity: 0.15,
                opacity: 1,
              });
              municipioSelectedLayerRef.current = layer;
              selectedMunicipioRef.current = nome;
              layer.bringToFront();

              // Zoom apenas neste município
              const bounds = layer.getBounds();
              if (bounds.isValid()) {
                mapInstanceRef.current?.fitBounds(bounds, { padding: [60, 60] });
              }
            } else {
              // Modo padrão: resetar anterior, destacar clicado, carregar subdivisão
              if (municipioSelectedLayerRef.current) {
                geoLayer.resetStyle(municipioSelectedLayerRef.current);
              }

              layer.setStyle({
                weight: 3,
                color: '#1565c0',
                fillOpacity: 0.1
              });
              municipioSelectedLayerRef.current = layer;
              layer.bringToFront();

              setSelectedMunicipio(nome);
              setSelectedMunicipioCodigo(codarea);
              setShowSubdivisao(true);
              loadSubdivisaoRef.current?.(nome, codarea);
            }

            onMunicipioClickRef.current?.(codarea, nome);
          });

          // Em touch o hover do Leaflet abre/fecha junto com o tap. O click
          // ja faz a selecao persistente — basta nao bindar hover handlers.
          if (!isTouch) {
            layer.on('mouseover', (e: any) => {
              if (selectedMunicipioRef.current !== nome) {
                e.target.setStyle({
                  weight: 2.5,
                  color: '#1976d2',
                  fillOpacity: 0.1
                });
              }
              e.target.bringToFront();
              if (subdivisaoLayerRef.current) subdivisaoLayerRef.current.bringToFront();
              // labelsLayerRef é um LayerGroup — não tem bringToFront; traz cada layer individualmente
              if (labelsLayerRef.current) {
                try { (labelsLayerRef.current as any).bringToFront?.(); } catch (_) {}
              }
            });

            layer.on('mouseout', (e: any) => {
              if (selectedMunicipioRef.current !== nome) {
                if (disableSubdivisaoRef.current && municipioSelectedLayerRef.current) {
                  // No modo campanha, restaura estilo base mas mantém os demais apagados
                  geoLayer.resetStyle(e.target);
                  e.target.setStyle({ fillOpacity: 0, opacity: 0.4 });
                } else {
                  geoLayer.resetStyle(e.target);
                }
              }
            });
          }

          layer.bindTooltip(
            `<div style="
              padding: 10px 14px;
              background: linear-gradient(160deg, #071d36 0%, #0c2a4f 100%);
              border-radius: 10px;
              border: 1px solid rgba(201,162,39,0.35);
              min-width: 150px;
              box-shadow: 0 4px 20px rgba(0,0,0,0.45);
            ">
              <strong style="color:#fff;font-size:13px;display:block;margin-bottom:4px;letter-spacing:0.02em;">${nome}</strong>
              ${votos !== undefined
                ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:#c9a227;font-weight:600;">${votos.toLocaleString('pt-BR')} <span style="color:rgba(255,255,255,0.5);font-weight:400;">${valueLabel}</span></span>`
                : '<span style="color:rgba(255,255,255,0.3);font-size:11px;">Sem dados</span>'
              }
              ${!disableSubdivisaoRef.current ? `<div style="margin-top:7px;padding-top:5px;border-top:1px solid rgba(201,162,39,0.15);"><span style="color:rgba(255,255,255,0.35);font-size:10px;">📍 Clique para ver bairros</span></div>` : ''}
            </div>`,
            { sticky: true, direction: 'top', offset: [0, -12], opacity: 1, className: 'municipio-tooltip' }
          );
        }
      }).addTo(map);

      municipiosLayerRef.current = geoLayer;
      registerLayer(geoLayer);

      const bounds = geoLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [30, 30] });
      }

      // ── Labels de votos com clustering dinâmico (recluster a cada zoom/move) ──
      const hasVotes = (votesData && Object.keys(votesData).length > 0) ||
                       (votesDataByName && Object.keys(votesDataByName).length > 0);
      if (hasVotes) {
        const fmtVotos = (v: number) => {
          if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')}M`;
          if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
          return String(v);
        };

        // 1. Pré-computar centroides e votos de todos os municípios
        type LabelItem = { latlng: [number, number]; votos: number; nome: string };
        const labelItems: LabelItem[] = [];
        geoLayer.eachLayer((layer: any) => {
          const feature = layer.feature;
          if (!feature) return;
          const codarea = feature?.properties?.codarea || '';
          const nomeMun = codigoToNome[codarea] || '';
          const votos = getVotos(codarea, nomeMun);
          if (!votos || votos === 0) return;
          if (!isMunicipioFiltered(nomeMun)) return;
          try {
            const raw = layer.getLatLngs();
            const findRings = (arr: any[]): any[][] => {
              if (arr.length > 0 && arr[0].lat !== undefined) return [arr];
              return arr.flatMap((x: any) => findRings(x));
            };
            const rings = findRings(raw);
            const ring = rings.reduce((a, b) => (b.length > a.length ? b : a), rings[0] ?? []);
            const lat = ring.length > 0
              ? ring.reduce((s: number, p: any) => s + p.lat, 0) / ring.length
              : layer.getBounds().getCenter().lat;
            const lng = ring.length > 0
              ? ring.reduce((s: number, p: any) => s + p.lng, 0) / ring.length
              : layer.getBounds().getCenter().lng;
            labelItems.push({ latlng: [lat, lng], votos, nome: nomeMun });
          } catch (_) {}
        });

        const labelsGroup = L.layerGroup().addTo(map);
        labelsLayerRef.current = labelsGroup;
        registerLayer(labelsGroup);

        // 2. Recluster: agrupa itens próximos (em pixels) numa única bolha
        const reclusterVoteLabels = () => {
          labelsGroup.clearLayers();
          const THRESHOLD = 40; // px — aumentar = agrupa mais agressivamente
          const items = labelItems.map(item => ({
            ...item,
            pt: map.latLngToContainerPoint(item.latlng),
          }));
          const assigned = new Set<number>();
          for (let i = 0; i < items.length; i++) {
            if (assigned.has(i)) continue;
            let sumLat = items[i].latlng[0];
            let sumLng = items[i].latlng[1];
            let totalVotos = items[i].votos;
            let count = 1;
            assigned.add(i);
            for (let j = i + 1; j < items.length; j++) {
              if (assigned.has(j)) continue;
              const dx = items[i].pt.x - items[j].pt.x;
              const dy = items[i].pt.y - items[j].pt.y;
              if (Math.sqrt(dx * dx + dy * dy) < THRESHOLD) {
                sumLat += items[j].latlng[0];
                sumLng += items[j].latlng[1];
                totalVotos += items[j].votos;
                count++;
                assigned.add(j);
              }
            }
            const avgLat = sumLat / count;
            const avgLng = sumLng / count;
            const label = fmtVotos(totalVotos);
            const isCluster = count > 1;
            const sz = label.length <= 2 ? 26 : label.length <= 3 ? 30 : label.length <= 4 ? 34 : 40;
            const fs = sz <= 26 ? 9 : sz <= 30 ? 10 : 11;
            const bg = isCluster ? 'rgba(7,47,90,0.9)' : 'rgba(13,38,76,0.88)';
            const border = isCluster ? 'rgba(148,163,184,0.55)' : 'rgba(96,165,250,0.5)';
            const marker = L.marker([avgLat, avgLng], {
              icon: L.divIcon({
                html: `<div style="width:${sz}px;height:${sz}px;background:${bg};color:#bfdbfe;font-size:${fs}px;font-weight:800;border-radius:50%;border:2px solid ${border};display:flex;align-items:center;justify-content:center;pointer-events:none;box-shadow:0 2px 6px rgba(0,0,0,0.4);letter-spacing:-0.5px;">${label}</div>`,
                className: '',
                iconSize: [sz, sz] as [number, number],
                iconAnchor: [sz / 2, sz / 2] as [number, number],
              }),
              interactive: false,
              pane: 'voteLabelsPane',
            });
            labelsGroup.addLayer(marker);
          }
        };

        map.on('zoomend moveend', reclusterVoteLabels);
        map.once('moveend', reclusterVoteLabels);
      }

      isInitializingRef.current = false;
      hasInitializedRef.current = true;
      setIsReinitializing(false);
    };

    initMap().catch(() => { isInitializingRef.current = false; setIsReinitializing(false); });

    return () => {
      cancelled = true;
      isInitializingRef.current = false;
      setIsReinitializing(false);
      cleanupMap();
    };
  // onMunicipioClick, loadSubdivisao e selectedMunicipio são acessados via ref
  // para evitar reinicialização do mapa ao digitar no formulário pai
  }, [loading, geoData, votesData, votesDataByName, codigoToNome, uf, filteredMunicipios, highlightColor, cleanupMap, registerLayer, isUnmounted]);

  const handleCloseSubdivisao = () => {
    setShowSubdivisao(false);
    setSelectedMunicipio(null);
    setSelectedMunicipioCodigo(null);
    setSubdivisaoData(null);
    setSubdivisaoTipo(null);
    setHoveredItemDisplay(null);
    hoveredItemRef.current = null;
    subdivisaoLayersMapRef.current.clear();
    
    const map = mapInstanceRef.current;
    if (map) {
      if (subdivisaoLayerRef.current) {
        map.removeLayer(subdivisaoLayerRef.current);
        subdivisaoLayerRef.current = null;
      }
      if (labelsLayerRef.current) {
        map.removeLayer(labelsLayerRef.current);
        labelsLayerRef.current = null;
      }
    }

    if (municipioSelectedLayerRef.current && municipiosLayerRef.current) {
      municipiosLayerRef.current.resetStyle(municipioSelectedLayerRef.current);
      municipioSelectedLayerRef.current = null;
    }

    setMunicipiosInteractivity(true);

    if (municipiosLayerRef.current && map) {
      const bounds = municipiosLayerRef.current.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [30, 30] });
      }
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#f0f4f8] rounded-xl">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="relative h-full">
      {/* Overlay de re-inicialização (troca de candidato no mesmo estado) */}
      {isReinitializing && (
        <div className="absolute inset-0 z-[9999] flex items-center justify-center rounded-xl"
             style={{ background: 'rgba(7,29,54,0.85)' }}>
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#4a9ede' }} />
        </div>
      )}
      {/* Painel de Controle */}
      {selectedMunicipio && !disableSubdivisao && (
        <div className="absolute top-3 right-3 z-[1000] bg-slate-900/95 backdrop-blur-md rounded-xl border border-slate-700/60 p-3 shadow-2xl min-w-[140px]">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-700/50">
            <Layers className="w-4 h-4 text-cyan-400" />
            <span className="text-xs text-gray-300 font-semibold">Camadas</span>
          </div>
          
          <button
            onClick={() => setShowSubdivisao(!showSubdivisao)}
            disabled={!subdivisaoData?.hasPolygons}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all w-full mb-2 ${
              !subdivisaoData?.hasPolygons 
                ? 'bg-slate-800/50 text-gray-500 cursor-not-allowed'
                : showSubdivisao 
                  ? subdivisaoTipo === 'setores'
                    ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-500/25'
                    : 'bg-gradient-to-r from-cyan-600 to-teal-600 text-white shadow-lg shadow-cyan-500/25' 
                  : 'bg-slate-700/70 text-gray-300 hover:bg-slate-600'
            }`}
          >
            {showSubdivisao ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            {subdivisaoTipo === 'setores' ? 'Setores' : 'Bairros'}
          </button>

          <button
            onClick={handleCloseSubdivisao}
            className="w-full px-3 py-2 rounded-lg text-xs font-medium bg-slate-800/60 text-gray-400 hover:bg-slate-700 hover:text-gray-200 transition-all"
          >
            ← Voltar ao estado
          </button>
        </div>
      )}

      {/* Info do município */}
      {selectedMunicipio && !disableSubdivisao && (
        <div className="absolute top-3 left-3 z-[1000] bg-slate-900/95 backdrop-blur-md rounded-xl border border-slate-700/60 px-4 py-3 shadow-2xl max-w-[280px]">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-semibold text-white">{selectedMunicipio}</span>
          </div>
          {loadingSubdivisao && (
            <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              Carregando subdivisões...
            </div>
          )}
          {!loadingSubdivisao && (
            <div className="text-xs mt-2">
              {subdivisaoTipo === 'bairros' ? (
                <span className="text-cyan-400 font-medium">✓ {subdivisaoData?.total} bairros oficiais</span>
              ) : subdivisaoTipo === 'setores' ? (
                <div>
                  <span className="text-violet-400 font-medium">✓ {subdivisaoData?.total} setores censitários (IBGE)</span>
                  <div className="flex items-start gap-1.5 mt-2 p-2 bg-slate-800/60 rounded-lg border border-slate-700/50">
                    <Info className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-400 leading-tight">
                      Bairros oficiais não disponíveis. Exibindo setores censitários do IBGE.
                    </span>
                  </div>
                </div>
              ) : subdivisaoTipo === 'bairrosTSE' ? (
                <div>
                  <span className="text-amber-400 font-medium">✓ {subdivisaoData?.bairros?.length} locais de votação</span>
                  <div className="flex items-start gap-1.5 mt-2 p-2 bg-slate-800/60 rounded-lg border border-slate-700/50">
                    <Info className="w-3 h-3 text-blue-400 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-400 leading-tight">
                      Polígonos de bairros não disponíveis para este município. Exibindo locais de votação agrupados por bairro.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-1.5 p-2 bg-slate-800/60 rounded-lg border border-slate-700/50">
                  <Info className="w-3 h-3 text-gray-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-500 leading-tight">
                    Sem dados de subdivisão disponíveis para este município.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Mapa */}
      <div 
        ref={mapRef} 
        className="w-full h-full rounded-xl overflow-hidden"
        style={{ background: '#f0f4f8', minHeight: '400px' }}
      />

      {/* Legenda */}
      <div className="absolute bottom-3 left-3 z-[1000] bg-white/90 backdrop-blur-md rounded-xl border border-gray-200 px-4 py-2.5 text-xs shadow-md">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-3 rounded-sm"
              style={{
                background: 'linear-gradient(to right, #dce8f5, #1e40af)',
                border: '1px solid #9ab8d4'
              }}
            />
            <span className="text-gray-600 font-medium">Municípios</span>
          </div>
          {showSubdivisao && subdivisaoData?.hasPolygons && (
            <div className="flex items-center gap-2">
              <div
                className="w-5 h-3 rounded-sm"
                style={{
                  background: subdivisaoTipo === 'setores'
                    ? 'rgba(124, 58, 237, 0.08)'
                    : 'rgba(26, 115, 232, 0.08)',
                  border: subdivisaoTipo === 'setores'
                    ? '1.8px solid #7c3aed'
                    : '1.8px solid #1a73e8'
                }}
              />
              <span className="text-gray-600 font-medium">
                {subdivisaoTipo === 'setores' ? 'Setores Censitários (IBGE)' : 'Bairros'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Exportar com memo para evitar re-renders desnecessários
export default memo(StateMapComponent);
