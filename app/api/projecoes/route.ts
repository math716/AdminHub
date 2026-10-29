import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { PERMISSIONS } from '@/lib/permissions';
import { exigirAcesso } from '@/lib/acesso-api';
import { z } from 'zod';
import { lerCorpo, v } from '@/lib/validacao-api';

// Item sem município é descartado pela rota (como sempre foi), não recusado.
const MunicipioProjetado = z.object({
  municipio:          v.textoOpcional('o município', 200),
  votosBase:          v.inteiroOpcional('os votos base'),
  metaConservadora:   v.inteiroOpcional('a meta conservadora'),
  metaPossivel:       v.inteiroOpcional('a meta possível'),
  metaArrojada:       v.inteiroOpcional('a meta arrojada'),
  observacoes:        v.textoOpcional('as observações', 20000),
  prioridade:         v.textoOpcional('a prioridade', 40),
  dobradaAtiva:       v.booleanoOpcional('a dobrada'),
  dobradaNome:        v.textoOpcional('o nome da dobrada', 300),
  dobradaPartido:     v.textoOpcional('o partido da dobrada', 100),
  dobradaObservacoes: v.textoOpcional('as observações da dobrada', 20000),
}).passthrough();
// Uma projeção estadual cobre centenas de municípios (MG tem 853).
const Projecao = z.object({
  candidatoNome: v.texto('o candidato', 300),
  anoBase:       v.numero('o ano base', 1990, 2100).int('Ano base inválido.'),
  anoProjecao:   v.numero('o ano da projeção', 1990, 2100).int('Ano da projeção inválido.'),
  uf:            v.texto('a UF', 2),
  cargo:         v.textoOpcional('o cargo', 100),
  municipios:    v.lista('os municípios', MunicipioProjetado, 6000).nullish(),
}).passthrough();

export async function GET(request: NextRequest) {
  try {
    const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.PROJETO_CAMPANHA] });
    if (acesso instanceof NextResponse) return acesso;
    const user = { id: acesso.userId, gabineteId: acesso.gabineteId, role: acesso.role };

    const gabineteId = user.gabineteId as string | undefined;
    const projecoes = await prisma.projecaoCampanha.findMany({
      where: gabineteId
        ? { user: { gabineteId } }
        : { userId: user.id },
      include: {
        municipios: {
          include: { parcerias: { select: { metaConservadora: true, metaPossivel: true, metaArrojada: true } } },
        },
      },
      orderBy: { updatedAt: 'desc' }
    });

    // O cartão de "Projeções salvas" mostra a meta como a tela da projeção:
    // com os votos das parcerias. Vai só a soma de cada município (não a
    // parceria inteira), para a lista continuar leve.
    return NextResponse.json(projecoes.map(p => ({
      ...p,
      municipios: p.municipios.map(({ parcerias, ...m }) => ({
        ...m,
        parceriasSoma: {
          conservadora: parcerias.reduce((s, x) => s + (x.metaConservadora || 0), 0),
          possivel: parcerias.reduce((s, x) => s + (x.metaPossivel || 0), 0),
          arrojada: parcerias.reduce((s, x) => s + (x.metaArrojada || 0), 0),
        },
      })),
    })));
  } catch (error) {
    console.error('Erro ao buscar projeções:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.PROJETO_CAMPANHA] });
    if (acesso instanceof NextResponse) return acesso;
    const user = { id: acesso.userId, gabineteId: acesso.gabineteId, role: acesso.role };

    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    const projecao = await prisma.projecaoCampanha.findUnique({
      where: { id },
      include: { user: { select: { gabineteId: true } } }
    });
    const pertenceAoGabinete = user.gabineteId
      ? projecao?.user?.gabineteId === user.gabineteId
      : projecao?.userId === user.id;
    if (!projecao || !pertenceAoGabinete)
      return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

    await prisma.projecaoCampanha.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Erro ao excluir projeção:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.PROJETO_CAMPANHA] });
    if (acesso instanceof NextResponse) return acesso;
    const user = { id: acesso.userId, gabineteId: acesso.gabineteId, role: acesso.role };

    const body = await lerCorpo(request, Projecao);
    if (body instanceof NextResponse) return body;
    const { candidatoNome, anoBase, anoProjecao, uf, cargo, municipios } = body;

    if (!candidatoNome || !anoBase || !anoProjecao || !uf) {
      return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 });
    }

    // Upsert da projeção
    const projecao = await prisma.projecaoCampanha.upsert({
      where: {
        userId_candidatoNome_anoBase_anoProjecao_uf: {
          userId: user.id,
          candidatoNome,
          anoBase,
          anoProjecao,
          uf
        }
      },
      update: {
        cargo,
        updatedAt: new Date()
      },
      create: {
        userId: user.id,
        candidatoNome,
        anoBase,
        anoProjecao,
        uf,
        cargo
      }
    });

    // Upsert municípios individualmente para preservar IDs existentes (e portanto as parcerias vinculadas)
    // Nota: sem $transaction — Supabase usa PgBouncer em modo transaction, incompatível com
    // transações interativas do Prisma (P2028). Os upserts são idempotentes, sem necessidade de atomicidade.
    if (municipios && Array.isArray(municipios) && municipios.length > 0) {
      // O front manda a projeção INTEIRA a cada salvamento, e uma projeção
      // estadual cobre centenas de municípios (SP tem 645, MG tem 853). Um
      // upsert de cada vez, esperando a ida e volta ao banco, levava mais de um
      // minuto só para salvar — mesmo problema que travava a sincronização do
      // Google Agenda. Os upserts são independentes entre si (a chave é
      // projeção + município), então vão em paralelo, 8 por vez para não
      // esgotar as 10 conexões configuradas em lib/db.ts.
      const CONCORRENCIA = 8;

      // Município repetido no corpo da requisição faria duas gravações
      // disputarem a mesma linha dentro do mesmo lote; o último vence.
      const unicos = [...new Map(
        (municipios as any[])
          .filter(m => m?.municipio)
          .map(m => [String(m.municipio), m]),
      ).values()];

      const gravar = (mun: any) => {
        const munData = {
          votosBase: mun.votosBase ?? 0,
          metaConservadora: mun.metaConservadora ?? mun.votosBase ?? 0,
          metaPossivel: mun.metaPossivel ?? mun.votosBase ?? 0,
          metaArrojada: mun.metaArrojada ?? mun.votosBase ?? 0,
          observacoes: mun.observacoes ?? null,
          prioridade: mun.prioridade ?? null,
          dobradaAtiva: mun.dobradaAtiva ?? false,
          dobradaNome: mun.dobradaNome ?? null,
          dobradaPartido: mun.dobradaPartido ?? null,
          dobradaObservacoes: mun.dobradaObservacoes ?? null,
        };
        return prisma.projecaoMunicipio.upsert({
          where: { projecaoId_municipio: { projecaoId: projecao.id, municipio: mun.municipio } },
          update: munData,
          create: { projecaoId: projecao.id, municipio: mun.municipio, ...munData },
        });
      };

      for (let i = 0; i < unicos.length; i += CONCORRENCIA) {
        await Promise.all(unicos.slice(i, i + CONCORRENCIA).map(gravar));
      }
      // Remove municípios que foram excluídos pelo usuário. Usa a MESMA lista
      // que acabou de ser gravada: montá-la do corpo cru colocava `undefined`
      // no `notIn` quando vinha um item sem município.
      await prisma.projecaoMunicipio.deleteMany({
        where: {
          projecaoId: projecao.id,
          municipio: { notIn: unicos.map((m: any) => String(m.municipio)) },
        },
      });
    }

    const projecaoCompleta = await prisma.projecaoCampanha.findUnique({
      where: { id: projecao.id },
      include: { municipios: true }
    });

    return NextResponse.json(projecaoCompleta);
  } catch (error) {
    console.error('Erro ao salvar projeção:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
