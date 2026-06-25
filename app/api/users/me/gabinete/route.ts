export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

/** Permite que ADMIN/SUPER_ADMIN atualizem o próprio gabineteId no banco.
 *  Body: { gabineteId: string | null }
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const role   = (session.user as any)?.role as string;
    const userId = (session.user as any)?.id   as string;

    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    const body = await request.json();
    const { gabineteId } = body ?? {};

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
