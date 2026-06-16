export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

// GET — lista todas as solicitações (PENDENTE, APROVADA, RECUSADA)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const role = (session.user as any)?.role;
  if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const solicitacoes = await prisma.solicitacaoGabinete.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      gabineteNome: true,
      userName: true,
      userEmail: true,
      status: true,
      motivoRecusa: true,
      reviewedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ solicitacoes });
}
