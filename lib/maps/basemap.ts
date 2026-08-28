// Camada de fundo dos mapas (tiles), num lugar só.
//
// Antes a URL do CARTO estava repetida em 16 arquivos, com três textos de
// atribuição diferentes e dois valores de maxZoom. Quando o CARTO passou a
// exigir chave e a carimbar "API KEY REQUIRED" sobre cada tile, todos os mapas
// do sistema quebraram de uma vez e a correção teria de ser feita 16 vezes.
//
// Com chave configurada, o visual é exatamente o de sempre (CARTO Voyager).
// Sem chave, cai no basemap da Esri — que não exige cadastro — para que os
// mapas continuem legíveis em vez de ficarem cobertos pelo carimbo.

/**
 * Chave pública do CARTO. Precisa do prefixo NEXT_PUBLIC_ porque quem pede os
 * tiles é o navegador; ela fica visível no código do cliente, como em qualquer
 * serviço de mapa. A proteção correta não é escondê-la, e sim restringir os
 * domínios autorizados no painel do CARTO.
 */
const CHAVE_CARTO = process.env.NEXT_PUBLIC_CARTO_API_KEY?.trim();

// ATENÇÃO: o CARTO está aposentando os basemaps RASTER em favor dos vetoriais.
// A chave abaixo mantém o visual atual funcionando, mas em algum momento o
// raster sai do ar — e aí a escolha é migrar para o basemap vetorial deles
// (exige trocar o L.tileLayer por uma camada MapLibre) ou ficar na Esri.
const CARTO = {
  url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  subdominios: 'abcd',
  atribuicao:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> '
    + '&copy; <a href="https://carto.com/attributions">CARTO</a>',
};

const ESRI = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
  subdominios: '',
  atribuicao: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
};

export const usandoCarto = Boolean(CHAVE_CARTO);

const FONTE = usandoCarto ? CARTO : ESRI;

/**
 * URL dos tiles, já com a chave quando houver.
 *
 * O parâmetro é `key`, não `api_key` — este é o basemap público do CARTO
 * (carto.com/basemaps/apikey), que não tem relação com os tokens do Workspace
 * deles e não exige conta.
 */
export const URL_TILES = usandoCarto ? `${CARTO.url}?key=${CHAVE_CARTO}` : ESRI.url;
export const ATRIBUICAO_TILES = FONTE.atribuicao;

/**
 * Monta a camada de fundo. Recebe o L do Leaflet porque os mapas o carregam
 * dinamicamente (ele não roda no servidor).
 *
 *   camadaBase(L).addTo(map);
 *   camadaBase(L, { maxZoom: 20 }).addTo(map);
 */
export function camadaBase(L: any, opcoes: { maxZoom?: number } = {}) {
  return L.tileLayer(URL_TILES, {
    maxZoom: opcoes.maxZoom ?? 19,
    ...(FONTE.subdominios ? { subdomains: FONTE.subdominios } : {}),
    // A atribuição NÃO é opcional: os termos do CARTO e a licença do
    // OpenStreetMap exigem o crédito visível no mapa. Dois mapas rodavam sem
    // ele por decisão de layout — o Leaflet encolhe o crédito sozinho em telas
    // pequenas, então não havia motivo real para removê-lo.
    attribution: FONTE.atribuicao,
  });
}
