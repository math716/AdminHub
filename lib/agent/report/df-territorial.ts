// Motor do "Relatório Territorial" do DF (server-only).
//
// Cruza os locais de votação (point-in-polygon) com o geojson das Regiões
// Administrativas do DF e distribui os votos de cada ZONA eleitoral entre as
// RAs, proporcionalmente ao número de locais daquela zona em cada RA — o mesmo
// método já usado em `app/api/tse/df-regioes/route.ts`, aqui generalizado para
// TODOS os candidatos de um cargo numa única passada.
//
// A partir daí calcula, por deputado: RA com mais votos (absoluto), RA de maior
// domínio proporcional (participação), top 5, concentração, redutos, regiões
// fracas e o índice de concentração/dispersão. Tudo determinístico — a Gabi só
// aciona; os números vêm daqui (garante "não invente dados").

import fs from 'fs';
import path from 'path';
import {
  loadStaticTseData, loadLocaisTse, buscarCandidatoNoJson, buscarCandidatoTolerante,
  normalizarTextoTse, type CandidatoJson,
} from '@/lib/tse-static';

// ── GeoJSON das RAs (local — sem fetch externo) ─────────────────────────────
let geoCache: any = null;
function loadGeo(): any {
  if (geoCache) return geoCache;
  const fp = path.join(process.cwd(), 'public', 'geojson', 'df-regioes-administrativas.geojson');
  geoCache = JSON.parse(fs.readFileSync(fp, 'utf8'));
  return geoCache;
}

// Point-in-polygon (ray casting) — mesma lógica da rota df-regioes.
function pip(pt: [number, number], ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) &&
        pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Nome da RA (exatamente como no geojson) que contém o ponto, ou null.
function raDoPonto(lng: number, lat: number, features: any[]): string | null {
  const p: [number, number] = [lng, lat];
  for (const f of features) {
    const geom = f.geometry;
    if (!geom) continue;
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    for (const poly of polys) {
      if (poly?.[0] && pip(p, poly[0])) return f.properties?.nome ?? null;
    }
  }
  return null;
}

// ── Índice geográfico: por zona, quantos locais caem em cada RA ──────────────
interface GeoIndex {
  raCountPorZona: Map<number, Map<string, number>>;
  totalLocaisPorZona: Map<number, number>;
}
const geoIdxCache = new Map<string, GeoIndex>();

function buildGeoIndex(uf = 'DF'): GeoIndex {
  if (geoIdxCache.has(uf)) return geoIdxCache.get(uf)!;
  const features: any[] = loadGeo().features ?? [];
  const locais = loadLocaisTse(uf) ?? [];
  const raCountPorZona = new Map<number, Map<string, number>>();
  const totalLocaisPorZona = new Map<number, number>();

  for (const l of locais) {
    if (!l.lat || !l.lng) continue;
    const ra = raDoPonto(l.lng, l.lat, features);
    if (!ra) continue; // fora da malha (raro) — a zona se redistribui nos locais casados
    if (!raCountPorZona.has(l.zona)) raCountPorZona.set(l.zona, new Map());
    const m = raCountPorZona.get(l.zona)!;
    m.set(ra, (m.get(ra) ?? 0) + 1);
    totalLocaisPorZona.set(l.zona, (totalLocaisPorZona.get(l.zona) ?? 0) + 1);
  }

  const idx: GeoIndex = { raCountPorZona, totalLocaisPorZona };
  geoIdxCache.set(uf, idx);
  return idx;
}

// Distribui os votos de um candidato (por zona) entre as RAs.
function votosPorRADe(cand: CandidatoJson, idx: GeoIndex): Record<string, number> {
  const out: Record<string, number> = {};
  for (const z of cand.zonas ?? []) {
    const raCount = idx.raCountPorZona.get(z.zona);
    const total = idx.totalLocaisPorZona.get(z.zona);
    if (!raCount || !total) continue;
    for (const [ra, cnt] of raCount) {
      out[ra] = (out[ra] ?? 0) + z.votos * (cnt / total);
    }
  }
  for (const k of Object.keys(out)) out[k] = Math.round(out[k]);
  return out;
}

// ── Carga territorial (todos os candidatos do cargo) ─────────────────────────
export interface TerritorialData {
  ano: number;
  uf: string;
  cargo: string;
  totalPorRA: Record<string, number>;                 // soma de votos por RA (todos)
  votosPorCand: Map<string, Record<string, number>>;  // candId → RA → votos
  candidatos: CandidatoJson[];                         // candidatos do cargo
}

export function carregarTerritorial(
  ano: number, uf = 'DF', cargo = 'Deputado Distrital',
): TerritorialData | null {
  const data = loadStaticTseData(String(ano), uf);
  if (!data) return null;
  const cargoNorm = normalizarTextoTse(cargo);
  const cands = data.filter(c => normalizarTextoTse(c.cargo).includes(cargoNorm));
  if (cands.length === 0) return null;

  const idx = buildGeoIndex(uf);
  const totalPorRA: Record<string, number> = {};
  const votosPorCand = new Map<string, Record<string, number>>();

  for (const c of cands) {
    const v = votosPorRADe(c, idx);
    votosPorCand.set(c.id, v);
    for (const [ra, val] of Object.entries(v)) totalPorRA[ra] = (totalPorRA[ra] ?? 0) + val;
  }
  return { ano, uf, cargo, totalPorRA, votosPorCand, candidatos: cands };
}

// ── Métricas por deputado ────────────────────────────────────────────────────
export interface RAmetric {
  ra: string;
  votos: number;
  concentracao: number;  // % dos votos DELE que estão nesta RA
  participacao: number;  // % dos votos DA RA que são dele (domínio no território)
}
export interface DeputadoMetrics {
  id: string;
  nome: string;
  nomeUrna: string;
  partido: string;
  totalVotos: number;      // total oficial do candidato
  votosDistribuidos: number; // soma distribuída por RA (≈ totalVotos)
  votosPorRA: Record<string, number>;
  top5: RAmetric[];
  raMaisVotos: RAmetric | null;
  raMaiorParticipacao: RAmetric | null;
  concentracaoTop3: number; // % dos votos nas 3 maiores RAs
  hhi: number;              // índice de Herfindahl (0..1) sobre a concentração
  indiceLabel: string;      // rótulo legível (concentrado/disperso)
  redutos: RAmetric[];      // top 3 por votos
  regioesFracas: RAmetric[]; // 3 RAs de menor presença (onde ainda tem votos)
}

function rotuloConcentracao(hhi: number): string {
  if (hhi >= 0.20) return 'Muito concentrado';
  if (hhi >= 0.12) return 'Concentrado';
  if (hhi >= 0.06) return 'Equilibrado';
  return 'Disperso (capilarizado)';
}

export function metricasDeputado(
  cand: CandidatoJson,
  votosPorRA: Record<string, number>,
  totalPorRA: Record<string, number>,
): DeputadoMetrics {
  const entries = Object.entries(votosPorRA).filter(([, v]) => v > 0);
  const votosDistribuidos = entries.reduce((s, [, v]) => s + v, 0) || 1;

  const metrics: RAmetric[] = entries.map(([ra, v]) => ({
    ra,
    votos: v,
    concentracao: (v / votosDistribuidos) * 100,
    participacao: totalPorRA[ra] > 0 ? (v / totalPorRA[ra]) * 100 : 0,
  }));

  const porVotos = [...metrics].sort((a, b) => b.votos - a.votos);
  const porParticipacao = [...metrics].sort((a, b) => b.participacao - a.participacao);

  const concentracaoTop3 = porVotos.slice(0, 3).reduce((s, m) => s + m.concentracao, 0);
  const hhi = metrics.reduce((s, m) => s + Math.pow(m.concentracao / 100, 2), 0);

  return {
    id: cand.id,
    nome: cand.nome,
    nomeUrna: cand.nomeUrna,
    partido: cand.partido,
    totalVotos: cand.totalVotos,
    votosDistribuidos: Math.round(votosDistribuidos),
    votosPorRA,
    top5: porVotos.slice(0, 5),
    raMaisVotos: porVotos[0] ?? null,
    raMaiorParticipacao: porParticipacao[0] ?? null,
    concentracaoTop3,
    hhi,
    indiceLabel: rotuloConcentracao(hhi),
    redutos: porVotos.slice(0, 3),
    regioesFracas: porVotos.slice(-3).reverse(),
  };
}

// ── Resolução de nomes → candidatos ──────────────────────────────────────────
export interface ResolucaoDeputados {
  encontrados: { nome: string; cand: CandidatoJson }[];
  faltantes: string[];
}

export function resolverDeputados(
  nomes: string[], ano: number, uf = 'DF', cargo = 'Deputado Distrital',
): ResolucaoDeputados {
  const data = loadStaticTseData(String(ano), uf) ?? [];
  const encontrados: { nome: string; cand: CandidatoJson }[] = [];
  const faltantes: string[] = [];
  const usados = new Set<string>();

  for (const nome of nomes) {
    const res = buscarCandidatoNoJson(data, nome, cargo)
      .sort((a, b) => b.totalVotos - a.totalVotos);
    const escolhido = res.find(c => !usados.has(c.id))
      ?? res[0]
      ?? buscarCandidatoTolerante(data, nome, cargo);
    if (escolhido) {
      usados.add(escolhido.id);
      encontrados.push({ nome, cand: escolhido });
    } else {
      faltantes.push(nome);
    }
  }
  return { encontrados, faltantes };
}
