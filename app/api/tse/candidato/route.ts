export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { anoValido, ufValida } from '@/lib/tse-params';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { loadStaticTseData } from '@/lib/tse-static';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const UF_TO_CODE: Record<string, string> = {
  'AC': '12', 'AL': '27', 'AP': '16', 'AM': '13', 'BA': '29', 'CE': '23', 'DF': '53',
  'ES': '32', 'GO': '52', 'MA': '21', 'MT': '51', 'MS': '50', 'MG': '31', 'PA': '15',
  'PB': '25', 'PR': '41', 'PE': '26', 'PI': '22', 'RJ': '33', 'RN': '24', 'RS': '43',
  'RO': '11', 'RR': '14', 'SC': '42', 'SP': '35', 'SE': '28', 'TO': '17'
};

function normalizarTexto(t: string): string {
  return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function normalizarMunicipio(nome: string): string {
  return nome.toUpperCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`´']/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Leitura do arquivo JSON estático
// ---------------------------------------------------------------------------
interface CandidatoJson {
  id: string;
  nome: string;
  nomeUrna: string;
  numero: number | null;
  partido: string;
  cargo: string;
  situacao: string;
  totalVotos: number;
  votos: Record<string, number>;
  zonas: Array<{ municipio: string; zona: number; votos: number }>;
  // Presente apenas no BR.json.gz (pré-agregado)
  votosPorEstado?: Record<string, number>;
}

// Delegado a lib/tse-static, que busca a base do TSE por HTTP em vez de ler o
// disco — com fs.readFileSync o empacotador copiava os 211 MB da base para
// dentro desta função, que ficava em 245,6 MB contra um teto de 250 MB.
// O cache em memória vive lá, compartilhado com as demais rotas.
async function loadStaticData(ano: string, uf: string): Promise<CandidatoJson[] | null> {
  return (await loadStaticTseData(ano, uf)) as unknown as CandidatoJson[] | null;
}

// ---------------------------------------------------------------------------
// Busca de municípios no IBGE (para mapear nome → código IBGE)
// ---------------------------------------------------------------------------
async function getMunicipiosIBGE(uf: string) {
  try {
    const ufCode = UF_TO_CODE[uf];
    if (!ufCode) return { porNome: {}, porCodigo: {} };
    const response = await fetch(
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${ufCode}/municipios`,
      { next: { revalidate: 86400 * 7 } }
    );
    if (!response.ok) return { porNome: {}, porCodigo: {} };
    const data = await response.json();
    const porNome: Record<string, string> = {};
    const porCodigo: Record<string, string> = {};
    data.forEach((m: any) => {
      const norm = normalizarMunicipio(m.nome);
      porNome[norm] = String(m.id);
      porNome[m.nome.toUpperCase()] = String(m.id);
      porCodigo[String(m.id)] = m.nome;
    });
    return { porNome, porCodigo };
  } catch {
    return { porNome: {}, porCodigo: {} };
  }
}

// ---------------------------------------------------------------------------
// Construir resposta a partir do candidato JSON estático
// ---------------------------------------------------------------------------
async function montarResposta(cand: CandidatoJson, uf: string) {
  const { porNome: municipiosMap } = await getMunicipiosIBGE(uf);

  const votosPorMunicipio: Record<string, number> = {};
  const votosPorNomeMunicipio: Record<string, number> = {};
  const votosPorEstado: Record<string, number> = {};

  let totalVotosEstado = 0;
  for (const [mun, v] of Object.entries(cand.votos)) {
    votosPorNomeMunicipio[mun] = v;
    const norm = normalizarMunicipio(mun);
    const codigo = municipiosMap[norm] ?? municipiosMap[mun];
    if (codigo) votosPorMunicipio[codigo] = v;
    totalVotosEstado += v;
  }
  votosPorEstado[uf] = totalVotosEstado;

  return NextResponse.json({
    candidatoId: cand.id,
    candidateName: cand.nome,
    nomeUrna: cand.nomeUrna,
    numero: cand.numero,
    ano: parseInt(cand.id.split('-')[1] ?? '2022'),
    cargo: cand.cargo,
    partido: cand.partido,
    situacao: cand.situacao,
    uf,
    totalVotos: cand.totalVotos,
    votosPorMunicipio,
    votosPorNomeMunicipio,
    votosPorEstado,
    zonas: cand.zonas ?? [],
    fonte: 'Dados oficiais do TSE - Portal de Dados Abertos',
  });
}

// ---------------------------------------------------------------------------
// Construir resposta agregada para candidato nacional (uf=BR)
// ---------------------------------------------------------------------------
async function montarRespostaBrasil(candidato: string | null, candidatoId: string | null, ano: string) {
  // Carrega o arquivo BR.json.gz pré-agregado (gerado por scripts/gerar-br-json.ts)
  const brData = await loadStaticData(ano, 'BR');

  if (!brData || brData.length === 0) {
    return NextResponse.json(
      { error: `Dados nacionais de ${ano} não disponíveis. Execute scripts/gerar-br-json.ts.` },
      { status: 404 }
    );
  }

  const queryNorm = candidato ? normalizarTexto(candidato) : null;
  const palavras  = queryNorm ? queryNorm.split(' ').filter(p => p.length > 2) : [];

  let resultados: CandidatoJson[] = [];

  if (candidatoId) {
    const found = brData.find(c => c.id === candidatoId);
    if (found) resultados = [found];
  } else if (queryNorm) {
    // Busca exata
    resultados = brData.filter(c =>
      normalizarTexto(c.nomeUrna).includes(queryNorm) ||
      normalizarTexto(c.nome).includes(queryNorm)
    );
    // Busca por palavras
    if (resultados.length === 0 && palavras.length > 0) {
      resultados = brData.filter(c => {
        const nu = normalizarTexto(c.nomeUrna);
        const nm = normalizarTexto(c.nome);
        return palavras.every(p => nu.includes(p) || nm.includes(p));
      });
    }
  }

  if (resultados.length === 0) {
    return NextResponse.json(
      { error: `Candidato "${candidato}" não encontrado nos dados de ${ano}.`,
        dica: 'Busque pelo nome de urna (ex: LULA, BOLSONARO, TARCÍSIO).' },
      { status: 404 }
    );
  }

  // Múltiplos → lista para escolha
  if (resultados.length > 1 && !candidatoId) {
    const lista = resultados
      .sort((a, b) => b.totalVotos - a.totalVotos)
      .slice(0, 50)
      .map(c => ({
        id: c.id,
        nome: c.nome,
        nomeUrna: c.nomeUrna,
        numero: c.numero,
        partido: c.partido,
        cargo: c.cargo,
        totalVotos: c.totalVotos,
        municipioPrincipal: '',
      }));
    return NextResponse.json({
      multiplos: true,
      mensagem: `Encontramos ${lista.length} candidatos com "${candidato}". Selecione um:`,
      candidatos: lista,
    });
  }

  const cand = resultados[0];
  const votosPorEstado = cand.votosPorEstado ?? {};

  return NextResponse.json({
    candidatoId: cand.id,
    candidateName: cand.nome,
    nomeUrna: cand.nomeUrna,
    numero: cand.numero,
    ano: parseInt(ano),
    cargo: cand.cargo,
    partido: cand.partido,
    situacao: cand.situacao,
    uf: 'BR',
    totalVotos: cand.totalVotos,
    votosPorMunicipio: {},
    votosPorNomeMunicipio: {},
    votosPorEstado,
    fonte: 'Dados oficiais do TSE - Portal de Dados Abertos',
  });
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const candidato   = searchParams.get('candidato');
    const ano         = searchParams.get('ano') || '2022';
    const uf          = searchParams.get('uf');
    const candidatoId = searchParams.get('candidatoId');

    if (!uf) return NextResponse.json({ error: 'Selecione um estado para buscar candidatos' }, { status: 400 });
    if (!ufValida(uf)) return NextResponse.json({ error: 'UF inválida' }, { status: 400 });
    if (!anoValido(ano)) return NextResponse.json({ error: 'Ano inválido' }, { status: 400 });

    // ── Candidato nacional (presidente / federal) ─────────────────────────
    if (uf === 'BR') {
      return montarRespostaBrasil(candidato, candidatoId, ano);
    }

    const anoInt = parseInt(ano);

    // ── Tentar JSON estático ──────────────────────────────────────────────
    const staticData = await loadStaticData(ano, uf);

    if (staticData) {
      // Busca por ID específico
      if (candidatoId) {
        const found = staticData.find(c => c.id === candidatoId);
        if (!found) return NextResponse.json({ error: 'Candidato não encontrado' }, { status: 404 });
        return montarResposta(found, uf);
      }

      if (!candidato) return NextResponse.json({ error: 'Nome do candidato é obrigatório' }, { status: 400 });

      const queryNorm = normalizarTexto(candidato);
      const palavras  = queryNorm.split(' ').filter(p => p.length > 2);

      // Busca por nome de urna ou nome completo
      let resultados = staticData.filter(c =>
        normalizarTexto(c.nomeUrna).includes(queryNorm) ||
        normalizarTexto(c.nome).includes(queryNorm)
      );

      // Se não encontrou, busca por palavras individuais
      if (resultados.length === 0 && palavras.length > 0) {
        resultados = staticData.filter(c => {
          const nu = normalizarTexto(c.nomeUrna);
          const nm = normalizarTexto(c.nome);
          return palavras.every(p => nu.includes(p) || nm.includes(p));
        });
      }

      if (resultados.length === 0) {
        return NextResponse.json(
          { error: `Candidato "${candidato}" não encontrado para ${ano} em ${uf}.`,
            dica: 'Busque pelo nome de urna (ex: TARCÍSIO, LULA, BOLSONARO).' },
          { status: 404 }
        );
      }

      // Único resultado → retornar diretamente
      if (resultados.length === 1) {
        return montarResposta(resultados[0], uf);
      }

      // Múltiplos → retornar lista para o usuário escolher
      const lista = resultados
        .sort((a, b) => b.totalVotos - a.totalVotos)
        .slice(0, 50)          // limitar a 50 para não sobrecarregar a UI
        .map(c => ({
          id: c.id,
          nome: c.nome,
          nomeUrna: c.nomeUrna,
          numero: c.numero,
          partido: c.partido,
          cargo: c.cargo,
          totalVotos: c.totalVotos,
          municipioPrincipal: Object.entries(c.votos).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '',
        }));

      return NextResponse.json({
        multiplos: true,
        mensagem: `Encontramos ${lista.length} candidatos com "${candidato}". Selecione um:`,
        candidatos: lista,
      });
    }

    // Não encontrado nos arquivos estáticos
    return NextResponse.json(
      { error: `Candidato "${candidato ?? candidatoId}" não encontrado para ${ano} em ${uf}.` },
      { status: 404 }
    );

  } catch (error) {
    console.error('Erro na API de candidato:', error);
    return NextResponse.json({ error: 'Erro interno ao buscar candidato' }, { status: 500 });
  }
}
