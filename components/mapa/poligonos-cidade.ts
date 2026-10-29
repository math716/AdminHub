// Polígonos de bairro de uma cidade e "em qual bairro fica cada escola".
// Usado pelo comparador dentro da cidade e pela evolução entre eleições.

import { hasBairrosPoligonos } from '@/lib/geojson-manifest';
import { semAcento } from '@/components/mapa/comparacao-comum';
import { urlDados } from '@/lib/dados-url';

export interface PoligonosCidade {
  geojson: any;
  nomeDe: (feature: any) => string;
  /** Plural do que os polígonos são: "bairros", "distritos", "regiões administrativas". */
  rotulo: string;
}

/** Linha das escolas sem coordenada ou fora de todos os polígonos — nunca somem. */
export const FORA = '__fora__';

// Polígonos próprios de algumas capitais; as demais cidades com polígono usam
// os bairros do IBGE (Censo 2022) via /api/tse/bairros-poligonos.
const POLIGONOS_PROPRIOS: Array<{ uf: string; municipio: string; url: string; rotulo: string; nomeDe: (f: any) => string }> = [
  { uf: 'SP', municipio: 'SAO PAULO', url: '/geojson/sp-distritos.geojson', rotulo: 'distritos',
    nomeDe: f => f?.properties?.nm_distrito_municipal || f?.properties?.ds_nome || '' },
  { uf: 'RJ', municipio: 'RIO DE JANEIRO', url: '/geojson/rj-bairros.geojson', rotulo: 'bairros',
    nomeDe: f => f?.properties?.nome || f?.properties?.NOME || '' },
  { uf: 'CE', municipio: 'FORTALEZA', url: '/geojson/ce-bairros-fortaleza.geojson', rotulo: 'bairros',
    nomeDe: f => f?.properties?.Nome || f?.properties?.nome || f?.properties?.NOME || '' },
  { uf: 'DF', municipio: 'BRASILIA', url: '/geojson/df-regioes-administrativas.geojson', rotulo: 'regiões administrativas',
    nomeDe: f => f?.properties?.nome || '' },
];

export async function carregarPoligonosCidade(uf: string, municipio: string): Promise<PoligonosCidade | null> {
  try {
    const proprio = POLIGONOS_PROPRIOS.find(p => p.uf === uf && p.municipio === semAcento(municipio));
    if (proprio) {
      const r = await fetch(urlDados(proprio.url));
      const g = r.ok ? await r.json() : null;
      return g ? { geojson: g, nomeDe: proprio.nomeDe, rotulo: proprio.rotulo } : null;
    }
    if (!hasBairrosPoligonos(uf, municipio)) return null;
    const r = await fetch(`/api/tse/bairros-poligonos?${new URLSearchParams({ municipio, uf })}`);
    const d = r.ok ? await r.json() : null;
    return d?.features?.length
      ? { geojson: { type: 'FeatureCollection', features: d.features }, nomeDe: (f: any) => f?.properties?.NM_BAIRRO ?? '', rotulo: 'bairros' }
      : null;
  } catch {
    return null;
  }
}

export function singularDe(rotulo: string): string {
  return rotulo === 'distritos' ? 'distrito' : rotulo === 'regiões administrativas' ? 'região administrativa' : 'bairro';
}
export function botaoDe(rotulo: string): string {
  return rotulo === 'distritos' ? 'Distritos' : rotulo === 'regiões administrativas' ? 'Regiões' : 'Bairros';
}
export function todosOsDe(rotulo: string): string {
  return rotulo === 'regiões administrativas' ? 'Todas as regiões administrativas' : `Todos os ${rotulo}`;
}
export function rotuloColunaDe(rotulo: string): string {
  return rotulo === 'distritos' ? 'Distrito' : rotulo === 'regiões administrativas' ? 'Região administrativa' : 'Bairro';
}
export function nomeDaLinhaFora(rotulo: string): string {
  return `Sem ${singularDe(rotulo)} no mapa (sem coordenada ou fora dos limites)`;
}

// ── Ponto dentro do polígono (raio), com caixa envolvente para descartar rápido ──
type Anel = number[][];
export interface PoligonoIndexado { nome: string; aneis: Anel[][]; caixa: [number, number, number, number] }

export function indexarPoligonos(p: PoligonosCidade): PoligonoIndexado[] {
  return (p.geojson?.features ?? []).map((f: any) => {
    const g = f?.geometry;
    const poligonos: Anel[][] = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const pol of poligonos) for (const [x, y] of pol[0] ?? []) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return { nome: p.nomeDe(f), aneis: poligonos, caixa: [x0, y0, x1, y1] as [number, number, number, number] };
  });
}

function dentroDoAnel(x: number, y: number, anel: Anel): boolean {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i], [xj, yj] = anel[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/** Nome do polígono em que o ponto está, ou FORA. */
export function poligonoDoPonto(lat: number | null, lng: number | null, indice: PoligonoIndexado[]): string {
  if (lat == null || lng == null) return FORA;
  for (const p of indice) {
    const [x0, y0, x1, y1] = p.caixa;
    if (lng < x0 || lng > x1 || lat < y0 || lat > y1) continue;
    for (const aneis of p.aneis) {
      if (!aneis[0] || !dentroDoAnel(lng, lat, aneis[0])) continue;
      // Furos (aneis[1..]) — ex.: bairro com outro encravado.
      if (aneis.slice(1).some(furo => dentroDoAnel(lng, lat, furo))) continue;
      return p.nome;
    }
  }
  return FORA;
}
