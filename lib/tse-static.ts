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
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
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
