/**
 * Remove parlamentares duplicados do banco.
 *
 * Duplicatas surgem quando o mesmo parlamentar é criado por múltiplas fontes:
 *   - CSV federal  → idPortal = "NOME CAPS"
 *   - Portal API   → idPortal = "PORTAL:NOME CAPS"
 *   - Importações  → idPortal = "Nome Title Case" ou "UF:NOME"
 *
 * Estratégia: para cada grupo com mesmo nome normalizado, elege um "vencedor"
 * (prioridade: tem CPF > prefixo PORTAL: > mais emendas), reatribui todas as
 * emendas e transferências Pix ao vencedor, e deleta os demais.
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/dedup-parlamentares.ts
 *   npx tsx --require dotenv/config scripts/dedup-parlamentares.ts --dry-run
 */
import { buildPrisma, buildPrismaUrl, normalizeNome } from './estados/base-import-estadual';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`\n🔄 Deduplicação de parlamentares${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  const prisma = buildPrisma();

  try {
    const todos = await prisma.parlamentar.findMany({
      select: {
        id: true, nome: true, cpf: true, idPortal: true,
        cargo: true, partido: true, uf: true,
        _count: { select: { emendas: true } },
      },
    });

    console.log(`  Total parlamentares no banco: ${todos.length}`);

    // Agrupa por nome normalizado
    const grupos = new Map<string, typeof todos>();
    for (const p of todos) {
      const key = normalizeNome(p.nome);
      if (!grupos.has(key)) grupos.set(key, []);
      grupos.get(key)!.push(p);
    }

    const duplicatas = [...grupos.values()].filter(g => g.length > 1);
    console.log(`  Grupos com duplicatas: ${duplicatas.length}`);

    let totalRemovidos = 0;
    let totalEmendas   = 0;
    let totalPix       = 0;

    for (const grupo of duplicatas) {
      // Elege vencedor: CPF > PORTAL: prefix > mais emendas
      const vencedor = grupo.sort((a, b) => {
        if (a.cpf && !b.cpf) return -1;
        if (!a.cpf && b.cpf) return  1;
        const aPortal = a.idPortal.startsWith('PORTAL:') ? 1 : 0;
        const bPortal = b.idPortal.startsWith('PORTAL:') ? 1 : 0;
        if (aPortal !== bPortal) return bPortal - aPortal;
        return b._count.emendas - a._count.emendas;
      })[0];

      const perdedores = grupo.filter(p => p.id !== vencedor.id);

      for (const p of perdedores) {
        if (!DRY_RUN) {
          // Reatribui emendas
          const { count: emCount } = await prisma.emendaParlamentar.updateMany({
            where: { parlamentarId: p.id },
            data:  { parlamentarId: vencedor.id },
          });
          // Reatribui transferências Pix
          const { count: pixCount } = await prisma.transferenciaPix.updateMany({
            where: { parlamentarId: p.id },
            data:  { parlamentarId: vencedor.id },
          });
          // Deleta o duplicado
          await prisma.parlamentar.delete({ where: { id: p.id } });
          totalEmendas += emCount;
          totalPix     += pixCount;
        } else {
          totalEmendas += p._count.emendas;
        }
        totalRemovidos++;
      }
    }

    console.log(`\n✅ Concluído${DRY_RUN ? ' [DRY RUN]' : ''}:`);
    console.log(`   parlamentares removidos  : ${totalRemovidos}`);
    console.log(`   emendas reatribuídas     : ${totalEmendas}`);
    console.log(`   transferências Pix       : ${totalPix}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1); });
