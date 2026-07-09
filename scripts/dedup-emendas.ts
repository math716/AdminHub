/**
 * Remove EmendaParlamentar duplicadas do banco.
 *
 * Duplicatas surgem quando a mesma emenda é importada mais de uma vez com
 * idPortal diferente (ex.: campo idPortal gerado de formas distintas entre
 * importações). O resultado visível são duas linhas para o mesmo número de
 * emenda na tabela de destinos do dashboard.
 *
 * Estratégia: agrupa por (parlamentarId, ano, numero). Para cada grupo com
 * mais de um registro:
 *   1. Elege o "keeper" — o que tem mais EmendaDocumento (desempate: maior
 *      valorEmpenhado).
 *   2. Move os EmendaDocumento dos duplicados para o keeper (evitando
 *      duplicar codigoDocumento que já existe).
 *   3. Deleta os registros duplicados (documentos são cascadeados).
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/dedup-emendas.ts
 *   npx tsx --require dotenv/config scripts/dedup-emendas.ts --dry-run
 */

import { PrismaClient } from '@prisma/client';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`\nDeduplicação de EmendaParlamentar${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

  try {
    // Busca todos os grupos (parlamentarId, ano, numero) com mais de 1 registro
    type DupRow = { parlamentarId: string; ano: number; numero: string; count: bigint };
    const grupos = await prisma.$queryRaw<DupRow[]>`
      SELECT "parlamentarId", ano, numero, COUNT(*) AS count
      FROM emendas_parlamentares
      WHERE "parlamentarId" IS NOT NULL
        AND numero IS NOT NULL
      GROUP BY "parlamentarId", ano, numero
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
    `;

    if (grupos.length === 0) {
      console.log('Nenhuma duplicata encontrada.');
      return;
    }

    console.log(`Grupos duplicados encontrados: ${grupos.length}`);
    console.log(`Total de registros extras a remover: ${grupos.reduce((s, g) => s + (Number(g.count) - 1), 0)}\n`);

    let totalRemovidos = 0;
    let totalDocsReapontados = 0;

    for (const grupo of grupos) {
      const registros = await prisma.emendaParlamentar.findMany({
        where: {
          parlamentarId: grupo.parlamentarId,
          ano: grupo.ano,
          numero: grupo.numero,
        },
        include: { documentos: { select: { id: true, codigoDocumento: true } } },
        orderBy: [{ valorEmpenhado: 'desc' }],
      });

      if (registros.length < 2) continue;

      // Elege keeper: mais documentos, desempate por maior valorEmpenhado (já ordenado)
      registros.sort((a, b) => b.documentos.length - a.documentos.length || b.valorEmpenhado - a.valorEmpenhado);
      const keeper = registros[0];
      const duplicados = registros.slice(1);

      const keeperDocCodigos = new Set(keeper.documentos.map((d) => d.codigoDocumento));

      console.log(
        `  numero=${grupo.numero} ano=${grupo.ano} ` +
        `keeper=${keeper.id} (${keeper.documentos.length} docs) | ` +
        `removendo: ${duplicados.map((d) => `${d.id}(${d.documentos.length} docs)`).join(', ')}`
      );

      for (const dup of duplicados) {
        // Move documentos que ainda não existem no keeper
        const docsParaMover = dup.documentos.filter((d) => !keeperDocCodigos.has(d.codigoDocumento));
        if (docsParaMover.length > 0 && !DRY_RUN) {
          await prisma.emendaDocumento.updateMany({
            where: { id: { in: docsParaMover.map((d) => d.id) } },
            data: { emendaId: keeper.id },
          });
          docsParaMover.forEach((d) => keeperDocCodigos.add(d.codigoDocumento));
          totalDocsReapontados += docsParaMover.length;
        }
      }

      if (!DRY_RUN) {
        await prisma.emendaParlamentar.deleteMany({
          where: { id: { in: duplicados.map((d) => d.id) } },
        });
      }
      totalRemovidos += duplicados.length;
    }

    console.log(`\nConcluído.`);
    console.log(`  Registros removidos  : ${totalRemovidos}${DRY_RUN ? ' (simulado)' : ''}`);
    console.log(`  Documentos repontados: ${totalDocsReapontados}${DRY_RUN ? ' (simulado)' : ''}`);

  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
