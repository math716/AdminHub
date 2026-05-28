import { buildPrisma } from '../estados/base-import-estadual';

async function main() {
  const prisma = buildPrisma();
  try {
    // Tenta upsert de um parlamentar MS que falhou
    const idPortal = 'MS:MARA CASEIRO';
    console.log('Tentando upsert:', idPortal);
    const p = await prisma.parlamentar.upsert({
      where: { idPortal },
      create: { idPortal, nome: 'Mara Caseiro', cargo: 'DEPUTADO_ESTADUAL', uf: 'MS' },
      update: {},
    });
    console.log('✅ Sucesso:', p.id, p.nome);

    // Verifica quantas emendas MS/ES ficaram sem parlamentarId
    const semParlamentar = await prisma.emendaParlamentar.count({
      where: { uf: { in: ['MS', 'ES'] }, parlamentarId: null },
    });
    console.log(`\nEmendas MS/ES sem parlamentarId: ${semParlamentar}`);

    const total = await prisma.emendaParlamentar.count({
      where: { uf: { in: ['MS', 'ES'] } },
    });
    console.log(`Total MS/ES: ${total}`);

  } catch (e: any) {
    console.error('❌ Erro completo:');
    console.error(e.message);
    console.error('\nCódigo:', e.code);
    console.error('Meta:', JSON.stringify(e.meta));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
