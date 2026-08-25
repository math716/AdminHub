export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

const UF_CODES: Record<string, number> = {
  'AC': 12, 'AL': 27, 'AP': 16, 'AM': 13, 'BA': 29, 'CE': 23, 'DF': 53,
  'ES': 32, 'GO': 52, 'MA': 21, 'MT': 51, 'MS': 50, 'MG': 31, 'PA': 15,
  'PB': 25, 'PR': 41, 'PE': 26, 'PI': 22, 'RJ': 33, 'RN': 24, 'RS': 43,
  'RO': 11, 'RR': 14, 'SC': 42, 'SP': 35, 'SE': 28, 'TO': 17
};

export async function GET(request: NextRequest) {
  // Exige sessão: sem isto a rota é um proxy ABERTO para as APIs
  // externas. O dado é público, mas a infraestrutura é nossa — qualquer
  // um poderia consumir banda e invocações de função da conta.
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'brasil';
    const uf = searchParams.get('uf');

    let url: string;

    if (type === 'brasil') {
      url = 'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=UF';
    } else if (type === 'estado' && uf) {
      const ufCode = UF_CODES[uf?.toUpperCase?.() ?? ''];
      if (!ufCode) {
        return NextResponse.json({ error: 'UF inválido' }, { status: 400 });
      }
      url = `https://servicodados.ibge.gov.br/api/v3/malhas/estados/${ufCode}?formato=application/vnd.geo+json&qualidade=intermediaria&intrarregiao=municipio`;
    } else {
      return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });
    }

    const res = await fetch(url, { next: { revalidate: 86400 * 7 } });

    if (!res.ok) {
      throw new Error('Erro ao buscar GeoJSON');
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400' },
    });
  } catch (error) {
    console.error('IBGE GeoJSON error:', error);
    return NextResponse.json({ error: 'Erro ao buscar dados geográficos' }, { status: 500 });
  }
}
