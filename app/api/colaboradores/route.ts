export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exigirAcesso } from '@/lib/acesso-api';
import { z } from 'zod';
import { lerCorpo, v } from '@/lib/validacao-api';
import { PERMISSIONS } from '@/lib/permissions';
import { derivarZonasDeRas, derivarRasDeZonas } from '@/lib/colaboradores-zonas';

const NovoColaborador = z.object({
  nome:       v.texto('o nome', 200),
  telefone:   v.textoOpcional('o telefone', 40),
  email:      v.textoOpcional('o e-mail', 254),
  endereco:   v.textoOpcional('o endereço', 500),
  lat:        v.latitude(),
  lng:        v.longitude(),
  funcao:     v.textoOpcional('a função', 200),
  padrinhoId: v.idOpcional('o padrinho'),
  observacao: v.textoOpcional('a observação', 20000),
  status:     v.textoOpcional('o status', 20),
  cor:        v.textoOpcional('a cor', 30),
  regioes:    v.lista('as regiões', v.texto('a região', 200), 500).nullish(),
  // Números de zona, como texto ("1", "3").
  zonas:      v.lista('as zonas', v.texto('a zona', 20), 500).nullish(),
}).passthrough();

const SELECT = {
  id: true, nome: true, telefone: true, email: true,
  endereco: true, lat: true, lng: true, funcao: true,
  observacao: true, status: true, cor: true, padrinhoId: true,
  padrinho: { select: { id: true, nome: true, cargo: true, partido: true } },
  regioes: { select: { id: true, regiaoNome: true, uf: true, tipo: true } },
  createdAt: true,
} as const;

export async function GET(request: NextRequest) {
  try {
    const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.COLABORADORES_CAMPANHA], gabinete: 'banco' });
    if (acesso instanceof NextResponse) return acesso;
    const { gabineteId } = acesso;

    const colaboradores = await prisma.colaborador.findMany({
      where: { gabineteId },
      select: SELECT,
      orderBy: { nome: 'asc' },
    });

    return NextResponse.json(colaboradores);
  } catch (error) {
    console.error('GET /api/colaboradores error:', error);
    return NextResponse.json({ error: 'Erro ao buscar colaboradores' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.COLABORADORES_CAMPANHA], gabinete: 'banco' });
    if (acesso instanceof NextResponse) return acesso;
    const { userId, gabineteId } = acesso;

    const body = await lerCorpo(request, NovoColaborador);
    if (body instanceof NextResponse) return body;
    const { nome, telefone, email, endereco, lat, lng, funcao, padrinhoId, observacao, status, cor, regioes, zonas } = body ?? {};

    if (!nome?.trim()) return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });

    // Se um padrinho for atribuído, usa a cor dele (a menos que uma cor explícita tenha sido enviada)
    //
    // A busca é por id E gabinete: o id vem do corpo da requisição, e aceitá-lo
    // sem conferir o dono gravava no colaborador a referência a um padrinho de
    // OUTRO gabinete. A listagem devolve `padrinho { nome, cargo, partido }`,
    // então o nome alheio apareceria na tela deste gabinete.
    let corFinal = cor || '#8b5cf6';
    if (padrinhoId) {
      const padrinho = await prisma.padrinho.findFirst({
        where: { id: padrinhoId, gabineteId },
        select: { cor: true },
      });
      if (!padrinho) {
        return NextResponse.json({ error: 'Padrinho não encontrado neste gabinete.' }, { status: 400 });
      }
      if (!cor && padrinho.cor) corFinal = padrinho.cor;
    }

    const raNames: string[] = Array.isArray(regioes) ? regioes : [];
    const zonaStrings: string[] = Array.isArray(zonas) ? zonas : [];
    const raItems = raNames.map((r: string) => ({ uf: 'DF', regiaoNome: r, tipo: 'RA' }));
    const raItemsAutoDeZonas = derivarRasDeZonas(zonaStrings); // RA derivada das zonas selecionadas
    const zonaItemsManual = zonaStrings.map((z: string) => ({ uf: 'DF', regiaoNome: `Zona ${z}`, tipo: 'ZONA' }));
    const zonaItemsAuto = derivarZonasDeRas(raNames);
    // Merge e deduplica por nome
    const allRas = [...raItems, ...raItemsAutoDeZonas].filter(
      (r, i, arr) => arr.findIndex(x => x.regiaoNome === r.regiaoNome) === i
    );
    const allZonas = [...zonaItemsManual, ...zonaItemsAuto].filter(
      (z, i, arr) => arr.findIndex(x => x.regiaoNome === z.regiaoNome) === i
    );
    const allRegioes = [...allRas, ...allZonas];

    const colaborador = await prisma.colaborador.create({
      data: {
        nome: nome.trim(),
        telefone: telefone?.trim() || null,
        email: email?.trim() || null,
        endereco: endereco?.trim() || null,
        lat: lat ?? null,
        lng: lng ?? null,
        funcao: funcao?.trim() || null,
        observacao: observacao?.trim() || null,
        status: status === 'INATIVO' ? 'INATIVO' : 'ATIVO',
        cor: corFinal,
        padrinhoId: padrinhoId || null,
        gabineteId,
        createdById: userId,
        regioes: allRegioes.length > 0 ? { create: allRegioes } : undefined,
      },
      select: SELECT,
    });

    return NextResponse.json(colaborador, { status: 201 });
  } catch (error) {
    console.error('POST /api/colaboradores error:', error);
    return NextResponse.json({ error: 'Erro ao criar colaborador' }, { status: 500 });
  }
}
