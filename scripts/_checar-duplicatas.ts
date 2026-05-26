import { PrismaClient } from '@prisma/client';

const url = (process.env.DATABASE_URL ?? '') + ((process.env.DATABASE_URL ?? '').includes('?') ? '&' : '?') + 'pgbouncer=true';
const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  // Parlamentares com nome duplicado
  const dups: any[] = await prisma.$queryRaw`
    SELECT nome, COUNT(*)::int AS total, array_agg(id) AS ids, array_agg(partido) AS partidos, array_agg("idPortal") AS portais
    FROM parlamentares
    GROUP BY nome
    HAVING COUNT(*) > 1
    ORDER BY total DESC
    LIMIT 30
  `;

  console.log(`\nTotal de nomes duplicados: ${dups.length}\n`);
  dups.forEach(d => {
    console.log(`NOME: ${d.nome}`);
    console.log(`  IDs:      ${d.ids.join(' | ')}`);
    console.log(`  Partidos: ${d.partidos.join(' | ')}`);
    console.log(`  Portais:  ${d.portais.join(' | ')}`);
    console.log('');
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
