export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { readFile } from 'fs/promises';
import path from 'path';

const cache: Record<string, { data: any; timestamp: number }> = {};
const CACHE_TTL = 60 * 60 * 1000; // 1h

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function GET(request: NextRequest) {
  // Exige sessão: sem isto a rota é um proxy ABERTO para as APIs
  // externas. O dado é público, mas a infraestrutura é nossa — qualquer
  // um poderia consumir banda e invocações de função da conta.
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const uf = searchParams.get('uf')?.toUpperCase();
  const municipio = searchParams.get('municipio');

  if (!uf || !municipio) {
    return NextResponse.json({ error: 'Parâmetros uf e municipio são obrigatórios' }, { status: 400 });
  }

  const cacheKey = `${uf}:${norm(municipio)}`;
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    const filePath = path.join(process.cwd(), 'public', 'geojson', `${uf}_bairros_CD2022.json`);
    const raw = await readFile(filePath, 'utf-8');
    const geojson = JSON.parse(raw);

    const munNorm = norm(municipio);
    const features = (geojson.features ?? []).filter(
      (f: any) => norm(f.properties?.NM_MUN ?? '') === munNorm
    );

    const result = { type: 'FeatureCollection', features };
    cache[cacheKey] = { data: result, timestamp: Date.now() };

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'GeoJSON não disponível para esta UF' }, { status: 404 });
  }
}
