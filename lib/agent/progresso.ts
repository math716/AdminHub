/**
 * O que a Gabi está fazendo, dito em português de gente.
 *
 * Um pedido com vários itens leva dezenas de segundos e, até aqui, a tela ficava
 * parada o tempo todo — sem diferença visível entre "está trabalhando" e
 * "travou". Estas frases acompanham o que ela realmente faz a cada passo.
 *
 * Regra ao escrever frase nova: quem lê é assessor de gabinete, não programador.
 * Nada de "executando ferramenta", "consultando endpoint" ou nome de função.
 */

/**
 * "MARCOS PONTES" → "Marcos Pontes"; "sao paulo" → "São Paulo" não, mas
 * "Sao Paulo" sim — acento perdido na origem não se inventa aqui.
 *
 * Cada palavra ganha maiúscula, menos as partículas dos nomes brasileiros, que
 * ficariam esquisitas ("Maria Da Silva"). A primeira palavra é sempre
 * maiúscula, mesmo sendo partícula.
 */
const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du', 'del', 'la']);

function capitalizar(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((p, i) => (i > 0 && PARTICULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

/** Texto curto vindo dos argumentos da busca, para a frase dizer DE QUE se trata. */
function alvo(args: Record<string, unknown>): string {
  const p = (args.parlamentar ?? args.nome ?? args.candidato) as string | undefined;
  if (p && String(p).trim()) return capitalizar(String(p).trim().toLowerCase());

  const m = args.municipio as string | undefined;
  if (m && String(m).trim()) return capitalizar(String(m).trim().toLowerCase());

  const uf = args.uf as string | undefined;
  if (uf && String(uf).trim()) return String(uf).trim().toUpperCase();

  return '';
}

const ANOS = (args: Record<string, unknown>): string => {
  const a = args.anos ?? args.ano;
  if (Array.isArray(a) && a.length > 0) return ` (${a.join(' e ')})`;
  if (a) return ` (${a})`;
  return '';
};

/**
 * Frase para uma busca que está começando. Recebe o nome interno da ferramenta
 * e o que foi pedido a ela.
 */
export function fraseDaBusca(ferramenta: string, args: Record<string, unknown> = {}): string {
  const onde = alvo(args);
  const de = onde ? ` de ${onde}` : '';

  switch (ferramenta) {
    case 'buscar_emendas':
      return `Procurando emendas${de}${ANOS(args)}`;
    case 'comparar_parlamentares':
      return 'Comparando os parlamentares';
    case 'buscar_votacao':
      return `Consultando a votação${de}${ANOS(args)}`;
    case 'ranking_nacional':
      return `Levantando os dados dos 27 estados${ANOS(args)}`;
    case 'dados_municipio':
      return `Buscando os dados${de || ' do município'}`;
    case 'buscar_demandas':
      return 'Olhando as demandas do gabinete';
    case 'buscar_agenda':
      return 'Olhando a agenda do gabinete';
    case 'buscar_contatos':
      return 'Olhando a base de contatos';
    case 'localizar_parlamentar':
      return `Localizando${de || ' o parlamentar'}`;
    case 'gerar_relatorio_territorial':
      return 'Preparando o relatório por região';
    case 'gerar_visualizacao':
      return 'Montando os gráficos';
    default:
      // Ferramenta nova sem frase própria: melhor uma frase honesta e vaga do
      // que expor o nome interno na tela de quem não programa.
      return 'Buscando os dados';
  }
}

/** Frases das etapas que não são busca. */
export const FRASES = {
  inicio:     'Entendendo o pedido',
  analisando: 'Analisando o que encontrei',
  buscandoMais: 'Preciso de mais alguns dados',
  escrevendo: 'Escrevendo a resposta',
  graficos:   'Montando os gráficos',
} as const;
