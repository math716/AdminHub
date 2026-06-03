export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { listEmendasPorParlamentar, PORTAL_MOCK_MODE } from '@/lib/portal-transparencia';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const id = params.id;
    const anoRaw = request.nextUrl.searchParams.get('ano');
    const ano = anoRaw ? parseInt(anoRaw, 10) : undefined;
    // Filtro opcional de UF — quando dashboard está no contexto de um estado,
    // limita resultados àquele estado pra os totais refletirem a "fatia" do
    // parlamentar naquele UF, não o total nacional dele.
    const uf = request.nextUrl.searchParams.get('uf')?.toUpperCase() || undefined;

    // id pode ser: CPF (11 dígitos), idPortal (= nome no nosso caso), ou o nome direto
    const isCpf = /^\d{11}$/.test(id);

    // 1) Banco
    const parlamentar = await prisma.parlamentar.findFirst({
      where: isCpf
        ? { cpf: id }
        : { OR: [{ idPortal: id }, { nome: id }] },
      select: { id: true },
    });

    if (parlamentar) {
      const rows = await prisma.emendaParlamentar.findMany({
        where: {
          parlamentarId: parlamentar.id,
          ...(ano ? { ano } : {}),
          ...(uf  ? { uf  } : {}),
        },
        select: {
          id: true,
          idPortal: true, ano: true, numero: true, tipo: true, funcao: true,
          area: true, objeto: true, valorEmpenhado: true, valorPago: true, valorRestoPago: true,
          uf: true, codigoIbge: true, municipioNome: true,
          beneficiario: true, cnpjBeneficiario: true,
          parlamentar: { select: { cpf: true, nome: true, cargo: true, partido: true, uf: true } },
        },
        orderBy: [{ ano: 'desc' }, { valorEmpenhado: 'desc' }],
      });

      // Transferências Pix: destinos reais de emendas individuais de
      // Transferência Especial. Vão pro card "Municípios via Pix" no dashboard
      // mesmo quando todas as emendas estão a nível UF.
      const transferenciasPix = await prisma.transferenciaPix.findMany({
        where: {
          parlamentarId: parlamentar.id,
          ...(ano ? { ano } : {}),
          ...(uf  ? { uf  } : {}),
        },
        select: {
          idPortal: true, ano: true, mes: true, dataReferencia: true, valor: true,
          uf: true, codigoIbge: true, municipioNome: true,
          beneficiarioNome: true, cnpjBeneficiario: true,
          emendaIdPortal: true,
        },
        orderBy: [{ ano: 'desc' }, { valor: 'desc' }],
      });

      if (rows.length > 0 || transferenciasPix.length > 0) {
        // Corrige scalars desatualizados usando valores dos documentos quando disponíveis
        const emendaIds = rows.map((e) => e.id);
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

        const emendas = rows.map((e) => {
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
        return NextResponse.json({
          emendas,
          transferenciasPix,
          mock: false,
          fonte: 'banco',
        });
      }
    }

    // 2) Fallback Portal — usando nome (id costuma ser o nome em maiúsculas).
    // No fallback ao Portal não puxamos Pix em tempo real (custoso); fica
    // array vazio até o sync rodar.
    const emendas = await listEmendasPorParlamentar({
      cpf: isCpf ? id : undefined,
      idPortal: !isCpf ? id : undefined,
      nome: !isCpf ? id : undefined,
      ano,
    });
    return NextResponse.json({
      emendas,
      transferenciasPix: [],
      mock: PORTAL_MOCK_MODE,
      fonte: 'portal',
    });
  } catch (error) {
    console.error('GET /api/emendas-portal/parlamentar/[id] error:', error);
    return NextResponse.json({ error: 'Erro ao buscar emendas do parlamentar' }, { status: 500 });
  }
}
