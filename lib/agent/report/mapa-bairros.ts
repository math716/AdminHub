// Mapa de um MUNICÍPIO dividido por bairros, para relatórios de eleição
// municipal. Antes, uma consulta a uma cidade saía com o mapa do estado inteiro
// e um único município pintado — informação nenhuma sobre onde, dentro da
// cidade, estão os votos.
//
// Os votos do TSE vão até a ZONA eleitoral, não até o bairro. A distribuição
// segue o método já usado em /api/tse/bairros-poligonos e no relatório
// territorial do DF: cada local de votação cai num bairro por point-in-polygon,
// e os votos da zona são repartidos entre os bairros na proporção do número de
// locais de cada um.
//
// IMPORTANTE: os GeoJSON são lidos por HTTP, nunca por `fs`. São ~230 MB em
// public/geojson e, lidos do disco, o tracing da Vercel os copiaria para dentro
// da função — que já está a menos de 1 MB do teto de 250 MB.

import { loadLocaisTse, loadStaticTseData, normalizarTextoTse, type LocalVotacao } from '@/lib/tse-static';

// ── Point-in-polygon (ray casting) ──────────────────────────────────────────
function pip(pt: [number, number], ring: [number, number][]): boolean {
  let dentro = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) &&
        pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

function dentroDaFeicao(lng: number, lat: number, geom: any): boolean {
  if (!geom) return false;
  const p: [number, number] = [lng, lat];
  if (geom.type === 'Polygon') return pip(p, geom.coordinates[0]);
  if (geom.type === 'MultiPolygon') return geom.coordinates.some((poly: any) => pip(p, poly[0]));
  return false;
}

// ── Carga do GeoJSON de bairros (por HTTP) ──────────────────────────────────
const cacheBairros = new Map<string, any[] | null>();

/**
 * Bairros de um município, a partir do GeoJSON estadual do Censo 2022
 * (`public/geojson/<UF>_bairros_CD2022.json`, chaveado por `NM_MUN`/`NM_BAIRRO`).
 * 895 municípios estão cobertos, incluindo as capitais. Devolve `null` quando a
 * cidade não tem malha — aí o relatório cai no mapa do estado, como antes.
 */
// Cidades cujo recorte oficial não é "bairro" e por isso ficam de fora do
// arquivo estadual do Censo — cada uma tem malha própria, com outra chave de
// nome. São Paulo, por exemplo, se divide em 96 distritos.
// (Fortaleza NÃO entra aqui: já vem no arquivo do Censo do CE, com NM_BAIRRO.)
const MALHAS_ESPECIAIS: Record<string, { arquivo: string; chaveNome: string }> = {
  'SP:sao paulo': { arquivo: 'sp-distritos.geojson', chaveNome: 'nm_distrito_municipal' },
};

/** Normaliza a chave do nome para NM_BAIRRO, que é o que o mapa consome. */
function padronizarNome(features: any[], chave: string): any[] {
  if (chave === 'NM_BAIRRO') return features;
  return features.map(f => ({
    ...f,
    properties: { ...f.properties, NM_BAIRRO: f.properties?.[chave] ?? '' },
  }));
}

export async function carregarBairros(
  uf: string, municipio: string, baseUrl: string,
): Promise<any[] | null> {
  const ufUp = uf.toUpperCase();
  const munNorm = normalizarTextoTse(municipio);
  const chave = `${ufUp}:${munNorm}`;
  if (cacheBairros.has(chave)) return cacheBairros.get(chave)!;

  let features: any[] | null = null;
  try {
    const especial = MALHAS_ESPECIAIS[chave];
    if (especial) {
      const res = await fetch(`${baseUrl}/geojson/${especial.arquivo}`);
      if (res.ok) {
        const geo = await res.json();
        const fs_ = geo.features ?? [];
        if (fs_.length > 0) features = padronizarNome(fs_, especial.chaveNome);
      }
    } else {
      const res = await fetch(`${baseUrl}/geojson/${ufUp}_bairros_CD2022.json`);
      if (res.ok) {
        const geo = await res.json();
        const doMunicipio = (geo.features ?? []).filter(
          (f: any) => normalizarTextoTse(f.properties?.NM_MUN ?? '') === munNorm,
        );
        if (doMunicipio.length > 0) features = doMunicipio;
      }
    }
  } catch (err) {
    console.warn(`[mapa-bairros] malha de ${municipio}/${ufUp} indisponível:`, String(err).slice(0, 120));
  }
  cacheBairros.set(chave, features);
  return features;
}

// ── Distribuição dos votos por bairro ───────────────────────────────────────
export interface ZonaVotos { zona: number; votos: number }

/**
 * Reparte os votos de cada zona entre os bairros do município, na proporção do
 * número de locais de votação que cada bairro tem naquela zona.
 */
export function distribuirVotosPorBairro(
  features: any[],
  locais: LocalVotacao[],
  municipio: string,
  zonas: ZonaVotos[],
): Record<string, number> {
  const alvo = normalizarTextoTse(municipio);
  const doMunicipio = locais.filter(
    l => normalizarTextoTse(l.municipio) === alvo &&
         l.lat && l.lng && l.lat >= -35 && l.lat <= 5 && l.lng >= -74 && l.lng <= -35,
  );
  if (doMunicipio.length === 0) return {};

  // Local → bairro (uma passada de PiP; o resultado é reaproveitado abaixo)
  const bairroDoLocal = new Map<string, string>();
  for (const l of doMunicipio) {
    for (const f of features) {
      if (dentroDaFeicao(l.lng, l.lat, f.geometry)) {
        bairroDoLocal.set(`${l.zona}-${l.codLocal}`, f.properties?.NM_BAIRRO ?? '');
        break;
      }
    }
  }

  // Quantos locais cada bairro tem, dentro de cada zona
  const porZona = new Map<number, Record<string, number>>();
  for (const l of doMunicipio) {
    const b = bairroDoLocal.get(`${l.zona}-${l.codLocal}`);
    if (!b) continue;
    if (!porZona.has(l.zona)) porZona.set(l.zona, {});
    const m = porZona.get(l.zona)!;
    m[b] = (m[b] ?? 0) + 1;
  }

  const votos: Record<string, number> = {};
  for (const z of zonas) {
    if (!z.votos) continue;
    const contagem = porZona.get(z.zona);
    if (!contagem) continue; // zona sem local mapeado — redistribui nas demais
    const totalLocais = Object.values(contagem).reduce((a, b) => a + b, 0);
    if (totalLocais === 0) continue;
    for (const [bairro, qtd] of Object.entries(contagem)) {
      votos[bairro] = (votos[bairro] ?? 0) + (z.votos * qtd) / totalLocais;
    }
  }
  for (const k of Object.keys(votos)) votos[k] = Math.round(votos[k]);
  return votos;
}

/**
 * Todas as zonas do candidato no município, lidas da base.
 *
 * A resposta da ferramenta corta em 30 zonas para não inflar o turno do chat, e
 * usar esse recorte no mapa distorceria muito: o Rio tem 49 zonas, e as 30
 * maiores somam só 71,6% dos votos de Eduardo Paes em 2020 — 276 mil votos
 * ficariam de fora do desenho.
 */
async function zonasCompletas(
  ano: number, uf: string, municipio: string, nomeUrna: string, cargo?: string,
): Promise<ZonaVotos[] | null> {
  const base = await loadStaticTseData(String(ano), uf.toUpperCase());
  if (!base) return null;
  const alvoNome = normalizarTextoTse(nomeUrna);
  const alvoCargo = cargo ? normalizarTextoTse(cargo) : '';
  const cand = base.find(c =>
    normalizarTextoTse(c.nomeUrna) === alvoNome &&
    (!alvoCargo || normalizarTextoTse(c.cargo).includes(alvoCargo)));
  if (!cand) return null;

  const alvoMun = normalizarTextoTse(municipio);
  return (cand.zonas ?? [])
    .filter(z => normalizarTextoTse(z.municipio) === alvoMun)
    .map(z => ({ zona: z.zona, votos: z.votos }));
}

/**
 * Atalho: da consulta ao mapa. Devolve as feições do município e os votos por
 * bairro, ou `null` se a cidade não tiver malha ou não houver o que distribuir.
 */
export async function bairrosComVotos(params: {
  uf: string; municipio: string; zonas: ZonaVotos[]; baseUrl: string;
  ano?: number; nomeUrna?: string; cargo?: string;
}): Promise<{ features: any[]; valores: Record<string, number> } | null> {
  const { uf, municipio, baseUrl } = params;
  if (!uf || !municipio) return null;

  // Prefere as zonas completas da base; o recorte recebido é o plano B.
  const completas = params.ano && params.nomeUrna
    ? await zonasCompletas(params.ano, uf, municipio, params.nomeUrna, params.cargo)
    : null;
  const zonas = completas && completas.length > 0 ? completas : params.zonas;
  if (!zonas || zonas.length === 0) return null;

  const features = await carregarBairros(uf, municipio, baseUrl);
  if (!features) return null;

  const locais = await loadLocaisTse(uf.toUpperCase());
  if (!locais) return null;

  const valores = distribuirVotosPorBairro(features, locais, municipio, zonas);
  return Object.keys(valores).length > 0 ? { features, valores } : null;
}
