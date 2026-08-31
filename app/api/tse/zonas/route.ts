import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { anoValido, ufValida } from '@/lib/tse-params';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[''`´]/g, ' ').replace(/\s+/g, ' ').trim();
}

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

// Cache em memória
const candCache  = new Map<string, CandidatoJson[]>();
const locaisCache = new Map<string, LocalJson[]>();

// ---------------------------------------------------------------------------
// Leitura de dados estáticos
// ---------------------------------------------------------------------------
function readJsonFile(filePath: string): unknown | null {
  const gz = filePath + '.gz';
  try {
    if (fs.existsSync(gz))       return JSON.parse(zlib.gunzipSync(fs.readFileSync(gz) as any).toString('utf8'));
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch { /* fall through */ }
  return null;
}

function loadCandidatos(ano: string, uf: string): CandidatoJson[] | null {
  const key = `${ano}-${uf}`;
  if (candCache.has(key)) return candCache.get(key)!;
  const fp = path.join(process.cwd(), 'public', 'data', 'tse', ano, `${uf}.json`);
  const d = readJsonFile(fp) as CandidatoJson[] | null;
  if (d) candCache.set(key, d);
  return d;
}

function loadLocais(uf: string): LocalJson[] | null {
  if (locaisCache.has(uf)) return locaisCache.get(uf)!;
  const fp = path.join(process.cwd(), 'public', 'data', 'tse', 'locais', `${uf}.json`);
  const d = readJsonFile(fp) as LocalJson[] | null;
  if (d) locaisCache.set(uf, d);
  return d;
}

// ---------------------------------------------------------------------------
// Montar resposta de zonas a partir apenas dos locais (sem candidato)
// ---------------------------------------------------------------------------
function montarZonasLocaisSemVotos(locaisMun: LocalJson[], municipio: string) {
  const zonaLocaisMap = new Map<number, { locaisValidos: LocalJson[]; bairros: Set<string> }>();
  for (const local of locaisMun) {
    if (!zonaLocaisMap.has(local.zona)) zonaLocaisMap.set(local.zona, { locaisValidos: [], bairros: new Set() });
    const zd = zonaLocaisMap.get(local.zona)!;
    if (local.bairro) zd.bairros.add(local.bairro);
    const valid = local.lat && local.lng && local.lat >= -35 && local.lat <= 5 && local.lng >= -74 && local.lng <= -35;
    if (valid) zd.locaisValidos.push(local);
  }

  const locaisPorZona = Array.from(zonaLocaisMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([zona, data]) => {
      const arr = data.locaisValidos;
      const lat = arr.length > 0 ? arr.reduce((s, l) => s + (l.lat ?? 0), 0) / arr.length : 0;
      const lng = arr.length > 0 ? arr.reduce((s, l) => s + (l.lng ?? 0), 0) / arr.length : 0;
      return { zona, latitude: lat, longitude: lng, votos: 0, bairros: Array.from(data.bairros), locais: [] };
    });

  const allValid = locaisMun.filter(l => l.lat && l.lng && l.lat >= -35 && l.lat <= 5 && l.lng >= -74 && l.lng <= -35);
  let bounds = null;
  if (allValid.length > 0) {
    const lats = allValid.map(l => l.lat!);
    const lngs = allValid.map(l => l.lng!);
    bounds = {
      minLat: Math.min(...lats), maxLat: Math.max(...lats),
      minLng: Math.min(...lngs), maxLng: Math.max(...lngs),
      centerLat: (Math.min(...lats) + Math.max(...lats)) / 2,
      centerLng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    };
  }

  return NextResponse.json({
    candidato: '',
    municipio,
    zonas: locaisPorZona.map(z => ({ zona: z.zona, votos: 0 })),
    locaisPorZona,
    bounds,
    totalVotos: 0,
    totalLocais: locaisMun.length,
  });
}

// ---------------------------------------------------------------------------
// Montar resposta de zonas a partir de dados estáticos
// ---------------------------------------------------------------------------
function montarZonasEstatico(cand: CandidatoJson, municipio: string, uf: string) {
  const munNorm = normalizar(municipio);

  // Filtrar zonas do município
  const zonasDoMunicipio = cand.zonas.filter(z => normalizar(z.municipio) === munNorm);

  // Agrupar votos por zona (somando linhas duplicadas)
  const votosPorZona = new Map<number, number>();
  for (const z of zonasDoMunicipio) {
    votosPorZona.set(z.zona, (votosPorZona.get(z.zona) ?? 0) + z.votos);
  }
  const zonas = Array.from(votosPorZona.entries())
    .map(([zona, votos]) => ({ zona, votos }))
    .sort((a, b) => a.zona - b.zona);

  // Locais de votação do município
  const todosLocais = loadLocais(uf) ?? [];
  const locaisMun = todosLocais.filter(l => normalizar(l.municipio) === munNorm);

  // Agrupar locais por zona (todos os locais, não só os com coord válida)
  const zonaLocaisMap = new Map<number, { locais: LocalJson[]; locaisValidos: LocalJson[]; bairros: Set<string> }>();
  for (const local of locaisMun) {
    if (!zonaLocaisMap.has(local.zona)) zonaLocaisMap.set(local.zona, { locais: [], locaisValidos: [], bairros: new Set() });
    const zd = zonaLocaisMap.get(local.zona)!;
    if (local.bairro) zd.bairros.add(local.bairro);
    zd.locais.push(local); // todos os locais (para distribuição de votos)
    const validCoord = local.lat && local.lng && local.lat >= -35 && local.lat <= 5 && local.lng >= -74 && local.lng <= -35;
    if (validCoord) zd.locaisValidos.push(local); // apenas com coord para o mapa
  }

  // Construir locaisPorZona
  // Se não há dados de zona para este município (cand.zonas vazio), usar todos os locais com votos=0
  const locaisPorZona = zonas.length > 0
    ? zonas.map(({ zona, votos }) => {
        const data = zonaLocaisMap.get(zona);
        const locaisArr = data?.locaisValidos ?? [];
        const lat = locaisArr.length > 0 ? locaisArr.reduce((s, l) => s + (l.lat ?? 0), 0) / locaisArr.length : 0;
        const lng = locaisArr.length > 0 ? locaisArr.reduce((s, l) => s + (l.lng ?? 0), 0) / locaisArr.length : 0;
        return { zona, latitude: lat, longitude: lng, votos, bairros: Array.from(data?.bairros ?? []), locais: [] };
      })
    : Array.from(zonaLocaisMap.entries())
        .sort(([a], [b]) => a - b)
        .map(([zona, data]) => {
          const arr = data.locaisValidos;
          const lat = arr.length > 0 ? arr.reduce((s, l) => s + (l.lat ?? 0), 0) / arr.length : 0;
          const lng = arr.length > 0 ? arr.reduce((s, l) => s + (l.lng ?? 0), 0) / arr.length : 0;
          return { zona, latitude: lat, longitude: lng, votos: 0, bairros: Array.from(data.bairros), locais: [] };
        });

  // Bounds do município
  const allValid = locaisMun.filter(l => l.lat && l.lng && l.lat >= -35 && l.lat <= 5 && l.lng >= -74 && l.lng <= -35);
  let bounds = null;
  if (allValid.length > 0) {
    const lats = allValid.map(l => l.lat!);
    const lngs = allValid.map(l => l.lng!);
    bounds = {
      minLat: Math.min(...lats), maxLat: Math.max(...lats),
      minLng: Math.min(...lngs), maxLng: Math.max(...lngs),
      centerLat: (Math.min(...lats) + Math.max(...lats)) / 2,
      centerLng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    };
  }

  return NextResponse.json({
    candidato: cand.nomeUrna || cand.nome,
    municipio,
    zonas: zonas.length > 0 ? zonas : locaisPorZona.map(z => ({ zona: z.zona, votos: z.votos })),
    locaisPorZona,
    bounds,
    totalVotos: zonas.reduce((s, z) => s + z.votos, 0),
    totalLocais: locaisMun.length,
  });
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const nome        = searchParams.get('nome');
    const ano         = searchParams.get('ano');
    const uf          = searchParams.get('uf');
    const municipio   = searchParams.get('municipio');
    const candidatoId = searchParams.get('candidatoId');

    if (!municipio) return NextResponse.json({ error: 'Parâmetro obrigatório: municipio' }, { status: 400 });
    if (uf && !ufValida(uf)) return NextResponse.json({ error: 'UF inválida' }, { status: 400 });
    if (ano && !anoValido(ano)) return NextResponse.json({ error: 'Ano inválido' }, { status: 400 });

    // ── Tentar JSON estático ──────────────────────────────────────────────
    if (uf && ano) {
      const staticData = loadCandidatos(ano, uf);
      if (staticData) {
        let cand: CandidatoJson | undefined;
        if (candidatoId) {
          cand = staticData.find(c => c.id === candidatoId);
        } else if (nome) {
          const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const q = norm(nome);
          cand = staticData.find(c => norm(c.nomeUrna).includes(q) || norm(c.nome).includes(q));
          // Fallback: busca por palavras individuais (ex: "JAIR BOLSONARO" → busca "jair" E "bolsonaro")
          if (!cand) {
            const palavras = q.split(' ').filter(p => p.length > 2);
            if (palavras.length > 0) {
              cand = staticData.find(c => {
                const nu = norm(c.nomeUrna);
                const nm = norm(c.nome);
                return palavras.every(p => nu.includes(p) || nm.includes(p));
              });
            }
          }
        }
        if (cand) return montarZonasEstatico(cand, municipio, uf);

        // Candidato não encontrado mas temos locais: retornar zonas com 0 votos (fallback para mapa)
        const todosLocais = loadLocais(uf) ?? [];
        const munNorm = normalizar(municipio);
        const locaisMun = todosLocais.filter(l => normalizar(l.municipio) === munNorm);
        if (locaisMun.length > 0) {
          return montarZonasLocaisSemVotos(locaisMun, municipio);
        }
      }
    }

    // Dados não encontrados nos arquivos estáticos
    return NextResponse.json({ error: 'Dados não encontrados para o candidato/município informado' }, { status: 404 });

  } catch (error) {
    console.error('Erro ao buscar zonas:', error);
    return NextResponse.json({ error: 'Erro ao buscar dados de zonas eleitorais' }, { status: 500 });
  }
}
