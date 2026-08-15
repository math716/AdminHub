import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

export interface CandidatoJson {
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
  votosPorEstado?: Record<string, number>;
}

export function normalizarTextoTse(t: string): string {
  // Trata "_" como espaço para casar enums do agente (ex.: DEPUTADO_FEDERAL)
  // com o cargo do TSE ("Deputado Federal"), e colapsa espaços repetidos.
  return (t ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const fileCache = new Map<string, CandidatoJson[]>();

export function loadStaticTseData(ano: string, uf: string): CandidatoJson[] | null {
  const key = `${ano}-${uf}`;
  if (fileCache.has(key)) return fileCache.get(key)!;

  const base = path.join(process.cwd(), 'public', 'data', 'tse', ano, uf);
  const gzPath   = `${base}.json.gz`;
  const jsonPath  = `${base}.json`;

  try {
    let raw: string;
    if (fs.existsSync(gzPath)) {
      raw = zlib.gunzipSync(fs.readFileSync(gzPath) as any).toString('utf8');
    } else if (fs.existsSync(jsonPath)) {
      raw = fs.readFileSync(jsonPath, 'utf8');
    } else {
      return null;
    }
    const data: CandidatoJson[] = JSON.parse(raw);
    fileCache.set(key, data);
    return data;
  } catch {
    return null;
  }
}

// ── Locais de votação (mapeiam zona → bairros) ──────────────────────────────
export interface LocalVotacao {
  municipio: string; zona: number; codLocal: string;
  nome: string; endereco: string; bairro: string; lat: number; lng: number;
}

const locaisCache = new Map<string, LocalVotacao[] | null>();

export function loadLocaisTse(uf: string): LocalVotacao[] | null {
  if (locaisCache.has(uf)) return locaisCache.get(uf)!;

  const base = path.join(process.cwd(), 'public', 'data', 'tse', 'locais', uf);
  const gzPath = `${base}.json.gz`;
  const jsonPath = `${base}.json`;

  let data: LocalVotacao[] | null = null;
  try {
    if (fs.existsSync(gzPath)) {
      data = JSON.parse(zlib.gunzipSync(fs.readFileSync(gzPath) as any).toString('utf8'));
    } else if (fs.existsSync(jsonPath)) {
      data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    }
  } catch {
    data = null;
  }
  locaisCache.set(uf, data);
  return data;
}

/**
 * Mapa `zona → bairros` de um município (a partir dos locais de votação).
 * Permite relacionar os votos por zona eleitoral aos bairros correspondentes.
 */
export function bairrosPorZona(uf: string, municipio: string, maxBairros = 12): Record<number, string[]> {
  const locais = loadLocaisTse(uf);
  if (!locais) return {};
  const muniNorm = normalizarTextoTse(municipio);
  const sets: Record<number, Set<string>> = {};
  for (const l of locais) {
    if (!l.bairro || normalizarTextoTse(l.municipio) !== muniNorm) continue;
    (sets[l.zona] = sets[l.zona] || new Set()).add(l.bairro);
  }
  return Object.fromEntries(Object.entries(sets).map(([z, s]) => [Number(z), [...s].slice(0, maxBairros)]));
}

export function buscarCandidatoNoJson(
  data: CandidatoJson[],
  query: string,
  cargo?: string,
): CandidatoJson[] {
  const queryNorm = normalizarTextoTse(query);
  const palavras  = queryNorm.split(' ').filter(p => p.length > 2);

  const matchCargo = (c: CandidatoJson) =>
    !cargo || normalizarTextoTse(c.cargo).includes(normalizarTextoTse(cargo));

  let resultados = data.filter(c =>
    matchCargo(c) &&
    (normalizarTextoTse(c.nomeUrna).includes(queryNorm) ||
     normalizarTextoTse(c.nome).includes(queryNorm))
  );

  if (resultados.length === 0 && palavras.length > 0) {
    resultados = data.filter(c => {
      const nu = normalizarTextoTse(c.nomeUrna);
      const nm = normalizarTextoTse(c.nome);
      return matchCargo(c) && palavras.every(p => nu.includes(p) || nm.includes(p));
    });
  }

  return resultados;
}
