import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Reutiliza a instância em todos os ambientes para evitar conexões duplicadas
// em hot-reload (dev) e em funções serverless que compartilham o mesmo worker (prod).
export const prisma = globalForPrisma.prisma ?? new PrismaClient()

globalForPrisma.prisma = prisma
