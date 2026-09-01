import zlib from 'zlib';
import manifesto from './tse-manifesto.json';

// A base do TSE (211 MB) é BUSCADA POR HTTP, não lida do disco.
//
// Com `fs.readFileSync`, o empacotador da Vercel conclui que os arquivos
// precisam viajar dentro da função e copia a pasta inteira: as funções do
// agente chegaram a 250,9 MB contra um teto de 250 MB. Com `fetch` nada é
// copiado — o arquivo é buscado do CDN no momento do uso, que é como o
// public/geojson (232 MB) sempre conviveu com o limite ocupando 0,7 MB.
//
// O preço é a primeira leitura de cada UF: MG e SP têm ~25 MB, o DF tem 80 KB.
// O cache em memória abaixo faz isso acontecer uma vez por instância.

/**
 * De onde a funcao baixa os arquivos de public/.
 *
 * A ordem foi MEDIDA em producao, nao suposta — a primeira tentativa desta
 * migracao usou VERCEL_URL e derrubou o mapa eleitoral. Diagnostico feito de
 * dentro da funcao, baixando o mesmo arquivo por cada endereco:
 *
 *   VERCEL_PROJECT_PRODUCTION_URL  200, 80.340 bytes,  10 ms   <-- este
 *   host do pedido                 200, 80.340 bytes, 169 ms
 *   VERCEL_URL (do deployment)     302 -> tela de login da Vercel
 *   VERCEL_BRANCH_URL              302 -> tela de login da Vercel
 *   NEXTAUTH_URL                   308 (barra sobrando no fim)
 *
 * A protecao de deploy da Vercel barra a PROPRIA funcao quando ela chama a URL
 * do deployment. O dominio de producao passa direto e ainda e o mais rapido.
 */
function baseEstaticos(): string {
  const limpa = (u: string) => u.replace(/[/]+$/, '');
  if (process.env.NEXT_PUBLIC_SITE_URL) return limpa(process.env.NEXT_PUBLIC_SITE_URL);
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.NEXTAUTH_URL) return limpa(process.env.NEXTAUTH_URL);
  return 'http://localhost:3000';
}

/**
 * Baixa e descomprime um arquivo de public/data/tse.
 *
 * Tenta .json.gz e cai para .json. Devolve null em qualquer falha — quem chama
 * já trata ausência de dados, e derrubar a requisição seria pior.
 */
export async function baixarTseJson<T>(caminho: string): Promise<T | null> {
  const base = baseEstaticos();
  for (const [url, comprimido] of [
    [`${base}/data/tse/${caminho}.json.gz`, true],
    [`${base}/data/tse/${caminho}.json`, false],
  ] as Array<[string, boolean]>) {
    try {
      const res = await fetch(url, { cache: 'force-cache', redirect: 'manual' });
      if (!res.ok) {
        // 3xx aqui = protecao de deploy barrando a propria funcao.
        console.warn(`[tse] ${res.status} em ${url}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      // O .gz é servido como arquivo bruto; quem descomprime somos nós.
      const texto = comprimido ? zlib.gunzipSync(buf).toString('utf8') : buf.toString('utf8');
      return JSON.parse(texto) as T;
    } catch (err) {
      // Silenciar aqui foi o que escondeu a falha na primeira tentativa desta
      // migracao: a rota devolvia 404 e o log nao dizia por que.
      console.warn(`[tse] falhou ${url}: ${String(err).slice(0, 120)}`);
    }
  }
  return null;
}

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

/**
 * Casa PALAVRA INTEIRA no nome. Com `includes`, "andre" casava dentro de
 * "alexandre" e a busca por "André do Prado" devolvia "ALEXANDRE PRADO" —
 * um suplente do RJ no lugar do deputado de SP.
 */
export function palavrasDoNome(c: { nomeUrna: string; nome: string }): string[] {
  return `${normalizarTextoTse(c.nomeUrna)} ${normalizarTextoTse(c.nome)}`.split(' ').filter(Boolean);
}

const fileCache = new Map<string, CandidatoJson[]>();

export async function loadStaticTseData(ano: string, uf: string): Promise<CandidatoJson[] | null> {
  const key = `${ano}-${uf}`;
  if (fileCache.has(key)) return fileCache.get(key)!;

  const data = await baixarTseJson<CandidatoJson[]>(`${ano}/${uf}`);
  if (data) fileCache.set(key, data);
  return data;
}

/**
 * Anos de eleição disponíveis na base (opcionalmente para uma UF). Permite
 * responder "não temos 2026, temos 2022 e 2018" em vez de "não encontrei".
 */
// Vem do manifesto (lib/tse-manifesto.json, ~2 KB), gerado por
// scripts/gerar-manifesto-tse.mjs. Por HTTP dá para buscar um arquivo, mas não
// para listar o conteúdo de uma pasta — daí o índice.
const anosPorUf: Record<string, number[]> = manifesto.anosPorUf as Record<string, number[]>;

export function anosDisponiveisTse(uf?: string): number[] {
  if (uf) return anosPorUf[uf.toUpperCase()] ?? [];
  return [...new Set(Object.values(anosPorUf).flat())].sort((a, b) => b - a);
}

/**
 * UFs que têm dados num ano (para orientar quando a UF pedida não existe).
 */
export function ufsDisponiveisTse(ano: number): string[] {
  return Object.entries(anosPorUf)
    .filter(([, anos]) => anos.includes(ano))
    .map(([uf]) => uf)
    .sort();
}

// Títulos/profissões que aparecem em MUITOS nomes de urna. Casar por eles gera
// sugestão errada ("Delegado Alberto Fraga" achando "Delegado Fernando"), então
// pesam pouco — o que identifica a pessoa é o nome próprio/sobrenome.
export const TITULOS_COMUNS = new Set([
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
      const alvo = palavrasDoNome(c);
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

export async function loadLocaisTse(uf: string): Promise<LocalVotacao[] | null> {
  if (locaisCache.has(uf)) return locaisCache.get(uf)!;
  const data = await baixarTseJson<LocalVotacao[]>(`locais/${uf}`);
  locaisCache.set(uf, data);
  return data;
}

/**
 * Mapa `zona → bairros` de um município (a partir dos locais de votação).
 * Permite relacionar os votos por zona eleitoral aos bairros correspondentes.
 */
export async function bairrosPorZona(uf: string, municipio: string, maxBairros = 12): Promise<Record<number, string[]>> {
  const locais = await loadLocaisTse(uf);
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

  // 2ª passada, por palavras: exige PALAVRA INTEIRA. Com substring, buscar
  // "André do Prado" trazia "ALEXANDRE PRADO" ("andre" dentro de "alexandre").
  if (resultados.length === 0 && palavras.length > 0) {
    resultados = data.filter(c => {
      const alvo = palavrasDoNome(c);
      return matchCargo(c) && palavras.every(p => alvo.includes(p));
    });
  }

  return resultados;
}
