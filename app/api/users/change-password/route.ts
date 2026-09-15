export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const userId = (session.user as any)?.id;
    if (!userId) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 });

    const { newPassword, currentPassword } = await req.json();
    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json({ error: 'A senha deve ter ao menos 8 caracteres' }, { status: 400 });
    }

    // Trocar senha exigia só uma sessão aberta — nem a senha antiga.
    //
    // A tela /definir-senha (troca obrigatória depois que o administrador
    // reseta) é a única que chama isto, e o middleware só deixa chegar nela
    // quem está nesse estado. Mas a rota aceitava qualquer sessão: quem
    // pegasse um computador destravado, ou uma sessão de outra forma, trocava
    // a senha e ficava com a conta — trancando o dono do lado de fora.
    //
    // Quem está na troca obrigatória entra sem a senha antiga: acabou de usá-la
    // para entrar, e é justamente a senha provisória que se quer substituir.
    // Fora desse estado, a senha atual é obrigatória.
    const dono = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true, mustChangePassword: true },
    });
    if (!dono) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

    if (!dono.mustChangePassword) {
      if (!currentPassword) {
        return NextResponse.json({ error: 'Informe a senha atual' }, { status: 400 });
      }
      const confere = await bcrypt.compare(currentPassword, dono.password);
      if (!confere) {
        return NextResponse.json({ error: 'A senha atual não confere' }, { status: 403 });
      }
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashed, mustChangePassword: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Change password error:', error);
    return NextResponse.json({ error: 'Erro ao alterar senha' }, { status: 500 });
  }
}
