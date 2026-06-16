export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET — valida o token do convite
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const link = await prisma.gabineteConviteLink.findUnique({ where: { token: params.token } });

  if (!link) return NextResponse.json({ error: 'Link inválido' }, { status: 400 });
  if (link.expiresAt < new Date()) return NextResponse.json({ error: 'Link expirado' }, { status: 400 });

  return NextResponse.json({ valid: true });
}
