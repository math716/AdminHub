export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { filtroEsferaAtiva } from '@/lib/emendas/estados-ativos';
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
    // inteira numa cidade e sumia com ela das outras. Vale a soma dos
    // documentos por município (emendas_municipios); só a emenda sem essa
    // soma (estaduais, federais ainda não reimportadas) vai pelo cadastro.
    const noBanco = await prisma.emendaParlamentar.findMany({
      where: {
        ...(ano ? { ano } : {}),
        ...(esfera ? { esfera } : {}),
        // Estaduais só das UFs com importação conferida.
        AND: [filtroEsferaAtiva],
        OR: [
          { municipios: { some: { codigoIbge } } },
          { codigoIbge, municipios: { none: {} } },
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
      const porMunicipio = await prisma.emendaMunicipio.findMany({
        where: { emendaId: { in: emendaIds } },
        select: { emendaId: true, codigoIbge: true, municipio: true, empenhado: true, pago: true },
      });
      const nomeDaCidade = porMunicipio.find((m) => m.codigoIbge === codigoIbge && m.municipio)?.municipio ?? null;

      // Por emenda: o pedaço DESTE município e em quantos municípios ela foi
      // dividida (só conta município que recebeu empenho).
      type Vals = { aqui: { empenhado: number; pago: number } | null; municipios: Set<string> };
      const docValMap = new Map<string, Vals>();
      for (const m of porMunicipio) {
        const cur = docValMap.get(m.emendaId) ?? { aqui: null, municipios: new Set<string>() };
        if (m.empenhado) cur.municipios.add(m.codigoIbge);
        if (m.codigoIbge === codigoIbge) cur.aqui = { empenhado: m.empenhado, pago: m.pago };
        docValMap.set(m.emendaId, cur);
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
          valorEmpenhado: aqui ? aqui.empenhado : e.valorEmpenhado,
          valorPago:      aqui ? aqui.pago      : e.valorPago,
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
