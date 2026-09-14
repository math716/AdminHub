export const dynamic = 'force-dynamic';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { classificarArea } from '@/lib/portal-transparencia';
import type { EmendaArea, ParlamentarCargo } from '@prisma/client';

// ──────────────────────────────────────────────────────────────
// Tipos
// ──────────────────────────────────────────────────────────────
export interface MappedRow {
  codigoEmenda: string;
  anoEmenda: number;
  nomeAutor: string;
  cpfAutor?: string | null;
  cargo?: string | null;
  partido?: string | null;
  ufAutor?: string | null;
  uf?: string | null;
  municipio?: string | null;
  ibge?: string | null;
  valorEmpenhado: number;
  valorPago?: number | null;
  valorRestoPago?: number | null;
  tipo?: string | null;
  funcao?: string | null;
  objeto?: string | null;
  numero?: string | null;
  beneficiario?: string | null;
  cnpjBeneficiario?: string | null;
}

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────
function normalizeCpf(v?: string | null): string | null {
  if (!v) return null;
  const d = v.replace(/\D/g, '');
  return d.length === 11 ? d : null;
}

function normalizeCnpj(v?: string | null): string | null {
  if (!v) return null;
  const d = v.replace(/\D/g, '');
  return d.length === 14 ? d : null;
}

function inferCargo(tipo?: string | null, cargoStr?: string | null, esfera?: 'FEDERAL' | 'ESTADUAL'): ParlamentarCargo {
  const s = ((cargoStr ?? tipo) ?? '').toUpperCase();
  if (s.includes('SENADOR'))                           return 'SENADOR';
  if (s.includes('DEP') && s.includes('ESTADUAL'))    return 'DEPUTADO_ESTADUAL';
  if (s.includes('ESTADUAL'))                          return 'DEPUTADO_ESTADUAL';
  if (s.includes('DEP') && s.includes('FEDERAL'))     return 'DEPUTADO_FEDERAL';
  if (s.includes('FEDERAL'))                           return 'DEPUTADO_FEDERAL';
  if (s.includes('VEREADOR'))                          return 'VEREADOR';
  return esfera === 'ESTADUAL' ? 'DEPUTADO_ESTADUAL' : 'DEPUTADO_FEDERAL';
}

function toFloat(v: unknown): number {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (!v) return 0;
  const s = String(v).trim().replace(/\s/g, '');
  // BR format: 1.234,56
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  }
  return parseFloat(s.replace(',', '.')) || 0;
}

// ──────────────────────────────────────────────────────────────
// Handler
// ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const body = await req.json() as {
    rows: MappedRow[];
    uf: string;
    ano: number;
    esfera: 'FEDERAL' | 'ESTADUAL';
  };

  const { rows, esfera } = body;
  const ufGlobal = body.uf?.toUpperCase() || null;
  const anoGlobal = body.ano;

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'Nenhuma linha enviada' }, { status: 400 });
  }

  let created = 0, updated = 0, errors = 0;
  const erroDetalhes: string[] = [];

  // Cache de parlamentares por cpf/nome pra evitar queries repetidas
  const parlamentarCache = new Map<string, string>(); // chave → id

  // ── Fase 1: quais códigos já existem ────────────────────────────────────
  //
  // Uma consulta para o lote todo, em vez de um findUnique por linha. Serve só
  // para contar criados x atualizados: a gravação virou upsert, que dispensa
  // saber isso de antemão.
  const codigos = rows
    .map(r => String(r.codigoEmenda ?? '').trim())
    .filter(Boolean);
  const jaExistem = new Set(
    (await prisma.emendaParlamentar.findMany({
      where: { idPortal: { in: codigos } },
      select: { idPortal: true },
    })).map(e => e.idPortal),
  );

  // ── Fase 2: resolver os parlamentares ───────────────────────────────────
  //
  // Antes da gravação, porque o cache precisa estar pronto quando as emendas
  // entrarem em paralelo. Aqui as CHAVES já são distintas, então não há duas
  // gravações disputando a mesma linha — dá para ir em lote também.
  const autores = new Map<string, MappedRow>();
  for (const row of rows) {
    const nome = row.nomeAutor?.trim();
    if (!nome) continue;
    const chave = normalizeCpf(row.cpfAutor) ?? nome.toUpperCase();
    if (!autores.has(chave)) autores.set(chave, row);
  }

  const gravarAutor = async ([chave, row]: [string, MappedRow]) => {
    try {
      const nome = row.nomeAutor!.trim();
      const cpf = normalizeCpf(row.cpfAutor);
      const idPortal = cpf ?? nome;
      const cargo = inferCargo(row.tipo, row.cargo, esfera);
      const parl = await prisma.parlamentar.upsert({
        where: { idPortal },
        create: {
          idPortal,
          nome,
          cpf,
          cargo,
          partido: row.partido?.trim() ?? null,
          uf: row.ufAutor?.trim() ?? (row.uf || ufGlobal) ?? null,
        },
        update: {
          ...(row.partido ? { partido: row.partido.trim() } : {}),
          ...(cargo !== 'DEPUTADO_FEDERAL' ? { cargo } : {}),
        },
        select: { id: true },
      });
      parlamentarCache.set(chave, parl.id);
    } catch {
      // Parlamentar que não entra não impede a emenda de ser gravada sem autor.
    }
  };

  const LOTE_AUTORES = 8;
  const listaAutores = [...autores.entries()];
  for (let i = 0; i < listaAutores.length; i += LOTE_AUTORES) {
    await Promise.all(listaAutores.slice(i, i + LOTE_AUTORES).map(gravarAutor));
  }

  // ── Fase 3: gravar as emendas ───────────────────────────────────────────
  //
  // Em lotes paralelos. Era uma gravação por vez, esperando a ida e volta ao
  // banco: com as 500 linhas que o front manda por requisição e latência de
  // 120 ms, batia nos 120 s de teto da rota — e o usuário via a importação
  // falhar no meio, sem saber quantas linhas tinham entrado.
  const CONCORRENCIA = 8;

  const gravarLinha = async (row: MappedRow) => {
    try {
      const codigoEmenda = String(row.codigoEmenda ?? '').trim();
      if (!codigoEmenda) { errors++; return; }

      const ano = row.anoEmenda || anoGlobal;
      const uf  = (row.uf || ufGlobal) ?? null;
      const cpf = normalizeCpf(row.cpfAutor);
      const area = classificarArea(null, row.funcao) as EmendaArea;

      // Resolvido na fase 2; aqui é só consulta ao cache.
      const parlamentarId = row.nomeAutor?.trim()
        ? (parlamentarCache.get(cpf ?? row.nomeAutor.trim().toUpperCase()) ?? null)
        : null;

      // ── Upsert EmendaParlamentar ─────────────────────────────
      const data = {
        esfera,
        ano,
        uf,
        numero:       row.numero?.trim() ?? null,
        tipo:         row.tipo?.trim() ?? null,
        funcao:       row.funcao?.trim() ?? null,
        area,
        objeto:       row.objeto?.trim() ?? null,
        valorEmpenhado: toFloat(row.valorEmpenhado),
        valorPago:      toFloat(row.valorPago),
        valorRestoPago: toFloat(row.valorRestoPago),
        municipioNome:  row.municipio?.trim() ?? null,
        codigoIbge:     row.ibge?.trim() ?? null,
        beneficiario:   row.beneficiario?.trim() ?? null,
        cnpjBeneficiario: normalizeCnpj(row.cnpjBeneficiario),
        parlamentarId,
      };

      await prisma.emendaParlamentar.upsert({
        where: { idPortal: codigoEmenda },
        update: data,
        create: { idPortal: codigoEmenda, ...data },
      });
      if (jaExistem.has(codigoEmenda)) updated++; else created++;
    } catch (e: any) {
      errors++;
      if (erroDetalhes.length < 5) erroDetalhes.push(String(e?.message ?? e).slice(0, 120));
    }
  };

  // Código repetido no mesmo arquivo é comum — o portal de SP publica produto
  // cartesiano, com a mesma emenda em várias linhas. Em série a última vencia;
  // em paralelo, duas gravações disputariam a mesma chave única e uma
  // quebraria. Mantém-se a última ocorrência, que é o comportamento de antes.
  const porCodigo = new Map<string, MappedRow>();
  const semCodigo: MappedRow[] = [];
  for (const row of rows) {
    const cod = String(row.codigoEmenda ?? '').trim();
    if (cod) porCodigo.set(cod, row);
    else semCodigo.push(row);   // contabilizados como erro em gravarLinha
  }
  const aGravar = [...porCodigo.values(), ...semCodigo];

  for (let i = 0; i < aGravar.length; i += CONCORRENCIA) {
    await Promise.all(aGravar.slice(i, i + CONCORRENCIA).map(gravarLinha));
  }

  return NextResponse.json({ created, updated, errors, erroDetalhes, total: rows.length });
}
