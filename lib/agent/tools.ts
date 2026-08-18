import type { Tool } from '@anthropic-ai/sdk/resources/messages';

export const AGENT_TOOLS: Tool[] = [
  {
    name: 'buscar_emendas',
    description:
      'Busca emendas parlamentares no banco de dados. Retorna lista com valor empenhado, pago e percentual de execução. ' +
      'Use sempre que o usuário perguntar sobre emendas, repasses, transferências ou gastos de parlamentares.',
    input_schema: {
      type: 'object' as const,
      properties: {
        parlamentar_nome: {
          type: 'string',
          description: 'Nome ou parte do nome do parlamentar (busca parcial, sem acento).',
        },
        uf: {
          type: 'string',
          description: 'Sigla do estado (ex: DF, SP, MG). Dois caracteres maiúsculos.',
        },
        municipio: {
          type: 'string',
          description: 'Nome do município destinatário (busca parcial).',
        },
        area: {
          type: 'string',
          enum: ['SAUDE', 'EDUCACAO', 'SEGURANCA', 'INFRAESTRUTURA', 'ASSISTENCIA_SOCIAL',
                 'AGRICULTURA', 'CULTURA', 'ESPORTE', 'MEIO_AMBIENTE', 'TRANSPORTE',
                 'HABITACAO', 'SANEAMENTO', 'OUTROS'],
          description: 'Área temática da emenda.',
        },
        ano: {
          type: 'integer',
          description: 'Ano de competência da emenda (ex: 2023).',
        },
        esfera: {
          type: 'string',
          enum: ['FEDERAL', 'ESTADUAL'],
          description: 'Esfera orçamentária.',
        },
      },
      required: [],
    },
  },

  {
    name: 'buscar_votacao',
    description:
      'Busca resultados eleitorais. Retorna votos totais e por município. ' +
      'Se "candidato_nome" for OMITIDO, retorna TODOS os candidatos daquele cargo/UF/ano (com a contagem ' +
      'total de candidatos) — use assim para "comparar todos os candidatos", "quantos candidatos houve" ou ' +
      '"teve 2º turno" (o 2º turno ocorre quando o líder tem menos de 50% dos votos válidos). ' +
      'Ao informar "municipio", retorna também a quebra por ZONA ELEITORAL daquele município, ' +
      'com os bairros que cada zona cobre (útil para eleições municipais). ' +
      'Use para perguntas sobre desempenho eleitoral, comparação de votação ou distribuição geográfica de votos.',
    input_schema: {
      type: 'object' as const,
      properties: {
        candidato_nome: {
          type: 'string',
          description: 'Nome ou parte do nome do candidato (busca parcial). OPCIONAL — omita para listar todos os candidatos do cargo/UF/ano.',
        },
        ano: {
          type: 'integer',
          description: 'Ano da eleição (ex: 2022, 2020, 2018).',
        },
        uf: {
          type: 'string',
          description: 'Sigla do estado (ex: DF, SP).',
        },
        municipio: {
          type: 'string',
          description:
            'Nome do município. Ao informar, o retorno inclui a quebra de votos por ZONA ELEITORAL ' +
            'desse município (campo votosPorZona), com os bairros que cada zona cobre. ' +
            'Use quando o usuário pedir votos por bairro/zona em eleições municipais.',
        },
        cargo: {
          type: 'string',
          description: 'Cargo disputado (ex: DEPUTADO_FEDERAL, DEPUTADO_ESTADUAL, SENADOR, GOVERNADOR, PREFEITO, VEREADOR). Obrigatório quando o nome do candidato não é informado.',
        },
      },
      required: [],
    },
  },

  {
    name: 'comparar_parlamentares',
    description:
      'Compara emendas parlamentares de dois ou mais parlamentares lado a lado. ' +
      'Retorna totais empenhados, pagos e execução por parlamentar. ' +
      'Use quando o usuário quiser comparar desempenho entre parlamentares.',
    input_schema: {
      type: 'object' as const,
      properties: {
        parlamentares: {
          type: 'array',
          items: { type: 'string' },
          description: 'Lista com 2 a 5 nomes de parlamentares para comparar.',
        },
        ano: {
          type: 'integer',
          description: 'Ano de referência (opcional — omitir para todos os anos).',
        },
        uf: {
          type: 'string',
          description: 'Filtrar emendas de um estado específico.',
        },
      },
      required: ['parlamentares'],
    },
  },

  {
    name: 'dados_municipio',
    description:
      'Retorna dados estatísticos de um município: população, eleitores e tetos de saúde MAC/PAP. ' +
      'Use para perguntas sobre perfil, tamanho ou capacidade instalada de saúde de um município.',
    input_schema: {
      type: 'object' as const,
      properties: {
        municipio: {
          type: 'string',
          description: 'Nome do município (busca parcial).',
        },
        uf: {
          type: 'string',
          description: 'Sigla do estado para desambiguar municípios com mesmo nome.',
        },
        ano: {
          type: 'integer',
          description: 'Ano de referência. Se omitido, retorna o mais recente disponível.',
        },
      },
      required: ['municipio'],
    },
  },

  {
    name: 'buscar_demandas',
    description:
      'Busca demandas do gabinete do usuário logado — SEMPRE escopado ao gabinete do usuário, nunca retorna dados de outros gabinetes. ' +
      'Use para perguntas sobre volume de atendimentos, pendências ou status das demandas.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          enum: ['PENDENTE', 'EM_ANDAMENTO', 'RESOLVIDA'],
          description: 'Filtrar por status da demanda.',
        },
        categoria: {
          type: 'string',
          enum: ['SAUDE', 'EDUCACAO', 'INFRAESTRUTURA', 'ASSISTENCIA_SOCIAL',
                 'SEGURANCA', 'TRANSPORTE', 'MEIO_AMBIENTE', 'CULTURA', 'ESPORTE', 'OUTROS'],
          description: 'Filtrar por categoria.',
        },
        prioridade: {
          type: 'string',
          enum: ['BAIXA', 'MEDIA', 'ALTA'],
          description: 'Filtrar por prioridade.',
        },
        municipio: {
          type: 'string',
          description: 'Filtrar por município da demanda.',
        },
      },
      required: [],
    },
  },

  {
    name: 'gerar_relatorio_territorial',
    description:
      'Prepara um RELATÓRIO TERRITORIAL eleitoral por Região Administrativa (RA) do DF, para um ou mais deputados. ' +
      'Use SEMPRE que o usuário pedir: "relatório territorial", análise por região administrativa, redutos/força por RA, ' +
      'ou quando ele COLAR um roteiro/script listando deputados distritais do DF para analisar por território. ' +
      'Esta ferramenta apenas valida os nomes e prepara o relatório — a plataforma então exibe um botão para gerar o PDF completo ' +
      '(RA com mais votos, RA de maior domínio proporcional, top 5 regiões, concentração, redutos, regiões fracas e o mapa do DF por RA). ' +
      'Não a use para consultas simples de votação (para isso, use buscar_votacao).',
    input_schema: {
      type: 'object' as const,
      properties: {
        deputados: {
          type: 'array',
          items: { type: 'string' },
          description: 'Lista de nomes dos deputados a analisar (um ou mais). Extraia todos os nomes citados no pedido do usuário.',
        },
        ano: {
          type: 'integer',
          description: 'Ano da eleição (padrão 2022, se não informado).',
        },
        uf: {
          type: 'string',
          description: 'Sigla do estado. Atualmente disponível para DF (padrão).',
        },
        cargo: {
          type: 'string',
          description: 'Cargo disputado (padrão "Deputado Distrital").',
        },
      },
      required: ['deputados'],
    },
  },

  {
    name: 'gerar_visualizacao',
    description:
      'Formata dados para renderização visual no frontend (gráficos, cards de KPI, tabelas). ' +
      'Chamar APÓS obter dados reais de outras ferramentas. Nunca chame antes de ter os dados. ' +
      'Não consulta o banco — apenas estrutura o payload de visualização.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tipo: {
          type: 'string',
          enum: ['barras', 'donut', 'serie_temporal', 'cards_kpi', 'tabela'],
          description:
            'barras: comparação entre categorias | donut: distribuição percentual | ' +
            'serie_temporal: evolução ao longo do tempo | cards_kpi: métricas em destaque | ' +
            'tabela: lista detalhada de registros.',
        },
        titulo: {
          type: 'string',
          description: 'Título da visualização exibido ao usuário.',
        },
        dados: {
          type: 'object',
          description:
            'Dados estruturados da visualização. ' +
            'Para "barras" / "donut": { itens: [{ label, valor, cor? }] }. ' +
            'Para "serie_temporal": { pontos: [{ data, valor }] }. ' +
            'Para "cards_kpi": { cards: [{ label, valor, unidade?, variacao? }] }. ' +
            'Para "tabela": { colunas: string[], linhas: any[][] }.',
        },
      },
      required: ['tipo', 'dados'],
    },
  },
];
