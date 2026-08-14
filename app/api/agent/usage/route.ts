export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

// ---------------------------------------------------------------------------
// GET /api/agent/usage
// Retorna uso do mês atual para o gabinete do usuário logado
// ---------------------------------------------------------------------------
export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const gabineteId = (session.user as any)?.gabineteId as string | null;
    if (!gabineteId) {
      return NextResponse.json({ error: 'Sem gabinete associado' }, { status: 400 });
    }

    // Início e fim do mês corrente em UTC
    const agora   = new Date();
    const inicio  = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const fim     = new Date(agora.getFullYear(), agora.getMonth() + 1, 1);

    // Total do mês
    const totalMes = await prisma.agentUsage.aggregate({
      where: {
        gabineteId,
        createdAt: { gte: inicio, lt: fim },
      },
      _sum: { inputTokens: true, outputTokens: true },
      _count: { id: true },
    });

    // Breakdown diário (últimos 30 dias)
    const registros = await prisma.agentUsage.findMany({
      where: {
        gabineteId,
        createdAt: { gte: inicio, lt: fim },
      },
      select: { createdAt: true, inputTokens: true, outputTokens: true },
      orderBy: { createdAt: 'asc' },
    });

    // Agrega por dia
    const porDia: Record<string, { input: number; output: number; total: number }> = {};
    for (const r of registros) {
      const dia = r.createdAt.toISOString().slice(0, 10); // YYYY-MM-DD
      if (!porDia[dia]) porDia[dia] = { input: 0, output: 0, total: 0 };
      porDia[dia].input  += r.inputTokens;
      porDia[dia].output += r.outputTokens;
      porDia[dia].total  += r.inputTokens + r.outputTokens;
    }

    const diasArray = Object.entries(porDia).map(([data, v]) => ({ data, ...v }));

    // Limite do gabinete
    const gabinete = await prisma.gabinete.findUnique({
      where: { id: gabineteId },
      select: { limiteTokensMes: true, nome: true },
    });

    const inputTotal  = totalMes._sum.inputTokens  ?? 0;
    const outputTotal = totalMes._sum.outputTokens ?? 0;

    return NextResponse.json({
      gabinete: gabinete?.nome ?? '',
      limiteTokensMes: gabinete?.limiteTokensMes ?? null,
      mes: `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`,
      inputTokens:  inputTotal,
      outputTokens: outputTotal,
      totalTokens:  inputTotal + outputTotal,
      requisicoes:  totalMes._count.id,
      diasArray,
    });
  } catch (err) {
    console.error('[/api/agent/usage]', err);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}
