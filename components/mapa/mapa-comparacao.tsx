'use client';

// Mapa do comparador de candidatos: Brasil (estados) ou um estado (cidades),
// cada área pintada com a cor de quem venceu ali entre os escolhidos.
//
// Separado do StateMap de propósito: aquele serve a Emendas, Demandas e
// Projeto de Campanha, com subdivisões e destaques próprios, e pintar por
// vencedor ali mexeria em todos. Aqui é só contorno + cor + balão.

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useMapCleanup } from '@/hooks/use-map-cleanup';
import { camadaBase } from '@/lib/maps/basemap';

export interface AparenciaArea {
  cor: string;
  /** 0–1: quanto maior a vantagem, mais forte a cor. */
  opacidade: number;
  /** Conteúdo do balão (HTML já escapado). */
  html: string;
}

interface MapaComparacaoProps {
  tipo: 'brasil' | 'estado';
  uf?: string;
  /**
   * Aparência de cada área. `chave` é a sigla da UF (Brasil) ou o código IBGE
   * do município (estado). null = sem voto de nenhum dos escolhidos.
   */
  aparencia: (chave: string, nome: string) => AparenciaArea | null;
  /** Muda sempre que os dados mudam — repinta sem recriar o mapa. */
  versao: string;
  onClickArea?: (chave: string, nome: string) => void;
  altura?: string;
}

const UF_CODIGO: Record<string, string> = {
  AC: '12', AL: '27', AP: '16', AM: '13', BA: '29', CE: '23', DF: '53', ES: '32', GO: '52',
  MA: '21', MT: '51', MS: '50', MG: '31', PA: '15', PB: '25', PR: '41', PE: '26', PI: '22',
  RJ: '33', RN: '24', RS: '43', RO: '11', RR: '14', SC: '42', SP: '35', SE: '28', TO: '17',
};
const CODIGO_UF = Object.fromEntries(Object.entries(UF_CODIGO).map(([uf, c]) => [c, uf]));
const NOME_UF: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
  DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná',
  PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina',
  SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};

const SEM_DADO = '#cbd5e1';

/** Cartão do balão no visual dos outros mapas (cores do tema claro/escuro). */
export function cartaoTooltip(conteudo: string): string {
  return `<div style="background:var(--bg-card-raised);padding:10px 14px;border-radius:10px;border:1px solid var(--border-default);box-shadow:var(--shadow-raised);min-width:190px;max-width:280px;white-space:normal;">${conteudo}</div>`;
}

export function MapaComparacao({ tipo, uf, aparencia, versao, onClickArea, altura = '520px' }: MapaComparacaoProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const geoLayerRef = useRef<any>(null);
  const [geo, setGeo] = useState<any>(null);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const { mapInstanceRef, cleanupMap } = useMapCleanup();

  // Refs: o balão e o clique leem sempre a versão atual, sem recriar o mapa.
  const aparenciaRef = useRef(aparencia);
  aparenciaRef.current = aparencia;
  const onClickRef = useRef(onClickArea);
  onClickRef.current = onClickArea;

  // Contornos (e, no estado, os nomes das cidades pelo código do IBGE).
  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    setGeo(null);
    const url = tipo === 'brasil' ? '/api/ibge/geojson?type=brasil' : `/api/ibge/geojson?type=estado&uf=${uf}`;
    Promise.all([
      fetch(url).then(r => (r.ok ? r.json() : null)),
      tipo === 'estado' && uf
        ? fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${UF_CODIGO[uf]}/municipios`)
            .then(r => (r.ok ? r.json() : [])).catch(() => [])
        : Promise.resolve([]),
    ]).then(([g, lista]) => {
      if (cancelado) return;
      if (!g?.features?.length) { setErro('Não foi possível carregar o mapa agora.'); return; }
      const porCodigo: Record<string, string> = {};
      for (const m of lista as any[]) porCodigo[String(m.id)] = m.nome;
      setNomes(porCodigo);
      setGeo(g);
    }).catch(() => { if (!cancelado) setErro('Não foi possível carregar o mapa agora.'); })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, [tipo, uf]);

  const chaveENome = (feature: any): { chave: string; nome: string } => {
    const cod = String(feature?.properties?.codarea ?? '');
    if (tipo === 'brasil') {
      const sigla = CODIGO_UF[cod] ?? cod;
      return { chave: sigla, nome: NOME_UF[sigla] ?? sigla };
    }
    return { chave: cod, nome: nomes[cod] ?? `Município ${cod}` };
  };

  const estilo = (chave: string, nome: string) => {
    const a = aparenciaRef.current(chave, nome);
    return {
      fillColor: a?.cor ?? SEM_DADO,
      fillOpacity: a ? a.opacidade : 0.35,
      color: '#ffffff',
      weight: tipo === 'brasil' ? 1.2 : 0.6,
      opacity: 0.9,
    };
  };

  // Cria o mapa quando os contornos chegam.
  useEffect(() => {
    if (!geo || !mapRef.current) return;
    let cancelado = false;
    let observador: ResizeObserver | null = null;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelado || !mapRef.current) return;
      cleanupMap();
      const map = L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: true,
        minZoom: 3,
        // Zoom em quartos: com passos inteiros o estado sobrava pequeno na caixa.
        zoomSnap: 0.25,
      });
      L.control.zoom({ position: 'bottomleft' }).addTo(map);
      mapInstanceRef.current = map;
      camadaBase(L).addTo(map);

      const camada = L.geoJSON(geo, {
        style: (f: any) => { const { chave, nome } = chaveENome(f); return estilo(chave, nome); },
        onEachFeature: (f: any, layer: any) => {
          const { chave, nome } = chaveENome(f);
          layer._area = { chave, nome };
          layer.bindTooltip(
            () => aparenciaRef.current(chave, nome)?.html ?? cartaoTooltip(
              `<div style="font-weight:600;color:var(--text-primary)">${nome}</div>` +
              '<div style="font-size:11px;color:var(--text-tertiary)">Sem votos dos candidatos escolhidos</div>'),
            // Casca transparente dos balões dos mapas (globals.css); o cartão vem no HTML.
            { sticky: true, direction: 'top', className: 'bairro-tooltip', opacity: 1 },
          );
          layer.on('mouseover', () => layer.setStyle({ weight: 2.5, color: '#0f172a' }));
          layer.on('mouseout', () => layer.setStyle({ weight: tipo === 'brasil' ? 1.2 : 0.6, color: '#ffffff' }));
          layer.on('click', () => onClickRef.current?.(chave, nome));
        },
      }).addTo(map);
      geoLayerRef.current = camada;

      // Enquadra quando a caixa já tem largura (criada com 0, o Leaflet
      // enquadraria no zoom máximo).
      let tentativas = 0;
      const enquadrar = () => {
        if (cancelado) return;
        if (map.getContainer().clientWidth > 0 || ++tentativas > 60) {
          map.invalidateSize();
          map.fitBounds(camada.getBounds(), { padding: [12, 12] });
        } else requestAnimationFrame(enquadrar);
      };
      enquadrar();

      // Caixa mudou de largura (girar o celular, abrir o menu, redimensionar
      // a janela): reenquadra. Só mudança grande — a barra de rolagem
      // aparecendo não deve desfazer o zoom de quem está olhando o mapa.
      let larguraAnterior = map.getContainer().clientWidth;
      observador = new ResizeObserver(() => {
        const largura = map.getContainer().clientWidth;
        if (Math.abs(largura - larguraAnterior) < 40) return;
        larguraAnterior = largura;
        map.invalidateSize();
        map.fitBounds(camada.getBounds(), { padding: [12, 12] });
      });
      observador.observe(map.getContainer());
    })();
    return () => { cancelado = true; observador?.disconnect(); geoLayerRef.current = null; cleanupMap(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo]);

  // Repinta quando os dados mudam (candidato adicionado, turno trocado…).
  useEffect(() => {
    geoLayerRef.current?.eachLayer((l: any) => {
      if (l._area) l.setStyle(estilo(l._area.chave, l._area.nome));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versao, nomes]);

  return (
    <div className="relative w-full rounded-xl overflow-hidden" style={{ height: altura, border: '1px solid var(--border-default)' }}>
      <div ref={mapRef} className="absolute inset-0" />
      {(carregando || erro) && (
        <div className="absolute inset-0 flex items-center justify-center text-sm" style={{ background: 'var(--bg-card)', color: 'var(--text-tertiary)' }}>
          {erro ?? <Loader2 className="h-5 w-5 animate-spin" />}
        </div>
      )}
    </div>
  );
}
