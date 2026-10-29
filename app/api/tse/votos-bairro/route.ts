export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exigirAcesso } from '@/lib/acesso-api';
import { PERMISSIONS } from '@/lib/permissions';

export async function GET(request: NextRequest) {
  try {
    const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.MAPA_ELEITORAL, PERMISSIONS.PROJETO_CAMPANHA] });
    if (acesso instanceof NextResponse) return acesso;

    const { searchParams } = new URL(request.url);
    const candidatoId = searchParams.get('candidatoId');
    const municipio = searchParams.get('municipio');

    if (!candidatoId) {
      return NextResponse.json({ error: 'candidatoId é obrigatório' }, { status: 400 });
    }

    // Buscar o candidato para verificar se é vereador
    const candidato = await prisma.candidato.findUnique({
      where: { id: candidatoId },
      select: { id: true, cargo: true, uf: true, nome: true }
    });

    if (!candidato) {
      return NextResponse.json({ error: 'Candidato não encontrado' }, { status: 404 });
    }

    // Os votos por zona viriam da tabela votos_zona, que nunca recebeu dados
    // (os votos do TSE vêm dos arquivos estáticos). A resposta é a que sempre
    // saiu: vazia, mantida para a tela do Projeto de Campanha.
    return NextResponse.json({
      candidatoId,
      cargo: candidato.cargo,
      votosPorBairro: {},
      bairrosInfo: [],
      totalVotos: 0
    });
  } catch (error) {
    console.error('Erro ao buscar votos por bairro:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
