// Configuração dos comandos do Prisma (generate, migrate, db execute) — Prisma 7.
//
// Os comandos de banco usam a conexão DIRETA (porta 5432, modo sessão): o
// pooler em modo transação (6543) não serve para migração. O sistema em si se
// conecta por lib/db.ts.
//
// Sem variável de ambiente (ex.: o workflow de testes, que só roda
// `prisma generate`), nada é exigido — gerar o cliente não precisa de banco.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx --require dotenv/config scripts/safe-seed.ts',
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
});
