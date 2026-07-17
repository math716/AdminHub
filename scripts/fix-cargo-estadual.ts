/**
 * Corrige parlamentares com cargo=DEPUTADO_FEDERAL que só possuem emendas
 * com esfera=ESTADUAL — resultado de imports via UI que não tinham coluna
 * de cargo e usavam DEPUTADO_FEDERAL como fallback indevido.
 *
 * Lógica:
 *   Para cada Parlamentar com cargo=DEPUTADO_FEDERAL:
 *     - Conta quantas emendas têm esfera=FEDERAL
 *     - Se zero → atualiza cargo para DEPUTADO_ESTADUAL
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/fix-cargo-estadual.ts
 *   npx tsx --require dotenv/config scripts/fix-cargo-estadual.ts --dry-run
 */
import { PrismaClient } from '@prisma/client';

const DRY_RUN = process.argv.includes('--dry-run');

const dbUrl = (() => {
  const raw = process.env.DATABASE_URL ?? '';
  return raw + (raw.includes('?') ? '&' : '?') + 'pgbouncer=true&connection_limit=5';
})();
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  console.log(`\nFix cargo estadual${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  const candidatos = await prisma.parlamentar.findMany({
    where: { cargo: 'DEPUTADO_FEDERAL' },
    select: {
      id: true,
      nome: true,
      idPortal: true,
      uf: true,
      _count: { select: { emendas: true } },
    },
  });

  console.log(`Parlamentares com cargo=DEPUTADO_FEDERAL: ${candidatos.length}`);

  let corrigidos = 0;
  let ignorados  = 0;

  for (const parl of candidatos) {
    const temFederal = await prisma.emendaParlamentar.count({
      where: { parlamentarId: parl.id, esfera: 'FEDERAL' },
    });

    if (temFederal > 0) {
      ignorados++;
      continue;
    }

    const totalEstadual = await prisma.emendaParlamentar.count({
      where: { parlamentarId: parl.id, esfera: 'ESTADUAL' },
    });

    if (totalEstadual === 0) {
      ignorados++;
      continue;
    }

    console.log(
      `  [${DRY_RUN ? 'DRY' : 'FIX'}] ${parl.nome} (${parl.uf ?? '?'}) — ${totalEstadual} emendas estaduais, 0 federais`,
    );

    if (!DRY_RUN) {
      await prisma.parlamentar.update({
        where: { id: parl.id },
        data:  { cargo: 'DEPUTADO_ESTADUAL' },
      });
    }

    corrigidos++;
  }

  console.log(`\nResultado:`);
  console.log(`  Corrigidos : ${corrigidos}`);
  console.log(`  Ignorados  : ${ignorados} (têm emendas federais ou nenhuma emenda)`);
  if (DRY_RUN) console.log(`\n  [DRY RUN] Nenhuma alteração aplicada.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
