export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import anthropic from '@/lib/anthropic';
import { AGENT_TOOLS } from '@/lib/agent/tools';
import { executarTool } from '@/lib/agent/executors';
import { SYSTEM_PROMPT } from '@/lib/agent/system-prompt';
import { prisma } from '@/lib/db';
import type { Session } from 'next-auth';

const MODEL = 'claude-sonnet-4-6';
const MAX_ITERATIONS = 8; // evita loops infinitos

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

    const body = await request.json();
    const msgs: ChatMsg[] = Array.isArray(body?.messages) ? body.messages : [];

    if (msgs.length === 0 || msgs[msgs.length - 1].role !== 'user') {
      return NextResponse.json({ error: 'Última mensagem deve ser do usuário' }, { status: 400 });
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
    const anthropicMessages: any[] = msgs.map((m, i) => {
      // Aplica cache_control na penúltima mensagem do usuário (contexto histórico mais longo)
      const isLastUser = m.role === 'user' && i === msgs.length - 1;
      const isPenultimate = m.role === 'user' && i === msgs.length - 3;

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

    // ── Loop agentic de tool use ─────────────────────────────────────────────
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' }, // cacheia o system prompt
          },
        ],
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

      // Fim do turno — extrai texto da resposta
      if (response.stop_reason === 'end_turn') {
        for (const block of response.content) {
          if (block.type === 'text') {
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
              dadosBrutos[block.name] = resultado; // guarda a última chamada de cada ferramenta
            }
          } catch (err) {
            resultado = { erro: `Erro ao executar ${block.name}: ${String(err)}` };
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(resultado),
          });
        }

        anthropicMessages.push({ role: 'user', content: toolResults });
        continue;
      }

      // stop_reason inesperado — encerra
      break;
    }

    // Salva usage (async, não bloqueia a resposta)
    salvarUsage(session, totalInputTokens, totalOutputTokens);

    return NextResponse.json({
      content: resposta || 'Não obtive resposta. Tente reformular a pergunta.',
      visualizacoes: visualizacoes.length > 0 ? visualizacoes : undefined,
      tools: toolsUsed.size > 0 ? [...toolsUsed] : undefined,
      dadosBrutos: Object.keys(dadosBrutos).length > 0 ? dadosBrutos : undefined,
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
