export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';

// POST — submete solicitação de criação de gabinete
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { token, gabineteNome, userName, userEmail, password, confirmPassword } = body;

  if (!token || !gabineteNome?.trim() || !userName?.trim() || !userEmail?.trim() || !password) {
    return NextResponse.json({ error: 'Todos os campos são obrigatórios' }, { status: 400 });
  }

  if (password !== confirmPassword) {
    return NextResponse.json({ error: 'As senhas não coincidem' }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: 'A senha deve ter no mínimo 6 caracteres' }, { status: 400 });
  }

  // Valida token
  const link = await prisma.gabineteConviteLink.findUnique({ where: { token } });
  if (!link || link.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Link de convite inválido ou expirado' }, { status: 400 });
  }

  // Verifica se email já existe
  const emailExistente = await prisma.user.findUnique({ where: { email: userEmail.trim().toLowerCase() } });
  if (emailExistente) {
    return NextResponse.json({ error: 'Este e-mail já está cadastrado no sistema' }, { status: 400 });
  }

  // Verifica se já existe solicitação pendente com o mesmo email ou nome de gabinete
  const solicitacaoDuplicada = await prisma.solicitacaoGabinete.findFirst({
    where: {
      status: 'PENDENTE',
      OR: [
        { userEmail: userEmail.trim().toLowerCase() },
        { gabineteNome: { equals: gabineteNome.trim(), mode: 'insensitive' } },
      ],
    },
  });
  if (solicitacaoDuplicada) {
    return NextResponse.json({ error: 'Já existe uma solicitação pendente com este e-mail ou nome de gabinete' }, { status: 400 });
  }

  const hashed = await bcrypt.hash(password, 10);

  await prisma.solicitacaoGabinete.create({
    data: {
      gabineteNome: gabineteNome.trim(),
      userName:     userName.trim(),
      userEmail:    userEmail.trim().toLowerCase(),
      userPassword: hashed,
    },
  });

  return NextResponse.json({ success: true });
}
