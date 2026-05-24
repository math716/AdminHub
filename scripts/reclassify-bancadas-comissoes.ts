/**
 * Reclassifica Parlamentares que são na verdade entidades coletivas:
 *   - "BANCADA DO ESTADO DE SAO PAULO" → BANCADA
 *   - "COMISSAO MISTA DE ORCAMENTO"    → COMISSAO
 *   - "RELATOR" / "RELATOR GERAL"      → RELATOR
 *
 * Por que existe:
 *   O sync-emendas-portal antigo (e o sync de senadores/deputados) tratavam
 *   todo `autorNome` como pessoa física, colocando bancadas e comissões na
 *   gaveta de DEPUTADO_FEDERAL. Esta migração corrige os registros existentes
 *   baseado no padrão do nome. Novos syncs já vêm com cargo certo via o
 *   inferCargo atualizado.
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/reclassify-bancadas-comissoes.ts
 *
 * Idempotente — pode rodar de novo sem efeito.
 *
 * IMPORTANTE: precisa rodar APÓS aplicar a migração do enum (db push) que
 * adiciona BANCADA, COMISSAO, RELATOR. Caso contrário, o update falha porque
 * o valor não existe no enum do Postgres.
 */

import { PrismaClient } from '@prisma/client';

const dbUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const prisma = new PrismaClient({
  datasources: { db: { url: dbUrl } },
});

async function main() {
  console.log('\n🔄 Reclassificando entidades coletivas (Bancada / Comissão / Relator)\n');

  // ── BANCADAS ─────────────────────────────────────────────────────────────
  const bancadasAntes = await prisma.parlamentar.findMany({
    where: {
      nome:    { contains: 'BANCADA', mode: 'insensitive' },
      cargo:   { not: 'BANCADA' },
    },
    select: { nome: true, cargo: true },
    take: 5,
  });
  if (bancadasAntes.length > 0) {
    console.log('   Amostra de bancadas detectadas:');
    bancadasAntes.forEach((p) => console.log(`     - ${p.nome} (atualmente: ${p.cargo})`));
  }
  const bancadas = await prisma.parlamentar.updateMany({
    where: {
      nome:    { contains: 'BANCADA', mode: 'insensitive' },
      cargo:   { not: 'BANCADA' },
    },
    data: { cargo: 'BANCADA', partido: null, uf: null },
  });
  console.log(`✅ ${bancadas.count} reclassificados como BANCADA\n`);

  // ── COMISSÕES ────────────────────────────────────────────────────────────
  // Match em duas grafias (com e sem cedilha) — o Portal usa as duas.
  const comissoesAntes = await prisma.parlamentar.findMany({
    where: {
      OR: [
        { nome: { contains: 'COMISSAO', mode: 'insensitive' } },
        { nome: { contains: 'COMISSÃO', mode: 'insensitive' } },
      ],
      cargo: { not: 'COMISSAO' },
    },
    select: { nome: true, cargo: true },
    take: 5,
  });
  if (comissoesAntes.length > 0) {
    console.log('   Amostra de comissões detectadas:');
    comissoesAntes.forEach((p) => console.log(`     - ${p.nome} (atualmente: ${p.cargo})`));
  }
  const comissoes = await prisma.parlamentar.updateMany({
    where: {
      OR: [
        { nome: { contains: 'COMISSAO', mode: 'insensitive' } },
        { nome: { contains: 'COMISSÃO', mode: 'insensitive' } },
      ],
      cargo: { not: 'COMISSAO' },
    },
    data: { cargo: 'COMISSAO', partido: null, uf: null },
  });
  console.log(`✅ ${comissoes.count} reclassificados como COMISSAO\n`);

  // ── RELATORES ────────────────────────────────────────────────────────────
  // startsWith("RELATOR") pra não pegar nomes que contenham relator no meio.
  // Match em modo insensitive: pega "RELATOR", "RELATOR GERAL" etc.
  const relatoresAntes = await prisma.parlamentar.findMany({
    where: {
      nome:  { startsWith: 'RELATOR', mode: 'insensitive' },
      cargo: { not: 'RELATOR' },
    },
    select: { nome: true, cargo: true },
    take: 5,
  });
  if (relatoresAntes.length > 0) {
    console.log('   Amostra de relatores detectados:');
    relatoresAntes.forEach((p) => console.log(`     - ${p.nome} (atualmente: ${p.cargo})`));
  }
  const relatores = await prisma.parlamentar.updateMany({
    where: {
      nome:  { startsWith: 'RELATOR', mode: 'insensitive' },
      cargo: { not: 'RELATOR' },
    },
    data: { cargo: 'RELATOR', partido: null, uf: null },
  });
  console.log(`✅ ${relatores.count} reclassificados como RELATOR\n`);

  const total = bancadas.count + comissoes.count + relatores.count;
  if (total === 0) {
    console.log('Nada para reclassificar — banco já estava certo.\n');
  } else {
    console.log(`Total reclassificado: ${total} entidades coletivas.\n`);
  }
}

main()
  .catch((e) => {
    console.error('\n❌ Erro:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
