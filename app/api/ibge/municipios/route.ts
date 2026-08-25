export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

// Regiões Administrativas oficiais do DF (33 RAs)
const DF_REGIOES_ADMINISTRATIVAS = [
  'Águas Claras', 'Arniqueira', 'Asa Norte', 'Asa Sul',
  'Brazlândia', 'Candangolândia', 'Ceilândia', 'Cruzeiro',
  'Estrutural / SCIA', 'Fercal', 'Gama', 'Guará',
  'Itapoã', 'Jardim Botânico', 'Lago Norte', 'Lago Sul',
  'Núcleo Bandeirante', 'Octogonal', 'Park Way', 'Paranoá',
  'Planaltina', 'Plano Piloto', 'Recanto das Emas', 'Riacho Fundo',
  'Riacho Fundo II', 'Samambaia', 'Santa Maria', 'São Sebastião',
  'SIA', 'Sobradinho', 'Sobradinho II', 'Sol Nascente / Pôr do Sol',
  'Sudoeste / Octogonal', 'Taguatinga', 'Varjão', 'Vicente Pires',
].sort((a, b) => a.localeCompare(b, 'pt-BR'));

export async function GET(request: NextRequest) {
  // Exige sessão: sem isto a rota é um proxy ABERTO para as APIs
  // externas. O dado é público, mas a infraestrutura é nossa — qualquer
  // um poderia consumir banda e invocações de função da conta.
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const uf = searchParams.get('uf')?.toUpperCase() ?? '';

    if (!uf) {
      return NextResponse.json({ error: 'UF é obrigatório' }, { status: 400 });
    }

    // DF: IBGE só retorna "Brasília" — usamos as RAs oficiais no lugar
    if (uf === 'DF') {
      const municipios = DF_REGIOES_ADMINISTRATIVAS.map((nome, i) => ({ id: 5300108 + i, nome }));
      return NextResponse.json(municipios);
    }

    const ufCodes: Record<string, number> = {
      'AC': 12, 'AL': 27, 'AP': 16, 'AM': 13, 'BA': 29, 'CE': 23,
      'ES': 32, 'GO': 52, 'MA': 21, 'MT': 51, 'MS': 50, 'MG': 31, 'PA': 15,
      'PB': 25, 'PR': 41, 'PE': 26, 'PI': 22, 'RJ': 33, 'RN': 24, 'RS': 43,
      'RO': 11, 'RR': 14, 'SC': 42, 'SP': 35, 'SE': 28, 'TO': 17
    };

    const ufCode = ufCodes[uf];
    if (!ufCode) {
      return NextResponse.json({ error: 'UF inválido' }, { status: 400 });
    }

    const res = await fetch(
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${ufCode}/municipios`,
      { next: { revalidate: 86400 } }
    );

    if (!res.ok) throw new Error('Erro ao buscar municípios');

    const data = await res.json();
    const municipios = (data ?? [])
      .map((m: any) => ({ id: m?.id ?? 0, nome: m?.nome ?? '' }))
      .sort((a: any, b: any) => (a?.nome ?? '').localeCompare(b?.nome ?? '', 'pt-BR'));

    return NextResponse.json(municipios);
  } catch (error) {
    console.error('IBGE municipios error:', error);
    return NextResponse.json({ error: 'Erro ao buscar municípios' }, { status: 500 });
  }
}
