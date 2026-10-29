export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exigirAcesso } from '@/lib/acesso-api';

// POST — aprovar ou recusar uma solicitação
// body: { acao: 'APROVAR' | 'RECUSAR', motivoRecusa?: string }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const acesso = await exigirAcesso({ papeis: ['ADMIN', 'SUPER_ADMIN'] });
  if (acesso instanceof NextResponse) return acesso;

  const body = await req.json().catch(() => ({}));
  const { acao, motivoRecusa } = body;

  if (acao !== 'APROVAR' && acao !== 'RECUSAR') {
    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  }

  const solicitacao = await prisma.solicitacaoGabinete.findUnique({ where: { id: params.id } });
  if (!solicitacao) return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 });
  if (solicitacao.status !== 'PENDENTE') {
    return NextResponse.json({ error: 'Solicitação já foi processada' }, { status: 400 });
  }

  if (acao === 'RECUSAR') {
    await prisma.solicitacaoGabinete.update({
      where: { id: params.id },
      data: {
        status:       'RECUSADA',
        motivoRecusa: motivoRecusa?.trim() || null,
        reviewedById: acesso.userId,
        reviewedAt:   new Date(),
      },
    });
    return NextResponse.json({ success: true });
  }

  // APROVAR — criar gabinete + usuário AGENTE_POLITICO em transação
  const nomeExistente = await prisma.gabinete.findUnique({ where: { nome: solicitacao.gabineteNome } });
  if (nomeExistente) {
    return NextResponse.json({ error: 'Já existe um gabinete com este nome' }, { status: 400 });
  }

  const emailExistente = await prisma.user.findUnique({ where: { email: solicitacao.userEmail } });
  if (emailExistente) {
    return NextResponse.json({ error: 'E-mail já cadastrado no sistema' }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    const gabinete = await tx.gabinete.create({
      data: { nome: solicitacao.gabineteNome },
    });

    await tx.user.create({
      data: {
        name:       solicitacao.userName,
        email:      solicitacao.userEmail,
        password:   solicitacao.userPassword,
        role:       'AGENTE_POLITICO',
        approved:   true,
        gabineteId: gabinete.id,
      },
    });

    await tx.solicitacaoGabinete.update({
      where: { id: params.id },
      data: {
        status:       'APROVADA',
        reviewedById: acesso.userId,
        reviewedAt:   new Date(),
      },
    });
  });

  return NextResponse.json({ success: true });
}
