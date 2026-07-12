/**
 * Deduplica parlamentares com o mesmo nome no banco.
 *
 * Causa comum: o import federal cria parlamentares via nome com prefixo
 * "PORTAL:", enquanto scripts antigos (sync-deputados-federais, etc.) criavam
 * os mesmos via código da Câmara/Senado com prefixo diferente — gerando dois
 * registros para a mesma pessoa.
 *
 * Estratégia:
 *   1. Agrupa parlamentares pelo nome normalizado (sem acento, maiúsculo)
 *   2. Para cada grupo com > 1 membro, elege um "canônico":
 *      - Prefere quem tem idPortal com prefixo "PORTAL:" (em uso pelo import atual)
 *      - Desempate: quem tem mais emendas
 *   3. Reassinala emendas e transferências do(s) duplicado(s) para o canônico
 *   4. Deleta o(s) duplicado(s)
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/dedup-parlamentares.ts
 *   npx tsx --require dotenv/config scripts/dedup-parlamentares.ts --dry-run
 */
import { PrismaClient } from '@prisma/client';

const DRY_RUN = process.argv.includes('--dry-run');

const dbUrl = (() => {
  const raw = process.env.DATABASE_URL ?? '';
  return raw + (raw.includes('?') ? '&' : '?') + 'pgbouncer=true&connection_limit=5';
})();
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  console.log(`\n🔍 Dedup parlamentares${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  const todos = await prisma.parlamentar.findMany({
    select: {
      id: true, nome: true, idPortal: true, cargo: true, uf: true, partido: true,
      _count: { select: { emendas: true } },
    },
  });

  console.log(`   ${todos.length} parlamentares no banco`);

  // Agrupa por nome normalizado
  const grupos = new Map<string, typeof todos>();
  for (const p of todos) {
    const chave = normalizar(p.nome);
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave)!.push(p);
  }

  const duplicados = [...grupos.values()].filter((g) => g.length > 1);
  console.log(`   ${duplicados.length} grupos com duplicatas\n`);

  if (duplicados.length === 0) {
    console.log('✅ Nenhuma duplicata encontrada.');
    return;
  }

  let mergeados = 0;
  let deletados = 0;

  for (const grupo of duplicados) {
    // Elege canônico com 3 prioridades:
    // 1. PORTAL:NAME  → import federal (mais estável)
    // 2. STATE:NAME   → import estadual (SP:, RJ:, DF:, MG: etc.) — evita recriar na próxima importação
    // 3. null / outro → registros antigos sem prefixo
    // Desempate: quem tem mais emendas
    const prioridade = (id: string | null): number => {
      if (id?.startsWith('PORTAL:')) return 2;
      if (id && id.includes(':'))   return 1; // STATE: prefix
      return 0;
    };
    const canonico = grupo.slice().sort((a, b) => {
      const diff = prioridade(b.idPortal) - prioridade(a.idPortal);
      if (diff !== 0) return diff;
      return b._count.emendas - a._count.emendas;
    })[0];

    const duplicatas = grupo.filter((p) => p.id !== canonico.id);

    console.log(`  [merge] "${canonico.nome}" (${canonico.cargo})`);
    console.log(`     canônico : ${canonico.id} idPortal=${canonico.idPortal} emendas=${canonico._count.emendas}`);

    for (const dup of duplicatas) {
      console.log(`     duplicata: ${dup.id} idPortal=${dup.idPortal} emendas=${dup._count.emendas}`);

      if (!DRY_RUN) {
        // Busca emendas do canônico e da duplicata em paralelo para lookup em memória
        const [emendasCanonicos, emendasDup] = await Promise.all([
          prisma.emendaParlamentar.findMany({
            where: { parlamentarId: canonico.id },
            select: { ano: true, numero: true },
          }),
          prisma.emendaParlamentar.findMany({
            where: { parlamentarId: dup.id },
            select: { id: true, ano: true, numero: true },
          }),
        ]);

        // Set de chaves já existentes no canônico → lookup O(1)
        const canonicosKey = new Set(
          emendasCanonicos
            .filter((e) => e.numero)
            .map((e) => `${e.ano}:${e.numero}`),
        );

        const conflitos: string[] = [];
        const migracao: string[] = [];
        for (const emenda of emendasDup) {
          if (emenda.numero && canonicosKey.has(`${emenda.ano}:${emenda.numero}`)) {
            conflitos.push(emenda.id);
          } else {
            migracao.push(emenda.id);
          }
        }

        // Deleta conflitos e migra restantes em batch (sem loop por emenda)
        const [deleted, updated, pix] = await Promise.all([
          conflitos.length > 0
            ? prisma.emendaParlamentar.deleteMany({ where: { id: { in: conflitos } } })
            : Promise.resolve({ count: 0 }),
          migracao.length > 0
            ? prisma.emendaParlamentar.updateMany({ where: { id: { in: migracao } }, data: { parlamentarId: canonico.id } })
            : Promise.resolve({ count: 0 }),
          prisma.transferenciaPix.updateMany({
            where: { parlamentarId: dup.id },
            data: { parlamentarId: canonico.id },
          }),
        ]);
        const emMigradas = updated.count;
        const emConflito = deleted.count;
        console.log(`       → ${emMigradas} emendas migradas, ${emConflito} duplicatas removidas, ${pix.count} pix migrados`);

        // Deleta duplicata
        await prisma.parlamentar.delete({ where: { id: dup.id } });
        console.log(`       → deletado`);
      }

      mergeados++;
      deletados++;
    }
  }

  console.log(`\n${DRY_RUN ? '[dry-run] ' : ''}✅ Concluído:`);
  console.log(`   ${mergeados} duplicatas mergeadas`);
  console.log(`   ${deletados} registros que seriam deletados`);
}

main()
  .catch((e) => { console.error('\n❌', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
