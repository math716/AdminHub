import { PrismaClient } from '@prisma/client';
const url = (process.env.DATABASE_URL ?? '') + ((process.env.DATABASE_URL ?? '').includes('?') ? '&' : '?') + 'pgbouncer=true';
const prisma = new PrismaClient({ datasources: { db: { url } } });
async function main() {
  const total = await prisma.parlamentar.count();
  const res: any[] = await prisma.$queryRaw`SELECT COUNT(*)::int as dup FROM (SELECT nome FROM parlamentares GROUP BY nome HAVING COUNT(*) > 1) t`;
  console.log('Total parlamentares:', total);
  console.log('Nomes duplicados:', res[0].dup);
}
main().catch(console.error).finally(() => prisma.$disconnect());
