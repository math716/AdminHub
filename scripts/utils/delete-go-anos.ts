import { buildPrisma } from '../estados/base-import-estadual';

async function main() {
  const prisma = buildPrisma();
  const r = await prisma.emendaParlamentar.deleteMany({
    where: { uf: 'GO', ano: { in: [2021, 2022] } },
  });
  console.log('Excluídos:', r.count);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
