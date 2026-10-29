import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { PERMISSIONS } from '@/lib/permissions';
import { exigirAcesso } from '@/lib/acesso-api';

// Atualizar um município específico na projeção
export async function PUT(request: NextRequest) {
  try {
    const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.PROJETO_CAMPANHA] });
    if (acesso instanceof NextResponse) return acesso;
    const user = { id: acesso.userId, gabineteId: acesso.gabineteId, role: acesso.role };

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
    const isGabineteManager = user.role === 'CHEFE' || user.role === 'AGENTE_POLITICO';

    if (!isOwner && !(isSameGabinete && isGabineteManager) && !isAdmin) {
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
