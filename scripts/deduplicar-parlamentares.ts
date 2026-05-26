/**
 * Mescla parlamentares duplicados no banco.
 *
 * Causa: o CSV cria registros com idPortal="NOME" (tem partido, cargo etc.)
 *        a API cria registros com idPortal="PORTAL:NOME" (sem partido)
 * Solução: para cada par, manter o mais completo e redirecionar as emendas.
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/deduplicar-parlamentares.ts
 *   npx tsx --require dotenv/config scripts/deduplicar-parlamentares.ts --dry-run
 */
import { PrismaClient } from '@prisma/client';

const url = (process.env.DATABASE_URL ?? '') + ((process.env.DATABASE_URL ?? '').includes('?') ? '&' : '?') + 'pgbouncer=true';
const prisma = new PrismaClient({ datasources: { db: { url } } });
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`[deduplicar] ${DRY_RUN ? 'DRY RUN — ' : ''}iniciando...`);

  const dups: any[] = await prisma.$queryRaw`
    SELECT nome, array_agg(id ORDER BY "idPortal") AS ids, array_agg("idPortal" ORDER BY "idPortal") AS portais,
           array_agg(partido ORDER BY "idPortal") AS partidos, array_agg(cargo ORDER BY "idPortal") AS cargos
    FROM parlamentares
    GROUP BY nome
    HAVING COUNT(*) > 1
    ORDER BY nome
  `;

  console.log(`[deduplicar] pares duplicados encontrados: ${dups.length}`);

  let mesclados = 0;
  let emendasRedirecionadas = 0;
  let erros = 0;

  for (const dup of dups) {
    try {
      // Escolhe qual manter: preferir o sem prefixo "PORTAL:" (tem partido do CSV)
      // Se ambos têm ou nenhum tem, mantém o primeiro (mais antigo pelo array_agg)
      const portalIdx = (dup.portais as string[]).findIndex((p: string) => p.startsWith('PORTAL:'));
      const semPrefixoIdx = (dup.portais as string[]).findIndex((p: string) => !p.startsWith('PORTAL:'));

      let manterIdx: number;
      let removerIdx: number;

      if (semPrefixoIdx >= 0 && portalIdx >= 0) {
        // Caso normal: um com prefixo, outro sem — manter o sem prefixo
        manterIdx = semPrefixoIdx;
        removerIdx = portalIdx;
      } else {
        // Ambos com ou sem prefixo — manter o que tem mais dados (partido preenchido)
        const comPartido = (dup.partidos as (string | null)[]).findIndex((p) => p != null);
        manterIdx = comPartido >= 0 ? comPartido : 0;
        removerIdx = manterIdx === 0 ? 1 : 0;
      }

      const idManter  = dup.ids[manterIdx];
      const idRemover = dup.ids[removerIdx];

      // Atualiza partido/cargo no registro mantido se estiver vazio
      const partidoManter  = dup.partidos[manterIdx];
      const partidoRemover = dup.partidos[removerIdx];
      const cargoRemover   = dup.cargos[removerIdx];

      if (!DRY_RUN) {
        // 1. Preencher campos faltantes no registro que vai ser mantido
        if (!partidoManter && partidoRemover) {
          await prisma.parlamentar.update({
            where: { id: idManter },
            data: { partido: partidoRemover, cargo: cargoRemover },
          });
        }

        // 2. Redirecionar emendas do registro a remover → mantido
        const { count } = await prisma.emendaParlamentar.updateMany({
          where: { parlamentarId: idRemover },
          data:  { parlamentarId: idManter },
        });
        emendasRedirecionadas += count;

        // 3. Deletar o duplicado
        await prisma.parlamentar.delete({ where: { id: idRemover } });
      }

      mesclados++;
    } catch (e: any) {
      console.error(`Erro ao mesclar "${dup.nome}":`, e.message);
      erros++;
    }
  }

  console.log('\n[deduplicar] resultado:');
  console.log(`  pares mesclados    : ${mesclados}`);
  console.log(`  emendas redirecionadas: ${emendasRedirecionadas}`);
  console.log(`  erros              : ${erros}`);
  if (DRY_RUN) console.log('\n  [dry-run] nenhuma escrita realizada.');

  // Verificação final
  if (!DRY_RUN) {
    const restante: any[] = await prisma.$queryRaw`
      SELECT COUNT(*)::int as dup FROM (SELECT nome FROM parlamentares GROUP BY nome HAVING COUNT(*) > 1) t
    `;
    console.log(`\n  duplicatas restantes: ${restante[0].dup}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
