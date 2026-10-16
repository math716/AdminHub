// Balão dos mapas do Mapa Eleitoral (Resultado, Comparar e Evolução).
//
// HTML puro: o Leaflet recebe o conteúdo do balão como texto. O visual (tema
// claro e escuro) está nas classes .bc-* do app/globals.css.

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

/**
 * Textos do balão quando o valor não é "votos" — no Projeto de Campanha, a
 * aba Projeção mostra a meta do cenário. `dica: null` tira a dica de clique.
 */
export interface TextosBalao {
  valor?: string;
  total?: string;
  dica?: string | null;
  /** Formato do número em destaque (ex.: reais em Emendas). Padrão: 1.234. */
  formatarValor?: (n: number) => string;
  /** Texto quando a área não tem valor ("Sem emendas", "Sem contatos"). */
  semDados?: string;
  /** Tipo da área acima do nome, quando não é o padrão do mapa. */
  sobre?: string;
}

/** A dica dos textos (null = sem dica) ou a padrão do mapa. */
export function dicaDoBalao(t: TextosBalao | undefined, padrao: string | null): string | null {
  return t && t.dica !== undefined ? t.dica : padrao;
}

const COR_RESULTADO = '#2563eb';
const fmtBalao = (n: number) => n.toLocaleString('pt-BR');
const SETA_CLIQUE = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4.1 12 6"/><path d="m5.1 8-2.9-.8"/><path d="m6 12-1.9 2"/><path d="M7.2 2.2 8 5.1"/><path d="M9.04 12.17a.5.5 0 0 1 .63-.63l11 4a.5.5 0 0 1-.06.96l-4.2 1.1a1 1 0 0 0-.72.71l-1.1 4.21a.5.5 0 0 1-.96.06z"/></svg>';

/** Rodapé com a dica de clique. */
export function dicaBalao(texto: string): string {
  return `<span class="bc-dica">${SETA_CLIQUE}${escBalao(texto)}</span>`;
}

/** Posição de cada valor entre todos (1 = o maior). */
export function posicaoEntre(valor: number, todos: number[]): number {
  let acima = 0;
  for (const v of todos) if (v > valor) acima++;
  return acima + 1;
}

/**
 * Balão de uma área no Resultado: votos em destaque, quanto ela representa do
 * total do candidato no mapa (com barra) e a posição entre as áreas.
 */
export function balaoArea({ sobre, titulo, subtitulo, votos, total, posicao, quantas, area, rotuloTotal, dica, rotuloValor = 'votos', semDados = 'Sem votos aqui', etiquetas, formatarValor }: {
  sobre: string;
  titulo: string;
  subtitulo?: string | null;
  votos: number | null | undefined;
  /** Soma das áreas do mapa (o total do candidato ali). */
  total?: number;
  posicao?: number;
  /** Quantas áreas têm voto. */
  quantas?: number;
  /** Área no singular feminino/masculino para a posição: "cidade", "bairro"… */
  area?: string;
  /** "do total no estado", "do total na cidade"… */
  rotuloTotal?: string;
  dica?: string | null;
  rotuloValor?: string;
  semDados?: string;
  /** Etiquetas pequenas sob os números ("Zona 211", "12 seções"). */
  etiquetas?: string[];
  /** Formato do número em destaque (padrão: 1.234). */
  formatarValor?: (n: number) => string;
}): string {
  if (!votos) {
    return cartaoBalao({ sobre, titulo, subtitulo: subtitulo ?? semDados, rodape: dica ? dicaBalao(dica) : undefined });
  }
  const fracao = total ? votos / total : 0;
  const pct = `${(fracao * 100).toFixed(fracao < 0.001 ? 2 : 1).replace('.', ',')}%`;
  const corpo =
    `<div class="bc-numero-linha">` +
      `<div><span class="bc-numero">${escBalao((formatarValor ?? fmtBalao)(votos))}</span><span class="bc-unidade">${escBalao(rotuloValor)}</span></div>` +
      (posicao && area ? `<span class="bc-posicao" title="Posição entre ${quantas ?? ''} ${escBalao(area)} com voto">${posicao}º${quantas ? `<small>/ ${fmtBalao(quantas)}</small>` : ''}</span>` : '') +
    `</div>` +
    (total ? (
      `<div class="bc-barra bc-barra-grossa"><span style="width:${Math.max(fracao * 100, 1.5).toFixed(1)}%;background:linear-gradient(90deg, ${alfa(COR_RESULTADO, 0.6)}, ${COR_RESULTADO})"></span></div>` +
      `<div class="bc-legenda"><strong>${pct}</strong> ${escBalao(rotuloTotal ?? 'do total')}</div>`
    ) : '') +
    (etiquetas?.length ? `<div class="bc-etiquetas">${etiquetas.map(e => `<span>${escBalao(e)}</span>`).join('')}</div>` : '');
  return cartaoBalao({
    cor: COR_RESULTADO, sobre, titulo, subtitulo,
    corpo: `<div class="bc-area">${corpo}</div>`,
    rodape: dica ? dicaBalao(dica) : undefined,
  });
}

/**
 * Posição de um balão próprio (div solto dentro do mapa, sem o tooltip do
 * Leaflet): acima do cursor e centrado; perto do topo, embaixo; nas laterais,
 * desliza para dentro. Nunca passa da borda do mapa.
 */
export function posicionarBalaoLivre(el: HTMLElement, x: number, y: number, larguraMapa: number, alturaMapa: number) {
  const w = el.offsetWidth || 272, h = el.offsetHeight || 120, m = 8, folga = 14;
  let left = x - w / 2;
  left = Math.max(m, Math.min(left, larguraMapa - w - m));
  let top = y - h - folga;
  if (top < m) {
    const embaixo = y + folga;
    top = embaixo + h <= alturaMapa - m || y < alturaMapa / 2 ? embaixo : Math.max(m, alturaMapa - h - m);
  }
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

/** Deixa o div do balão próprio sem fundo: o cartão (.bc-card) vem no conteúdo. */
export const ESTILO_CASCA_BALAO = [
  'position:absolute', 'z-index:10000', 'pointer-events:none', 'display:none',
].join(';');
