export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import anthropic from '@/lib/anthropic';
import { AGENT_TOOLS } from '@/lib/agent/tools';
import { executarTool, conferirSomas } from '@/lib/agent/executors';
import { SYSTEM_PROMPT } from '@/lib/agent/system-prompt';
import { visualizacoesAutomaticas } from '@/lib/agent/visualizacoes-auto';
import { contextoDoGabinete, blocoDoGabinete } from '@/lib/agent/contexto-gabinete';
import { fraseDaBusca, FRASES } from '@/lib/agent/progresso';

import { prisma } from '@/lib/db';
import type { Session } from 'next-auth';

/**
 * Resumo factual do que as ferramentas trouxeram, para quando o modelo termina
 * o turno sem escrever nada. Sem isto, a tela mostrava "Não obtive resposta"
 * logo acima dos gráficos com os dados — contradizendo a si mesma.
 */
function resumoDosDados(d: Record<string, unknown>): string {
  const partes: string[] = [];
  const num = (n: unknown) => Number(n ?? 0).toLocaleString('pt-BR');

  const v = d.buscar_votacao as any;
  if (v?.candidatos?.length) {
    const c = v.candidatos;
    const escopo = [c[0].uf !== 'BR' ? c[0].uf : '', c[0].ano].filter(Boolean).join(' ');
    partes.push(c.length === 1
      ? `**${c[0].nomeUrna || c[0].nome}** (${c[0].partido}) — ${num(c[0].totalVotos)} votos em ${escopo}.`
      : `**${c.length} candidatos** em ${escopo}. Mais votado: **${c[0].nomeUrna || c[0].nome}** (${c[0].partido}), com ${num(c[0].totalVotos)} votos.`);
  }
  const e = d.buscar_emendas as any;
  if (e?.emendas?.length) {
    partes.push(`**${e.total} emendas**, R$ ${num(e.totalEmpenhado)} empenhados e ${e.execucaoGeral}% de execução.`);
  }
  const ag = d.buscar_agenda as any;
  if (ag?.encontrado) partes.push(`**${ag.total} compromissos** na agenda do gabinete.`);
  const ct = d.buscar_contatos as any;
  if (ct?.encontrado) partes.push(`**${ct.total} contatos** na base do gabinete.`);
  const dm = d.buscar_demandas as any;
  if (dm?.total) partes.push(`**${dm.total} demandas** registradas.`);

  if (partes.length === 0) return 'Não obtive resposta. Tente reformular a pergunta.';
  const linhas = partes.map(p => `- ${p}`).join('\n');
  return `Levantei os dados abaixo:\n\n${linhas}\n\nOs gráficos detalham o resultado. Quer que eu aprofunde algum ponto?`;
}

/**
 * Junta duas buscas de emendas num só conjunto, sem duplicar registros e com os
 * totais recalculados sobre o resultado combinado (o cabeçalho do PDF e os
 * gráficos leem daqui).
 */
const DIMENSOES = ['parlamentar', 'uf', 'esfera', 'municipio', 'area', 'ano'] as const;

/**
 * Os dois recortes com certeza NÃO se sobrepõem?
 *
 * Só quando alguma dimensão tem valor concreto e DIFERENTE nos dois lados
 * (2024 × 2025, Fulano × Beltrano). Se um lado deixa a dimensão em aberto, ele
 * contém o outro — "SP, todos os anos" engloba "SP, 2022".
 */
function recortesDisjuntos(a: any, b: any): boolean {
  if (!a || !b) return false;
  return DIMENSOES.some(d =>
    a[d] != null && b[d] != null && String(a[d]).toLowerCase() !== String(b[d]).toLowerCase());
}

/** Quanto mais filtros, mais estreito o recorte. */
function quantosFiltros(f: any): number {
  return f ? DIMENSOES.filter(d => f[d] != null).length : 0;
}

function acumularEmendas(prev: any, novo: any) {
  if (!novo?.encontrado) return prev;          // busca vazia não apaga o que já há
  if (!prev?.encontrado) return novo;

  // Recortes que se sobrepõem NÃO podem ser somados. Caso real: ao montar um
  // panorama, a Gabi buscou o período inteiro e depois 2022 e 2023 à parte —
  // a soma cega pôs R$ 6,1B na capa de um documento cujo total é R$ 4,5B,
  // porque 2022 e 2023 já estavam dentro do período. Nesse caso vale o recorte
  // MAIS AMPLO, que já contém o outro; os agregados dele descrevem o conjunto.
  if (!recortesDisjuntos(prev.filtros, novo.filtros)) {
    const amplo = quantosFiltros(novo.filtros) <= quantosFiltros(prev.filtros) ? novo : prev;
    const outro = amplo === novo ? prev : novo;
    const chaveAmostra = (e: any) =>
      [e.parlamentar, e.ano, e.area, e.municipio, e.valorEmpenhado, e.objeto].join('|');
    const vistasAmplo = new Set((amplo.emendas ?? []).map(chaveAmostra));
    return {
      ...amplo,
      // A amostra pode crescer — ela é só ilustrativa e não alimenta total algum.
      emendas: [
        ...(amplo.emendas ?? []),
        ...(outro.emendas ?? []).filter((e: any) => !vistasAmplo.has(chaveAmostra(e))),
      ],
    };
  }

  const chave = (e: any) =>
    [e.parlamentar, e.ano, e.area, e.municipio, e.valorEmpenhado, e.objeto].join('|');
  const vistas = new Set((prev.emendas ?? []).map(chave));
  const emendas = [
    ...(prev.emendas ?? []),
    ...(novo.emendas ?? []).filter((e: any) => !vistas.has(chave(e))),
  ];

  // Soma os AGREGADOS dos dois lados, nunca as listas: cada busca já traz o
  // total do seu recorte, enquanto `emendas` é só a amostra das maiores.
  // Somar as listas devolvia o tamanho da amostra como total — era por aqui
  // que a correção do executor se perdia quando a Gabi buscava duas vezes.
  // O uso previsto é uma busca por parlamentar, recortes portanto disjuntos.
  const totalEmpenhado = (prev.totalEmpenhado ?? 0) + (novo.totalEmpenhado ?? 0);
  const totalPago      = (prev.totalPago ?? 0) + (novo.totalPago ?? 0);
  const total          = (prev.total ?? (prev.emendas ?? []).length)
                       + (novo.total ?? (novo.emendas ?? []).length);

  // Distribuição por área: junta as duas, somando o que cai na mesma área.
  const areas = new Map<string, any>();
  for (const a of [...(prev.porArea ?? []), ...(novo.porArea ?? [])]) {
    const atual = areas.get(a.area);
    areas.set(a.area, atual
      ? { area: a.area, emendas: atual.emendas + a.emendas, empenhado: atual.empenhado + a.empenhado, pago: atual.pago + a.pago }
      : { ...a });
  }

  // Ranking: mesma ideia, por nome.
  const porNome = new Map<string, any>();
  for (const p of [...(prev.topParlamentares ?? []), ...(novo.topParlamentares ?? [])]) {
    const atual = porNome.get(p.nome);
    porNome.set(p.nome, atual
      ? { ...atual, emendas: atual.emendas + p.emendas, empenhado: atual.empenhado + p.empenhado, pago: atual.pago + p.pago }
      : { ...p });
  }

  // Mapa de calor: soma o que cai no mesmo município.
  const municipios = new Map<string, any>();
  for (const m of [...(prev.porMunicipio ?? []), ...(novo.porMunicipio ?? [])]) {
    const atual = municipios.get(m.municipio);
    municipios.set(m.municipio, atual
      ? { municipio: m.municipio, empenhado: atual.empenhado + m.empenhado, pago: atual.pago + m.pago }
      : { ...m });
  }

  // Por estado: mesma ideia. É o que decide se o mapa do relatório é de um
  // estado ou do país — sem juntar aqui, uma busca de SP somada a uma de MG
  // ficaria parecendo caber num estado só.
  const ufs = new Map<string, any>();
  for (const u of [...(prev.porUf ?? []), ...(novo.porUf ?? [])]) {
    const atual = ufs.get(u.uf);
    ufs.set(u.uf, atual
      ? { uf: u.uf, empenhado: atual.empenhado + u.empenhado, pago: atual.pago + u.pago }
      : { ...u });
  }

  const porArea = [...areas.values()].sort((a, b) => b.empenhado - a.empenhado);
  const inconsistencia = conferirSomas(
    { total, empenhado: totalEmpenhado, pago: totalPago }, porArea);

  return {
    ...novo,
    encontrado: true,
    emendas,
    total,
    totalEmpenhado,
    totalPago,
    mostrando: emendas.length,
    // Marca que este resultado é a junção de buscas diferentes. Importa para o
    // título: somar `totalParlamentares` dos dois lados conta duas vezes quem
    // aparece nos dois recortes — num comparativo 2025 vs 2026 o documento saiu
    // intitulado "269 parlamentares", que é 173 + 96 com as repetições dentro.
    // Para o uso previsto (um parlamentar por busca) a soma está certa; quando
    // não dá para saber, é melhor o título não afirmar um número.
    recortesUnidos: true,
    // Os dois recortes somados, para a Gabi saber que o número agregado não
    // descreve nenhum dos dois isoladamente.
    recorte: [prev.recorte, novo.recorte].filter(Boolean).join('  +  ') || undefined,
    // Recalculado sobre os municípios já somados — o top de cada busca
    // separadamente não descreve o conjunto.
    topMunicipios: [...municipios.values()]
      .sort((a: any, b: any) => b.empenhado - a.empenhado)
      .slice(0, 15),
    porMunicipio: [...municipios.values()],
    porUf: [...ufs.values()].sort((a, b) => b.empenhado - a.empenhado),
    totalParlamentares: (prev.totalParlamentares ?? 0) + (novo.totalParlamentares ?? 0) || undefined,
    porArea,
    // A junção é o ponto onde os números já saíram errados (R$ 6,1B numa capa
    // cujo total era R$ 4,5B). Conferido aqui, o modelo recebe o aviso junto
    // dos dados em vez de publicar valores que não fecham entre si.
    ...(inconsistencia && { inconsistencia }),
    topParlamentares: [...porNome.values()].sort((a, b) => b.empenhado - a.empenhado).slice(0, 15),
    execucaoGeral: totalEmpenhado > 0 ? Math.round((totalPago / totalEmpenhado) * 100) : 0,
  };
}

// A data vai num bloco PRÓPRIO do system: o prompt grande fica cacheado e não é
// invalidado a cada virada de dia. Sem isso a Gabi não resolve "este ano" /
// "este mês" — ela chutaria o ano ao chamar buscar_agenda.
function blocoDataAtual() {
  const agora = new Date();
  const fmt = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', dateStyle: 'full',
  }).format(agora);
  const ano = Number(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric',
  }).format(agora));
  return {
    type: 'text' as const,
    text: `Data de hoje: ${fmt}. Ano corrente: ${ano}. Use isto para resolver ` +
      `"hoje", "este ano", "este mês", "ano passado" e afins ao montar filtros.`,
  };
}

// Sonnet 5: pensamento adaptativo LIGADO por padrão — o modelo raciocina antes
// de escolher ferramentas/argumentos (menos "não entendeu o pedido"). O
// max_tokens precisa acomodar pensamento + resposta (por isso 8192, não 4096).
const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 12288; // pensamento adaptativo + respostas com tabelas longas
// Roteiros colados pelo cliente ("4 itens × 3 parlamentares") gastam muitas
// buscas antes da primeira linha de texto. Com 8 o turno morria buscando e caía
// no resumo genérico; o teto só é usado quando o pedido realmente exige.
const MAX_ITERATIONS = 14; // evita loops infinitos
const AVISAR_ORCAMENTO_EM = 4; // faltando N rodadas, manda escrever

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
type UserMsg   = { role: 'user';      content: string };
type AssistMsg = { role: 'assistant'; content: string };
type ChatMsg   = UserMsg | AssistMsg;

interface Visualizacao {
  tipo: string;
  titulo?: string;
  dados: object;
}

// ---------------------------------------------------------------------------
// Salva usage de forma assíncrona (fire-and-forget)
// ---------------------------------------------------------------------------
function salvarUsage(
  session: Session,
  inputTokens: number,
  outputTokens: number,
): void {
  const userId    = (session.user as any)?.id;
  const gabineteId = (session.user as any)?.gabineteId ?? null;
  if (!userId) return;

  prisma.agentUsage.create({
    data: { userId, gabineteId, model: MODEL, inputTokens, outputTokens },
  }).catch(() => {/* silencioso — não pode travar a resposta */});
}

// ---------------------------------------------------------------------------
// POST /api/agent/chat
// Body: { messages: { role: 'user' | 'assistant', content: string }[] }
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    // A sessão já conferida, guardada num `const`. O turno agora roda dentro de
    // uma função (para poder ir emitindo o progresso), e ali o TypeScript não
    // enxerga mais a conferência feita aqui em cima.
    const sessaoAtiva = session;

    const body = await request.json();
    const msgs: ChatMsg[] = Array.isArray(body?.messages) ? body.messages : [];

    if (msgs.length === 0 || msgs[msgs.length - 1].role !== 'user') {
      return NextResponse.json({ error: 'Última mensagem deve ser do usuário' }, { status: 400 });
    }

    // Duas mensagens seguidas do mesmo lado viram uma só.
    //
    // Quando um pedido se perde no meio — a pessoa sai da tela do chat e volta,
    // a conexão cai, o navegador é fechado —, a pergunta fica no histórico sem
    // resposta. A mensagem seguinte então deixa DUAS falas do usuário coladas,
    // e a conversa inteira passava a falhar: o histórico ia assim para o
    // modelo, que espera os lados alternando. Na prática a conversa morria e a
    // única saída era começar outra, sem nada na tela explicando por quê.
    //
    // Juntar preserva o que a pessoa escreveu — a pergunta original e o
    // "continuar" chegam como um pedido só, que é o sentido pretendido.
    const historico: ChatMsg[] = [];
    for (const m of msgs) {
      const anterior = historico[historico.length - 1];
      if (anterior && anterior.role === m.role) {
        anterior.content = `${anterior.content}\n\n${m.content}`.trim();
      } else {
        historico.push({ ...m });
      }
    }

    // ── Verifica limite mensal de tokens do gabinete ─────────────────────────
    const gabineteId = (session.user as any)?.gabineteId as string | null;
    try {
      if (gabineteId) {
        const gabinete = await prisma.gabinete.findUnique({
          where: { id: gabineteId },
          select: { limiteTokensMes: true },
        });
        if (gabinete?.limiteTokensMes) {
          const agora  = new Date();
          const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1);
          const fim    = new Date(agora.getFullYear(), agora.getMonth() + 1, 1);
          const uso    = await prisma.agentUsage.aggregate({
            where: { gabineteId, createdAt: { gte: inicio, lt: fim } },
            _sum: { inputTokens: true, outputTokens: true },
          });
          const totalUsado = (uso._sum.inputTokens ?? 0) + (uso._sum.outputTokens ?? 0);
          if (totalUsado >= gabinete.limiteTokensMes) {
            return NextResponse.json(
              { error: 'Limite mensal de tokens atingido para este gabinete.' },
              { status: 429 },
            );
          }
        }
      }
    } catch {
      // coluna ainda não existe no banco — ignora e continua
    }

    // ── Monta o histórico no formato Anthropic ───────────────────────────────
    const anthropicMessages: any[] = historico.map((m, i) => {
      // Aplica cache_control na penúltima mensagem do usuário (contexto histórico mais longo)
      const isLastUser = m.role === 'user' && i === historico.length - 1;
      const isPenultimate = m.role === 'user' && i === historico.length - 3;

      if (isPenultimate) {
        return {
          role: 'user',
          content: [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }],
        };
      }
      return { role: m.role, content: isLastUser ? m.content : m.content };
    });

    let totalInputTokens  = 0;
    let totalOutputTokens = 0;
    const visualizacoes: Visualizacao[] = [];
    const toolsUsed = new Set<string>();
    const dadosBrutos: Record<string, unknown> = {}; // saídas cruas p/ alimentar o relatório PDF
    let resposta = '';

    // Quem é este gabinete. Vai num bloco à parte, DEPOIS do prompt grande, para
    // não invalidar o cache dele — o prompt é o mesmo para todos, isto não.
    const ctxGabinete = gabineteId ? blocoDoGabinete(await contextoDoGabinete(gabineteId)) : '';
    const blocosDoSistema = [
      { type: 'text' as const, text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' as const } },
      blocoDataAtual(),
      ...(ctxGabinete ? [{ type: 'text' as const, text: ctxGabinete }] : []),
    ];

    // ── Daqui em diante a resposta vai saindo aos poucos ────────────────────
    //
    // Um pedido com vários itens leva dezenas de segundos. Até aqui a tela
    // ficava parada o tempo todo, sem diferença visível entre "trabalhando" e
    // "travou". Agora cada passo é anunciado enquanto acontece.
    //
    // As recusas anteriores (sessão, formato, limite de tokens) continuam
    // saindo como resposta normal, com o código HTTP certo — só o que vem
    // DEPOIS daqui viaja pelo fluxo, porque a essa altura o 200 já foi enviado
    // e não dá mais para mudar o status.
    const codificador = new TextEncoder();
    let emitir: (evento: Record<string, unknown>) => void = () => {};

    const fluxo = new ReadableStream({
      async start(controlador) {
        emitir = (evento) => {
          try { controlador.enqueue(codificador.encode(JSON.stringify(evento) + '\n')); }
          catch { /* cliente desconectou no meio */ }
        };
        try {
          await conduzirTurno();
        } catch (err: any) {
          console.error('[/api/agent/chat] durante o fluxo:', err);
          emitir({
            tipo: 'erro',
            mensagem:
              err?.status === 529 || err?.message?.includes('overloaded')
                ? 'A Gabi está sobrecarregada no momento. Tente de novo em alguns segundos.'
                : err?.status === 402 || err?.message?.includes('credit')
                  ? 'Créditos insuficientes na conta da Gabi.'
                  : 'Erro interno ao processar sua mensagem.',
          });
        } finally {
          controlador.close();
        }
      },
    });

    async function conduzirTurno() {
    emitir({ tipo: 'progresso', texto: FRASES.inicio });

    // ── Loop agentic de tool use ─────────────────────────────────────────────
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: blocosDoSistema,
        tools: AGENT_TOOLS.map((t, i) =>
          // cacheia a lista de tools (muda raramente)
          i === AGENT_TOOLS.length - 1
            ? { ...t, cache_control: { type: 'ephemeral' } }
            : t,
        ) as any,
        messages: anthropicMessages,
      } as any);

      totalInputTokens  += response.usage?.input_tokens  ?? 0;
      totalOutputTokens += response.usage?.output_tokens ?? 0;

      // Fim do turno — extrai texto da resposta. Também salva o texto parcial
      // quando o max_tokens corta a geração (melhor resposta parcial que vazia).
      if (response.stop_reason === 'end_turn' || response.stop_reason === 'max_tokens') {
        for (const block of response.content) {
          if (block.type === 'text' && block.text.trim()) {
            resposta = block.text;
          }
        }
        break;
      }

      // Executa as ferramentas solicitadas
      if (response.stop_reason === 'tool_use') {
        // Adiciona a resposta do assistente ao histórico
        anthropicMessages.push({ role: 'assistant', content: response.content });

        const toolResults: any[] = [];

        for (const block of response.content) {
          if (block.type !== 'tool_use') continue;

          let resultado: unknown;
          // Anuncia ANTES de executar: as buscas pesadas são justamente as que
          // demoram, e é durante elas que a tela precisa dizer o que acontece.
          emitir({
            tipo: 'progresso',
            texto: fraseDaBusca(block.name, block.input as Record<string, unknown>),
          });
          try {
            resultado = await executarTool(
              block.name,
              block.input as Record<string, unknown>,
              session as any,
            );

            if (block.name === 'gerar_visualizacao') {
              visualizacoes.push(resultado as Visualizacao);
            } else {
              toolsUsed.add(block.name);
              // buscar_votacao pode ser chamada várias vezes numa comparação —
              // acumula os candidatos (dedup por nome de urna) em vez de sobrescrever.
              if (block.name === 'buscar_votacao' && dadosBrutos.buscar_votacao) {
                const prev = (dadosBrutos.buscar_votacao as any)?.candidatos ?? [];
                const novos = (resultado as any)?.candidatos ?? [];
                const vistos = new Set(prev.map((c: any) => c.nomeUrna));
                const candidatos = [...prev, ...novos.filter((c: any) => !vistos.has(c.nomeUrna))];
                dadosBrutos.buscar_votacao = { ...(resultado as any), candidatos };
              } else if (block.name === 'buscar_emendas' && dadosBrutos.buscar_emendas) {
                // Comparar N parlamentares exige uma busca por nome. Sobrescrever
                // deixava no PDF só as emendas do ÚLTIMO — e o valor dele no
                // cabeçalho, com cara de total geral. Acumula e recalcula.
                dadosBrutos.buscar_emendas = acumularEmendas(
                  dadosBrutos.buscar_emendas as any, resultado as any,
                );
              } else {
                dadosBrutos[block.name] = resultado; // guarda a última chamada de cada ferramenta
              }
            }
          } catch (err) {
            resultado = { erro: `Erro ao executar ${block.name}: ${String(err)}` };
          }

          // `porMunicipio` existe só para o mapa de calor do PDF e pode ter
          // centenas de linhas. Fica em dadosBrutos, mas sai do que vai ao
          // modelo — senão consome o turno sem a Gabi ter uso para ele.
          // O `topMunicipios` (15 linhas) SEGUE, que é o que ela precisa para
          // responder "quais municípios mais receberam".
          const { porMunicipio: _mapa, ...paraOModelo } = (resultado ?? {}) as any;

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(paraOModelo),
          });
        }

        // Orçamento restante do turno. Sem esse aviso o modelo não tem como
        // saber que está perto do fim e segue buscando até o loop estourar —
        // era assim que um pedido de 4 itens × 3 nomes acabava sem texto
        // nenhum, entregando o resumo genérico ao usuário.
        const restantes = MAX_ITERATIONS - 1 - iter;
        if (restantes <= AVISAR_ORCAMENTO_EM) {
          toolResults.push({
            type: 'text',
            text: restantes <= 1
              ? 'ORÇAMENTO ESGOTADO: esta é a última rodada. NÃO chame mais ferramentas. '
                + 'Escreva agora a resposta final ao usuário com tudo o que já apurou, '
                + 'organizada pelos itens que ele pediu, e diga em uma linha o que ficou de fora.'
              : `Restam ${restantes} rodadas de busca neste turno. Faça apenas o que for `
                + 'indispensável e comece a redigir a resposta — melhor uma resposta completa '
                + 'sobre os dados que você já tem do que nenhuma resposta.',
          });
        }

        anthropicMessages.push({ role: 'user', content: toolResults });
        // Voltou das buscas: vai pensar no que fazer com o que achou.
        emitir({ tipo: 'progresso', texto: FRASES.analisando });
        continue;
      }

      // stop_reason inesperado — encerra
      break;
    }

    // O modelo pode esgotar as iterações insistindo em buscas (ex.: filtros
    // sem resultado) e o loop terminar SEM texto — força um fechamento em
    // texto com o que já foi apurado, sem permitir novas ferramentas.
    if (!resposta) {
      console.warn(`[/api/agent/chat] turno terminou sem texto (ferramentas: ${[...toolsUsed].join(', ') || 'nenhuma'}) — tentando fechamento`);
      try {
        const fechamento = await anthropic.messages.create({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: blocosDoSistema,
          tools: AGENT_TOOLS as any,
          tool_choice: { type: 'none' },
          messages: [
            ...anthropicMessages,
            {
              role: 'user',
              content: 'Encerre agora: responda diretamente ao usuário com o que você já apurou nas buscas acima. Se algum dado não foi localizado, diga naturalmente o que há disponível e ofereça um caminho — sem mencionar ferramentas ou processo interno.',
            },
          ],
        } as any);
        totalInputTokens  += fechamento.usage?.input_tokens  ?? 0;
        totalOutputTokens += fechamento.usage?.output_tokens ?? 0;
        for (const block of fechamento.content) {
          if (block.type === 'text' && block.text.trim()) resposta = block.text;
        }
      } catch (err) {
        console.error('[/api/agent/chat] fechamento também falhou:', String(err).slice(0, 200));
      }
    }

    // Último recurso: em vez de "não obtive resposta" logo acima dos gráficos
    // com os dados — o que o usuário viu —, descreve o que as buscas trouxeram.
    if (!resposta) {
      console.warn('[/api/agent/chat] sem texto após o fechamento — respondendo com o resumo dos dados');
      resposta = resumoDosDados(dadosBrutos);
    }

    // Gráficos padrão montados AQUI, com os dados que as ferramentas já
    // trouxeram. Antes o prompt exigia duas chamadas de `gerar_visualizacao`
    // por turno — duas idas à API em que o modelo apenas REDIGITAVA dados que o
    // servidor já tinha (~330 tokens de saída, uns 5,5s). Se ele mandou algo
    // sob medida, o dele prevalece.
    if (visualizacoes.length === 0) {
      emitir({ tipo: 'progresso', texto: FRASES.graficos });
      visualizacoes.push(...visualizacoesAutomaticas(dadosBrutos));
    }

    // Salva usage (async, não bloqueia a resposta)
    salvarUsage(sessaoAtiva, totalInputTokens, totalOutputTokens);

    emitir({
      tipo: 'fim',
      content: resposta,
      visualizacoes: visualizacoes.length > 0 ? visualizacoes : undefined,
      tools: toolsUsed.size > 0 ? [...toolsUsed] : undefined,
      dadosBrutos: Object.keys(dadosBrutos).length > 0 ? dadosBrutos : undefined,
    });
    } // fim de conduzirTurno

    return new Response(fluxo, {
      headers: {
        // Uma linha de JSON por evento. Simples de ler em pedaços e de
        // reconstituir quando um pedaço chega partido ao meio.
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        // Impede que um servidor no caminho segure os pedaços para entregar
        // tudo junto no fim — seria o mesmo que não ter fluxo nenhum.
        'X-Accel-Buffering': 'no',
      },
    });

  } catch (err: any) {
    console.error('[/api/agent/chat]', err);

    if (err?.status === 529 || err?.message?.includes('overloaded')) {
      return NextResponse.json(
        { error: 'API temporariamente sobrecarregada. Aguarde alguns segundos.' },
        { status: 503 },
      );
    }
    if (err?.status === 402 || err?.message?.includes('credit')) {
      return NextResponse.json(
        { error: 'Créditos insuficientes na conta Anthropic.' },
        { status: 402 },
      );
    }

    return NextResponse.json({ error: 'Erro interno ao processar sua mensagem.' }, { status: 500 });
  }
}
