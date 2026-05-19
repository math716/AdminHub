export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { sendAdminApprovalEmail } from '@/lib/email';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 tentativas por IP a cada 5min — previne brute-force de
    // tokens JWT de convite e enumeracao de gabinetes.
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
      || request.headers.get('x-real-ip')
      || 'unknown';
    if (!checkRateLimit(`invite:${ip}`, 5, 5 * 60_000)) {
      return NextResponse.json(
        { error: 'Muitas tentativas. Aguarde alguns minutos.' },
        { status: 429 },
      );
    }

    const body = await request.json();
    const { name, email, password, token } = body;

    if (!name || !email || !password || !token) {
      return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 });
    }

    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
      console.error('NEXTAUTH_SECRET nao configurado');
      return NextResponse.json({ error: 'Servidor mal configurado' }, { status: 500 });
    }

    let payload: any;
    try {
      payload = jwt.verify(token, secret);
    } catch {
      return NextResponse.json({ error: 'Convite inválido ou expirado' }, { status: 400 });
    }

    const { gabineteId, role } = payload;

    if (!gabineteId || !['CHEFE', 'ASSESSOR', 'AGENTE_POLITICO'].includes(role)) {
      return NextResponse.json({ error: 'Convite inválido' }, { status: 400 });
    }

    const gabinete = await prisma.gabinete.findUnique({ where: { id: gabineteId } });
    if (!gabinete) return NextResponse.json({ error: 'Gabinete não encontrado' }, { status: 400 });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return NextResponse.json({ error: 'Este email já está cadastrado' }, { status: 400 });

    const hashedPassword = await bcrypt.hash(password, 10);

    // Convites gerados pelo ADMIN (CHEFE e AGENTE_POLITICO) já vêm pré-aprovados
    const autoApprove = role === 'CHEFE' || role === 'AGENTE_POLITICO';

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role,
        gabineteId,
        approved: autoApprove,
      },
    });

    if (!autoApprove) {
      const baseUrl = (process.env.NEXTAUTH_URL ?? 'https://adminhub.app').replace(/\/$/, '');
      sendAdminApprovalEmail({
        userName: user.name,
        userEmail: user.email,
        userRole: user.role,
        gabineteNome: gabinete.nome,
        approveUrl: `${baseUrl}/dashboard/usuarios`,
      }).catch(() => {});
    }

    const roleLabel = role === 'CHEFE' ? 'Chefe de Gabinete' : role === 'AGENTE_POLITICO' ? 'Agente Político' : 'Assessor';
    return NextResponse.json({
      message: autoApprove
        ? `Bem-vindo! Sua conta de ${roleLabel} no ${gabinete.nome} foi criada. Faça login para continuar.`
        : `Cadastro realizado! Aguarde a aprovação do Chefe de Gabinete do ${gabinete.nome}.`,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        approved: user.approved,
        gabinete: gabinete.nome,
      },
      autoApprove,
    });
  } catch (error) {
    console.error('Invite signup error:', error);
    return NextResponse.json({ error: 'Erro ao realizar cadastro' }, { status: 500 });
  }
}
