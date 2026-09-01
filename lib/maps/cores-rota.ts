// Cores dos trechos da rota do dia.
//
// A rota inteira era uma linha azul so. Com quatro compromissos no mesmo dia,
// olhando o mapa nao dava para dizer qual perna do trajeto era qual — e o
// painel lateral, que lista os trechos em ordem, nao tinha como apontar para
// nenhum deles. Cada trecho ganha uma cor, repetida no painel ao lado da
// distancia, e o mapa passa a ser legivel sem contar quilometro.
//
// Aqui e o unico lugar onde essas cores existem: a paleta e usada pelo mapa
// (Leaflet) e pelo painel, e as duas TEM que bater.

/**
 * Escolhidas para se distinguirem entre si e do mapa por baixo — nada de tom
 * de cinza (asfalto), verde-agua (parque) nem azul claro (agua). Todas escuras
 * o bastante para aparecer sobre tile claro, e saturadas o bastante para
 * aparecer sobre tile escuro.
 */
export const CORES_TRECHO = [
  '#2563EB',  // azul
  '#DC2626',  // vermelho
  '#059669',  // verde
  '#D97706',  // ambar
  '#7C3AED',  // roxo
  '#DB2777',  // rosa
  '#0891B2',  // ciano
  '#65A30D',  // oliva
] as const;

/** A cor do trecho `i`. Passando de oito trechos, recomeca a paleta. */
export function corDoTrecho(i: number): string {
  return CORES_TRECHO[((i % CORES_TRECHO.length) + CORES_TRECHO.length) % CORES_TRECHO.length];
}
