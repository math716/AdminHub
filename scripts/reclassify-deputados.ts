/**
 * Reclassifica Parlamentares marcados como DEPUTADO_ESTADUAL para DEPUTADO_FEDERAL.
 *
 * Por que existe:
 *   O Portal da Transparência SÓ contém emendas federais (deputados federais +
 *   senadores). Estaduais e vereadores fazem emendas em portais separados.
 *   A regra antiga em sync-emendas-portal.ts dava falso positivo de
 *   DEPUTADO_ESTADUAL ao casar com tipoEmenda contendo "ESTADUAL"
 *   (ex.: "Bancada Estadual"). Após a correção do inferCargo, novos syncs
 *   não criam mais esses registros — este script corrige os existentes.
 *
 * Estratégia:
 *   - Update massivo: cargo = DEPUTADO_FEDERAL onde cargo = DEPUTADO_ESTADUAL.
 *   - Rode DEPOIS de sync-senadores.ts (que reclassifica senadores) — assim
 *     se algum senador foi mal classificado como ESTADUAL, ele já virou
 *     SENADOR antes deste script rodar.
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/reclassify-deputados.ts
 *
 * Idempotente — pode rodar de novo sem efeito.
 */

import { PrismaClient } from '@prisma/client';

const dbUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const prisma = new PrismaClient({
  datasources: { db: { url: dbUrl } },
});

async function main() {
  console.log('\n🔄 Reclassificando DEPUTADO_ESTADUAL → DEPUTADO_FEDERAL\n');

  const antes = await prisma.parlamentar.count({ where: { cargo: 'DEPUTADO_ESTADUAL' } });
  console.log(`   ${antes} parlamentares com cargo DEPUTADO_ESTADUAL no banco.`);

  if (antes === 0) {
    console.log('\n✅ Nada para reclassificar.\n');
    return;
  }

  // Mostra alguns nomes pra sanity check antes de mudar
  const amostra = await prisma.parlamentar.findMany({
    where: { cargo: 'DEPUTADO_ESTADUAL' },
    select: { nome: true, partido: true, uf: true },
    take: 10,
  });
  console.log('\n   Amostra:');
  amostra.forEach((p) => {
    console.log(`     - ${p.nome}${p.partido ? ` (${p.partido})` : ''}${p.uf ? ` · ${p.uf}` : ''}`);
  });

  console.log('\n   Atualizando…');
  const result = await prisma.parlamentar.updateMany({
    where: { cargo: 'DEPUTADO_ESTADUAL' },
    data:  { cargo: 'DEPUTADO_FEDERAL' },
  });
  console.log(`\n✅ ${result.count} parlamentares reclassificados.\n`);
}

main()
  .catch((e) => {
    console.error('\n❌ Erro:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
