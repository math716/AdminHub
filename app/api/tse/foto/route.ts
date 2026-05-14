export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

const fotoCache = new Map<string, { fotoUrl: string | null; expiresAt: number }>();

function norm(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

// Código da eleição por cargo (usado na URL da foto)
function codigoEleicaoPorCargo(uf: string, cargo: string): string {
  const c = cargo.toUpperCase();
  if (c.includes('PRESIDENTE'))       return 'BR0001';
  if (c.includes('GOVERNADOR'))       return `${uf}0006`;
  if (c.includes('SENADOR'))          return `${uf}0005`;
  if (c.includes('FEDERAL'))          return `${uf}0004`;
  if (c.includes('ESTADUAL'))         return `${uf}0002`;
  if (c.includes('DISTRITAL'))        return `${uf}0002`;
  // Vereador / Prefeito: retorna null para indicar que precisamos do cdEleicao da API
  return '';
}

// GET /api/tse/foto?nome=TARCISIO&ano=2022&uf=SP&cargo=DEPUTADO+ESTADUAL
// Parâmetro ?debug=1 retorna o payload cru do TSE para diagnóstico
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ fotoUrl: null }, { status: 401 });

  const nome  = request.nextUrl.searchParams.get('nome');
  const ano   = request.nextUrl.searchParams.get('ano')   || '2022';
  const uf    = request.nextUrl.searchParams.get('uf')    || 'BR';
  const cargo = request.nextUrl.searchParams.get('cargo') || '';
  const debug = request.nextUrl.searchParams.get('debug') === '1';

  if (!nome) return NextResponse.json({ fotoUrl: null });

  const cacheKey = `${nome}|${ano}|${uf}`.toLowerCase();
  if (!debug) {
    const cached = fotoCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({ fotoUrl: cached.fotoUrl });
    }
  }

  const store = (fotoUrl: string | null, ttlMs: number) => {
    if (!debug) fotoCache.set(cacheKey, { fotoUrl, expiresAt: Date.now() + ttlMs });
    return NextResponse.json({ fotoUrl });
  };

  // Tenta buscar em dois escopos: município=0 (todos) e, se vazio, tenta 'BR'
  const scopes = uf === 'BR' ? [{ ano, uf: 'BR', municipio: '0' }]
    : [
        { ano, uf, municipio: '0' },
        { ano, uf: 'BR', municipio: '0' },
      ];

  for (const scope of scopes) {
    const tseUrl =
      `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar` +
      `/${scope.ano}/${scope.uf}/${scope.municipio}/candidatos` +
      `?nome=${encodeURIComponent(nome)}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(tseUrl, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; AdminHub/1.0)',
        },
      }).finally(() => clearTimeout(timeout));

      if (!res.ok) {
        console.error(`TSE foto API ${res.status} for ${tseUrl}`);
        continue;
      }

      const data = await res.json();

      // Modo debug: devolve o payload cru sem construir URL
      if (debug) {
        const primeiros = (data.candidatos ?? []).slice(0, 3);
        return NextResponse.json({ tseUrl, candidatos: primeiros, rawKeys: primeiros[0] ? Object.keys(primeiros[0]) : [] });
      }

      const candidatos: any[] = data.candidatos ?? [];
      if (!candidatos.length) continue;

      const normNome = norm(nome);
      const best =
        candidatos.find(c => norm(c.nomeUrna || c.nome || '').includes(normNome)) ??
        candidatos.find(c => norm(c.nome || '').includes(normNome)) ??
        candidatos[0];

      const sqcand = best?.sqcand ?? best?.id;
      const foto   = best?.fotoCandidato ?? best?.foto ?? best?.nrFoto;
      if (!sqcand || !foto) continue;

      // Usa cdEleicao da resposta se disponível; caso contrário infere pelo cargo
      const cdEleicaoApi = best?.cdEleicao ?? best?.idEleicao ?? best?.codigoEleicao;
      const cdEleicao = cdEleicaoApi || codigoEleicaoPorCargo(scope.uf, cargo) || `${scope.uf}0002`;

      const fotoUrl =
        `https://divulgacandcontas.tse.jus.br/candidaturas/oficial` +
        `/${scope.ano}/BR/${cdEleicao}/${sqcand}/fotos/${foto}`;

      return store(fotoUrl, 24 * 60 * 60 * 1000);
    } catch (e: any) {
      console.error('TSE foto fetch error:', e?.message ?? e);
      continue;
    }
  }

  return store(null, 30 * 60 * 1000);
}
