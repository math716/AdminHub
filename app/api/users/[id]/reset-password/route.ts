export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { sendPasswordResetEmail } from '@/lib/email';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

function generateTempPassword(): string {
  const upper  = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower  = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const all    = upper + lower + digits;

  function pick(charset: string): string {
    return charset[crypto.randomInt(charset.length)];
  }

  let pwd = pick(upper) + pick(lower) + pick(digits);
  for (let i = 3; i < 10; i++) pwd += pick(all);

  // Shuffle using Fisher-Yates with crypto.randomInt
  const arr = pwd.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join('');
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const userRole     = (session.user as any)?.role;
    const sessionUserId = (session.user as any)?.id;

    if (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Apenas ADMIN pode resetar senhas' }, { status: 403 });
    }
    if (params.id === sessionUserId) {
      return NextResponse.json({ error: 'Use as configurações da sua conta para alterar sua própria senha' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, email: true },
    });
    if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

    const tempPassword = generateTempPassword();
    const hashed = await bcrypt.hash(tempPassword, 10);

    await prisma.user.update({ where: { id: params.id }, data: { password: hashed, mustChangePassword: true } });

    const baseUrl = process.env.NEXTAUTH_URL ?? '';
    const emailSent = await sendPasswordResetEmail({
      userName: user.name,
      userEmail: user.email,
      tempPassword,
      loginUrl: `${baseUrl}/login`,
    });

    // Retornar a senha apenas quando o email não estiver configurado,
    // para que o admin possa comunicá-la manualmente ao usuário.
    if (emailSent) {
      return NextResponse.json({ success: true, emailSent: true });
    }
    return NextResponse.json({ success: true, emailSent: false, password: tempPassword });
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json({ error: 'Erro ao resetar senha' }, { status: 500 });
  }
}
