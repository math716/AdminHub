// Malhas e listas de municípios do IBGE guardadas no próprio sistema
// (public/geojson/ibge/, geradas por scripts/ibge/baixar-ibge.mjs).
//
// Em out/2026 o IBGE parou de responder aos servidores da Vercel, que ficam
// fora do Brasil: a rota de contornos devolvia "Erro ao buscar dados
// geográficos" e os mapas de estado e cidade ficaram em branco em homologação
// e produção. Agora tudo lê primeiro o arquivo do sistema; o IBGE fica só de
// reserva, para o caso de um arquivo faltar.

/**
 * De onde ler os arquivos de public/. No navegador, do próprio site. No
 * servidor, do domínio do site — a mesma ordem medida em lib/tse-static.ts,
 * menos o host do pedido: este arquivo também roda no navegador (Emendas
 * importa o Portal da Transparência), e ler os cabeçalhos do pedido
 * (next/headers) quebraria esse uso. Se nada responder, o IBGE é a reserva.
 */
function baseEstaticos(): string {
  if (typeof window !== 'undefined') return '';
  const limpa = (u: string) => u.replace(/[/]+$/, '');
  if (process.env.NEXT_PUBLIC_SITE_URL) return limpa(process.env.NEXT_PUBLIC_SITE_URL);
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.NEXTAUTH_URL) return limpa(process.env.NEXTAUTH_URL);
  return 'http://localhost:3000';
}

export const CODIGO_IBGE_UF: Record<string, number> = {
  AC: 12, AL: 27, AP: 16, AM: 13, BA: 29, CE: 23, DF: 53, ES: 32, GO: 52, MA: 21, MT: 51, MS: 50, MG: 31, PA: 15,
  PB: 25, PR: 41, PE: 26, PI: 22, RJ: 33, RN: 24, RS: 43, RO: 11, RR: 14, SC: 42, SP: 35, SE: 28, TO: 17,
};
const UF_POR_CODIGO: Record<string, string> =
  Object.fromEntries(Object.entries(CODIGO_IBGE_UF).map(([uf, c]) => [String(c), uf]));

/** Aceita a sigla ("RJ") ou o código do IBGE (33 / "33"). */
function sigla(uf: string | number): string | null {
  const s = String(uf).trim().toUpperCase();
  if (CODIGO_IBGE_UF[s]) return s;
  return UF_POR_CODIGO[s] ?? null;
}

const API = 'https://servicodados.ibge.gov.br/api';

/** Caminhos públicos (servidos pelo próprio site). */
export const caminhoMalhaBrasil = () => '/geojson/ibge/brasil.json';
export const caminhoMalhaEstado = (uf: string) => `/geojson/ibge/estados/${uf}.json`;
export const caminhoMunicipios = (uf: string) => `/geojson/ibge/municipios/${uf}.json`;

const cache = new Map<string, unknown>();

async function lerJson<T>(caminhoLocal: string, urlIbge: string): Promise<T | null> {
  if (cache.has(caminhoLocal)) return cache.get(caminhoLocal) as T;
  for (const url of [`${baseEstaticos()}${caminhoLocal}`, urlIbge]) {
    // Com limite de tempo: o IBGE, quando não responde, pode travar em vez de
    // recusar — e a função ficaria presa até estourar.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(url, { cache: 'force-cache', redirect: 'manual', signal: ctrl.signal });
      if (!res.ok) { console.warn(`[ibge] ${res.status} em ${url}`); continue; }
      const dados = (await res.json()) as T;
      cache.set(caminhoLocal, dados);
      return dados;
    } catch (err) {
      console.warn(`[ibge] falhou ${url}: ${String(err).slice(0, 120)}`);
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

export interface MunicipioIbge {
  id: number;
  nome: string;
  [campo: string]: unknown;
}

/**
 * Lista de cidades do estado (código IBGE + nome).
 *
 * Embutida no código (lib/ibge-municipios.json, 137 KB, carregada sob demanda)
 * em vez de buscada pela rede: lida por HTTP, ela chegou vazia no servidor em
 * homologação, e sem ela a rota de candidato devolvia os votos por cidade sem
 * o código do IBGE — o mapa do comparador ficou todo cinza.
 */
export async function listaMunicipiosIbge(uf: string | number): Promise<MunicipioIbge[] | null> {
  const s = sigla(uf);
  if (!s) return null;
  try {
    const todas = (await import('./ibge-municipios.json')).default as unknown as Record<string, Array<[number, string]>>;
    const lista = todas[s];
    if (lista?.length) return lista.map(([id, nome]) => ({ id, nome }));
  } catch { /* cai na leitura por rede abaixo */ }
  return lerJson<MunicipioIbge[]>(caminhoMunicipios(s), `${API}/v1/localidades/estados/${CODIGO_IBGE_UF[s]}/municipios`);
}

/** Contorno das cidades de um estado (GeoJSON da API de malhas do IBGE). */
export async function malhaEstadoIbge(uf: string | number): Promise<any | null> {
  const s = sigla(uf);
  if (!s) return null;
  return lerJson(caminhoMalhaEstado(s),
    `${API}/v3/malhas/estados/${CODIGO_IBGE_UF[s]}?formato=application/vnd.geo+json&qualidade=intermediaria&intrarregiao=municipio`);
}

/** Contorno dos estados do Brasil. */
export async function malhaBrasilIbge(): Promise<any | null> {
  return lerJson(caminhoMalhaBrasil(),
    `${API}/v3/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=UF`);
}
