export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { searchParlamentares, PORTAL_MOCK_MODE } from '@/lib/portal-transparencia';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const q = request.nextUrl.searchParams.get('q') ?? '';
    if (q.trim().length < 2) return NextResponse.json({ results: [], mock: PORTAL_MOCK_MODE });

    const results = await searchParlamentares(q);
    return NextResponse.json({ results, mock: PORTAL_MOCK_MODE });
  } catch (error) {
    console.error('GET /api/emendas-portal/parlamentares error:', error);
    return NextResponse.json({ error: 'Erro ao buscar parlamentares' }, { status: 500 });
  }
}
