export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { listEmendasPorMunicipio, PORTAL_MOCK_MODE } from '@/lib/portal-transparencia';
import { semPermissao } from '@/lib/acesso-api';
import { PERMISSIONS } from '@/lib/permissions';

export async function GET(request: NextRequest, { params }: { params: { codigo: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const negado = semPermissao(session, PERMISSIONS.EMENDAS_MAPA);
    if (negado) return negado;

    const codigoIbge = params.codigo;
    const uf = request.nextUrl.searchParams.get('uf') ?? '';
    const anoRaw = request.nextUrl.searchParams.get('ano');
    const ano = anoRaw ? parseInt(anoRaw, 10) : undefined;
    const esferaRaw = request.nextUrl.searchParams.get('esfera');
    const esfera = esferaRaw === 'FEDERAL' || esferaRaw === 'ESTADUAL' ? esferaRaw : null;

    // 1) Banco
    //
    // Uma emenda federal costuma ser DIVIDIDA entre vários municípios, e o
    // cadastro da emenda guarda um só. Buscar por ele mostrava a emenda
    // inteira numa cidade e sumia com ela das outras. Vale o que os documentos
    // dizem (município de destino de cada pedaço); só a emenda sem essa
    // informação nos documentos (estaduais) vai pelo cadastro.
    const noBanco = await prisma.emendaParlamentar.findMany({
      where: {
        ...(ano ? { ano } : {}),
        ...(esfera ? { esfera } : {}),
        OR: [
          { documentos: { some: { codigoIbgeDestino: codigoIbge } } },
          { codigoIbge, documentos: { none: { codigoIbgeDestino: { not: null } } } },
        ],
      },
      select: {
        id: true,
        idPortal: true, ano: true, numero: true, tipo: true, funcao: true,
        area: true, objeto: true, valorEmpenhado: true, valorPago: true, valorRestoPago: true,
        valorProposto: true, esfera: true,
        uf: true, codigoIbge: true, municipioNome: true,
        beneficiario: true, cnpjBeneficiario: true,
        parlamentar: { select: { cpf: true, nome: true, cargo: true, partido: true, uf: true } },
      },
      orderBy: { valorEmpenhado: 'desc' },
      take: 5000,
    });

    if (noBanco.length > 0) {
      const emendaIds = noBanco.map((e) => e.id);
      const nomeDaCidade = (await prisma.emendaDocumento.findFirst({
        where: { codigoIbgeDestino: codigoIbge, municipioDestino: { not: null } },
        select: { municipioDestino: true },
      }))?.municipioDestino ?? null;
      const docAggs = emendaIds.length > 0
        ? await prisma.emendaDocumento.groupBy({
            by: ['emendaId', 'fase', 'codigoIbgeDestino'],
            where: { emendaId: { in: emendaIds } },
            _sum: { valor: true },
          })
        : [];

      // Por emenda: o que os documentos somam (a emenda toda), o pedaço DESTE
      // município e em quantos municípios ela foi dividida.
      type Vals = { empenhado: number; pago: number; aqui: { empenhado: number; pago: number } | null; municipios: Set<string> };
      const docValMap = new Map<string, Vals>();
      for (const d of docAggs) {
        const cur = docValMap.get(d.emendaId) ?? { empenhado: 0, pago: 0, aqui: null, municipios: new Set<string>() };
        const fase = d.fase.toLowerCase();
        const valor = d._sum.valor ?? 0;
        const emp = fase.includes('empenho') ? valor : 0;
        const pago = fase.includes('pagamento') ? valor : 0;
        cur.empenhado += emp;
        cur.pago += pago;
        if (d.codigoIbgeDestino) {
          if (emp) cur.municipios.add(d.codigoIbgeDestino);
          if (d.codigoIbgeDestino === codigoIbge) {
            cur.aqui ??= { empenhado: 0, pago: 0 };
            cur.aqui.empenhado += emp;
            cur.aqui.pago += pago;
          }
        }
        docValMap.set(d.emendaId, cur);
      }

      const emendas = noBanco.map((e) => {
        const docVals = docValMap.get(e.id);
        // Emenda dividida: vale o pedaço desta cidade; o total da emenda vai
        // junto para a tela dizer "de R$ X, dividida entre N municípios".
        const aqui = docVals?.aqui;
        const dividida = aqui && docVals.municipios.size > 1;
        return {
          idPortal:       e.idPortal,
          ano:            e.ano,
          numero:         e.numero,
          tipo:           e.tipo,
          funcao:         e.funcao,
          subfuncao:      null,
          area:           e.area,
          objeto:         e.objeto,
          valorEmpenhado: aqui ? aqui.empenhado : docVals ? docVals.empenhado : e.valorEmpenhado,
          valorPago:      aqui ? aqui.pago      : docVals ? docVals.pago       : e.valorPago,
          // Resto pago é da emenda inteira — não dá para atribuir a uma cidade.
          valorRestoPago: dividida ? 0 : e.valorRestoPago,
          ...(dividida && {
            valorEmpenhadoEmenda: e.valorEmpenhado,
            municipiosNaEmenda:   docVals.municipios.size,
          }),
          // O governo do estado não publicou o valor (zeros não são valor).
          semValorPublicado: e.esfera === 'ESTADUAL' && !e.valorEmpenhado && !e.valorPago && e.valorProposto == null,
          valorProposto:  null,
          orgaoExecutor:  null,
          beneficiario:   e.beneficiario ?? null,
          cnpjBeneficiario: e.cnpjBeneficiario ?? null,
          uf:             e.uf,
          codigoIbge:     aqui ? codigoIbge : e.codigoIbge,
          municipioNome:  aqui ? (nomeDaCidade ?? e.municipioNome) : e.municipioNome,
          autorCpf:       e.parlamentar?.cpf ?? null,
          autorNome:      e.parlamentar?.nome ?? '—',
          autorCargo:     e.parlamentar?.cargo ?? 'DEPUTADO_FEDERAL',
          autorPartido:   e.parlamentar?.partido ?? null,
          autorUf:        e.parlamentar?.uf ?? null,
        };
      });
      emendas.sort((a, b) => b.valorEmpenhado - a.valorEmpenhado);
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
