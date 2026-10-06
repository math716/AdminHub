import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { anoValido, ufValida } from '@/lib/tse-params';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { loadStaticTseData, loadLocaisTse, loadSecaoMunicipio, votosDoCandidatoPorLocal } from '@/lib/tse-static';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
interface LocalJson {
  municipio: string;
  zona: number;
  codLocal: string;
  nome: string;
  endereco: string;
  bairro: string;
  lat: number | null;
  lng: number | null;
}

interface CandidatoZona {
  municipio: string;
  zona: number;
  votos: number;
}

interface CandidatoJson {
  id: string;
  nome: string;
  nomeUrna: string;
  cargo: string;
  numero: number | null;
  zonas: CandidatoZona[];
}

// ---------------------------------------------------------------------------
// Cache em memória
// ---------------------------------------------------------------------------
const locaisCache = new Map<string, LocalJson[]>();
const candCache   = new Map<string, CandidatoJson[]>();

function readGz(base: string): string | null {
  try {
    if (fs.existsSync(base + '.json.gz'))
      return zlib.gunzipSync(fs.readFileSync(base + '.json.gz') as any).toString('utf8');
    if (fs.existsSync(base + '.json'))
      return fs.readFileSync(base + '.json', 'utf8');
  } catch { /* ignore */ }
  return null;
}

async function loadLocais(uf: string): Promise<LocalJson[] | null> {
  return (await loadLocaisTse(uf)) as unknown as LocalJson[] | null;
}

async function loadCandidatos(ano: string, uf: string, turno = 1): Promise<CandidatoJson[] | null> {
  // Delegado a lib/tse-static: a base do TSE e buscada por HTTP, e nao
  // lida do disco, para nao viajar dentro da funcao serverless.
  return (await loadStaticTseData(ano, uf, turno)) as unknown as CandidatoJson[] | null;
}

function normalizar(s: string): string {
  return s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`´]/g, ' ').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// GET /api/tse/bairros?municipio=X&uf=Y[&candidatoId=Z&ano=2024]
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const municipio   = searchParams.get('municipio');
  const uf          = searchParams.get('uf')?.toUpperCase();
  const candidatoId = searchParams.get('candidatoId');
  const nome        = searchParams.get('nome');
  const ano         = searchParams.get('ano');
  // 1º ou 2º turno. O 2º só existe onde houve (governador, presidente, prefeito).
  const turno       = searchParams.get('turno') === '2' ? 2 : 1;

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  if (!municipio || !uf) {
    return NextResponse.json({ error: 'Parâmetros obrigatórios: municipio, uf' }, { status: 400 });
  }

  if (!ufValida(uf)) return NextResponse.json({ error: 'UF inválida' }, { status: 400 });
  // `ano` só é usado para acessar arquivos de candidatos (loadCandidatos) — valida apenas nesse caso.
  // Quando `ano` é passado sem candidatoId/nome, ele não entra em nenhum caminho de arquivo,
  // portanto não há risco de path traversal e não deve ser rejeitado (ex: projeções ano=2026).
  if (ano && (candidatoId || nome) && !anoValido(ano)) {
    return NextResponse.json({ error: 'Ano inválido' }, { status: 400 });
  }

  const locais = await loadLocais(uf);
  if (!locais) {
    return NextResponse.json({ bairros: [], total: 0, message: 'Dados de locais não disponíveis para esta UF' });
  }

  const munNorm = normalizar(municipio);
  const locaisMun = locais.filter(l => normalizar(l.municipio) === munNorm);

  if (locaisMun.length === 0) {
    return NextResponse.json({ bairros: [], total: 0, message: 'Município não encontrado nos locais de votação' });
  }

  // ── Votos por zona (se candidato informado) ─────────────────────────────
  const votosPorZona = new Map<number, number>();

  if (ano && (candidatoId || nome)) {
    const candidatos = await loadCandidatos(ano, uf, turno);
    let cand: CandidatoJson | undefined;

    if (candidatos) {
      if (candidatoId) {
        cand = candidatos.find(c => c.id === candidatoId);
      } else if (nome) {
        const q = normalizar(nome);
        cand = candidatos.find(c => normalizar(c.nomeUrna).includes(q) || normalizar(c.nome).includes(q));
        if (!cand) {
          const palavras = q.split(' ').filter(p => p.length > 2);
          if (palavras.length > 0) {
            cand = candidatos.find(c => {
              const nu = normalizar(c.nomeUrna);
              const nm = normalizar(c.nome);
              return palavras.every(p => nu.includes(p) || nm.includes(p));
            });
          }
        }
      }
    }

    // Fallback: candidatos nacionais (presidente/senado) estão em BR.json mas não em UF.json
    if (!cand && candidatoId) {
      const brCandidatos = await loadCandidatos(ano, 'BR', turno);
      if (brCandidatos) {
        cand = brCandidatos.find(c => c.id === candidatoId);
      }
    }

    // ── Votos REAIS por local de votação, quando o arquivo de seção existe ──
    // Antes era sempre a estimativa abaixo (votos da zona divididos pelas
    // seções), e o pino do bairro ficava na média das coordenadas das escolas.
    if (cand) {
      const secao = await loadSecaoMunicipio(ano, turno, uf, municipio);
      const votosLocal = secao ? votosDoCandidatoPorLocal(secao, cand.cargo, cand.numero) : null;
      // Só vale como voto real se a soma dos locais bate com o total oficial do
      // candidato na cidade. Não bate onde o TSE juntou uma eleição suplementar
      // (outra data, mesmo número) ao arquivo do ano — aí fica a estimativa.
      const doMunicipio = cand.zonas.filter(z => normalizar(z.municipio) === munNorm);
      const confere = !votosLocal || cand.zonas.length === 0 ||
        [...votosLocal.values()].reduce((s, v) => s + v, 0) === doMunicipio.reduce((s, z) => s + z.votos, 0);
      if (secao && votosLocal && confere) return NextResponse.json(bairrosReais(municipio, uf, secao, votosLocal));
    }

    if (cand) {
      for (const z of cand.zonas) {
        if (normalizar(z.municipio) === munNorm) {
          votosPorZona.set(z.zona, (votosPorZona.get(z.zona) ?? 0) + z.votos);
        }
      }
    }
  }

  // ── Agrupar locais por bairro ───────────────────────────────────────────
  const bairroMap = new Map<string, {
    lats: number[];
    lngs: number[];
    zonas: Set<number>;
    locais: Array<{ codLocal: string; nome: string; endereco: string; zona: number; lat: number | null; lng: number | null }>;
  }>();

  for (const l of locaisMun) {
    const bairroNome = l.bairro?.trim() || 'SEM BAIRRO';
    if (!bairroMap.has(bairroNome)) {
      bairroMap.set(bairroNome, { lats: [], lngs: [], zonas: new Set(), locais: [] });
    }
    const acc = bairroMap.get(bairroNome)!;
    acc.zonas.add(l.zona);
    acc.locais.push({ codLocal: l.codLocal, nome: l.nome, endereco: l.endereco, zona: l.zona, lat: l.lat, lng: l.lng });

    const validCoord = l.lat && l.lng && l.lat >= -35 && l.lat <= 5 && l.lng >= -74 && l.lng <= -35;
    if (validCoord) { acc.lats.push(l.lat!); acc.lngs.push(l.lng!); }
  }

  // ── Se há votos por zona, distribuir pelos locais de cada bairro ────────
  // Estratégia: votos da zona / total locais naquela zona no município
  const locaisPorZonaCount = new Map<number, number>();
  for (const l of locaisMun) {
    locaisPorZonaCount.set(l.zona, (locaisPorZonaCount.get(l.zona) ?? 0) + 1);
  }

  // votos por local = votos da zona / nº locais na zona
  const votosPorLocal = new Map<string, number>(); // key = `${zona}-${codLocal}`
  for (const [zona, votos] of votosPorZona) {
    const total = locaisPorZonaCount.get(zona) ?? 1;
    const vpp = votos / total;
    for (const l of locaisMun) {
      if (l.zona === zona) {
        votosPorLocal.set(`${zona}-${l.codLocal}`, vpp);
      }
    }
  }

  // ── Montar resposta ─────────────────────────────────────────────────────
  type LocalEntry = { codLocal: string; nome: string; endereco: string; zona: number; lat: number | null; lng: number | null };
  const bairros: Array<{
    nome: string; lat: number; lng: number;
    totalLocais: number; votos: number;
    locais: LocalEntry[];
  }> = [];

  for (const [nome, acc] of bairroMap) {
    if (acc.lats.length === 0) continue;

    const lat = acc.lats.reduce((s, v) => s + v, 0) / acc.lats.length;
    const lng = acc.lngs.reduce((s, v) => s + v, 0) / acc.lngs.length;

    // Somar votos de todos os locais deste bairro
    let votosTotal = 0;
    for (const local of acc.locais) {
      votosTotal += votosPorLocal.get(`${local.zona}-${local.codLocal}`) ?? 0;
    }

    bairros.push({
      nome,
      lat,
      lng,
      totalLocais: acc.locais.length,
      votos: Math.round(votosTotal),
      locais: acc.locais,
    });
  }

  bairros.sort((a, b) => b.votos - a.votos || b.totalLocais - a.totalLocais);

  // `estimativa`: votos da zona repartidos pelas seções — não é o voto real do
  // bairro. A tela avisa. Sem candidato, não há voto nenhum.
  return NextResponse.json({
    municipio, uf, bairros, total: bairros.length,
    ...(votosPorZona.size > 0 && { fonte: 'estimativa' }),
  });
}

// ---------------------------------------------------------------------------
// Bairros a partir dos votos reais por local (arquivo de seção do TSE)
// ---------------------------------------------------------------------------
function bairrosReais(
  municipio: string, uf: string,
  secao: import('@/lib/tse-static').SecaoMunicipio,
  votosLocal: Map<number, number>,
) {
  type Local = { codLocal: string; nome: string; endereco: string; zona: number; lat: number | null; lng: number | null; secoes: number; votos: number };
  const porBairro = new Map<string, Local[]>();
  secao.locais.forEach((l, i) => {
    const nome = l.b || 'SEM BAIRRO';
    const lista = porBairro.get(nome) ?? [];
    lista.push({ codLocal: l.l, nome: l.n, endereco: l.e, zona: l.z, lat: l.lat, lng: l.lng, secoes: l.s, votos: votosLocal.get(i) ?? 0 });
    porBairro.set(nome, lista);
  });

  const bairros = [...porBairro.entries()].map(([nome, locais]) => {
    // Referência do bairro: o local onde o candidato teve mais votos (um
    // endereço real), e não a média das coordenadas — que caía no meio da
    // rua, onde não há escola.
    const comCoord = locais.filter(l => l.lat != null && l.lng != null);
    const ref = [...comCoord].sort((a, b) => b.votos - a.votos)[0];
    return {
      nome,
      lat: ref?.lat ?? null,
      lng: ref?.lng ?? null,
      totalLocais: locais.length,
      votos: locais.reduce((s, l) => s + l.votos, 0),
      locais: locais.sort((a, b) => b.votos - a.votos),
    };
  });
  // Bairro cujos locais vieram do TSE sem coordenada fica na lista (sem pino
  // no mapa): os votos dele são reais e entram no total do município.

  bairros.sort((a, b) => b.votos - a.votos || b.totalLocais - a.totalLocais);
  return { municipio, uf, bairros, total: bairros.length, fonte: 'secao' as const };
}
