export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';

function safeInt(value: unknown, defaultValue = 0): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : defaultValue;
}

// Verifica se a projeção pertence ao gabinete do usuário autenticado
async function verificarPosse(projecaoId: string, userId: string, gabineteId: string): Promise<boolean> {
  const projecao = await prisma.projecaoCampanha.findUnique({
    where: { id: projecaoId },
    include: { user: { select: { gabineteId: true } } }
  });
  if (!projecao) return false;
  return projecao.userId === userId || projecao.user?.gabineteId === gabineteId;
}

// Resolve projecaoId a partir de um projecaoMunicipioId
async function getProjecaoIdFromMunicipio(projecaoMunicipioId: string): Promise<string | null> {
  const mun = await prisma.projecaoMunicipio.findUnique({
    where: { id: projecaoMunicipioId },
    select: { projecaoId: true }
  });
  return mun?.projecaoId ?? null;
}

// Resolve projecaoId a partir de um parceriaId
async function getProjecaoIdFromParceria(parceriaId: string): Promise<string | null> {
  const parceria = await prisma.parceria.findUnique({
    where: { id: parceriaId },
    include: { projecaoMunicipio: { select: { projecaoId: true } } }
  });
  return parceria?.projecaoMunicipio?.projecaoId ?? null;
}

// GET - Listar parcerias de uma projeção ou município
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const user = session.user as any;
    if (!hasPermission(user, PERMISSIONS.PROJETO_CAMPANHA)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const userId     = user.id     as string;
    const gabineteId = user.gabineteId as string;

    const { searchParams } = new URL(request.url);
    const projecaoId         = searchParams.get('projecaoId');
    const projecaoMunicipioId = searchParams.get('projecaoMunicipioId');
    const bairro             = searchParams.get('bairro');

    // Via projecaoMunicipioId — verifica posse pela cadeia municipio → projecao
    if (projecaoMunicipioId) {
      const projecaoIdResolvido = await getProjecaoIdFromMunicipio(projecaoMunicipioId);
      if (!projecaoIdResolvido || !(await verificarPosse(projecaoIdResolvido, userId, gabineteId))) {
        return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
      }

      const whereClause: any = { projecaoMunicipioId };
      if (bairro) whereClause.bairro = bairro;

      const parcerias = await prisma.parceria.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' }
      });

      return NextResponse.json({ parcerias });
    }

    // Via projecaoId — verifica posse diretamente
    if (projecaoId) {
      if (!(await verificarPosse(projecaoId, userId, gabineteId))) {
        return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
      }

      const projecao = await prisma.projecaoCampanha.findUnique({
        where: { id: projecaoId },
        include: { municipios: { include: { parcerias: true } } }
      });

      if (!projecao) return NextResponse.json({ error: 'Projeção não encontrada' }, { status: 404 });

      const todasParcerias = projecao.municipios.flatMap(m =>
        m.parcerias.map(p => ({ ...p, municipio: m.municipio }))
      );

      const stats = {
        total:                  todasParcerias.length,
        ativas:                 todasParcerias.filter(p => p.ativa).length,
        impactoTotal:           todasParcerias.reduce((acc, p) => acc + p.impactoEstimado, 0),
        metaConservadoraTotal:  todasParcerias.reduce((acc, p) => acc + p.metaConservadora, 0),
        metaPossivelTotal:      todasParcerias.reduce((acc, p) => acc + p.metaPossivel, 0),
        metaArrojadaTotal:      todasParcerias.reduce((acc, p) => acc + p.metaArrojada, 0),
        porTipo:                {} as Record<string, number>,
        municipiosComParcerias: new Set(todasParcerias.map(p => p.projecaoMunicipioId)).size
      };

      todasParcerias.forEach(p => {
        stats.porTipo[p.tipo] = (stats.porTipo[p.tipo] || 0) + 1;
      });

      return NextResponse.json({ parcerias: todasParcerias, stats });
    }

    return NextResponse.json(
      { error: 'Parâmetro projecaoId ou projecaoMunicipioId é obrigatório' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Erro ao buscar parcerias:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// POST - Criar nova parceria
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const user = session.user as any;
    if (!hasPermission(user, PERMISSIONS.PROJETO_CAMPANHA)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const userId     = user.id     as string;
    const gabineteId = user.gabineteId as string;

    const body = await request.json();
    const { projecaoMunicipioId, bairro, nome, tipo, responsavel, contato, observacoes,
            impactoEstimado, metaConservadora, metaPossivel, metaArrojada } = body;

    if (!projecaoMunicipioId || !nome || !tipo) {
      return NextResponse.json(
        { error: 'projecaoMunicipioId, nome e tipo são obrigatórios' },
        { status: 400 }
      );
    }

    // Verifica que o município pertence a uma projeção do usuário
    const projecaoIdResolvido = await getProjecaoIdFromMunicipio(projecaoMunicipioId);
    if (!projecaoIdResolvido || !(await verificarPosse(projecaoIdResolvido, userId, gabineteId))) {
      return NextResponse.json({ error: 'Município não encontrado' }, { status: 404 });
    }

    const parceria = await prisma.parceria.create({
      data: {
        projecaoMunicipioId,
        bairro:           bairro        || null,
        nome,
        tipo,
        responsavel:      responsavel   || null,
        contato:          contato       || null,
        observacoes:      observacoes   || null,
        impactoEstimado:  safeInt(impactoEstimado),
        metaConservadora: safeInt(metaConservadora),
        metaPossivel:     safeInt(metaPossivel),
        metaArrojada:     safeInt(metaArrojada)
      }
    });

    return NextResponse.json(parceria, { status: 201 });

  } catch (error) {
    console.error('Erro ao criar parceria:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// PUT - Atualizar parceria (apenas campos permitidos — sem mass assignment)
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const user = session.user as any;
    if (!hasPermission(user, PERMISSIONS.PROJETO_CAMPANHA)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const userId     = user.id     as string;
    const gabineteId = user.gabineteId as string;

    const body = await request.json();
    const { id } = body;

    if (!id) return NextResponse.json({ error: 'ID da parceria é obrigatório' }, { status: 400 });

    // Verifica posse pela cadeia parceria → municipio → projecao
    const projecaoIdResolvido = await getProjecaoIdFromParceria(id);
    if (!projecaoIdResolvido || !(await verificarPosse(projecaoIdResolvido, userId, gabineteId))) {
      return NextResponse.json({ error: 'Parceria não encontrada' }, { status: 404 });
    }

    // Whitelist explícita de campos atualizáveis — previne mass assignment
    const updateData: Record<string, unknown> = {};
    if (body.nome        !== undefined) updateData.nome        = body.nome;
    if (body.tipo        !== undefined) updateData.tipo        = body.tipo;
    if (body.bairro      !== undefined) updateData.bairro      = body.bairro;
    if (body.responsavel !== undefined) updateData.responsavel = body.responsavel;
    if (body.contato     !== undefined) updateData.contato     = body.contato;
    if (body.observacoes !== undefined) updateData.observacoes = body.observacoes;
    if (body.ativa       !== undefined) updateData.ativa       = Boolean(body.ativa);
    if (body.impactoEstimado  !== undefined) updateData.impactoEstimado  = safeInt(body.impactoEstimado);
    if (body.metaConservadora !== undefined) updateData.metaConservadora = safeInt(body.metaConservadora);
    if (body.metaPossivel     !== undefined) updateData.metaPossivel     = safeInt(body.metaPossivel);
    if (body.metaArrojada     !== undefined) updateData.metaArrojada     = safeInt(body.metaArrojada);

    const parceria = await prisma.parceria.update({ where: { id }, data: updateData });

    return NextResponse.json(parceria);

  } catch (error) {
    console.error('Erro ao atualizar parceria:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// DELETE - Remover parceria
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const user = session.user as any;
    if (!hasPermission(user, PERMISSIONS.PROJETO_CAMPANHA)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const userId     = user.id     as string;
    const gabineteId = user.gabineteId as string;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'ID da parceria é obrigatório' }, { status: 400 });

    // Verifica posse antes de deletar
    const projecaoIdResolvido = await getProjecaoIdFromParceria(id);
    if (!projecaoIdResolvido || !(await verificarPosse(projecaoIdResolvido, userId, gabineteId))) {
      return NextResponse.json({ error: 'Parceria não encontrada' }, { status: 404 });
    }

    await prisma.parceria.delete({ where: { id } });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Erro ao deletar parceria:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
