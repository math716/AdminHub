import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { anoValido, ufValida } from '@/lib/tse-params';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Tipos
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
}

interface ZonaLista {
  municipio: string;
  zona: number;
  votos: number;
}

interface MunicipioAgrupado {
  municipio: string;
  totalVotos: number;
  zonas: ZonaLista[];
}

// ---------------------------------------------------------------------------
// Cache em memória
// ---------------------------------------------------------------------------
const candCache = new Map<string, CandidatoJson[]>();

function readJsonFile(filePath: string): unknown | null {
  const gz = filePath + '.gz';
  try {
    if (fs.existsSync(gz))
      return JSON.parse(zlib.gunzipSync(fs.readFileSync(gz) as any).toString('utf8'));
    if (fs.existsSync(filePath))
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch { /* fall through */ }
  return null;
}

function loadCandidatos(ano: string, uf: string): CandidatoJson[] | null {
  const key = `${ano}-${uf}`;
  if (candCache.has(key)) return candCache.get(key)!;
  const fp = path.join(process.cwd(), 'public', 'data', 'tse', ano, `${uf}.json`);
  const d = readJsonFile(fp) as CandidatoJson[] | null;
  if (d) candCache.set(key, d);
  return d;
}

function normalizar(s: string): string {
  return s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`´]/g, ' ').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// GET /api/tse/zonas-lista
//   ?ano=2022&uf=SP&candidatoId=xxx
//   ?ano=2022&uf=SP&nome=João Silva
//   &municipio=CAMPINAS   (opcional — filtra por município)
//   &ordenar=votos|municipio|zona  (padrão: votos)
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const ano         = searchParams.get('ano');
    const uf          = searchParams.get('uf')?.toUpperCase();
    const candidatoId = searchParams.get('candidatoId');
    const nome        = searchParams.get('nome');
    const municipio   = searchParams.get('municipio');
    const ordenar     = searchParams.get('ordenar') ?? 'votos';

    if (!ano || !uf) {
      return NextResponse.json(
        { error: 'Parâmetros obrigatórios: ano, uf' },
        { status: 400 }
      );
    }

    if (!ufValida(uf)) return NextResponse.json({ error: 'UF inválida' }, { status: 400 });
    if (!anoValido(ano)) return NextResponse.json({ error: 'Ano inválido' }, { status: 400 });

    if (!candidatoId && !nome) {
      return NextResponse.json(
        { error: 'Informe candidatoId ou nome' },
        { status: 400 }
      );
    }

    // Carregar dados do estado
    const candidatos = loadCandidatos(ano, uf);
    if (!candidatos) {
      return NextResponse.json(
        { error: `Dados não disponíveis para ${uf}/${ano}` },
        { status: 404 }
      );
    }

    // Localizar candidato
    let cand: CandidatoJson | undefined;
    if (candidatoId) {
      cand = candidatos.find(c => c.id === candidatoId);
    } else if (nome) {
      const q = normalizar(nome);
      cand = candidatos.find(c =>
        normalizar(c.nomeUrna).includes(q) ||
        normalizar(c.nome).includes(q)
      );
    }

    if (!cand) {
      return NextResponse.json(
        { error: 'Candidato não encontrado' },
        { status: 404 }
      );
    }

    // Filtrar por município, se informado
    const munFiltro = municipio ? normalizar(municipio) : null;
    const zonasFiltradas = munFiltro
      ? cand.zonas.filter(z => normalizar(z.municipio) === munFiltro)
      : cand.zonas;

    // Agrupar por município → zona (somando duplicatas)
    const munMap = new Map<string, Map<number, number>>();
    for (const z of zonasFiltradas) {
      const munKey = normalizar(z.municipio);
      if (!munMap.has(munKey)) munMap.set(munKey, new Map());
      const zonaMap = munMap.get(munKey)!;
      zonaMap.set(z.zona, (zonaMap.get(z.zona) ?? 0) + z.votos);
    }

    // Construir lista agrupada por município
    const municipiosAgrupados: MunicipioAgrupado[] = [];
    for (const [munKey, zonaMap] of munMap) {
      // Pegar nome original (não normalizado) do primeiro registro
      const nomeOriginal = zonasFiltradas.find(
        z => normalizar(z.municipio) === munKey
      )?.municipio ?? munKey;

      const zonasArr: ZonaLista[] = Array.from(zonaMap.entries())
        .map(([zona, votos]) => ({ municipio: nomeOriginal, zona, votos }))
        .sort((a, b) => {
          if (ordenar === 'zona') return a.zona - b.zona;
          return b.votos - a.votos;
        });

      municipiosAgrupados.push({
        municipio: nomeOriginal,
        totalVotos: zonasArr.reduce((s, z) => s + z.votos, 0),
        zonas: zonasArr,
      });
    }

    // Ordenar municípios
    if (ordenar === 'municipio') {
      municipiosAgrupados.sort((a, b) => a.municipio.localeCompare(b.municipio));
    } else {
      municipiosAgrupados.sort((a, b) => b.totalVotos - a.totalVotos);
    }

    // Lista plana de zonas (para tabela)
    const listaPlana: ZonaLista[] = municipiosAgrupados.flatMap(m => m.zonas);

    const totalVotosGeral = municipiosAgrupados.reduce((s, m) => s + m.totalVotos, 0);
    const totalZonas = listaPlana.length;
    const totalMunicipios = municipiosAgrupados.length;

    return NextResponse.json({
      candidato: {
        id: cand.id,
        nome: cand.nome,
        nomeUrna: cand.nomeUrna,
        numero: cand.numero,
        partido: cand.partido,
        cargo: cand.cargo,
        situacao: cand.situacao,
        totalVotos: cand.totalVotos,
        uf,
        ano: parseInt(ano),
      },
      resumo: {
        totalVotos: totalVotosGeral,
        totalZonas,
        totalMunicipios,
        uf,
        ano: parseInt(ano),
        municipioFiltro: municipio ?? null,
      },
      municipios: municipiosAgrupados,
      zonas: listaPlana,
    });
  } catch (error) {
    console.error('Erro ao listar zonas:', error);
    return NextResponse.json(
      { error: 'Erro interno ao buscar dados de zonas' },
      { status: 500 }
    );
  }
}
