/**
 * Enriquece emendas já sincronizadas com documentos detalhados.
 *
 * Pré-requisito: `scripts/sync-emendas-portal.ts` já rodou e populou
 * `EmendaParlamentar`. Esse script lê do banco, e pra cada emenda chama
 *   /api-de-dados/emendas/documentos/{codigo}  → lista de empenhos
 *   /api-de-dados/despesas/documentos/{cod}   → detalhe (favorecido, etc)
 * e persiste em `EmendaDocumento`.
 *
 * Por que separado do sync principal:
 *   - Sync já leva ~30min/ano. Enrich multiplica isso por ~10 (1 + N requests
 *     por emenda). Faz mais sentido enriquecer em fases / em background.
 *   - Permite rerodar enrich pra atualizar empenho→liquidação→pagamento sem
 *     mexer no upsert da emenda em si.
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/enrich-emendas-documentos.ts \
 *     [--ano 2024] [--uf SP] [--limit 1000] [--delay-ms 100] \
 *     [--no-only-missing] [--concurrency 4]
 *
 * Flags:
 *   --ano N           só enriquece emendas do ano N (default: ano corrente)
 *   --uf XX           só do estado XX (opcional, processa Brasil inteiro se omitido)
 *   --limit N         processa no máximo N emendas (default: 500)
 *   --no-only-missing rerroda enrich em todas (default: só emendas sem docs)
 *   --concurrency N   nº de emendas processadas em paralelo (default: 4)
 *   --delay-ms N      pausa após cada batch (default: 100ms)
 */

import { PrismaClient } from '@prisma/client';
import { enrichEmenda } from '../lib/emendas/enrich-emenda';

const dbUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

// ─────────────────────────────────────────────────────────────────────────
// CLI args
// ─────────────────────────────────────────────────────────────────────────
function arg(name: string, def?: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return def;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const ANO = parseInt(arg('ano', String(new Date().getFullYear()))!, 10);
const UF = arg('uf');
const LIMIT = parseInt(arg('limit', '500')!, 10);
const CONCURRENCY = parseInt(arg('concurrency', '4')!, 10);
const DELAY_MS = parseInt(arg('delay-ms', '100')!, 10);
const ONLY_MISSING = !flag('no-only-missing');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔄 Enrich emendas — ano=${ANO}${UF ? ` uf=${UF}` : ''}, limit=${LIMIT}, concurrency=${CONCURRENCY}, only-missing=${ONLY_MISSING}\n`);
  const inicio = Date.now();

  const emendas = await prisma.emendaParlamentar.findMany({
    where: {
      ano: ANO,
      ...(UF ? { uf: UF.toUpperCase() } : {}),
      ...(ONLY_MISSING ? { documentos: { none: {} } } : {}),
    },
    select: { id: true, idPortal: true, uf: true },
    take: LIMIT,
    orderBy: { fetchedAt: 'asc' },
  });

  console.log(`   ${emendas.length} emendas selecionadas pra enrich.\n`);
  if (emendas.length === 0) {
    console.log('   nada a fazer.');
    return;
  }

  let totalEmendasOk = 0;
  let totalDocsPersistidos = 0;
  let totalErros = 0;

  for (let i = 0; i < emendas.length; i += CONCURRENCY) {
    const batch = emendas.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((e) =>
        enrichEmenda(e.idPortal, { emendaId: e.id, emendaUf: e.uf }).catch((err) => ({
          codigoEmenda: e.idPortal,
          docsEncontrados: 0,
          docsPersistidos: 0,
          erros: [{ codigoDocumento: '(enrich)', mensagem: err.message ?? String(err) }],
        })),
      ),
    );

    for (const r of results) {
      if (r.erros.length === 0) totalEmendasOk++;
      totalDocsPersistidos += r.docsPersistidos;
      totalErros += r.erros.length;
    }

    const elapsedMin = ((Date.now() - inicio) / 60_000).toFixed(1);
    const processed = Math.min(i + CONCURRENCY, emendas.length);
    process.stdout.write(
      `\r   ${processed}/${emendas.length} emendas | ${totalDocsPersistidos} docs | ${totalErros} erros | ${elapsedMin}min     `,
    );

    if (i + CONCURRENCY < emendas.length) await sleep(DELAY_MS);
  }

  const totalMin = ((Date.now() - inicio) / 60_000).toFixed(1);
  console.log(`\n\n✅ Enrich concluído!`);
  console.log(`   ${totalEmendasOk}/${emendas.length} emendas processadas sem erro`);
  console.log(`   ${totalDocsPersistidos} documentos persistidos`);
  console.log(`   ${totalErros} erros`);
  console.log(`   ${totalMin}min de execução`);
}

main()
  .catch((e) => {
    console.error('\n❌ Erro:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
