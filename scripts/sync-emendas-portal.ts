/**
 * Sincroniza emendas parlamentares do Portal da Transparência pro banco.
 *
 * Por que existe:
 *   A API do Portal não tem filtro por UF ou município. Pra ter dados
 *   completos no dashboard /dashboard/emendas, baixamos tudo do Brasil pro
 *   banco. Os endpoints leem do banco — instantâneo, completo e sem rate limit.
 *
 * Estratégia:
 *   - Sequencial (1 página por vez) com pause de ~700ms entre páginas pra
 *     respeitar rate limit do Portal (~90 req/min na chave free).
 *   - Upsert por idPortal — idempotente, pode reexecutar sem duplicar.
 *   - Cria Parlamentar (cache) automaticamente quando encontra autor novo.
 *   - Resolve código IBGE 7 dígitos via match de nome (lib/portal-transparencia).
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/sync-emendas-portal.ts \
 *     --ano 2024 \
 *     [--from-pagina 1] [--max-paginas 5000] [--delay-ms 700]
 *
 * Tempo estimado: ~30-60 minutos por ano completo (Brasil tem ~30k-50k
 * emendas/ano). Roda em background — pode deixar o terminal aberto.
 */

import { PrismaClient } from '@prisma/client';
import {
  parseLocalidadeGasto,
  classificarArea,
  type EmendaArea,
  type ParlamentarCargo,
} from '../lib/portal-transparencia';

// Força DIRECT_URL (Session Pooler) — Transaction Pooler dá erro de prepared statement
const dbUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const prisma = new PrismaClient({
  datasources: { db: { url: dbUrl } },
});

const PORTAL_BASE = 'https://api.portaldatransparencia.gov.br';
const API_KEY = process.env.PORTAL_TRANSPARENCIA_API_KEY;

if (!API_KEY) {
  console.error('❌ PORTAL_TRANSPARENCIA_API_KEY não definida no .env');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────
// CLI args
// ─────────────────────────────────────────────────────────────────────────
function arg(name: string, def?: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return def;
}

const ANO         = parseInt(arg('ano', String(new Date().getFullYear() - 1))!, 10);
const FROM_PAGE   = parseInt(arg('from-pagina', '1')!, 10);
const MAX_PAGES   = parseInt(arg('max-paginas', '5000')!, 10);
const DELAY_MS    = parseInt(arg('delay-ms', '700')!, 10);

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Parser de valor BR — alinhado com lib/portal-transparencia.ts.
// Trata "415.000,00" (1) e "415.000" (sem vírgula, 2) como o mesmo número 415000.
// Versão anterior interpretava o ponto como decimal quando não havia vírgula,
// causando subestimação de valores inteiros (ex.: empenhado vinha 415 em vez
// de 415000 e gerava % de pagamento absurdo no dashboard).
function parseValorBR(v: any): number {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return 0;
  const cleaned = v.replace(/[^\d,.\-]/g, '');
  if (!cleaned) return 0;
  // Sempre tratamos o ponto como separador de milhar; a vírgula é o decimal.
  const norm = cleaned.replace(/\./g, '').replace(',', '.');
  const n = Number(norm);
  return Number.isFinite(n) ? n : 0;
}

// Cargo inferido de (autorNome, tipoEmenda) — preenche Parlamentar.cargo na
// criação inicial. Portal da Transparência só traz emendas federais; o
// "autor" pode ser uma PESSOA (deputado federal/senador) ou uma ENTIDADE
// COLETIVA (bancada, comissão, relator). A detecção da entidade coletiva é
// feita pelo NOME do autor, que é o sinal mais confiável.
//
// Pessoas: ficam como DEPUTADO_FEDERAL por padrão. O sync-senadores.ts roda
// depois e reclassifica os senadores via match de nome contra a API do Senado.
function inferCargo(autorNome: string, tipoEmenda: string): ParlamentarCargo {
  const nome = (autorNome ?? '').toUpperCase();
  const tipo = (tipoEmenda ?? '').toUpperCase();

  // 1) Entidade coletiva detectada pelo nome do autor (sinal forte)
  if (nome.includes('BANCADA')) return 'BANCADA';
  if (nome.includes('COMISSAO') || nome.includes('COMISSÃO')) return 'COMISSAO';
  // "RELATOR" / "RELATOR GERAL" — startsWith pra não pegar nome de pessoa
  if (/^RELATOR(\s|$)/.test(nome)) return 'RELATOR';

  // 2) Fallback pelo tipo de emenda quando o nome não dá pista
  if (tipo.includes('BANCADA')) return 'BANCADA';
  if (tipo.includes('COMISSAO') || tipo.includes('COMISSÃO')) return 'COMISSAO';
  if (tipo.includes('RELATOR')) return 'RELATOR';
  if (tipo.includes('SENADOR')) return 'SENADOR';

  return 'DEPUTADO_FEDERAL';
}

function normalizeNome(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────
// Lista de municípios IBGE — pra resolver código 7 dígitos
// ─────────────────────────────────────────────────────────────────────────
const UF_CODES: Record<string, number> = {
  AC: 12, AL: 27, AP: 16, AM: 13, BA: 29, CE: 23, DF: 53, ES: 32, GO: 52, MA: 21,
  MT: 51, MS: 50, MG: 31, PA: 15, PB: 25, PR: 41, PE: 26, PI: 22, RJ: 33, RN: 24,
  RS: 43, RO: 11, RR: 14, SC: 42, SP: 35, SE: 28, TO: 17,
};

const ibgePorUfNome = new Map<string, string>(); // "UF|NOMENORM" → codigoIbge7

async function carregarMunicipiosIBGE() {
  console.log('🌎 Carregando municípios IBGE…');
  for (const [uf, code] of Object.entries(UF_CODES)) {
    const res = await fetch(
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${code}/municipios`,
    );
    if (!res.ok) continue;
    const data: any[] = await res.json();
    data.forEach((m) => {
      ibgePorUfNome.set(`${uf}|${normalizeNome(m.nome)}`, String(m.id));
    });
  }
  console.log(`   ${ibgePorUfNome.size} municípios carregados.`);
}

function resolverCodigoIbge(uf: string | null, municipio: string | null): string | null {
  if (!uf || !municipio) return null;
  return ibgePorUfNome.get(`${uf}|${normalizeNome(municipio)}`) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────
// Cache de Parlamentar por nome — pra evitar SELECT a cada emenda
// ─────────────────────────────────────────────────────────────────────────
const parlamentarIdPorNome = new Map<string, string>();

async function obterOuCriarParlamentar(nome: string, tipo: string, uf: string | null): Promise<string> {
  const cached = parlamentarIdPorNome.get(nome);
  if (cached) return cached;

  const cargo = inferCargo(nome, tipo);
  // idPortal usado como chave única (Portal não dá CPF)
  const rec = await prisma.parlamentar.upsert({
    where:  { idPortal: nome },
    create: { idPortal: nome, nome, cargo, uf },
    update: {},
  });
  parlamentarIdPorNome.set(nome, rec.id);
  return rec.id;
}

// ─────────────────────────────────────────────────────────────────────────
// Fetch do Portal — sequencial com retry
// ─────────────────────────────────────────────────────────────────────────
async function fetchPortal(pagina: number): Promise<any[]> {
  const url = new URL(`${PORTAL_BASE}/api-de-dados/emendas`);
  url.searchParams.set('ano', String(ANO));
  url.searchParams.set('pagina', String(pagina));

  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      const res = await fetch(url.toString(), {
        headers: { 'chave-api-dados': API_KEY!, accept: 'application/json' },
      });
      if (res.status === 429) {
        // rate limit — espera mais
        await sleep(5000);
        continue;
      }
      if (!res.ok) {
        console.warn(`   [aviso] página ${pagina}: HTTP ${res.status}`);
        return [];
      }
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e: any) {
      console.warn(`   [aviso] página ${pagina} tentativa ${tentativa + 1}: ${e.message}`);
      await sleep(2000);
    }
  }
  return [];
}

// ─────────────────────────────────────────────────────────────────────────
// Mapear linha do Portal → record do banco
// ─────────────────────────────────────────────────────────────────────────
interface EmendaDB {
  idPortal: string;
  ano: number;
  numero: string | null;
  tipo: string | null;
  funcao: string | null;
  area: EmendaArea;
  objeto: string | null;
  valorEmpenhado: number;
  valorPago: number;
  valorRestoPago: number;
  uf: string | null;
  codigoIbge: string | null;
  municipioNome: string | null;
  autorNome: string;
  autorCargo: ParlamentarCargo;
}

function mapRow(row: any): EmendaDB | null {
  const idPortal = String(row?.codigoEmenda ?? '').trim();
  if (!idPortal) return null;

  const loc = parseLocalidadeGasto(row?.localidadeDoGasto);
  const codigoIbge = resolverCodigoIbge(loc.uf, loc.municipio);
  const funcaoNome = row?.funcao ?? null;

  return {
    idPortal,
    ano:            Number(row?.ano ?? ANO),
    numero:         row?.numeroEmenda ?? null,
    tipo:           row?.tipoEmenda ?? null,
    funcao:         funcaoNome,
    area:           classificarArea(null, funcaoNome),
    objeto:         row?.localidadeDoGasto ?? null,
    valorEmpenhado: parseValorBR(row?.valorEmpenhado),
    valorPago:      parseValorBR(row?.valorPago),
    valorRestoPago: parseValorBR(row?.valorRestoPago),
    uf:             loc.uf,
    codigoIbge,
    municipioNome:  loc.municipio,
    autorNome:      (row?.nomeAutor ?? row?.autor ?? '—').toString().trim(),
    autorCargo:     inferCargo(
                      (row?.nomeAutor ?? row?.autor ?? '').toString(),
                      row?.tipoEmenda ?? '',
                    ),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔄 Sync emendas Portal → banco — ano=${ANO}, páginas ${FROM_PAGE}..${MAX_PAGES}, delay=${DELAY_MS}ms\n`);
  const inicio = Date.now();

  await carregarMunicipiosIBGE();

  let pagina = FROM_PAGE;
  let totalInseridas = 0;
  let totalLidas = 0;
  let comMunicipio = 0;

  while (pagina <= MAX_PAGES) {
    const rows = await fetchPortal(pagina);

    if (rows.length === 0) {
      console.log(`\n   página ${pagina} vazia — fim dos dados.`);
      break;
    }

    // Processa todas as linhas da página
    for (const row of rows) {
      const e = mapRow(row);
      if (!e) continue;
      totalLidas++;
      if (e.codigoIbge) comMunicipio++;

      try {
        const parlamentarId = await obterOuCriarParlamentar(e.autorNome, e.tipo ?? '', e.uf);
        await prisma.emendaParlamentar.upsert({
          where: { idPortal: e.idPortal },
          create: {
            idPortal:       e.idPortal,
            ano:            e.ano,
            numero:         e.numero,
            tipo:           e.tipo,
            funcao:         e.funcao,
            area:           e.area,
            objeto:         e.objeto,
            valorEmpenhado: e.valorEmpenhado,
            valorPago:      e.valorPago,
            valorRestoPago: e.valorRestoPago,
            uf:             e.uf,
            codigoIbge:     e.codigoIbge,
            municipioNome:  e.municipioNome,
            parlamentarId,
          },
          update: {
            ano:            e.ano,
            numero:         e.numero,
            tipo:           e.tipo,
            funcao:         e.funcao,
            area:           e.area,
            objeto:         e.objeto,
            valorEmpenhado: e.valorEmpenhado,
            valorPago:      e.valorPago,
            valorRestoPago: e.valorRestoPago,
            uf:             e.uf,
            codigoIbge:     e.codigoIbge,
            municipioNome:  e.municipioNome,
            parlamentarId,
          },
        });
        totalInseridas++;
      } catch (err: any) {
        console.warn(`   [erro upsert ${e.idPortal}]: ${err.message}`);
      }
    }

    const elapsedMin = ((Date.now() - inicio) / 60_000).toFixed(1);
    process.stdout.write(
      `\r   página ${pagina} | ${totalInseridas} gravadas | ${comMunicipio} c/ município | ${elapsedMin}min decorridos     `,
    );

    pagina++;
    // Pause antes da próxima página pra respeitar rate limit
    if (rows.length >= 15) await sleep(DELAY_MS);
  }

  const totalMin = ((Date.now() - inicio) / 60_000).toFixed(1);
  console.log(`\n\n✅ Sync concluído!`);
  console.log(`   ${totalInseridas} emendas gravadas (${totalLidas} lidas)`);
  console.log(`   ${comMunicipio} com município identificado`);
  console.log(`   ${parlamentarIdPorNome.size} parlamentares no cache`);
  console.log(`   ${totalMin}min de execução`);
}

main()
  .catch((e) => {
    console.error('\n❌ Erro:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
