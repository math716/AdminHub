export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exigirAcesso } from '@/lib/acesso-api';

// GET — lista todas as solicitações (PENDENTE, APROVADA, RECUSADA)
export async function GET() {
  const acesso = await exigirAcesso({ papeis: ['ADMIN', 'SUPER_ADMIN'] });
  if (acesso instanceof NextResponse) return acesso;

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
