/**
 * Atualiza os totais das emendas FEDERAIS com os valores oficiais do Portal
 * da Transparência (/api-de-dados/emendas).
 *
 * Por que existe:
 *   O import do CSV (scripts/import-portal-csv.mts) grava empenhado e pago da
 *   emenda só quando ela aparece pela primeira vez, com os valores da PRIMEIRA
 *   linha do arquivo — e nunca mais atualiza. Medição de 16/10/2026: as
 *   emendas de 2025 somavam R$ 2,4 bi empenhados no banco contra ~R$ 48 bi
 *   reais. A API devolve o total consolidado de cada emenda.
 *
 * O que grava (só em emendas que já existem no banco):
 *   valorEmpenhado = empenhado oficial
 *   valorPago      = pago no ano + restos a pagar pagos (tudo o que já foi pago;
 *                    decisão do usuário em 16/10/2026)
 *   valorRestoPago = a parte paga como restos a pagar (informativo)
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/atualizar-totais-emendas-federais.ts \
 *     --anos 2025,2026 [--dry-run] [--por-minuto 80]
 *
 * --dry-run: consulta tudo e mostra o antes e depois por ano, sem gravar.
 * Se alguma página do Portal falhar, o ano inteiro é pulado (nada gravado),
 * para nunca gravar um ano pela metade.
 */

import { PrismaClient } from '@prisma/client';
import { portalFetch } from '../lib/emendas/portal-fetcher';

const raw = process.env.DATABASE_URL ?? '';
const prisma = new PrismaClient({
  datasources: { db: { url: `${raw}${raw.includes('?') ? '&' : '?'}pgbouncer=true&connection_limit=2` } },
});

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const ANOS = (arg('anos') ?? String(new Date().getFullYear()))
  .split(',').map((a) => parseInt(a.trim(), 10)).filter((a) => a > 2000);
const DRY = process.argv.includes('--dry-run');

const POR_PAGINA = 15;   // fixo no Portal
// Limite oficial da chave: 90 consultas/min das 6h às 24h (300/min de madrugada).
// Acima disso o Portal bloqueia com 403 por alguns minutos.
const POR_MINUTO = parseInt(arg('por-minuto') ?? '80', 10);
const INTERVALO_MS = Math.ceil(60_000 / POR_MINUTO);

interface EmendaPortal {
  codigoEmenda: string;
  valorEmpenhado: string;
  valorPago: string;
  valorRestoPago: string;
}

const valorBR = (v: string | undefined) => {
  const n = Number(String(v ?? '0').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const mi = (v: number) => `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
let ultimaConsulta = 0;

async function paginaComRetentativa(ano: number, pagina: number): Promise<EmendaPortal[]> {
  for (let t = 1; ; t++) {
    const falta = ultimaConsulta + INTERVALO_MS - Date.now();
    if (falta > 0) await esperar(falta);
    ultimaConsulta = Date.now();
    try {
      return await portalFetch<EmendaPortal[]>('/api-de-dados/emendas', { ano, pagina });
    } catch (e: any) {
      if (t >= 5) throw e;
      // 403/429 = bloqueio por excesso de consultas: espera passar.
      const bloqueio = /HTTP 403|rate limit/i.test(String(e?.message));
      const ms = bloqueio ? 60_000 * t : 5_000 * t;
      process.stdout.write(`\n   ${ano} página ${pagina}: ${bloqueio ? 'Portal pediu pausa' : 'falha'}, nova tentativa em ${ms / 1000}s\n`);
      await esperar(ms);
    }
  }
}

/** Todas as emendas do ano no Portal. Lança erro se alguma página falhar. */
async function emendasDoPortal(ano: number): Promise<Map<string, EmendaPortal>> {
  const porCodigo = new Map<string, EmendaPortal>();
  for (let pagina = 1; ; pagina++) {
    const p = await paginaComRetentativa(ano, pagina);
    for (const e of p) porCodigo.set(String(e.codigoEmenda), e);
    if (pagina % 50 === 0) process.stdout.write(`\r   ${ano}: ${porCodigo.size} emendas lidas do Portal...`);
    if (p.length < POR_PAGINA) break;
  }
  process.stdout.write(`\r   ${ano}: ${porCodigo.size} emendas lidas do Portal.        \n`);
  return porCodigo;
}

async function gravar(linhas: { id: string; emp: number; pago: number; resto: number }[]) {
  for (let i = 0; i < linhas.length; i += 500) {
    const lote = linhas.slice(i, i + 500);
    const params: string[] = [];
    const valores = lote.map((l) => {
      params.push(l.id, String(l.emp), String(l.pago), String(l.resto));
      const n = params.length;
      return `($${n - 3}::text, $${n - 2}::text::double precision, $${n - 1}::text::double precision, $${n}::text::double precision)`;
    });
    await prisma.$executeRawUnsafe(`
      UPDATE emendas_parlamentares e SET
        "valorEmpenhado" = v.emp, "valorPago" = v.pago, "valorRestoPago" = v.resto, "updatedAt" = NOW()
      FROM (VALUES ${valores.join(', ')}) AS v(id, emp, pago, resto)
      WHERE e.id = v.id`, ...params);
  }
}

async function main() {
  console.log(`\nTotais oficiais das emendas federais — anos ${ANOS.join(', ')}${DRY ? ' (SEM GRAVAR)' : ''}\n`);
  const resumo: Record<string, string | number>[] = [];
  let falhou = false;

  for (const ano of ANOS) {
    let portal: Map<string, EmendaPortal>;
    try {
      portal = await emendasDoPortal(ano);
    } catch (e: any) {
      console.error(`\n   ERRO: Portal falhou em ${ano} — ano pulado, nada gravado. ${e?.message ?? e}`);
      falhou = true;
      continue;
    }

    const banco = await prisma.emendaParlamentar.findMany({
      where: { esfera: 'FEDERAL', ano },
      select: { id: true, idPortal: true, valorEmpenhado: true, valorPago: true, valorRestoPago: true },
    });

    let empAntes = 0, pagoAntes = 0, empDepois = 0, pagoDepois = 0, casadas = 0;
    const mudar: { id: string; emp: number; pago: number; resto: number }[] = [];
    const vistos = new Set<string>();
    for (const e of banco) {
      empAntes += e.valorEmpenhado;
      pagoAntes += e.valorPago;
      const of = e.idPortal ? portal.get(e.idPortal) : undefined;
      if (!of) { empDepois += e.valorEmpenhado; pagoDepois += e.valorPago; continue; }
      casadas++;
      vistos.add(e.idPortal!);
      const emp = valorBR(of.valorEmpenhado);
      const resto = valorBR(of.valorRestoPago);
      const pago = valorBR(of.valorPago) + resto;
      empDepois += emp;
      pagoDepois += pago;
      if (Math.abs(emp - e.valorEmpenhado) > 0.005 || Math.abs(pago - e.valorPago) > 0.005
          || Math.abs(resto - e.valorRestoPago) > 0.005) {
        mudar.push({ id: e.id, emp, pago, resto });
      }
    }
    const soNoPortal = [...portal.keys()].filter((c) => !vistos.has(c));
    const empSoNoPortal = soNoPortal.reduce((s, c) => s + valorBR(portal.get(c)!.valorEmpenhado), 0);

    if (!DRY && mudar.length) await gravar(mudar);

    resumo.push({
      ano,
      'emendas no banco': banco.length,
      'achadas no Portal': casadas,
      'a corrigir': mudar.length,
      'empenhado antes': mi(empAntes),
      'empenhado depois': mi(empDepois),
      'pago antes': mi(pagoAntes),
      'pago depois': mi(pagoDepois),
      'só no Portal (não importadas)': `${soNoPortal.length} (${mi(empSoNoPortal)})`,
    });
  }

  console.log('');
  console.table(resumo);
  console.log(DRY ? '\nNada foi gravado (--dry-run).' : '\nTotais gravados.');
  if (falhou) process.exitCode = 1;
}

main()
  .catch((e) => { console.error('\nErro fatal:', e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
