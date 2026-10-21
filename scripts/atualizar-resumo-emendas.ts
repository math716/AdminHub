/**
 * Calcula e guarda o resumo pronto da tela de Emendas (tabela emendas_resumos).
 *
 * Roda no fim de cada importação de emendas. A conta é a mesma da tela
 * (lib/emendas/resumo-emendas.ts); a tela lê o resultado pronto e só calcula
 * na hora se o banco tiver mudado depois desta conta.
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/atualizar-resumo-emendas.ts [--anos 2021,2022] [--conferir]
 *
 *   --anos      anos a calcular (padrão: 2021 até o ano atual — os da tela)
 *   --conferir  NÃO grava: compara cada resumo guardado com a conta feita
 *               agora, estado por estado, ano por ano, em cada filtro. Sai com
 *               erro se algum número não bater.
 *   --forcar    recalcula mesmo que nada tenha mudado desde a última conta.
 *   --refazer-municipios  refaz o valor por município de todas as emendas
 *               federais dos anos (quando a regra da soma muda) e recalcula
 *               o resumo em seguida (implica --forcar).
 *
 * Sem mudança no banco desde a última conta (mesma última alteração de
 * emendas e de parlamentares, mesma quantidade de emendas), não recalcula:
 * são centenas de somas pesadas que dariam o mesmo resultado.
 */

import { Prisma, PrismaClient } from '@prisma/client';
import {
  ESFERAS, SQL_CRIAR_RESUMO, VERSAO_CONTA, calcularResumoUf, calcularTotaisBrasil, chaveResumoBrasil, chaveResumoUf,
  impressaoDoBanco, lerResumoPronto,
} from '../lib/emendas/resumo-emendas';
import { garantirEmendasMunicipios, refazerEmendasMunicipios } from '../lib/emendas/emendas-municipios';

const raw = process.env.DATABASE_URL ?? '';
// pool_timeout alto: cada recorte dispara 5 consultas, 3 recortes por vez,
// em 4 conexões. Desde que o valor por município passou a somar os
// documentos (consulta mais pesada nos estados grandes), esperar a vez por
// mais de 10 s (o padrão) virou rotina — e o padrão derrubava o script
// inteiro (P2024). Esperar a conexão é o certo: são as mesmas 4 conexões.
const db = new PrismaClient({
  datasources: { db: { url: `${raw}${raw.includes('?') ? '&' : '?'}pgbouncer=true&connection_limit=4&pool_timeout=300` } },
});

/** Uma conta que falhou por conexão (banco ocupado) tenta de novo, até 3 vezes. */
async function comNovaTentativa<T>(fn: () => Promise<T>): Promise<T> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await fn();
    } catch (e: any) {
      const deConexao = ['P2024', 'P1001', 'P1017'].includes(e?.code) || /connection|timed out/i.test(e?.message ?? '');
      if (!deConexao || tentativa >= 3) throw e;
      console.warn(`
   banco ocupado (${e?.code ?? 'conexão'}) — nova tentativa em ${30 * tentativa} s`);
      await new Promise((r) => setTimeout(r, 30_000 * tentativa));
    }
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const anoAtual = new Date().getFullYear();
const ANOS = (arg('anos')
  ?? Array.from({ length: anoAtual - 2021 + 1 }, (_, i) => 2021 + i).join(','))
  .split(',').map((a) => parseInt(a.trim(), 10)).filter((a) => a > 2000);
const CONFERIR = process.argv.includes('--conferir');
const REFAZER_MUNICIPIOS = process.argv.includes('--refazer-municipios');
// A soma por município não muda a "impressão" do banco (ela olha emendas e
// documentos): refeita a soma, o resumo precisa ser recalculado à força.
const FORCAR = process.argv.includes('--forcar') || REFAZER_MUNICIPIOS;
const SIMULTANEOS = 3;

interface Tarefa { chave: string; qtd: number; calcular: () => Promise<unknown> }

/** Recortes que a tela pode pedir: cada estado com emendas no ano × filtro, e o Brasil do ano. */
async function montarTarefas(): Promise<Tarefa[]> {
  const grupos = await db.$queryRawUnsafe<{ uf: string; ano: number; n: number }[]>(`
    SELECT uf, ano, count(*)::int AS n FROM emendas_parlamentares
    WHERE uf IS NOT NULL AND ano = ANY($1::int[])
    GROUP BY uf, ano ORDER BY ano, uf`, ANOS);

  const tarefas: Tarefa[] = [];
  const porAno = new Map<number, number>();
  for (const g of grupos) {
    porAno.set(g.ano, (porAno.get(g.ano) ?? 0) + g.n);
    for (const esfera of ESFERAS) {
      tarefas.push({
        chave: chaveResumoUf(g.uf, g.ano, esfera),
        qtd: g.n,
        calcular: () => calcularResumoUf(db, g.uf, g.ano, esfera),
      });
    }
  }
  for (const [ano, n] of porAno) {
    tarefas.push({ chave: chaveResumoBrasil(ano), qtd: n, calcular: () => calcularTotaisBrasil(db, ano) });
  }
  return tarefas;
}

async function emParalelo<T>(itens: T[], fn: (item: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: SIMULTANEOS }, async () => {
    while (i < itens.length) await fn(itens[i++]);
  }));
}

// Números em centavos e listas em ordem fixa: empate no total pode trocar a
// ordem entre duas contas, sem ser diferença de verdade.
function normalizar(v: unknown): unknown {
  if (typeof v === 'number') return Math.round(v * 100);
  if (Array.isArray(v)) return v.map(normalizar).map((x) => JSON.stringify(x)).sort();
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, normalizar((v as any)[k])]));
  }
  return v;
}

async function atualizar() {
  for (const sql of SQL_CRIAR_RESUMO) await db.$executeRawUnsafe(sql);

  // Valor por município pronto (emendas_municipios): a importação preenche;
  // aqui só a primeira vez de um ano, ou um ano que ficou pela metade.
  if (REFAZER_MUNICIPIOS) await refazerEmendasMunicipios(db, ANOS);
  else await garantirEmendasMunicipios(db, ANOS);

  const inicio = new Date();
  // Impressão ANTES da conta: se o banco mudar no meio, o resumo já nasce
  // velho e a tela calcula na hora — nunca o contrário.
  const impressao = await impressaoDoBanco(db);

  if (!FORCAR) {
    const [guardado] = await db.$queryRawUnsafe<{ n: number; n_versao: number; ve_min: Date | null; ve_max: Date | null; vp_min: Date | null; vp_max: Date | null; qtd: number | null }[]>(`
      SELECT count(*)::int AS n,
             count(*) FILTER (WHERE (dados->>'versaoConta')::int = ${VERSAO_CONTA})::int AS n_versao,
             min("versaoEmendas") AS ve_min, max("versaoEmendas") AS ve_max,
             min("versaoParlamentares") AS vp_min, max("versaoParlamentares") AS vp_max,
             sum("qtdEmendas") FILTER (WHERE chave LIKE 'brasil:%')::int AS qtd
      FROM emendas_resumos
      WHERE split_part(chave, ':', CASE WHEN chave LIKE 'brasil:%' THEN 2 ELSE 3 END)::int = ANY($1::int[])`, ANOS);
    const [agora] = await db.$queryRawUnsafe<{ n: number }[]>(`
      SELECT count(*)::int AS n FROM emendas_parlamentares WHERE uf IS NOT NULL AND ano = ANY($1::int[])`, ANOS);
    const igual = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);
    const nadaMudou = (guardado?.n ?? 0) > 0
      && guardado.n_versao === guardado.n
      && igual(guardado.ve_min, impressao.versaoEmendas) && igual(guardado.ve_max, impressao.versaoEmendas)
      && igual(guardado.vp_min, impressao.versaoParlamentares) && igual(guardado.vp_max, impressao.versaoParlamentares)
      && (guardado.qtd ?? -1) === agora.n;
    if (nadaMudou) {
      console.log(`
Resumo de Emendas — anos ${ANOS.join(', ')}: nada mudou desde a última conta (${guardado.n} recortes). Nada a recalcular.`);
      return;
    }
  }

  const tarefas = await montarTarefas();
  console.log(`\nResumo de Emendas — anos ${ANOS.join(', ')}: ${tarefas.length} recortes\n`);

  // Um recorte que falha não derruba os outros: antes, um único estado
  // demorado parava o script inteiro e nenhum resumo era guardado. O que
  // falhar fica listado no fim (e a tela faz a conta na hora para ele).
  let feitos = 0;
  const falharam: string[] = [];
  await emParalelo(tarefas, async (t) => {
    try {
      const dados = (await comNovaTentativa(t.calcular)) as Prisma.InputJsonValue;
      const valores = { dados, qtdEmendas: t.qtd, ...impressao, calculadoEm: new Date() };
      await db.emendaResumo.upsert({ where: { chave: t.chave }, create: { chave: t.chave, ...valores }, update: valores });
    } catch (e: any) {
      const motivo = String(e?.message ?? e).split('\n').filter(Boolean).pop()?.slice(0, 120);
      falharam.push(`${t.chave} (${e?.code ?? ''} ${motivo})`);
    }
    if (++feitos % 50 === 0) process.stdout.write(`\r   ${feitos}/${tarefas.length} recortes...`);
  });
  if (falharam.length > 0) {
    console.log(`\n   ${falharam.length} recorte(s) não calculado(s) — a tela faz a conta na hora para eles:`);
    for (const f of falharam.slice(0, 30)) console.log(`     - ${f}`);
    process.exitCode = 1;
  }

  // Recortes desses anos que não existem mais (ex.: estado sem emendas). Só
  // com todos calculados: o que falhou agora ainda tem o resumo anterior.
  const apagados = falharam.length > 0 ? 0 : await db.$executeRawUnsafe(`
    DELETE FROM emendas_resumos
    WHERE "calculadoEm" < $1
      AND split_part(chave, ':', CASE WHEN chave LIKE 'brasil:%' THEN 2 ELSE 3 END)::int = ANY($2::int[])`,
    inicio, ANOS);

  const depois = await impressaoDoBanco(db);
  const mudou = depois.versaoEmendas?.getTime() !== impressao.versaoEmendas?.getTime()
    || depois.versaoParlamentares?.getTime() !== impressao.versaoParlamentares?.getTime();

  console.log(`\r   ${feitos} recortes guardados; ${apagados} antigos removidos.        `);
  if (mudou) {
    console.log('   AVISO: o banco mudou durante a conta — a tela vai calcular na hora até a próxima atualização.');
  }
}

async function conferir() {
  const tarefas = await montarTarefas();
  console.log(`\nConferência do resumo de Emendas — anos ${ANOS.join(', ')}: ${tarefas.length} recortes (nada é gravado)\n`);

  let iguais = 0, ausentesOuVelhos = 0;
  const diferentes: string[] = [];
  await emParalelo(tarefas, async (t) => {
    const pronto = await lerResumoPronto<unknown>(db, t.chave, t.qtd);
    if (!pronto) { ausentesOuVelhos++; return; }
    const agora = await t.calcular();
    const a = normalizar(pronto), b = normalizar(JSON.parse(JSON.stringify(agora)));
    if (JSON.stringify(a) === JSON.stringify(b)) { iguais++; return; }
    const campos = Object.keys(b as object).filter(
      (k) => JSON.stringify((a as any)[k]) !== JSON.stringify((b as any)[k]),
    );
    diferentes.push(`${t.chave} (${campos.join(', ')})`);
  });

  console.log(`   Iguais, centavo por centavo:            ${iguais}`);
  console.log(`   Diferentes:                             ${diferentes.length}`);
  console.log(`   Sem resumo, ou banco mudou desde a conta: ${ausentesOuVelhos} (a tela calcula na hora)`);
  for (const d of diferentes.slice(0, 20)) console.log(`     - ${d}`);
  if (diferentes.length) process.exitCode = 1;
}

(CONFERIR ? conferir() : atualizar())
  .catch((e) => { console.error('\nErro:', e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
