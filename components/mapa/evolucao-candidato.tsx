'use client';

// Evolução entre eleições (comparador, fase 3).
//
// Um candidato numa eleição ("antes") e outro — ou o mesmo — noutra
// ("depois"), no mesmo território. O mapa pinta de verde onde os votos
// cresceram e de vermelho onde caíram, mais forte quanto maior a variação.
// Brasil (presidente) → estado → cidade; dentro da cidade, por bairro e por
// zona.
//
// Não há visão por local de votação entre anos: o TSE renumera escolas e
// muda zonas de uma eleição para outra, e comparar escola a escola mostraria
// "quedas" e "ganhos" que são só troca de código. Bairro é o recorte que se
// mantém. Zonas entram com aviso, pelo mesmo motivo.

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowUpDown, AlertTriangle, Loader2, Plus, Search, TrendingUp, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { BuscaBairro } from '@/components/maps/busca-bairro';
import { ESTADOS_BRASIL } from '@/lib/types';
import { MapaComparacao, cartaoTooltip, type AparenciaArea } from '@/components/mapa/mapa-comparacao';
import { MapaCidadeComparacao, type PontoComparacao, type PoligonosComparacao } from '@/components/mapa/mapa-cidade-comparacao';
import { COR_SEM_VOTO, contagem, esc, fmt, semAcento } from '@/components/mapa/comparacao-comum';
import {
  FORA, botaoDe, carregarPoligonosCidade, indexarPoligonos, nomeDaLinhaFora, poligonoDoPonto,
  rotuloColunaDe, todosOsDe, type PoligonosCidade,
} from '@/components/mapa/poligonos-cidade';
import { BotaoPdfComparacao } from '@/components/mapa/pdf-comparacao';

const ANOS = ['2026', '2024', '2022', '2020', '2018'];
const ehAnoMunicipal = (ano: string) => (parseInt(ano, 10) - 2020) % 4 === 0;
const nomeDaUf = (uf: string) => ESTADOS_BRASIL.find(e => e.sigla === uf)?.nome ?? uf;
export const COR_GANHO = '#16a34a';
export const COR_PERDA = '#dc2626';

interface DadosCandidato {
  candidatoId: string;
  candidateName: string;
  nomeUrna?: string;
  cargo: string;
  partido: string;
  totalVotos: number;
  votosPorMunicipio?: Record<string, number>;
  votosPorNomeMunicipio?: Record<string, number>;
  votosPorEstado?: Record<string, number>;
  zonas?: Array<{ municipio: string; zona: number; votos: number }>;
}

interface Lado {
  ano: string;
  busca: string;
  homonimos: Array<{ id: string; nomeUrna: string; partido: string; cargo: string; totalVotos: number }>;
  dados: DadosCandidato | null;
}

export interface LinhaEvolucao {
  chave: string;
  nome: string;
  a: number;
  b: number;
}

async function carregarCandidato(id: string, ano: string, uf: string): Promise<DadosCandidato | null> {
  const res = await fetch(`/api/tse/candidato?${new URLSearchParams({ candidatoId: id, ano, uf })}`);
  if (!res.ok) return null;
  const d = await res.json();
  return d?.candidatoId ? d : null;
}

const nomeDe = (d: DadosCandidato | null) => (d ? d.nomeUrna || d.candidateName : '');

/** Variação relativa; quem não tinha voto e passou a ter conta como +100%. */
export function variacao(a: number, b: number): number | null {
  if (a === 0 && b === 0) return null;
  if (a === 0) return 1;
  return (b - a) / a;
}

export function aparenciaEvolucao(a: number, b: number): { cor: string; opacidade: number } | null {
  const v = variacao(a, b);
  if (v === null) return null;
  if (v === 0) return { cor: '#64748b', opacidade: 0.5 };
  const forca = Math.abs(v);
  return { cor: v > 0 ? COR_GANHO : COR_PERDA, opacidade: forca < 0.1 ? 0.35 : forca < 0.3 ? 0.6 : 0.85 };
}

const pct = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(1).replace('.', ',')}%`);
const sinal = (n: number) => `${n > 0 ? '+' : ''}${fmt(n)}`;

function htmlEvolucao(titulo: string, rotA: string, rotB: string, a: number, b: number): string {
  const v = variacao(a, b);
  const cor = b > a ? COR_GANHO : b < a ? COR_PERDA : 'var(--text-secondary)';
  return cartaoTooltip(
    `<div style="font-weight:600;color:var(--acento-azul);font-size:13px;margin-bottom:4px">${esc(titulo)}</div>` +
    `<div style="display:flex;justify-content:space-between;gap:10px;font-size:12px;color:var(--text-secondary)"><span>${esc(rotA)}</span><strong style="color:var(--text-primary)">${fmt(a)}</strong></div>` +
    `<div style="display:flex;justify-content:space-between;gap:10px;font-size:12px;color:var(--text-secondary)"><span>${esc(rotB)}</span><strong style="color:var(--text-primary)">${fmt(b)}</strong></div>` +
    `<div style="margin-top:6px;font-size:12px;font-weight:700;color:${cor}">${sinal(b - a)} votos (${pct(v)})</div>`,
  );
}

// ── Resumo, destaques e tabela da evolução ───────────────────────────────────
function usePainelEvolucao({ linhas, rotA, rotB, nomeArea, rotuloArea, todasAsAreas, onClickLinha, dicaClique }: {
  linhas: LinhaEvolucao[]; rotA: string; rotB: string; nomeArea: string; rotuloArea: string; todasAsAreas: string;
  onClickLinha?: (l: LinhaEvolucao) => void; dicaClique?: string;
}) {
  const [ordem, setOrdem] = useState<{ por: 'nome' | 'a' | 'b' | 'dif' | 'var'; desc: boolean }>({ por: 'dif', desc: true });
  const totA = linhas.reduce((s, l) => s + l.a, 0);
  const totB = linhas.reduce((s, l) => s + l.b, 0);
  const cresceu = linhas.filter(l => l.b > l.a).length;
  const caiu = linhas.filter(l => l.b < l.a).length;
  const ganhos = [...linhas].filter(l => l.b > l.a).sort((x, y) => (y.b - y.a) - (x.b - x.a)).slice(0, 5);
  const perdas = [...linhas].filter(l => l.b < l.a).sort((x, y) => (x.b - x.a) - (y.b - y.a)).slice(0, 5);
  const ordenadas = useMemo(() => {
    const s = ordem.desc ? -1 : 1;
    const valor = (l: LinhaEvolucao) => ordem.por === 'a' ? l.a : ordem.por === 'b' ? l.b : ordem.por === 'dif' ? l.b - l.a : (variacao(l.a, l.b) ?? -Infinity);
    return [...linhas].sort((x, y) => ordem.por === 'nome'
      ? s * x.nome.localeCompare(y.nome, 'pt-BR', { numeric: true })
      : s * (valor(x) - valor(y)));
  }, [linhas, ordem]);
  const ordenarPor = (por: typeof ordem.por) => setOrdem(o => ({ por, desc: o.por === por ? !o.desc : por !== 'nome' }));
  const Th = ({ por, children, alinhar = 'right' }: { por: typeof ordem.por; children: React.ReactNode; alinhar?: 'left' | 'right' }) => (
    <th className={`font-semibold px-3 py-2 whitespace-nowrap text-${alinhar}`}>
      <button type="button" onClick={() => ordenarPor(por)} className="inline-flex items-center gap-1">{children}<ArrowUpDown className="h-3 w-3 opacity-50" /></button>
    </th>
  );

  return { resumo: (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Resumo</CardTitle>
        <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{contagem(linhas.length, nomeArea)}</p>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <div className="flex justify-between gap-2"><span style={{ color: 'var(--text-secondary)' }}>{rotA}</span><strong style={{ color: 'var(--text-primary)' }}>{fmt(totA)}</strong></div>
        <div className="flex justify-between gap-2"><span style={{ color: 'var(--text-secondary)' }}>{rotB}</span><strong style={{ color: 'var(--text-primary)' }}>{fmt(totB)}</strong></div>
        <div className="flex justify-between gap-2 pt-1" style={{ borderTop: '1px solid var(--tint-08)' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Diferença</span>
          <strong style={{ color: totB >= totA ? COR_GANHO : COR_PERDA }}>{sinal(totB - totA)} ({pct(variacao(totA, totB))})</strong>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: COR_GANHO }} />cresceu em <strong>{fmt(cresceu)}</strong></span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: COR_PERDA }} />caiu em <strong>{fmt(caiu)}</strong></span>
        </div>
      </CardContent>
    </Card>
  ), detalhes: (
    <>
      {(ganhos.length > 0 || perdas.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[{ titulo: 'Maiores ganhos', itens: ganhos, cor: COR_GANHO }, { titulo: 'Maiores perdas', itens: perdas, cor: COR_PERDA }].map(b => (
            <Card key={b.titulo}>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{b.titulo}</CardTitle></CardHeader>
              <CardContent className="space-y-1.5">
                {b.itens.length === 0 && <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Nenhum.</p>}
                {b.itens.map(l => (
                  <div key={l.chave} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: b.cor }} />
                    <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--text-primary)' }}>{l.nome}</span>
                    <span className="flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{sinal(l.b - l.a)} ({pct(variacao(l.a, l.b))})</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{todasAsAreas} ({fmt(linhas.length)})</CardTitle>
          {dicaClique && <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{dicaClique}</p>}
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[560px] scrollbar-dark">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10" style={{ background: 'var(--bg-card)' }}>
                <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                  <th className="text-left font-semibold px-3 py-2 sticky left-0 z-10 min-w-[160px]" style={{ background: 'var(--bg-card)' }}>
                    <button type="button" onClick={() => ordenarPor('nome')} className="flex items-center gap-1">{rotuloArea}<ArrowUpDown className="h-3 w-3 opacity-50" /></button>
                  </th>
                  <Th por="a">{rotA}</Th>
                  <Th por="b">{rotB}</Th>
                  <Th por="dif">Diferença</Th>
                  <Th por="var">Variação</Th>
                </tr>
              </thead>
              <tbody>
                {ordenadas.map(l => {
                  const ap = aparenciaEvolucao(l.a, l.b);
                  return (
                    <tr key={l.chave} onClick={onClickLinha ? () => onClickLinha(l) : undefined}
                      className={onClickLinha ? 'cursor-pointer hover:bg-[var(--tint-06)]' : undefined}
                      style={{ borderBottom: '1px solid var(--tint-06)' }}>
                      <td className="px-3 py-1.5 sticky left-0 font-medium" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: ap?.cor ?? COR_SEM_VOTO }} />{l.nome}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>{fmt(l.a)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>{fmt(l.b)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold" style={{ color: l.b > l.a ? COR_GANHO : l.b < l.a ? COR_PERDA : 'var(--text-secondary)' }}>{sinal(l.b - l.a)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>{pct(variacao(l.a, l.b))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  ) };
}

function LegendaEvolucao() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: COR_GANHO }} />ganhou votos</span>
      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: COR_PERDA }} />perdeu votos</span>
      <span className="flex items-center gap-1.5">
        <span className="flex">{[0.35, 0.6, 0.85].map(o => <span key={o} className="w-3 h-3" style={{ background: '#94a3b8', opacity: o }} />)}</span>
        variação pequena → grande
      </span>
      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: COR_SEM_VOTO }} />sem votos nas duas</span>
    </div>
  );
}

// ── Dentro da cidade ─────────────────────────────────────────────────────────
interface LocalApi { codLocal: string; nome: string; zona: number; lat: number | null; lng: number | null; votos?: number }
interface RespostaBairros { fonte?: string; bairros?: Array<{ nome: string; locais?: LocalApi[] }> }

function EvolucaoCidade({ uf, municipio, a, b, rotA, rotB, titulo }: {
  uf: string; municipio: string;
  a: { id: string; ano: string; zonas: DadosCandidato['zonas'] };
  b: { id: string; ano: string; zonas: DadosCandidato['zonas'] };
  rotA: string; rotB: string; titulo: string;
}) {
  const [visao, setVisao] = useState<'bairros' | 'zonas'>('bairros');
  const [resp, setResp] = useState<[RespostaBairros | null, RespostaBairros | null] | null>(null);
  const [poligonos, setPoligonos] = useState<PoligonosCidade | null>(null);
  const [foco, setFoco] = useState<{ nonce: number; pontos: Array<[number, number]> } | null>(null);

  useEffect(() => {
    let cancelado = false;
    setResp(null);
    const buscar = (c: { id: string; ano: string }) =>
      fetch(`/api/tse/bairros?${new URLSearchParams({ municipio, uf, candidatoId: c.id, ano: c.ano })}`)
        .then(r => (r.ok ? r.json() : null)).catch(() => null);
    Promise.all([buscar(a), buscar(b)]).then(r => { if (!cancelado) setResp(r as [RespostaBairros | null, RespostaBairros | null]); });
    return () => { cancelado = true; };
  }, [uf, municipio, a.id, a.ano, b.id, b.ano]);

  useEffect(() => {
    let cancelado = false;
    setPoligonos(null);
    carregarPoligonosCidade(uf, municipio).then(p => { if (!cancelado) setPoligonos(p); });
    return () => { cancelado = true; };
  }, [uf, municipio]);

  const temReal = !!resp && resp[0]?.fonte === 'secao' && resp[1]?.fonte === 'secao';
  const rotulo = poligonos?.rotulo ?? 'bairros';
  const indice = useMemo(() => (poligonos ? indexarPoligonos(poligonos) : null), [poligonos]);

  // Locais dos dois anos, cada um no bairro dele. Bairro (e não escola) é o
  // que se mantém de uma eleição para outra.
  const locais = useMemo(() => {
    const lista: Array<{ lado: 0 | 1; bairro: string; lat: number | null; lng: number | null; votos: number; zona: number; nome: string }> = [];
    (resp ?? []).forEach((r, lado) => {
      for (const bai of r?.bairros ?? []) for (const l of bai.locais ?? []) {
        const bairro = indice ? poligonoDoPonto(l.lat, l.lng, indice) : semAcento(bai.nome) || 'SEM BAIRRO';
        lista.push({ lado: lado as 0 | 1, bairro, lat: l.lat, lng: l.lng, votos: l.votos ?? 0, zona: l.zona, nome: l.nome });
      }
    });
    return lista;
  }, [resp, indice]);

  const nomeBairro = (k: string) => (k === FORA ? nomeDaLinhaFora(rotulo) : k);

  const linhasBairros: LinhaEvolucao[] = useMemo(() => {
    if (!temReal) return [];
    const m = new Map<string, LinhaEvolucao>();
    for (const l of locais) {
      const x = m.get(l.bairro) ?? { chave: l.bairro, nome: nomeBairro(l.bairro), a: 0, b: 0 };
      if (l.lado === 0) x.a += l.votos; else x.b += l.votos;
      m.set(l.bairro, x);
    }
    return [...m.values()];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locais, temReal, rotulo]);

  const linhasZonas: LinhaEvolucao[] = useMemo(() => {
    const alvo = semAcento(municipio);
    const m = new Map<number, LinhaEvolucao>();
    [a.zonas ?? [], b.zonas ?? []].forEach((zs, lado) => {
      for (const z of zs) {
        if (semAcento(z.municipio) !== alvo) continue;
        const x = m.get(z.zona) ?? { chave: String(z.zona), nome: `Zona ${z.zona}`, a: 0, b: 0 };
        if (lado === 0) x.a += z.votos; else x.b += z.votos;
        m.set(z.zona, x);
      }
    });
    return [...m.values()];
  }, [a.zonas, b.zonas, municipio]);

  const visaoEfetiva = temReal ? visao : 'zonas';
  const linhas = visaoEfetiva === 'bairros' ? linhasBairros : linhasZonas;
  const porChave = useMemo(() => new Map(linhas.map(l => [l.chave, l])), [linhas]);

  const pontos: PontoComparacao[] = useMemo(() => {
    if (visaoEfetiva === 'bairros' && poligonos) return [];
    // Um ponto por escola (do ano mais recente, para não duplicar), com a cor
    // da variação do bairro ou da zona dela.
    return locais.filter(l => l.lado === 1 && l.lat != null && l.lng != null).map((l, i) => {
      const linha = porChave.get(visaoEfetiva === 'bairros' ? l.bairro : String(l.zona));
      const ap = linha ? aparenciaEvolucao(linha.a, linha.b) : null;
      return {
        chave: `${i}`, lat: l.lat!, lng: l.lng!, cor: ap?.cor ?? COR_SEM_VOTO, opacidade: ap?.opacidade ?? 0.2,
        html: linha ? htmlEvolucao(linha.nome, rotA, rotB, linha.a, linha.b) : '',
      };
    });
  }, [locais, visaoEfetiva, porChave, poligonos, rotA, rotB]);

  const poligonosMapa: PoligonosComparacao | null = visaoEfetiva === 'bairros' && poligonos ? {
    geojson: poligonos.geojson,
    nomeDe: poligonos.nomeDe,
    aparencia: (nome: string) => {
      const l = porChave.get(nome);
      const ap = l ? aparenciaEvolucao(l.a, l.b) : null;
      return l && ap ? { ...ap, html: htmlEvolucao(nome, rotA, rotB, l.a, l.b) } : null;
    },
  } : null;

  const escolherBairro = (nome: string) => {
    const pts = locais.filter(l => nomeBairro(l.bairro) === nome && l.lat != null).map(l => [l.lat!, l.lng!] as [number, number]);
    if (pts.length) setFoco({ nonce: Date.now(), pontos: pts });
  };

  const painel = usePainelEvolucao({
    linhas, rotA, rotB,
    nomeArea: visaoEfetiva === 'bairros' ? rotulo : 'zonas',
    rotuloArea: visaoEfetiva === 'bairros' ? rotuloColunaDe(rotulo) : 'Zona',
    todasAsAreas: visaoEfetiva === 'bairros' ? todosOsDe(rotulo) : 'Todas as zonas',
  });

  if (!resp) return <Card><CardContent className="py-12 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--text-tertiary)' }} /></CardContent></Card>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-lg p-0.5 text-xs" style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--border-default)' }}>
          {([['bairros', botaoDe(rotulo)], ['zonas', 'Zonas']] as const).map(([v, r]) => (
            <button key={v} type="button" onClick={() => setVisao(v)} disabled={!temReal && v === 'bairros'}
              className="px-3 py-1.5 rounded-md font-medium transition-all disabled:opacity-40"
              style={visaoEfetiva === v ? { background: '#1a73e8', color: '#fff' } : { color: 'var(--text-secondary)' }}>{r}</button>
          ))}
        </div>
        {temReal && linhasBairros.length > 0 && (
          <BuscaBairro opcoes={linhasBairros.filter(l => l.chave !== FORA).map(l => ({ nome: l.nome, votos: l.b }))} onEscolher={escolherBairro}
            placeholder={rotulo === 'distritos' ? 'Buscar distrito…' : rotulo === 'regiões administrativas' ? 'Buscar região…' : 'Buscar bairro…'} />
        )}
        <BotaoPdfComparacao
          tipo="evolucao" titulo={titulo} subtitulo={`${municipio} (${uf}) — ${visaoEfetiva === 'bairros' ? botaoDe(rotulo).toLowerCase() : 'zonas'}`}
          colunas={[rotA, rotB]} rotuloArea={visaoEfetiva === 'bairros' ? rotuloColunaDe(rotulo) : 'Zona'}
          linhas={linhas.map(l => ({ nome: l.nome, valores: [l.a, l.b] }))}
        />
      </div>
      {!temReal && (
        <p className="text-xs flex items-start gap-1.5" style={{ color: 'var(--warning)' }}>
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-px" />
          Um dos dois não tem voto por local de votação nesta cidade (o TSE juntou ali uma eleição suplementar): a comparação fica por zona.
        </p>
      )}
      {visaoEfetiva === 'zonas' && (
        <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
          A Justiça Eleitoral às vezes junta ou renumera zonas entre eleições: uma zona que aparece só num dos anos pode ser essa mudança, e não ganho ou perda de verdade.
        </p>
      )}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-2">
          <div className="h-[360px] sm:h-[460px] xl:h-[540px]">
            <MapaCidadeComparacao
              pontos={pontos} poligonos={poligonosMapa} foco={foco}
              versao={`${visaoEfetiva}|${a.id}|${b.id}|${locais.length}|${poligonos ? 1 : 0}`}
              enquadramento={`${uf}|${municipio}|${visaoEfetiva === 'bairros' && poligonos ? 'pol' : 'pts'}`}
            />
          </div>
          <LegendaEvolucao />
        </div>
        {painel.resumo}
      </div>
      {painel.detalhes}
    </div>
  );
}

// ── Tela principal ───────────────────────────────────────────────────────────
export function EvolucaoCandidato() {
  const [abrangencia, setAbrangencia] = useState('SP');
  const [lados, setLados] = useState<[Lado, Lado]>([
    { ano: '2018', busca: '', homonimos: [], dados: null },
    { ano: '2022', busca: '', homonimos: [], dados: null },
  ]);
  const [buscando, setBuscando] = useState<number | null>(null);
  const [erro, setErro] = useState('');
  const [ufAberta, setUfAberta] = useState<string | null>(null);
  const [dadosUf, setDadosUf] = useState<[DadosCandidato | null, DadosCandidato | null] | null>(null);
  const [cidadeAberta, setCidadeAberta] = useState<string | null>(null);

  const escopo = abrangencia;
  const voltarAoInicio = () => { setUfAberta(null); setDadosUf(null); setCidadeAberta(null); };
  const atualizar = (i: number, parcial: Partial<Lado>) => {
    setLados(prev => prev.map((l, j) => (j === i ? { ...l, ...parcial } : l)) as [Lado, Lado]);
    voltarAoInicio();
  };

  const escolherCandidato = async (i: number, id: string) => {
    setBuscando(i);
    const d = await carregarCandidato(id, lados[i].ano, escopo);
    setBuscando(null);
    if (!d) { setErro('Não foi possível carregar esse candidato agora.'); return; }
    setErro('');
    atualizar(i, { dados: d, homonimos: [], busca: '' });
  };

  const buscar = async (i: number) => {
    const lado = lados[i];
    const nome = lado.busca.trim();
    if (!nome) { setErro('Digite o nome do candidato.'); return; }
    if (escopo === 'BR' && ehAnoMunicipal(lado.ano)) { setErro(`Em ${lado.ano} a eleição foi municipal: escolha um estado.`); return; }
    setBuscando(i);
    setErro('');
    try {
      const res = await fetch(`/api/tse/candidato?${new URLSearchParams({ candidato: nome, ano: lado.ano, uf: escopo })}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(escopo === 'BR' ? 'Em "Brasil" só aparecem candidatos a presidente. Para outros cargos, escolha o estado.' : (d?.error ?? 'Candidato não encontrado.'));
        return;
      }
      if (d?.multiplos) { atualizar(i, { homonimos: d.candidatos ?? [] }); return; }
      if (d?.candidatoId) atualizar(i, { dados: d, homonimos: [], busca: '' });
    } catch { setErro('Não foi possível buscar agora. Tente de novo.'); }
    finally { setBuscando(null); }
  };

  const [A, B] = lados;
  const pronto = !!A.dados && !!B.dados;
  const rotA = `${A.ano} · ${nomeDe(A.dados)}`;
  const rotB = `${B.ano} · ${nomeDe(B.dados)}`;
  const titulo = nomeDe(A.dados) === nomeDe(B.dados)
    ? `Evolução de ${nomeDe(A.dados)} — ${A.ano} × ${B.ano}`
    : `${nomeDe(A.dados)} (${A.ano}) × ${nomeDe(B.dados)} (${B.ano})`;

  const nivel: 'brasil' | 'estado' | 'cidade' = cidadeAberta ? 'cidade' : escopo === 'BR' && !ufAberta ? 'brasil' : 'estado';
  const ufAtual = ufAberta ?? escopo;
  const dadosNoNivel = (i: 0 | 1) => (escopo === 'BR' && ufAberta ? dadosUf?.[i] ?? null : lados[i].dados);

  const abrirUf = async (uf: string) => {
    if (!A.dados || !B.dados) return;
    setUfAberta(uf);
    setCidadeAberta(null);
    setDadosUf(null);
    const r = await Promise.all([carregarCandidato(A.dados.candidatoId, A.ano, uf), carregarCandidato(B.dados.candidatoId, B.ano, uf)]);
    setDadosUf(r as [DadosCandidato | null, DadosCandidato | null]);
  };

  const linhas: LinhaEvolucao[] = useMemo(() => {
    if (!pronto || nivel === 'cidade') return [];
    if (nivel === 'brasil') {
      const ufs = new Set([...Object.keys(A.dados!.votosPorEstado ?? {}), ...Object.keys(B.dados!.votosPorEstado ?? {})]);
      return [...ufs].map(uf => ({ chave: uf, nome: uf === 'ZZ' ? 'Exterior' : nomeDaUf(uf), a: A.dados!.votosPorEstado?.[uf] ?? 0, b: B.dados!.votosPorEstado?.[uf] ?? 0 }));
    }
    // Por cidade, casando o nome com acento/sem acento entre os dois anos.
    const m = new Map<string, LinhaEvolucao>();
    ([0, 1] as const).forEach(i => {
      for (const [nome, v] of Object.entries(dadosNoNivel(i)?.votosPorNomeMunicipio ?? {})) {
        const k = semAcento(nome);
        const x = m.get(k) ?? { chave: k, nome, a: 0, b: 0 };
        if (i === 0) x.a += v; else x.b += v;
        m.set(k, x);
      }
    });
    return [...m.values()];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lados, nivel, ufAberta, dadosUf]);

  const aparencia = (chave: string, nome: string): AparenciaArea | null => {
    let a = 0, b = 0;
    if (nivel === 'brasil') { a = A.dados?.votosPorEstado?.[chave] ?? 0; b = B.dados?.votosPorEstado?.[chave] ?? 0; }
    else {
      const va = dadosNoNivel(0)?.votosPorMunicipio ?? {}, vb = dadosNoNivel(1)?.votosPorMunicipio ?? {};
      const ca = va[chave] ?? va[chave.slice(0, 6)], cb = vb[chave] ?? vb[chave.slice(0, 6)];
      if (ca !== undefined || cb !== undefined) { a = ca ?? 0; b = cb ?? 0; }
      else {
        // Reserva pelo nome (sem acento), se o código do IBGE não vier na resposta.
        const k = semAcento(nome);
        const achar = (m?: Record<string, number>) => Object.entries(m ?? {}).find(([n]) => semAcento(n) === k)?.[1] ?? 0;
        a = achar(dadosNoNivel(0)?.votosPorNomeMunicipio); b = achar(dadosNoNivel(1)?.votosPorNomeMunicipio);
      }
    }
    const ap = aparenciaEvolucao(a, b);
    return ap ? { ...ap, html: htmlEvolucao(nome, rotA, rotB, a, b) } : null;
  };

  const painel = usePainelEvolucao({
    linhas, rotA, rotB,
    nomeArea: nivel === 'brasil' ? 'estados' : 'cidades',
    rotuloArea: nivel === 'brasil' ? 'Estado' : 'Cidade',
    todasAsAreas: nivel === 'brasil' ? 'Todos os estados' : 'Todas as cidades',
    onClickLinha: nivel === 'brasil' ? (l) => { if (l.chave !== 'ZZ') abrirUf(l.chave); } : (l) => setCidadeAberta(l.nome),
    dicaClique: nivel === 'brasil' ? 'Clique num estado para ver as cidades.' : 'Clique numa cidade para ver por bairro e zona.',
  });

  const opcoesAnos = (i: number) => ANOS.filter(a => !(escopo === 'BR' && ehAnoMunicipal(a))).map(a => ({ value: a, label: a }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-[color:var(--brand-cobalt)]" />
            Evolução entre eleições
          </CardTitle>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Um candidato numa eleição e outro — ou o mesmo — noutra. O mapa mostra onde os votos cresceram (verde) e onde caíram (vermelho).
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-0.5 sm:max-w-sm">
            <label className="text-[11px] font-medium" style={{ color: 'var(--text-tertiary)' }}>Onde comparar</label>
            <Select value={abrangencia} onChange={(e) => { setAbrangencia(e.target.value); setLados(p => [{ ...p[0], dados: null, homonimos: [] }, { ...p[1], dados: null, homonimos: [] }]); voltarAoInicio(); }}
              options={[{ value: 'BR', label: 'Brasil (presidente)' }, ...ESTADOS_BRASIL.map(e => ({ value: e.sigla, label: e.nome }))]} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {lados.map((lado, i) => (
              <div key={i} className="rounded-lg p-3 space-y-2" style={{ border: '1px solid var(--border-default)', background: 'var(--bg-card-subtle)' }}>
                <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{i === 0 ? 'Antes' : 'Depois'}</p>
                <div className="flex gap-2">
                  <div className="w-24 flex-shrink-0">
                    <Select value={lado.ano} onChange={(e) => atualizar(i, { ano: e.target.value, dados: null, homonimos: [] })} options={opcoesAnos(i)} />
                  </div>
                  {lado.dados ? (
                    <div className="flex-1 min-w-0 flex items-center gap-2 rounded-md px-2" style={{ border: '1px solid var(--border-default)' }}>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{nomeDe(lado.dados)}</span>
                        <span className="block text-[10px] truncate" style={{ color: 'var(--text-tertiary)' }}>{lado.dados.partido} · {lado.dados.cargo} · {fmt(lado.dados.totalVotos)} votos</span>
                      </span>
                      <button type="button" onClick={() => atualizar(i, { dados: null })} className="p-1" aria-label="Trocar candidato">
                        <X className="h-3.5 w-3.5" style={{ color: 'var(--text-tertiary)' }} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none" style={{ color: '#4a7a9b' }} />
                        <Input value={lado.busca} onChange={(e) => setLados(p => p.map((l, j) => (j === i ? { ...l, busca: e.target.value } : l)) as [Lado, Lado])}
                          onKeyDown={(e) => { if (e.key === 'Enter') buscar(i); }} placeholder="Nome do candidato" className="pl-8" />
                      </div>
                      <Button onClick={() => buscar(i)} disabled={buscando !== null} aria-label="Escolher candidato">
                        {buscando === i ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      </Button>
                    </>
                  )}
                </div>
                {lado.homonimos.length > 0 && (
                  <div className="max-h-48 overflow-y-auto scrollbar-dark rounded-md" style={{ border: '1px solid var(--border-default)' }}>
                    {lado.homonimos.map(h => (
                      <button key={h.id} type="button" onClick={() => escolherCandidato(i, h.id)}
                        className="w-full flex items-center justify-between gap-2 px-2 py-1.5 text-left hover:bg-[var(--tint-06)]">
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{h.nomeUrna}</span>
                          <span className="block text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>{h.partido} · {h.cargo}</span>
                        </span>
                        <span className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--acento-azul)' }}>{fmt(h.totalVotos)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          {erro && (
            <p className="text-xs flex items-start gap-1.5" style={{ color: 'var(--danger)' }}>
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-px" /> {erro}
            </p>
          )}
        </CardContent>
      </Card>

      {!pronto ? (
        <Card><CardContent className="py-10 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Escolha o candidato de cada eleição para ver onde os votos cresceram e onde caíram.
        </CardContent></Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {nivel === 'cidade' && (
              <Button variant="outline" size="sm" onClick={() => setCidadeAberta(null)}><ArrowLeft className="h-4 w-4 mr-1" /> {nomeDaUf(ufAtual)}</Button>
            )}
            {nivel === 'estado' && ufAberta && (
              <Button variant="outline" size="sm" onClick={voltarAoInicio}><ArrowLeft className="h-4 w-4 mr-1" /> Brasil</Button>
            )}
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              {nivel === 'brasil' ? 'Brasil — por estado' : nivel === 'cidade' ? `${cidadeAberta} (${ufAtual})` : `${nomeDaUf(ufAtual)} — por cidade`}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{rotA} → {rotB}</span>
            {nivel !== 'cidade' && (
              <BotaoPdfComparacao
                tipo="evolucao" titulo={titulo}
                subtitulo={nivel === 'brasil' ? 'Brasil — por estado' : `${nomeDaUf(ufAtual)} — por cidade`}
                mapa={{ tipo: nivel === 'brasil' ? 'brasil' : 'estado', uf: nivel === 'estado' ? ufAtual : undefined }}
                colunas={[rotA, rotB]} rotuloArea={nivel === 'brasil' ? 'Estado' : 'Cidade'}
                linhas={linhas.map(l => ({ nome: l.nome, valores: [l.a, l.b] }))}
                // Chave: sigla da UF (Brasil) ou nome da cidade (estado) — o PDF
                // casa o nome com o contorno do IBGE.
                coresMapa={Object.fromEntries(linhas.flatMap(l => {
                  const ap = aparenciaEvolucao(l.a, l.b);
                  return ap ? [[nivel === 'brasil' ? l.chave : l.nome, ap] as const] : [];
                }))}
              />
            )}
          </div>

          {nivel === 'cidade' ? (
            <EvolucaoCidade
              uf={ufAtual} municipio={cidadeAberta!} rotA={rotA} rotB={rotB} titulo={titulo}
              a={{ id: A.dados!.candidatoId, ano: A.ano, zonas: dadosNoNivel(0)?.zonas }}
              b={{ id: B.dados!.candidatoId, ano: B.ano, zonas: dadosNoNivel(1)?.zonas }}
            />
          ) : (
            <>
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div className="xl:col-span-2 space-y-2">
                  <div className="h-[340px] sm:h-[440px] xl:h-[520px] relative">
                    <MapaComparacao
                      tipo={nivel === 'brasil' ? 'brasil' : 'estado'}
                      uf={nivel === 'estado' ? ufAtual : undefined}
                      aparencia={aparencia}
                      versao={`${A.dados!.candidatoId}|${B.dados!.candidatoId}|${A.ano}|${B.ano}|${ufAberta}|${dadosUf ? 1 : 0}`}
                      altura="100%"
                      onClickArea={nivel === 'brasil' ? (uf) => abrirUf(uf) : (_c, nome) => setCidadeAberta(nome)}
                    />
                    {escopo === 'BR' && ufAberta && !dadosUf && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-xl" style={{ background: 'rgba(15,23,42,0.25)' }}>
                        <Loader2 className="h-6 w-6 animate-spin text-white" />
                      </div>
                    )}
                  </div>
                  <LegendaEvolucao />
                </div>
                {painel.resumo}
              </div>
              {painel.detalhes}
            </>
          )}
        </>
      )}
    </div>
  );
}
