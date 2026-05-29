/**
 * Documentos detalhados de uma emenda parlamentar — favorecido, descrição,
 * breakdown por fase (Empenho/Liquidação/Pagamento).
 *
 * Carregado lazy pela UI quando o usuário expande o card de uma emenda
 * (evita inflar o payload da lista). Lê de EmendaDocumento, que é populado
 * pelo cron de enrich (/api/cron/enrich-emendas).
 *
 * Se a emenda ainda não foi enriquecida, retorna lista vazia + flag
 * `pendingEnrich: true` pra UI exibir mensagem apropriada.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest, { params }: { params: { codigo: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const codigoEmenda = params.codigo;
    const uf = request.nextUrl.searchParams.get('uf') ?? undefined;

    const emenda = await prisma.emendaParlamentar.findUnique({
      where: { idPortal: codigoEmenda },
      select: {
        id: true,
        idPortal: true,
        ano: true,
        numero: true,
        tipo: true,
        esfera: true,
        valorEmpenhado: true,
        valorPago: true,
      },
    });

    if (!emenda) {
      return NextResponse.json({
        emenda: null,
        documentos: [],
        pendingEnrich: false,
        notFound: true,
      });
    }

    const documentos = await prisma.emendaDocumento.findMany({
      where: { emendaId: emenda.id, ...(uf ? { ufFavorecido: uf } : {}) },
      orderBy: [{ data: 'asc' }, { fase: 'asc' }],
      select: {
        codigoDocumento: true,
        codigoDocumentoResumido: true,
        fase: true,
        data: true,
        valor: true,
        cnpjFavorecido: true,
        nomeFavorecido: true,
        ufFavorecido: true,
        municipioFavorecido: true,
        codigoIbgeFavorecido: true,
        subTitulo: true,
        observacao: true,
        programa: true,
        acao: true,
        orgao: true,
        orgaoSuperior: true,
      },
    });

    // Agrega por favorecido e por fase pra exibição
    type Acum = {
      cnpj: string | null;
      nome: string;
      uf: string | null;
      municipio: string | null;
      codigoIbge: string | null;
      total: number;
      qtdDocumentos: number;
    };
    const porFavorecido = new Map<string, Acum>();
    const porFase = new Map<string, { fase: string; total: number; qtd: number }>();

    for (const d of documentos) {
      const key = d.cnpjFavorecido ?? d.nomeFavorecido ?? '—';
      const cur = porFavorecido.get(key) ?? {
        cnpj: d.cnpjFavorecido,
        nome: d.nomeFavorecido ?? '—',
        uf: d.ufFavorecido,
        municipio: d.municipioFavorecido,
        codigoIbge: d.codigoIbgeFavorecido,
        total: 0,
        qtdDocumentos: 0,
      };
      cur.total += d.valor;
      cur.qtdDocumentos++;
      porFavorecido.set(key, cur);

      const f = porFase.get(d.fase) ?? { fase: d.fase, total: 0, qtd: 0 };
      f.total += d.valor;
      f.qtd++;
      porFase.set(d.fase, f);
    }

    // Se veio filtro por UF e não há docs naquele UF, verifica se há docs no total
    // para distinguir "sem execução neste estado" de "ainda não enriquecida"
    const totalGeral = uf
      ? await prisma.emendaDocumento.count({ where: { emendaId: emenda.id } })
      : documentos.length;

    return NextResponse.json({
      emenda: {
        codigoEmenda: emenda.idPortal,
        ano: emenda.ano,
        numero: emenda.numero,
        tipo: emenda.tipo,
        esfera: emenda.esfera,
        valorEmpenhado: emenda.valorEmpenhado,
        valorPago: emenda.valorPago,
      },
      documentos,
      breakdown: {
        favorecidos: Array.from(porFavorecido.values()).sort((a, b) => b.total - a.total),
        fases: Array.from(porFase.values()).sort((a, b) => b.total - a.total),
      },
      pendingEnrich: totalGeral === 0,
      semExecucaoNoEstado: uf ? documentos.length === 0 && totalGeral > 0 : false,
      total: documentos.length,
    });
  } catch (error) {
    console.error('GET /api/emendas-portal/emenda/[codigo]/documentos error:', error);
    return NextResponse.json({ error: 'Erro ao buscar documentos da emenda' }, { status: 500 });
  }
}
