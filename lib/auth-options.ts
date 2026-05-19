import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Senha', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Credenciais inválidas');
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
        if (!user.approved && user.role !== 'CHEFE' && user.role !== 'ADMIN') {
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
      }
      if (trigger === 'update') {
        const s = session as any ?? {};
        if (s?.gabineteId !== undefined) {
          // Troca de gabinete: apenas ADMIN pode. Para qualquer outro role o
          // pedido é silenciosamente ignorado — não confiamos só na UI esconder
          // o switcher porque o cliente pode chamar update() diretamente.
          if (token.role === 'ADMIN') {
            token.gabineteId  = s.gabineteId  ?? null;
            token.gabineteNome = s.gabineteNome ?? null;
          }
        } else if (token.id) {
          // Refresh de mustChangePassword + permissions após mudanças no perfil
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { mustChangePassword: true, role: true, permissions: true },
          });
          if (dbUser) {
            token.mustChangePassword = dbUser.mustChangePassword;
            token.role = dbUser.role;
            token.permissions = dbUser.permissions ?? [];
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
      }
      return session;
    }
  },
  pages: {
    signIn: '/login'
  }
};
