export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

// Endpoint combinado que serve o load inicial da pagina Mapa do Gabinete.
// Substitui 3 chamadas paralelas (/api/demands + /api/agenda + /api/emendas)
// por 1 unica Lambda — corta 2/3 do custo de cold-start em serverless e
// evita abrir 3 conexoes Postgres simultaneas.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const gabineteId = (session.user as any)?.gabineteId as string | undefined;
    if (!gabineteId) return NextResponse.json({ error: 'Usuário sem gabinete associado' }, { status: 403 });

    // Auto-delete past agenda events (fire-and-forget, igual /api/agenda).
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    prisma.agendaEvent.deleteMany({
      where: {
        gabineteId,
        OR: [
          { dataFim: { lt: startOfToday } },
          { dataFim: null, data: { lt: startOfToday } },
        ],
      },
    }).catch((e: unknown) => console.error('agenda cleanup error:', e));

    // Tres queries em paralelo no MESMO processo — uma unica conexao do pool.
    const [demands, agendaEvents, emendas] = await Promise.all([
      prisma.demand.findMany({
        where: { gabineteId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, title: true, description: true, solicitante: true,
          contato: true, estado: true, municipio: true, bairro: true,
          endereco: true, lat: true, lng: true, category: true, status: true,
          priority: true, observations: true, closedAt: true, gabineteId: true,
          createdById: true, createdAt: true, updatedAt: true,
          createdBy: { select: { name: true, email: true } },
        },
      }),
      prisma.agendaEvent.findMany({
        where: { gabineteId },
        orderBy: { data: 'asc' },
        include: { createdBy: { select: { name: true } } },
      }),
      prisma.emenda.findMany({
        where: { gabineteId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, titulo: true, descricao: true, valor: true, autor: true,
          numero: true, ano: true, tipo: true, orgaoExecutor: true,
          status: true, beneficiario: true, estado: true, municipio: true,
          bairro: true, endereco: true, lat: true, lng: true,
          documentoNome: true, observations: true, gabineteId: true,
          createdById: true, createdAt: true, updatedAt: true,
          createdBy: { select: { name: true, email: true } },
        },
      }),
    ]);

    return NextResponse.json({
      demands:      demands      ?? [],
      agendaEvents: agendaEvents ?? [],
      emendas:      emendas      ?? [],
    }, {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=120' },
    });
  } catch (error) {
    console.error('GET /api/dashboard/mapa-gabinete error:', error);
    return NextResponse.json({ error: 'Erro ao buscar dados do mapa' }, { status: 500 });
  }
}
