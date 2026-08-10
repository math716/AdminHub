export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

const MAX_IMPORT = 500;
const BATCH_SIZE = 20;

// Mapeamento RA do DF → Zonas Eleitorais correspondentes
const RA_TO_ZONAS: Record<string, number[]> = {
  'PLANO PILOTO':      [1, 2],
  'BRASILIA':          [1, 2],
  'BRASÍLIA':          [1, 2],
  'ASA SUL':           [1],
  'ASA NORTE':         [2],
  'LAGO SUL':          [1],
  'LAGO NORTE':        [2],
  'CRUZEIRO':          [3],
  'SUDOESTE':          [3],
  'OCTOGONAL':         [3],
  'TAGUATINGA':        [4],
  'CEILANDIA':         [5, 6],
  'CEILÂNDIA':         [5, 6],
  'SAMAMBAIA':         [8],
  'NUCLEO BANDEIRANTE': [9],
  'NÚCLEO BANDEIRANTE': [9],
  'RIACHO FUNDO':      [9],
  'RIACHO FUNDO II':   [20],
  'GUARA':             [10],
  'GUARÁ':             [10],
  'PARK WAY':          [10],
  'SANTA MARIA':       [11],
  'PLANALTINA':        [13],
  'ARAPOANGA':         [13],
  'FERCAL':            [13],
  'SOBRADINHO':        [14],
  'SOBRADINHO II':     [14],
  'GAMA':              [15],
  'BRAZLANDIA':        [16],
  'BRAZLÂNDIA':        [16],
  'RECANTO DAS EMAS':  [17],
  'SAO SEBASTIAO':     [18],
  'SÃO SEBASTIÃO':     [18],
  'JARDIM BOTANICO':   [18],
  'JARDIM BOTÂNICO':   [18],
  'PARANOA':           [19],
  'PARANOÁ':           [19],
  'ITAPOA':            [19],
  'ITAPOÃ':            [19],
  'AGUAS CLARAS':      [20],
  'ÁGUAS CLARAS':      [20],
  'VICENTE PIRES':     [20],
  'ESTRUTURAL':        [21],
  'SCIA':              [21],
  'VARJAO':            [21],
  'VARJÃO':            [21],
  'CANDANGOLANDIA':    [21],
  'CANDANGOLÂNDIA':    [21],
};

function normRA(s: string): string {
  return s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function zonasParaRA(raName: string): number[] {
  const norm = normRA(raName);
  return RA_TO_ZONAS[norm] ?? [];
}

async function getGabineteAndUser(session: any): Promise<{ gabineteId: string; userId: string } | null> {
  const userId = (session.user as any)?.id;
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { gabineteId: true } });
  if (!user?.gabineteId) return null;
  return { gabineteId: user.gabineteId, userId };
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const ctx = await getGabineteAndUser(session);
    if (!ctx) return NextResponse.json({ error: 'Gabinete não encontrado' }, { status: 400 });

    const body = await request.json();
    const { colaboradores } = body ?? {};
    if (!Array.isArray(colaboradores) || colaboradores.length === 0) {
      return NextResponse.json({ error: 'Nenhum colaborador enviado' }, { status: 400 });
    }
    if (colaboradores.length > MAX_IMPORT) {
      return NextResponse.json({ error: `Máximo ${MAX_IMPORT} colaboradores por importação` }, { status: 400 });
    }

    const valid = colaboradores.filter(c => c.nome?.trim());
    const skipped = colaboradores.length - valid.length;

    let imported = 0;
    let errors = 0;

    // Process in parallel batches to avoid overloading the connection pool
    for (let i = 0; i < valid.length; i += BATCH_SIZE) {
      const batch = valid.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(c => {
          const regioes: string[] = typeof c.regioes === 'string'
            ? c.regioes.split(',').map((r: string) => r.trim()).filter(Boolean)
            : [];

          // Auto-derivar zonas a partir das RAs importadas
          const zonasSet = new Set<number>();
          regioes.forEach(r => zonasParaRA(r).forEach(z => zonasSet.add(z)));
          const zonas = Array.from(zonasSet);

          const regiaoRows = [
            ...regioes.map(r => ({ uf: 'DF', regiaoNome: r, tipo: 'RA' })),
            ...zonas.map(z => ({ uf: 'DF', regiaoNome: `Zona ${z}`, tipo: 'ZONA' })),
          ];

          return prisma.colaborador.create({
            data: {
              nome: c.nome.trim(),
              telefone: c.telefone?.trim() || null,
              email: c.email?.trim() || null,
              endereco: c.endereco?.trim() || null,
              lat: null,
              lng: null,
              funcao: c.funcao?.trim() || null,
              observacao: c.observacao?.trim() || null,
              status: 'ATIVO',
              gabineteId: ctx.gabineteId,
              createdById: ctx.userId,
              regioes: regiaoRows.length > 0 ? { create: regiaoRows } : undefined,
            },
            select: { id: true },
          });
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled') imported++;
        else errors++;
      }
    }

    return NextResponse.json({ imported, errors: errors + skipped });
  } catch (error) {
    console.error('POST /api/colaboradores/import error:', error);
    return NextResponse.json({ error: 'Erro na importação' }, { status: 500 });
  }
}
