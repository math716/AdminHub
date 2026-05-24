/**
 * Sincroniza lista de deputados federais oficiais com a tabela Parlamentar.
 *
 * Por que existe:
 *   O Portal da Transparência traz emendas com `nomeAutor` em CAIXA ALTA, sem
 *   CPF, sem partido e sem UF — só o nome cru. O sync-emendas cria registros
 *   de Parlamentar com cargo=DEPUTADO_FEDERAL por padrão (já que o Portal só
 *   contém emendas federais), mas SEM partido nem UF.
 *
 *   Este script roda DEPOIS do sync-emendas + sync-senadores. Ele:
 *     1. Cruza por nome com a lista oficial da Câmara dos Deputados (API
 *        dadosabertos.camara.leg.br) das legislaturas 55, 56 e 57.
 *     2. Para cada match, preenche partido e UF.
 *     3. Confirma o cargo=DEPUTADO_FEDERAL (não toca em SENADOR já marcado).
 *     4. Cria registros para deputados oficiais que ainda não existem no banco
 *        — útil pra quando aparecerem em sync futuro já entrarem com partido/UF.
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/sync-deputados-federais.ts
 *
 * Idempotente — pode rodar de novo sem problema.
 * Reexecutar quando uma nova legislatura começar (a cada 4 anos).
 */

import { PrismaClient } from '@prisma/client';

const dbUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const prisma = new PrismaClient({
  datasources: { db: { url: dbUrl } },
});

// Legislaturas a baixar (cobre emendas de 2015 a 2027).
const LEGISLATURAS = [55, 56, 57];
const CAMARA_BASE = 'https://dadosabertos.camara.leg.br/api/v2';

interface DeputadoOficial {
  id:            string;     // id na Câmara
  nome:          string;     // nome parlamentar (curto)
  nomeCivil:     string;     // nome completo
  partido:       string | null;
  uf:            string | null;
  // todas as variantes de nome usadas pra match
  variantes:     string[];
}

// Normaliza: maiúsculo, sem acento, espaços únicos.
// Mesma função usada no sync-senadores — match equivalente.
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchPage(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    console.warn(`  [aviso] ${url}: HTTP ${res.status}`);
    return null;
  }
  return res.json();
}

async function baixarDetalhes(id: string): Promise<{ nomeCivil: string } | null> {
  const data = await fetchPage(`${CAMARA_BASE}/deputados/${id}`);
  return data?.dados ? { nomeCivil: String(data.dados.nomeCivil ?? '').trim() } : null;
}

async function baixarLegislatura(num: number): Promise<DeputadoOficial[]> {
  console.log(`📥 Baixando legislatura ${num}…`);
  const lista: DeputadoOficial[] = [];
  // itens=100 reduz quantidade de páginas; pagina via campo `next` em data.links
  let url: string | null = `${CAMARA_BASE}/deputados?idLegislatura=${num}&itens=100&ordenarPor=nome`;

  while (url) {
    const data = await fetchPage(url);
    if (!data?.dados) break;

    for (const d of data.dados) {
      const nome    = String(d?.nome ?? '').trim();
      const partido = (d?.siglaPartido ?? null) || null;
      const uf      = (d?.siglaUf ?? null) || null;
      if (!nome) continue;
      lista.push({
        id:        String(d.id),
        nome,
        nomeCivil: '',  // preenchido sob demanda quando o match por `nome` falhar
        partido,
        uf,
        variantes: [nome],
      });
    }

    const next = (data?.links ?? []).find((l: any) => l?.rel === 'next');
    url = next?.href ?? null;
  }

  console.log(`   Legislatura ${num}: ${lista.length} deputados.`);
  return lista;
}

async function main() {
  console.log(`\n🏛️  Sync deputados federais oficiais ↔ tabela Parlamentar\n`);

  // 1) Baixa todas as legislaturas, deduplica por id
  const porId = new Map<string, DeputadoOficial>();
  for (const leg of LEGISLATURAS) {
    const lista = await baixarLegislatura(leg);
    lista.forEach((d) => {
      // Quando o mesmo deputado aparece em múltiplas legislaturas, mantemos
      // a entrada mais recente (legislaturas vêm em ordem crescente).
      porId.set(d.id, d);
    });
  }
  const deputados = Array.from(porId.values());
  console.log(`\n   ${deputados.length} deputados únicos (após dedupe por id).`);

  // 2) Constrói índice por nome parlamentar — match de primeira passagem
  const indice = new Map<string, DeputadoOficial>();
  deputados.forEach((d) => {
    d.variantes.forEach((nome) => {
      const norm = normalize(nome);
      if (norm) indice.set(norm, d);
    });
  });
  console.log(`📇 Índice inicial com ${indice.size} variantes.`);

  // 3) Busca todos os parlamentares NÃO senadores no banco e tenta match
  console.log('\n🔎 Buscando parlamentares no banco pra confirmar/atualizar…');
  const candidatos = await prisma.parlamentar.findMany({
    where: { NOT: { cargo: 'SENADOR' } },
    select: { id: true, nome: true, partido: true, uf: true, cargo: true },
  });
  console.log(`   ${candidatos.length} candidatos.`);

  let confirmados = 0;
  let semMatchInicial: typeof candidatos = [];

  for (const p of candidatos) {
    const hit = indice.get(normalize(p.nome));
    if (hit) {
      await prisma.parlamentar.update({
        where: { id: p.id },
        data: {
          cargo:   'DEPUTADO_FEDERAL',
          partido: p.partido ?? hit.partido,
          uf:      p.uf      ?? hit.uf,
        },
      });
      confirmados++;
    } else {
      semMatchInicial.push(p);
    }
  }
  console.log(`   ${confirmados} confirmados como DEPUTADO_FEDERAL (1ª passagem).`);

  // 4) Pra quem não casou, tenta segunda passagem usando nomeCivil (completo)
  //    — exige fetch /deputados/{id} um a um, então só puxamos quando necessário.
  if (semMatchInicial.length > 0) {
    console.log(`\n   Tentando 2ª passagem (nome civil completo) p/ ${semMatchInicial.length} restantes…`);

    // Constrói índice por nome civil sob demanda
    const civilIdx = new Map<string, DeputadoOficial>();
    for (const d of deputados) {
      const det = await baixarDetalhes(d.id);
      if (det?.nomeCivil) {
        d.nomeCivil = det.nomeCivil;
        d.variantes.push(det.nomeCivil);
        civilIdx.set(normalize(det.nomeCivil), d);
      }
      // ritmo respeitável pra API (não tem rate limit publicado, mas seja gentil)
      await new Promise((r) => setTimeout(r, 50));
    }

    let confirmados2 = 0;
    for (const p of semMatchInicial) {
      const hit = civilIdx.get(normalize(p.nome));
      if (hit) {
        await prisma.parlamentar.update({
          where: { id: p.id },
          data: {
            cargo:   'DEPUTADO_FEDERAL',
            partido: p.partido ?? hit.partido,
            uf:      p.uf      ?? hit.uf,
          },
        });
        confirmados2++;
      }
    }
    console.log(`   ${confirmados2} confirmados via nome civil (2ª passagem).`);
    confirmados += confirmados2;
    semMatchInicial = semMatchInicial.filter((p) => !civilIdx.has(normalize(p.nome)));
  }

  // 5) Pré-cria deputados oficiais que ainda não existem no banco — assim
  //    quando aparecerem em sync futuro de emendas, já vêm com partido/UF.
  let criados = 0;
  for (const d of deputados) {
    const existente = await prisma.parlamentar.findFirst({
      where: { OR: d.variantes.map((v) => ({ nome: v })) },
      select: { id: true },
    });
    if (!existente) {
      try {
        await prisma.parlamentar.upsert({
          where:  { idPortal: d.nome },
          create: {
            idPortal: d.nome,
            nome:     d.nome,
            cargo:    'DEPUTADO_FEDERAL',
            partido:  d.partido,
            uf:       d.uf,
          },
          update: {
            cargo:   'DEPUTADO_FEDERAL',
            partido: d.partido,
            uf:      d.uf,
          },
        });
        criados++;
      } catch {
        // ignora conflitos
      }
    }
  }

  console.log(`\n✅ Sync concluído!`);
  console.log(`   ${confirmados} parlamentares confirmados como DEPUTADO_FEDERAL`);
  console.log(`   ${criados} deputados pré-criados (p/ próximos syncs de emendas)`);
  if (semMatchInicial.length > 0) {
    console.log(`   ${semMatchInicial.length} parlamentares sem match — provavelmente`);
    console.log(`   nomes muito diferentes do oficial ou autoridades anteriores a 2015.`);
    console.log(`   Eles continuam como DEPUTADO_FEDERAL (default), só sem partido/UF.`);
  }
}

main()
  .catch((e) => {
    console.error('\n❌ Erro:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
