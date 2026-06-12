export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { sendAdminApprovalEmail } from '@/lib/email';
import { checkRateLimit } from '@/lib/rate-limit';

function notifyAdmin(userName: string, userEmail: string, userRole: string, gabineteNome: string) {
  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://adminhub.app';
  sendAdminApprovalEmail({
    userName, userEmail, userRole, gabineteNome,
    approveUrl: `${baseUrl}/dashboard/usuarios`,
  }).catch(() => {});
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
            ?? request.headers.get('x-real-ip')
            ?? 'unknown';
    if (!checkRateLimit(`signup:${ip}`, 5, 60_000)) {
      return NextResponse.json(
        { error: 'Muitas tentativas. Aguarde um momento antes de tentar novamente.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    let { email, password, name, role, gabineteId, novoGabinete } = body;

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'Email, senha e nome são obrigatórios' },
        { status: 400 }
      );
    }

    // Verificar se há gabinetes no sistema
    const gabineteCount = await prisma.gabinete.count();
    const userCount = await prisma.user.count();
    
    // Se não há role/gabinete especificado:
    // 1. Se não há usuários no sistema - criar como CHEFE com gabinete padrão
    // 2. Se há usuários mas não role - usar primeiro gabinete disponível como fallback
    if (!role || role === '' || !['CHEFE', 'ASSESSOR'].includes(role)) {
      // Buscar ou criar gabinete padrão
      let gabPadrao = await prisma.gabinete.findFirst({ 
        where: { nome: 'Gabinete Padrão' },
        orderBy: { createdAt: 'asc' }
      });
      
      if (!gabPadrao) {
        // Se não existe gabinete padrão, buscar qualquer gabinete
        gabPadrao = await prisma.gabinete.findFirst({ orderBy: { createdAt: 'asc' } });
      }
      
      if (!gabPadrao) {
        // Se não existe nenhum gabinete, criar um
        gabPadrao = await prisma.gabinete.create({
          data: { nome: 'Gabinete Padrão', descricao: 'Gabinete padrão do sistema' }
        });
      }
      
      gabineteId = gabPadrao.id;
      
      // Verificar se já existe um CHEFE aprovado neste gabinete
      const chefeExistente = await prisma.user.findFirst({
        where: { gabineteId: gabPadrao.id, role: 'CHEFE', approved: true }
      });
      
      // Se não há chefe ou não há usuários, criar como CHEFE
      role = (!chefeExistente || userCount === 0) ? 'CHEFE' : 'ASSESSOR';
    }

    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      // Timing protection: always hash so response time doesn't reveal if email is registered
      await bcrypt.hash(password, 10);
      return NextResponse.json(
        { error: 'Não foi possível criar a conta com este email. Se já possui uma conta, faça login.' },
        { status: 400 }
      );
    }

    let finalGabineteId = gabineteId;

    // CHEFE criando novo gabinete — gabinete só é criado após aprovação do ADMIN
    if (novoGabinete && role === 'CHEFE') {
      const nomeNormalizado = novoGabinete.trim();

      const existingGabinete = await prisma.gabinete.findUnique({
        where: { nome: nomeNormalizado }
      });
      if (existingGabinete) {
        return NextResponse.json(
          { error: 'Já existe um gabinete com este nome' },
          { status: 400 }
        );
      }

      // Verifica existência de ADMIN aprovado (bootstrap: primeiro usuário do sistema)
      const adminExistente = await prisma.user.findFirst({
        where: { role: 'ADMIN', approved: true },
        select: { id: true },
      });
      const isBootstrap = !adminExistente && userCount === 0;

      if (isBootstrap) {
        // Bootstrap: cria gabinete e usuário ADMIN aprovado imediatamente
        const gabinete = await prisma.gabinete.create({
          data: { nome: nomeNormalizado }
        });
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
          data: { email, password: hashedPassword, name, role: 'ADMIN', gabineteId: gabinete.id, approved: true }
        });
        return NextResponse.json({
          message: 'Bem-vindo ao AdminHub! Sua conta foi criada como Administrador.',
          user: { id: user.id, email: user.email, name: user.name, role: user.role, approved: user.approved, gabinete: gabinete.nome },
          isFirstUser: true
        });
      }

      // Caso normal: usuário fica pendente, gabinete ainda NÃO é criado
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: {
          email, password: hashedPassword, name,
          role: 'CHEFE',
          gabineteId: null,
          approved: false,
          pendingGabineteNome: nomeNormalizado,
        }
      });

      notifyAdmin(user.name, user.email, user.role, nomeNormalizado);

      return NextResponse.json({
        message: `Cadastro realizado! Aguarde a aprovação do Administrador para criar o gabinete "${nomeNormalizado}".`,
        user: { id: user.id, email: user.email, name: user.name, role: user.role, approved: user.approved },
        isFirstUser: false
      });
    }

    // CHEFE ou ASSESSOR entrando em gabinete existente — precisa de gabineteId
    if (!finalGabineteId) {
      return NextResponse.json(
        { error: 'Selecione um gabinete ou crie um novo' },
        { status: 400 }
      );
    }

    const gabinete = await prisma.gabinete.findUnique({
      where: { id: finalGabineteId }
    });
    if (!gabinete) {
      return NextResponse.json({ error: 'Gabinete não encontrado' }, { status: 400 });
    }

    // CHEFE entrando em gabinete existente — aguarda aprovação do ADMIN
    if (role === 'CHEFE') {
      const adminExistente = await prisma.user.findFirst({
        where: { role: 'ADMIN', approved: true },
        select: { id: true },
      });
      const isBootstrap = !adminExistente && userCount === 0;
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: { email, password: hashedPassword, name, role: isBootstrap ? 'ADMIN' : 'CHEFE', gabineteId: finalGabineteId, approved: isBootstrap }
      });
      if (!isBootstrap) notifyAdmin(user.name, user.email, user.role, gabinete.nome);
      return NextResponse.json({
        message: isBootstrap
          ? 'Bem-vindo ao AdminHub! Sua conta foi criada como Administrador.'
          : 'Cadastro realizado! Aguarde a aprovação do Administrador.',
        user: { id: user.id, email: user.email, name: user.name, role: user.role, approved: user.approved, gabinete: gabinete.nome },
        isFirstUser: isBootstrap
      });
    }

    // ASSESSOR — aguarda aprovação
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, password: hashedPassword, name, role: 'ASSESSOR', gabineteId: finalGabineteId, approved: false }
    });

    notifyAdmin(user.name, user.email, user.role, gabinete.nome);

    return NextResponse.json({
      message: `Cadastro realizado! Aguarde a aprovação do Chefe de Gabinete do ${gabinete.nome}.`,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, approved: user.approved, gabinete: gabinete.nome },
      isFirstUser: false
    });
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Erro ao realizar cadastro' },
      { status: 500 }
    );
  }
}
