import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { anoValido, ufValida } from '@/lib/tse-params';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

export const dynamic = 'force-dynamic';

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

interface CandidatoZona {
  municipio: string;
  zona: number;
  votos: number;
}

interface CandidatoJson {
  id: string;
  nome: string;
  nomeUrna: string;
  zonas: CandidatoZona[];
}

// ---------------------------------------------------------------------------
// Cache em memória
// ---------------------------------------------------------------------------
const locaisCache = new Map<string, LocalJson[]>();
const candCache   = new Map<string, CandidatoJson[]>();

function readGz(base: string): string | null {
  try {
    if (fs.existsSync(base + '.json.gz'))
      return zlib.gunzipSync(fs.readFileSync(base + '.json.gz') as any).toString('utf8');
    if (fs.existsSync(base + '.json'))
      return fs.readFileSync(base + '.json', 'utf8');
  } catch { /* ignore */ }
  return null;
}

function loadLocais(uf: string): LocalJson[] | null {
  if (locaisCache.has(uf)) return locaisCache.get(uf)!;
  const raw = readGz(path.join(process.cwd(), 'public', 'data', 'tse', 'locais', uf));
  if (!raw) return null;
  const data: LocalJson[] = JSON.parse(raw);
  locaisCache.set(uf, data);
  return data;
}

function loadCandidatos(ano: string, uf: string): CandidatoJson[] | null {
  const key = `${ano}-${uf}`;
  if (candCache.has(key)) return candCache.get(key)!;
  const raw = readGz(path.join(process.cwd(), 'public', 'data', 'tse', ano, uf));
  if (!raw) return null;
  const data: CandidatoJson[] = JSON.parse(raw);
  candCache.set(key, data);
  return data;
}

function normalizar(s: string): string {
  return s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`´]/g, ' ').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// GET /api/tse/bairros?municipio=X&uf=Y[&candidatoId=Z&ano=2024]
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const municipio   = searchParams.get('municipio');
  const uf          = searchParams.get('uf')?.toUpperCase();
  const candidatoId = searchParams.get('candidatoId');
  const nome        = searchParams.get('nome');
  const ano         = searchParams.get('ano');

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  if (!municipio || !uf) {
    return NextResponse.json({ error: 'Parâmetros obrigatórios: municipio, uf' }, { status: 400 });
  }

  if (!ufValida(uf)) return NextResponse.json({ error: 'UF inválida' }, { status: 400 });
  // `ano` só é usado para acessar arquivos de candidatos (loadCandidatos) — valida apenas nesse caso.
  // Quando `ano` é passado sem candidatoId/nome, ele não entra em nenhum caminho de arquivo,
  // portanto não há risco de path traversal e não deve ser rejeitado (ex: projeções ano=2026).
  if (ano && (candidatoId || nome) && !anoValido(ano)) {
    return NextResponse.json({ error: 'Ano inválido' }, { status: 400 });
  }

  const locais = loadLocais(uf);
  if (!locais) {
    return NextResponse.json({ bairros: [], total: 0, message: 'Dados de locais não disponíveis para esta UF' });
  }

  const munNorm = normalizar(municipio);
  const locaisMun = locais.filter(l => normalizar(l.municipio) === munNorm);

  if (locaisMun.length === 0) {
    return NextResponse.json({ bairros: [], total: 0, message: 'Município não encontrado nos locais de votação' });
  }

  // ── Votos por zona (se candidato informado) ─────────────────────────────
  const votosPorZona = new Map<number, number>();

  if (ano && (candidatoId || nome)) {
    const candidatos = loadCandidatos(ano, uf);
    let cand: CandidatoJson | undefined;

    if (candidatos) {
      if (candidatoId) {
        cand = candidatos.find(c => c.id === candidatoId);
      } else if (nome) {
        const q = normalizar(nome);
        cand = candidatos.find(c => normalizar(c.nomeUrna).includes(q) || normalizar(c.nome).includes(q));
        if (!cand) {
          const palavras = q.split(' ').filter(p => p.length > 2);
          if (palavras.length > 0) {
            cand = candidatos.find(c => {
              const nu = normalizar(c.nomeUrna);
              const nm = normalizar(c.nome);
              return palavras.every(p => nu.includes(p) || nm.includes(p));
            });
          }
        }
      }
    }

    // Fallback: candidatos nacionais (presidente/senado) estão em BR.json mas não em UF.json
    if (!cand && candidatoId) {
      const brCandidatos = loadCandidatos(ano, 'BR');
      if (brCandidatos) {
        cand = brCandidatos.find(c => c.id === candidatoId);
      }
    }

    if (cand) {
      for (const z of cand.zonas) {
        if (normalizar(z.municipio) === munNorm) {
          votosPorZona.set(z.zona, (votosPorZona.get(z.zona) ?? 0) + z.votos);
        }
      }
    }
  }

  // ── Agrupar locais por bairro ───────────────────────────────────────────
  const bairroMap = new Map<string, {
    lats: number[];
    lngs: number[];
    zonas: Set<number>;
    locais: Array<{ codLocal: string; nome: string; endereco: string; zona: number; lat: number | null; lng: number | null }>;
  }>();

  for (const l of locaisMun) {
    const bairroNome = l.bairro?.trim() || 'SEM BAIRRO';
    if (!bairroMap.has(bairroNome)) {
      bairroMap.set(bairroNome, { lats: [], lngs: [], zonas: new Set(), locais: [] });
    }
    const acc = bairroMap.get(bairroNome)!;
    acc.zonas.add(l.zona);
    acc.locais.push({ codLocal: l.codLocal, nome: l.nome, endereco: l.endereco, zona: l.zona, lat: l.lat, lng: l.lng });

    const validCoord = l.lat && l.lng && l.lat >= -35 && l.lat <= 5 && l.lng >= -74 && l.lng <= -35;
    if (validCoord) { acc.lats.push(l.lat!); acc.lngs.push(l.lng!); }
  }

  // ── Se há votos por zona, distribuir pelos locais de cada bairro ────────
  // Estratégia: votos da zona / total locais naquela zona no município
  const locaisPorZonaCount = new Map<number, number>();
  for (const l of locaisMun) {
    locaisPorZonaCount.set(l.zona, (locaisPorZonaCount.get(l.zona) ?? 0) + 1);
  }

  // votos por local = votos da zona / nº locais na zona
  const votosPorLocal = new Map<string, number>(); // key = `${zona}-${codLocal}`
  for (const [zona, votos] of votosPorZona) {
    const total = locaisPorZonaCount.get(zona) ?? 1;
    const vpp = votos / total;
    for (const l of locaisMun) {
      if (l.zona === zona) {
        votosPorLocal.set(`${zona}-${l.codLocal}`, vpp);
      }
    }
  }

  // ── Montar resposta ─────────────────────────────────────────────────────
  type LocalEntry = { codLocal: string; nome: string; endereco: string; zona: number; lat: number | null; lng: number | null };
  const bairros: Array<{
    nome: string; lat: number; lng: number;
    totalLocais: number; votos: number;
    locais: LocalEntry[];
  }> = [];

  for (const [nome, acc] of bairroMap) {
    if (acc.lats.length === 0) continue;

    const lat = acc.lats.reduce((s, v) => s + v, 0) / acc.lats.length;
    const lng = acc.lngs.reduce((s, v) => s + v, 0) / acc.lngs.length;

    // Somar votos de todos os locais deste bairro
    let votosTotal = 0;
    for (const local of acc.locais) {
      votosTotal += votosPorLocal.get(`${local.zona}-${local.codLocal}`) ?? 0;
    }

    bairros.push({
      nome,
      lat,
      lng,
      totalLocais: acc.locais.length,
      votos: Math.round(votosTotal),
      locais: acc.locais,
    });
  }

  bairros.sort((a, b) => b.votos - a.votos || b.totalLocais - a.totalLocais);

  return NextResponse.json({ municipio, uf, bairros, total: bairros.length });
}
