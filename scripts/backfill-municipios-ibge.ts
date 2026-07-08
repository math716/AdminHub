/**
 * Backfill: preenche codigoIbge nos registros de emendas estaduais que têm
 * municipioNome mas não têm codigoIbge, usando a API do IBGE.
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/backfill-municipios-ibge.ts
 *   npx tsx --require dotenv/config scripts/backfill-municipios-ibge.ts --uf SP
 */
import { PrismaClient } from '@prisma/client';
import { buildPrismaUrl, normalizeNome } from './estados/base-import-estadual';

function arg(name: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return undefined;
}

const UF_FILTER = arg('uf');

async function fetchMunicipiosUF(uf: string): Promise<Map<string, string>> {
  const res = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`);
  if (!res.ok) throw new Error(`IBGE HTTP ${res.status} para UF=${uf}`);
  const data = await res.json() as Array<{ id: number; nome: string }>;
  const map = new Map<string, string>();
  for (const m of data) map.set(normalizeNome(m.nome), String(m.id));
  return map;
}

async function main() {
  const prisma = new PrismaClient({ datasources: { db: { url: buildPrismaUrl() } } });

  try {
    // Busca todos os registros sem codigoIbge mas com municipioNome
    const semIbge = await prisma.emendaParlamentar.findMany({
      where: {
        codigoIbge: null,
        municipioNome: { not: null },
        esfera: 'ESTADUAL',
        ...(UF_FILTER ? { uf: UF_FILTER.toUpperCase() } : {}),
      },
      select: { id: true, uf: true, municipioNome: true },
    });

    if (semIbge.length === 0) {
      console.log('Nenhum registro sem codigoIbge encontrado. Nada a fazer.');
      return;
    }

    console.log(`${semIbge.length} emendas sem codigoIbge encontradas.`);

    // Agrupa por UF
    const porUf = new Map<string, typeof semIbge>();
    for (const e of semIbge) {
      const uf = e.uf ?? 'XX';
      if (!porUf.has(uf)) porUf.set(uf, []);
      porUf.get(uf)!.push(e);
    }

    let totalAtualizados = 0;
    let totalSemMatch = 0;

    for (const [uf, registros] of porUf) {
      console.log(`\n[${uf}] ${registros.length} registros — buscando municípios no IBGE...`);
      const municipiosMap = await fetchMunicipiosUF(uf);

      // Agrupa por municipioNome único
      const porNome = new Map<string, string[]>();
      for (const e of registros) {
        const nome = e.municipioNome!;
        if (!porNome.has(nome)) porNome.set(nome, []);
        porNome.get(nome)!.push(e.id);
      }

      let ufAtualizados = 0;
      let ufSemMatch = 0;

      for (const [nome, ids] of porNome) {
        const codigo = municipiosMap.get(normalizeNome(nome));
        if (!codigo) {
          console.warn(`  [sem match] "${nome}"`);
          ufSemMatch += ids.length;
          continue;
        }

        const { count } = await prisma.emendaParlamentar.updateMany({
          where: { id: { in: ids } },
          data: { codigoIbge: codigo },
        });
        ufAtualizados += count;
      }

      console.log(`[${uf}] atualizado: ${ufAtualizados} | sem match: ${ufSemMatch}`);
      totalAtualizados += ufAtualizados;
      totalSemMatch += ufSemMatch;
    }

    console.log(`\n✅ Backfill concluído:`);
    console.log(`   atualizados : ${totalAtualizados}`);
    console.log(`   sem match   : ${totalSemMatch}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
