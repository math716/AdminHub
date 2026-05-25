/**
 * Parsers puros pro Portal da Transparência — sem I/O, fácil de testar.
 *
 * Funções aqui são novas (focadas em município via subTítulo) ou complementam
 * o que `lib/portal-transparencia.ts` já faz.
 */

// ---------------------------------------------------------------------------
// Mapa UF nome → sigla (cobre todas as 27 UFs com/sem acento)
// ---------------------------------------------------------------------------
const UF_NOME_PARA_SIGLA: Record<string, string> = {
  ACRE: 'AC', ALAGOAS: 'AL', 'AMAPÁ': 'AP', AMAPA: 'AP', AMAZONAS: 'AM',
  BAHIA: 'BA', 'CEARÁ': 'CE', CEARA: 'CE', 'DISTRITO FEDERAL': 'DF',
  'ESPÍRITO SANTO': 'ES', 'ESPIRITO SANTO': 'ES', 'GOIÁS': 'GO', GOIAS: 'GO',
  'MARANHÃO': 'MA', MARANHAO: 'MA', 'MATO GROSSO': 'MT', 'MATO GROSSO DO SUL': 'MS',
  'MINAS GERAIS': 'MG', 'PARÁ': 'PA', PARA: 'PA', 'PARAÍBA': 'PB', PARAIBA: 'PB',
  'PARANÁ': 'PR', PARANA: 'PR', PERNAMBUCO: 'PE', 'PIAUÍ': 'PI', PIAUI: 'PI',
  'RIO DE JANEIRO': 'RJ', 'RIO GRANDE DO NORTE': 'RN', 'RIO GRANDE DO SUL': 'RS',
  'RONDÔNIA': 'RO', RONDONIA: 'RO', RORAIMA: 'RR', 'SANTA CATARINA': 'SC',
  'SÃO PAULO': 'SP', 'SAO PAULO': 'SP', SERGIPE: 'SE', TOCANTINS: 'TO',
};

const UF_SIGLAS = new Set(Object.values(UF_NOME_PARA_SIGLA));

// ---------------------------------------------------------------------------
// Normalização de nomes (pra matching contra IBGE)
// ---------------------------------------------------------------------------
export function normalizeNome(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove diacríticos
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Parser: subTítulo / localizadorGasto → município
// ---------------------------------------------------------------------------
/**
 * Extrai município de strings tipo:
 *   "20GK1436 - FOMENTO AS ACOES DE GRADUACAO, POS-GR - NO MUNICIPIO DE JOAO"
 *   "00SX0016 - APOIO A PROJETOS DE DESENVOLVIMENTO S - NO ESTADO DO AMAPA"
 *   "8585 - ATENCAO A SAUDE - NO MUNICIPIO DE SAO PAULO - SP"
 *
 * O subTítulo do Portal é truncado em ~60 chars, então o nome do município
 * pode vir cortado ("JOAO" em vez de "JOAO PESSOA"). Retornamos o melhor
 * palpite — quem resolve IBGE depois lida com matching parcial.
 */
export function parseSubTituloMunicipio(raw: string | null | undefined): {
  tipo: 'MUNICIPIO' | 'ESTADO' | 'NACIONAL';
  municipio: string | null;
  uf: string | null;
} | null {
  if (!raw) return null;
  const s = raw.toUpperCase();

  // "NO MUNICIPIO DE XYZ" ou "NO MUNICIPIO DE XYZ - UF"
  const mMun = s.match(/NO MUNIC[IÍ]PIO DE ([A-ZÀ-Ú\s]+?)(?:\s*-\s*([A-Z]{2}))?(?:\s*-|$)/);
  if (mMun) {
    const municipio = mMun[1].trim();
    const uf = mMun[2] && UF_SIGLAS.has(mMun[2]) ? mMun[2] : null;
    if (municipio.length >= 3) return { tipo: 'MUNICIPIO', municipio, uf };
  }

  // "NO ESTADO DE/DO/DA XYZ"
  const mEst = s.match(/NO ESTADO D[OAE] ([A-ZÀ-Ú\s]+?)(?:\s*-|$)/);
  if (mEst) {
    const nomeEst = mEst[1].trim();
    const uf = UF_NOME_PARA_SIGLA[nomeEst] ?? null;
    if (uf) return { tipo: 'ESTADO', municipio: null, uf };
  }

  // "NACIONAL" no final
  if (/-\s*NACIONAL\s*$/.test(s)) {
    return { tipo: 'NACIONAL', municipio: null, uf: null };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Resolução IBGE (município → código)
// ---------------------------------------------------------------------------
const municipiosPorUfCache = new Map<string, { id: string; nome: string }[]>();

const UF_CODES: Record<string, number> = {
  AC: 12, AL: 27, AP: 16, AM: 13, BA: 29, CE: 23, DF: 53, ES: 32, GO: 52, MA: 21,
  MT: 51, MS: 50, MG: 31, PA: 15, PB: 25, PR: 41, PE: 26, PI: 22, RJ: 33, RN: 24,
  RS: 43, RO: 11, RR: 14, SC: 42, SP: 35, SE: 28, TO: 17,
};

async function getMunicipiosByUf(uf: string): Promise<{ id: string; nome: string }[]> {
  const key = uf.toUpperCase();
  if (municipiosPorUfCache.has(key)) return municipiosPorUfCache.get(key)!;

  const code = UF_CODES[key];
  if (!code) return [];

  try {
    const res = await fetch(
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${code}/municipios`,
      { next: { revalidate: 86400 } },
    );
    if (!res.ok) return [];
    const data: { id: number | string; nome: string }[] = await res.json();
    const out = data.map((m) => ({ id: String(m.id), nome: m.nome }));
    municipiosPorUfCache.set(key, out);
    return out;
  } catch {
    return [];
  }
}

/**
 * Resolve código IBGE a partir de (uf, nome do município).
 *
 * Suporta match parcial — útil quando o subTítulo do Portal vem truncado
 * ("JOAO" → "JOÃO PESSOA"). Estratégia:
 *  1. Match exato (normalizado)
 *  2. startsWith (parcial no início) — só se único match, evita ambiguidade
 *  3. null
 */
export async function resolverCodigoIbge(
  uf: string | null | undefined,
  municipio: string | null | undefined,
): Promise<string | null> {
  if (!uf || !municipio) return null;
  const lista = await getMunicipiosByUf(uf);
  if (lista.length === 0) return null;

  const alvo = normalizeNome(municipio);
  if (alvo.length < 3) return null;

  // 1. Match exato
  const exato = lista.find((m) => normalizeNome(m.nome) === alvo);
  if (exato) return exato.id;

  // 2. startsWith — só se único (ex.: "JOAO" → "JOÃO PESSOA" mas só se não
  //    houver "JOAO ALFREDO" no mesmo estado)
  const prefixo = lista.filter((m) => normalizeNome(m.nome).startsWith(alvo));
  if (prefixo.length === 1) return prefixo[0].id;

  return null;
}

// ---------------------------------------------------------------------------
// Parser de valor BR ("200.000,00" → 200000)
// ---------------------------------------------------------------------------
export function parseValorBR(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return 0;
  const norm = v.replace(/\./g, '').replace(',', '.');
  const n = Number(norm);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Parser de data BR ("19/07/2024" → Date)
// ---------------------------------------------------------------------------
export function parseDataBR(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v !== 'string') return null;
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dia, mes, ano] = m;
  const d = new Date(`${ano}-${mes}-${dia}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------
// Normalização de CNPJ ("37.430.723/0001-30" → "37430723000130")
// ---------------------------------------------------------------------------
export function normalizeCnpj(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const onlyDigits = v.replace(/\D/g, '');
  return onlyDigits.length === 14 ? onlyDigits : null;
}
