export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exigirAcesso } from '@/lib/acesso-api';
import crypto from 'crypto';

// POST — gera um link de convite para criação de gabinete (expira em 1h)
export async function POST(_req: NextRequest) {
  const acesso = await exigirAcesso({ papeis: ['ADMIN', 'SUPER_ADMIN'] });
  if (acesso instanceof NextResponse) return acesso;

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

  await prisma.gabineteConviteLink.create({
    data: { token, expiresAt, createdById: acesso.userId },
  });

  const baseUrl = (process.env.NEXTAUTH_URL ?? '').replace(/\/$/, '');
  return NextResponse.json({
    url: `${baseUrl}/registro-gabinete/${token}`,
    expiresAt,
  });
}
