export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { listEmendasPorParlamentar, PORTAL_MOCK_MODE } from '@/lib/portal-transparencia';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const id = params.id;
    const anoRaw = request.nextUrl.searchParams.get('ano');
    const ano = anoRaw ? parseInt(anoRaw, 10) : undefined;

    // id pode ser CPF (11 dígitos) ou idPortal
    const isCpf = /^\d{11}$/.test(id);

    const emendas = await listEmendasPorParlamentar({
      cpf: isCpf ? id : undefined,
      idPortal: !isCpf ? id : undefined,
      ano,
    });

    return NextResponse.json({ emendas, mock: PORTAL_MOCK_MODE });
  } catch (error) {
    console.error('GET /api/emendas-portal/parlamentar/[id] error:', error);
    return NextResponse.json({ error: 'Erro ao buscar emendas do parlamentar' }, { status: 500 });
  }
}
