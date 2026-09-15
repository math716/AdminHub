import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { checkRateLimit } from '@/lib/rate-limit';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Senha', type: 'password' }
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Credenciais inválidas');
        }

        // Limite de tentativas. A rota /api/auth/login já tinha essa proteção,
        // mas a TELA de login entra por aqui (signIn('credentials')) — ou seja,
        // o endpoint que de fato autentica estava aberto a força bruta.
        //
        // Limita por e-mail e por IP: só por IP, um atacante atrás de várias
        // saídas escaparia; só por e-mail, daria para varrer contas diferentes.
        const ip = (req?.headers?.['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
          || (req?.headers?.['x-real-ip'] as string | undefined)
          || 'desconhecido';
        const email = credentials.email.toLowerCase();

        if (!checkRateLimit(`login:email:${email}`, 8, 60_000)
            || !checkRateLimit(`login:ip:${ip}`, 20, 60_000)) {
          throw new Error('Muitas tentativas. Aguarde um momento antes de tentar novamente.');
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { gabinete: true }
        });
        // Timing protection: always compare even when user doesn't exist
        const hashParaComparar = user?.password ?? '$2a$10$placeholder.hash.that.never.matches.anything.ok';
        const isValid = await bcrypt.compare(credentials.password, hashParaComparar);
        if (!user || !isValid) {
          throw new Error('Credenciais inválidas');
        }

        // Quem foi removido não entra mais.
        //
        // Chefe e Agente Político removem alguém com "remoção suave": o
        // registro fica marcado com `deletedAt` para o administrador revisar
        // depois. A listagem de usuários esconde quem tem essa marca, então na
        // tela a pessoa sumiu — mas a senha continuava valendo e nem o login
        // nem o middleware olhavam esse campo. Tirar alguém do gabinete não
        // tirava o acesso dele aos contatos, às demandas e à agenda.
        if (user.deletedAt) {
          throw new Error('Este acesso foi removido. Procure o Chefe de Gabinete.');
        }

        // Gabinete na lixeira: quem trabalhava nele também não entra. Admin
        // fica de fora da regra porque é quem revisa a exclusão.
        const ehAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
        if (!ehAdmin && user.gabinete?.deletedAt) {
          throw new Error('Este gabinete foi excluído. Procure o administrador.');
        }

        // Sem aprovação, não entra — nem como Chefe de Gabinete.
        //
        // Havia uma exceção para CHEFE aqui, e ela abria um buraco: qualquer
        // pessoa pode se cadastrar escolhendo "Chefe de Gabinete" e um gabinete
        // existente da lista. A conta nasce com `approved: false` e o sistema
        // responde "Aguarde a aprovação do Administrador" — mas o login
        // deixava entrar assim mesmo.
        //
        // O middleware manda essa sessão para a tela de espera, então pela tela
        // parecia bloqueado. Só que o middleware cobre apenas /dashboard: as
        // rotas de /api conferem se existe sessão, não se o cadastro foi
        // aprovado. Com a sessão na mão, dava para ler contatos, demandas e
        // agenda do gabinete escolhido chamando a API direto.
        //
        // Nenhum fluxo legítimo depende da exceção: convite de Chefe, aprovação
        // de usuário e aprovação de solicitação de gabinete criam a conta já
        // com `approved: true`. O primeiro usuário do sistema entra como ADMIN,
        // também aprovado.
        if (!user.approved && !ehAdmin) {
          throw new Error('Cadastro pendente de aprovação');
        }
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          approved: user.approved,
          gabineteId: user.gabineteId,
          gabineteNome: user.gabinete?.nome,
          mustChangePassword: user.mustChangePassword,
          permissions: user.permissions ?? [],
          theme: (user as any).theme ?? 'dark',
        };
      }
    })
  ],
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 horas
  },
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production'
        ? '__Secure-next-auth.session-token'
        : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax' as const,
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.approved = (user as any).approved;
        token.gabineteId = (user as any).gabineteId;
        token.gabineteNome = (user as any).gabineteNome;
        token.mustChangePassword = (user as any).mustChangePassword;
        token.permissions = (user as any).permissions ?? [];
        token.theme = (user as any).theme ?? 'dark';
      }
      if (trigger === 'update') {
        const s = session as any ?? {};
        if (s?.gabineteId !== undefined) {
          // Troca de gabinete: apenas ADMIN pode. Para qualquer outro role o
          // pedido é silenciosamente ignorado — não confiamos só na UI esconder
          // o switcher porque o cliente pode chamar update() diretamente.
          if (token.role === 'ADMIN' || token.role === 'SUPER_ADMIN') {
            token.gabineteId  = s.gabineteId  ?? null;
            token.gabineteNome = s.gabineteNome ?? null;
          }
        } else if (token.id) {
          // Refresh de mustChangePassword + permissions + theme após mudanças no perfil
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { mustChangePassword: true, role: true, permissions: true, theme: true },
          });
          if (dbUser) {
            token.mustChangePassword = dbUser.mustChangePassword;
            token.role = dbUser.role;
            token.permissions = dbUser.permissions ?? [];
            token.theme = (dbUser as any).theme ?? 'dark';
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).approved = token.approved;
        (session.user as any).gabineteId = token.gabineteId;
        (session.user as any).gabineteNome = token.gabineteNome;
        (session.user as any).mustChangePassword = token.mustChangePassword;
        (session.user as any).permissions = token.permissions ?? [];
        (session.user as any).theme = token.theme ?? 'dark';
      }
      return session;
    }
  },
  pages: {
    signIn: '/login'
  }
};
