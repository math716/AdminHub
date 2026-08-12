export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { derivarZonasDeRas } from '@/lib/colaboradores-zonas';

const MAX_IMPORT = 500;
const BATCH_SIZE = 20;
const NOMINATIM_DELAY_MS = 1100; // Nominatim requires ≤1 req/s

async function getGabineteAndUser(session: any): Promise<{ gabineteId: string; userId: string } | null> {
  const userId = (session.user as any)?.id;
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { gabineteId: true } });
  if (!user?.gabineteId) return null;
  return { gabineteId: user.gabineteId, userId };
}

function normName(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

async function geocodeCity(city: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(city + ', Brasil')}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'AdminHub/1.0 (gabinete@adminhub.app)' },
    });
    if (!res.ok) return null;
    const data: any[] = await res.json();
    if (!data[0]) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

async function resolvePadrinho(
  rawName: string,
  gabineteId: string,
  cache: Map<string, string>
): Promise<string | null> {
  const key = normName(rawName);
  if (!key) return null;
  if (cache.has(key)) return cache.get(key)!;

  const all = await prisma.padrinho.findMany({ where: { gabineteId }, select: { id: true, nome: true } });

  let found = all.find(p => normName(p.nome) === key);
  if (!found) {
    found = all.find(p => {
      const pn = normName(p.nome);
      return pn.startsWith(key) || key.startsWith(pn);
    });
  }

  if (found) {
    cache.set(key, found.id);
    return found.id;
  }

  const created = await prisma.padrinho.create({
    data: { nome: rawName.trim(), cargo: '', partido: '', gabineteId },
    select: { id: true },
  });
  cache.set(key, created.id);
  return created.id;
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

    // Resolve all padrinho names upfront
    const padrinhoCache = new Map<string, string>();
    const uniquePadrinhoNames = [...new Set(
      valid.map(c => c.padrinhoNome?.trim()).filter(Boolean) as string[]
    )];
    for (const name of uniquePadrinhoNames) {
      await resolvePadrinho(name, ctx.gabineteId, padrinhoCache);
    }

    // Pre-geocode cities that don't map to any known DF electoral zone
    const geoCache = new Map<string, { lat: number; lng: number } | null>();
    const citiesToGeocode: string[] = [];

    for (const c of valid) {
      if (!c.regioes) continue;
      const firstCity = c.regioes.split(',')[0]?.trim();
      if (!firstCity) continue;
      const key = normName(firstCity);
      if (!geoCache.has(key) && derivarZonasDeRas([firstCity]).length === 0) {
        geoCache.set(key, null);
        citiesToGeocode.push(firstCity);
      }
    }

    for (let i = 0; i < citiesToGeocode.length; i++) {
      const city = citiesToGeocode[i];
      const coords = await geocodeCity(city);
      geoCache.set(normName(city), coords);
      if (i < citiesToGeocode.length - 1) {
        await new Promise(r => setTimeout(r, NOMINATIM_DELAY_MS));
      }
    }

    let imported = 0;
    let errors = 0;

    for (let i = 0; i < valid.length; i += BATCH_SIZE) {
      const batch = valid.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(c => {
          const regioes: string[] = typeof c.regioes === 'string'
            ? c.regioes.split(',').map((r: string) => r.trim()).filter(Boolean)
            : [];

          const regiaoRows = [
            ...regioes.map(r => ({ uf: 'DF', regiaoNome: r, tipo: 'RA' })),
            ...derivarZonasDeRas(regioes),
          ];

          const padrinhoId = c.padrinhoNome?.trim()
            ? padrinhoCache.get(normName(c.padrinhoNome.trim())) ?? null
            : null;

          // Use geocoded coordinates for cities not mapped to DF zones
          let lat: number | null = null;
          let lng: number | null = null;
          const firstCity = regioes[0];
          if (firstCity && derivarZonasDeRas([firstCity]).length === 0) {
            const coords = geoCache.get(normName(firstCity));
            if (coords) { lat = coords.lat; lng = coords.lng; }
          }

          return prisma.colaborador.create({
            data: {
              nome: c.nome.trim(),
              telefone: c.telefone?.trim() || null,
              email: c.email?.trim() || null,
              endereco: c.endereco?.trim() || null,
              lat,
              lng,
              funcao: c.funcao?.trim() || null,
              observacao: c.observacao?.trim() || null,
              status: 'ATIVO',
              gabineteId: ctx.gabineteId,
              createdById: ctx.userId,
              padrinhoId: padrinhoId || null,
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
