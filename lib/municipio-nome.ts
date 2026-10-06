// Chave para casar o nome de município do TSE com o do IBGE (malha dos mapas).
//
// Os dois escrevem diferente. O caso que mais pesa é o apóstrofo: o TSE grava
// "SANTA BARBARA D OESTE" e o IBGE "Santa Bárbara d'Oeste" — sem casar, a
// cidade saía cinza ("sem voto") no mapa, e era justamente o maior reduto do
// Ricardo Molina em 2026 (13.127 votos). São 8 municípios assim só em SP.
//
// Fora o apóstrofo, sobram grafias que não há regra que resolva. A lista
// abaixo saiu de comparar, estado por estado, todos os nomes da base do TSE
// (2018–2026) com a lista de municípios do IBGE. A chave leva a UF porque o
// mesmo nome existe em mais de um estado ("Bom Jesus" é outra cidade no PI).

import { normalizarTextoTse } from './tse-static';

const GRAFIAS_DO_TSE: Record<string, string> = {
  'BA:camaca': 'camacan',
  'BA:quinjingue': 'quijingue',
  'GO:bom jesus': 'bom jesus de goias',
  'MG:barao de monte alto': 'barao do monte alto',
  'MG:dona eusebia': 'dona euzebia',
  'MG:sao thome das letras': 'sao tome das letras',
  'MT:santo antonio do leverger': 'santo antonio de leverger',
  'PA:eldorado dos carajas': 'eldorado do carajas',
  'PA:santa isabel do para': 'santa izabel do para',
  'PR:munhoz de mello': 'munhoz de melo',
  'RN:ares': 'arez',
  'RN:boa saude': 'januario cicco',
  'RO:alvorada do oeste': 'alvorada d oeste',
  'RO:espigao do oeste': 'espigao d oeste',
  'RR:sao luiz': 'sao luiz do anaua',
  'SE:amparo de sao francisco': 'amparo do sao francisco',
  'SP:sao luis do paraitinga': 'sao luiz do paraitinga',
  'TO:fortaleza do tabocao': 'tabocao',
};

/** Mesma chave para o nome do TSE e para o do IBGE do mesmo município. */
export function chaveMunicipio(nome: string, uf?: string): string {
  const k = normalizarTextoTse(nome ?? '')
    .replace(/['’`´-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return GRAFIAS_DO_TSE[`${(uf ?? '').toUpperCase()}:${k}`] ?? k;
}
