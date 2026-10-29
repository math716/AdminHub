export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exigirAcesso } from '@/lib/acesso-api';
import { z } from 'zod';
import { lerCorpo, v } from '@/lib/validacao-api';
import bcrypt from 'bcryptjs';

const TrocaDeSenha = z.object({
  newPassword: z.string({ required_error: 'A senha deve ter ao menos 8 caracteres', invalid_type_error: 'Nova senha: valor inválido.' })
    .min(8, 'A senha deve ter ao menos 8 caracteres')
    .max(200, 'Nova senha: no máximo 200 caracteres.'),
  currentPassword: z.string({ invalid_type_error: 'Senha atual: valor inválido.' }).max(200).nullish(),
}).passthrough();

export async function POST(req: NextRequest) {
  try {
    const acesso = await exigirAcesso();
    if (acesso instanceof NextResponse) return acesso;
    const { userId } = acesso;

    const body = await lerCorpo(req, TrocaDeSenha);
    if (body instanceof NextResponse) return body;
    const { newPassword, currentPassword } = body;

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
