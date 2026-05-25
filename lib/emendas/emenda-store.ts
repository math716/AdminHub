/**
 * Persistência de emendas e documentos no Prisma.
 *
 * - upsertEmenda: linha bruta de /api-de-dados/emendas → EmendaParlamentar
 * - upsertDocumento: linha bruta de /api-de-dados/despesas/documentos/{cod} → EmendaDocumento
 * - findOrCreateParlamentar: agrupa autores únicos em Parlamentar
 *
 * Nada aqui faz HTTP — recebe dados já buscados pelo orchestrator
 * (enrichEmenda.ts). Isso facilita testar com fixtures.
 */

import { prisma } from '@/lib/db';
import type { EmendaArea, ParlamentarCargo } from '@prisma/client';
import {
  parseValorBR,
  parseDataBR,
  normalizeCnpj,
  resolverCodigoIbge,
  parseSubTituloMunicipio,
} from './emenda-parser';

// ---------------------------------------------------------------------------
// Tipos das respostas cruas do Portal
// ---------------------------------------------------------------------------

export interface PortalEmendaRow {
  codigoEmenda: string;
  ano: number;
  numeroEmenda?: string | null;
  tipoEmenda?: string | null;
  nomeAutor?: string | null;
  autor?: string | null;
  localidadeDoGasto?: string | null;
  funcao?: string | null;
  subfuncao?: string | null;
  valorEmpenhado?: string | null;
  valorLiquidado?: string | null;
  valorPago?: string | null;
  valorRestoInscrito?: string | null;
  valorRestoCancelado?: string | null;
  valorRestoPago?: string | null;
}

export interface PortalDocumentoRow {
  data?: string | null;
  documento?: string | null;
  documentoResumido?: string | null;
  observacao?: string | null;
  funcao?: string | null;
  subfuncao?: string | null;
  programa?: string | null;
  acao?: string | null;
  subTitulo?: string | null;
  localizadorGasto?: string | null;
  fase?: string | null;
  favorecido?: string | null;
  codigoFavorecido?: string | null;
  nomeFavorecido?: string | null;
  ufFavorecido?: string | null;
  valor?: string | null;
  orgao?: string | null;
  orgaoSuperior?: string | null;
}

// ---------------------------------------------------------------------------
// Classificação Função → Área (mantido coerente com lib/portal-transparencia.ts)
// ---------------------------------------------------------------------------
function classificarArea(funcaoNome?: string | null): EmendaArea {
  const nome = (funcaoNome ?? '').toLowerCase();
  if (nome.includes('saúde') || nome.includes('saude')) return 'SAUDE';
  if (nome.includes('educa')) return 'EDUCACAO';
  if (nome.includes('segura')) return 'SEGURANCA';
  if (nome.includes('urban') || nome.includes('infraestrutura')) return 'INFRAESTRUTURA';
  if (nome.includes('saneamento')) return 'SANEAMENTO';
  if (nome.includes('assistência') || nome.includes('assistencia')) return 'ASSISTENCIA_SOCIAL';
  if (nome.includes('agricultura')) return 'AGRICULTURA';
  if (nome.includes('cultura')) return 'CULTURA';
  if (nome.includes('esporte') || nome.includes('desporto')) return 'ESPORTE';
  if (nome.includes('ambiente')) return 'MEIO_AMBIENTE';
  if (nome.includes('transporte')) return 'TRANSPORTE';
  if (nome.includes('habita')) return 'HABITACAO';
  return 'OUTROS';
}

function inferCargo(tipoEmenda?: string | null): ParlamentarCargo {
  const s = (tipoEmenda ?? '').toUpperCase();
  if (s.includes('SENADOR')) return 'SENADOR';
  if (s.includes('BANCADA')) return 'DEPUTADO_FEDERAL';
  if (s.includes('COMISSÃO') || s.includes('COMISSAO')) return 'DEPUTADO_FEDERAL';
  if (s.includes('FEDERAL')) return 'DEPUTADO_FEDERAL';
  if (s.includes('ESTADUAL')) return 'DEPUTADO_ESTADUAL';
  if (s.includes('GOVERN')) return 'GOVERNADOR';
  if (s.includes('PREFEIT')) return 'PREFEITO';
  if (s.includes('VEREAD')) return 'VEREADOR';
  return 'DEPUTADO_FEDERAL';
}

// ---------------------------------------------------------------------------
// Parser de localidadeDoGasto
// "Nacional" | "MINAS GERAIS (UF)" | "JOÃO PESSOA - PB"
// ---------------------------------------------------------------------------
function parseLocalidade(raw: string | null | undefined): {
  uf: string | null;
  municipio: string | null;
} {
  if (!raw) return { uf: null, municipio: null };
  const s = raw.trim();
  if (/^nacional$/i.test(s)) return { uf: null, municipio: null };

  const mUf = s.match(/^(.+)\s*\(UF\)\s*$/i);
  if (mUf) {
    return { uf: ufNomeParaSigla(mUf[1].trim()), municipio: null };
  }
  const mMun = s.match(/^(.+)\s*-\s*([A-Z]{2})\s*$/);
  if (mMun) {
    return { uf: mMun[2].toUpperCase(), municipio: mMun[1].trim() };
  }
  return { uf: null, municipio: null };
}

const UF_MAP: Record<string, string> = {
  ACRE: 'AC', ALAGOAS: 'AL', 'AMAPÁ': 'AP', AMAPA: 'AP', AMAZONAS: 'AM',
  BAHIA: 'BA', 'CEARÁ': 'CE', CEARA: 'CE', 'DISTRITO FEDERAL': 'DF',
  'ESPÍRITO SANTO': 'ES', 'ESPIRITO SANTO': 'ES', 'GOIÁS': 'GO', GOIAS: 'GO',
  'MARANHÃO': 'MA', MARANHAO: 'MA', 'MATO GROSSO': 'MT', 'MATO GROSSO DO SUL': 'MS',
  'MINAS GERAIS': 'MG', 'PARÁ': 'PA', PARA: 'PA', 'PARAÍBA': 'PB', PARAIBA: 'PB',
  'PARANÁ': 'PR', PARANA: 'PR', PERNAMBUCO: 'PE', 'PIAUÍ': 'PI', PIAUI: 'PI',
  'RIO DE JANEIRO': 'RJ', 'RIO GRANDE DO NORTE': 'RN', 'RIO GRANDE DO SUL': 'RS',
  'RONDÔNIA': 'RO', RONDONIA: 'RO', RORAIMA: 'RR', 'SANTA CATARINA': 'SC',
  'SÃO PAULO': 'SP', 'SAO PAULO': 'SP', SERGIPE: 'SE', TOCANTINS: 'TO',
};
function ufNomeParaSigla(nome: string): string | null {
  return UF_MAP[nome.toUpperCase()] ?? null;
}

// ---------------------------------------------------------------------------
// findOrCreateParlamentar — agrupa autores por (nome normalizado, cargo)
// ---------------------------------------------------------------------------
export async function findOrCreateParlamentar(opts: {
  nome: string;
  cargo: ParlamentarCargo;
  uf?: string | null;
}): Promise<{ id: string }> {
  const nomeNorm = opts.nome.trim().toUpperCase();
  // idPortal namespaceado pra evitar colisão com identificadores reais futuros
  const idPortal = `PORTAL:${nomeNorm}`;

  const upserted = await prisma.parlamentar.upsert({
    where: { idPortal },
    create: {
      idPortal,
      nome: nomeNorm,
      cargo: opts.cargo,
      uf: opts.uf ?? null,
    },
    update: {
      // não sobrescrevemos cargo/uf se já tem (autoridade do primeiro registro)
    },
    select: { id: true },
  });

  return upserted;
}

// ---------------------------------------------------------------------------
// upsertEmenda — linha de /api-de-dados/emendas → EmendaParlamentar
// ---------------------------------------------------------------------------
export async function upsertEmenda(row: PortalEmendaRow): Promise<{ id: string; codigoEmenda: string }> {
  const loc = parseLocalidade(row.localidadeDoGasto);
  const codigoIbge = await resolverCodigoIbge(loc.uf, loc.municipio);

  const autorNome = (row.nomeAutor ?? row.autor ?? '—').toString().trim();
  const cargo = inferCargo(row.tipoEmenda);
  const parl = await findOrCreateParlamentar({ nome: autorNome, cargo, uf: loc.uf });

  const idPortal = String(row.codigoEmenda);
  const upserted = await prisma.emendaParlamentar.upsert({
    where: { idPortal },
    create: {
      idPortal,
      ano: Number(row.ano),
      numero: row.numeroEmenda ?? null,
      tipo: row.tipoEmenda ?? null,
      funcao: row.funcao ?? null,
      subfuncao: row.subfuncao ?? null,
      area: classificarArea(row.funcao),
      objeto: row.localidadeDoGasto ?? null,
      valorEmpenhado: parseValorBR(row.valorEmpenhado),
      valorPago: parseValorBR(row.valorPago),
      valorRestoPago: parseValorBR(row.valorRestoPago),
      uf: loc.uf,
      codigoIbge,
      municipioNome: loc.municipio,
      parlamentarId: parl.id,
    },
    update: {
      // valores mudam ao longo do ano (empenhos novos, pagamentos) — atualiza
      valorEmpenhado: parseValorBR(row.valorEmpenhado),
      valorPago: parseValorBR(row.valorPago),
      valorRestoPago: parseValorBR(row.valorRestoPago),
      funcao: row.funcao ?? null,
      subfuncao: row.subfuncao ?? null,
      area: classificarArea(row.funcao),
      // município pode ser "descoberto" depois — preserva se já tinha
      codigoIbge: codigoIbge ?? undefined,
      municipioNome: loc.municipio ?? undefined,
      parlamentarId: parl.id,
    },
    select: { id: true, idPortal: true },
  });

  return { id: upserted.id, codigoEmenda: upserted.idPortal };
}

// ---------------------------------------------------------------------------
// upsertDocumento — linha de /despesas/documentos/{cod} → EmendaDocumento
// Resolve município do favorecido em cascata.
// ---------------------------------------------------------------------------
export async function upsertDocumento(opts: {
  emendaId: string;
  emendaUf: string | null;
  row: PortalDocumentoRow;
}): Promise<void> {
  const { emendaId, emendaUf, row } = opts;
  const codigoDocumento = row.documento;
  if (!codigoDocumento) return;

  // Cascata de resolução de município:
  // 1. parser do subTitulo
  // 2. fallback: usa ufFavorecido só pra UF
  let municipioFavorecido: string | null = null;
  let ufResolvida: string | null = row.ufFavorecido ?? emendaUf;
  let codigoIbgeFavorecido: string | null = null;

  const fromSubTitulo = parseSubTituloMunicipio(row.subTitulo);
  if (fromSubTitulo?.tipo === 'MUNICIPIO' && fromSubTitulo.municipio) {
    municipioFavorecido = fromSubTitulo.municipio;
    ufResolvida = fromSubTitulo.uf ?? ufResolvida;
    codigoIbgeFavorecido = await resolverCodigoIbge(ufResolvida, municipioFavorecido);
  }

  await prisma.emendaDocumento.upsert({
    where: { codigoDocumento },
    create: {
      codigoDocumento,
      codigoDocumentoResumido: row.documentoResumido ?? null,
      emendaId,
      fase: row.fase ?? 'Empenho',
      data: parseDataBR(row.data),
      valor: parseValorBR(row.valor),
      cnpjFavorecido: normalizeCnpj(row.codigoFavorecido),
      nomeFavorecido: row.nomeFavorecido ?? null,
      ufFavorecido: ufResolvida,
      municipioFavorecido,
      codigoIbgeFavorecido,
      subTitulo: row.subTitulo ?? null,
      localizadorGasto: row.localizadorGasto ?? null,
      observacao: row.observacao ?? null,
      programa: row.programa ?? null,
      acao: row.acao ?? null,
      orgao: row.orgao ?? null,
      orgaoSuperior: row.orgaoSuperior ?? null,
    },
    update: {
      fase: row.fase ?? 'Empenho',
      valor: parseValorBR(row.valor),
      municipioFavorecido: municipioFavorecido ?? undefined,
      codigoIbgeFavorecido: codigoIbgeFavorecido ?? undefined,
      observacao: row.observacao ?? null,
    },
  });
}
