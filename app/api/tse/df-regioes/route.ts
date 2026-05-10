export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { anoValido } from '@/lib/tse-params';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
interface CandidatoJson {
  id: string;
  nome: string;
  nomeUrna: string;
  numero: number | null;
  partido: string;
  cargo: string;
  situacao: string;
  totalVotos: number;
  votos: Record<string, number>;
  zonas: Array<{ municipio: string; zona: number; votos: number }>;
}

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

// ---------------------------------------------------------------------------
// Cache em memória
// ---------------------------------------------------------------------------
const candCache = new Map<string, CandidatoJson[]>();
const locaisCache = new Map<string, LocalJson[]>();
let geoCache: any = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
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

function loadCandidatos(ano: string, uf: string): CandidatoJson[] | null {
  const key = `${ano}-${uf}`;
  if (candCache.has(key)) return candCache.get(key)!;
  const d = readJsonGz(path.join(process.cwd(), 'public', 'data', 'tse', ano, `${uf}.json`)) as CandidatoJson[] | null;
  if (d) candCache.set(key, d);
  return d;
}

function loadLocais(uf: string): LocalJson[] | null {
  if (locaisCache.has(uf)) return locaisCache.get(uf)!;
  const d = readJsonGz(path.join(process.cwd(), 'public', 'data', 'tse', 'locais', `${uf}.json`)) as LocalJson[] | null;
  if (d) locaisCache.set(uf, d);
  return d;
}

function loadGeo(): any {
  if (geoCache) return geoCache;
  const fp = path.join(process.cwd(), 'public', 'geojson', 'df-regioes-administrativas.geojson');
  geoCache = JSON.parse(fs.readFileSync(fp, 'utf8'));
  return geoCache;
}

function pip(point: [number, number], ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > point[1]) !== (yj > point[1]) &&
        point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------------------
// GET /api/tse/df-regioes
// Parâmetros: ano, candidatoId | nome
// Retorna: { raVotes: Record<string, number>, totalVotos: number }
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const ano         = searchParams.get('ano');
    const candidatoId = searchParams.get('candidatoId');
    const nome        = searchParams.get('nome');

    if (!ano) return NextResponse.json({ error: 'Parâmetro obrigatório: ano' }, { status: 400 });
    if (!anoValido(ano)) return NextResponse.json({ error: 'Ano inválido' }, { status: 400 });
    if (!candidatoId && !nome) return NextResponse.json({ error: 'Informe candidatoId ou nome' }, { status: 400 });

    // Carregar candidatos do DF
    const candidatos = loadCandidatos(ano, 'DF');
    if (!candidatos) return NextResponse.json({ error: 'Dados do DF não encontrados para o ano informado' }, { status: 404 });

    // Encontrar candidato
    let cand: CandidatoJson | undefined;
    if (candidatoId) {
      cand = candidatos.find(c => c.id === candidatoId);
    }
    if (!cand && nome) {
      const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const q = norm(nome);
      cand = candidatos.find(c => norm(c.nomeUrna).includes(q) || norm(c.nome).includes(q));
      if (!cand) {
        const palavras = q.split(' ').filter(p => p.length > 2);
        if (palavras.length > 0) {
          cand = candidatos.find(c => {
            const nu = norm(c.nomeUrna), nm = norm(c.nome);
            return palavras.every(p => nu.includes(p) || nm.includes(p));
          });
        }
      }
    }

    if (!cand) return NextResponse.json({ error: 'Candidato não encontrado' }, { status: 404 });

    // Votos por zona eleitoral (apenas Brasília)
    const votosPorZona = new Map<number, number>();
    for (const z of cand.zonas) {
      if (normalizar(z.municipio) === 'BRASILIA')
        votosPorZona.set(z.zona, (votosPorZona.get(z.zona) ?? 0) + z.votos);
    }
    if (votosPorZona.size === 0) {
      return NextResponse.json({ raVotes: {}, totalVotos: cand.totalVotos });
    }

    // Locais de votação do DF
    const todosLocais = loadLocais('DF');
    if (!todosLocais) return NextResponse.json({ error: 'Locais de votação não encontrados' }, { status: 404 });

    const locaisBrasilia = todosLocais.filter(l => normalizar(l.municipio) === 'BRASILIA');

    // Quantidade de locais por zona (para distribuição proporcional de votos)
    const locaisCountPorZona = new Map<number, number>();
    for (const l of locaisBrasilia) {
      locaisCountPorZona.set(l.zona, (locaisCountPorZona.get(l.zona) ?? 0) + 1);
    }

    // GeoJSON das regiões administrativas
    const geo = loadGeo();
    const features: any[] = geo.features ?? [];

    // PiP com locais individuais — distribui votos da zona proporcionalmente
    const raVotesRaw: Record<string, number> = {};
    for (const local of locaisBrasilia) {
      if (!local.lat || !local.lng) continue;
      const totalVotosZona = votosPorZona.get(local.zona) ?? 0;
      const totalLocaisZona = locaisCountPorZona.get(local.zona) ?? 1;
      const votosLocal = totalVotosZona / totalLocaisZona;

      const pt: [number, number] = [local.lng, local.lat];
      for (const feat of features) {
        const ring: [number, number][] = feat.geometry?.coordinates?.[0] ?? [];
        if (pip(pt, ring)) {
          const nomeRA: string = feat.properties?.nome ?? '';
          raVotesRaw[nomeRA] = (raVotesRaw[nomeRA] ?? 0) + votosLocal;
          break;
        }
      }
    }

    // Arredondar votos
    const raVotes: Record<string, number> = {};
    for (const [k, v] of Object.entries(raVotesRaw)) {
      raVotes[k] = Math.round(v);
    }

    return NextResponse.json({ raVotes, totalVotos: cand.totalVotos });

  } catch (error) {
    console.error('[df-regioes]', error);
    return NextResponse.json({ error: 'Erro ao calcular votos por região' }, { status: 500 });
  }
}
