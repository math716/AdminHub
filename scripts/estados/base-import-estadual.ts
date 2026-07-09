/**
 * Módulo base compartilhado por todos os scripts de importação estadual.
 * Cada estado implementa a interface EstadoImporter com suas próprias regras
 * de download e mapeamento de campos.
 */
import { PrismaClient } from '@prisma/client';
import type { EmendaArea, ParlamentarCargo } from '@prisma/client';
import { classificarArea } from '../../lib/portal-transparencia';

/** Busca todos os municípios de uma UF na API do IBGE.
 *  Retorna dois mapas: exato (normalizado) e fallback sem espaços
 *  (resolve nomes como "Doeste" vs "D Oeste" vindos de planilhas). */
export async function fetchMunicipiosIBGE(uf: string): Promise<Map<string, string>> {
  const map        = new Map<string, string>(); // normalizado → código
  const mapNoSpace = new Map<string, string>(); // sem espaços  → código
  try {
    const res = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`);
    if (!res.ok) { console.warn(`[ibge] HTTP ${res.status} ao buscar municípios de ${uf}`); return map; }
    const data = await res.json() as Array<{ id: number; nome: string }>;
    for (const m of data) {
      const norm = normalizeNome(m.nome);
      const id   = String(m.id);
      map.set(norm, id);
      mapNoSpace.set(norm.replace(/\s/g, ''), id);
    }
    // Mescla fallback no mesmo Map com chaves sem espaço (prefixadas para não colidir)
    for (const [k, v] of mapNoSpace) if (!map.has(k)) map.set(k, v);
    console.log(`[ibge] ${map.size} municípios carregados para ${uf}`);
  } catch (e: any) {
    console.warn(`[ibge] Erro ao buscar municípios de ${uf}:`, e.message);
  }
  return map;
}

// Transaction Pooler — padrão para todos os scripts de importação
export function buildPrismaUrl(): string {
  const raw = process.env.DATABASE_URL ?? '';
  const sep = raw.includes('?') ? '&' : '?';
  return `${raw}${sep}pgbouncer=true&connection_limit=50&pool_timeout=60`;
}

export function buildPrisma(): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: buildPrismaUrl() } } });
}

const isConnError = (e: any) =>
  typeof e?.message === 'string' && (
    e.message.includes('Server has closed the connection') ||
    e.message.includes('Connection pool timeout') ||
    e.message.includes("Can't reach database server") ||
    e.message.includes('ECONNRESET') ||
    e.message.includes('ETIMEDOUT')
  );

export async function withRetry<T>(
  fn: (prisma: PrismaClient) => Promise<T>,
  getPrisma: () => PrismaClient,
  setPrisma: (p: PrismaClient) => void,
  retries = 4,
): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn(getPrisma());
    } catch (e: any) {
      if (isConnError(e) && attempt < retries - 1) {
        const waitMs = 3000 * (attempt + 1);
        process.stdout.write(`\n   [reconexão #${attempt + 1}] aguardando ${waitMs / 1000}s...\n`);
        await new Promise((r) => setTimeout(r, waitMs));
        await getPrisma().$disconnect().catch(() => {});
        setPrisma(new PrismaClient({ datasources: { db: { url: buildPrismaUrl() } } }));
        continue;
      }
      throw e;
    }
  }
  throw new Error('unreachable');
}

// ─────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────

export interface EmendaEstadualRow {
  /** ID único no portal de origem — vai para EmendaParlamentar.idPortal */
  idPortal: string;
  /** Ano orçamentário */
  ano: number;
  /** Número da emenda na LOA estadual */
  numero?: string;
  /** Tipo de emenda (individual, bancada, comissão…) */
  tipo?: string;
  /** Função orçamentária (ex: "Saúde", "Educação") */
  funcao?: string;
  /** Subfunção orçamentária */
  subfuncao?: string;
  /** Área temática — se não vier do CSV, será classificada automaticamente */
  area?: EmendaArea;
  /** Descrição / objeto da emenda */
  objeto?: string;
  /** Valor proposto/autorizado */
  valorProposto?: number;
  /** Valor empenhado */
  valorEmpenhado: number;
  /** Valor pago */
  valorPago: number;
  /** Valor em restos a pagar */
  valorRestoPago?: number;
  /** UF do estado (ex: "RS") */
  uf: string;
  /** Código IBGE 7 dígitos do município beneficiado */
  codigoIbge?: string;
  /** Nome do município beneficiado */
  municipioNome?: string;
  /** Nome do parlamentar autor */
  autorNome: string;
  /** Cargo do parlamentar (default DEPUTADO_ESTADUAL) */
  autorCargo?: ParlamentarCargo;
  /** Partido do parlamentar */
  autorPartido?: string;
}

export interface ImportResult {
  inseridas: number;
  erros: number;
  parlamentares: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

export function parseValorBR(v: any): number {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string' || !v.trim()) return 0;
  // Remove R$, espaços, etc.; trata ponto como milhar, vírgula como decimal
  const cleaned = v.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function normalizeNome(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// ─────────────────────────────────────────────────────────────────────────
// Importação genérica
// ─────────────────────────────────────────────────────────────────────────

export async function importarEmendas(
  prismaInicial: PrismaClient,
  uf: string,
  rows: EmendaEstadualRow[],
  opts: { batchSize?: number; dryRun?: boolean } = {},
): Promise<ImportResult> {
  const { batchSize = 20, dryRun = false } = opts;
  const result: ImportResult = { inseridas: 0, erros: 0, parlamentares: 0 };

  // Lookup IBGE para enriquecer municipioNome → codigoIbge automaticamente
  const municipiosIbge = await fetchMunicipiosIBGE(uf);

  let prisma = prismaInicial;
  const getPrisma = () => prisma;
  const setPrisma = (p: PrismaClient) => { prisma = p; };

  const parlamentarCache = new Map<string, string>();

  async function obterParlamentar(row: EmendaEstadualRow): Promise<string | null> {
    const chave = normalizeNome(row.autorNome);
    if (parlamentarCache.has(chave)) return parlamentarCache.get(chave)!;
    if (dryRun) return null;

    try {
      const idPortal = `${uf}:${chave}`;
      const p = await withRetry(
        (db) => db.parlamentar.upsert({
          where: { idPortal },
          create: { idPortal, nome: row.autorNome, cargo: row.autorCargo ?? 'DEPUTADO_ESTADUAL', partido: row.autorPartido ?? null, uf },
          update: { ...(row.autorPartido ? { partido: row.autorPartido } : {}) },
        }),
        getPrisma, setPrisma,
      );
      parlamentarCache.set(chave, p.id);
      result.parlamentares++;
      return p.id;
    } catch (e: any) {
      console.warn(`  [parlamentar] erro "${row.autorNome}": ${e.message?.slice(0, 300)}`);
      return null;
    }
  }

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (row) => {
        try {
          const parlamentarId = await obterParlamentar(row);
          const area = row.area ?? classificarArea(null, row.funcao ?? null);

          // Enriquecer codigoIbge via lookup (tenta exato; fallback sem espaços para "Doeste" vs "D Oeste")
          const codigoIbge = row.codigoIbge ?? (() => {
            if (!row.municipioNome) return null;
            const norm = normalizeNome(row.municipioNome.trim());
            return municipiosIbge.get(norm) ?? municipiosIbge.get(norm.replace(/\s/g, '')) ?? null;
          })();

          if (!dryRun) {
            await withRetry(
              (db) => db.emendaParlamentar.upsert({
                where: { idPortal: row.idPortal },
                create: {
                  idPortal: row.idPortal, esfera: 'ESTADUAL', ano: row.ano,
                  numero: row.numero ?? null, tipo: row.tipo ?? null,
                  funcao: row.funcao ?? null, subfuncao: row.subfuncao ?? null,
                  area, objeto: row.objeto ?? null,
                  valorProposto: row.valorProposto ?? null,
                  valorEmpenhado: row.valorEmpenhado, valorPago: row.valorPago,
                  valorRestoPago: row.valorRestoPago ?? 0,
                  uf: row.uf, codigoIbge: codigoIbge ?? null,
                  municipioNome: row.municipioNome ?? null,
                  parlamentarId: parlamentarId ?? undefined,
                },
                update: {
                  esfera: 'ESTADUAL', numero: row.numero ?? null, tipo: row.tipo ?? null,
                  funcao: row.funcao ?? null, subfuncao: row.subfuncao ?? null,
                  area, objeto: row.objeto ?? null,
                  valorProposto: row.valorProposto ?? null,
                  valorEmpenhado: row.valorEmpenhado, valorPago: row.valorPago,
                  valorRestoPago: row.valorRestoPago ?? 0,
                  uf: row.uf, codigoIbge: codigoIbge ?? null,
                  municipioNome: row.municipioNome ?? null,
                  ...(parlamentarId ? { parlamentarId } : {}),
                },
              }),
              getPrisma, setPrisma,
            );
          }

          result.inseridas++;
        } catch (e: any) {
          console.warn(`  [emenda] erro "${row.idPortal}": ${e.message?.slice(0, 300)}`);
          result.erros++;
        }
      }),
    );

    const pct = Math.round(((i + batch.length) / rows.length) * 100);
    process.stdout.write(`\r  ${i + batch.length}/${rows.length} (${pct}%)${dryRun ? ' [DRY RUN]' : ''}   `);
  }

  console.log('');
  return result;
}
