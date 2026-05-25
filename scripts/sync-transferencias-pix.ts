/**
 * Sincroniza Transferências Especiais (Pix) do Portal da Transparência.
 *
 * Por que existe:
 *   Emendas individuais de Transferência Especial (EC 105/2019, conhecidas
 *   como "Pix Parlamentar") frequentemente aparecem em /api-de-dados/emendas
 *   com localidade "UF (UF)" — o município destino só é decidido depois,
 *   quando o parlamentar/gabinete instrui a transferência ao tesouro.
 *
 *   Esses repasses subsequentes ficam num endpoint separado. Este script
 *   baixa os Pix de um ano e linka com as emendas originais via codigoEmenda
 *   (quando o Portal expõe esse vínculo).
 *
 * Uso:
 *   Modo descoberta (DICA: rode isto primeiro!) — bate na API e mostra
 *   a estrutura do JSON do primeiro registro pra confirmar os campos:
 *
 *     npx tsx --require dotenv/config scripts/sync-transferencias-pix.ts --discover
 *
 *   Sync efetivo de um ano:
 *
 *     npx tsx --require dotenv/config scripts/sync-transferencias-pix.ts \
 *       --ano 2024 [--from-pagina 1] [--max-paginas 5000] [--delay-ms 700]
 *
 * Tempo estimado: ~15-40 minutos por ano completo, depende do volume.
 *
 * IMPORTANTE: o nome exato do endpoint e dos campos varia entre versões da
 * API. O script tenta várias variações comuns e loga aviso quando algum
 * campo não casa. Se aparecer "estrutura inesperada", rode em --discover
 * primeiro pra ver o JSON cru e me mostra o resultado.
 */

import { PrismaClient } from '@prisma/client';

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

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const DISCOVER  = flag('discover');
const ANO       = parseInt(arg('ano', String(new Date().getFullYear() - 1))!, 10);
const FROM_PAGE = parseInt(arg('from-pagina', '1')!, 10);
const MAX_PAGES = parseInt(arg('max-paginas', '5000')!, 10);
const DELAY_MS  = parseInt(arg('delay-ms', '700')!, 10);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────────────────
// Endpoints candidatos — Portal mexe nos paths às vezes. Tenta na ordem.
// ─────────────────────────────────────────────────────────────────────────
const ENDPOINT_CANDIDATES = [
  '/api-de-dados/transferencias-especiais-orcamento',
  '/api-de-dados/transferencias',
];

// ─────────────────────────────────────────────────────────────────────────
// HTTP helper
// ─────────────────────────────────────────────────────────────────────────
async function portalFetch(path: string, params: Record<string, string | number | undefined>): Promise<any> {
  const url = new URL(`${PORTAL_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  });

  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      const res = await fetch(url.toString(), {
        headers: { 'chave-api-dados': API_KEY!, accept: 'application/json' },
      });
      if (res.status === 429) {
        await sleep(5000);
        continue;
      }
      if (res.status === 404) return null;  // endpoint não existe
      if (!res.ok) {
        console.warn(`   [aviso] ${path}: HTTP ${res.status}`);
        return null;
      }
      const data = await res.json();
      return Array.isArray(data) ? data : (data?.dados ?? data?.data ?? []);
    } catch (e: any) {
      console.warn(`   [aviso] ${path} tentativa ${tentativa + 1}: ${e.message}`);
      await sleep(2000);
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Descobre qual endpoint funciona e em qual formato
// ─────────────────────────────────────────────────────────────────────────
async function descobrirEndpoint(): Promise<string | null> {
  for (const ep of ENDPOINT_CANDIDATES) {
    console.log(`   Tentando ${ep}…`);
    // Bate com filtros mínimos pro ano corrente
    const params: Record<string, string | number | undefined> = {
      ano: ANO,
      pagina: 1,
    };
    // Pra /transferencias, precisa de mesAno
    if (ep === '/api-de-dados/transferencias') {
      params.mesAnoInicio = `01/${ANO}`;
      params.mesAnoFim    = `12/${ANO}`;
    }
    const data = await portalFetch(ep, params);
    if (data && Array.isArray(data) && data.length > 0) {
      console.log(`   ✓ Endpoint funcionando: ${ep}`);
      return ep;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers de parsing — alinhado com lib/portal-transparencia
// ─────────────────────────────────────────────────────────────────────────
function parseValorBR(v: any): number {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return 0;
  const cleaned = v.replace(/[^\d,.\-]/g, '');
  if (!cleaned) return 0;
  const norm = cleaned.replace(/\./g, '').replace(',', '.');
  const n = Number(norm);
  return Number.isFinite(n) ? n : 0;
}

function parseDataBR(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v !== 'string') return null;
  // dd/MM/yyyy
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}`);
  // ISO yyyy-MM-dd
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}

// Extrai campos comuns com fallbacks (o Portal varia entre versões)
function extrairCampos(row: any): {
  idPortal: string | null;
  ano: number;
  mes: number | null;
  dataReferencia: Date | null;
  valor: number;
  uf: string | null;
  codigoIbge: string | null;
  municipioNome: string | null;
  beneficiarioNome: string | null;
  cnpjBeneficiario: string | null;
  emendaIdPortal: string | null;
  autorNome: string | null;
} {
  // Tenta vários nomes possíveis do id (a API às vezes não tem id estável)
  const idPortal =
    row?.id ?? row?.idPortal ?? row?.numero ?? row?.numeroDocumento ??
    row?.codigoTransferencia ?? null;

  const dataRef =
    parseDataBR(row?.data) ??
    parseDataBR(row?.dataReferencia) ??
    parseDataBR(row?.mesAnoReferencia);

  // Município pode vir aninhado em vários formatos
  const muni = row?.municipio ?? row?.localidade ?? row?.unidadeFederativa ?? {};
  const codigoIbge =
    String(muni?.codigoIBGE ?? muni?.codigoIbge ?? muni?.codigo ?? '').slice(0, 7) || null;
  const municipioNome = muni?.nome ?? muni?.nomeMunicipio ?? null;
  const uf =
    muni?.uf ?? muni?.siglaUf ?? row?.uf ?? row?.siglaUf ?? null;

  // Beneficiário pode estar em "favorecido", "beneficiario" etc.
  const fav = row?.favorecido ?? row?.beneficiario ?? {};
  const beneficiarioNome = fav?.nome ?? fav?.razaoSocial ?? row?.nomeFavorecido ?? null;
  const cnpjBeneficiario = fav?.cnpj ?? fav?.codigoFormatado ?? row?.cnpjFavorecido ?? null;

  // Link com a emenda original
  const emenda = row?.emenda ?? {};
  const emendaIdPortal =
    emenda?.codigoEmenda ?? emenda?.codigo ?? row?.codigoEmenda ??
    row?.emendaCodigo ?? null;

  const autorNome =
    emenda?.autor ?? emenda?.nomeAutor ?? row?.autorEmenda ?? row?.nomeAutor ?? null;

  return {
    idPortal:         idPortal ? String(idPortal) : null,
    ano:              Number(row?.ano ?? ANO),
    mes:              row?.mes ? Number(row.mes) : null,
    dataReferencia:   dataRef,
    valor:            parseValorBR(row?.valor ?? row?.valorTransferido ?? 0),
    uf:               uf ? String(uf).toUpperCase() : null,
    codigoIbge,
    municipioNome,
    beneficiarioNome,
    cnpjBeneficiario,
    emendaIdPortal:   emendaIdPortal ? String(emendaIdPortal) : null,
    autorNome:        autorNome ? String(autorNome).trim().toUpperCase() : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Cache: nomeAutor → parlamentarId
// ─────────────────────────────────────────────────────────────────────────
const parlamentarIdPorNome = new Map<string, string>();

async function resolverParlamentar(autorNome: string | null): Promise<string | null> {
  if (!autorNome) return null;
  const cached = parlamentarIdPorNome.get(autorNome);
  if (cached) return cached;

  const rec = await prisma.parlamentar.findFirst({
    where: { OR: [{ idPortal: autorNome }, { nome: autorNome }] },
    select: { id: true },
  });
  if (rec) {
    parlamentarIdPorNome.set(autorNome, rec.id);
    return rec.id;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Modo descoberta — só loga a estrutura
// ─────────────────────────────────────────────────────────────────────────
async function modoDescoberta() {
  console.log(`\n🔍 MODO DESCOBERTA — ano=${ANO}\n`);

  for (const ep of ENDPOINT_CANDIDATES) {
    console.log(`\n────── ${ep} ──────`);
    const params: Record<string, string | number | undefined> = {
      ano: ANO,
      pagina: 1,
    };
    if (ep === '/api-de-dados/transferencias') {
      params.mesAnoInicio = `01/${ANO}`;
      params.mesAnoFim    = `12/${ANO}`;
    }

    const data = await portalFetch(ep, params);
    if (!data) {
      console.log(`   ❌ Sem resposta (404 / 5xx).`);
      continue;
    }
    if (!Array.isArray(data)) {
      console.log(`   ❌ Resposta não é array. Tipo: ${typeof data}`);
      continue;
    }
    if (data.length === 0) {
      console.log(`   ⚠ Array vazio.`);
      continue;
    }

    console.log(`   ✓ ${data.length} registros na página 1.`);
    console.log(`   Estrutura do 1º registro:`);
    console.log(JSON.stringify(data[0], null, 2));
    console.log(`\n   Campos extraídos pelo parser do script:`);
    console.log(JSON.stringify(extrairCampos(data[0]), null, 2));
  }
  console.log(`\n✅ Descoberta concluída. Se algum campo importante saiu null,`);
  console.log(`   me cole o JSON do registro pra eu ajustar o parser.\n`);
}

// ─────────────────────────────────────────────────────────────────────────
// Sync efetivo
// ─────────────────────────────────────────────────────────────────────────
async function syncEfetivo() {
  console.log(`\n🔄 Sync Transferências Pix Portal → banco — ano=${ANO}\n`);

  const endpoint = await descobrirEndpoint();
  if (!endpoint) {
    console.error('❌ Nenhum endpoint candidato respondeu. Rode com --discover pra investigar.');
    process.exit(1);
  }

  const inicio = Date.now();
  let pagina = FROM_PAGE;
  let totalInseridas = 0;
  let totalLidas = 0;
  let semIdPortal = 0;
  let comEmendaLinkada = 0;
  let comMunicipio = 0;

  while (pagina <= MAX_PAGES) {
    const params: Record<string, string | number | undefined> = {
      ano: ANO,
      pagina,
    };
    if (endpoint === '/api-de-dados/transferencias') {
      params.mesAnoInicio = `01/${ANO}`;
      params.mesAnoFim    = `12/${ANO}`;
    }
    const rows = await portalFetch(endpoint, params);
    if (!rows || rows.length === 0) {
      console.log(`\n   página ${pagina} vazia — fim dos dados.`);
      break;
    }

    for (const row of rows) {
      totalLidas++;
      const c = extrairCampos(row);

      // Se não conseguiu id, gera um sintético com ano+município+valor+beneficiario
      // pra ainda assim ser idempotente (idPortal é unique no schema)
      if (!c.idPortal) {
        semIdPortal++;
        c.idPortal = `synthetic-${c.ano}-${c.codigoIbge ?? 'no'}-${c.cnpjBeneficiario ?? 'no'}-${Math.round(c.valor * 100)}`;
      }
      if (c.codigoIbge) comMunicipio++;
      if (c.emendaIdPortal) comEmendaLinkada++;

      const parlamentarId = await resolverParlamentar(c.autorNome);

      try {
        await prisma.transferenciaPix.upsert({
          where:  { idPortal: c.idPortal! },
          create: {
            idPortal:         c.idPortal!,
            ano:              c.ano,
            mes:              c.mes,
            dataReferencia:   c.dataReferencia,
            valor:            c.valor,
            uf:               c.uf,
            codigoIbge:       c.codigoIbge,
            municipioNome:    c.municipioNome,
            beneficiarioNome: c.beneficiarioNome,
            cnpjBeneficiario: c.cnpjBeneficiario,
            emendaIdPortal:   c.emendaIdPortal,
            parlamentarId,
          },
          update: {
            ano:              c.ano,
            mes:              c.mes,
            dataReferencia:   c.dataReferencia,
            valor:            c.valor,
            uf:               c.uf,
            codigoIbge:       c.codigoIbge,
            municipioNome:    c.municipioNome,
            beneficiarioNome: c.beneficiarioNome,
            cnpjBeneficiario: c.cnpjBeneficiario,
            emendaIdPortal:   c.emendaIdPortal,
            parlamentarId,
          },
        });
        totalInseridas++;
      } catch (err: any) {
        console.warn(`   [erro upsert ${c.idPortal}]: ${err.message}`);
      }
    }

    const elapsedMin = ((Date.now() - inicio) / 60_000).toFixed(1);
    process.stdout.write(
      `\r   página ${pagina} | ${totalInseridas} gravadas | ${comMunicipio} c/ município | ${comEmendaLinkada} c/ emenda | ${elapsedMin}min     `,
    );

    pagina++;
    if (rows.length >= 15) await sleep(DELAY_MS);
  }

  const totalMin = ((Date.now() - inicio) / 60_000).toFixed(1);
  console.log(`\n\n✅ Sync concluído!`);
  console.log(`   ${totalInseridas} transferências gravadas (${totalLidas} lidas)`);
  console.log(`   ${comMunicipio} com município identificado`);
  console.log(`   ${comEmendaLinkada} linkadas a uma emenda original`);
  if (semIdPortal > 0) {
    console.log(`   ⚠ ${semIdPortal} sem id estável no Portal — usado id sintético`);
  }
  console.log(`   ${totalMin}min de execução\n`);
}

// ─────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────
async function main() {
  if (DISCOVER) {
    await modoDescoberta();
  } else {
    await syncEfetivo();
  }
}

main()
  .catch((e) => {
    console.error('\n❌ Erro:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
