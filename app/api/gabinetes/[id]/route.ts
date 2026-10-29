export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exigirAcesso } from '@/lib/acesso-api';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const acesso = await exigirAcesso();
    if (acesso instanceof NextResponse) return acesso;
    const { role: userRole, userId: adminId } = acesso;
    const adminName = acesso.session.user?.name ?? 'Admin';

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
