export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { lerCorpo, v } from '@/lib/validacao-api';

const Solicitacao = z.object({
  token:           v.texto('o link de convite', 128),
  gabineteNome:    v.texto('o nome do gabinete', 120),
  userName:        v.texto('o seu nome', 120),
  userEmail:       v.email(),
  password:        v.senha(),
  confirmPassword: z.string({ invalid_type_error: 'Confirmação de senha: valor inválido.' }).max(200).nullish(),
}).passthrough();

// POST — submete solicitação de criação de gabinete
export async function POST(req: NextRequest) {
  // Sem login: tipos e tamanhos conferidos antes de qualquer consulta — um
  // campo em formato errado derrubava a rota com erro do banco.
  const body = await lerCorpo(req, Solicitacao);
  if (body instanceof NextResponse) return body;
  const { token, gabineteNome, userName, userEmail, password, confirmPassword } = body;

  if (password !== confirmPassword) {
    return NextResponse.json({ error: 'As senhas não coincidem' }, { status: 400 });
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
