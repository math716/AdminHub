export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { exigirAcesso } from '@/lib/acesso-api';
import { PERMISSIONS } from '@/lib/permissions';

// Lia as tabelas votos_zona e locais_votacao, que nunca receberam dados: os
// votos do TSE vêm dos arquivos estáticos (public/data/tse, ver
// lib/tse-static.ts). A resposta é a que sempre saiu — vazia —, mantida para
// a tela do Projeto de Campanha, que ainda consulta esta rota.
export async function GET(request: NextRequest) {
  const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.MAPA_ELEITORAL, PERMISSIONS.PROJETO_CAMPANHA] });
  if (acesso instanceof NextResponse) return acesso;

  const candidatoId = new URL(request.url).searchParams.get('candidatoId');
  if (!candidatoId) {
    return NextResponse.json({ error: 'candidatoId é obrigatório' }, { status: 400 });
  }
  return NextResponse.json({ candidatoId, totalVotos: 0, votosPorMunicipio: {}, zonasInfo: {} });
}
