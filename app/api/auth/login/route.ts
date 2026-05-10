export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { checkRateLimit } from '@/lib/rate-limit';

// Resposta genérica usada para qualquer falha de credencial
// Impede enumeração de usuários via mensagens distintas
const INVALID_CREDENTIALS = { error: 'Email ou senha inválidos' };

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
            ?? request.headers.get('x-real-ip')
            ?? 'unknown';
    if (!checkRateLimit(`login:${ip}`, 10, 60_000)) {
      return NextResponse.json(
        { error: 'Muitas tentativas. Aguarde um momento antes de tentar novamente.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email e senha são obrigatórios' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // Sempre executa o bcrypt mesmo quando o usuário não existe para manter
    // timing constante e impedir enumeração via tempo de resposta
    const hashParaComparar = user?.password ?? '$2a$10$placeholder.hash.that.never.matches.anything.ok';
    const isValid = await bcrypt.compare(password, hashParaComparar);

    if (!user || !isValid) {
      return NextResponse.json(INVALID_CREDENTIALS, { status: 401 });
    }

    if (!user.approved && user.role !== 'CHEFE' && user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Cadastro pendente de aprovação' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      user: {
        id:       user.id,
        email:    user.email,
        name:     user.name,
        role:     user.role,
        approved: user.approved
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Erro ao realizar login' },
      { status: 500 }
    );
  }
}
