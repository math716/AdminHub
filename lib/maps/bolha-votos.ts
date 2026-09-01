// A bolha com o número de votos que aparece sobre cada bairro/distrito.
//
// Vivia copiada em cinco mapas (SP distritos, RJ, MG, CE e as regiões do DF),
// com a mesma marcação escrita cinco vezes. Mora aqui porque são a MESMA
// bolha: mudar a cor num lugar e esquecer os outros quatro já aconteceu.
//
// Cor: fundo azul claro, texto azul escuro, borda definida. A versão anterior
// era um círculo azul-marinho quase preto — pensado para basemap escuro, e o
// basemap é claro. Sobre ruas e quarteirões claros ele virava uma mancha
// pesada; sobre basemap escuro, uma mancha que some. Claro sobre escuro OU
// sobre claro sempre se distingue, então a mesma bolha serve aos dois temas.

/** Fundo da bolha. Azul claro: destaca no mapa claro sem virar mancha preta. */
const FUNDO = '#DBEAFE';
/** Texto e borda. Azul escuro sobre o fundo claro — 8,6:1 de contraste. */
const TINTA = '#1E3A8A';
const BORDA = '#2563EB';

/** Diâmetro pelo tamanho do texto: "9" cabe em 28px, "12500" precisa de 40. */
export function tamanhoDaBolha(rotulo: string): number {
  if (rotulo.length <= 2) return 28;
  if (rotulo.length <= 3) return 32;
  if (rotulo.length <= 4) return 36;
  return 40;
}

/**
 * O HTML da bolha, para entregar ao `L.divIcon` do Leaflet.
 *
 * `pointer-events:none` é essencial: sem isso a bolha rouba o clique do
 * polígono embaixo dela, e o bairro mais votado — justamente o que tem a
 * bolha maior — fica o mais difícil de selecionar.
 */
export function htmlDaBolha(rotulo: string, tamanho = tamanhoDaBolha(rotulo)): string {
  const fonte = tamanho <= 28 ? 9 : tamanho <= 32 ? 10 : 11;
  return `<div style="`
    + `width:${tamanho}px;height:${tamanho}px;`
    + `background:${FUNDO};color:${TINTA};`
    + `font-size:${fonte}px;font-weight:800;`
    + `border-radius:50%;border:2px solid ${BORDA};`
    + `display:flex;align-items:center;justify-content:center;`
    + `pointer-events:none;`
    + `box-shadow:0 1px 4px rgba(15,23,42,0.35);`
    + `font-family:'Segoe UI',system-ui,sans-serif;letter-spacing:-0.5px;`
    + `">${rotulo}</div>`;
}
