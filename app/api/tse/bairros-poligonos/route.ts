export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { anoValido, ufValida } from '@/lib/tse-params';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
interface LocalJson {
  municipio: string;
  zona: number;
  codLocal: string;
  nome: string;
  endereco: string;
  bairro: string;
  lat: number | null;
  lng: number | null;
}

interface CandidatoJson {
  id: string;
  nome: string;
  nomeUrna: string;
  zonas: Array<{ municipio: string; zona: number; votos: number }>;
}

// ---------------------------------------------------------------------------
// Cache em memória — arquivos GeoJSON de estado podem ter 20MB+
// ---------------------------------------------------------------------------
const geoCache = new Map<string, any>();
const locaisCache = new Map<string, LocalJson[]>();
const candCache = new Map<string, CandidatoJson[]>();
const secaoCache = new Map<string, Record<string, Record<string, number>>>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[''`´]/g, ' ').replace(/\s+/g, ' ').trim();
}

function readJsonGz(fp: string): unknown | null {
  const gz = fp + '.gz';
  try {
    if (fs.existsSync(gz)) return JSON.parse(zlib.gunzipSync(fs.readFileSync(gz) as any).toString('utf8'));
    if (fs.existsSync(fp))  return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch { /* fall through */ }
  return null;
}

// Extrai base URL da requisição para fallback via fetch (funciona no Vercel)
function getBaseUrl(req: import('next/server').NextRequest): string {
  const host = req.headers.get('host') || 'localhost:3000';
  const proto = host.startsWith('localhost') ? 'http' : 'https';
  return `${proto}://${host}`;
}

async function loadGeo(uf: string, baseUrl: string): Promise<any | null> {
  if (geoCache.has(uf)) return geoCache.get(uf)!;
  // Tenta fs primeiro (dev local)
  const fp = path.join(process.cwd(), 'public', 'geojson', `${uf}_bairros_CD2022.json`);
  try {
    if (fs.existsSync(fp)) {
      const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
      geoCache.set(uf, data);
      return data;
    }
  } catch { /* fallthrough */ }
  // Fallback: fetch da URL pública (Vercel CDN)
  try {
    const res = await fetch(`${baseUrl}/geojson/${uf}_bairros_CD2022.json`);
    if (!res.ok) return null;
    const data = await res.json();
    geoCache.set(uf, data);
    return data;
  } catch { return null; }
}

async function loadLocais(uf: string, baseUrl: string): Promise<LocalJson[] | null> {
  if (locaisCache.has(uf)) return locaisCache.get(uf)!;
  // Tenta fs primeiro
  const d = readJsonGz(path.join(process.cwd(), 'public', 'data', 'tse', 'locais', `${uf}.json`)) as LocalJson[] | null;
  if (d) { locaisCache.set(uf, d); return d; }
  // Fallback: fetch do .json.gz público
  try {
    const res = await fetch(`${baseUrl}/data/tse/locais/${uf}.json.gz`);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const parsed = JSON.parse(zlib.gunzipSync(Buffer.from(buf)).toString('utf8')) as LocalJson[];
    locaisCache.set(uf, parsed);
    return parsed;
  } catch { return null; }
}

async function loadCandidatos(ano: string, uf: string, baseUrl: string): Promise<CandidatoJson[] | null> {
  const key = `${ano}-${uf}`;
  if (candCache.has(key)) return candCache.get(key)!;
  // Tenta fs primeiro
  const d = readJsonGz(path.join(process.cwd(), 'public', 'data', 'tse', ano, `${uf}.json`)) as CandidatoJson[] | null;
  if (d) { candCache.set(key, d); return d; }
  // Fallback: fetch do .json.gz público
  try {
    const res = await fetch(`${baseUrl}/data/tse/${ano}/${uf}.json.gz`);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const parsed = JSON.parse(zlib.gunzipSync(Buffer.from(buf)).toString('utf8')) as CandidatoJson[];
    candCache.set(key, parsed);
    return parsed;
  } catch { return null; }
}

async function loadSecaoVotes(
  munNorm: string, ano: string, uf: string, baseUrl: string
): Promise<Record<string, Record<string, number>> | null> {
  const key = `${ano}-${uf}-${munNorm}`;
  if (secaoCache.has(key)) return secaoCache.get(key)!;
  const fp = path.join(process.cwd(), 'public', 'data', 'tse', 'secao', ano, uf, `${munNorm}.json`);
  try {
    const d = readJsonGz(fp) as Record<string, Record<string, number>> | null;
    if (d) { secaoCache.set(key, d); return d; }
  } catch { /* fallthrough */ }
  try {
    const res = await fetch(`${baseUrl}/data/tse/secao/${ano}/${uf}/${encodeURIComponent(munNorm)}.json.gz`);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const parsed = JSON.parse(zlib.gunzipSync(Buffer.from(buf)).toString('utf8'));
    secaoCache.set(key, parsed);
    return parsed;
  } catch { return null; }
}

// Point-in-polygon (ray casting). Testa apenas o anel externo do polígono.
function pip(point: [number, number], ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > point[1]) !== (yj > point[1]) &&
        point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInFeature(lng: number, lat: number, geometry: any): boolean {
  const pt: [number, number] = [lng, lat];
  if (geometry.type === 'Polygon') {
    return pip(pt, geometry.coordinates[0]);
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((poly: [number, number][][]) => pip(pt, poly[0]));
  }
  return false;
}

// ---------------------------------------------------------------------------
// GET /api/tse/bairros-poligonos
// Params: municipio, uf, [candidatoId | nome], [ano]
// Retorna: { features, bairroVotes, totalVotos }
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const municipio   = searchParams.get('municipio');
    const uf          = searchParams.get('uf')?.toUpperCase();
    const candidatoId = searchParams.get('candidatoId');
    const nome        = searchParams.get('nome');
    const ano         = searchParams.get('ano');

    if (!municipio || !uf) {
      return NextResponse.json({ error: 'Parâmetros obrigatórios: municipio, uf' }, { status: 400 });
    }
    if (!ufValida(uf)) return NextResponse.json({ error: 'UF inválida' }, { status: 400 });
    if (ano && (candidatoId || nome) && !anoValido(ano)) {
      return NextResponse.json({ error: 'Ano inválido' }, { status: 400 });
    }

    const baseUrl = getBaseUrl(request);

    // ── Carregar GeoJSON do estado ──────────────────────────────────────────
    const geo = await loadGeo(uf, baseUrl);
    if (!geo) {
      return NextResponse.json({ features: [], bairroVotes: {}, totalVotos: 0, message: 'GeoJSON não disponível para esta UF' });
    }

    const munNorm = normalizar(municipio);
    const features: any[] = (geo.features ?? []).filter(
      (f: any) => normalizar(f.properties?.NM_MUN ?? '') === munNorm
    );

    if (features.length === 0) {
      return NextResponse.json({ features: [], bairroVotes: {}, totalVotos: 0, message: 'Município não encontrado no GeoJSON' });
    }

    // ── Sem candidato: retornar apenas as features (sem votos) ──────────────
    if (!candidatoId && !nome) {
      const lightFeatures = features.map(f => ({
        type: f.type,
        geometry: f.geometry,
        properties: { NM_BAIRRO: f.properties.NM_BAIRRO, NM_MUN: f.properties.NM_MUN },
      }));
      return NextResponse.json({ features: lightFeatures, bairroVotes: {}, totalVotos: 0 });
    }

    // ── Carregar locais de votação do estado ────────────────────────────────
    const todosLocais = await loadLocais(uf, baseUrl);
    if (!todosLocais) {
      return NextResponse.json({ features: [], bairroVotes: {}, totalVotos: 0, message: 'Locais de votação não disponíveis' });
    }

    const locaisMun = todosLocais.filter(l => normalizar(l.municipio) === munNorm);

    // ── Encontrar candidato e votos por zona ────────────────────────────────
    const votosPorZona = new Map<number, number>();
    let totalVotos = 0;
    let candidatoEncontrado: CandidatoJson | undefined;

    if (ano && (candidatoId || nome)) {
      const candidatos = await loadCandidatos(ano, uf, baseUrl);
      if (candidatos) {
        let cand: CandidatoJson | undefined;
        if (candidatoId) {
          cand = candidatos.find(c => c.id === candidatoId);
        } else if (nome) {
          const q = normalizar(nome);
          cand = candidatos.find(c =>
            normalizar(c.nomeUrna).includes(q) || normalizar(c.nome).includes(q)
          );
          if (!cand) {
            const palavras = q.split(' ').filter(p => p.length > 2);
            if (palavras.length > 0) {
              cand = candidatos.find(c => {
                const nu = normalizar(c.nomeUrna), nm = normalizar(c.nome);
                return palavras.every(p => nu.includes(p) || nm.includes(p));
              });
            }
          }
        }
        if (cand) {
          candidatoEncontrado = cand;
          for (const z of cand.zonas) {
            if (normalizar(z.municipio) === munNorm) {
              votosPorZona.set(z.zona, (votosPorZona.get(z.zona) ?? 0) + z.votos);
              totalVotos += z.votos;
            }
          }
        }
      }
    }

    // ── Filtrar locais com coordenadas válidas ──────────────────────────────
    const locaisComCoordenadas = locaisMun.filter(
      l => l.lat && l.lng && l.lat >= -35 && l.lat <= 5 && l.lng >= -74 && l.lng <= -35
    );

    // Mapear cada local (zona+codLocal) → bairro via PiP (usado por ambos os métodos)
    const localBairroMap = new Map<string, string>();
    for (const local of locaisComCoordenadas) {
      for (const feat of features) {
        if (pointInFeature(local.lng!, local.lat!, feat.geometry)) {
          localBairroMap.set(`${local.zona}-${local.codLocal}`, feat.properties?.NM_BAIRRO ?? '');
          break;
        }
      }
    }

    const bairroVotesRaw: Record<string, number> = {};

    // ── Tentar votos exatos por seção (gerado com --secao) ──────────────────
    // O arquivo de seção é indexado pelo NR_CANDIDATO (número na urna),
    // que funciona tanto no formato votacao_secao (2018/2022) quanto no
    // detalhe_votacao_secao (2020/2024) — veja tse-to-json.ts --secao.
    const secaoData = candidatoEncontrado && ano
      ? await loadSecaoVotes(munNorm, ano, uf, baseUrl)
      : null;
    const localVotesMap = secaoData && candidatoEncontrado?.numero
      ? secaoData[String(candidatoEncontrado.numero)]
      : null;

    if (localVotesMap) {
      // Modo exato: cada local tem seu próprio total de votos por seção somados
      for (const local of locaisComCoordenadas) {
        const key = `${local.zona}-${local.codLocal}`;
        const votosLocal = localVotesMap[key] ?? 0;
        if (votosLocal === 0) continue;
        const nmBairro = localBairroMap.get(key);
        if (nmBairro === undefined) continue;
        bairroVotesRaw[nmBairro] = (bairroVotesRaw[nmBairro] ?? 0) + votosLocal;
      }
    } else {
      // Modo proporcional (fallback): distribui votos da zona pela quantidade de
      // locais de votação por bairro dentro da zona
      const zonaBairroCount = new Map<number, Record<string, number>>();
      for (const local of locaisComCoordenadas) {
        const nmBairro = localBairroMap.get(`${local.zona}-${local.codLocal}`);
        if (nmBairro === undefined) continue;
        if (!zonaBairroCount.has(local.zona)) zonaBairroCount.set(local.zona, {});
        const counts = zonaBairroCount.get(local.zona)!;
        counts[nmBairro] = (counts[nmBairro] ?? 0) + 1;
      }

      for (const [zona, votos] of votosPorZona) {
        if (votos === 0) continue;
        const counts = zonaBairroCount.get(zona);
        if (!counts) continue;
        const totalLocais = Object.values(counts).reduce((a, b) => a + b, 0);
        if (totalLocais === 0) continue;
        for (const [nmBairro, qtd] of Object.entries(counts)) {
          bairroVotesRaw[nmBairro] = (bairroVotesRaw[nmBairro] ?? 0) + (votos * qtd) / totalLocais;
        }
      }
    }

    // Arredondar votos
    const bairroVotes: Record<string, number> = {};
    for (const [k, v] of Object.entries(bairroVotesRaw)) {
      bairroVotes[k] = Math.round(v);
    }

    // Features leves (só geometry + propriedades necessárias)
    const lightFeatures = features.map(f => ({
      type: f.type,
      geometry: f.geometry,
      properties: { NM_BAIRRO: f.properties.NM_BAIRRO, NM_MUN: f.properties.NM_MUN },
    }));

    return NextResponse.json({ features: lightFeatures, bairroVotes, totalVotos });

  } catch (error) {
    console.error('[bairros-poligonos]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
