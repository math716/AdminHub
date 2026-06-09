/**
 * Retorna lista flat de destinos (favorecidos) para um parlamentar num dado ano/UF.
 *
 * Para emendas que já têm EmendaDocumento (enriquecidas), expande cada favorecido
 * como uma linha separada. Para emendas sem documentos, usa o município da
 * EmendaParlamentar como destino único (fallback).
 *
 * Isso alimenta a tabela "Detalhe das emendas" com todos os reais destinos do
 * parlamentar, em vez de mostrar apenas um município por emenda.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { id } = params;
    const sp = request.nextUrl.searchParams;
    const ano    = sp.get('ano') ? parseInt(sp.get('ano')!, 10) : undefined;
    const uf     = sp.get('uf') ?? undefined;
    const esfera = sp.get('esfera')?.toUpperCase() || undefined;

    // Localiza o parlamentar pelo CPF ou idPortal
    const parlamentar = await prisma.parlamentar.findFirst({
      where: {
        OR: [
          { cpf: id },
          { idPortal: id },
        ],
      },
      select: { id: true },
    });
    if (!parlamentar) {
      return NextResponse.json({ destinos: [], total: 0 });
    }

    // Busca todas as emendas do parlamentar no ano/UF solicitado
    const emendas = await prisma.emendaParlamentar.findMany({
      where: {
        parlamentarId: parlamentar.id,
        ...(ano    ? { ano }    : {}),
        ...(uf     ? { uf }     : {}),
        ...(esfera ? { esfera } : {}),
      },
      select: {
        id: true,
        idPortal: true,
        numero: true,
        tipo: true,
        funcao: true,
        uf: true,
        municipioNome: true,
        codigoIbge: true,
        beneficiario: true,
        valorEmpenhado: true,
        valorPago: true,
        documentos: {
          where: uf ? { ufFavorecido: uf } : {},
          select: {
            cnpjFavorecido: true,
            nomeFavorecido: true,
            municipioFavorecido: true,
            ufFavorecido: true,
            codigoIbgeFavorecido: true,
            fase: true,
            valor: true,
          },
        },
      },
      orderBy: { valorEmpenhado: 'desc' },
    });

    type DestinoRow = {
      codigoEmenda: string;
      numeroEmenda: string | null;
      tipoEmenda: string | null;
      funcao: string | null;
      nomeFavorecido: string | null;
      cnpjFavorecido: string | null;
      municipio: string | null;
      uf: string | null;
      codigoIbge: string | null;
      valorEmpenhado: number;
      valorPago: number;
      fonte: 'documento' | 'emenda';
    };

    const destinos: DestinoRow[] = [];

    for (const emenda of emendas) {
      if (emenda.documentos.length > 0) {
        // Agrupa documentos por favorecido (cnpj ou nome)
        type Acum = {
          cnpj: string | null;
          nome: string | null;
          municipio: string | null;
          uf: string | null;
          codigoIbge: string | null;
          empenhado: number;
          pago: number;
        };
        const porFav = new Map<string, Acum>();
        for (const doc of emenda.documentos) {
          const key = doc.cnpjFavorecido ?? doc.nomeFavorecido ?? '—';
          const cur = porFav.get(key) ?? {
            cnpj:       doc.cnpjFavorecido,
            nome:       doc.nomeFavorecido,
            municipio:  doc.municipioFavorecido,
            uf:         doc.ufFavorecido,
            codigoIbge: doc.codigoIbgeFavorecido,
            empenhado:  0,
            pago:       0,
          };
          const fase = (doc.fase ?? '').toLowerCase();
          if (fase.includes('empenho'))    cur.empenhado += doc.valor;
          if (fase.includes('pagamento'))  cur.pago      += doc.valor;
          porFav.set(key, cur);
        }
        for (const fav of porFav.values()) {
          destinos.push({
            codigoEmenda:  emenda.idPortal,
            numeroEmenda:  emenda.numero,
            tipoEmenda:    emenda.tipo,
            funcao:        emenda.funcao,
            nomeFavorecido: fav.nome,
            cnpjFavorecido: fav.cnpj,
            municipio:     fav.municipio,
            uf:            fav.uf,
            codigoIbge:    fav.codigoIbge,
            valorEmpenhado: fav.empenhado,
            valorPago:      fav.pago,
            fonte:         'documento',
          });
        }
      } else {
        // Sem documentos — usa os dados da própria emenda como fallback
        destinos.push({
          codigoEmenda:   emenda.idPortal,
          numeroEmenda:   emenda.numero,
          tipoEmenda:     emenda.tipo,
          funcao:         emenda.funcao,
          nomeFavorecido: emenda.beneficiario,
          cnpjFavorecido: null,
          municipio:      emenda.municipioNome,
          uf:             emenda.uf,
          codigoIbge:     emenda.codigoIbge,
          valorEmpenhado: emenda.valorEmpenhado,
          valorPago:      emenda.valorPago,
          fonte:          'emenda',
        });
      }
    }

    // Ordena por valor empenhado desc
    destinos.sort((a, b) => b.valorEmpenhado - a.valorEmpenhado);

    return NextResponse.json({ destinos, total: destinos.length });
  } catch (error) {
    console.error('GET /api/emendas-portal/parlamentar/[id]/destinos error:', error);
    return NextResponse.json({ error: 'Erro ao buscar destinos' }, { status: 500 });
  }
}
