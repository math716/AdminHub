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

interface MunicipiosResult {
  map: Map<string, string>;        // normalizado → código
  mapSemEspaco: Map<string, string>; // normalizado-sem-espaço → código (fallback para "Doeste" vs "D Oeste")
}

async function fetchMunicipiosUF(uf: string): Promise<MunicipiosResult> {
  const res = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`);
  if (!res.ok) throw new Error(`IBGE HTTP ${res.status} para UF=${uf}`);
  const data = await res.json() as Array<{ id: number; nome: string }>;
  const map = new Map<string, string>();
  const mapSemEspaco = new Map<string, string>();
  for (const m of data) {
    const norm = normalizeNome(m.nome);
    const id   = String(m.id);
    map.set(norm, id);
    mapSemEspaco.set(norm.replace(/\s/g, ''), id);
  }
  return { map, mapSemEspaco };
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
      select: { uf: true, municipioNome: true },
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
      const { map: municipiosMap, mapSemEspaco } = await fetchMunicipiosUF(uf);

      // Coleta nomes únicos de municípios
      const nomesUnicos = new Set(registros.map((e) => e.municipioNome!.trim()));

      let ufAtualizados = 0;
      let ufSemMatch = 0;

      for (const nome of nomesUnicos) {
        const norm   = normalizeNome(nome);
        // Tenta match exato; fallback sem espaços (resolve "Doeste" vs "D Oeste")
        const codigo = municipiosMap.get(norm) ?? mapSemEspaco.get(norm.replace(/\s/g, ''));
        if (!codigo) {
          console.warn(`  [sem match] "${nome}"`);
          ufSemMatch++;
          continue;
        }

        // Usa municipioNome + uf no where — evita IN com lista grande de IDs
        const { count } = await prisma.emendaParlamentar.updateMany({
          where: { municipioNome: nome, uf, codigoIbge: null, esfera: 'ESTADUAL' },
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
