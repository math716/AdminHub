/**
 * Sincroniza lista de senadores oficiais com a tabela Parlamentar.
 *
 * Por que existe:
 *   O Portal da Transparência não diferencia Senador vs Deputado Federal nas
 *   emendas individuais — tudo vem como "Emenda Individual - Transferências...".
 *   Por padrão, classificamos como DEPUTADO_FEDERAL no sync de emendas.
 *   Este script corrige os senadores via match de nome contra a API do Senado.
 *
 * Estratégia:
 *   - Baixa lista de parlamentares das legislaturas 55, 56 e 57 (2015–2027)
 *   - Normaliza nomes (maiúsculas, sem acento) — TANTO NomeParlamentar
 *     (nome de urna) QUANTO NomeCompletoParlamentar
 *   - Atualiza Parlamentar.cargo = 'SENADOR' pros matches
 *   - Atualiza também partido e UF quando disponível
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/sync-senadores.ts
 *
 * Idempotente — pode rodar de novo sem problema.
 * Reexecutar quando uma nova legislatura começar (a cada 4 anos).
 */

import { PrismaClient } from '@prisma/client';

const dbUrl = (() => {
  const raw = process.env.DATABASE_URL ?? '';
  return raw + (raw.includes('?') ? '&' : '?') + 'pgbouncer=true';
})();
const prisma = new PrismaClient({
  datasources: { db: { url: dbUrl } },
});

// Legislaturas a baixar (cobre emendas de 2015 a 2027).
// Cada legislatura dura 4 anos. Adicionar 58ª em 2027.
const LEGISLATURAS = [55, 56, 57];

interface SenadorOficial {
  codigo: string;
  nomeParlamentar: string;
  nomeCompleto: string;
  uf: string | null;
  // Pode ter múltiplos nomes (parlamentar + completo)
  variantes: string[];
}

// Normaliza: maiúsculo, sem acento, espaços únicos.
// Match do Portal usa o nome em maiúsculas — então a função tem que ser
// equivalente ao que o Portal envia.
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function baixarLegislatura(num: number): Promise<SenadorOficial[]> {
  const url = `https://legis.senado.leg.br/dadosabertos/senador/lista/legislatura/${num}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    console.warn(`  [aviso] legislatura ${num}: HTTP ${res.status}`);
    return [];
  }
  const data = await res.json();
  const parlamentares = data?.ListaParlamentarLegislatura?.Parlamentares?.Parlamentar ?? [];
  const lista: SenadorOficial[] = [];

  for (const p of parlamentares) {
    const ident = p?.IdentificacaoParlamentar;
    if (!ident) continue;
    const nomeParlamentar = String(ident?.NomeParlamentar ?? '').trim();
    const nomeCompleto    = String(ident?.NomeCompletoParlamentar ?? '').trim();
    if (!nomeParlamentar && !nomeCompleto) continue;

    // UF pode vir em Mandatos[0].UfParlamentar
    const mandatos = p?.Mandatos?.Mandato;
    const primeiroMandato = Array.isArray(mandatos) ? mandatos[0] : mandatos;
    const uf = primeiroMandato?.UfParlamentar ?? null;

    lista.push({
      codigo:         String(ident.CodigoParlamentar ?? ''),
      nomeParlamentar,
      nomeCompleto,
      uf,
      variantes:      [nomeParlamentar, nomeCompleto].filter(Boolean),
    });
  }
  return lista;
}

async function main() {
  console.log(`\n🏛️  Sync senadores oficiais ↔ tabela Parlamentar\n`);

  // 1) Baixa todas as legislaturas e deduplica por código
  console.log('📥 Baixando lista do Senado…');
  const porCodigo = new Map<string, SenadorOficial>();
  for (const leg of LEGISLATURAS) {
    const lista = await baixarLegislatura(leg);
    console.log(`   Legislatura ${leg}: ${lista.length} parlamentares.`);
    lista.forEach((s) => porCodigo.set(s.codigo, s));
  }
  const senadores = Array.from(porCodigo.values());
  console.log(`   ${senadores.length} senadores únicos (após dedupe).\n`);

  // 2) Constrói índice de normalize(nome) → SenadorOficial
  const indice = new Map<string, SenadorOficial>();
  senadores.forEach((s) => {
    s.variantes.forEach((nome) => {
      const norm = normalize(nome);
      if (norm) indice.set(norm, s);
    });
  });
  console.log(`📇 Índice com ${indice.size} variantes de nome.`);

  // 3) Busca todos os parlamentares no banco que NÃO são SENADOR e tenta match
  console.log('\n🔎 Buscando parlamentares no banco pra reclassificar…');
  const candidatos = await prisma.parlamentar.findMany({
    where: { NOT: { cargo: 'SENADOR' } },
    select: { id: true, nome: true, partido: true, uf: true },
  });
  console.log(`   ${candidatos.length} parlamentares no banco (não classificados como senador).`);

  let updated = 0, semMatch = 0;
  const naoCasados: string[] = [];

  for (const p of candidatos) {
    const hit = indice.get(normalize(p.nome));
    if (hit) {
      await prisma.parlamentar.update({
        where: { id: p.id },
        data: {
          cargo: 'SENADOR',
          // Preserva valores existentes; só preenche UF se estava vazio
          uf: p.uf ?? hit.uf,
        },
      });
      updated++;
    } else {
      semMatch++;
      // Não loga todos — só se quiser debug, descomentar:
      // if (semMatch <= 5) naoCasados.push(p.nome);
    }
  }

  // 4) Também marca os senadores que ainda não existem no banco como SENADOR
  //    pra quando aparecerem em sync futuro já entrarem com cargo certo.
  let criados = 0;
  for (const s of senadores) {
    const principal = s.nomeParlamentar || s.nomeCompleto;
    const existeNorm = await prisma.parlamentar.findFirst({
      where: { OR: s.variantes.map((v) => ({ nome: v })) },
      select: { id: true },
    });
    if (!existeNorm) {
      try {
        await prisma.parlamentar.upsert({
          where:  { idPortal: principal },
          create: { idPortal: principal, nome: principal, cargo: 'SENADOR', uf: s.uf },
          update: { cargo: 'SENADOR', uf: s.uf },
        });
        criados++;
      } catch {
        // ignorar conflitos
      }
    }
  }

  console.log(`\n✅ Sync concluído!`);
  console.log(`   ${updated} parlamentares reclassificados como SENADOR`);
  console.log(`   ${criados} senadores adicionados (pra próximos syncs de emendas)`);
  if (semMatch > 0) {
    console.log(`   ${semMatch} parlamentares ficaram sem match (são deputados federais ou senadores anteriores a 2015)`);
  }
}

main()
  .catch((e) => {
    console.error('\n❌ Erro:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
