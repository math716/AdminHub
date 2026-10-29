export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exigirAcesso } from '@/lib/acesso-api';
import jwt from 'jsonwebtoken';

const INVITE_TTL_DAYS = 7;

export async function POST(request: NextRequest) {
  const acesso = await exigirAcesso({ papeis: ['CHEFE', 'ADMIN', 'SUPER_ADMIN', 'AGENTE_POLITICO'] });
  if (acesso instanceof NextResponse) return acesso;
  const { role: userRole, gabineteId: sessionGabineteId } = acesso;

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

    // Mesma conferência que /api/signup/invite faz ao criar a conta: convite
    // que entra com acesso imediato vale uma vez só. Feita aqui também para a
    // pessoa saber ANTES de preencher o cadastro inteiro, e não depois.
    if (payload.role === 'CHEFE' || payload.role === 'AGENTE_POLITICO') {
      const jaOcupado = await prisma.user.findFirst({
        where: { gabineteId: payload.gabineteId, role: payload.role, deletedAt: null },
        select: { id: true },
      });
      if (jaOcupado) {
        const cargo = payload.role === 'CHEFE' ? 'Chefe de Gabinete' : 'Agente Político';
        return NextResponse.json(
          { error: `Este convite já foi utilizado — o gabinete já tem um ${cargo} cadastrado.` },
          { status: 400 },
        );
      }
    }

    return NextResponse.json({
      gabineteId: payload.gabineteId,
      gabineteNome: payload.gabineteNome,
      role: payload.role,
    });
  } catch {
    return NextResponse.json({ error: 'Convite inválido ou expirado' }, { status: 400 });
  }
}
