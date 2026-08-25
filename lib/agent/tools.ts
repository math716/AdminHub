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
      'Para a BANCADA ELEITA ("os deputados eleitos", "os 70 da ALERJ", "ranking dos eleitos"), ' +
      'passe apenas_eleitos=true e limite com o tamanho da bancada (ex.: 80) — sem isso vêm só os ' +
      '12 mais votados, incluindo não eleitos. É também a ferramenta certa para COMPARAR VOTAÇÃO ' +
      'entre vários candidatos (comparar_parlamentares é só para emendas). ' +
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
          description:
            'Sigla do estado (ex: DF, SP). OBRIGATÓRIA para cargos estaduais e municipais — sem a UF ' +
            'o candidato NÃO é encontrado (a base nacional cobre apenas a eleição presidencial). ' +
            'Deduza do contexto ou pergunte ao usuário antes de buscar.',
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
        apenas_eleitos: {
          type: 'boolean',
          description:
            'True para trazer somente quem FOI ELEITO (eleito por quociente partidário ou por média), ' +
            'excluindo suplentes e não eleitos. Use sempre que o pedido falar em "eleitos", "bancada", ' +
            '"quem assumiu" ou citar o tamanho da casa legislativa.',
        },
        limite: {
          type: 'integer',
          description:
            'Quantos candidatos retornar quando o nome é omitido (padrão 12, teto 80). Para uma ' +
            'bancada inteira use o tamanho dela (ex.: 70 deputados estaduais no RJ → limite 80).',
        },
      },
      required: [],
    },
  },

  {
    name: 'comparar_parlamentares',
    description:
      'Compara EMENDAS PARLAMENTARES (orçamento) de dois ou mais parlamentares lado a lado. ' +
      'Retorna totais empenhados, pagos e execução por parlamentar. ' +
      'Use SOMENTE quando a comparação for sobre emendas/verbas/repasses/execução orçamentária. ' +
      'NÃO use para comparar VOTAÇÃO, desempenho eleitoral, redutos ou ranking de votos — ' +
      'para isso use `buscar_votacao`. Se o usuário pediu "compare esses candidatos" logo após ' +
      'uma consulta de VOTOS, ele quer comparar VOTOS: mantenha o assunto em buscar_votacao e ' +
      'só use esta ferramenta se ele mencionar emendas explicitamente.',
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
    name: 'buscar_agenda',
    description:
      'Busca os compromissos da AGENDA do gabinete do usuário logado (reuniões, visitas, eventos) — ' +
      'SEMPRE escopado ao gabinete do usuário, nunca retorna dados de outros gabinetes. ' +
      'Use para "minha agenda", "compromissos", "reuniões", "relatório de agenda", "o que tenho ' +
      'marcado", "quantos eventos participei", agenda de um período/ano/mês ou por tipo. ' +
      'Retorna o total real, a contagem por tipo e por mês, e a lista dos compromissos.',
    input_schema: {
      type: 'object' as const,
      properties: {
        ano: {
          type: 'integer',
          description: 'Ano dos compromissos (ex.: 2026). Use o ano corrente para "este ano".',
        },
        mes: {
          type: 'integer',
          description: 'Mês (1 a 12), combinado com "ano". Omita para o ano inteiro.',
        },
        data_inicio: {
          type: 'string',
          description: 'Início do período no formato AAAA-MM-DD (alternativa a ano/mês).',
        },
        data_fim: {
          type: 'string',
          description: 'Fim do período no formato AAAA-MM-DD.',
        },
        tipo: {
          type: 'string',
          enum: ['REUNIAO', 'VISITA', 'EVENTO', 'COMPROMISSO'],
          description: 'Filtrar por tipo de compromisso.',
        },
        local: {
          type: 'string',
          description: 'Filtrar por local ou endereço (busca parcial).',
        },
        apenas_futuros: {
          type: 'boolean',
          description: 'True para trazer apenas compromissos a partir de hoje (agenda que vem pela frente).',
        },
      },
      required: [],
    },
  },

  {
    name: 'buscar_contatos',
    description:
      'Busca a base de CONTATOS do gabinete do usuário logado — SEMPRE escopada ao gabinete do ' +
      'usuário, nunca retorna dados de outros gabinetes. Use para "meus contatos", "quantos ' +
      'contatos tenho", "procure o contato do fulano", "base de contatos", lideranças cadastradas. ' +
      'Retorna o total real, um resumo da base (quantos têm e-mail e localização) e a lista.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nome: {
          type: 'string',
          description: 'Nome (ou parte) do contato procurado.',
        },
        termo: {
          type: 'string',
          description: 'Busca livre por nome, e-mail, telefone ou endereço.',
        },
        com_email: {
          type: 'boolean',
          description: 'True para trazer apenas contatos que têm e-mail cadastrado.',
        },
        com_localizacao: {
          type: 'boolean',
          description: 'True para trazer apenas contatos com endereço geolocalizado (aparecem no mapa).',
        },
      },
      required: [],
    },
  },

  {
    name: 'localizar_parlamentar',
    description:
      'Descobre ONDE uma pessoa aparece nas bases: nome de urna, cargo, UF, partido, anos de eleição ' +
      'e anos com emendas. Use ANTES de buscar quando o pedido estiver incompleto ou impreciso — ' +
      'nome parcial ou com título ("Dr.", "Delegado"), sem UF, sem ano, sem cargo, ou quando uma busca ' +
      'anterior não encontrou nada. É a forma correta de resolver ambiguidade: localize primeiro, ' +
      'depois refaça a busca certa com os dados retornados. Não peça ao usuário informações que esta ' +
      'ferramenta pode descobrir sozinha.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nome: {
          type: 'string',
          description: 'Nome (mesmo parcial ou com título) da pessoa a localizar.',
        },
        uf: {
          type: 'string',
          description: 'Sigla do estado, se conhecida. Acelera a busca eleitoral; se omitida, é inferida da base de emendas.',
        },
      },
      required: ['nome'],
    },
  },

  {
    name: 'gerar_relatorio_territorial',
    description:
      'Prepara um RELATÓRIO TERRITORIAL eleitoral por Região Administrativa (RA) do DF, para um ou mais parlamentares: ' +
      'deputados DISTRITAIS, deputados FEDERAIS ou SENADORES do DF (a ferramenta detecta o cargo automaticamente). ' +
      'Para SENADORES ela varre as DUAS eleições da renovação alternada (2018 e 2022) e acha a bancada inteira — ' +
      'basta passar cargo="Senador" e os nomes. É a ferramenta certa sempre que pedirem "top 5 RAs", ' +
      '"regiões com mais votos" ou "mapa de calor dos votos" no DF: buscar_votacao devolve ZONA ELEITORAL, não RA. ' +
      'Use SEMPRE que o usuário pedir: "relatório territorial", análise por região administrativa, redutos/força por RA, ' +
      'ou quando ele COLAR um roteiro/script listando deputados do DF para analisar por território. ' +
      'Esta ferramenta apenas valida os nomes e prepara o relatório — a plataforma então exibe um botão para gerar o PDF completo ' +
      '(RA com mais votos, RA de maior domínio proporcional, top 5 regiões, concentração, redutos, regiões fracas e o mapa do DF por RA). ' +
      'Não a use para consultas simples de votação (para isso, use buscar_votacao).',
    input_schema: {
      type: 'object' as const,
      properties: {
        deputados: {
          type: 'array',
          items: { type: 'string' },
          description: 'Lista de nomes dos parlamentares a analisar (um ou mais). Extraia todos os nomes citados no pedido do usuário.',
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
          description: 'Cargo disputado: "Deputado Distrital" (padrão), "Deputado Federal" ou "Senador".',
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
