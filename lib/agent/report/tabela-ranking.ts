// Tabela completa de um ranking nacional, montada por código.
//
// Por que não deixar a Gabi escrever: pedido "os 5 senadores mais bem votados
// desde 2018 por cada estado", ela recebeu os 27 estados (o próprio texto dela
// dizia "27 unidades federativas, 518 candidatos analisados") e publicou uma
// tabela com 3 estados e 2 colocações. O resto virou prosa. Quem pediu a tabela
// ficou sem 24 estados.
//
// O dado já chega inteiro aqui. Montar a tabela em código tira a escolha do
// meio do caminho: a análise continua sendo dela, a tabela é sempre completa.

/** Um candidato como `ranking_nacional` o devolve. */
interface CandidatoRanking {
  nomeUrna?: string;
  nome?: string;
  partido?: string;
  totalVotos?: number;
  situacao?: string;
  ano?: string | number;
}

export interface RankingNacional {
  porEstado?: Record<string, CandidatoRanking[]>;
  recorte?: string;
  anosUsados?: string[];
}

// Regiões só para agrupar: tabelas de 3 a 9 linhas quebram melhor entre páginas
// do que uma de 27, e a leitura por região é a que o gabinete usa.
const REGIOES: Array<{ nome: string; ufs: string[] }> = [
  { nome: 'Norte',        ufs: ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO'] },
  { nome: 'Nordeste',     ufs: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'] },
  { nome: 'Centro-Oeste', ufs: ['DF', 'GO', 'MS', 'MT'] },
  { nome: 'Sudeste',      ufs: ['ES', 'MG', 'RJ', 'SP'] },
  { nome: 'Sul',          ufs: ['PR', 'RS', 'SC'] },
];

/**
 * Quantas colocações cabem lado a lado numa tabela. Acima disso a célula fica
 * estreita demais e o texto quebra em três linhas.
 *
 * NÃO é um teto de dados. Pedindo 10 por estado, saem duas tabelas — 1º ao 5º
 * e 6º ao 10º —, cada uma com os 27 estados. A ferramenta entrega até 15 por
 * estado, e as 15 saem. Cortar colocação para caber na página seria resolver o
 * layout às custas do que foi pedido.
 */
const COLOCACOES_POR_TABELA = 5;

const fmtVotos = (n: unknown): string => {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString('pt-BR') : '—';
};

/** "Marcos Pontes (PL) 10.714.913 · 2022" — nome, partido, votos e ano, que é
 *  o mínimo para a linha significar alguma coisa quando o recorte junta dois
 *  pleitos e a mesma pessoa aparece nos dois. */
function celula(c: CandidatoRanking | undefined): string {
  if (!c) return '—';
  const nome = (c.nomeUrna || c.nome || '').trim() || '—';
  const partido = (c.partido ?? '').trim();
  const ano = String(c.ano ?? '').trim();
  return [
    partido ? `${nome} (${partido})` : nome,
    fmtVotos(c.totalVotos),
    ano,
  ].filter(Boolean).join(' · ');
}

/** Siglas que já aparecem como primeira coluna de alguma tabela do texto dela.
 *  Serve para não repetir uma tabela que ela já tenha escrito por inteiro. */
function ufsJaTabeladas(conteudo: string): Set<string> {
  const achadas = new Set<string>();
  for (const linha of conteudo.split('\n')) {
    const t = linha.trim();
    if (!t.startsWith('|')) continue;
    const primeira = (t.split('|')[1] ?? '').replace(/\*/g, '').trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(primeira)) achadas.add(primeira);
  }
  return achadas;
}

/**
 * Markdown da tabela completa, ou `null` quando não há o que acrescentar —
 * sem ranking, ou porque o texto dela já traz todos os estados.
 */
export function tabelaCompletaRanking(rk: RankingNacional | undefined, conteudo = ''): string | null {
  const porEstado = rk?.porEstado;
  if (!porEstado) return null;

  const ufsComDado = Object.keys(porEstado).filter(uf => (porEstado[uf] ?? []).length > 0);
  if (ufsComDado.length === 0) return null;

  // Ela já tabelou tudo: não repetir.
  const jaTem = ufsJaTabeladas(conteudo);
  const cobertos = ufsComDado.filter(uf => jaTem.has(uf)).length;
  if (cobertos >= ufsComDado.length) return null;

  const colocacoes = Math.max(...ufsComDado.map(uf => porEstado[uf].length));
  if (colocacoes < 1) return null;

  // As colocações em faixas de no máximo COLOCACOES_POR_TABELA: [0..4], [5..9]…
  const faixas: Array<{ de: number; ate: number }> = [];
  for (let k = 0; k < colocacoes; k += COLOCACOES_POR_TABELA) {
    faixas.push({ de: k, ate: Math.min(k + COLOCACOES_POR_TABELA, colocacoes) });
  }

  const partes: string[] = [];
  partes.push('');
  partes.push(`## Todos os estados — ${colocacoes} mais votados`);
  partes.push('');

  const tabela = (ufs: string[], faixa: { de: number; ate: number }) => {
    const cab = ['UF', ...Array.from({ length: faixa.ate - faixa.de }, (_, i) => `${faixa.de + i + 1}º`)];
    partes.push(`| ${cab.join(' | ')} |`);
    partes.push(`|${cab.map(() => '---').join('|')}|`);
    for (const uf of ufs) {
      const lista = porEstado[uf] ?? [];
      const celulas = Array.from({ length: faixa.ate - faixa.de }, (_, i) => celula(lista[faixa.de + i]));
      partes.push(`| ${uf} | ${celulas.join(' | ')} |`);
    }
    partes.push('');
  };

  const bloco = (rotulo: string, ufs: string[]) => {
    for (const faixa of faixas) {
      // Com mais de uma faixa, o rótulo diz de qual pedaço é cada tabela —
      // senão ficam cinco tabelas iguais por região, sem dizer o que são.
      const sufixo = faixas.length > 1 ? ` — ${faixa.de + 1}º ao ${faixa.ate}º` : '';
      partes.push(`**${rotulo}${sufixo}**`);
      partes.push('');
      tabela(ufs, faixa);
    }
  };

  const semRegiao = new Set(ufsComDado);
  for (const regiao of REGIOES) {
    const ufs = regiao.ufs.filter(uf => semRegiao.has(uf));
    if (ufs.length === 0) continue;
    ufs.forEach(uf => semRegiao.delete(uf));
    bloco(regiao.nome, ufs);
  }

  // Unidade fora das cinco regiões (não deve acontecer com UF do Brasil, mas
  // nada aqui deve engolir dado em silêncio).
  if (semRegiao.size > 0) bloco('Outras unidades', [...semRegiao].sort());

  const soEleitos = /só eleitos/i.test(String(rk?.recorte ?? ''));
  partes.push(
    soEleitos
      ? '_Ordenado por votos, entre os eleitos. Cada célula traz nome, partido, votos e o ano da eleição._'
      : '_Ordenado por votos, **inclusive quem não foi eleito**. Cada célula traz nome, partido, votos e o ano da eleição._',
  );
  partes.push('');

  return partes.join('\n');
}
