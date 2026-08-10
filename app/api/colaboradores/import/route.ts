export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

const MAX_IMPORT = 500;

async function getGabineteAndUser(session: any): Promise<{ gabineteId: string; userId: string } | null> {
  const userId = (session.user as any)?.id;
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { gabineteId: true } });
  if (!user?.gabineteId) return null;
  return { gabineteId: user.gabineteId, userId };
}

async function geocode(endereco: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(endereco)}&limit=1&countrycodes=br`;
    const res = await fetch(url, { headers: { 'User-Agent': 'AdminHub/1.0' } });
    const data = await res.json();
    if (data?.[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {}
  return null;
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

    let imported = 0;
    let errors = 0;
    let geocodificados = 0;

    for (const c of colaboradores) {
      if (!c.nome?.trim()) { errors++; continue; }
      try {
        let lat: number | null = null;
        let lng: number | null = null;
        if (c.endereco?.trim()) {
          const geo = await geocode(c.endereco.trim());
          if (geo) { lat = geo.lat; lng = geo.lng; geocodificados++; }
          await new Promise(r => setTimeout(r, 250)); // rate limit Nominatim
        }

        const regioes: string[] = typeof c.regioes === 'string'
          ? c.regioes.split(',').map((r: string) => r.trim()).filter(Boolean)
          : [];

        await prisma.colaborador.create({
          data: {
            nome: c.nome.trim(),
            telefone: c.telefone?.trim() || null,
            email: c.email?.trim() || null,
            endereco: c.endereco?.trim() || null,
            lat, lng,
            funcao: c.funcao?.trim() || null,
            observacao: c.observacao?.trim() || null,
            status: 'ATIVO',
            gabineteId: ctx.gabineteId,
            createdById: ctx.userId,
            regioes: regioes.length > 0 ? {
              create: regioes.map(r => ({ uf: 'DF', regiaoNome: r })),
            } : undefined,
          },
        });
        imported++;
      } catch {
        errors++;
      }
    }

    return NextResponse.json({ imported, errors, geocodificados });
  } catch (error) {
    console.error('POST /api/colaboradores/import error:', error);
    return NextResponse.json({ error: 'Erro na importação' }, { status: 500 });
  }
}
