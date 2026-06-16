export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import crypto from 'crypto';

// POST — gera um link de convite para criação de gabinete (expira em 1h)
export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const role = (session.user as any)?.role;
  if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

  await prisma.gabineteConviteLink.create({
    data: { token, expiresAt, createdById: (session.user as any).id },
  });

  const baseUrl = (process.env.NEXTAUTH_URL ?? '').replace(/\/$/, '');
  return NextResponse.json({
    url: `${baseUrl}/registro-gabinete/${token}`,
    expiresAt,
  });
}
