// Utilitário server-only: monta um mapa eleitoral (coroplético por partido
// vencedor) para embutir no PDF do relatório da Gabi via @react-pdf/renderer.
// Retorna dados puros (paths SVG + legenda) — a construção dos elementos
// <Svg>/<Path> fica na rota do relatório.

import { loadStaticTseData, normalizarTextoTse } from '@/lib/tse-static';

// ── Códigos IBGE das UFs ────────────────────────────────────────────────────
const UF_CODES: Record<string, number> = {
  AC: 12, AL: 27, AP: 16, AM: 13, BA: 29, CE: 23, DF: 53, ES: 32, GO: 52,
  MA: 21, MT: 51, MS: 50, MG: 31, PA: 15, PB: 25, PR: 41, PE: 26, PI: 22,
  RJ: 33, RN: 24, RS: 43, RO: 11, RR: 14, SC: 42, SP: 35, SE: 28, TO: 17,
};
const CODE_TO_UF: Record<string, string> =
  Object.fromEntries(Object.entries(UF_CODES).map(([uf, code]) => [String(code), uf]));

// ── Cores por afiliação política (definido pelo cliente) ────────────────────
//   PT / PSOL                    → vermelho
//   PL / PSD / REPUBLICANOS      → azul
//   demais                       → amarelo
const COR_VERMELHO = '#ef4444';
const COR_AZUL     = '#1d4ed8';
const COR_AMARELO  = '#f59e0b';
const NEUTRAL      = '#e2e8f0'; // município sem vencedor / sem dado
const PARTIDOS_VERMELHO = new Set(['PT', 'PSOL']);
const PARTIDOS_AZUL     = new Set(['PL', 'PSD', 'REPUBLICANOS']);

// Faixas de valor (heatmap azul) para o mapa de emendas — igual ao dashboard
const SEM_EMENDA = '#e8eef6';
const EMENDA_BUCKETS: { max: number; cor: string; label: string }[] = [
  { max: 500_000,   cor: '#bfdbfe', label: 'Até R$ 500 mil' },
  { max: 1_000_000, cor: '#60a5fa', label: 'R$ 500 mil–1 mi' },
  { max: 2_000_000, cor: '#2563eb', label: 'R$ 1–2 mi' },
  { max: Infinity,  cor: '#1e3a8a', label: 'Acima de R$ 2 mi' },
];

// Famílias políticas → cor âncora. Cada candidato vencedor recebe uma cor
// DISTINTA: o maior vencedor da família fica com a cor canônica (vermelho/
// azul/amarelo) e os demais recebem cores adicionais da mesma família, para
// nunca repetir a mesma cor entre candidatos diferentes.
type Familia = 'esq' | 'dir' | 'out';
function familiaDoPartido(partido: string): Familia {
  const p = (partido || '').trim().toUpperCase();
  if (PARTIDOS_VERMELHO.has(p)) return 'esq';
  if (PARTIDOS_AZUL.has(p)) return 'dir';
  return 'out';
}
// Direita: VERDE é a cor principal; azul entra como 2ª (segundo partido de direita).
const PALETA: Record<Familia, string[]> = {
  esq: [COR_VERMELHO, '#b91c1c', '#f87171', '#7f1d1d', '#fca5a5'],
  dir: ['#16a34a', COR_AZUL, '#0ea5e9', '#22c55e', '#059669', '#60a5fa', '#1e3a8a'],
  out: [COR_AMARELO, '#a855f7', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#eab308', '#06b6d4', '#84cc16', '#db2777'],
};

// Versão pública: recebe candidatos (com partido e um peso p/ ordenar) e
// devolve label → cor. Usa a mesma lógica do mapa, para a pizza do relatório
// ficar consistente com o mapa (mesma âncora por família, cores distintas).
export function coresPorCandidato(cands: { label: string; partido: string; peso: number }[]): Record<string, string> {
  const info = new Map<string, { partido: string; n: number }>();
  for (const c of cands) info.set(c.label, { partido: c.partido, n: c.peso });
  return Object.fromEntries(atribuirCores(info));
}

// Recebe candidato → { partido, nº de regiões } e devolve candidato → cor única.
function atribuirCores(info: Map<string, { partido: string; n: number }>): Map<string, string> {
  const porFamilia: Record<Familia, Array<[string, number]>> = { esq: [], dir: [], out: [] };
  for (const [cand, v] of info) porFamilia[familiaDoPartido(v.partido)].push([cand, v.n]);
  const cor = new Map<string, string>();
  (['esq', 'dir', 'out'] as Familia[]).forEach(fam => {
    porFamilia[fam]
      .sort((a, b) => b[1] - a[1]) // maior vencedor primeiro → cor canônica
      .forEach(([cand], i) => cor.set(cand, PALETA[fam][i % PALETA[fam].length]));
  });
  return cor;
}

// ── Fetch com timeout ───────────────────────────────────────────────────────
async function fetchJson(url: string, ms = 8000): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, next: { revalidate: 604800 } } as any);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function malhaEstadoUrl(ufCode: number): string {
  return `https://servicodados.ibge.gov.br/api/v3/malhas/estados/${ufCode}` +
    `?formato=application/vnd.geo+json&qualidade=intermediaria&intrarregiao=municipio`;
}
function malhaBrasilUrl(): string {
  return `https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR` +
    `?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=UF`;
}
function municipiosUrl(uf: string): string {
  return `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`;
}

// ── Vencedores por região a partir do TSE ───────────────────────────────────
// Cada região guarda o CANDIDATO vencedor (nome de urna) e o partido dele.
type Winner = { candidato: string; partido: string; votos: number };
export type Vencedor = { candidato: string; partido: string };

// `filtro` (opcional): quando informado, só considera esses candidatos
// (nome de urna normalizado) — usado em comparações de N candidatos, para o
// mapa mostrar o vencedor ENTRE eles, e não o vencedor geral da eleição.
function winnersPorMunicipio(ano: number, uf: string, cargo?: string, filtro?: Set<string>): Record<string, Vencedor> {
  const data = loadStaticTseData(String(ano), uf);
  if (!data) return {};
  const cargoNorm = cargo ? normalizarTextoTse(cargo) : '';
  const best: Record<string, Winner> = {};
  for (const c of data) {
    if (cargoNorm && !normalizarTextoTse(c.cargo).includes(cargoNorm)) continue;
    if (filtro && !filtro.has(normalizarTextoTse(c.nomeUrna || c.nome))) continue;
    for (const [muni, votos] of Object.entries(c.votos ?? {})) {
      const key = normalizarTextoTse(muni);
      if (!best[key] || votos > best[key].votos) best[key] = { candidato: c.nomeUrna || c.nome, partido: c.partido, votos };
    }
  }
  return Object.fromEntries(Object.entries(best).map(([k, v]) => [k, { candidato: v.candidato, partido: v.partido }]));
}

function winnersPorEstado(ano: number, cargo?: string, filtro?: Set<string>): Record<string, Vencedor> {
  const data = loadStaticTseData(String(ano), 'BR');
  if (!data) return {};
  const cargoNorm = cargo ? normalizarTextoTse(cargo) : '';
  const best: Record<string, Winner> = {};
  for (const c of data) {
    if (cargoNorm && !normalizarTextoTse(c.cargo).includes(cargoNorm)) continue;
    if (filtro && !filtro.has(normalizarTextoTse(c.nomeUrna || c.nome))) continue;
    for (const [ufKey, votos] of Object.entries(c.votosPorEstado ?? {})) {
      const key = ufKey.toUpperCase();
      if (!best[key] || votos > best[key].votos) best[key] = { candidato: c.nomeUrna || c.nome, partido: c.partido, votos };
    }
  }
  return Object.fromEntries(Object.entries(best).map(([k, v]) => [k, { candidato: v.candidato, partido: v.partido }]));
}

// ── codarea (7 díg) → nome normalizado, via IBGE localidades ─────────────────
async function fetchMunicipiosNome(uf: string): Promise<Record<string, string>> {
  const list = await fetchJson(municipiosUrl(uf));
  const map: Record<string, string> = {};
  for (const m of list) map[String(m.id)] = normalizarTextoTse(m.nome ?? '');
  return map;
}

// ── Projeção GeoJSON → paths SVG ─────────────────────────────────────────────
function eachRing(geometry: any, cb: (ring: number[][]) => void) {
  if (!geometry) return;
  if (geometry.type === 'Polygon') {
    for (const ring of geometry.coordinates) cb(ring);
  } else if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) for (const ring of poly) cb(ring);
  }
}

export interface MapaResult {
  width: number;
  height: number;
  paths: { d: string; fill: string }[];
  legend: { label: string; cor: string }[];
}

function buildPaths(
  features: any[],
  W: number,
  H: number,
  fillFor: (codarea: string) => string,
): { d: string; fill: string }[] {
  // 1) bbox em coords projetadas (equiretangular com correção de longitude)
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const f of features) {
    eachRing(f.geometry, (ring) => {
      for (const [lon, lat] of ring) {
        if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
        if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
      }
    });
  }
  if (!isFinite(minLat)) return [];
  const latMid = (minLat + maxLat) / 2;
  const cos = Math.cos((latMid * Math.PI) / 180) || 1;
  const px = (lon: number) => lon * cos;
  const pad = 6;
  const minPx = px(minLon), maxPx = px(maxLon);
  const scale = Math.min((W - pad * 2) / (maxPx - minPx || 1), (H - pad * 2) / (maxLat - minLat || 1));
  const drawW = (maxPx - minPx) * scale, drawH = (maxLat - minLat) * scale;
  const offX = (W - drawW) / 2, offY = (H - drawH) / 2;
  const X = (lon: number) => (px(lon) - minPx) * scale + offX;
  const Y = (lat: number) => (maxLat - lat) * scale + offY; // flip

  return features.map((f) => {
    let d = '';
    eachRing(f.geometry, (ring) => {
      ring.forEach(([lon, lat], i) => {
        d += `${i === 0 ? 'M' : 'L'}${X(lon).toFixed(1)} ${Y(lat).toFixed(1)}`;
      });
      d += 'Z';
    });
    return { d, fill: fillFor(String(f.properties?.codarea ?? '')) };
  });
}

/**
 * Monta o mapa eleitoral: cada região é colorida pelo CANDIDATO vencedor,
 * usando a cor da afiliação política dele (PT/PSOL vermelho, PL/PSD/
 * REPUBLICANOS azul, demais amarelo). A legenda lista os candidatos vencedores.
 * Retorna `null` se não houver escopo geográfico ou se a malha do IBGE falhar.
 */
export async function renderMapaEleitoral(params: {
  uf?: string;
  ano: number;
  cargo?: string;
  municipio?: string;
  candidatos?: string[]; // nomes de urna a comparar — vencedor ENTRE eles
  width?: number;
  height?: number;
}): Promise<MapaResult | null> {
  const W = params.width ?? 300;
  const H = params.height ?? 300;
  const ufUp = params.uf?.toUpperCase();
  const filtro = params.candidatos && params.candidatos.length > 0
    ? new Set(params.candidatos.map(n => normalizarTextoTse(n)))
    : undefined;

  try {
    if (!ufUp || ufUp === 'BR') {
      // ── Mapa do Brasil, colorido pelo candidato vencedor por UF ──
      const geo = await fetchJson(malhaBrasilUrl());
      const winners = winnersPorEstado(params.ano, params.cargo, filtro);
      return montarMapa(winners, (codarea) => CODE_TO_UF[codarea] ?? '', geo.features ?? [], W, H);
    }

    // ── Mapa do estado, colorido pelo candidato vencedor por município ──
    const ufCode = UF_CODES[ufUp];
    if (!ufCode) return null;
    const [geo, nomePorCod] = await Promise.all([
      fetchJson(malhaEstadoUrl(ufCode)),
      fetchMunicipiosNome(ufUp),
    ]);
    const winners = winnersPorMunicipio(params.ano, ufUp, params.cargo, filtro);
    const res = montarMapa(winners, (codarea) => nomePorCod[codarea] ?? '', geo.features ?? [], W, H);
    return res.paths.length > 0 ? res : null;
  } catch (err) {
    console.warn('[geo-map] mapa indisponível — gerando sem mapa:', String(err));
    return null;
  }
}

// Monta o mapa: (1) conta regiões por candidato, (2) atribui cor única por
// candidato, (3) colore as regiões, (4) legenda pelos 6 mais vencedores.
function montarMapa(
  winners: Record<string, Vencedor>,
  keyOf: (codarea: string) => string,
  features: any[],
  W: number,
  H: number,
): MapaResult {
  const info = new Map<string, { partido: string; n: number }>();
  for (const w of Object.values(winners)) {
    const e = info.get(w.candidato);
    if (e) e.n++;
    else info.set(w.candidato, { partido: w.partido, n: 1 });
  }
  const cores = atribuirCores(info);

  const fillFor = (codarea: string) => {
    const w = winners[keyOf(codarea)];
    return w ? (cores.get(w.candidato) ?? NEUTRAL) : NEUTRAL;
  };
  const paths = buildPaths(features, W, H, fillFor);

  const legend = [...info.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 6)
    .map(([cand]) => ({ label: tituloCaso(cand), cor: cores.get(cand) ?? NEUTRAL }));

  return { width: W, height: H, paths, legend };
}

// "DELEGADO DA CUNHA" → "Delegado da Cunha"
export function tituloCaso(s: string): string {
  const minusculas = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
  return (s || '')
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && minusculas.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

type Faixa = { max: number; cor: string; label: string };

/**
 * Mapa de calor genérico: colore cada região por FAIXA de valor.
 * Suporta estado (por município) e Brasil (por UF, quando uf é omitido/'BR').
 * `valores` é chaveado por nome de município (estado) ou sigla de UF (Brasil).
 * Retorna `null` se a malha do IBGE falhar (fallback silencioso).
 */
export async function renderMapaHeatmap(params: {
  uf?: string;
  valores: Record<string, number>;
  faixas: Faixa[];
  semCor?: string;
  width?: number;
  height?: number;
}): Promise<MapaResult | null> {
  const W = params.width ?? 232;
  const H = params.height ?? 250;
  const semCor = params.semCor ?? '#e8eef6';
  const faixas = params.faixas;
  const ufUp = params.uf?.toUpperCase();
  const usadas = new Set<string>();

  const corDe = (val: number): string => {
    if (val <= 0) return semCor;
    const f = faixas.find(f => val <= f.max) ?? faixas[faixas.length - 1];
    usadas.add(f.label);
    return f.cor;
  };
  const legenda = () => faixas.filter(f => usadas.has(f.label)).map(f => ({ label: f.label, cor: f.cor }));

  try {
    if (!ufUp || ufUp === 'BR') {
      // Mapa do Brasil, colorido por UF
      const geo = await fetchJson(malhaBrasilUrl());
      const valUF: Record<string, number> = {};
      for (const [k, v] of Object.entries(params.valores)) {
        const key = k.toUpperCase();
        valUF[key] = (valUF[key] ?? 0) + (v || 0);
      }
      const fillFor = (codarea: string) => corDe(valUF[CODE_TO_UF[codarea] ?? ''] ?? 0);
      const paths = buildPaths(geo.features ?? [], W, H, fillFor);
      return { width: W, height: H, paths, legend: legenda() };
    }

    // Mapa do estado, colorido por município
    const ufCode = UF_CODES[ufUp];
    if (!ufCode) return null;
    const valNorm: Record<string, number> = {};
    for (const [k, v] of Object.entries(params.valores)) {
      const key = normalizarTextoTse(k);
      valNorm[key] = (valNorm[key] ?? 0) + (v || 0);
    }
    const [geo, nomePorCod] = await Promise.all([
      fetchJson(malhaEstadoUrl(ufCode)),
      fetchMunicipiosNome(ufUp),
    ]);
    const fillFor = (codarea: string) => corDe(valNorm[nomePorCod[codarea]] ?? 0);
    const paths = buildPaths(geo.features ?? [], W, H, fillFor);
    if (paths.length === 0) return null;
    return { width: W, height: H, paths, legend: legenda() };
  } catch (err) {
    console.warn('[geo-map] heatmap indisponível — gerando sem mapa:', String(err));
    return null;
  }
}

// Mapa de emendas (por valor empenhado) — faixas fixas iguais ao dashboard.
export function renderMapaEmendas(params: { uf: string; valores: Record<string, number>; width?: number; height?: number }) {
  return renderMapaHeatmap({ ...params, faixas: EMENDA_BUCKETS, semCor: SEM_EMENDA });
}

// Faixas de votos adaptativas ao maior valor (escala azul).
function faixasDeVotos(max: number): Faixa[] {
  const fmt = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace('.', ',')} mi`
    : n >= 1000     ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.', ',')} mil`
    : String(Math.round(n));
  const t1 = max * 0.1, t2 = max * 0.25, t3 = max * 0.5;
  return [
    { max: t1,       cor: '#bfdbfe', label: `até ${fmt(t1)}` },
    { max: t2,       cor: '#60a5fa', label: `${fmt(t1)}–${fmt(t2)}` },
    { max: t3,       cor: '#2563eb', label: `${fmt(t2)}–${fmt(t3)}` },
    { max: Infinity, cor: '#1e3a8a', label: `+ de ${fmt(t3)}` },
  ];
}

// Mapa de calor dos votos de UM candidato (onde ele teve mais votos).
export function renderMapaVotos(params: { uf?: string; valores: Record<string, number>; width?: number; height?: number }) {
  const max = Math.max(1, ...Object.values(params.valores));
  return renderMapaHeatmap({ ...params, faixas: faixasDeVotos(max), semCor: '#eef2f7' });
}

/**
 * Mapa de emendas colorido pelo PARLAMENTAR que mais destinou a cada município
 * (cor distinta por parlamentar, âncora por partido — igual ao mapa eleitoral).
 * `emendas` = lista com { municipio, parlamentar, partido, valorEmpenhado/valorPago }.
 */
export async function renderMapaEmendasVencedor(params: {
  uf: string;
  emendas: any[];
  width?: number;
  height?: number;
}): Promise<MapaResult | null> {
  const W = params.width ?? 232;
  const H = params.height ?? 250;
  const ufUp = params.uf?.toUpperCase();
  try {
    const ufCode = UF_CODES[ufUp];
    if (!ufCode) return null;

    // parlamentar vencedor (maior valor) por município
    const acc: Record<string, Record<string, { valor: number; partido: string }>> = {};
    for (const e of params.emendas) {
      if (!e.municipio) continue;
      const key = normalizarTextoTse(e.municipio);
      const parl = (e.parlamentar || '—').trim();
      const val = (e.valorEmpenhado || e.valorPago || 0);
      acc[key] = acc[key] || {};
      acc[key][parl] = { valor: (acc[key][parl]?.valor || 0) + val, partido: e.partido || '' };
    }
    const winners: Record<string, Vencedor> = {};
    for (const [muni, parls] of Object.entries(acc)) {
      const top = Object.entries(parls).sort((a, b) => b[1].valor - a[1].valor)[0];
      if (top) winners[muni] = { candidato: top[0], partido: top[1].partido };
    }
    if (Object.keys(winners).length === 0) return null;

    const [geo, nomePorCod] = await Promise.all([
      fetchJson(malhaEstadoUrl(ufCode)),
      fetchMunicipiosNome(ufUp),
    ]);
    const res = montarMapa(winners, (codarea) => nomePorCod[codarea] ?? '', geo.features ?? [], W, H);
    return res.paths.length > 0 ? res : null;
  } catch (err) {
    console.warn('[geo-map] mapa de emendas (vencedor) indisponível:', String(err));
    return null;
  }
}
