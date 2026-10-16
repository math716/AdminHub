'use client';

// Comparador de candidatos — dentro da cidade (fase 2).
//
// Três visões, com os votos REAIS de cada local de votação (arquivos de seção
// do TSE, via /api/tse/bairros):
//   - Locais de votação: cada escola com a cor de quem venceu ali;
//   - Bairros: escolas somadas por bairro. Nas cidades com polígonos (SP, RJ,
//     Fortaleza, DF e as do IBGE), o polígono inteiro é pintado — cada escola
//     entra no bairro em que está (ponto dentro do polígono), e os votos são os
//     reais dela, não a estimativa da zona repartida;
//   - Zonas: os votos oficiais de cada zona eleitoral da cidade.
//
// Candidato sem voto real por local nesta cidade (o TSE juntou ali uma eleição
// suplementar) fica fora de Locais e Bairros, com aviso — nunca entra com
// estimativa como se fosse resultado real. Em Zonas todos entram.

import { useEffect, useMemo, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { BuscaBairro } from '@/components/maps/busca-bairro';
import { FORA, carregarPoligonosCidade, indexarPoligonos, nomeDaLinhaFora, poligonoDoPonto, rotuloColunaDe, type PoligonosCidade } from '@/components/mapa/poligonos-cidade';
import {
  type CandidatoNaComparacao, type Linha, DestaquesComparacao, LegendaComparacao, PainelVitorias, PlacarComparacao, TabelaComparacao,
  corDoResultado, fmt, htmlComparacao, opacidadePorFolga, resultado, semAcento,
} from '@/components/mapa/comparacao-comum';
import { MapaCidadeComparacao, type PontoComparacao, type PoligonosComparacao } from '@/components/mapa/mapa-cidade-comparacao';
import { BotaoPdfComparacao } from '@/components/mapa/pdf-comparacao';
import { CartaoMapa, GradeMapa, Pilulas } from '@/components/mapa/comparacao-visual';

export interface CandidatoCidade extends CandidatoNaComparacao {
  zonas: Array<{ municipio: string; zona: number; votos: number }>;
}

interface LocalApi {
  codLocal: string; nome: string; endereco: string; zona: number;
  lat: number | null; lng: number | null; secoes?: number; votos?: number;
}
interface RespostaBairros { fonte?: 'secao' | 'estimativa'; bairros?: Array<{ nome: string; locais?: LocalApi[] }> }

interface LocalComp {
  chave: string; nome: string; endereco: string; bairro: string; zona: number;
  lat: number | null; lng: number | null;
  /** Votos de cada candidato com voto real por local (na ordem de `reais`). */
  votos: number[];
}

type Visao = 'locais' | 'bairros' | 'zonas';

export function ComparacaoCidade({ uf, municipio, ano, turno, cands, visaoInicial = 'locais' }: {
  uf: string;
  municipio: string;
  ano: string;
  turno: number;
  cands: CandidatoCidade[];
  /** O DF abre nas regiões administrativas. */
  visaoInicial?: Visao;
}) {
  const [visao, setVisao] = useState<Visao>(visaoInicial);
  const [respostas, setRespostas] = useState<Array<RespostaBairros | null> | null>(null);
  const [poligonosGeo, setPoligonosGeo] = useState<PoligonosCidade | null>(null);
  const [foco, setFoco] = useState<{ nonce: number; pontos: Array<[number, number]> } | null>(null);

  const chaveCands = cands.map(c => c.id).join(',');

  // Votos por local de cada candidato.
  useEffect(() => {
    let cancelado = false;
    setRespostas(null);
    Promise.all(cands.map(async c => {
      const p = new URLSearchParams({ municipio, uf, candidatoId: c.id, ano });
      if (turno === 2) p.set('turno', '2');
      try {
        const res = await fetch(`/api/tse/bairros?${p}`);
        return res.ok ? (await res.json()) as RespostaBairros : null;
      } catch { return null; }
    })).then(r => { if (!cancelado) setRespostas(r); });
    return () => { cancelado = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [municipio, uf, ano, turno, chaveCands]);

  // Polígonos de bairro, quando a cidade tem.
  useEffect(() => {
    let cancelado = false;
    setPoligonosGeo(null);
    carregarPoligonosCidade(uf, municipio).then(g => { if (!cancelado) setPoligonosGeo(g); });
    return () => { cancelado = true; };
  }, [uf, municipio]);

  // ── Locais, com os votos de quem tem dado real por local ──────────────────
  const { reais, semReal, locais } = useMemo(() => {
    const reais: number[] = [];
    const semReal: string[] = [];
    (respostas ?? []).forEach((r, i) => (r?.fonte === 'secao' ? reais.push(i) : semReal.push(cands[i]?.nome)));
    const porChave = new Map<string, LocalComp>();
    (respostas ?? []).forEach((r, i) => {
      const posReal = reais.indexOf(i);
      for (const b of r?.bairros ?? []) for (const l of b.locais ?? []) {
        const chave = `${l.zona}-${l.codLocal}`;
        let loc = porChave.get(chave);
        if (!loc) {
          loc = { chave, nome: l.nome, endereco: l.endereco, bairro: b.nome, zona: l.zona, lat: l.lat, lng: l.lng, votos: reais.map(() => 0) };
          porChave.set(chave, loc);
        }
        if (posReal >= 0) loc.votos[posReal] = l.votos ?? 0;
      }
    });
    return { reais, semReal: respostas ? semReal : [], locais: [...porChave.values()] };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [respostas]);

  const candsReais = reais.map(i => cands[i]);
  const coresReais = candsReais.map(c => c.cor);
  const cores = cands.map(c => c.cor);

  // Cada local → polígono em que está (só nas cidades com polígonos).
  const poligonoDoLocal = useMemo(() => {
    if (!poligonosGeo) return null;
    const indice = indexarPoligonos(poligonosGeo);
    const m = new Map<string, string>();
    for (const l of locais) m.set(l.chave, poligonoDoPonto(l.lat, l.lng, indice));
    return m;
  }, [poligonosGeo, locais]);

  const bairroDe = (l: LocalComp) => (poligonoDoLocal ? poligonoDoLocal.get(l.chave) ?? FORA : l.bairro || 'SEM BAIRRO');
  const rotuloBairros = poligonosGeo?.rotulo ?? 'bairros';
  // Local sem coordenada, ou na borda, fora de todos os polígonos: entra numa
  // linha própria em vez de sumir com os votos dele.
  const nomeDoBairro = (b: string) => (b === FORA ? nomeDaLinhaFora(rotuloBairros) : b);

  // ── Linhas de cada visão ───────────────────────────────────────────────────
  const linhasLocais: Linha[] = useMemo(() => locais.map(l => ({
    chave: l.chave, nome: l.nome, detalhe: `${l.endereco} · ${l.bairro} · Zona ${l.zona}`, votos: l.votos,
  })), [locais]);

  const linhasBairros: Linha[] = useMemo(() => {
    const soma = new Map<string, number[]>();
    for (const l of locais) {
      const b = bairroDe(l);
      const v = soma.get(b) ?? reais.map(() => 0);
      l.votos.forEach((x, i) => { v[i] += x; });
      soma.set(b, v);
    }
    return [...soma].map(([b, votos]) => ({ chave: b, nome: nomeDoBairro(b), votos }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locais, poligonoDoLocal]);

  const linhasZonas: Linha[] = useMemo(() => {
    const alvo = semAcento(municipio);
    const porZona = cands.map(c => {
      const m: Record<number, number> = {};
      for (const z of c.zonas) if (semAcento(z.municipio) === alvo) m[z.zona] = (m[z.zona] ?? 0) + z.votos;
      return m;
    });
    const zonas = new Set(porZona.flatMap(m => Object.keys(m).map(Number)));
    return [...zonas].map(z => ({ chave: String(z), nome: `Zona ${z}`, votos: porZona.map(m => m[z] ?? 0) }));
  }, [cands, municipio]);

  // Sem 2 candidatos com voto real por local, só a visão por zona faz sentido.
  const podeLocal = candsReais.length >= 2;
  const visaoEfetiva: Visao = podeLocal ? visao : 'zonas';
  const candsDaVisao = visaoEfetiva === 'zonas' ? cands : candsReais;
  const coresDaVisao = visaoEfetiva === 'zonas' ? cores : coresReais;
  const linhas = visaoEfetiva === 'locais' ? linhasLocais : visaoEfetiva === 'bairros' ? linhasBairros : linhasZonas;

  // ── Mapa ───────────────────────────────────────────────────────────────────
  const resultadoBairro = useMemo(() => new Map(linhasBairros.map(l => [l.chave, { l, r: resultado(l.votos) }])), [linhasBairros]);
  const resultadoZona = useMemo(() => new Map(linhasZonas.map(l => [Number(l.chave), { l, r: resultado(l.votos) }])), [linhasZonas]);

  const pontos: PontoComparacao[] = useMemo(() => {
    const comCoord = locais.filter(l => l.lat != null && l.lng != null);
    if (visaoEfetiva === 'bairros' && poligonosGeo) return [];
    return comCoord.map(l => {
      if (visaoEfetiva === 'locais') {
        const r = resultado(l.votos);
        return {
          chave: l.chave, lat: l.lat!, lng: l.lng!, cor: corDoResultado(r, coresReais), opacidade: r ? opacidadePorFolga(r.folga) : 0.2,
          html: r ? htmlComparacao(l.nome, `${l.bairro} · Zona ${l.zona}`, candsReais, l.votos, r, { sobre: 'Local de votação' }) : '',
        };
      }
      const alvo = visaoEfetiva === 'bairros' ? resultadoBairro.get(bairroDe(l)) : resultadoZona.get(l.zona);
      const r = alvo?.r ?? null;
      const titulo = visaoEfetiva === 'bairros' ? nomeDoBairro(bairroDe(l)) : `Zona ${l.zona}`;
      return {
        chave: l.chave, lat: l.lat!, lng: l.lng!,
        cor: corDoResultado(r, coresDaVisao), opacidade: r ? opacidadePorFolga(r.folga) : 0.2,
        html: r && alvo ? htmlComparacao(titulo, `Local: ${l.nome}`, candsDaVisao, alvo.l.votos, r, { sobre: visaoEfetiva === 'bairros' ? rotuloColunaDe(rotuloBairros) : 'Zona eleitoral' }) : '',
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locais, visaoEfetiva, resultadoBairro, resultadoZona, poligonosGeo]);

  const poligonos: PoligonosComparacao | null = visaoEfetiva === 'bairros' && poligonosGeo ? {
    geojson: poligonosGeo.geojson,
    nomeDe: poligonosGeo.nomeDe,
    aparencia: (nome: string) => {
      const x = resultadoBairro.get(nome);
      if (!x?.r) return null;
      return { cor: corDoResultado(x.r, coresReais), opacidade: opacidadePorFolga(x.r.folga), html: htmlComparacao(nome, null, candsReais, x.l.votos, x.r, { sobre: rotuloColunaDe(rotuloBairros) }) };
    },
  } : null;

  // ── Busca de bairro ────────────────────────────────────────────────────────
  const opcoesBusca = linhasBairros
    .filter(l => l.chave !== FORA)
    .map(l => ({ nome: l.nome, votos: l.votos.reduce((s, v) => s + v, 0) }));
  const escolherBairro = (nome: string) => {
    const pts = locais
      .filter(l => nomeDoBairro(bairroDe(l)) === nome && l.lat != null && l.lng != null)
      .map(l => [l.lat!, l.lng!] as [number, number]);
    if (pts.length) setFoco({ nonce: Date.now(), pontos: pts });
  };

  const carregando = !respostas;
  // Entra na versão do mapa: trocar o turno pode manter os mesmos locais.
  const somaVotos = locais.reduce((s, l) => s + l.votos.reduce((a, v) => a + v, 0), 0);
  const nomeArea = visaoEfetiva === 'locais' ? 'locais de votação' : visaoEfetiva === 'bairros' ? rotuloBairros : 'zonas';
  const rotuloArea = visaoEfetiva === 'locais' ? 'Local de votação' : visaoEfetiva === 'bairros'
    ? (rotuloBairros === 'distritos' ? 'Distrito' : rotuloBairros === 'regiões administrativas' ? 'Região administrativa' : 'Bairro')
    : 'Zona';
  const todasAsAreas = visaoEfetiva === 'locais' ? 'Todos os locais de votação' : visaoEfetiva === 'bairros'
    ? (rotuloBairros === 'regiões administrativas' ? 'Todas as regiões administrativas' : `Todos os ${rotuloBairros}`)
    : 'Todas as zonas';

  const botaoBairros = rotuloBairros === 'distritos' ? 'Distritos' : rotuloBairros === 'regiões administrativas' ? 'Regiões' : 'Bairros';
  const tituloMapa = visaoEfetiva === 'locais' ? 'Quem venceu em cada local de votação'
    : visaoEfetiva === 'bairros' ? `Quem venceu em cada ${rotuloArea.toLowerCase()}` : 'Quem venceu em cada zona eleitoral';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Pilulas
          opcoes={[['locais', 'Locais de votação'], ['bairros', botaoBairros], ['zonas', 'Zonas']] as const}
          valor={visaoEfetiva}
          onChange={setVisao}
          desabilitada={v => !podeLocal && v !== 'zonas'}
        />
        {podeLocal && opcoesBusca.length > 0 && (
          <BuscaBairro opcoes={opcoesBusca} onEscolher={escolherBairro}
            placeholder={rotuloBairros === 'distritos' ? 'Buscar distrito…' : rotuloBairros === 'regiões administrativas' ? 'Buscar região…' : 'Buscar bairro…'} />
        )}
        {respostas && (
          <div className="sm:ml-auto">
            <BotaoPdfComparacao
              tipo="comparacao"
              titulo={`${candsDaVisao.map(c => c.nome).join(' × ')} — ${municipio} ${ano}`}
              subtitulo={`${municipio} (${uf}) · por ${rotuloArea.toLowerCase()} · ${turno}º turno`}
              colunas={candsDaVisao.map(c => c.nome)}
              cores={coresDaVisao}
              rotuloArea={rotuloArea}
              linhas={linhas.map(l => ({ nome: l.detalhe ? `${l.nome} — ${l.detalhe}` : l.nome, valores: l.votos }))}
            />
          </div>
        )}
      </div>

      {semReal.length > 0 && (
        <p className="text-xs flex items-start gap-2 rounded-xl px-3 py-2.5" style={{ color: 'var(--warning)', background: 'var(--warning-soft)' }}>
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>
            {semReal.join(', ')} não {semReal.length > 1 ? 'têm' : 'tem'} voto por local de votação nesta cidade
            (o TSE juntou ali uma eleição suplementar). {semReal.length > 1 ? 'Ficam' : 'Fica'} de fora das visões por local
            e por bairro{podeLocal ? '' : ', que precisam de pelo menos dois candidatos'}; na visão por zona, todos entram.
          </span>
        </p>
      )}

      {carregando ? (
        <div className="rounded-2xl py-16 flex flex-col items-center gap-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--brand-cobalt-text)' }} />
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Carregando os votos de cada local de votação…</span>
        </div>
      ) : (
        <>
          <PlacarComparacao cands={candsDaVisao} linhas={linhas} nomeArea={nomeArea} />
          <GradeMapa
            mapa={(
              <CartaoMapa titulo={tituloMapa} dica="Passe o mouse para ver os votos" legenda={<LegendaComparacao cands={candsDaVisao} />}>
                <MapaCidadeComparacao
                  pontos={pontos}
                  poligonos={poligonos}
                  versao={`${visaoEfetiva}|${chaveCands}|${ano}|${turno}|${locais.length}|${somaVotos}|${poligonosGeo ? 1 : 0}`}
                  enquadramento={`${uf}|${municipio}|${visaoEfetiva === 'bairros' && poligonosGeo ? 'pol' : 'pts'}`}
                  foco={foco}
                />
              </CartaoMapa>
            )}
            lateral={<PainelVitorias cands={candsDaVisao} linhas={linhas} nomeArea={nomeArea} />}
          />
          <DestaquesComparacao cands={candsDaVisao} linhas={linhas} />
          <TabelaComparacao cands={candsDaVisao} linhas={linhas} rotuloArea={rotuloArea} todasAsAreas={todasAsAreas} />
          {visaoEfetiva === 'locais' && locais.some(l => l.lat == null) && (
            <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
              {fmt(locais.filter(l => l.lat == null).length)} locais vieram do TSE sem coordenada: estão na tabela, mas sem ponto no mapa.
            </p>
          )}
        </>
      )}
    </div>
  );
}
