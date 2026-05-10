export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

const UF_CODES: Record<string, number> = {
  'AC': 12, 'AL': 27, 'AP': 16, 'AM': 13, 'BA': 29, 'CE': 23, 'DF': 53,
  'ES': 32, 'GO': 52, 'MA': 21, 'MT': 51, 'MS': 50, 'MG': 31, 'PA': 15,
  'PB': 25, 'PR': 41, 'PE': 26, 'PI': 22, 'RJ': 33, 'RN': 24, 'RS': 43,
  'RO': 11, 'RR': 14, 'SC': 42, 'SP': 35, 'SE': 28, 'TO': 17
};

export async function GET(request: NextRequest) {
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
    return NextResponse.json(data);
  } catch (error) {
    console.error('IBGE GeoJSON error:', error);
    return NextResponse.json({ error: 'Erro ao buscar dados geográficos' }, { status: 500 });
  }
}
