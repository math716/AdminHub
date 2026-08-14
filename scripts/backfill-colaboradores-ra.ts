/**
 * Backfill: para colaboradores que têm zonas eleitorais mas nenhuma RA correspondente,
 * insere a RA derivada da zona.
 *
 * Uso: npx tsx --require dotenv/config scripts/backfill-colaboradores-ra.ts
 */

import { PrismaClient } from '@prisma/client';
import { derivarRasDeZonas } from '../lib/colaboradores-zonas';

const prisma = new PrismaClient();

function normRA(s: string) {
  return s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

async function main() {
  const colaboradores = await prisma.colaborador.findMany({
    select: {
      id: true,
      nome: true,
      regioes: { select: { id: true, regiaoNome: true, tipo: true } },
    },
  });

  let total = 0;
  let corrigidos = 0;
  let inseridos = 0;

  for (const c of colaboradores) {
    total++;

    const zonas = c.regioes.filter(r => r.tipo === 'ZONA');
    if (zonas.length === 0) continue;

    const rasExistentes = new Set(
      c.regioes.filter(r => r.tipo === 'RA').map(r => normRA(r.regiaoNome))
    );

    // Calcula as RAs que deveriam existir baseadas nas zonas
    const zonaStrings = zonas.map(z => z.regiaoNome.replace('Zona ', ''));
    const rasEsperadas = derivarRasDeZonas(zonaStrings);

    // Filtra apenas as RAs que ainda não existem
    const rasFaltando = rasEsperadas.filter(r => !rasExistentes.has(normRA(r.regiaoNome)));

    if (rasFaltando.length === 0) continue;

    await prisma.colaboradorRegiao.createMany({
      data: rasFaltando.map(r => ({
        colaboradorId: c.id,
        uf: r.uf,
        regiaoNome: r.regiaoNome,
        tipo: r.tipo,
      })),
      skipDuplicates: true,
    });

    console.log(`[OK] ${c.nome}: +${rasFaltando.map(r => r.regiaoNome).join(', ')}`);
    corrigidos++;
    inseridos += rasFaltando.length;
  }

  console.log(`\nTotal verificados : ${total}`);
  console.log(`Colaboradores corrigidos: ${corrigidos}`);
  console.log(`RAs inseridas     : ${inseridos}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
