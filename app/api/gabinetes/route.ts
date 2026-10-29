import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exigirAcesso } from '@/lib/acesso-api';

// GET - Listar gabinetes (público para o formulário de cadastro)
export async function GET() {
  try {
    const gabinetes = await prisma.gabinete.findMany({
      where: { ativo: true, deletedAt: null },
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
      const acesso = await exigirAcesso();
      if (acesso instanceof NextResponse) return acesso;
      if (acesso.role !== 'ADMIN' && acesso.role !== 'SUPER_ADMIN') {
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
