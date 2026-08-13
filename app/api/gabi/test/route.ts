import { NextResponse } from 'next/server';
import anthropic from '@/lib/anthropic';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const results: Record<string, unknown> = {};

  // 1. Testar SDK Anthropic
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 32,
      messages: [{ role: 'user', content: 'Responda só "OK".' }],
    });
    results.anthropic = {
      ok: true,
      response: (msg.content[0] as any).text?.trim(),
      inputTokens: msg.usage.input_tokens,
      outputTokens: msg.usage.output_tokens,
    };
  } catch (err: any) {
    results.anthropic = { ok: false, error: err.message };
  }

  // 2. Testar tabela agent_usage (só leitura)
  try {
    const count = await prisma.agentUsage.count();
    results.agentUsage = { ok: true, registros: count };
  } catch (err: any) {
    results.agentUsage = { ok: false, error: err.message };
  }

  return NextResponse.json(results, { status: 200 });
}
