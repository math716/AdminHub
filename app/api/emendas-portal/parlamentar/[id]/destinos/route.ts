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

    // Deduplica registros com o mesmo idPortal (mesma emenda importada mais de uma vez).
    // Mescla os documentos de todos os duplicados para garantir que o porFav
    // consiga deduplicar corretamente dentro de cada emenda.
    type DocRec = {
      cnpjFavorecido: string | null;
      nomeFavorecido: string | null;
      municipioFavorecido: string | null;
      ufFavorecido: string | null;
      codigoIbgeFavorecido: string | null;
      fase: string;
      valor: number;
    };
    type MergedEmenda = {
      idPortal: string;
      numero: string | null;
      tipo: string | null;
      funcao: string | null;
      uf: string | null;
      municipioNome: string | null;
      codigoIbge: string | null;
      beneficiario: string | null;
      valorEmpenhado: number;
      valorPago: number;
      documentos: DocRec[];
    };
    const emendaMergeMap = new Map<string, MergedEmenda>();
    for (const e of emendas) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const eDocs: DocRec[] = (e as any).documentos ?? [];
      const existing = emendaMergeMap.get(e.idPortal);
      if (!existing) {
        emendaMergeMap.set(e.idPortal, {
          idPortal:       e.idPortal,
          numero:         e.numero,
          tipo:           e.tipo,
          funcao:         e.funcao,
          uf:             e.uf,
          municipioNome:  e.municipioNome,
          codigoIbge:     e.codigoIbge,
          beneficiario:   e.beneficiario,
          valorEmpenhado: e.valorEmpenhado,
          valorPago:      e.valorPago,
          documentos:     [...eDocs],
        });
      } else {
        existing.documentos.push(...eDocs);
        if (e.valorEmpenhado > existing.valorEmpenhado) existing.valorEmpenhado = e.valorEmpenhado;
        if (e.valorPago > existing.valorPago)           existing.valorPago      = e.valorPago;
        if (!existing.funcao && e.funcao)               existing.funcao         = e.funcao;
        if (!existing.tipo && e.tipo)                   existing.tipo           = e.tipo;
        if (!existing.municipioNome && e.municipioNome) existing.municipioNome  = e.municipioNome;
        if (!existing.codigoIbge && e.codigoIbge)       existing.codigoIbge     = e.codigoIbge;
        if (!existing.beneficiario && e.beneficiario)   existing.beneficiario   = e.beneficiario;
      }
    }
    const emendaDedup = Array.from(emendaMergeMap.values());

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

    for (const emenda of emendaDedup) {
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
          // Normaliza strings vazias para null antes de gerar a key,
          // pois o portal às vezes envia "" em vez de null no cnpj/nome.
          const cnpj = doc.cnpjFavorecido || null;
          const nome = doc.nomeFavorecido || null;
          const key  = cnpj ?? nome ?? '—';
          const cur = porFav.get(key) ?? {
            cnpj,
            nome,
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
        // Quando existe um grupo sem favorecido ('—') junto com grupos reais,
        // o portal registra o mesmo empenho duas vezes (um sem nome, um com nome).
        // Distribui o pago do grupo nulo para os grupos reais e descarta o nulo
        // para evitar contagem dupla do mesmo valor.
        if (porFav.size > 1 && porFav.has('—')) {
          const dash = porFav.get('—')!;
          porFav.delete('—');
          if (dash.pago > 0) {
            const realFavs = Array.from(porFav.values());
            const totalEmp = realFavs.reduce((s, v) => s + v.empenhado, 0);
            for (const fav of realFavs) {
              const share = totalEmp > 0 ? fav.empenhado / totalEmp : 1 / realFavs.length;
              fav.pago += dash.pago * share;
            }
          }
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
