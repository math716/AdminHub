'use client';




export type CenarioType = 'conservador' | 'possivel' | 'arrojado';
export type FiltroTipo = 'todos' | 'com_dobrada' | 'sem_dobrada' | 'parcerias';
export type VisualizacaoMapa = 'municipio' | 'zona' | 'bairro';

export type TipoParceria = 'ONG' | 'IGREJA' | 'ASSOCIACAO' | 'LIDERANCA' | 'ORGAO_POLITICO' | 'EMPRESA' | 'TRANSPORTE' | 'SINDICATO' | 'COOPERATIVA' | 'GRUPO_ORGANIZADO' | 'OUTRO';

export const TIPO_PARCERIA_LABELS: Record<TipoParceria, string> = {
  ONG: 'ONG',
  IGREJA: 'Igreja',
  ASSOCIACAO: 'Associação',
  LIDERANCA: 'Liderança Comunitária',
  ORGAO_POLITICO: 'Órgão Político',
  EMPRESA: 'Empresa',
  TRANSPORTE: 'Transporte',
  SINDICATO: 'Sindicato',
  COOPERATIVA: 'Cooperativa',
  GRUPO_ORGANIZADO: 'Grupo Organizado',
  OUTRO: 'Outro'
};

export interface Parceria {
  id?: string;
  projecaoMunicipioId: string;
  // Nulavel no banco, entao a API devolve `null` — nao `undefined`. O tipo
  // dizia `string | undefined` e so nao quebrava porque o erro ia ignorado
  // no build. Quem escrevesse `=== undefined` aqui erraria em silencio.
  bairro?: string | null;
  municipio?: string;
  nome: string;
  tipo: TipoParceria;
  responsavel?: string | null;
  contato?: string | null;
  observacoes?: string | null;
  impactoEstimado: number;
  metaConservadora: number;
  metaPossivel: number;
  metaArrojada: number;
  ativa: boolean;
  // Vem da API em toda parceria gravada; faltava no tipo.
  createdAt?: string;
  updatedAt?: string;
}

export interface ParceriasStats {
  total: number;
  ativas: number;
  impactoTotal: number;
  metaConservadoraTotal: number;
  metaPossivelTotal: number;
  metaArrojadaTotal: number;
  porTipo: Record<string, number>;
  municipiosComParcerias: number;
}

export interface CandidatoMultiplo {
  id: string;
  nome: string;
  nomeUrna: string;
  numero: number;
  partido: string;
  cargo: string;
  ano: number;
  totalVotos: number;
  municipioPrincipal: string;
  municipioCandidatura: string;
}

export interface ProjecaoMunicipio {
  id?: string;
  municipio: string;
  votosBase: number;
  metaConservadora: number;
  metaPossivel: number;
  metaArrojada: number;
  observacoes?: string;
  prioridade?: string;
  dobradaAtiva?: boolean;
  dobradaNome?: string;
  dobradaPartido?: string;
  dobradaObservacoes?: string;
  parcerias?: Parceria[];
  /** Soma das parcerias deste município (só na lista de projeções salvas). */
  parceriasSoma?: { conservadora: number; possivel: number; arrojada: number };
}

export interface Projecao {
  id: string;
  candidatoNome: string;
  anoBase: number;
  anoProjecao: number;
  uf: string;
  cargo?: string;
  municipios: ProjecaoMunicipio[];
}

export interface ElectoralData {
  candidatoId?: string;
  candidateName?: string;
  nome?: string;
  nomeUrna?: string;
  numero?: number;
  partido: string;
  cargo: string;
  totalVotos: number;
  uf: string;
  situacao?: string;
  votosPorMunicipio?: Record<string, number>;
  votosPorNomeMunicipio?: Record<string, number>;
  votosPorEstado?: Record<string, number>;
  zonas?: Array<{ municipio: string; zona: number; votos: number }>;
}

export interface VotoZona {
  zona: number;
  votos: number;
}

export interface BairroInfo {
  municipio: string;
  bairro: string;
  votos: number;
  zonas: number[];
  locais: Array<{
    nome: string;
    endereco: string;
    latitude: number | null;
    longitude: number | null;
  }>;
}

/**
 * Próxima eleição (ainda por vir) do mesmo tipo do ano-base: municipal
 * (2020, 2024, 2028…) ou geral (2018, 2022, 2026…). A partir de outubro a
 * eleição do ano corrente conta como passada.
 */
export function proximaEleicao(anoBase: number): number {
  const hoje = new Date();
  const limite = hoje.getMonth() >= 9 ? hoje.getFullYear() + 1 : hoje.getFullYear();
  let ano = anoBase + 4;
  while (ano < limite) ano += 4;
  return ano;
}

/** Anos que um candidato novo pode disputar: as duas próximas eleições do cargo. */
export function anosNovoCandidato(cargo: string): string[] {
  const municipal = cargo === 'PREFEITO' || cargo === 'VEREADOR';
  const proxima = proximaEleicao(municipal ? 2020 : 2018);
  return [String(proxima), String(proxima + 4)];
}
