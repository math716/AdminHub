// Mapa do DF por Região Administrativa, para os relatórios eleitorais.
//
// O DF é um único município. O mapa "por município" pintava o Distrito Federal
// inteiro de uma cor só, com o vencedor geral da eleição — inútil, e pior:
// exibia um nome que nem estava na comparação pedida. A divisão que interessa
// no DF é a Região Administrativa (Ceilândia, Taguatinga, Plano Piloto…), que
// já é usada no relatório territorial.

import {
  carregarTerritorial, type TerritorialData,
} from '@/lib/agent/report/df-territorial';
import { normalizarTextoTse, type CandidatoJson } from '@/lib/tse-static';
import type { Vencedor } from '@/lib/agent/report/geo-map';

/** Casa o candidato do relatório com o da base (por nome de urna ou civil). */
function acharCandidato(data: TerritorialData, nomeUrna: string): CandidatoJson | null {
  const alvo = normalizarTextoTse(nomeUrna);
  return data.candidatos.find(c =>
    normalizarTextoTse(c.nomeUrna) === alvo || normalizarTextoTse(c.nome) === alvo) ?? null;
}

export interface MapaDF {
  /** Vencedor por RA — usado quando há 2+ candidatos comparados. */
  vencedores?: Record<string, Vencedor>;
  /** Votos por RA de um único candidato — usado no mapa de calor. */
  valores?: Record<string, number>;
}

/**
 * Distribui os votos dos candidatos do relatório pelas RAs do DF.
 *
 * Com 2+ candidatos devolve quem vence cada RA **entre eles** (não o vencedor
 * geral da eleição); com um só, os votos dele por RA para o mapa de calor.
 * Devolve `null` se a base do ano não existir ou nenhum nome casar.
 */
export function mapaDoDF(params: {
  ano: number;
  cargo?: string;
  candidatos: Array<{ nomeUrna?: string; nome?: string; partido?: string }>;
}): MapaDF | null {
  const { ano, cargo, candidatos } = params;
  if (candidatos.length === 0) return null;

  const data = carregarTerritorial(ano, 'DF', cargo || 'Deputado Distrital');
  if (!data) return null;

  const casados = candidatos
    .map(c => {
      const nome = c.nomeUrna || c.nome || '';
      const achado = acharCandidato(data, nome);
      return achado
        ? { nome: achado.nomeUrna || achado.nome, partido: achado.partido ?? c.partido ?? '', id: achado.id }
        : null;
    })
    .filter((x): x is { nome: string; partido: string; id: string } => x !== null);

  if (casados.length === 0) return null;

  // Um candidato → mapa de calor com os votos dele por RA
  if (casados.length === 1) {
    const votos = data.votosPorCand.get(casados[0].id);
    return votos && Object.keys(votos).length > 0 ? { valores: votos } : null;
  }

  // Vários → quem lidera cada RA ENTRE os candidatos comparados
  const melhor: Record<string, { nome: string; partido: string; votos: number }> = {};
  for (const cand of casados) {
    const votos = data.votosPorCand.get(cand.id) ?? {};
    for (const [ra, v] of Object.entries(votos)) {
      if (!melhor[ra] || v > melhor[ra].votos) {
        melhor[ra] = { nome: cand.nome, partido: cand.partido, votos: v };
      }
    }
  }
  const vencedores: Record<string, Vencedor> = Object.fromEntries(
    Object.entries(melhor).map(([ra, m]) => [ra, { candidato: m.nome, partido: m.partido }]),
  );
  return Object.keys(vencedores).length > 0 ? { vencedores } : null;
}
