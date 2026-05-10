export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

// Proxy para Nominatim (OpenStreetMap) — sem custo, sem API key
// GET /api/geocode?address=Rua+das+Flores+123,+São+Paulo
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const address = request.nextUrl.searchParams.get('address');
  if (!address) return NextResponse.json({ error: 'Parâmetro address obrigatório' }, { status: 400 });

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=1&countrycodes=br&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'AdminHub/1.0 (gabinete@adminhub.app)' },
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Falha ao consultar geocodificação' }, { status: 502 });
    }

    const data: any[] = await res.json();
    const results = data.map((item) => ({
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
    }));

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: 'Erro ao geocodificar endereço' }, { status: 500 });
  }
}
