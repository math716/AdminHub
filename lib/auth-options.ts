import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { checkRateLimit } from '@/lib/rate-limit';
import { CacheLimitado } from '@/lib/cache-limitado';

/**
 * Revogação de acesso sem esperar a sessão vencer.
 *
 * A sessão é um token assinado: enquanto vale, o sistema confia no que está
 * escrito nele. Remover alguém impedia que ele obtivesse um token NOVO, mas o
 * que já estava no navegador seguia funcionando — e como o token é reemitido a
 * cada leitura da sessão, quem mantivesse a aba aberta renovava sozinho, sem
 * prazo para acabar.
 *
 * Agora o token é conferido contra o banco de tempos em tempos. Não é por
 * requisição porque isso seria uma consulta a cada clique: em rota de API o
 * next-auth não regrava o cookie (o `setCookie` é vazio ali), então o carimbo
 * de "conferido em" não avançaria e a consulta se repetiria sempre. O cache em
 * processo resolve esse caso — com teto, que estrutura de módulo sem descarte
 * já derrubou este sistema uma vez.
 */
const JANELA_REVALIDACAO_MS = 60_000;
const conferidosRecentemente = new CacheLimitado<number>(500);

/** Motivo pelo qual a sessão deixou de valer, ou `null` se continua válida. */
function motivoDaRevogacao(u: {
  approved: boolean; role: string; deletedAt: Date | null;
  gabinete?: { deletedAt: Date | null } | null;
} | null): string | null {
  if (!u) return 'conta removida';
  if (u.deletedAt) return 'acesso removido';
  const ehAdmin = u.role === 'ADMIN' || u.role === 'SUPER_ADMIN';
  if (!ehAdmin && u.gabinete?.deletedAt) return 'gabinete excluído';
  if (!u.approved && !ehAdmin) return 'cadastro não aprovado';
  return null;
}

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

        // Limite de tentativas. Este é o único caminho de autenticação do
        // sistema: a tela de login chama signIn('credentials'), que entra aqui.
        // (Existia uma segunda implementação em /api/auth/login, sem uso e já
        // desatualizada — removida no bloco 7 da auditoria.)
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
    // 2 horas.
    //
    // A sessão é um token assinado que o navegador guarda: enquanto vale, o
    // sistema confia no que está escrito nele e não pergunta nada ao banco.
    // Rápido, mas o token não sabe que foi revogado. Remover alguém impede que
    // ele obtenha um token NOVO (ver as recusas no `authorize` acima) — o que
    // já está na mão dele continua valendo até vencer.
    //
    // Esse prazo é, portanto, a janela em que um acesso removido ainda
    // funciona. Era de 8 horas; passou para 2.
    //
    // Fechar a janela de vez exige reconferir no banco de tempos em tempos, o
    // que mexe no caminho que decide quem entra. Fica para quando der para
    // testar o login de verdade antes de publicar.
    maxAge: 2 * 60 * 60,
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

      // ── Conferência periódica contra o banco ────────────────────────────
      const id = token.id as string | undefined;
      if (id) {
        const agora = Date.now();
        const ultima = conferidosRecentemente.get(id) ?? 0;

        if (agora - ultima >= JANELA_REVALIDACAO_MS) {
          let dbUser;
          try {
            dbUser = await prisma.user.findUnique({
              where: { id },
              select: {
                approved: true, role: true, deletedAt: true,
                permissions: true, mustChangePassword: true,
                gabinete: { select: { deletedAt: true } },
              },
            });
          } catch (err) {
            // Banco fora do ar NÃO desloga ninguém. Só se derruba a sessão
            // quando o banco confirma que o acesso acabou; na dúvida, mantém.
            //
            // Só a primeira linha do erro: se o banco cair, isto acontece a
            // cada requisição, e o rastro de pilha inteiro do Prisma tornaria
            // o log ilegível justamente quando ele é mais necessário.
            const resumo = String((err as Error)?.message ?? err).split('\n').find(Boolean)?.trim();
            console.error('[auth] revalidação falhou, sessão mantida:', resumo);
            return token;
          }

          const motivo = motivoDaRevogacao(dbUser as any);
          if (motivo) {
            // Lançar aqui faz o next-auth limpar o cookie de sessão. Nas rotas
            // de API a sessão volta vazia, e elas respondem "não autorizado".
            console.warn(`[auth] sessão encerrada para ${id}: ${motivo}`);
            throw new Error(`Acesso revogado: ${motivo}`);
          }

          // Aproveita a ida ao banco para atualizar o que pode ter mudado.
          token.approved = dbUser!.approved;
          token.role = dbUser!.role;
          token.permissions = dbUser!.permissions ?? [];
          token.mustChangePassword = dbUser!.mustChangePassword;
          conferidosRecentemente.set(id, agora);
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
  },

  // Encerrar uma sessão revogada é o funcionamento normal, não falha do
  // sistema. Sem isto, cada uma despeja um rastro de pilha de 25 linhas como
  // JWT_SESSION_ERROR — ruído que esconde erro de verdade no log da Vercel.
  logger: {
    error(code, metadata) {
      const msg = (metadata as any)?.message ?? String(metadata ?? '');
      if (code === 'JWT_SESSION_ERROR' && msg.startsWith('Acesso revogado')) return;
      console.error(`[next-auth][${code}]`, metadata);
    },
    warn(code) { console.warn(`[next-auth][${code}]`); },
    debug() { /* silencioso */ },
  },
};
