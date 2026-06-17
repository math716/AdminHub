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

    const userRole    = (session.user as any)?.role;
    const adminId     = (session.user as any)?.id as string | undefined;
    const adminName   = session.user?.name ?? 'Admin';

    if (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Apenas Administrador pode excluir gabinetes' }, { status: 403 });
    }

    const gabinete = await prisma.gabinete.findUnique({ where: { id: params.id } });
    if (!gabinete) return NextResponse.json({ error: 'Gabinete não encontrado' }, { status: 404 });
    if (gabinete.deletedAt) return NextResponse.json({ error: 'Gabinete já está na lixeira' }, { status: 409 });

    await prisma.gabinete.update({
      where: { id: params.id },
      data: {
        deletedAt:     new Date(),
        deletedById:   adminId ?? null,
        deletedByName: adminName,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete gabinete error:', error);
    return NextResponse.json({ error: 'Erro ao excluir gabinete' }, { status: 500 });
  }
}
