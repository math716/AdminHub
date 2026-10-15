'use client';

// Mapa de dentro da cidade no comparador: cada local de votação (escola) é um
// ponto com a cor de quem venceu — o local, o bairro ou a zona dele, conforme
// a visão — e, nas cidades com polígonos de bairro, o bairro inteiro pintado.
//
// Pontos em canvas (preferCanvas + circleMarker): São Paulo tem mais de 2 mil
// locais, e um elemento de página por pino travava o mapa (ver o histórico do
// municipio-map). No canvas é um desenho só, sem agrupamento.

import { useEffect, useRef } from 'react';
import { useMapCleanup } from '@/hooks/use-map-cleanup';
import { camadaBase } from '@/lib/maps/basemap';
import { COR_SEM_VOTO } from '@/components/mapa/comparacao-comum';

export interface PontoComparacao {
  chave: string;
  lat: number;
  lng: number;
  cor: string;
  /** 0–1, da força da vantagem. */
  opacidade: number;
  html: string;
}

export interface PoligonosComparacao {
  geojson: any;
  nomeDe: (feature: any) => string;
  aparencia: (nome: string) => { cor: string; opacidade: number; html: string } | null;
}

interface Props {
  pontos: PontoComparacao[];
  poligonos?: PoligonosComparacao | null;
  /** Muda quando cores/votos mudam — redesenha. */
  versao: string;
  /** Muda quando o conjunto de dados muda (outra cidade, outra visão) — reenquadra. */
  enquadramento: string;
  /** Pedido para aproximar num grupo de pontos (busca de bairro). */
  foco?: { nonce: number; pontos: Array<[number, number]> } | null;
}

/**
 * Fecha todos os balões do grupo (inclusive os dos polígonos, que ficam dentro
 * da camada GeoJSON), menos o do item que recebeu o mouse. Um balão por vez: com o mouse
 * rápido entre áreas vizinhas, o navegador às vezes não avisa a saída e o
 * balão anterior ficava preso por cima do mapa.
 */
function fecharBaloes(grupo: any, exceto?: any) {
  grupo?.eachLayer((l: any) => {
    if (l.eachLayer) l.eachLayer((sub: any) => { if (sub !== exceto) sub.closeTooltip?.(); });
    else if (l !== exceto) l.closeTooltip?.();
  });
}

export function MapaCidadeComparacao({ pontos, poligonos, versao, enquadramento, foco }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const camadasRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const { mapInstanceRef, cleanupMap } = useMapCleanup();

  // Cria o mapa uma vez.
  useEffect(() => {
    let cancelado = false;
    let observador: ResizeObserver | null = null;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelado || !mapRef.current) return;
      leafletRef.current = L;
      // Um redesenho pedido pouco antes de o mapa ser desmontado (trocar de
      // cidade no meio de um movimento) chegava com o canvas já desligado e o
      // Leaflet lançava "clearRect of undefined". Sem canvas, não há o que desenhar.
      const canvas = (L as any).Canvas.prototype;
      if (!canvas.__redesenhoSeguro) {
        const original = canvas._redraw;
        canvas._redraw = function (this: any) { if (this._ctx) original.call(this); };
        canvas.__redesenhoSeguro = true;
      }
      cleanupMap();
      const map = L.map(mapRef.current, {
        preferCanvas: true,
        zoomControl: false,
        attributionControl: false,
        zoomSnap: 0.25,
        center: [-15.8, -47.9],
        zoom: 4,
      });
      L.control.zoom({ position: 'bottomleft' }).addTo(map);
      camadaBase(L).addTo(map);
      camadasRef.current = L.layerGroup().addTo(map);
      // Saiu do mapa, arrastou ou deu zoom: nenhum balão fica aberto.
      map.on('mouseout movestart zoomstart', () => fecharBaloes(camadasRef.current));
      mapInstanceRef.current = map;

      // Caixa mudou bastante de largura (girar o celular etc.): mede de novo.
      let largura = map.getContainer().clientWidth;
      observador = new ResizeObserver(() => {
        const nova = map.getContainer().clientWidth;
        if (Math.abs(nova - largura) < 40) return;
        largura = nova;
        map.invalidateSize();
      });
      observador.observe(map.getContainer());
    })();
    return () => { cancelado = true; observador?.disconnect(); camadasRef.current = null; cleanupMap(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const limitesRef = useRef<any>(null);

  // Desenha (ou redesenha) polígonos e pontos.
  useEffect(() => {
    let tentativas = 0;
    let cancelado = false;
    const desenhar = () => {
      const L = leafletRef.current, map = mapInstanceRef.current, grupo = camadasRef.current;
      if (!L || !map || !grupo) { if (++tentativas < 60 && !cancelado) setTimeout(desenhar, 100); return; }
      grupo.clearLayers();
      const limites = L.latLngBounds([]);

      if (poligonos?.geojson) {
        const camada = L.geoJSON(poligonos.geojson, {
          style: (f: any) => {
            const a = poligonos.aparencia(poligonos.nomeDe(f));
            return {
              fillColor: a?.cor ?? COR_SEM_VOTO,
              fillOpacity: a ? a.opacidade : 0.25,
              color: '#ffffff', weight: 0.8, opacity: 0.9,
            };
          },
          onEachFeature: (f: any, layer: any) => {
            const nome = poligonos.nomeDe(f);
            layer.bindTooltip(() => poligonos.aparencia(nome)?.html ?? '', { sticky: true, direction: 'top', className: 'bairro-tooltip', opacity: 1 });
            layer.on('mouseover', () => { fecharBaloes(grupo, layer); layer.setStyle({ weight: 2.5, color: '#0f172a' }); });
            layer.on('mouseout', () => layer.setStyle({ weight: 0.8, color: '#ffffff' }));
          },
        });
        grupo.addLayer(camada);
        if (camada.getBounds().isValid()) limites.extend(camada.getBounds());
      }

      for (const p of pontos) {
        const marcador = L.circleMarker([p.lat, p.lng], {
          radius: poligonos ? 3.5 : 6.5,
          color: '#ffffff',
          weight: poligonos ? 0.6 : 1,
          fillColor: p.cor,
          // Ponto pequeno precisa de mais cor que um polígono para ser visto.
          fillOpacity: 0.4 + p.opacidade * 0.6,
        });
        marcador.bindTooltip(p.html, { direction: 'top', className: 'bairro-tooltip', opacity: 1 });
        marcador.on('mouseover', () => fecharBaloes(grupo, marcador));
        grupo.addLayer(marcador);
        limites.extend([p.lat, p.lng]);
      }
      limitesRef.current = limites.isValid() ? limites : null;
    };
    desenhar();
    return () => { cancelado = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versao]);

  // Reenquadra quando muda a cidade ou a visão.
  useEffect(() => {
    let tentativas = 0;
    let cancelado = false;
    const enquadrar = () => {
      const map = mapInstanceRef.current;
      if (cancelado) return;
      if (!map || !limitesRef.current || map.getContainer().clientWidth === 0) {
        if (++tentativas < 80) setTimeout(enquadrar, 100);
        return;
      }
      map.invalidateSize();
      map.fitBounds(limitesRef.current, { padding: [24, 24], maxZoom: 15 });
    };
    enquadrar();
    return () => { cancelado = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enquadramento]);

  // Busca de bairro: aproxima nos locais dele.
  useEffect(() => {
    const L = leafletRef.current, map = mapInstanceRef.current;
    if (!foco || !L || !map || foco.pontos.length === 0) return;
    map.fitBounds(L.latLngBounds(foco.pontos), { padding: [60, 60], maxZoom: 16, animate: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foco?.nonce]);

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-default)' }}>
      <div ref={mapRef} className="absolute inset-0" />
    </div>
  );
}
