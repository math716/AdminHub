export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

const VALID_THEMES = ['light', 'dark'] as const;
type Theme = (typeof VALID_THEMES)[number];

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const userId = (session.user as any)?.id;
    if (!userId) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 });

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
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const userId = (session.user as any)?.id;
    if (!userId) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 });

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
