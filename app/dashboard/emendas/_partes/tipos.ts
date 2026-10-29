'use client';

import { formatBRLCompact, type EmendaArea, type ParlamentarCargo } from '@/lib/portal-transparencia';


// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
export interface PortalEmenda {
  idPortal: string;
  ano: number;
  numero: string | null;
  tipo: string | null;
  /** Em que o dinheiro pode ser gasto — hoje só o DF preenche. */
  natureza: string | null;
  funcao: string | null;
  subfuncao: string | null;
  area: EmendaArea;
  objeto: string | null;
  valorEmpenhado: number;
  valorPago: number;
  valorRestoPago: number;
  valorProposto: number | null;
  /**
   * Emenda dividida entre vários municípios. Na lista de UMA cidade, os
   * valores acima são o pedaço dela, e estes dizem de quanto era a emenda.
   */
  municipiosNaEmenda?: number;
  valorEmpenhadoEmenda?: number;
  /** O governo do estado não publicou o valor — os zeros acima não são valor. */
  semValorPublicado?: boolean;
  /** Estadual do RJ: só o valor destinado é publicado, sem empenho nem pago. */
  soValorDestinado?: boolean;
  orgaoExecutor: string | null;
  beneficiario: string | null;
  cnpjBeneficiario: string | null;
  uf: string | null;
  codigoIbge: string | null;
  municipioNome: string | null;
  autorCpf: string | null;
  autorNome: string;
  autorCargo: ParlamentarCargo;
  autorPartido: string | null;
  autorUf: string | null;
}

export interface TransferenciaPix {
  idPortal:         string;
  ano:              number;
  mes:              number | null;
  dataReferencia:   string | null;
  valor:            number;
  uf:               string | null;
  codigoIbge:       string | null;
  municipioNome:    string | null;
  beneficiarioNome: string | null;
  cnpjBeneficiario: string | null;
  emendaIdPortal:   string | null;
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

export interface DestinoRow {
  codigoEmenda: string;
  numeroEmenda: string | null;
  tipoEmenda: string | null;
  funcao: string | null;
  nomeFavorecido: string | null;
  cnpjFavorecido: string | null;
  municipio: string | null;
  uf: string | null;
  codigoIbge: string | null;
  valorEmpenhado: number;
  valorPago: number;
  fonte: 'documento' | 'emenda';
  /** O governo do estado não publicou o valor — os zeros acima não são valor. */
  semValorPublicado?: boolean;
  /** Estadual do RJ: só o valor destinado é publicado, sem empenho nem pago. */
  soValorDestinado?: boolean;
  valorProposto?: number | null;
}

export interface EmendaNaoRealizadaLocal {
  id: string;
  parlamentarId: string;
  ano: number;
  numero: string | null;
  tipo: string | null;
  area: string | null;
  favorecido: string;
  municipio: string | null;
  uf: string | null;
  valor: number;
  observacao?: string | null;
  documentoBase64?: string | null;
  documentoNome?: string | null;
  estagio?: string | null;
  deletavel?: boolean;
  createdAt: string;
}

export interface MunicipioStats {
  codigoIbge: string;
  ano: number;
  habitantes: number | null;
  eleitores: number | null;
  tetoMac: number | null;
  tetoPap: number | null;
  fonteHabitantes: string | null;
  hasSnapshot: boolean;
}

export interface ResumoEstado {
  uf: string;
  ano: number;
  totalEmpenhado: number;
  totalPago: number;
  totalMunicipalizado: number;
  totalEstadual: number;
  totalEmendas: number;
  topMunicipios: { codigoIbge: string; nome: string; total: number; qtd: number }[];
  valorPorMunicipio: Record<string, number>;
  valorPorMunicipioNome?: Record<string, number>;
  municipiosLista?: Array<{ codigoIbge: string; nome: string }>;
  areas: { area: EmendaArea; total: number }[];
  parlamentares: { cpf: string | null; idPortal: string; nome: string; nomeUrna?: string | null; cargo: string; partido: string | null; total: number; qtd: number }[];
  mock: boolean;
  /** "banco" = dados completos do Supabase; "portal" = amostra parcial direto da API */
  fonte?: 'banco' | 'portal';
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------
export const ANOS_DISPONIVEIS = [2026, 2025, 2024, 2023, 2022, 2021];
export const ANO_PADRAO = 2026;

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
// Balão do mapa do Brasil em Emendas (fixo: não depende do estado da tela).
export const TEXTOS_BALAO_BRASIL = {
  valor: 'em emendas',
  total: 'do total no Brasil',
  semDados: 'Sem emendas',
  dica: 'Clique para ver os municípios',
  formatarValor: formatBRLCompact,
};

export interface ParlamentarPorMunicipio {
  codigoIbge: string;
  nome:       string;
  uf:         string | null;
  total:      number;
  areas:      { area: EmendaArea; valor: number }[];
}
