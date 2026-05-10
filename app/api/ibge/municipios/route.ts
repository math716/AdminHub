export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const uf = searchParams.get('uf');

    if (!uf) {
      return NextResponse.json({ error: 'UF é obrigatório' }, { status: 400 });
    }

    const ufCodes: Record<string, number> = {
      'AC': 12, 'AL': 27, 'AP': 16, 'AM': 13, 'BA': 29, 'CE': 23, 'DF': 53,
      'ES': 32, 'GO': 52, 'MA': 21, 'MT': 51, 'MS': 50, 'MG': 31, 'PA': 15,
      'PB': 25, 'PR': 41, 'PE': 26, 'PI': 22, 'RJ': 33, 'RN': 24, 'RS': 43,
      'RO': 11, 'RR': 14, 'SC': 42, 'SP': 35, 'SE': 28, 'TO': 17
    };

    const ufCode = ufCodes[uf?.toUpperCase?.() ?? ''];
    if (!ufCode) {
      return NextResponse.json({ error: 'UF inválido' }, { status: 400 });
    }

    const res = await fetch(
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${ufCode}/municipios`,
      { next: { revalidate: 86400 } }
    );

    if (!res.ok) {
      throw new Error('Erro ao buscar municípios');
    }

    const data = await res.json();
    const municipios = (data ?? [])?.map?.((m: any) => ({
      id: m?.id ?? 0,
      nome: m?.nome ?? ''
    }))?.sort?.((a: any, b: any) => (a?.nome ?? '')?.localeCompare?.(b?.nome ?? '', 'pt-BR')) ?? [];

    return NextResponse.json(municipios);
  } catch (error) {
    console.error('IBGE municipios error:', error);
    return NextResponse.json({ error: 'Erro ao buscar municípios' }, { status: 500 });
  }
}
