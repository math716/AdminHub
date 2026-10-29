export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exigirAcesso } from '@/lib/acesso-api';
import { z } from 'zod';
import { lerCorpo, v } from '@/lib/validacao-api';

// null = sair do gabinete; texto = trocar (o tipo segue conferido abaixo).
const Troca = z.object({ gabineteId: z.unknown() }).passthrough();

/** Permite que ADMIN/SUPER_ADMIN atualizem o próprio gabineteId no banco.
 *  Body: { gabineteId: string | null }
 */
export async function PATCH(request: NextRequest) {
  try {
    const acesso = await exigirAcesso({ papeis: ['ADMIN', 'SUPER_ADMIN'] });
    if (acesso instanceof NextResponse) return acesso;
    const { userId } = acesso;

    const body = await lerCorpo(request, Troca);
    if (body instanceof NextResponse) return body;
    const { gabineteId } = body;

    // gabineteId pode ser string (trocar de gabinete) ou null (remover associação)
    if (gabineteId !== null && typeof gabineteId !== 'string') {
      return NextResponse.json({ error: 'gabineteId inválido' }, { status: 400 });
    }

    if (gabineteId) {
      const exists = await prisma.gabinete.findUnique({ where: { id: gabineteId }, select: { id: true } });
      if (!exists) return NextResponse.json({ error: 'Gabinete não encontrado' }, { status: 404 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { gabineteId: gabineteId ?? null },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('me/gabinete PATCH error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar gabinete' }, { status: 500 });
  }
}
