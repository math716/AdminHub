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

function inferCargo(tipo?: string | null, cargoStr?: string | null): ParlamentarCargo {
  const s = ((cargoStr ?? tipo) ?? '').toUpperCase();
  if (s.includes('SENADOR'))               return 'SENADOR';
  if (s.includes('DEP') && s.includes('ESTADUAL')) return 'DEPUTADO_ESTADUAL';
  if (s.includes('ESTADUAL'))              return 'DEPUTADO_ESTADUAL';
  if (s.includes('VEREADOR'))              return 'VEREADOR';
  return 'DEPUTADO_FEDERAL';
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

  for (const row of rows) {
    try {
      const codigoEmenda = String(row.codigoEmenda ?? '').trim();
      if (!codigoEmenda) { errors++; continue; }

      const ano = row.anoEmenda || anoGlobal;
      const uf  = (row.uf || ufGlobal) ?? null;
      const cpf = normalizeCpf(row.cpfAutor);
      const cargo = inferCargo(row.tipo, row.cargo);
      const area = classificarArea(null, row.funcao) as EmendaArea;

      // ── Upsert Parlamentar ───────────────────────────────────
      let parlamentarId: string | null = null;
      if (row.nomeAutor?.trim()) {
        const cacheKey = cpf ?? row.nomeAutor.trim().toUpperCase();
        if (parlamentarCache.has(cacheKey)) {
          parlamentarId = parlamentarCache.get(cacheKey)!;
        } else {
          const idPortal = cpf ?? row.nomeAutor.trim();
          const parl = await prisma.parlamentar.upsert({
            where:  { idPortal },
            create: {
              idPortal,
              nome:    row.nomeAutor.trim(),
              cpf,
              cargo,
              partido: row.partido?.trim() ?? null,
              uf:      row.ufAutor?.trim() ?? uf ?? null,
            },
            update: {
              ...(row.partido ? { partido: row.partido.trim() } : {}),
              ...(cargo !== 'DEPUTADO_FEDERAL' ? { cargo } : {}),
            },
            select: { id: true },
          });
          parlamentarId = parl.id;
          parlamentarCache.set(cacheKey, parl.id);
        }
      }

      // ── Upsert EmendaParlamentar ─────────────────────────────
      const existing = await prisma.emendaParlamentar.findUnique({
        where: { idPortal: codigoEmenda },
        select: { id: true },
      });

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

      if (existing) {
        await prisma.emendaParlamentar.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.emendaParlamentar.create({ data: { idPortal: codigoEmenda, ...data } });
        created++;
      }
    } catch (e: any) {
      errors++;
      if (erroDetalhes.length < 5) erroDetalhes.push(String(e?.message ?? e).slice(0, 120));
    }
  }

  return NextResponse.json({ created, updated, errors, erroDetalhes, total: rows.length });
}
