export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { listEmendasPorMunicipio, PORTAL_MOCK_MODE } from '@/lib/portal-transparencia';

export async function GET(request: NextRequest, { params }: { params: { codigo: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const codigoIbge = params.codigo;
    const uf = request.nextUrl.searchParams.get('uf') ?? '';
    const anoRaw = request.nextUrl.searchParams.get('ano');
    const ano = anoRaw ? parseInt(anoRaw, 10) : undefined;
    const esferaRaw = request.nextUrl.searchParams.get('esfera');
    const esfera = esferaRaw === 'FEDERAL' || esferaRaw === 'ESTADUAL' ? esferaRaw : null;

    // 1) Banco
    const noBanco = await prisma.emendaParlamentar.findMany({
      where: { codigoIbge, ...(ano ? { ano } : {}), ...(esfera ? { esfera } : {}) },
      select: {
        id: true,
        idPortal: true, ano: true, numero: true, tipo: true, funcao: true,
        area: true, objeto: true, valorEmpenhado: true, valorPago: true, valorRestoPago: true,
        uf: true, codigoIbge: true, municipioNome: true,
        beneficiario: true, cnpjBeneficiario: true,
        parlamentar: { select: { cpf: true, nome: true, cargo: true, partido: true, uf: true } },
      },
      orderBy: { valorEmpenhado: 'desc' },
      take: 5000,
    });

    if (noBanco.length > 0) {
      const emendaIds = noBanco.map((e) => e.id);
      const docAggs = emendaIds.length > 0
        ? await prisma.emendaDocumento.groupBy({
            by: ['emendaId', 'fase'],
            where: { emendaId: { in: emendaIds } },
            _sum: { valor: true },
          })
        : [];

      const docValMap = new Map<string, { empenhado: number; pago: number }>();
      for (const d of docAggs) {
        const cur = docValMap.get(d.emendaId) ?? { empenhado: 0, pago: 0 };
        const fase = d.fase.toLowerCase();
        if (fase.includes('empenho')) cur.empenhado += d._sum.valor ?? 0;
        else if (fase.includes('pagamento')) cur.pago += d._sum.valor ?? 0;
        docValMap.set(d.emendaId, cur);
      }

      const emendas = noBanco.map((e) => {
        const docVals = docValMap.get(e.id);
        return {
          idPortal:       e.idPortal,
          ano:            e.ano,
          numero:         e.numero,
          tipo:           e.tipo,
          funcao:         e.funcao,
          subfuncao:      null,
          area:           e.area,
          objeto:         e.objeto,
          valorEmpenhado: docVals ? docVals.empenhado : e.valorEmpenhado,
          valorPago:      docVals ? docVals.pago       : e.valorPago,
          valorRestoPago: e.valorRestoPago,
          valorProposto:  null,
          orgaoExecutor:  null,
          beneficiario:   e.beneficiario ?? null,
          cnpjBeneficiario: e.cnpjBeneficiario ?? null,
          uf:             e.uf,
          codigoIbge:     e.codigoIbge,
          municipioNome:  e.municipioNome,
          autorCpf:       e.parlamentar?.cpf ?? null,
          autorNome:      e.parlamentar?.nome ?? '—',
          autorCargo:     e.parlamentar?.cargo ?? 'DEPUTADO_FEDERAL',
          autorPartido:   e.parlamentar?.partido ?? null,
          autorUf:        e.parlamentar?.uf ?? null,
        };
      });
      return NextResponse.json({ emendas, mock: false, fonte: 'banco' });
    }

    // 2) Fallback Portal
    const emendas = await listEmendasPorMunicipio({ codigoIbge, uf, ano });
    return NextResponse.json({ emendas, mock: PORTAL_MOCK_MODE, fonte: 'portal' });
  } catch (error) {
    console.error('GET /api/emendas-portal/municipio/[codigo]/emendas error:', error);
    return NextResponse.json({ error: 'Erro ao buscar emendas do município' }, { status: 500 });
  }
}
