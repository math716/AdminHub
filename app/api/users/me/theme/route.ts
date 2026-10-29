export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exigirAcesso } from '@/lib/acesso-api';

const VALID_THEMES = ['light', 'dark'] as const;
type Theme = (typeof VALID_THEMES)[number];

export async function PATCH(req: NextRequest) {
  try {
    const acesso = await exigirAcesso();
    if (acesso instanceof NextResponse) return acesso;
    const { userId } = acesso;

    const body = await req.json().catch(() => ({}));
    const theme = body?.theme as Theme | undefined;

    if (!theme || !VALID_THEMES.includes(theme)) {
      return NextResponse.json(
        { error: 'theme deve ser "light" ou "dark"' },
        { status: 400 },
      );
    }

    await prisma.user.update({
      where: { id: userId },
      data: { theme },
    });

    return NextResponse.json({ success: true, theme });
  } catch (error) {
    console.error('Update theme error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar tema' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const acesso = await exigirAcesso();
    if (acesso instanceof NextResponse) return acesso;
    const { userId } = acesso;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { theme: true },
    });

    return NextResponse.json({ theme: (user?.theme as Theme) ?? 'dark' });
  } catch (error) {
    console.error('Get theme error:', error);
    return NextResponse.json({ error: 'Erro ao buscar tema' }, { status: 500 });
  }
}
