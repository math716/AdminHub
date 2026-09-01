'use client';

import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { MapPin, ZoomIn, ZoomOut, Layers, Home } from 'lucide-react';
import { useMapCleanup } from '@/hooks/use-map-cleanup';
import { camadaBase } from '@/lib/maps/basemap';

interface LocalVotacao {
  codLocal: number;
  nome: string;
  endereco: string;
  bairro: string;
  latitude: number;
  longitude: number;
}

interface ZonaData {
  zona: number;
  latitude: number;
  longitude: number;
  votos: number;
  bairros?: string[];
  locais: LocalVotacao[];
}

interface BairroAgrupado {
  nome: string;
  latitude: number;
  longitude: number;
  votos: number;
  zonas: number[];
  locais: LocalVotacao[];
}

interface ZonaMapProps {
  municipio: string;
  candidato: string;
  zonas: ZonaData[];
  bounds: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
    centerLat: number;
    centerLng: number;
  } | null;
}

type ViewMode = 'zonas' | 'bairros';

function ZonaMapComponent({ municipio, candidato, zonas, bounds }: ZonaMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const markersLayerRef = useRef<any>(null);
  const [selectedZona, setSelectedZona] = useState<ZonaData | null>(null);
  const [selectedBairro, setSelectedBairro] = useState<BairroAgrupado | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('bairros');
  const [bairrosAgrupados, setBairrosAgrupados] = useState<BairroAgrupado[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const isInitializingRef = useRef(false);
  
  // Usar hook de cleanup para gerenciamento de memória
  const { mapInstanceRef, registerLayer, cleanupMap, isUnmounted } = useMapCleanup();

  // Garantir que está montado no cliente
  useEffect(() => {
    setIsMounted(true);
    return () => {
      setIsMounted(false);
    };
  }, []);

  // Agrupar locais por bairro - usando bairros que vêm da API
  useEffect(() => {
    const bairroMap = new Map<string, BairroAgrupado>();
    
    // Primeiro: usar os bairros que já vêm na zona (do API)
    zonas.forEach(zona => {
      const bairrosZona = zona.bairros || [];
      
      bairrosZona.forEach(bairroNome => {
        if (!bairroNome) return;
        
        const bairroKey = bairroNome.toUpperCase().trim();
        
        if (!bairroMap.has(bairroKey)) {
          // Tentar encontrar coordenadas de um local deste bairro
          const localComCoord = zona.locais.find(l => 
            l.bairro?.toUpperCase().trim() === bairroKey && 
            l.latitude && l.longitude
          );
          
          bairroMap.set(bairroKey, {
            nome: bairroNome,
            latitude: localComCoord?.latitude || zona.latitude || 0,
            longitude: localComCoord?.longitude || zona.longitude || 0,
            votos: 0,
            zonas: [],
            locais: []
          });
        }
        
        const bairro = bairroMap.get(bairroKey)!;
        
        // Adicionar locais deste bairro
        zona.locais.forEach(local => {
          if (local.bairro?.toUpperCase().trim() === bairroKey) {
            bairro.locais.push(local);
          }
        });
        
        if (!bairro.zonas.includes(zona.zona)) {
          bairro.zonas.push(zona.zona);
          bairro.votos += zona.votos;
        }
      });
    });
    
    // Calcular centro médio de cada bairro (usando locais com coordenadas)
    bairroMap.forEach(bairro => {
      const locaisComCoord = bairro.locais.filter(l => l.latitude && l.longitude);
      if (locaisComCoord.length > 0) {
        bairro.latitude = locaisComCoord.reduce((sum, l) => sum + l.latitude, 0) / locaisComCoord.length;
        bairro.longitude = locaisComCoord.reduce((sum, l) => sum + l.longitude, 0) / locaisComCoord.length;
      }
    });
    
    // Filtrar bairros com coordenadas válidas para o mapa
    const bairrosValidos = Array.from(bairroMap.values())
      .filter(b => b.latitude !== 0 && b.longitude !== 0)
      .sort((a, b) => b.votos - a.votos);
    
    setBairrosAgrupados(bairrosValidos);
  }, [zonas]);

  // Renderizar marcadores de zonas
  const renderZonas = useCallback(async (map: any, layer: any) => {
    const L = (await import('leaflet')).default;
    layer.clearLayers();
    
    const maxVotos = Math.max(...zonas.map(z => z.votos), 1);
    
    zonas.forEach(zona => {
      if (!zona.latitude || !zona.longitude) return;
      
      const intensity = zona.votos / maxVotos;
      const hue = 120 - (intensity * 120);
      const color = `hsl(${hue}, 70%, 50%)`;
      const radius = Math.max(18, Math.min(45, 18 + (intensity * 27)));
      
      const marker = L.circleMarker([zona.latitude, zona.longitude], {
        radius: radius,
        fillColor: color,
        color: 'var(--text-primary)',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.85
      });
      
      const bairrosUnicos = zona.bairros || [...new Set(zona.locais.map(l => l.bairro).filter(Boolean))];
      const bairrosText = bairrosUnicos.length > 0 
        ? bairrosUnicos.slice(0, 3).join(', ') + (bairrosUnicos.length > 3 ? ` +${bairrosUnicos.length - 3}` : '')
        : 'Não informado';
      
      marker.bindTooltip(`
        <div style="background: rgba(15, 23, 42, 0.95); border: 1px solid var(--tint-25); border-radius: 8px; padding: 10px 14px; color: white; font-size: 12px; min-width: 180px;">
          <div style="font-weight: bold; font-size: 14px; margin-bottom: 6px; color: var(--acento-azul);">Zona ${zona.zona}</div>
          <div style="margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px solid var(--tint-10);">
            <div style="color: #9ca3af; font-size: 10px; margin-bottom: 2px;">BAIRRO(S):</div>
            <div style="color: var(--warning); font-weight: 500;">${bairrosText}</div>
          </div>
          <div><span style="color: var(--text-tertiary);">Votos:</span><span style="font-weight: bold; color: var(--success);"> ${zona.votos.toLocaleString('pt-BR')}</span></div>
        </div>
      `, { className: 'dark-map-tooltip', direction: 'top', offset: [0, -radius] });
      
      marker.on('click', () => {
        setSelectedBairro(null);
        setSelectedZona(zona);
        map.setView([zona.latitude, zona.longitude], 15, { animate: true });
      });
      
      layer.addLayer(marker);
      
      // Label da zona
      const divIcon = L.divIcon({
        className: 'zona-label',
        html: `<div style="width: ${radius * 2}px; height: ${radius * 2}px; display: flex; align-items: center; justify-content: center; font-weight: bold; color: white; text-shadow: 1px 1px 2px rgba(0,0,0,0.5); font-size: ${Math.max(11, radius / 2)}px;">${zona.zona}</div>`,
        iconSize: [radius * 2, radius * 2],
        iconAnchor: [radius, radius]
      });
      
      const labelMarker = L.marker([zona.latitude, zona.longitude], { icon: divIcon, interactive: false });
      layer.addLayer(labelMarker);
    });
  }, [zonas]);

  // Renderizar marcadores de bairros
  const renderBairros = useCallback(async (map: any, layer: any) => {
    const L = (await import('leaflet')).default;
    layer.clearLayers();
    
    if (bairrosAgrupados.length === 0) return;
    
    const maxVotos = Math.max(...bairrosAgrupados.map(b => b.votos), 1);
    
    // Cores para diferentes bairros
    const cores = [
      '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444',
      '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'
    ];
    
    bairrosAgrupados.forEach((bairro, index) => {
      const intensity = bairro.votos / maxVotos;
      const cor = cores[index % cores.length];
      const radius = Math.max(20, Math.min(50, 20 + (intensity * 30)));
      
      // Marcador principal do bairro
      const marker = L.circleMarker([bairro.latitude, bairro.longitude], {
        radius: radius,
        fillColor: cor,
        color: 'var(--text-primary)',
        weight: 3,
        opacity: 1,
        fillOpacity: 0.85
      });
      
      marker.bindTooltip(`
        <div style="background: rgba(15, 23, 42, 0.95); border: 1px solid var(--tint-25); border-radius: 8px; padding: 12px 16px; color: white; font-size: 12px; min-width: 200px;">
          <div style="font-weight: bold; font-size: 15px; margin-bottom: 8px; color: ${cor};">📍 ${bairro.nome}</div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span style="color: #9ca3af;">Votos estimados:</span>
            <span style="font-weight: bold; color: var(--success);">${bairro.votos.toLocaleString('pt-BR')}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span style="color: #9ca3af;">Zonas:</span>
            <span style="color: var(--acento-azul);">${bairro.zonas.sort((a,b) => a-b).join(', ')}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #9ca3af;">Locais de votação:</span>
            <span style="color: white;">${bairro.locais.length}</span>
          </div>
        </div>
      `, { className: 'dark-map-tooltip', direction: 'top', offset: [0, -radius] });
      
      marker.on('click', () => {
        setSelectedZona(null);
        setSelectedBairro(bairro);
        map.setView([bairro.latitude, bairro.longitude], 16, { animate: true });
      });
      
      layer.addLayer(marker);
      
      // Label do bairro
      const labelIcon = L.divIcon({
        className: 'bairro-label',
        html: `<div style="
          background: ${cor}; 
          color: white; 
          padding: 4px 8px; 
          border-radius: 4px; 
          font-size: 11px; 
          font-weight: 600; 
          white-space: nowrap; 
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          transform: translateX(-50%);
        ">${bairro.nome}</div>`,
        iconSize: [0, 0],
        iconAnchor: [0, -radius - 8]
      });
      
      const labelMarker = L.marker([bairro.latitude, bairro.longitude], { icon: labelIcon, interactive: false });
      layer.addLayer(labelMarker);
    });
  }, [bairrosAgrupados]);

  // Inicializar mapa
  useEffect(() => {
    if (!isMounted || !mapRef.current) return;
    if (!bounds || zonas.length === 0) return;
    if (isInitializingRef.current || mapInstanceRef.current) return;
    isInitializingRef.current = true;

    const initMap = async () => {
      if (isUnmounted()) {
        isInitializingRef.current = false;
        return;
      }
      
      const L = (await import('leaflet')).default;
      
      // Cleanup anterior
      cleanupMap();

      const map = L.map(mapRef.current!, {
        center: [bounds.centerLat, bounds.centerLng],
        zoom: 13,
        zoomControl: false,
        attributionControl: false,
        preferCanvas: true
      });

      mapInstanceRef.current = map;
      
      const markersLayer = L.layerGroup().addTo(map);
      markersLayerRef.current = markersLayer;
      registerLayer(markersLayer);

      camadaBase(L).addTo(map);

      const latLngBounds = L.latLngBounds(
        [bounds.minLat - 0.005, bounds.minLng - 0.005],
        [bounds.maxLat + 0.005, bounds.maxLng + 0.005]
      );
      map.fitBounds(latLngBounds, { padding: [30, 30] });
      
      isInitializingRef.current = false;
    };
    
    initMap();

    return () => {
      isInitializingRef.current = false;
      cleanupMap();
      markersLayerRef.current = null;
    };
  }, [bounds, zonas, isMounted, cleanupMap, registerLayer, isUnmounted]);

  // Atualizar marcadores quando mudar o modo de visualização
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;
    
    if (viewMode === 'zonas') {
      renderZonas(mapInstanceRef.current, markersLayerRef.current);
    } else {
      renderBairros(mapInstanceRef.current, markersLayerRef.current);
    }
  }, [viewMode, renderZonas, renderBairros]);

  const resetView = async () => {
    if (!mapInstanceRef.current || !bounds) return;
    const L = (await import('leaflet')).default;
    setSelectedZona(null);
    setSelectedBairro(null);
    const latLngBounds = L.latLngBounds(
      [bounds.minLat - 0.005, bounds.minLng - 0.005],
      [bounds.maxLat + 0.005, bounds.maxLng + 0.005]
    );
    mapInstanceRef.current.fitBounds(latLngBounds, { padding: [30, 30], animate: true });
  };

  if (!isMounted) {
    return (
      <div className="h-[500px] flex items-center justify-center bg-[var(--bg-card-subtle)]/50 rounded-lg">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
      </div>
    );
  }

  if (!bounds || zonas.length === 0) {
    return (
      <div className="h-[500px] flex items-center justify-center bg-[var(--bg-card-subtle)]/50 rounded-lg">
        <p className="text-gray-400">Sem dados de localização disponíveis para este município</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Cabeçalho do mapa */}
      <div className="absolute top-3 left-3 right-3 z-[1000] flex items-center justify-between">
        <div className="bg-[var(--bg-card)]/95 rounded-lg px-4 py-2 text-[color:var(--text-primary)]">
          <h3 className="font-bold text-sm">{municipio}</h3>
          <p className="text-xs text-gray-400">{candidato}</p>
        </div>
        
        {/* Controles de visualização */}
        <div className="flex gap-2">
          <div className="bg-[var(--bg-card)]/95 rounded-lg p-1 flex">
            <button
              onClick={() => setViewMode('bairros')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                viewMode === 'bairros' 
                  ? 'bg-amber-500 text-white' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <MapPin className="w-3 h-3 inline mr-1" />
              Bairros
            </button>
            <button
              onClick={() => setViewMode('zonas')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                viewMode === 'zonas' 
                  ? 'bg-blue-500 text-white' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Layers className="w-3 h-3 inline mr-1" />
              Zonas
            </button>
          </div>
          
          <button
            onClick={resetView}
            className="bg-[var(--bg-card)]/95 rounded-lg p-2 text-gray-400 hover:text-white transition-colors"
            title="Resetar visualização"
          >
            <Home className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <div 
        ref={mapRef} 
        className="h-[500px] rounded-lg overflow-hidden"
        style={{ background: '#0f172a' }}
      />
      
      {/* Controles de zoom */}
      <div className="absolute bottom-4 z-[1000] flex flex-col gap-1"
        style={{ right: 'var(--espaco-do-chat)' }}>
        <button
          onClick={() => mapInstanceRef.current?.zoomIn()}
          className="bg-[var(--bg-card)]/95 rounded-lg p-2 text-gray-400 hover:text-white transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => mapInstanceRef.current?.zoomOut()}
          className="bg-[var(--bg-card)]/95 rounded-lg p-2 text-gray-400 hover:text-white transition-colors"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
      </div>
      
      {/* Legenda */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-[var(--bg-card)]/95 rounded-lg p-3 text-xs text-[color:var(--text-primary)]">
        <div className="font-semibold mb-2">
          {viewMode === 'bairros' ? '📍 Bairros' : '🗳️ Zonas Eleitorais'}
        </div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-4 h-4 rounded-full" style={{ background: viewMode === 'bairros' ? '#f59e0b' : 'hsl(120, 70%, 50%)' }} />
          <span>{viewMode === 'bairros' ? 'Maior concentração' : 'Menos votos'}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ background: viewMode === 'bairros' ? '#6366f1' : 'hsl(0, 70%, 50%)' }} />
          <span>{viewMode === 'bairros' ? 'Menor concentração' : 'Mais votos'}</span>
        </div>
        <div className="mt-2 pt-2 border-t border-[var(--border-default)] text-gray-400">
          {viewMode === 'bairros' 
            ? `${bairrosAgrupados.length} bairros encontrados`
            : `${zonas.length} zonas eleitorais`
          }
        </div>
      </div>

      {/* Detalhes da zona selecionada */}
      {selectedZona && (
        <div className="absolute top-16 right-3 z-[1000] bg-[var(--bg-card)]/95 rounded-lg p-4 text-[color:var(--text-primary)] max-w-[320px] max-h-[400px] overflow-y-auto">
          <div className="flex justify-between items-center mb-3">
            <h4 className="font-bold text-blue-400 text-lg">Zona {selectedZona.zona}</h4>
            <button onClick={() => setSelectedZona(null)} className="text-gray-400 hover:text-white text-xl">×</button>
          </div>
          
          {(() => {
            const bairros = selectedZona.bairros || [...new Set(selectedZona.locais.map(l => l.bairro).filter(Boolean))];
            return bairros.length > 0 && (
              <div className="mb-3 pb-3 border-b border-[var(--border-default)]">
                <div className="text-xs text-gray-400 mb-2">Bairros desta zona:</div>
                <div className="flex flex-wrap gap-1">
                  {bairros.map((bairro, idx) => (
                    <span key={idx} className="text-xs bg-amber-500/20 text-[color:var(--brand-cobalt)] px-2 py-1 rounded">{bairro}</span>
                  ))}
                </div>
              </div>
            );
          })()}
          
          <div className="text-2xl font-bold text-green-400 mb-3">
            {selectedZona.votos.toLocaleString('pt-BR')} <span className="text-sm font-normal text-gray-400">votos</span>
          </div>
          
          <div className="text-xs text-gray-400 mb-2">Locais de votação ({selectedZona.locais.length}):</div>
          <div className="space-y-2 max-h-[180px] overflow-y-auto">
            {selectedZona.locais.map((local, idx) => (
              <div key={idx} className="text-xs bg-[var(--bg-card-subtle)]/50 rounded p-2">
                <div className="font-medium text-[color:var(--text-primary)]">{local.nome}</div>
                {local.bairro && <div className="text-[color:var(--brand-cobalt)] mt-0.5">📍 {local.bairro}</div>}
                {local.endereco && <div className="text-gray-400 mt-1">{local.endereco}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detalhes do bairro selecionado */}
      {selectedBairro && (
        <div className="absolute top-16 right-3 z-[1000] bg-[var(--bg-card)]/95 rounded-lg p-4 text-[color:var(--text-primary)] max-w-[320px] max-h-[400px] overflow-y-auto">
          <div className="flex justify-between items-center mb-3">
            <h4 className="font-bold text-[color:var(--brand-cobalt)] text-lg">📍 {selectedBairro.nome}</h4>
            <button onClick={() => setSelectedBairro(null)} className="text-gray-400 hover:text-white text-xl">×</button>
          </div>
          
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-[var(--bg-card-subtle)]/50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-green-400">{selectedBairro.votos.toLocaleString('pt-BR')}</div>
              <div className="text-xs text-gray-400">votos estimados</div>
            </div>
            <div className="bg-[var(--bg-card-subtle)]/50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-blue-400">{selectedBairro.zonas.length}</div>
              <div className="text-xs text-gray-400">{selectedBairro.zonas.length === 1 ? 'zona' : 'zonas'}</div>
            </div>
          </div>
          
          <div className="mb-3 pb-3 border-b border-[var(--border-default)]">
            <div className="text-xs text-gray-400 mb-2">Zonas eleitorais:</div>
            <div className="flex flex-wrap gap-1">
              {selectedBairro.zonas.sort((a,b) => a-b).map((zona, idx) => (
                <span key={idx} className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded font-medium">
                  Zona {zona}
                </span>
              ))}
            </div>
          </div>
          
          <div className="text-xs text-gray-400 mb-2">Locais de votação ({selectedBairro.locais.length}):</div>
          <div className="space-y-2 max-h-[150px] overflow-y-auto">
            {selectedBairro.locais.map((local, idx) => (
              <div key={idx} className="text-xs bg-[var(--bg-card-subtle)]/50 rounded p-2">
                <div className="font-medium text-[color:var(--text-primary)]">{local.nome}</div>
                {local.endereco && <div className="text-gray-400 mt-1">{local.endereco}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
// Exportar com memo para evitar re-renders desnecessários
export default memo(ZonaMapComponent);
