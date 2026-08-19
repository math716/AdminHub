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

// ── Índice nacional (nome → UF/cargo) ───────────────────────────────────────
// Achar alguém sem saber a UF exigiria abrir os 27 arquivos do ano (~5s e
// centenas de MB de heap). O índice traz só o que identifica a pessoa; é
// gerado por scripts/build-tse-index.mts.
export interface CandidatoIndice {
  uf: string; nomeUrna: string; nome: string;
  cargo: string; partido: string; totalVotos: number; situacao: string;
}

const indiceCache = new Map<string, CandidatoIndice[] | null>();

function loadIndice(ano: string): CandidatoIndice[] | null {
  if (indiceCache.has(ano)) return indiceCache.get(ano)!;
  let dados: CandidatoIndice[] | null = null;
  try {
    const fp = path.join(process.cwd(), 'public', 'data', 'tse', ano, '_index.json.gz');
    if (fs.existsSync(fp)) {
      const cru: any[] = JSON.parse(zlib.gunzipSync(fs.readFileSync(fp) as any).toString('utf8'));
      dados = cru.map(e => ({
        uf: e.u, nomeUrna: e.n, nome: e.c, cargo: e.g,
        partido: e.p, totalVotos: e.v, situacao: e.s,
      }));
    }
  } catch {
    dados = null;
  }
  indiceCache.set(ano, dados);
  return dados;
}

/**
 * Procura um candidato em TODAS as UFs de um ano, para descobrir o estado a
 * partir só do nome ("André do Prado" → SP). Devolve os melhores palpites,
 * mais votados primeiro. Retorna `null` se o índice do ano não existir — aí o
 * chamador segue pelo caminho antigo em vez de quebrar.
 */
export function buscarCandidatoNacional(
  nome: string,
  ano: string,
  cargo?: string,
  limite = 8,
): CandidatoIndice[] | null {
  const idx = loadIndice(ano);
  if (!idx) return null;

  const palavras = normalizarTextoTse(nome).split(' ').filter(p => p.length > 2);
  if (palavras.length === 0) return [];
  const cargoNorm = cargo ? normalizarTextoTse(cargo) : '';
  const identificadoras = palavras.filter(p => !TITULOS_COMUNS.has(p));

  // Casa PALAVRA INTEIRA: com `includes`, "andre" casava dentro de
  // "alexandre" e a busca por "André do Prado" trazia "ALEXANDRE PRADO".
  const temPalavra = (alvo: string[], p: string) => alvo.includes(p);

  const casa = (c: CandidatoIndice, exigirTodas: boolean) => {
    if (cargoNorm && !normalizarTextoTse(c.cargo).includes(cargoNorm)) return false;
    const alvo = `${normalizarTextoTse(c.nomeUrna)} ${normalizarTextoTse(c.nome)}`.split(' ');
    return exigirTodas
      ? palavras.every(p => temPalavra(alvo, p))
      : identificadoras.length > 0 && identificadoras.every(p => temPalavra(alvo, p));
  };

  // 1ª passada exige todas as palavras; se nada casar, ignora títulos genéricos
  // ("Deputado André do Prado" → "André do Prado").
  let achados = idx.filter(c => casa(c, true));
  if (achados.length === 0 && identificadoras.length < palavras.length) {
    achados = idx.filter(c => casa(c, false));
  }
  return achados.sort((a, b) => b.totalVotos - a.totalVotos).slice(0, limite);
}

/**
 * UF mais provável de um conjunto de nomes. Quando o usuário cita vários
 * candidatos sem dizer o estado, o estado em comum entre eles é a resposta —
 * é assim que "André do Prado e Ricardo Molina" vira SP.
 */
export function inferirUfPorNomes(
  nomes: string[],
  ano: string,
  cargo?: string,
): { uf: string | null; porNome: Record<string, CandidatoIndice[]> } {
  const porNome: Record<string, CandidatoIndice[]> = {};
  // Peso por UF: cada nome vota na UF do seu melhor palpite. Um nome que só
  // existe num estado decide; nomes ambíguos apenas reforçam.
  const peso: Record<string, number> = {};

  for (const n of nomes) {
    const achados = buscarCandidatoNacional(n, ano, cargo) ?? [];
    porNome[n] = achados;
    const ufsDoNome = new Set<string>();
    for (const c of achados) {
      if (ufsDoNome.has(c.uf)) continue;
      ufsDoNome.add(c.uf);
      // O mais votado do nome pesa mais que os homônimos fracos
      peso[c.uf] = (peso[c.uf] ?? 0) + (c === achados[0] ? 2 : 1);
    }
  }

  const ranking = Object.entries(peso).sort((a, b) => b[1] - a[1]);
  return { uf: ranking[0]?.[0] ?? null, porNome };
}

/**
 * Anos de eleição disponíveis na base (opcionalmente para uma UF). Permite
 * responder "não temos 2026, temos 2022 e 2018" em vez de "não encontrei".
 */
let anosCache: Record<string, number[]> | null = null;

export function anosDisponiveisTse(uf?: string): number[] {
  if (!anosCache) {
    anosCache = {};
    try {
      const base = path.join(process.cwd(), 'public', 'data', 'tse');
      for (const dir of fs.readdirSync(base)) {
        if (!/^\d{4}$/.test(dir)) continue;
        const ano = Number(dir);
        for (const arq of fs.readdirSync(path.join(base, dir))) {
          const sigla = arq.replace(/\.json(\.gz)?$/i, '').toUpperCase();
          if (!/^[A-Z]{2}$/.test(sigla)) continue;
          (anosCache[sigla] = anosCache[sigla] || []).push(ano);
        }
      }
      for (const k of Object.keys(anosCache)) anosCache[k].sort((a, b) => b - a);
    } catch { /* base ausente — devolve vazio */ }
  }
  if (uf) return anosCache[uf.toUpperCase()] ?? [];
  return [...new Set(Object.values(anosCache).flat())].sort((a, b) => b - a);
}

/**
 * UFs que têm dados num ano (para orientar quando a UF pedida não existe).
 */
export function ufsDisponiveisTse(ano: number): string[] {
  anosDisponiveisTse(); // garante o cache preenchido
  return Object.entries(anosCache ?? {})
    .filter(([, anos]) => anos.includes(ano))
    .map(([uf]) => uf)
    .sort();
}

// Títulos/profissões que aparecem em MUITOS nomes de urna. Casar por eles gera
// sugestão errada ("Delegado Alberto Fraga" achando "Delegado Fernando"), então
// pesam pouco — o que identifica a pessoa é o nome próprio/sobrenome.
const TITULOS_COMUNS = new Set([
  'delegado', 'delegada', 'doutor', 'doutora', 'dr', 'dra', 'pastor', 'pastora',
  'professor', 'professora', 'profa', 'prof', 'deputado', 'deputada', 'senador',
  'senadora', 'vereador', 'vereadora', 'prefeito', 'prefeita', 'agente', 'sargento',
  'capitao', 'coronel', 'major', 'tenente', 'soldado', 'cabo', 'juiz', 'juiza',
  'promotor', 'advogado', 'advogada', 'padre', 'irmao', 'irma', 'tio', 'tia',
  'enfermeira', 'enfermeiro', 'medico', 'medica', 'engenheiro', 'engenheira',
  'policial', 'bombeiro', 'militar', 'federal', 'civil', 'neto', 'filho', 'junior',
]);

/**
 * Nomes parecidos com a busca — usado para sugerir quando nada é encontrado
 * ("você quis dizer FRAGA?"). Pontua por palavra, dando peso baixo a títulos
 * genéricos e exigindo que ao menos uma palavra IDENTIFICADORA case.
 */
export function sugerirCandidatos(
  data: CandidatoJson[], query: string, cargo?: string, limite = 5,
): Array<{ nomeUrna: string; nome: string; cargo: string; partido: string; totalVotos: number }> {
  const palavras = normalizarTextoTse(query).split(' ').filter(p => p.length > 2);
  if (palavras.length === 0) return [];
  const identificadoras = palavras.filter(p => !TITULOS_COMUNS.has(p));
  const cargoNorm = cargo ? normalizarTextoTse(cargo) : '';

  return data
    .filter(c => !cargoNorm || normalizarTextoTse(c.cargo).includes(cargoNorm))
    .map(c => {
      const alvo = `${normalizarTextoTse(c.nomeUrna)} ${normalizarTextoTse(c.nome)}`;
      // Se a busca tem palavras identificadoras, pelo menos uma precisa casar
      const casouIdentificadora = identificadoras.length === 0
        || identificadoras.some(p => alvo.includes(p));
      if (!casouIdentificadora) return { c, score: 0 };
      const score = palavras.reduce(
        (s, p) => s + (alvo.includes(p) ? (TITULOS_COMUNS.has(p) ? 0.2 : 1) : 0), 0);
      return { c, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || b.c.totalVotos - a.c.totalVotos)
    .slice(0, limite)
    .map(x => ({
      nomeUrna: x.c.nomeUrna, nome: x.c.nome, cargo: x.c.cargo,
      partido: x.c.partido, totalVotos: x.c.totalVotos,
    }));
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

/**
 * Busca tolerante: quando a busca exata falha, pontua os candidatos pelo
 * número de palavras do pedido presentes no nome (urna ou civil) e aceita se
 * bater quase tudo — pode "sobrar" 1 palavra (ex.: "Delegada Doutora Jane"
 * encontra "DOUTORA JANE"). Com menos de 3 palavras não relaxa (evita falso
 * positivo).
 */
export function buscarCandidatoTolerante(
  data: CandidatoJson[],
  nome: string,
  cargo?: string,
): CandidatoJson | null {
  const palavras = normalizarTextoTse(nome).split(' ').filter(p => p.length > 2);
  if (palavras.length < 3) return null;
  const cargoNorm = cargo ? normalizarTextoTse(cargo) : '';
  const minScore = Math.max(2, palavras.length - 1);

  let melhor: CandidatoJson | null = null;
  let melhorScore = 0;
  for (const c of data) {
    if (cargoNorm && !normalizarTextoTse(c.cargo).includes(cargoNorm)) continue;
    const alvo = `${normalizarTextoTse(c.nomeUrna)} ${normalizarTextoTse(c.nome)}`;
    const score = palavras.reduce((s, p) => s + (alvo.includes(p) ? 1 : 0), 0);
    if (score >= minScore && (score > melhorScore ||
        (score === melhorScore && melhor !== null && c.totalVotos > melhor.totalVotos))) {
      melhor = c;
      melhorScore = score;
    }
  }
  return melhor;
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
