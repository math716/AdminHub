export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

const MAX_IMPORT = 500;
const BATCH_SIZE = 20;

async function getGabineteAndUser(session: any): Promise<{ gabineteId: string; userId: string } | null> {
  const userId = (session.user as any)?.id;
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { gabineteId: true } });
  if (!user?.gabineteId) return null;
  return { gabineteId: user.gabineteId, userId };
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const ctx = await getGabineteAndUser(session);
    if (!ctx) return NextResponse.json({ error: 'Gabinete não encontrado' }, { status: 400 });

    const body = await request.json();
    const { colaboradores } = body ?? {};
    if (!Array.isArray(colaboradores) || colaboradores.length === 0) {
      return NextResponse.json({ error: 'Nenhum colaborador enviado' }, { status: 400 });
    }
    if (colaboradores.length > MAX_IMPORT) {
      return NextResponse.json({ error: `Máximo ${MAX_IMPORT} colaboradores por importação` }, { status: 400 });
    }

    const valid = colaboradores.filter(c => c.nome?.trim());
    const skipped = colaboradores.length - valid.length;

    let imported = 0;
    let errors = 0;

    // Process in parallel batches to avoid overloading the connection pool
    for (let i = 0; i < valid.length; i += BATCH_SIZE) {
      const batch = valid.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(c => {
          const regioes: string[] = typeof c.regioes === 'string'
            ? c.regioes.split(',').map((r: string) => r.trim()).filter(Boolean)
            : [];

          return prisma.colaborador.create({
            data: {
              nome: c.nome.trim(),
              telefone: c.telefone?.trim() || null,
              email: c.email?.trim() || null,
              endereco: c.endereco?.trim() || null,
              lat: null,
              lng: null,
              funcao: c.funcao?.trim() || null,
              observacao: c.observacao?.trim() || null,
              status: 'ATIVO',
              gabineteId: ctx.gabineteId,
              createdById: ctx.userId,
              regioes: regioes.length > 0 ? {
                create: regioes.map(r => ({ uf: 'DF', regiaoNome: r, tipo: 'RA' })),
              } : undefined,
            },
            select: { id: true },
          });
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled') imported++;
        else errors++;
      }
    }

    return NextResponse.json({ imported, errors: errors + skipped });
  } catch (error) {
    console.error('POST /api/colaboradores/import error:', error);
    return NextResponse.json({ error: 'Erro na importação' }, { status: 500 });
  }
}
