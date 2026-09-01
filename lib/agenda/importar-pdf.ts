// Leitura de agendas em PDF (grade semanal) para eventos da Agenda do Gabinete.
//
// Por que o PDF vai para o modelo em vez de um parser: o que define o dia de um
// compromisso nessa grade nao e nenhuma palavra do arquivo — e a POSICAO da
// caixa na coluna. Extracao de texto devolve fragmentos soltos, e reconstruir a
// tabela por coordenada quebra assim que a planilha muda de largura ou ganha uma
// coluna. A cor tambem carrega significado (amarelo = pessoal, azul = gravacao),
// e isso o texto puro joga fora. Some-se a isso o teto de 250 MB da Vercel, que
// uma biblioteca de leitura de PDF com coordenadas pode estourar.
//
// Nada e gravado aqui: esta funcao so LE. Quem grava e a rota, depois que a
// pessoa confere na tela.

import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';

// Sonnet 5, e nao Opus 5, por uma razao medida: a funcao tem teto de 60 s na
// plataforma, e o Opus passava de 45 s so na leitura mesmo no esforco minimo.
// A tarefa aqui e transcrever uma grade de uma pagina — leitura de layout, nao
// raciocinio — e o Sonnet da conta em uma fracao do tempo.
const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 16000;

/**
 * Corta a leitura ANTES do teto de 60 s da função.
 *
 * Estourando o limite da plataforma, o cliente recebe um 504 sem explicação e
 * o log não diz nada. Com o corte aqui, sobra tempo para responder algo que a
 * pessoa entenda e para registrar quanto tempo levou.
 */
const TIMEOUT_MS = 50_000;

/**
 * Sem retentativa.
 *
 * O SDK repete a chamada por conta propria ate duas vezes. Com um trabalho que
 * ja demora, isso DOBRA o tempo: no log da falha apareciam dois POST para a
 * API, o primeiro cortado pelo timeout e o segundo consumindo o resto ate a
 * funcao morrer. Numa leitura lenta, repetir e a pior coisa a fazer.
 */
const TENTATIVAS = 0;

/** Brasilia. O servidor roda em UTC — sem ancora, "14h30" viraria 11h30. */
const FUSO_BR = '-03:00';

export const TIPOS_EVENTO = ['REUNIAO', 'VISITA', 'EVENTO', 'COMPROMISSO'] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export interface EventoExtraido {
  titulo: string;
  descricao: string | null;
  data: string;             // AAAA-MM-DD
  diaSemana: string | null; // como escrito no documento
  horaInicio: string;       // HH:MM
  horaFim: string | null;
  local: string | null;
  endereco: string | null;
  tipo: TipoEvento;
}

export interface ResultadoLeitura {
  eventos: EventoExtraido[];
  observacoes: string | null;
}

// Schema da resposta. Campos ausentes no documento vem como null (e nao
// omitidos): com `required` completo o modelo nao "esquece" um campo, ele
// declara que nao existe — o que e diferente e importante na conferencia.
const SCHEMA = {
  type: 'object',
  properties: {
    eventos: {
      type: 'array',
      description: 'Todos os compromissos encontrados, em todas as colunas e paginas.',
      items: {
        type: 'object',
        properties: {
          titulo: { type: 'string', description: 'Descricao do compromisso, sem o horario e sem a regiao.' },
          descricao: { type: ['string', 'null'], description: 'Observacoes e participantes (o que vem apos "Obs:").' },
          data: { type: 'string', description: 'Data no formato AAAA-MM-DD, lida no cabecalho da coluna.' },
          diaSemana: { type: ['string', 'null'], description: 'Dia da semana exatamente como escrito no cabecalho da coluna.' },
          horaInicio: { type: 'string', description: 'Hora de inicio em HH:MM (24h).' },
          horaFim: { type: ['string', 'null'], description: 'Hora de termino em HH:MM, ou null se o documento nao informar.' },
          local: { type: ['string', 'null'], description: 'Regiao/bairro em destaque no titulo do bloco (ex.: "LAGO SUL").' },
          endereco: { type: ['string', 'null'], description: 'Endereco completo (o que vem apos "End.:").' },
          tipo: { type: 'string', enum: ['REUNIAO', 'VISITA', 'EVENTO', 'COMPROMISSO'] },
        },
        required: ['titulo', 'descricao', 'data', 'diaSemana', 'horaInicio', 'horaFim', 'local', 'endereco', 'tipo'],
        additionalProperties: false,
      },
    },
    observacoes: {
      type: ['string', 'null'],
      description: 'Nota curta sobre algo ambiguo no documento. Null se estiver tudo claro.',
    },
  },
  required: ['eventos', 'observacoes'],
  additionalProperties: false,
} as const;

const INSTRUCOES = `Voce esta lendo a agenda semanal de um gabinete parlamentar brasileiro, exportada em PDF.

O documento e uma GRADE: cada coluna e um dia (com o dia da semana e a data no cabecalho) e cada linha e uma faixa de horario. Cada compromisso e uma caixa colorida posicionada na coluna do seu dia.

## Como ler cada caixa
O padrao tipico de uma caixa e:

    13h as 16h - LAGO NORTE
    Gravacoes para Insercoes no horario eleitoral
    Obs: Participam Fulano e Sicrano
    End.: SHIN Ca 5, Bloco J2, Salas 307 a 309

Separe assim:
- **horaInicio / horaFim** — do intervalo ("13h as 16h" = 13:00 e 16:00; "14h30 as 17h45" = 14:30 e 17:45). Se houver so um horario ("20h - PLANALTINA"), preencha horaInicio e deixe horaFim nulo.
- **local** — a regiao em MAIUSCULAS logo apos o horario (LAGO NORTE, GUARA, PLANALTINA, RESIDENCIA). Nao repita isso no titulo.
- **titulo** — a descricao do compromisso, sem horario e sem a regiao.
- **descricao** — o texto apos "Obs:". Se nao houver, nulo.
- **endereco** — o texto apos "End.:". Se nao houver, nulo.
- **data** — leia a data no cabecalho da COLUNA em que a caixa esta. Este e o ponto mais importante: uma caixa na coluna do meio pertence ao dia do meio, mesmo que o texto dela nao repita a data.
- **diaSemana** — o dia da semana escrito no cabecalho daquela coluna, como esta no documento.

## Classificacao (tipo)
As cores costumam indicar a natureza do compromisso; use-as junto com o texto:
- Reuniao, encontro com pessoas, audiencia -> REUNIAO
- Visita, vistoria, ida a uma comunidade ou obra -> VISITA
- Evento, ato publico, gravacao, insercao, comicio, solenidade -> EVENTO
- "Agenda Pessoal", "Residencia", bloqueios pessoais e o que nao se encaixar acima -> COMPROMISSO

## O que NAO e compromisso — ignore
- Blocos de deslocamento ("DESLOC.: 30' a 50'", "Deslocamento", "Translado")
- Cabecalhos, rodapes, numeracao de pagina ("1 de 1") e legendas
- Celulas vazias da grade

## Regras
- Extraia TODOS os compromissos de TODAS as colunas e de todas as paginas.
- Nao invente nada: campo ausente no documento e nulo. Nao complete endereco nem nome de participante.
- Preserve a grafia original de nomes e enderecos, inclusive abreviacoes ("Cj", "QI", "SHIN").
- Se um mesmo compromisso ocupar duas colunas (atravessa dois dias), registre um evento por dia.`;

/** Raiz do nome do dia: "terca-feira" e "Terca" comparam igual. */
function raizDoDia(s: string): string {
  return s.trim().split(/[\s-]+/)[0];
}

/** Compara nomes de dia ignorando acento e caixa, sem regex de acentos. */
function mesmoDia(a: string, b: string): boolean {
  return raizDoDia(a).localeCompare(raizDoDia(b), 'pt-BR', { sensitivity: 'base' }) === 0;
}

/**
 * Descobre o ano da data, que a agenda quase nunca traz.
 *
 * A grade mostra "terca-feira 25/08" e mais nada. Duas regras resolvem:
 *
 * 1. Agenda de gabinete e sempre do presente ou do futuro. Ninguem importa o
 *    compromisso do ano passado. Entao o ano NUNCA e anterior ao corrente —
 *    era esse o erro que jogava uma agenda de 2026 para 2024.
 * 2. Entre os anos possiveis, vale o que faz o dia bater com o dia da semana
 *    escrito no documento. 25/08 so cai numa terca em 2026.
 */
export function corrigirAnoPeloDiaDaSemana(
  data: string, diaSemana: string | null, hoje = new Date(),
): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!m) return data;
  const [, anoStr, mesStr, diaStr] = m;
  const mes = Number(mesStr), dia = Number(diaStr);

  // Ano corrente em Brasilia — o servidor roda em UTC.
  const anoAtual = Number(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric',
  }).format(hoje));

  const nomeDoDia = (a: number) =>
    new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' })
      .format(new Date(Date.UTC(a, mes - 1, dia)));

  // Sem o dia da semana no documento, so garante que nao fique no passado.
  if (!diaSemana) {
    const ano = Math.max(Number(anoStr), anoAtual);
    return `${ano}-${mesStr}-${diaStr}`;
  }

  // Do ano corrente para a frente: o primeiro que casa com o dia da semana.
  for (const ano of [anoAtual, anoAtual + 1, anoAtual + 2]) {
    if (mesmoDia(nomeDoDia(ano), diaSemana)) return `${ano}-${mesStr}-${diaStr}`;
  }

  // Nenhum casou (dia da semana lido errado): fica no ano corrente, nunca atras.
  return `${Math.max(Number(anoStr), anoAtual)}-${mesStr}-${diaStr}`;
}

/** "2026-08-25" + "14:30" -> Date no horario de Brasilia. */
export function montarDataBR(data: string, hora: string): Date {
  const h = /^(\d{1,2}):(\d{2})$/.exec((hora ?? '').trim());
  const hh = h ? h[1].padStart(2, '0') : '00';
  const mm = h ? h[2] : '00';
  return new Date(`${data}T${hh}:${mm}:00${FUSO_BR}`);
}

/**
 * Le a grade do PDF e devolve os compromissos encontrados. Nao grava nada.
 *
 * @param pdfBase64 conteudo do arquivo em base64, sem quebras de linha
 * @param hoje      data de referencia para o modelo resolver o ano quando o
 *                  documento nao o informa
 */
export async function lerAgendaEmPdf(pdfBase64: string, hoje = new Date()): Promise<ResultadoLeitura> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('Leitura automatica indisponivel no momento.');
  }
  const client = new Anthropic();

  const dataHoje = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(hoje);

  const t0 = Date.now();
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{
      role: 'user',
      content: [
        // O documento vem ANTES do texto: e a ordem que a API espera.
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
        {
          type: 'text',
          text: `${INSTRUCOES}\n\nHoje e ${dataHoje}. Se o documento nao trouxer o ano, use o mais proximo dessa data que seja compativel com os dias da semana mostrados.`,
        },
      ],
    }],
    // Sem raciocinio: transcrever uma grade nao exige deliberacao, e era ele
    // que consumia o tempo. Com o modo adaptativo ligado (padrao), a leitura
    // de UMA pagina passava de 40 s e era cortada.
    thinking: { type: 'disabled' },
    output_config: {
      format: jsonSchemaOutputFormat(SCHEMA),
      // A tarefa e transcrever uma tabela, nao raciocinar sobre ela. No esforco
      // padrao (alto) o modelo demorava mais de 60 s numa agenda de UMA pagina
      // e a funcao era cortada pelo limite da plataforma.
      effort: 'low',
    },
  }, { timeout: TIMEOUT_MS, maxRetries: TENTATIVAS });

  console.log(`[importar-pdf] leitura em ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const saida = response.parsed_output as unknown as ResultadoLeitura | null;
  if (!saida?.eventos) throw new Error('Nao foi possivel interpretar o documento.');

  // O modelo le o ano do cabecalho quando ele existe; quando nao existe, o dia
  // da semana e a evidencia mais confiavel — entao ele manda na conferencia.
  const eventos = saida.eventos.map(e => ({
    ...e,
    data: corrigirAnoPeloDiaDaSemana(e.data, e.diaSemana),
  }));

  return { eventos, observacoes: saida.observacoes ?? null };
}
