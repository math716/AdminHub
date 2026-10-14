// Campo político de cada partido e as cores do comparador de candidatos.
//
// Pedido do cliente (out/2026): esquerda em vermelho/laranja, direita em
// azul/verde, centro em amarelo e outras cores. Até 4 candidatos na
// comparação: dois do mesmo campo recebem tons diferentes da mesma família,
// nunca a mesma cor.
//
// A classificação é a convenção usada na imprensa e na ciência política
// brasileira. PSD fica na direita para bater com a paleta já combinada com o
// cliente nos relatórios da Gabi (lib/agent/report/geo-map.ts). Siglas antigas
// e fundidas entram junto (PR→PL, PRB→REPUBLICANOS, DEM/PSL→UNIÃO,
// PPS→CIDADANIA, PTC→AGIR, PMN→MOBILIZA, PATRI→PATRIOTA→PRD), porque a base
// tem eleições de 2018 em diante. Sigla que não estiver aqui conta como centro.

export type CampoPolitico = 'esquerda' | 'centro' | 'direita';

const ESQUERDA = ['PT', 'PSOL', 'PC DO B', 'PCDOB', 'PSB', 'PDT', 'REDE', 'PV', 'PSTU', 'PCB', 'PCO', 'UP', 'PPL'];
const DIREITA = [
  'PL', 'PR', 'PP', 'REPUBLICANOS', 'PRB', 'UNIÃO', 'UNIAO', 'DEM', 'PSL', 'NOVO', 'PSC', 'PTB',
  'PATRIOTA', 'PATRI', 'PRTB', 'PRD', 'PRP', 'MISSÃO', 'MISSAO', 'PSD', 'DEMOCRATA',
];
const CENTRO = [
  'MDB', 'PSDB', 'CIDADANIA', 'PPS', 'SOLIDARIEDADE', 'AVANTE', 'PODE', 'PROS', 'PMB',
  'PMN', 'MOBILIZA', 'AGIR', 'PTC', 'DC', 'PHS',
];

const CAMPO = new Map<string, CampoPolitico>([
  ...ESQUERDA.map(p => [p, 'esquerda'] as const),
  ...DIREITA.map(p => [p, 'direita'] as const),
  ...CENTRO.map(p => [p, 'centro'] as const),
]);

export function campoDoPartido(partido: string | null | undefined): CampoPolitico {
  return CAMPO.get((partido ?? '').trim().toUpperCase()) ?? 'centro';
}

export const NOME_CAMPO: Record<CampoPolitico, string> = {
  esquerda: 'Esquerda',
  centro: 'Centro',
  direita: 'Direita',
};

// Quatro tons por campo — o bastante para 4 candidatos do mesmo lado.
// Tons médios: o mapa clareia a cor quando a vantagem é pequena, então a cor
// base não pode ser clara demais.
const PALETA: Record<CampoPolitico, string[]> = {
  esquerda: ['#dc2626', '#ea580c', '#9f1239', '#c2410c'], // vermelho, laranja, vinho, laranja queimado
  direita: ['#2563eb', '#16a34a', '#1e3a8a', '#0f766e'],  // azul, verde, azul-marinho, verde-petróleo
  centro: ['#ca8a04', '#9333ea', '#db2777', '#a16207'],   // amarelo, roxo, rosa, ocre
};

/**
 * Uma cor para cada candidato, na ordem em que foram adicionados: o primeiro
 * de cada campo fica com a cor principal (vermelho, azul, amarelo) e os
 * seguintes com os outros tons do mesmo campo.
 */
export function coresDosCandidatos(partidos: Array<string | null | undefined>): string[] {
  const usados: Record<CampoPolitico, number> = { esquerda: 0, centro: 0, direita: 0 };
  return partidos.map(p => {
    const campo = campoDoPartido(p);
    const tons = PALETA[campo];
    return tons[usados[campo]++ % tons.length];
  });
}
