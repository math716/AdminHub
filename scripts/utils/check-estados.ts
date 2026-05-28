import { buildPrisma } from '../estados/base-import-estadual';

async function main() {
  const prisma = buildPrisma();
  try {
    const rows = await prisma.emendaParlamentar.groupBy({
      by: ['uf', 'ano'],
      where: { esfera: 'ESTADUAL' },
      _count: { id: true },
      orderBy: [{ uf: 'asc' }, { ano: 'asc' }],
    });

    const byUf = new Map<string, { anos: number[]; total: number }>();
    for (const r of rows) {
      if (!byUf.has(r.uf)) byUf.set(r.uf, { anos: [], total: 0 });
      const entry = byUf.get(r.uf)!;
      entry.anos.push(r.ano);
      entry.total += r._count.id;
    }

    const todos = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];
    const importados = [...byUf.keys()].sort();
    const faltando = todos.filter((uf) => !byUf.has(uf));

    console.log('\n=== ESTADOS IMPORTADOS ===');
    for (const uf of importados) {
      const { anos, total } = byUf.get(uf)!;
      console.log(`  ${uf}: ${anos.join(', ')} — ${total} emendas`);
    }

    console.log('\n=== FALTANDO (' + faltando.length + ') ===');
    console.log(' ', faltando.join(', '));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
