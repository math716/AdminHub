/**
 * Reclassifica registros com area='OUTROS' no banco usando a funcao armazenada.
 * Roda após atualizar classificarArea em lib/portal-transparencia.ts.
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/reclassificar-areas.ts
 *   npx tsx --require dotenv/config scripts/reclassificar-areas.ts --dry-run
 */
import { PrismaClient } from '@prisma/client';
import { classificarArea, EmendaArea } from '../lib/portal-transparencia';

// PgBouncer (Supabase) rejects prepared statements — append the flag so Prisma
// falls back to simple queries.
function buildPrisma() {
  const url = process.env.DATABASE_URL ?? '';
  const sep = url.includes('?') ? '&' : '?';
  const safeUrl = url.includes('pgbouncer=true')
    ? url
    : `${url}${sep}pgbouncer=true&connection_limit=50&pool_timeout=60`;
  return new PrismaClient({ datasources: { db: { url: safeUrl } } });
}

const prisma = buildPrisma();
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`[reclassificar-areas] ${DRY_RUN ? 'DRY RUN — ' : ''}iniciando...`);

  const total = await prisma.emendaParlamentar.count({ where: { area: 'OUTROS' } });
  console.log(`[reclassificar-areas] emendas com OUTROS: ${total}`);

  const PAGE = 500;
  let skip = 0;
  let atualizadas = 0;
  let mantidas = 0;
  const porArea: Record<string, number> = {};

  while (skip < total) {
    const lote = await prisma.emendaParlamentar.findMany({
      where: { area: 'OUTROS' },
      select: { id: true, funcao: true },
      skip,
      take: PAGE,
    });
    if (lote.length === 0) break;

    const updates: Array<{ id: string; area: EmendaArea }> = [];
    for (const e of lote) {
      const novaArea = classificarArea(null, e.funcao);
      if (novaArea !== 'OUTROS') {
        updates.push({ id: e.id, area: novaArea });
        porArea[novaArea] = (porArea[novaArea] ?? 0) + 1;
      } else {
        mantidas++;
      }
    }

    if (!DRY_RUN && updates.length > 0) {
      const CONC = 50; // pool local agora tem 50 conexões — sem fila
      for (let i = 0; i < updates.length; i += CONC) {
        await Promise.all(
          updates.slice(i, i + CONC).map((u) =>
            prisma.emendaParlamentar.update({ where: { id: u.id }, data: { area: u.area } }),
          ),
        );
      }
    }

    atualizadas += updates.length;
    skip += lote.length;
    process.stdout.write(`\r  processadas ${Math.min(skip, total)}/${total} — atualizadas: ${atualizadas}`);
  }

  console.log('\n');
  console.log('[reclassificar-areas] resultado:');
  console.log(`  atualizadas : ${atualizadas}`);
  console.log(`  mantidas OUTROS: ${mantidas}`);
  if (Object.keys(porArea).length > 0) {
    console.log('  distribuição das novas áreas:');
    Object.entries(porArea)
      .sort(([, a], [, b]) => b - a)
      .forEach(([area, n]) => console.log(`    ${area}: ${n}`));
  }
  if (DRY_RUN) console.log('\n  [dry-run] nenhuma escrita realizada.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
