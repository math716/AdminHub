/**
 * Cliente do Portal da Transparência — emendas parlamentares.
 *
 * Configuração:
 *   PORTAL_TRANSPARENCIA_API_KEY=<sua chave>
 *
 * Obtenha a chave em https://portaldatransparencia.gov.br/api-de-dados/cadastrar-email
 * (cadastro grátis com e-mail).
 *
 * Quando a chave NÃO está definida, o cliente entra em modo mock — gera dados
 * sintéticos consistentes para validação de UI sem depender da API real.
 */

const PORTAL_BASE = 'https://api.portaldatransparencia.gov.br';
const API_KEY = process.env.PORTAL_TRANSPARENCIA_API_KEY;
export const PORTAL_MOCK_MODE = !API_KEY;

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------
export type EmendaArea =
  | 'SAUDE'
  | 'EDUCACAO'
  | 'SEGURANCA'
  | 'INFRAESTRUTURA'
  | 'ASSISTENCIA_SOCIAL'
  | 'AGRICULTURA'
  | 'CULTURA'
  | 'ESPORTE'
  | 'MEIO_AMBIENTE'
  | 'TRANSPORTE'
  | 'HABITACAO'
  | 'SANEAMENTO'
  | 'OUTROS';

export type ParlamentarCargo =
  | 'VEREADOR'
  | 'PREFEITO'
  | 'DEPUTADO_ESTADUAL'
  | 'DEPUTADO_FEDERAL'
  | 'SENADOR'
  | 'GOVERNADOR';

export interface PortalEmenda {
  idPortal: string;
  ano: number;
  numero: string | null;
  tipo: string | null;
  funcao: string | null;
  subfuncao: string | null;
  area: EmendaArea;
  objeto: string | null;
  valorEmpenhado: number;
  valorPago: number;
  valorRestoPago: number;
  valorProposto: number | null;
  orgaoExecutor: string | null;
  beneficiario: string | null;
  cnpjBeneficiario: string | null;
  uf: string | null;
  codigoIbge: string | null;
  municipioNome: string | null;
  // Identificação do autor
  autorCpf: string | null;
  autorNome: string;
  autorCargo: ParlamentarCargo;
  autorPartido: string | null;
  autorUf: string | null;
}

export interface PortalParlamentar {
  cpf: string | null;
  idPortal: string;
  nome: string;
  nomeUrna: string | null;
  partido: string | null;
  uf: string | null;
  cargo: ParlamentarCargo;
}

// ---------------------------------------------------------------------------
// Mapeamento Função → Área
// ---------------------------------------------------------------------------
// Códigos da classificação funcional do orçamento federal (Portaria MOG 42/1999).
const FUNCAO_AREA_MAP: Record<string, EmendaArea> = {
  '10': 'SAUDE',
  '12': 'EDUCACAO',
  '06': 'SEGURANCA',
  '15': 'INFRAESTRUTURA', // Urbanismo
  '17': 'SANEAMENTO',
  '08': 'ASSISTENCIA_SOCIAL',
  '20': 'AGRICULTURA',
  '13': 'CULTURA',
  '27': 'ESPORTE',
  '18': 'MEIO_AMBIENTE',
  '26': 'TRANSPORTE',
  '16': 'HABITACAO',
};

export function classificarArea(funcaoCodigo?: string | null, funcaoNome?: string | null): EmendaArea {
  if (funcaoCodigo && FUNCAO_AREA_MAP[funcaoCodigo]) return FUNCAO_AREA_MAP[funcaoCodigo];
  const nome = (funcaoNome ?? '').toLowerCase();
  if (nome.includes('saúde') || nome.includes('saude')) return 'SAUDE';
  if (nome.includes('educa'))      return 'EDUCACAO';
  if (nome.includes('segura'))     return 'SEGURANCA';
  if (nome.includes('urban') || nome.includes('infraestrutura')) return 'INFRAESTRUTURA';
  if (nome.includes('saneamento')) return 'SANEAMENTO';
  if (nome.includes('assistência') || nome.includes('assistencia')) return 'ASSISTENCIA_SOCIAL';
  if (nome.includes('agricultura'))return 'AGRICULTURA';
  if (nome.includes('cultura'))    return 'CULTURA';
  if (nome.includes('esporte') || nome.includes('desporto')) return 'ESPORTE';
  if (nome.includes('ambiente'))   return 'MEIO_AMBIENTE';
  if (nome.includes('transporte'))return 'TRANSPORTE';
  if (nome.includes('habita'))     return 'HABITACAO';
  return 'OUTROS';
}

export const AREA_LABELS: Record<EmendaArea, string> = {
  SAUDE:              'Saúde',
  EDUCACAO:           'Educação',
  SEGURANCA:          'Segurança',
  INFRAESTRUTURA:     'Infraestrutura',
  ASSISTENCIA_SOCIAL: 'Assistência Social',
  AGRICULTURA:        'Agricultura',
  CULTURA:            'Cultura',
  ESPORTE:            'Esporte',
  MEIO_AMBIENTE:      'Meio Ambiente',
  TRANSPORTE:         'Transporte',
  HABITACAO:          'Habitação',
  SANEAMENTO:         'Saneamento',
  OUTROS:             'Outros',
};

export const AREA_COLORS: Record<EmendaArea, string> = {
  SAUDE:              '#3b82f6',
  EDUCACAO:           '#10b981',
  SEGURANCA:          '#f59e0b',
  INFRAESTRUTURA:     '#8b5cf6',
  ASSISTENCIA_SOCIAL: '#ec4899',
  AGRICULTURA:        '#84cc16',
  CULTURA:            '#a855f7',
  ESPORTE:            '#06b6d4',
  MEIO_AMBIENTE:      '#22c55e',
  TRANSPORTE:         '#0ea5e9',
  HABITACAO:          '#f97316',
  SANEAMENTO:         '#14b8a6',
  OUTROS:             '#94a3b8',
};

export const CARGO_LABELS: Record<ParlamentarCargo, string> = {
  VEREADOR:          'Vereador',
  PREFEITO:          'Prefeito',
  DEPUTADO_ESTADUAL: 'Deputado Estadual',
  DEPUTADO_FEDERAL:  'Deputado Federal',
  SENADOR:           'Senador',
  GOVERNADOR:        'Governador',
};

// ---------------------------------------------------------------------------
// Cache em memória (TTL curto, evita estourar rate limit)
// ---------------------------------------------------------------------------
const cache = new Map<string, { ts: number; data: any }>();
const TTL_MS = 5 * 60 * 1000; // 5 min

function cacheGet<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.data as T;
}

function cacheSet(key: string, data: any) {
  cache.set(key, { ts: Date.now(), data });
}

// ---------------------------------------------------------------------------
// HTTP wrapper
// ---------------------------------------------------------------------------
async function portalFetch(path: string, params: Record<string, string | number | undefined>): Promise<any> {
  if (PORTAL_MOCK_MODE) {
    throw new Error('PORTAL_MOCK_MODE: use os mocks em vez de portalFetch');
  }
  const url = new URL(`${PORTAL_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  });
  const res = await fetch(url.toString(), {
    headers: { 'chave-api-dados': API_KEY ?? '', 'accept': 'application/json' },
    next: { revalidate: 300 },
  });
  if (res.status === 429) {
    // rate limit — espera e tenta uma vez
    await new Promise((r) => setTimeout(r, 1500));
    return portalFetch(path, params);
  }
  if (!res.ok) throw new Error(`Portal HTTP ${res.status}`);
  return res.json();
}

// Pagina sequencialmente até maxPages ou até a página voltar vazia.
async function portalFetchPaginated(
  path: string,
  baseParams: Record<string, string | number | undefined>,
  maxPages = 6,
): Promise<any[]> {
  const out: any[] = [];
  for (let pagina = 1; pagina <= maxPages; pagina++) {
    const data = await portalFetch(path, { ...baseParams, pagina });
    if (!Array.isArray(data) || data.length === 0) break;
    out.push(...data);
    if (data.length < 15) break; // página final geralmente < 15
  }
  return out;
}

// Parser de valor BR: "200.000,00" → 200000
function parseValorBR(v: any): number {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return 0;
  const norm = v.replace(/\./g, '').replace(',', '.');
  const n = Number(norm);
  return Number.isFinite(n) ? n : 0;
}

// Mapa UF nome → sigla
const UF_NOME_PARA_SIGLA: Record<string, string> = {
  'ACRE': 'AC', 'ALAGOAS': 'AL', 'AMAPÁ': 'AP', 'AMAPA': 'AP', 'AMAZONAS': 'AM',
  'BAHIA': 'BA', 'CEARÁ': 'CE', 'CEARA': 'CE', 'DISTRITO FEDERAL': 'DF',
  'ESPÍRITO SANTO': 'ES', 'ESPIRITO SANTO': 'ES', 'GOIÁS': 'GO', 'GOIAS': 'GO',
  'MARANHÃO': 'MA', 'MARANHAO': 'MA', 'MATO GROSSO': 'MT', 'MATO GROSSO DO SUL': 'MS',
  'MINAS GERAIS': 'MG', 'PARÁ': 'PA', 'PARA': 'PA', 'PARAÍBA': 'PB', 'PARAIBA': 'PB',
  'PARANÁ': 'PR', 'PARANA': 'PR', 'PERNAMBUCO': 'PE', 'PIAUÍ': 'PI', 'PIAUI': 'PI',
  'RIO DE JANEIRO': 'RJ', 'RIO GRANDE DO NORTE': 'RN', 'RIO GRANDE DO SUL': 'RS',
  'RONDÔNIA': 'RO', 'RONDONIA': 'RO', 'RORAIMA': 'RR', 'SANTA CATARINA': 'SC',
  'SÃO PAULO': 'SP', 'SAO PAULO': 'SP', 'SERGIPE': 'SE', 'TOCANTINS': 'TO',
};

// Parseia "localidadeDoGasto" do Portal em { tipo, uf?, municipio? }.
// Formatos observados:
//   "Nacional"                  → tipo=NACIONAL
//   "MINAS GERAIS (UF)"         → tipo=UF, uf=MG
//   "JOÃO PESSOA - PB"          → tipo=MUNICIPIO, uf=PB, municipio="JOÃO PESSOA"
//   "BRASÍLIA - DF"             → tipo=MUNICIPIO, uf=DF, municipio="BRASÍLIA"
export function parseLocalidadeGasto(raw: string | null | undefined): {
  tipo: 'NACIONAL' | 'UF' | 'MUNICIPIO' | 'INDEFINIDA';
  uf: string | null;
  municipio: string | null;
} {
  if (!raw) return { tipo: 'INDEFINIDA', uf: null, municipio: null };
  const s = raw.trim();
  if (/^nacional$/i.test(s)) return { tipo: 'NACIONAL', uf: null, municipio: null };

  // "ESTADO (UF)"
  const mUf = s.match(/^(.+)\s*\(UF\)\s*$/i);
  if (mUf) {
    const nomeUf = mUf[1].trim().toUpperCase();
    return { tipo: 'UF', uf: UF_NOME_PARA_SIGLA[nomeUf] ?? null, municipio: null };
  }

  // "MUNICIPIO - UF"
  const mMun = s.match(/^(.+)\s*-\s*([A-Z]{2})\s*$/);
  if (mMun) {
    return { tipo: 'MUNICIPIO', uf: mMun[2].toUpperCase(), municipio: mMun[1].trim() };
  }

  return { tipo: 'INDEFINIDA', uf: null, municipio: null };
}

// Normaliza nome de município pra match: maiúsculo, sem acento, sem pontuação.
function normalizeNome(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Cache de municípios por UF (sigla → array)
const municipiosPorUfCache = new Map<string, { id: string; nome: string }[]>();

async function getMunicipiosByUf(uf: string): Promise<{ id: string; nome: string }[]> {
  const ufKey = uf.toUpperCase();
  if (municipiosPorUfCache.has(ufKey)) return municipiosPorUfCache.get(ufKey)!;

  const ufCodes: Record<string, number> = {
    AC: 12, AL: 27, AP: 16, AM: 13, BA: 29, CE: 23, DF: 53, ES: 32, GO: 52, MA: 21,
    MT: 51, MS: 50, MG: 31, PA: 15, PB: 25, PR: 41, PE: 26, PI: 22, RJ: 33, RN: 24,
    RS: 43, RO: 11, RR: 14, SC: 42, SP: 35, SE: 28, TO: 17,
  };
  const code = ufCodes[ufKey];
  if (!code) return [];

  try {
    const res = await fetch(
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${code}/municipios`,
      { next: { revalidate: 86400 } },
    );
    if (!res.ok) return [];
    const data: any[] = await res.json();
    const out = data.map((m) => ({ id: String(m.id), nome: m.nome }));
    municipiosPorUfCache.set(ufKey, out);
    return out;
  } catch {
    return [];
  }
}

// Resolve código IBGE a partir de (uf, municipio nome).
async function resolverCodigoIbge(uf: string | null, municipio: string | null): Promise<string | null> {
  if (!uf || !municipio) return null;
  const munList = await getMunicipiosByUf(uf);
  if (munList.length === 0) return null;
  const alvo = normalizeNome(municipio);
  const hit = munList.find((m) => normalizeNome(m.nome) === alvo);
  return hit?.id ?? null;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Lista emendas de um parlamentar (filtro por nome). Em produção: pagina o Portal.
 * Mock: gera dataset sintético determinístico.
 */
export async function listEmendasPorParlamentar(opts: {
  cpf?: string;
  idPortal?: string;
  nome?: string;
  ano?: number;
}): Promise<PortalEmenda[]> {
  const key = `parl:${opts.cpf ?? opts.idPortal ?? opts.nome ?? ''}:${opts.ano ?? 'all'}`;
  const hit = cacheGet<PortalEmenda[]>(key);
  if (hit) return hit;

  let result: PortalEmenda[];
  if (PORTAL_MOCK_MODE) {
    result = mockEmendasPorParlamentar(opts);
  } else {
    if (!opts.nome) return [];
    const rows = await portalFetchPaginated('/api-de-dados/emendas', {
      ano: opts.ano,
      nomeAutor: opts.nome,
    }, 10);
    result = await Promise.all(rows.map(mapPortalRow));
  }

  cacheSet(key, result);
  return result;
}

/**
 * Lista emendas de um município. A API do Portal não tem filtro direto por
 * código IBGE — então buscamos por UF e fazemos match por nome do município.
 */
export async function listEmendasPorMunicipio(opts: {
  codigoIbge: string;
  uf: string;
  municipioNome?: string;
  ano?: number;
}): Promise<PortalEmenda[]> {
  const key = `mun:${opts.codigoIbge}:${opts.ano ?? 'all'}`;
  const hit = cacheGet<PortalEmenda[]>(key);
  if (hit) return hit;

  let result: PortalEmenda[];
  if (PORTAL_MOCK_MODE) {
    result = mockEmendasPorMunicipio(opts);
  } else {
    // Resolve o nome do município (caso não venha) pra fazer match
    let nomeAlvo = opts.municipioNome;
    if (!nomeAlvo) {
      const list = await getMunicipiosByUf(opts.uf);
      nomeAlvo = list.find((m) => m.id === opts.codigoIbge)?.nome;
    }
    if (!nomeAlvo) return [];

    // O Portal aceita filtro por UF beneficiária (campo `codigoIbgeUfBeneficiada`
    // não existe — testamos `localidadeDoGasto` retornado e filtramos no client)
    const rows = await portalFetchPaginated('/api-de-dados/emendas', {
      ano: opts.ano,
    }, 10);
    const alvo = normalizeNome(nomeAlvo);
    const filtered = rows.filter((row) => {
      const loc = parseLocalidadeGasto(row?.localidadeDoGasto);
      return loc.tipo === 'MUNICIPIO'
        && loc.uf === opts.uf.toUpperCase()
        && loc.municipio
        && normalizeNome(loc.municipio) === alvo;
    });
    result = await Promise.all(filtered.map(mapPortalRow));
    // Garante codigoIbge correto (já sabemos qual é)
    result = result.map((e) => ({ ...e, codigoIbge: opts.codigoIbge, municipioNome: nomeAlvo ?? e.municipioNome }));
  }

  cacheSet(key, result);
  return result;
}

/**
 * Busca parlamentares por nome (autocomplete).
 * O Portal não tem endpoint próprio — agrupamos autores únicos de /emendas.
 */
export async function searchParlamentares(query: string): Promise<PortalParlamentar[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const key = `search:${q.toLowerCase()}`;
  const hit = cacheGet<PortalParlamentar[]>(key);
  if (hit) return hit;

  let result: PortalParlamentar[];
  if (PORTAL_MOCK_MODE) {
    result = mockSearchParlamentares(q);
  } else {
    const rows = await portalFetchPaginated('/api-de-dados/emendas', {
      nomeAutor: q,
      ano: new Date().getFullYear() - 1, // último ano fechado tende a ter dados completos
    }, 3);
    const seen = new Map<string, PortalParlamentar>();
    rows.forEach((row: any) => {
      const nome = (row?.nomeAutor ?? row?.autor ?? '').toString().trim();
      if (!nome) return;
      const tipo = (row?.tipoEmenda ?? '').toString();
      if (!seen.has(nome)) {
        seen.set(nome, {
          cpf:       null,
          idPortal:  nome,
          nome,
          nomeUrna:  null,
          partido:   null,
          uf:        null,
          cargo:     inferCargo(tipo),
        });
      }
    });
    result = Array.from(seen.values()).slice(0, 20);
  }

  cacheSet(key, result);
  return result;
}

// ---------------------------------------------------------------------------
// Mapeamento da resposta crua do Portal → PortalEmenda
// ---------------------------------------------------------------------------
async function mapPortalRow(row: any): Promise<PortalEmenda> {
  const funcaoNome = row?.funcao ?? null;
  const loc = parseLocalidadeGasto(row?.localidadeDoGasto);
  const codigoIbge = await resolverCodigoIbge(loc.uf, loc.municipio);

  return {
    idPortal:           String(row?.codigoEmenda ?? cryptoRandom()),
    ano:                Number(row?.ano ?? new Date().getFullYear()),
    numero:             row?.numeroEmenda ?? null,
    tipo:               row?.tipoEmenda ?? null,
    funcao:             funcaoNome,
    subfuncao:          row?.subfuncao ?? null,
    area:               classificarArea(null, funcaoNome),
    objeto:             row?.localidadeDoGasto ?? null,
    valorEmpenhado:     parseValorBR(row?.valorEmpenhado),
    valorPago:          parseValorBR(row?.valorPago),
    valorRestoPago:     parseValorBR(row?.valorRestoPago),
    valorProposto:      null,
    orgaoExecutor:      null,
    beneficiario:       null,
    cnpjBeneficiario:   null,
    uf:                 loc.uf,
    codigoIbge,
    municipioNome:      loc.municipio,
    autorCpf:           null,
    autorNome:          (row?.nomeAutor ?? row?.autor ?? '—').toString().trim(),
    autorCargo:         inferCargo(row?.tipoEmenda ?? ''),
    autorPartido:       null,
    autorUf:            loc.uf,
  };
}

function inferCargo(raw: string): ParlamentarCargo {
  const s = (raw ?? '').toUpperCase();
  if (s.includes('SENADOR'))            return 'SENADOR';
  if (s.includes('BANCADA'))            return 'DEPUTADO_FEDERAL'; // emendas de bancada — agregado, assume DF
  if (s.includes('COMISSÃO') || s.includes('COMISSAO')) return 'DEPUTADO_FEDERAL';
  if (s.includes('FEDERAL'))            return 'DEPUTADO_FEDERAL';
  if (s.includes('ESTADUAL'))           return 'DEPUTADO_ESTADUAL';
  if (s.includes('GOVERN'))             return 'GOVERNADOR';
  if (s.includes('PREFEIT'))            return 'PREFEITO';
  if (s.includes('VEREAD'))             return 'VEREADOR';
  return 'DEPUTADO_FEDERAL';
}

function cryptoRandom() {
  return Math.random().toString(36).slice(2, 14);
}

// ===========================================================================
// MOCKS — usado quando PORTAL_TRANSPARENCIA_API_KEY não está definida
// ===========================================================================

const MOCK_PARLAMENTARES: PortalParlamentar[] = [
  { cpf: '11111111111', idPortal: 'p001', nome: 'Fulano de Tal',       nomeUrna: 'Fulano',  partido: 'PT',    uf: 'CE', cargo: 'DEPUTADO_FEDERAL' },
  { cpf: '22222222222', idPortal: 'p002', nome: 'Ciclano da Silva',    nomeUrna: 'Ciclano', partido: 'PSDB',  uf: 'CE', cargo: 'SENADOR' },
  { cpf: '33333333333', idPortal: 'p003', nome: 'Beltrano Souza',      nomeUrna: 'Beltrano',partido: 'MDB',   uf: 'CE', cargo: 'DEPUTADO_FEDERAL' },
  { cpf: '44444444444', idPortal: 'p004', nome: 'Sicrano Alves',       nomeUrna: 'Sicrano', partido: 'PL',    uf: 'CE', cargo: 'DEPUTADO_FEDERAL' },
  { cpf: '55555555555', idPortal: 'p005', nome: 'Maria Oliveira',      nomeUrna: 'Maria O.',partido: 'PP',    uf: 'CE', cargo: 'DEPUTADO_ESTADUAL' },
  { cpf: '66666666666', idPortal: 'p006', nome: 'José Pereira',        nomeUrna: 'Zé',      partido: 'PSB',   uf: 'CE', cargo: 'DEPUTADO_ESTADUAL' },
  { cpf: '77777777777', idPortal: 'p007', nome: 'Ana Costa',           nomeUrna: 'Ana C.',  partido: 'PCdoB', uf: 'CE', cargo: 'SENADOR' },
  { cpf: '88888888888', idPortal: 'p008', nome: 'Carlos Mendes',       nomeUrna: 'Carlão',  partido: 'UNIÃO', uf: 'CE', cargo: 'DEPUTADO_FEDERAL' },
];

// Municípios mock (Ceará — alguns de exemplo). Em produção vem do IBGE.
const MOCK_MUNICIPIOS: { codigoIbge: string; nome: string; uf: string }[] = [
  { codigoIbge: '2304400', nome: 'Fortaleza',         uf: 'CE' },
  { codigoIbge: '2307304', nome: 'Maracanaú',         uf: 'CE' },
  { codigoIbge: '2304202', nome: 'Caucaia',           uf: 'CE' },
  { codigoIbge: '2303709', nome: 'Cariri',            uf: 'CE' },
  { codigoIbge: '2308104', nome: 'Sobral',            uf: 'CE' },
  { codigoIbge: '2305506', nome: 'Iguatu',            uf: 'CE' },
  { codigoIbge: '2306405', nome: 'Itapipoca',         uf: 'CE' },
  { codigoIbge: '2304285', nome: 'Eusébio',           uf: 'CE' },
  { codigoIbge: '2304400', nome: 'Aquiraz',           uf: 'CE' },
  { codigoIbge: '2308000', nome: 'Senador Pompeu',    uf: 'CE' },
];

const AREAS_PARA_GERAR: EmendaArea[] = ['SAUDE', 'EDUCACAO', 'SEGURANCA', 'INFRAESTRUTURA', 'ASSISTENCIA_SOCIAL', 'CULTURA'];

// Hash determinístico simples — mesma entrada gera mesmo número
function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pseudoRandom(seed: number): () => number {
  let x = seed;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
}

function mockSearchParlamentares(q: string): PortalParlamentar[] {
  const qLower = q.toLowerCase();
  return MOCK_PARLAMENTARES.filter(
    (p) => p.nome.toLowerCase().includes(qLower) || (p.nomeUrna ?? '').toLowerCase().includes(qLower),
  );
}

function mockEmendasPorParlamentar(opts: { cpf?: string; idPortal?: string; nome?: string; ano?: number }): PortalEmenda[] {
  const parl = MOCK_PARLAMENTARES.find(
    (p) =>
      (opts.cpf && p.cpf === opts.cpf) ||
      (opts.idPortal && p.idPortal === opts.idPortal) ||
      (opts.nome && p.nome.toLowerCase() === opts.nome.toLowerCase()),
  );
  if (!parl) return [];

  const anos = opts.ano ? [opts.ano] : [2021, 2022, 2023, 2024, 2025];
  const out: PortalEmenda[] = [];

  anos.forEach((ano) => {
    const rng = pseudoRandom(hashSeed(`${parl.idPortal}:${ano}`));
    const numEmendas = Math.floor(rng() * 8) + 4; // 4–11 emendas/ano
    for (let i = 0; i < numEmendas; i++) {
      const area = AREAS_PARA_GERAR[Math.floor(rng() * AREAS_PARA_GERAR.length)];
      const mun  = MOCK_MUNICIPIOS[Math.floor(rng() * MOCK_MUNICIPIOS.length)];
      const valorBase = 200_000 + Math.floor(rng() * 1_800_000);
      out.push({
        idPortal:           `mock-${parl.idPortal}-${ano}-${i}`,
        ano,
        numero:             `${ano}${String(i + 1).padStart(4, '0')}`,
        tipo:               'INDIVIDUAL',
        funcao:             AREA_LABELS[area],
        subfuncao:          null,
        area,
        objeto:             `Repasse para ${AREA_LABELS[area].toLowerCase()} em ${mun.nome}`,
        valorEmpenhado:     valorBase,
        valorPago:          Math.floor(valorBase * (0.4 + rng() * 0.6)),
        valorRestoPago:     0,
        valorProposto:      valorBase,
        orgaoExecutor:      area === 'SAUDE'    ? 'Ministério da Saúde'
                          : area === 'EDUCACAO' ? 'Ministério da Educação'
                          : area === 'SEGURANCA'? 'Ministério da Justiça'
                          : 'Ministério da Integração',
        beneficiario:       `Prefeitura Municipal de ${mun.nome}`,
        cnpjBeneficiario:   null,
        uf:                 mun.uf,
        codigoIbge:         mun.codigoIbge,
        municipioNome:      mun.nome,
        autorCpf:           parl.cpf,
        autorNome:          parl.nome,
        autorCargo:         parl.cargo,
        autorPartido:       parl.partido,
        autorUf:            parl.uf,
      });
    }
  });

  return out;
}

function mockEmendasPorMunicipio(opts: { codigoIbge: string; uf: string; ano?: number }): PortalEmenda[] {
  // Para cada parlamentar mock, gera as emendas e filtra pelas que caem no município.
  const anos = opts.ano ? [opts.ano] : [2021, 2022, 2023, 2024, 2025];
  const out: PortalEmenda[] = [];
  MOCK_PARLAMENTARES.forEach((parl) => {
    anos.forEach((ano) => {
      const all = mockEmendasPorParlamentar({ idPortal: parl.idPortal, ano });
      all.forEach((e) => {
        if (e.codigoIbge === opts.codigoIbge) out.push(e);
      });
    });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Helpers de UI
// ---------------------------------------------------------------------------
export function formatBRL(n?: number | null): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 'R$ —';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export function formatBRLCompact(n?: number | null): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (n >= 1_000)     return `R$ ${(n / 1_000).toFixed(0)}K`;
  return `R$ ${n.toFixed(0)}`;
}
