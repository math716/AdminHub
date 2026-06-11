import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

// Atualizar um município específico na projeção
export async function PUT(request: NextRequest) {
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
    const {
      projecaoId, municipio, votosBase, metaConservadora, metaPossivel, metaArrojada,
      observacoes, prioridade, dobradaAtiva, dobradaNome, dobradaPartido, dobradaObservacoes
    } = body;

    if (!projecaoId || !municipio) {
      return NextResponse.json({ error: 'projecaoId e municipio são obrigatórios' }, { status: 400 });
    }

    // Verificar posse: o usuário deve ser dono OU CHEFE/ADMIN do mesmo gabinete
    const projecao = await prisma.projecaoCampanha.findUnique({
      where: { id: projecaoId },
      include: { user: { select: { gabineteId: true } } },
    });

    if (!projecao) {
      return NextResponse.json({ error: 'Projeção não encontrada' }, { status: 404 });
    }

    const isOwner        = projecao.userId === user.id;
    const isSameGabinete = projecao.user?.gabineteId === user.gabineteId;
    const isAdmin        = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';

    if (!isOwner && !(isSameGabinete && user.role === 'CHEFE') && !isAdmin) {
      return NextResponse.json({ error: 'Projeção não encontrada' }, { status: 404 });
    }

    const municipioAtualizado = await prisma.projecaoMunicipio.upsert({
      where: {
        projecaoId_municipio: {
          projecaoId,
          municipio
        }
      },
      update: {
        votosBase: votosBase ?? undefined,
        metaConservadora: metaConservadora ?? undefined,
        metaPossivel: metaPossivel ?? undefined,
        metaArrojada: metaArrojada ?? undefined,
        observacoes: observacoes ?? undefined,
        prioridade: prioridade ?? undefined,
        dobradaAtiva: dobradaAtiva ?? undefined,
        dobradaNome: dobradaNome ?? undefined,
        dobradaPartido: dobradaPartido ?? undefined,
        dobradaObservacoes: dobradaObservacoes ?? undefined,
        updatedAt: new Date()
      },
      create: {
        projecaoId,
        municipio,
        votosBase: votosBase ?? 0,
        metaConservadora: metaConservadora ?? 0,
        metaPossivel: metaPossivel ?? 0,
        metaArrojada: metaArrojada ?? 0,
        observacoes,
        prioridade,
        dobradaAtiva: dobradaAtiva ?? false,
        dobradaNome,
        dobradaPartido,
        dobradaObservacoes
      }
    });

    return NextResponse.json(municipioAtualizado);
  } catch (error) {
    console.error('Erro ao atualizar município:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
