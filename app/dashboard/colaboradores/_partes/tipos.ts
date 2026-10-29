'use client';




// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ColaboradorRegiao {
  id: string;
  regiaoNome: string;
  uf: string;
  tipo: string; // 'RA' | 'ZONA'
}

export interface Colaborador {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  lat: number | null;
  lng: number | null;
  funcao: string | null;
  padrinhoId: string | null;
  padrinho: { id: string; nome: string; cargo: string; partido: string } | null;
  observacao: string | null;
  status: 'ATIVO' | 'INATIVO';
  regioes: ColaboradorRegiao[];
  createdAt: string;
}

export interface Padrinho {
  id: string;
  nome: string;
  cargo: string;
  partido: string;
  cor?: string;
  _count: { colaboradores: number };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
export const DF_ZONAS = [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21];

// Approximate geographic centers of each DF electoral zone
export const DF_ZONA_COORDS: Record<number, [number, number]> = {
  1:  [-15.7941, -47.8822],  // Plano Piloto / Asa Sul
  2:  [-15.7229, -47.8816],  // Asa Norte / Lago Norte
  3:  [-15.7942, -47.9372],  // Cruzeiro / Sudoeste
  4:  [-15.8316, -48.0554],  // Taguatinga
  5:  [-15.8150, -48.1005],  // Ceilândia Norte
  6:  [-15.8501, -48.1009],  // Ceilândia Sul
  8:  [-15.8831, -48.0810],  // Samambaia
  9:  [-15.8600, -47.9850],  // Lago Sul / Riacho Fundo
  10: [-15.8314, -47.9813],  // Guará
  11: [-16.0202, -48.0196],  // Santa Maria
  13: [-15.6189, -47.6540],  // Planaltina
  14: [-15.6524, -47.7910],  // Sobradinho
  15: [-16.0177, -48.0629],  // Gama
  16: [-15.6731, -48.2038],  // Brazlândia
  17: [-15.9112, -48.0609],  // Recanto das Emas
  18: [-15.9098, -47.8028],  // São Sebastião
  19: [-15.7672, -47.7540],  // Paranoá / Itapoã
  20: [-15.8400, -48.0272],  // Águas Claras / Vicente Pires
  21: [-15.7494, -47.9300],  // Estrutural / Varjão
};

export const DF_ZONA_NOMES: Record<number, string> = {
  1:  'Plano Piloto / Asa Sul',
  2:  'Asa Norte / Lago Norte',
  3:  'Cruzeiro / Sudoeste',
  4:  'Taguatinga',
  5:  'Ceilândia Norte',
  6:  'Ceilândia Sul',
  8:  'Samambaia',
  9:  'Lago Sul / Riacho Fundo',
  10: 'Guará',
  11: 'Santa Maria',
  13: 'Planaltina',
  14: 'Sobradinho',
  15: 'Gama',
  16: 'Brazlândia',
  17: 'Recanto das Emas',
  18: 'São Sebastião',
  19: 'Paranoá / Itapoã',
  20: 'Águas Claras / Vicente Pires',
  21: 'Estrutural / Varjão',
};

export function getZoneMarkerHtml(zona: number, count: number, isSelected: boolean): string {
  const size = 36;
  const bg = isSelected
    ? 'linear-gradient(135deg,#6d28d9,#a78bfa)'
    : count === 0
      ? 'rgba(109,40,217,0.52)'
      : 'linear-gradient(135deg,#6d28d9,#8b5cf6)';
  const border = isSelected ? '#c4b5fd' : count === 0 ? 'rgba(167,139,250,0.55)' : '#a78bfa';
  return `<div style="
    width:${size}px;height:${size}px;border-radius:50%;
    background:${bg};border:2px solid ${border};
    display:flex;align-items:center;justify-content:center;
    color:#fff;font-weight:700;font-size:11px;font-family:system-ui,sans-serif;
    box-shadow:0 2px 8px rgba(0,0,0,0.28);cursor:pointer;
    transform:translate(-50%,-50%);
  ">${zona}</div>`;
}

export const FUNCOES = [
  { value: '', label: 'Sem função definida' },
  { value: 'Coordenador Geral', label: 'Coordenador Geral' },
  { value: 'Coordenador Regional', label: 'Coordenador Regional' },
  { value: 'Líder de Bairro', label: 'Líder de Bairro' },
  { value: 'Voluntário', label: 'Voluntário' },
];

export const EMPTY_FORM = {
  nome: '',
  telefone: '',
  email: '',
  endereco: '',
  funcao: '',
  padrinhoId: '',
  observacao: '',
  status: 'ATIVO' as 'ATIVO' | 'INATIVO',
  cor: '#8b5cf6',
  regioes: [] as string[], // RA names
  zonas: [] as string[],   // zone numbers as strings e.g. ['1', '3']
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export function normStr(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

export function normalizeRegiao(nome: string): string {
  return nome.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

// RAs oficiais do DF (normalizadas) — usadas para filtrar contagem no stat card
export const DF_RAS_OFICIAIS = new Set([
  'PLANO PILOTO','BRASILIA','ASA SUL','ASA NORTE','LAGO SUL','LAGO NORTE',
  'CRUZEIRO','SUDOESTE','OCTOGONAL','SUDOESTE E OCTOGONAL',
  'TAGUATINGA','CEILANDIA','CEILANDIA NORTE','CEILANDIA SUL',
  'SAMAMBAIA','NUCLEO BANDEIRANTE','RIACHO FUNDO','RIACHO FUNDO II',
  'GUARA','PARK WAY','SIA','SANTA MARIA',
  'PLANALTINA','ARAPOANGA','FERCAL',
  'SOBRADINHO','SOBRADINHO II','GAMA','BRAZLANDIA',
  'RECANTO DAS EMAS','SAO SEBASTIAO','JARDIM BOTANICO',
  'SOL NASCENTE','SOL NASCENTE/POR DO SOL',
  'PARANOA','ITAPOA','AGUAS CLARAS','VICENTE PIRES',
  'ESTRUTURAL','SCIA','VARJAO','CANDANGOLANDIA',
]);

// ---------------------------------------------------------------------------
// CSV / XLSX helpers
// ---------------------------------------------------------------------------
export function parseCsvText(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { current += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        result.push(current.trim()); current = '';
      } else current += ch;
    }
    result.push(current.trim());
    return result;
  };
  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).filter(l => l.trim()).map(line => {
    const values = parseRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row;
  });
  return { headers, rows };
}

export interface DetectedColabCols {
  nome: string;
  telefone: string;
  email: string;
  endereco: string;
  funcao: string;
  observacao: string;
  regioes: string;
  padrinho: string;
}

export function detectColabColumns(headers: string[]): DetectedColabCols {
  const result: DetectedColabCols = { nome: '', telefone: '', email: '', endereco: '', funcao: '', observacao: '', regioes: '', padrinho: '' };
  for (const h of headers) {
    const n = normStr(h);
    if (!result.nome && /nome|name/.test(n)) result.nome = h;
    else if (!result.telefone && /telefone|celular|whatsapp|fone|phone/.test(n)) result.telefone = h;
    else if (!result.email && /email/.test(n)) result.email = h;
    else if (!result.endereco && /endereco|rua|logradouro|address/.test(n)) result.endereco = h;
    else if (!result.funcao && /funcao|cargo|role|funcoes/.test(n)) result.funcao = h;
    else if (!result.observacao && /observacao|obs|notas|notes|apelido|alcunha|alias/.test(n)) result.observacao = h;
    else if (!result.regioes && /regiao|regioes|region|regions|\bra\b|cidade|city/.test(n)) result.regioes = h;
    else if (!result.padrinho && /padrinho|apadrinhado|sponsor|godfather/.test(n)) result.padrinho = h;
  }
  return result;
}
