export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const userRole = (session.user as any)?.role;
    if (userRole !== 'ADMIN') {
      return NextResponse.json({ error: 'Apenas ADMIN pode excluir gabinetes' }, { status: 403 });
    }

    const gabinete = await prisma.gabinete.findUnique({ where: { id: params.id } });
    if (!gabinete) return NextResponse.json({ error: 'Gabinete não encontrado' }, { status: 404 });

    await prisma.gabinete.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete gabinete error:', error);
    return NextResponse.json({ error: 'Erro ao excluir gabinete' }, { status: 500 });
  }
}
