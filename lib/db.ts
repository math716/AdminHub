import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function buildUrl(): string {
  const raw = process.env.DATABASE_URL ?? '';
  const extras: string[] = [];

  // `pgbouncer=true` desliga os prepared statements do Prisma.
  //
  // A porta 6543 do Supabase é o PgBouncer em modo transação: cada consulta
  // pode cair numa conexão diferente, e um prepared statement criado numa não
  // existe na outra. Sem esta opção, consultas simultâneas quebram com
  // "prepared statement s0 already exists" (42P05) ou "s5 does not exist"
  // (26000) — e o sistema faz várias coisas com 8 consultas ao mesmo tempo
  // (sincronização da agenda, projeções, importação de emendas).
  //
  // Vinha só da variável de ambiente. Aqui o código garante, para não depender
  // de a URL ter sido colada completa em cada ambiente.
  if (/:6543\b/.test(raw) && !/[?&]pgbouncer=/.test(raw)) extras.push('pgbouncer=true');

  // Limita conexões da aplicação para não competir com scripts de importação
  if (!/[?&]connection_limit=/.test(raw)) extras.push('connection_limit=10');
  if (!/[?&]pool_timeout=/.test(raw))     extras.push('pool_timeout=20');

  if (extras.length === 0) return raw;
  const sep = raw.includes('?') ? '&' : '?';
  return `${raw}${sep}${extras.join('&')}`;
}

// Reutiliza a instância em todos os ambientes para evitar conexões duplicadas
// em hot-reload (dev) e em funções serverless que compartilham o mesmo worker (prod).
export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  datasources: { db: { url: buildUrl() } },
})

globalForPrisma.prisma = prisma
