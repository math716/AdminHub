export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import jwt from 'jsonwebtoken';

const INVITE_TTL_DAYS = 7;

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const userRole = (session.user as any)?.role;
  const sessionGabineteId = (session.user as any)?.gabineteId;

  if (userRole !== 'ADMIN' && userRole !== 'CHEFE' && userRole !== 'SUPER_ADMIN' && userRole !== 'AGENTE_POLITICO') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));

  let targetGabineteId = sessionGabineteId;
  let inviteRole: string = 'ASSESSOR';

  if (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN') {
    if (body.gabineteId) targetGabineteId = body.gabineteId;
    // ADMIN só pode convidar CHEFE ou ASSESSOR pelo fluxo normal de Usuários
    if (body.role === 'CHEFE') inviteRole = 'CHEFE';
  } else {
    // AGENTE_POLITICO pode convidar CHEFE (se não existir) ou ASSESSOR
    // CHEFE só pode convidar ASSESSOR para o próprio gabinete
    if ((userRole === 'AGENTE_POLITICO') && body.role === 'CHEFE') {
      inviteRole = 'CHEFE';
    } else {
      inviteRole = 'ASSESSOR';
    }
  }

  if (!targetGabineteId) {
    return NextResponse.json({ error: 'Gabinete não definido' }, { status: 400 });
  }

  const gabinete = await prisma.gabinete.findUnique({ where: { id: targetGabineteId } });
  if (!gabinete) return NextResponse.json({ error: 'Gabinete não encontrado' }, { status: 404 });

  // Bloquear segundo CHEFE no mesmo gabinete
  if (inviteRole === 'CHEFE') {
    const chefeExistente = await prisma.user.findFirst({
      where: { gabineteId: targetGabineteId, role: 'CHEFE', deletedAt: null },
    });
    if (chefeExistente) {
      return NextResponse.json({ error: 'Este gabinete já possui um Chefe de Gabinete cadastrado' }, { status: 400 });
    }
  }

  const token = jwt.sign(
    { gabineteId: targetGabineteId, gabineteNome: gabinete.nome, role: inviteRole },
    process.env.NEXTAUTH_SECRET!,
    { expiresIn: `${INVITE_TTL_DAYS}d` }
  );

  const baseUrl = (process.env.NEXTAUTH_URL ?? 'https://adminhub.app').replace(/\/$/, '');
  return NextResponse.json({
    token,
    url: `${baseUrl}/signup/invite/${token}`,
    ttlDays: INVITE_TTL_DAYS,
    gabineteNome: gabinete.nome,
    role: inviteRole,
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Token ausente' }, { status: 400 });

  try {
    const payload = jwt.verify(token, process.env.NEXTAUTH_SECRET!) as any;
    return NextResponse.json({
      gabineteId: payload.gabineteId,
      gabineteNome: payload.gabineteNome,
      role: payload.role,
    });
  } catch {
    return NextResponse.json({ error: 'Convite inválido ou expirado' }, { status: 400 });
  }
}
