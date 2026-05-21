export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { listEmendasPorMunicipio, PORTAL_MOCK_MODE } from '@/lib/portal-transparencia';

export async function GET(request: NextRequest, { params }: { params: { codigo: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const codigoIbge = params.codigo;
    const uf = request.nextUrl.searchParams.get('uf') ?? '';
    const anoRaw = request.nextUrl.searchParams.get('ano');
    const ano = anoRaw ? parseInt(anoRaw, 10) : undefined;

    const emendas = await listEmendasPorMunicipio({ codigoIbge, uf, ano });
    return NextResponse.json({ emendas, mock: PORTAL_MOCK_MODE });
  } catch (error) {
    console.error('GET /api/emendas-portal/municipio/[codigo]/emendas error:', error);
    return NextResponse.json({ error: 'Erro ao buscar emendas do município' }, { status: 500 });
  }
}
