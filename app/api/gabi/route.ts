import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import anthropic from '@/lib/anthropic';
import { prisma } from '@/lib/db';

const SYSTEM_PROMPT = `Você é a Gabi, assistente de IA integrada ao AdminHub — plataforma de gestão de gabinete político.

Você auxilia a equipe do gabinete com:
- Análise de dados eleitorais (votos por zona, município e candidato)
- Gestão de colaboradores e padrinhos políticos
- Acompanhamento de demandas e agenda do gabinete
- Emendas parlamentares e mapa de atuação
- Estratégias de campanha e engajamento

Diretrizes:
- Responda sempre em português brasileiro, de forma objetiva e direta
- Não invente dados — se não tiver acesso a uma informação, diga claramente
- Quando o usuário pedir análises que dependem de dados do banco, oriente como acessá-los na plataforma
- Seja proativa em sugerir funcionalidades relevantes do AdminHub`;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  let messages: { role: 'user' | 'assistant'; content: string }[];
  try {
    const body = await req.json();
    messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) throw new Error();
  } catch {
    return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 });
  }

  const user = session.user as any;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
    });

    const content = (response.content[0] as { type: string; text: string }).text;

    // Registrar uso de forma assíncrona — não bloqueia a resposta
    prisma.agentUsage.create({
      data: {
        userId: user.id,
        gabineteId: user.gabineteId ?? null,
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    }).catch(() => {});

    return NextResponse.json({ content });
  } catch (err: any) {
    const msg = err?.message ?? 'Erro interno';
    const status = msg.includes('credit') ? 402 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
