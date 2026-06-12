import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const user = session.user as any;
    if (user.role !== 'CHEFE' && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const gabineteId = user.gabineteId as string | undefined;
    const projecoes = await prisma.projecaoCampanha.findMany({
      where: gabineteId
        ? { user: { gabineteId } }
        : { userId: user.id },
      include: {
        municipios: true
      },
      orderBy: { updatedAt: 'desc' }
    });

    return NextResponse.json(projecoes);
  } catch (error) {
    console.error('Erro ao buscar projeções:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const user = session.user as any;
    if (user.role !== 'CHEFE' && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    const projecao = await prisma.projecaoCampanha.findUnique({ where: { id } });
    if (!projecao || projecao.userId !== user.id)
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
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const user = session.user as any;
    if (user.role !== 'CHEFE' && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const body = await request.json();
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

    // Atualizar municípios com batch (deleteMany + createMany) — evita N upserts sequenciais
    if (municipios && Array.isArray(municipios) && municipios.length > 0) {
      await prisma.$transaction([
        prisma.projecaoMunicipio.deleteMany({
          where: { projecaoId: projecao.id }
        }),
        prisma.projecaoMunicipio.createMany({
          data: municipios.map((mun: any) => ({
            projecaoId: projecao.id,
            municipio: mun.municipio,
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
          }))
        })
      ]);
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
