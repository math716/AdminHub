import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function buildUrl(): string {
  const raw = process.env.DATABASE_URL ?? '';
  const sep = raw.includes('?') ? '&' : '?';
  // Limita conexões da aplicação para não competir com scripts de importação
  return `${raw}${sep}connection_limit=10&pool_timeout=20`;
}

// Reutiliza a instância em todos os ambientes para evitar conexões duplicadas
// em hot-reload (dev) e em funções serverless que compartilham o mesmo worker (prod).
export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  datasources: { db: { url: buildUrl() } },
})

globalForPrisma.prisma = prisma
