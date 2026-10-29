export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exigirAcesso } from '@/lib/acesso-api';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const acesso = await exigirAcesso();
  if (acesso instanceof NextResponse) return acesso;

  if (acesso.role !== 'ADMIN' && acesso.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Apenas Administrador pode ver logs de reset' }, { status: 403 });
  }

  const logs = await prisma.passwordResetLog.findMany({
    where: { userId: params.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json(logs);
}
