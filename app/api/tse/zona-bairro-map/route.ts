export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

interface LocalJson {
  municipio: string;
  zona: number;
  bairro: string;
}

// Cache em memória por UF
const locaisCache = new Map<string, LocalJson[]>();

function loadLocais(uf: string): LocalJson[] {
  if (locaisCache.has(uf)) return locaisCache.get(uf)!;

  const base = path.join(process.cwd(), 'public', 'data', 'tse', 'locais', `${uf}.json`);
  const gz   = base + '.gz';
  try {
    const raw = fs.existsSync(gz)
      ? zlib.gunzipSync(fs.readFileSync(gz)).toString('utf8')
      : fs.readFileSync(base, 'utf8');
    const data: LocalJson[] = JSON.parse(raw);
    locaisCache.set(uf, data);
    return data;
  } catch {
    return [];
  }
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const uf        = (searchParams.get('uf') ?? '').toUpperCase();
    const municipio = (searchParams.get('municipio') ?? '').trim();

    if (!uf || !municipio) {
      return NextResponse.json({ error: 'uf e municipio são obrigatórios' }, { status: 400 });
    }

    const locais = loadLocais(uf);
    if (locais.length === 0) {
      return NextResponse.json({ zonaBairroMap: {} });
    }

    const munNorm = norm(municipio);
    const locaisMun = locais.filter(l => norm(l.municipio) === munNorm && l.bairro?.trim());

    if (locaisMun.length === 0) {
      return NextResponse.json({ zonaBairroMap: {} });
    }

    // Agrupa locais por zona
    const porZona: Record<number, string[]> = {};
    for (const l of locaisMun) {
      if (!porZona[l.zona]) porZona[l.zona] = [];
      porZona[l.zona].push(norm(l.bairro));
    }

    // Para cada zona, calcula fração de cada bairro
    const zonaBairroMap: Record<number, Record<string, number>> = {};
    for (const [zonaStr, bairros] of Object.entries(porZona)) {
      const zona = Number(zonaStr);
      const total = bairros.length;
      const contagem: Record<string, number> = {};
      for (const b of bairros) {
        contagem[b] = (contagem[b] ?? 0) + 1;
      }
      zonaBairroMap[zona] = {};
      for (const [b, cnt] of Object.entries(contagem)) {
        zonaBairroMap[zona][b] = cnt / total;
      }
    }

    return NextResponse.json({ zonaBairroMap });
  } catch (error) {
    console.error('Erro ao calcular zona-bairro-map:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
