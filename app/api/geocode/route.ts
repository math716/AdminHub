export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { ancoraDoGabinete, type Ancora } from '@/lib/geocode';

// Cache em memória: chave → { results, expiresAt }
const geocodeCache = new Map<string, { results: unknown[]; expiresAt: number }>();
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 horas

/** Faixa em graus ao redor do gabinete usada para enviesar a busca (~130 km). */
const VIEWBOX_GRAUS = 1.2;

// Proxy para o Nominatim (OpenStreetMap) — sem custo, sem chave.
// GET /api/geocode?address=Rua+das+Flores+123
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const address = request.nextUrl.searchParams.get('address');
  if (!address) return NextResponse.json({ error: 'Parâmetro address obrigatório' }, { status: 400 });

  // estrito=1 (importação em lote): descarta resultado longe demais da região
  // do gabinete, em vez de só reordenar. Aqui ninguém está conferindo endereço
  // por endereço, então um homônimo de outro estado passaria batido.
  const estrito = request.nextUrl.searchParams.get('estrito') === '1';

  const gabineteId = (session.user as any)?.gabineteId as string | undefined;

  // A âncora entra na chave: o mesmo endereço deve resolver diferente para
  // gabinetes de estados diferentes.
  const ancora = gabineteId ? await ancoraDoGabinete(gabineteId).catch(() => undefined) : undefined;
  // `estrito` entra na chave: o modo solto e o estrito podem devolver
  // resultados diferentes para o mesmo endereço.
  const cacheKey = `${address.toLowerCase().trim()}|${ancora ? `${ancora.lat.toFixed(2)},${ancora.lng.toFixed(2)}` : ''}|${estrito ? 'e' : ''}`;
  const cached = geocodeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ results: cached.results });
  }

  try {
    // limit alto de propósito: o Nominatim ordena por semelhança de NOME, não
    // por proximidade. "Prefeitura de São Paulo" devolvia a prefeitura de São
    // José do Rio Preto, porque ele lê "São Paulo" como o estado. Buscamos
    // vários e reordenamos pelo mais perto de onde o gabinete atua.
    let url = 'https://nominatim.openstreetmap.org/search'
      + `?format=json&limit=15&addressdetails=1&countrycodes=br&q=${encodeURIComponent(address)}`;
    if (ancora) {
      const v = [
        ancora.lng - VIEWBOX_GRAUS, ancora.lat + VIEWBOX_GRAUS,
        ancora.lng + VIEWBOX_GRAUS, ancora.lat - VIEWBOX_GRAUS,
      ].map(n => n.toFixed(4)).join(',');
      url += `&viewbox=${v}`;
    }

    const res = await fetch(url, {
      headers: { 'User-Agent': 'AdminHub/1.0 (gabinete@adminhub.app)' },
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Falha ao consultar geocodificação' }, { status: 502 });
    }

    const data: any[] = await res.json();
    let results = data.map((item) => ({
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      displayName: item.display_name,
      endereco: [
        item.address?.road,
        item.address?.house_number,
        item.address?.suburb || item.address?.neighbourhood,
        item.address?.city || item.address?.town || item.address?.village,
        item.address?.state,
      ]
        .filter(Boolean)
        .join(', '),
    })).filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lng));

    // No formulário NÃO descartamos os distantes: a pessoa está digitando de
    // propósito e pode marcar um compromisso em outro estado. Só reordenamos, e
    // a tela mostra o endereço encontrado para ela conferir. Em lote (estrito),
    // o corte volta.
    if (ancora) {
      results = results
        .map(r => ({ ...r, _km: distanciaKm(ancora, r) }))
        .sort((a, b) => a._km - b._km)
        .filter(r => !estrito || r._km <= 150)
        .map(({ _km, ...r }) => r);
    }
    results = results.slice(0, 5);

    geocodeCache.set(cacheKey, { results, expiresAt: Date.now() + CACHE_TTL_MS });
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: 'Erro ao geocodificar endereço' }, { status: 500 });
  }
}

function distanciaKm(a: Ancora, b: { lat: number; lng: number }): number {
  const R = 6371;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
