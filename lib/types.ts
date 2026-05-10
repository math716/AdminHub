import { UserRole, DemandStatus, DemandPriority, DemandCategory } from '@prisma/client';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  approved: boolean;
}

export interface DemandFormData {
  title: string;
  description?: string;
  solicitante: string;
  contato?: string;
  estado: string;
  municipio: string;
  bairro?: string;
  category: DemandCategory;
  status: DemandStatus;
  priority: DemandPriority;
  observations?: string;
}

export interface ElectoralData {
  candidatoId?: string;
  candidateName: string;
  nomeUrna?: string;
  numero?: number;
  ano: number;
  uf: string;
  cargo: string;
  partido: string;
  situacao?: string;
  votosMunicipio?: Array<{
    codigoMunicipio: string;
    nomeMunicipio: string;
    votos: number;
  }>;
  votosPorMunicipio?: Record<string, number>;
  votosPorNomeMunicipio?: Record<string, number>;
  votosPorEstado?: Record<string, number>;
  totalVotos: number;
  fonte?: string;
}

export const ESTADOS_BRASIL = [
  { sigla: 'AC', nome: 'Acre' },
  { sigla: 'AL', nome: 'Alagoas' },
  { sigla: 'AP', nome: 'Amapá' },
  { sigla: 'AM', nome: 'Amazonas' },
  { sigla: 'BA', nome: 'Bahia' },
  { sigla: 'CE', nome: 'Ceará' },
  { sigla: 'DF', nome: 'Distrito Federal' },
  { sigla: 'ES', nome: 'Espírito Santo' },
  { sigla: 'GO', nome: 'Goiás' },
  { sigla: 'MA', nome: 'Maranhão' },
  { sigla: 'MT', nome: 'Mato Grosso' },
  { sigla: 'MS', nome: 'Mato Grosso do Sul' },
  { sigla: 'MG', nome: 'Minas Gerais' },
  { sigla: 'PA', nome: 'Pará' },
  { sigla: 'PB', nome: 'Paraíba' },
  { sigla: 'PR', nome: 'Paraná' },
  { sigla: 'PE', nome: 'Pernambuco' },
  { sigla: 'PI', nome: 'Piauí' },
  { sigla: 'RJ', nome: 'Rio de Janeiro' },
  { sigla: 'RN', nome: 'Rio Grande do Norte' },
  { sigla: 'RS', nome: 'Rio Grande do Sul' },
  { sigla: 'RO', nome: 'Rondônia' },
  { sigla: 'RR', nome: 'Roraima' },
  { sigla: 'SC', nome: 'Santa Catarina' },
  { sigla: 'SP', nome: 'São Paulo' },
  { sigla: 'SE', nome: 'Sergipe' },
  { sigla: 'TO', nome: 'Tocantins' }
];

export const CATEGORY_LABELS: Record<DemandCategory, string> = {
  SAUDE: 'Saúde',
  EDUCACAO: 'Educação',
  INFRAESTRUTURA: 'Infraestrutura',
  ASSISTENCIA_SOCIAL: 'Assistência Social',
  SEGURANCA: 'Segurança',
  TRANSPORTE: 'Transporte',
  MEIO_AMBIENTE: 'Meio Ambiente',
  CULTURA: 'Cultura',
  ESPORTE: 'Esporte',
  OUTROS: 'Outros'
};

export const STATUS_LABELS: Record<DemandStatus, string> = {
  PENDENTE: 'Pendente',
  EM_ANDAMENTO: 'Em Andamento',
  RESOLVIDA: 'Resolvida'
};

export const PRIORITY_LABELS: Record<DemandPriority, string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta'
};

export const CATEGORY_COLORS: Record<DemandCategory, string> = {
  SAUDE:             '#F97316', // laranja
  EDUCACAO:          '#A855F7', // roxo
  INFRAESTRUTURA:    '#EAB308', // amarelo-ouro
  ASSISTENCIA_SOCIAL:'#EC4899', // rosa
  SEGURANCA:         '#6366F1', // índigo
  TRANSPORTE:        '#14B8A6', // teal
  MEIO_AMBIENTE:     '#84CC16', // lima
  CULTURA:           '#F43F5E', // rosa-coral
  ESPORTE:           '#06B6D4', // ciano
  OUTROS:            '#94A3B8'  // cinza-ardósia
};

export const STATUS_COLORS: Record<DemandStatus, string> = {
  PENDENTE: '#EF4444',
  EM_ANDAMENTO: '#2196F3',
  RESOLVIDA: '#4CAF50'
};

export const PRIORITY_COLORS: Record<DemandPriority, string> = {
  BAIXA: '#4CAF50',
  MEDIA: '#FFC107',
  ALTA: '#F44336'
};
