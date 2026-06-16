export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { ALL_PERMISSIONS } from '@/lib/permissions';
import type { UserRole } from '@prisma/client';

const VALID_ROLES = ['ADMIN', 'AGENTE_POLITICO', 'CHEFE', 'ASSESSOR', 'ANALISTA', 'VISUALIZADOR'];

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const sessionRole       = (session.user as any)?.role;
    const sessionUserId     = (session.user as any)?.id;
    const sessionGabineteId = (session.user as any)?.gabineteId;

    if (sessionRole !== 'ADMIN' && sessionRole !== 'CHEFE' && sessionRole !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    if (params.id === sessionUserId) {
      return NextResponse.json({ error: 'Você não pode alterar o próprio perfil' }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, gabineteId: true, role: true, email: true },
    });
    if (!target) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

    // SUPER_ADMIN nunca pode ser alterado por ninguém via API
    if (target.role === 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Este usuário não pode ser alterado' }, { status: 403 });
    }

    // Email protegido: independente do role atual, este usuário nunca pode ser alterado
    const PROTECTED_EMAIL = process.env.SUPER_ADMIN_EMAIL ?? 'matheuseuclides716@gmail.com';
    if (target.email === PROTECTED_EMAIL) {
      return NextResponse.json({ error: 'Este usuário não pode ser alterado' }, { status: 403 });
    }

    // CHEFE só pode mexer em usuários do próprio gabinete
    if (sessionRole === 'CHEFE' && target.gabineteId !== sessionGabineteId) {
      return NextResponse.json({ error: 'Você só pode alterar usuários do seu gabinete' }, { status: 403 });
    }

    const body = await request.json();
    const { role, permissions } = body ?? {};

    const data: { role?: UserRole; permissions?: string[] } = {};

    if (role !== undefined) {
      // Apenas ADMIN e SUPER_ADMIN podem mudar role
      if (sessionRole !== 'ADMIN' && sessionRole !== 'SUPER_ADMIN') {
        return NextResponse.json({ error: 'Apenas administradores podem alterar o cargo' }, { status: 403 });
      }
      if (!VALID_ROLES.includes(role)) {
        return NextResponse.json({ error: 'Cargo inválido' }, { status: 400 });
      }
      data.role = role as UserRole;
    }

    if (permissions !== undefined) {
      if (!Array.isArray(permissions)) {
        return NextResponse.json({ error: 'permissions deve ser um array' }, { status: 400 });
      }
      const invalid = permissions.filter((p: string) => !ALL_PERMISSIONS.includes(p as any));
      if (invalid.length > 0) {
        return NextResponse.json({ error: `Permissões inválidas: ${invalid.join(', ')}` }, { status: 400 });
      }
      // Remove duplicatas mantendo a ordem
      data.permissions = Array.from(new Set(permissions));
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nada a atualizar' }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: params.id },
      data,
      select: { id: true, name: true, email: true, role: true, approved: true, permissions: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Patch user error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar usuário' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const sessionRole   = (session.user as any)?.role;
    const sessionUserId = (session.user as any)?.id;

    if (sessionRole !== 'ADMIN' && sessionRole !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }
    if (params.id === sessionUserId) {
      return NextResponse.json({ error: 'Você não pode excluir a própria conta' }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
      where: { id: params.id },
      select: { role: true, email: true },
    });
    if (!target) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

    if (target.role === 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Este usuário não pode ser excluído' }, { status: 403 });
    }
    const PROTECTED_EMAIL = process.env.SUPER_ADMIN_EMAIL ?? 'matheuseuclides716@gmail.com';
    if (target.email === PROTECTED_EMAIL) {
      return NextResponse.json({ error: 'Este usuário não pode ser excluído' }, { status: 403 });
    }

    await prisma.user.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete user error:', error);
    return NextResponse.json({ error: 'Erro ao excluir usuário' }, { status: 500 });
  }
}
