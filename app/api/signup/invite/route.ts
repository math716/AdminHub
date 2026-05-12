export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { sendAdminApprovalEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password, token } = body;

    if (!name || !email || !password || !token) {
      return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 });
    }

    let payload: any;
    try {
      payload = jwt.verify(token, process.env.NEXTAUTH_SECRET!);
    } catch {
      return NextResponse.json({ error: 'Convite inválido ou expirado' }, { status: 400 });
    }

    const { gabineteId, role } = payload;

    if (!gabineteId || !['CHEFE', 'ASSESSOR'].includes(role)) {
      return NextResponse.json({ error: 'Convite inválido' }, { status: 400 });
    }

    const gabinete = await prisma.gabinete.findUnique({ where: { id: gabineteId } });
    if (!gabinete) return NextResponse.json({ error: 'Gabinete não encontrado' }, { status: 400 });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return NextResponse.json({ error: 'Este email já está cadastrado' }, { status: 400 });

    const hashedPassword = await bcrypt.hash(password, 10);

    // Convite de CHEFE gerado pelo ADMIN → aprovado automaticamente
    const autoApprove = role === 'CHEFE';

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

    return NextResponse.json({
      message: autoApprove
        ? `Bem-vindo! Sua conta de Chefe de Gabinete no ${gabinete.nome} foi criada. Faça login para continuar.`
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
