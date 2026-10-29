import type { PrismaClient } from '@/lib/prisma-gerado/client'
import { criarPrismaClient } from '@/lib/prisma-conexao'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Reutiliza a instância em todos os ambientes para evitar conexões duplicadas
// em hot-reload (dev) e em funções serverless que compartilham o mesmo worker (prod).
export { criarPrismaClient }
export const prisma = globalForPrisma.prisma ?? criarPrismaClient()

globalForPrisma.prisma = prisma
