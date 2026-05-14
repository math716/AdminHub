export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

// In-memory cache para não bater a API do TSE repetidamente
const fotoCache = new Map<string, { fotoUrl: string | null; expiresAt: number }>();

function norm(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

// GET /api/tse/foto?nome=TARCISIO&ano=2022&uf=SP
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ fotoUrl: null }, { status: 401 });

  const nome = request.nextUrl.searchParams.get('nome');
  const ano  = request.nextUrl.searchParams.get('ano') || '2022';
  const uf   = request.nextUrl.searchParams.get('uf')  || 'BR';

  if (!nome) return NextResponse.json({ fotoUrl: null });

  const cacheKey = `${nome}|${ano}|${uf}`.toLowerCase();
  const cached = fotoCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ fotoUrl: cached.fotoUrl });
  }

  const store = (fotoUrl: string | null, ttlMs: number) => {
    fotoCache.set(cacheKey, { fotoUrl, expiresAt: Date.now() + ttlMs });
    return NextResponse.json({ fotoUrl });
  };

  try {
    const tseUrl = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/${ano}/${uf}/0/candidatos?nome=${encodeURIComponent(nome)}`;

    const res = await fetch(tseUrl, {
      headers: { 'User-Agent': 'AdminHub/1.0 (contato@adminhub.app)' },
    });

    if (!res.ok) return store(null, 30 * 60 * 1000);

    const data = await res.json();
    const candidatos: any[] = data.candidatos ?? [];
    if (!candidatos.length) return store(null, 60 * 60 * 1000);

    // Melhor match por nome de urna
    const normNome = norm(nome);
    const best =
      candidatos.find(c => norm(c.nomeUrna || c.nome || '').includes(normNome)) ??
      candidatos[0];

    const sqcand = best?.sqcand;
    const foto   = best?.fotoCandidato;
    if (!sqcand || !foto) return store(null, 60 * 60 * 1000);

    const codigoEleicao = uf === 'BR' ? 'BR0001' : `${uf}0002`;
    const fotoUrl = `https://divulgacandcontas.tse.jus.br/candidaturas/oficial/${ano}/BR/${codigoEleicao}/${sqcand}/fotos/${foto}`;

    return store(fotoUrl, 24 * 60 * 60 * 1000);
  } catch {
    return store(null, 30 * 60 * 1000);
  }
}
