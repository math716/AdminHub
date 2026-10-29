export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exigirAcesso } from '@/lib/acesso-api';

export async function GET() {
  const acesso = await exigirAcesso();
  if (acesso instanceof NextResponse) return acesso;
  const { userId } = acesso;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, approved: true },
  });

  if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

  return NextResponse.json(user);
}
