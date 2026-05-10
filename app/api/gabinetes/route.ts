import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

// GET - Listar gabinetes (público para o formulário de cadastro)
export async function GET() {
  try {
    const gabinetes = await prisma.gabinete.findMany({
      where: { ativo: true },
      select: {
        id: true,
        nome: true,
        descricao: true,
        _count: { select: { users: true } }
      },
      orderBy: { nome: 'asc' }
    });

    return NextResponse.json(gabinetes);
  } catch (error) {
    console.error('Erro ao buscar gabinetes:', error);
    return NextResponse.json({ error: 'Erro ao buscar gabinetes' }, { status: 500 });
  }
}

// POST - Criar novo gabinete
// Permitido apenas em bootstrap (zero usuários) OU por usuário ADMIN autenticado
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { nome, descricao } = body;

    if (!nome?.trim()) {
      return NextResponse.json({ error: 'Nome do gabinete é obrigatório' }, { status: 400 });
    }

    // Verifica se é o primeiro usuário do sistema (bootstrap)
    const userCount = await prisma.user.count();
    const isBootstrap = userCount === 0;

    if (!isBootstrap) {
      // Fora do bootstrap, exige autenticação com papel ADMIN
      const session = await getServerSession(authOptions);
      if (!session) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
      }
      const role = (session.user as any)?.role;
      if (role !== 'ADMIN') {
        return NextResponse.json({ error: 'Apenas administradores podem criar gabinetes' }, { status: 403 });
      }
    }

    const existing = await prisma.gabinete.findUnique({ where: { nome: nome.trim() } });
    if (existing) {
      return NextResponse.json({ error: 'Já existe um gabinete com este nome' }, { status: 400 });
    }

    const gabinete = await prisma.gabinete.create({
      data: {
        nome:      nome.trim(),
        descricao: descricao?.trim() || null
      }
    });

    return NextResponse.json(gabinete);
  } catch (error) {
    console.error('Erro ao criar gabinete:', error);
    return NextResponse.json({ error: 'Erro ao criar gabinete' }, { status: 500 });
  }
}
