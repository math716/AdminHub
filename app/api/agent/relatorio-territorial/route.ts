export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { montarRelatorioTerritorial } from '@/lib/agent/report/territorial-doc';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await request.json();
    const ano   = body.ano ? Number(body.ano) : 2022;
    const uf    = (body.uf ?? 'DF').toUpperCase();
    const cargo = body.cargo ?? 'Deputado Distrital';
    const nomes: string[] = Array.isArray(body.deputados)
      ? body.deputados.map((n: any) => String(n).trim()).filter((n: string) => n.length > 1)
      : [];

    if (uf !== 'DF') {
      return NextResponse.json({ error: 'Relatório territorial disponível apenas para o DF.' }, { status: 400 });
    }
    if (nomes.length === 0) {
      return NextResponse.json({ error: 'Informe ao menos um deputado.' }, { status: 400 });
    }

    const pdfBuffer = await montarRelatorioTerritorial({ ano, uf, cargo, nomes });

    return new NextResponse(pdfBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="gabi-relatorio-territorial-${Date.now()}.pdf"`,
      },
    });
  } catch (err) {
    console.error('[/api/agent/relatorio-territorial]', err);
    return NextResponse.json({ error: 'Erro ao gerar relatório territorial.' }, { status: 500 });
  }
}
