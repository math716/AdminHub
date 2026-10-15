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

const escBalao = (s: string) =>
  String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Cor em hex com transparência (o balão é HTML puro, sem as peças do React). */
function alfa(hex: string, a: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * Cartão do balão dos mapas do comparador e da evolução. O visual (claro e
 * escuro) está nas classes .bc-* do globals.css; aqui só a estrutura.
 * `cor` tinge o topo do cartão (quem venceu, ou ganho/perda).
 */
export function cartaoBalao({ cor, sobre, titulo, subtitulo, corpo, rodape }: {
  cor?: string;
  /** Linha pequena acima do título ("Estado", "Local de votação"…). */
  sobre?: string | null;
  titulo: string;
  subtitulo?: string | null;
  /** HTML já escapado. */
  corpo?: string;
  /** HTML já escapado. */
  rodape?: string;
}): string {
  const brilho = cor ? `background:linear-gradient(180deg, ${alfa(cor, 0.16)} 0%, ${alfa(cor, 0)} 100%);` : '';
  return `<div class="bc-card">` +
    (cor ? `<div class="bc-faixa" style="background:linear-gradient(90deg, ${cor}, ${alfa(cor, 0.35)})"></div>` : '') +
    `<div class="bc-topo" style="${brilho}">` +
      (sobre ? `<div class="bc-sobre">${escBalao(sobre)}</div>` : '') +
      `<div class="bc-titulo">${escBalao(titulo)}</div>` +
      (subtitulo ? `<div class="bc-sub">${escBalao(subtitulo)}</div>` : '') +
    `</div>` +
    (corpo ? `<div class="bc-corpo">${corpo}</div>` : '') +
    (rodape ? `<div class="bc-rodape">${rodape}</div>` : '') +
  `</div>`;
}

/** Linha de um valor no balão: bolinha com iniciais, nome, barra, % e votos. */
export function linhaBalao({ cor, iniciais, nome, fracao, principal, secundario, destaque }: {
  cor: string; iniciais?: string; nome: string; fracao: number; principal: string; secundario?: string; destaque?: boolean;
}): string {
  const largura = Math.max(0, Math.min(1, fracao)) * 100;
  return `<div class="bc-linha${destaque ? ' bc-linha-destaque' : ''}">` +
    (iniciais
      ? `<span class="bc-avatar" style="background:linear-gradient(135deg, ${cor}, ${alfa(cor, 0.7)});box-shadow:0 0 0 2px ${alfa(cor, 0.22)}">${escBalao(iniciais)}</span>`
      : `<span class="bc-ponto" style="background:${cor};box-shadow:0 0 0 3px ${alfa(cor, 0.2)}"></span>`) +
    `<div class="bc-info">` +
      `<div class="bc-nome">${escBalao(nome)}</div>` +
      `<div class="bc-barra"><span style="width:${largura.toFixed(1)}%;background:linear-gradient(90deg, ${alfa(cor, 0.65)}, ${cor})"></span></div>` +
    `</div>` +
    `<div class="bc-nums"><div class="bc-principal">${principal}</div>` +
      (secundario ? `<div class="bc-secundario">${secundario}</div>` : '') +
    `</div>` +
  `</div>`;
}

/** Etiqueta colorida do rodapé do balão. */
export function pilulaBalao(cor: string, texto: string): string {
  return `<span class="bc-pilula" style="background:linear-gradient(135deg, ${cor}, ${alfa(cor, 0.82)});box-shadow:0 4px 12px -4px ${alfa(cor, 0.7)}">${texto}</span>`;
}

/**
 * Mantém o balão dentro do mapa. O mapa corta o que passa da borda: perto do
 * topo o balão abre para baixo, nas laterais desliza para dentro e, se não
 * couber nem em cima nem embaixo (mapa baixo, no celular), abre ao lado.
 */
export function prenderBalaoNoMapa(map: any, layer: any) {
  const ajustar = () => {
    const t = layer.getTooltip?.();
    const el = t?.getElement?.();
    const ll = t?.getLatLng?.();
    // Fechado (outro balão abriu, o mouse saiu): nada a posicionar.
    if (!t || !el || !ll || !map._loaded || !layer.isTooltipOpen?.()) return;
    const p = map.latLngToContainerPoint(ll);
    const { x: W, y: H } = map.getSize();
    const w = el.offsetWidth, h = el.offsetHeight, m = 8, folga = 14;
    const acima = p.y - folga, abaixo = H - p.y - folga;
    const dentro = (inicio: number, tamanho: number, limite: number) =>
      inicio < m ? m - inicio : inicio + tamanho > limite - m ? Math.max(m - inicio, limite - m - (inicio + tamanho)) : 0;

    let direcao: 'top' | 'bottom' | 'left' | 'right';
    let offset: [number, number];
    const esquerda = p.x - folga, direita = W - p.x - folga;
    if (acima >= h + m || (abaixo < h + m && Math.max(esquerda, direita) < w + m && acima >= abaixo)) {
      direcao = 'top';
      offset = [dentro(p.x - w / 2, w, W), -folga];
    } else if (abaixo >= h + m || Math.max(esquerda, direita) < w + m) {
      direcao = 'bottom';
      offset = [dentro(p.x - w / 2, w, W), folga];
    } else {
      direcao = direita >= esquerda ? 'right' : 'left';
      offset = [direcao === 'right' ? folga : -folga, dentro(p.y - h / 2, h, H)];
    }
    t.options.direction = direcao;
    t.options.offset = offset;
    if (t._updatePosition) t._updatePosition(); else t.update();
  };
  layer.on('tooltipopen mousemove', ajustar);
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
        // Lista guardada no sistema; o IBGE só se o arquivo faltar.
        ? fetch(`/geojson/ibge/municipios/${uf}.json`)
            .then(r => (r.ok ? r : fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${UF_CODIGO[uf]}/municipios`)))
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

      const fecharBaloes = (exceto?: any) => camada.eachLayer((l: any) => { if (l !== exceto) l.closeTooltip(); });
      const camada = L.geoJSON(geo, {
        style: (f: any) => { const { chave, nome } = chaveENome(f); return estilo(chave, nome); },
        onEachFeature: (f: any, layer: any) => {
          const { chave, nome } = chaveENome(f);
          layer._area = { chave, nome };
          layer.bindTooltip(
            () => aparenciaRef.current(chave, nome)?.html ?? cartaoBalao({
              sobre: tipo === 'brasil' ? 'Estado' : 'Cidade', titulo: nome, subtitulo: 'Sem votos dos candidatos escolhidos',
            }),
            // Casca transparente dos balões dos mapas (globals.css); o cartão vem no HTML.
            { sticky: true, direction: 'top', className: 'bairro-tooltip', opacity: 1 },
          );
          prenderBalaoNoMapa(map, layer);
          layer.on('mouseover', () => {
            // Um balão por vez: com o mouse rápido entre cidades vizinhas, o
            // navegador às vezes não avisa a saída e o balão anterior ficava preso.
            fecharBaloes(layer);
            layer.setStyle({ weight: 2.5, color: '#0f172a' });
          });
          layer.on('mouseout', () => layer.setStyle({ weight: tipo === 'brasil' ? 1.2 : 0.6, color: '#ffffff' }));
          layer.on('click', () => { fecharBaloes(); onClickRef.current?.(chave, nome); });
        },
      }).addTo(map);
      geoLayerRef.current = camada;
      // Saiu do mapa, arrastou ou deu zoom: nenhum balão fica aberto.
      map.on('mouseout movestart zoomstart', () => fecharBaloes());

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
    <div className="relative w-full overflow-hidden" style={{ height: altura }}>
      <div ref={mapRef} className="absolute inset-0" />
      {(carregando || erro) && (
        <div className="absolute inset-0 flex items-center justify-center text-sm" style={{ background: 'var(--bg-card)', color: 'var(--text-tertiary)' }}>
          {erro ?? <Loader2 className="h-5 w-5 animate-spin" />}
        </div>
      )}
    </div>
  );
}
