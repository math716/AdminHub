'use client';

// Evolução entre eleições (comparador, fase 3).
//
// Um candidato numa eleição ("antes") e outro — ou o mesmo — noutra
// ("depois"), no mesmo território. Cada lado escolhe ano e turno, então dá
// para comparar o mesmo candidato no 1º e no 2º turno de um ano. O mapa pinta de verde onde os votos
// cresceram e de vermelho onde caíram, mais forte quanto maior a variação.
// Brasil (presidente) → estado → cidade; dentro da cidade, por bairro e por
// zona.
//
// Não há visão por local de votação entre anos: o TSE renumera escolas e
// muda zonas de uma eleição para outra, e comparar escola a escola mostraria
// "quedas" e "ganhos" que são só troca de código. Bairro é o recorte que se
// mantém. Zonas entram com aviso, pelo mesmo motivo.

import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight, ArrowRight, ArrowUpDown, ArrowUpRight, AlertTriangle, Info, List, Loader2, MousePointerClick, Plus, Search,
  TrendingDown, TrendingUp, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { BuscaBairro } from '@/components/maps/busca-bairro';
import { ESTADOS_BRASIL } from '@/lib/types';
import { MapaComparacao, cartaoBalao, linhaBalao, pilulaBalao, type AparenciaArea } from '@/components/mapa/mapa-comparacao';
import { MapaCidadeComparacao, type PontoComparacao, type PoligonosComparacao } from '@/components/mapa/mapa-cidade-comparacao';
import { COR_SEM_VOTO, fmt, semAcento } from '@/components/mapa/comparacao-comum';
import {
  FORA, botaoDe, carregarPoligonosCidade, indexarPoligonos, nomeDaLinhaFora, poligonoDoPonto,
  rotuloColunaDe, todosOsDe, type PoligonosCidade,
} from '@/components/mapa/poligonos-cidade';
import { BotaoPdfComparacao } from '@/components/mapa/pdf-comparacao';
import { coresDosCandidatos } from '@/lib/partidos-espectro';
import {
  Avatar, BarraSimples, CampoFiltro, CartaoMapa, ChipFiltro, EstadoVazio, Etiqueta, GradeMapa, LegendaMapa, Painel, Pilulas,
  Rosca, Trilha, comAlfa, pctBR, type Passo,
} from '@/components/mapa/comparacao-visual';

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
  /** Também disputou o 2º turno deste ano (o id é o mesmo nos dois turnos). */
  segundoTurno?: boolean;
}

interface Lado {
  ano: string;
  turno: 1 | 2;
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

async function carregarCandidato(id: string, ano: string, uf: string, turno: 1 | 2): Promise<DadosCandidato | null> {
  const res = await fetch(`/api/tse/candidato?${new URLSearchParams({ candidatoId: id, ano, uf, turno: String(turno) })}`);
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

function htmlEvolucao(titulo: string, rotA: string, rotB: string, a: number, b: number, sobre?: string): string {
  const v = variacao(a, b);
  const d = b - a;
  const cor = d > 0 ? COR_GANHO : d < 0 ? COR_PERDA : '#64748b';
  const maior = Math.max(a, b, 1);
  // rotA/rotB = "2018 · NOME" ou "2022 (2º turno) · NOME": o ano (ou o
  // turno) vai na bolinha, o nome ao lado.
  const lado = (rot: string, valor: number, corLado: string, destaque: boolean) => {
    const [ano, ...resto] = rot.split(' · ');
    const turno = ano.match(/(\d)º turno/)?.[1];
    return linhaBalao({
      cor: corLado, iniciais: turno ? `${turno}º` : `’${ano.slice(2, 4)}`, nome: resto.join(' · ') || ano, fracao: valor / maior, destaque,
      principal: fmt(valor), secundario: `votos em ${ano}`,
    });
  };
  return cartaoBalao({
    cor, sobre, titulo,
    corpo: lado(rotA, a, '#94a3b8', false) + lado(rotB, b, cor, true),
    rodape: `<span>Variação <strong style="color:${cor}">${pct(v)}</strong></span>` +
      pilulaBalao(cor, `${sinal(d)} ${Math.abs(d) === 1 ? 'voto' : 'votos'}`),
  });
}

// ── Peças visuais da evolução ────────────────────────────────────────────────
export interface LadoVisual { nome: string; ano: string; partido: string; cor: string }

const corDaDiferenca = (d: number) => (d > 0 ? COR_GANHO : d < 0 ? COR_PERDA : '#64748b');

/** Antes → depois: os dois totais, a diferença no meio e as duas barras. */
function PlacarEvolucao({ lados, linhas }: { lados: [LadoVisual, LadoVisual]; linhas: LinhaEvolucao[] }) {
  const totA = linhas.reduce((s, l) => s + l.a, 0);
  const totB = linhas.reduce((s, l) => s + l.b, 0);
  const d = totB - totA;
  const cor = corDaDiferenca(d);
  const maior = Math.max(totA, totB, 1);
  const Seta = d > 0 ? ArrowUpRight : d < 0 ? ArrowDownRight : ArrowRight;

  const cartao = (l: LadoVisual, total: number, i: 0 | 1) => (
    <div className={`min-w-0 flex flex-col gap-2.5 ${i === 1 ? 'items-end text-right' : ''}`}>
      <div className={`flex flex-col sm:flex-row gap-2 sm:gap-3 ${i === 1 ? 'items-end sm:flex-row-reverse' : 'items-start sm:items-center'}`}>
        <Avatar nome={l.nome} cor={l.cor} tamanho={48} />
        <div className="min-w-0">
          <span className="inline-block whitespace-nowrap text-[10px] uppercase tracking-widest font-bold rounded-md px-1.5 py-0.5 mb-1"
            style={{ background: 'var(--tint-06)', color: 'var(--text-tertiary)' }}>
            {i === 0 ? 'Antes' : 'Depois'} · {l.ano}
          </span>
          <p className="text-sm sm:text-base font-bold leading-tight break-words" style={{ color: 'var(--text-primary)' }}>{l.nome}</p>
          <p className="text-[11px] font-medium" style={{ color: 'var(--text-tertiary)' }}>{l.partido}</p>
        </div>
      </div>
      <div>
        <p className="text-2xl sm:text-4xl font-bold tabular-nums tracking-tight leading-none" style={{ color: 'var(--text-primary)' }}>{fmt(total)}</p>
        <p className="text-[10px] uppercase tracking-widest font-semibold mt-1" style={{ color: 'var(--text-tertiary)' }}>votos</p>
      </div>
    </div>
  );

  return (
    <section className="rounded-2xl overflow-hidden"
      style={{
        background: 'var(--bg-card)',
        backgroundImage: `radial-gradient(ellipse at 50% 0%, ${comAlfa(cor, 0.12)}, transparent 60%)`,
        border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)',
      }}>
      <div className="p-4 sm:p-6">
        <div className="grid grid-cols-2 sm:grid-cols-[1fr_auto_1fr] gap-4 sm:gap-6 items-center">
          {cartao(lados[0], totA, 0)}
          <div className="col-span-2 sm:col-span-1 order-last sm:order-none flex flex-col items-center gap-1.5">
            <span className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${cor}, ${comAlfa(cor, 0.75)})`, boxShadow: `0 0 0 5px ${comAlfa(cor, 0.15)}, 0 10px 24px -8px ${comAlfa(cor, 0.7)}` }}>
              <Seta className="w-6 h-6 text-white" strokeWidth={2.5} />
            </span>
            <span className="text-base sm:text-lg font-bold tabular-nums leading-none" style={{ color: cor }}>{sinal(d)}</span>
            <Etiqueta cor={cor}>{pct(variacao(totA, totB))}</Etiqueta>
          </div>
          {cartao(lados[1], totB, 1)}
        </div>

        <div className="mt-5 sm:mt-6 grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2">
          {([[lados[0], totA, 0.45], [lados[1], totB, 1]] as const).map(([l, t, alfa], i) => (
            <Fragment key={i}>
              <span className="text-[11px] font-bold tabular-nums whitespace-nowrap" style={{ color: 'var(--text-tertiary)' }}>{l.ano}</span>
              <BarraSimples fracao={t / maior} cor={comAlfa(l.cor, alfa)} altura={12} />
              <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--text-secondary)' }}>{fmt(t)}</span>
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Rosca de onde cresceu e onde caiu + votos ganhos e perdidos. */
function PainelBalanco({ linhas, nomeArea }: { linhas: LinhaEvolucao[]; nomeArea: string }) {
  const cresceu = linhas.filter(l => l.b > l.a);
  const caiu = linhas.filter(l => l.b < l.a);
  const igual = linhas.length - cresceu.length - caiu.length;
  const ganhos = cresceu.reduce((s, l) => s + (l.b - l.a), 0);
  const perdas = caiu.reduce((s, l) => s + (l.a - l.b), 0);
  const maior = Math.max(ganhos, perdas, 1);
  const itens = [
    { chave: 'cresceu', rotulo: 'Cresceu', valor: cresceu.length, cor: COR_GANHO },
    { chave: 'caiu', rotulo: 'Caiu', valor: caiu.length, cor: COR_PERDA },
    { chave: 'igual', rotulo: 'Igual', valor: igual, cor: '#64748b' },
  ].filter(x => x.chave !== 'igual' || x.valor > 0);

  return (
    <Painel titulo="Onde cresceu e onde caiu" icone={TrendingUp}>
      <div className="flex flex-col sm:flex-row xl:flex-col 2xl:flex-row items-center gap-5">
        <Rosca fatias={itens} centro={fmt(linhas.length)} rotuloCentro={nomeArea} />
        <ul className="flex-1 w-full space-y-2.5">
          {itens.map(x => (
            <li key={x.chave} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: x.cor }} />
              <span className="flex-1 font-medium" style={{ color: 'var(--text-primary)' }}>{x.rotulo}</span>
              <span className="tabular-nums font-bold" style={{ color: 'var(--text-primary)' }}>{fmt(x.valor)}</span>
              <span className="tabular-nums w-11 text-right" style={{ color: 'var(--text-tertiary)' }}>{linhas.length ? pctBR(x.valor / linhas.length, 0) : '—'}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-5 pt-4 space-y-3" style={{ borderTop: '1px solid var(--tint-06)' }}>
        <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--text-tertiary)' }}>Votos ganhos e perdidos</p>
        {[
          { rotulo: `Ganhos onde cresceu`, valor: ganhos, cor: COR_GANHO, sinal: '+' },
          { rotulo: `Perdidos onde caiu`, valor: perdas, cor: COR_PERDA, sinal: '−' },
        ].map(x => (
          <div key={x.rotulo} className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span style={{ color: 'var(--text-secondary)' }}>{x.rotulo}</span>
              <span className="font-bold tabular-nums" style={{ color: x.cor }}>{x.sinal}{fmt(x.valor)}</span>
            </div>
            <BarraSimples fracao={x.valor / maior} cor={x.cor} altura={10} />
          </div>
        ))}
        <div className="flex items-center justify-between text-xs pt-1">
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>Saldo</span>
          <Etiqueta cor={corDaDiferenca(ganhos - perdas)} forte>{sinal(ganhos - perdas)} votos</Etiqueta>
        </div>
      </div>
    </Painel>
  );
}

/** Exemplos: onde mais ganhou e onde mais perdeu. A tabela traz todas as áreas. */
function GanhosEPerdas({ linhas }: { linhas: LinhaEvolucao[] }) {
  const ganhos = [...linhas].filter(l => l.b > l.a).sort((x, y) => (y.b - y.a) - (x.b - x.a)).slice(0, 6);
  const perdas = [...linhas].filter(l => l.b < l.a).sort((x, y) => (x.b - x.a) - (y.b - y.a)).slice(0, 6);
  if (ganhos.length === 0 && perdas.length === 0) return null;
  const maior = Math.max(...[...ganhos, ...perdas].map(l => Math.abs(l.b - l.a)), 1);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[
        { titulo: 'Onde mais ganhou', icone: TrendingUp, itens: ganhos, cor: COR_GANHO },
        { titulo: 'Onde mais perdeu', icone: TrendingDown, itens: perdas, cor: COR_PERDA },
      ].map(b => (
        <Painel key={b.titulo} titulo={b.titulo} icone={b.icone}>
          {b.itens.length === 0 ? (
            <p className="text-xs py-4 text-center" style={{ color: 'var(--text-tertiary)' }}>Nenhuma área.</p>
          ) : (
            <ul className="space-y-3">
              {b.itens.map(l => (
                <li key={l.chave}>
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <span className="text-xs font-medium min-w-0 break-words" style={{ color: 'var(--text-primary)' }}>{l.nome}</span>
                    <span className="text-xs font-bold tabular-nums whitespace-nowrap" style={{ color: b.cor }}>
                      {sinal(l.b - l.a)} <span className="font-medium" style={{ color: 'var(--text-tertiary)' }}>({pct(variacao(l.a, l.b))})</span>
                    </span>
                  </div>
                  <BarraSimples fracao={Math.abs(l.b - l.a) / maior} cor={`linear-gradient(90deg, ${comAlfa(b.cor, 0.55)}, ${b.cor})`} altura={8} />
                </li>
              ))}
            </ul>
          )}
        </Painel>
      ))}
    </div>
  );
}

/** Barrinha da variação: para a direita (verde) cresceu, para a esquerda (vermelho) caiu. */
function BarraVariacao({ v }: { v: number | null }) {
  const f = v === null ? 0 : Math.min(Math.abs(v), 1);
  const cor = v === null || v === 0 ? '#64748b' : v > 0 ? COR_GANHO : COR_PERDA;
  return (
    <div className="relative h-2 w-24 rounded-full" style={{ background: 'var(--tint-06)' }}>
      <span className="absolute top-[-2px] bottom-[-2px] left-1/2 w-px" style={{ background: 'var(--tint-25)' }} />
      {f > 0 && (
        <span className="absolute top-0 bottom-0 rounded-full"
          style={{ background: cor, width: `${f * 50}%`, ...(v! > 0 ? { left: '50%' } : { right: '50%' }) }} />
      )}
    </div>
  );
}

function TabelaEvolucao({ linhas, lados, rotuloArea, todasAsAreas, onClickLinha, dicaClique }: {
  linhas: LinhaEvolucao[]; lados: [LadoVisual, LadoVisual]; rotuloArea: string; todasAsAreas: string;
  onClickLinha?: (l: LinhaEvolucao) => void; dicaClique?: string;
}) {
  const [ordem, setOrdem] = useState<{ por: 'nome' | 'a' | 'b' | 'dif' | 'var'; desc: boolean }>({ por: 'dif', desc: true });
  const [texto, setTexto] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'cresceu' | 'caiu' | 'igual'>('todos');
  const ordenadas = useMemo(() => {
    const s = ordem.desc ? -1 : 1;
    const valor = (l: LinhaEvolucao) => ordem.por === 'a' ? l.a : ordem.por === 'b' ? l.b : ordem.por === 'dif' ? l.b - l.a : (variacao(l.a, l.b) ?? -Infinity);
    return [...linhas].sort((x, y) => ordem.por === 'nome'
      ? s * x.nome.localeCompare(y.nome, 'pt-BR', { numeric: true })
      : s * (valor(x) - valor(y)));
  }, [linhas, ordem]);
  const ordenarPor = (por: typeof ordem.por) => setOrdem(o => ({ por, desc: o.por === por ? !o.desc : por !== 'nome' }));
  const alvo = semAcento(texto);
  const tipo = (l: LinhaEvolucao) => (l.b > l.a ? 'cresceu' : l.b < l.a ? 'caiu' : 'igual');
  const visiveis = ordenadas.filter(l => (filtro === 'todos' || tipo(l) === filtro) && (!alvo || semAcento(l.nome).includes(alvo)));
  const conta = (t: string) => linhas.filter(l => tipo(l) === t).length;

  const Th = ({ por, children, alinhar = 'right', className = '' }: { por: typeof ordem.por; children: React.ReactNode; alinhar?: 'left' | 'right'; className?: string }) => (
    <th className={`px-3 py-2.5 whitespace-nowrap text-${alinhar} ${className}`} style={{ background: 'var(--bg-card-subtle)' }}>
      <button type="button" onClick={() => ordenarPor(por)} className={`inline-flex items-center gap-1 uppercase tracking-wider ${alinhar === 'right' ? 'flex-row-reverse' : ''}`}>
        <ArrowUpDown className="h-3 w-3 opacity-50 flex-shrink-0" />{children}
      </button>
    </th>
  );
  const rotuloLado = (l: LadoVisual) => (
    <span className="flex flex-col items-end leading-tight normal-case tracking-normal">
      <span className="uppercase tracking-wider">{l.ano}</span>
      <span className="font-medium" style={{ color: 'var(--text-tertiary)' }}>{l.nome}</span>
    </span>
  );

  return (
    <Painel
      titulo={<>{todasAsAreas} <span className="normal-case tracking-normal font-semibold">({fmt(linhas.length)})</span></>}
      icone={List}
      direita={<CampoFiltro valor={texto} onChange={setTexto} placeholder={`Filtrar por ${rotuloArea.toLowerCase()}…`} />}
      corpo="pt-3"
    >
      <div className="px-4 sm:px-5 pb-3 flex flex-wrap items-center gap-1.5">
        <ChipFiltro ativo={filtro === 'todos'} onClick={() => setFiltro('todos')}>Todos · {fmt(linhas.length)}</ChipFiltro>
        <ChipFiltro ativo={filtro === 'cresceu'} cor={COR_GANHO} onClick={() => setFiltro(filtro === 'cresceu' ? 'todos' : 'cresceu')}>Cresceu · {fmt(conta('cresceu'))}</ChipFiltro>
        <ChipFiltro ativo={filtro === 'caiu'} cor={COR_PERDA} onClick={() => setFiltro(filtro === 'caiu' ? 'todos' : 'caiu')}>Caiu · {fmt(conta('caiu'))}</ChipFiltro>
        {conta('igual') > 0 && (
          <ChipFiltro ativo={filtro === 'igual'} cor="#64748b" onClick={() => setFiltro(filtro === 'igual' ? 'todos' : 'igual')}>Igual · {fmt(conta('igual'))}</ChipFiltro>
        )}
        {dicaClique && (
          <span className="text-[11px] flex items-center gap-1 sm:ml-auto" style={{ color: 'var(--text-tertiary)' }}>
            <MousePointerClick className="w-3 h-3" />{dicaClique}
          </span>
        )}
      </div>
      <div className="overflow-auto max-h-[600px] scrollbar-dark" style={{ borderTop: '1px solid var(--tint-06)' }}>
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
              <Th por="nome" alinhar="left" className="sticky left-0 z-10 min-w-[170px] px-4">{rotuloArea}</Th>
              <Th por="a">{rotuloLado(lados[0])}</Th>
              <Th por="b">{rotuloLado(lados[1])}</Th>
              <Th por="dif">Diferença</Th>
              <Th por="var" className="px-4">Variação</Th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center" style={{ color: 'var(--text-tertiary)' }}>Nada encontrado com esse filtro.</td></tr>
            )}
            {visiveis.map(l => {
              const d = l.b - l.a;
              const v = variacao(l.a, l.b);
              const cor = corDaDiferenca(d);
              return (
                <tr key={l.chave} onClick={onClickLinha ? () => onClickLinha(l) : undefined}
                  className={`group ${onClickLinha ? 'cursor-pointer' : ''}`} style={{ borderTop: '1px solid var(--tint-06)' }}>
                  <td className="px-4 py-2.5 sticky left-0 font-medium bg-[var(--bg-card)] group-hover:bg-[var(--bg-hover)]"
                    style={{ color: 'var(--text-primary)', boxShadow: `inset 3px 0 0 ${comAlfa(cor, aparenciaEvolucao(l.a, l.b)?.opacidade ?? 0.3)}` }}>
                    {l.nome}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums group-hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-secondary)' }}>{fmt(l.a)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold group-hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-primary)' }}>{fmt(l.b)}</td>
                  <td className="px-3 py-2.5 text-right group-hover:bg-[var(--bg-hover)]"><Etiqueta cor={cor}>{sinal(d)}</Etiqueta></td>
                  <td className="px-4 py-2.5 group-hover:bg-[var(--bg-hover)]">
                    <span className="flex items-center justify-end gap-2">
                      <span className="tabular-nums text-[11px] font-semibold" style={{ color: cor }}>{pct(v)}</span>
                      <BarraVariacao v={v} />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Painel>
  );
}

function LegendaEvolucao() {
  return (
    <LegendaMapa
      itens={[{ chave: 'g', cor: COR_GANHO, rotulo: 'ganhou votos' }, { chave: 'p', cor: COR_PERDA, rotulo: 'perdeu votos' }]}
      escala={{ inicio: 'variação pequena', fim: 'grande' }}
      semVoto={{ cor: COR_SEM_VOTO, rotulo: 'sem votos nas duas' }}
    />
  );
}

// ── Dentro da cidade ─────────────────────────────────────────────────────────
interface LocalApi { codLocal: string; nome: string; zona: number; lat: number | null; lng: number | null; votos?: number }
interface RespostaBairros { fonte?: string; bairros?: Array<{ nome: string; locais?: LocalApi[] }> }

function EvolucaoCidade({ uf, municipio, a, b, rotA, rotB, titulo, lados }: {
  uf: string; municipio: string;
  a: { id: string; ano: string; turno: 1 | 2; zonas: DadosCandidato['zonas'] };
  b: { id: string; ano: string; turno: 1 | 2; zonas: DadosCandidato['zonas'] };
  rotA: string; rotB: string; titulo: string;
  lados: [LadoVisual, LadoVisual];
}) {
  const [visao, setVisao] = useState<'bairros' | 'zonas'>('bairros');
  const [resp, setResp] = useState<[RespostaBairros | null, RespostaBairros | null] | null>(null);
  const [poligonos, setPoligonos] = useState<PoligonosCidade | null>(null);
  const [foco, setFoco] = useState<{ nonce: number; pontos: Array<[number, number]> } | null>(null);

  useEffect(() => {
    let cancelado = false;
    setResp(null);
    const buscar = (c: { id: string; ano: string; turno: 1 | 2 }) =>
      fetch(`/api/tse/bairros?${new URLSearchParams({ municipio, uf, candidatoId: c.id, ano: c.ano, turno: String(c.turno) })}`)
        .then(r => (r.ok ? r.json() : null)).catch(() => null);
    Promise.all([buscar(a), buscar(b)]).then(r => { if (!cancelado) setResp(r as [RespostaBairros | null, RespostaBairros | null]); });
    return () => { cancelado = true; };
  }, [uf, municipio, a.id, a.ano, a.turno, b.id, b.ano, b.turno]);

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
        html: linha ? htmlEvolucao(linha.nome, rotA, rotB, linha.a, linha.b, visaoEfetiva === 'bairros' ? rotuloColunaDe(rotulo) : 'Zona eleitoral') : '',
      };
    });
  }, [locais, visaoEfetiva, porChave, poligonos, rotA, rotB]);

  const poligonosMapa: PoligonosComparacao | null = visaoEfetiva === 'bairros' && poligonos ? {
    geojson: poligonos.geojson,
    nomeDe: poligonos.nomeDe,
    aparencia: (nome: string) => {
      const l = porChave.get(nome);
      const ap = l ? aparenciaEvolucao(l.a, l.b) : null;
      return l && ap ? { ...ap, html: htmlEvolucao(nome, rotA, rotB, l.a, l.b, rotuloColunaDe(rotulo)) } : null;
    },
  } : null;

  const escolherBairro = (nome: string) => {
    const pts = locais.filter(l => nomeBairro(l.bairro) === nome && l.lat != null).map(l => [l.lat!, l.lng!] as [number, number]);
    if (pts.length) setFoco({ nonce: Date.now(), pontos: pts });
  };

  const rotuloArea = visaoEfetiva === 'bairros' ? rotuloColunaDe(rotulo) : 'Zona';
  const nomeArea = visaoEfetiva === 'bairros' ? rotulo : 'zonas';

  if (!resp) {
    return (
      <div className="rounded-2xl py-16 flex flex-col items-center gap-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--brand-cobalt-text)' }} />
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Carregando os votos das duas eleições…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Pilulas
          opcoes={[['bairros', botaoDe(rotulo)], ['zonas', 'Zonas']] as const}
          valor={visaoEfetiva}
          onChange={setVisao}
          desabilitada={v => !temReal && v === 'bairros'}
        />
        {temReal && linhasBairros.length > 0 && (
          <BuscaBairro opcoes={linhasBairros.filter(l => l.chave !== FORA).map(l => ({ nome: l.nome, votos: l.b }))} onEscolher={escolherBairro}
            placeholder={rotulo === 'distritos' ? 'Buscar distrito…' : rotulo === 'regiões administrativas' ? 'Buscar região…' : 'Buscar bairro…'} />
        )}
        <div className="sm:ml-auto">
          <BotaoPdfComparacao
            tipo="evolucao" titulo={titulo} subtitulo={`${municipio} (${uf}) — ${visaoEfetiva === 'bairros' ? botaoDe(rotulo).toLowerCase() : 'zonas'}`}
            colunas={[rotA, rotB]} rotuloArea={rotuloArea}
            linhas={linhas.map(l => ({ nome: l.nome, valores: [l.a, l.b] }))}
          />
        </div>
      </div>
      {!temReal && (
        <p className="text-xs flex items-start gap-2 rounded-xl px-3 py-2.5" style={{ color: 'var(--warning)', background: 'var(--warning-soft)' }}>
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          Um dos dois não tem voto por local de votação nesta cidade (o TSE juntou ali uma eleição suplementar): a comparação fica por zona.
        </p>
      )}
      {visaoEfetiva === 'zonas' && (
        <p className="text-[11px] flex items-start gap-1.5" style={{ color: 'var(--text-tertiary)' }}>
          <Info className="h-3.5 w-3.5 flex-shrink-0 mt-px" />
          A Justiça Eleitoral às vezes junta ou renumera zonas entre eleições: uma zona que aparece só num dos anos pode ser essa mudança, e não ganho ou perda de verdade.
        </p>
      )}
      <PlacarEvolucao lados={lados} linhas={linhas} />
      <GradeMapa
        mapa={(
          <CartaoMapa
            titulo={visaoEfetiva === 'bairros' ? `Variação em cada ${rotuloArea.toLowerCase()}` : 'Variação em cada zona eleitoral'}
            dica="Passe o mouse para ver os votos" legenda={<LegendaEvolucao />}>
            <MapaCidadeComparacao
              pontos={pontos} poligonos={poligonosMapa} foco={foco}
              versao={`${visaoEfetiva}|${a.id}|${a.turno}|${b.id}|${b.turno}|${locais.length}|${poligonos ? 1 : 0}`}
              enquadramento={`${uf}|${municipio}|${visaoEfetiva === 'bairros' && poligonos ? 'pol' : 'pts'}`}
            />
          </CartaoMapa>
        )}
        lateral={<PainelBalanco linhas={linhas} nomeArea={nomeArea} />}
      />
      <GanhosEPerdas linhas={linhas} />
      <TabelaEvolucao linhas={linhas} lados={lados} rotuloArea={rotuloArea}
        todasAsAreas={visaoEfetiva === 'bairros' ? todosOsDe(rotulo) : 'Todas as zonas'} />
    </div>
  );
}

// ── Tela principal ───────────────────────────────────────────────────────────
export function EvolucaoCandidato() {
  const [abrangencia, setAbrangencia] = useState('SP');
  const [lados, setLados] = useState<[Lado, Lado]>([
    { ano: '2018', turno: 1, busca: '', homonimos: [], dados: null },
    { ano: '2022', turno: 1, busca: '', homonimos: [], dados: null },
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

  const naoDisputou = (ano: string) => `Esse candidato não aparece no 2º turno de ${ano}. Confira se ele disputou o 2º turno.`;

  const escolherCandidato = async (i: number, id: string, ano = lados[i].ano, turno = lados[i].turno) => {
    setBuscando(i);
    const d = await carregarCandidato(id, ano, escopo, turno);
    setBuscando(null);
    if (!d) { setErro(turno === 2 ? naoDisputou(ano) : 'Não foi possível carregar esse candidato agora.'); return; }
    setErro('');
    atualizar(i, { ano, turno, dados: d, homonimos: [], busca: '' });
  };

  // Trocar o turno mantém o candidato (o id é o mesmo nos dois turnos).
  const trocarTurno = async (i: number, turno: 1 | 2) => {
    const lado = lados[i];
    if (lado.turno === turno) return;
    if (!lado.dados) { atualizar(i, { turno, homonimos: [] }); return; }
    setBuscando(i);
    const d = await carregarCandidato(lado.dados.candidatoId, lado.ano, escopo, turno);
    setBuscando(null);
    if (!d) { setErro(turno === 2 ? naoDisputou(lado.ano) : 'Não foi possível carregar esse candidato agora.'); return; }
    setErro('');
    atualizar(i, { turno, dados: d, homonimos: [] });
  };

  const buscar = async (i: number) => {
    const lado = lados[i];
    const nome = lado.busca.trim();
    if (!nome) { setErro('Digite o nome do candidato.'); return; }
    if (escopo === 'BR' && ehAnoMunicipal(lado.ano)) { setErro(`Em ${lado.ano} a eleição foi municipal: escolha um estado.`); return; }
    setBuscando(i);
    setErro('');
    try {
      const res = await fetch(`/api/tse/candidato?${new URLSearchParams({ candidato: nome, ano: lado.ano, uf: escopo, turno: String(lado.turno) })}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(lado.turno === 2 ? `Não encontramos esse nome no 2º turno de ${lado.ano}. Confira se o candidato disputou o 2º turno.` : escopo === 'BR' ? 'Em "Brasil" só aparecem candidatos a presidente. Para outros cargos, escolha o estado.' : (d?.error ?? 'Candidato não encontrado.'));
        return;
      }
      if (d?.multiplos) { atualizar(i, { homonimos: d.candidatos ?? [] }); return; }
      if (d?.candidatoId) atualizar(i, { dados: d, homonimos: [], busca: '' });
    } catch { setErro('Não foi possível buscar agora. Tente de novo.'); }
    finally { setBuscando(null); }
  };

  const [A, B] = lados;
  const pronto = !!A.dados && !!B.dados;
  // Com algum lado no 2º turno, o turno entra no rótulo dos dois lados.
  const comTurno = A.turno === 2 || B.turno === 2;
  const eleicao = (l: Lado) => (comTurno ? `${l.ano} (${l.turno}º turno)` : l.ano);
  const eleA = eleicao(A), eleB = eleicao(B);
  const rotA = `${eleA} · ${nomeDe(A.dados)}`;
  const rotB = `${eleB} · ${nomeDe(B.dados)}`;
  const titulo = nomeDe(A.dados) === nomeDe(B.dados)
    ? `Evolução de ${nomeDe(A.dados)} — ${eleA} × ${eleB}`
    : `${nomeDe(A.dados)} (${eleA}) × ${nomeDe(B.dados)} (${eleB})`;

  const dadosNoNivel = (i: 0 | 1) => (escopo === 'BR' && ufAberta ? dadosUf?.[i] ?? null : lados[i].dados);
  // O DF é uma cidade só (Brasília): abre direto nas regiões administrativas.
  const ehDf = escopo === 'DF' || ufAberta === 'DF';
  const cidadeAtual = cidadeAberta ?? (ehDf && pronto
    ? Object.keys(dadosNoNivel(1)?.votosPorNomeMunicipio ?? dadosNoNivel(0)?.votosPorNomeMunicipio ?? {})[0] ?? 'BRASÍLIA'
    : null);
  const nivel: 'brasil' | 'estado' | 'cidade' = cidadeAtual ? 'cidade' : escopo === 'BR' && !ufAberta ? 'brasil' : 'estado';
  const ufAtual = ufAberta ?? escopo;

  const abrirUf = async (uf: string) => {
    if (!A.dados || !B.dados) return;
    setUfAberta(uf);
    setCidadeAberta(null);
    setDadosUf(null);
    const r = await Promise.all([carregarCandidato(A.dados.candidatoId, A.ano, uf, A.turno), carregarCandidato(B.dados.candidatoId, B.ano, uf, B.turno)]);
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
    return ap ? { ...ap, html: htmlEvolucao(nome, rotA, rotB, a, b, nivel === 'brasil' ? 'Estado' : 'Cidade') } : null;
  };


  const opcoesAnos = (i: number) => ANOS.filter(a => !(escopo === 'BR' && ehAnoMunicipal(a))).map(a => ({ value: a, label: a }));
  // Cor de cada lado pelo partido; o mesmo candidato nos dois anos fica com a mesma cor.
  const coresLados = coresDosCandidatos([A.dados?.partido, B.dados?.partido]);
  // O TSE muda o número do candidato a cada eleição: o mesmo é reconhecido pelo nome.
  const mesmo = !!A.dados && !!B.dados && semAcento(nomeDe(A.dados)) === semAcento(nomeDe(B.dados));
  const ladosVisuais: [LadoVisual, LadoVisual] = [
    { nome: nomeDe(A.dados), ano: eleA, partido: A.dados?.partido ?? '', cor: coresLados[0] },
    { nome: nomeDe(B.dados), ano: eleB, partido: B.dados?.partido ?? '', cor: mesmo ? coresLados[0] : coresLados[1] },
  ];

  const passos: Passo[] = [
    ...(escopo === 'BR' ? [{ rotulo: 'Brasil', onClick: voltarAoInicio }] : []),
    ...(nivel !== 'brasil' ? [{ rotulo: nomeDaUf(ufAtual), onClick: ehDf ? undefined : () => setCidadeAberta(null) }] : []),
    ...(nivel === 'cidade' && !ehDf ? [{ rotulo: cidadeAtual! }] : []),
  ];

  // Atalho: o candidato do "antes" no 2º turno do mesmo ano, sem digitar de novo.
  const atalhoSegundoTurno = (lado: Lado, i: number) => {
    if (i !== 1 || lado.dados || !A.dados?.segundoTurno || A.turno !== 1) return null;
    return (
      <button type="button" onClick={() => escolherCandidato(1, A.dados!.candidatoId, A.ano, 2)} disabled={buscando !== null}
        className="w-full flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all hover:opacity-80"
        style={{ color: 'var(--acento-azul)', background: 'rgba(37,99,235,0.08)', border: '1px dashed rgba(37,99,235,0.35)' }}>
        <ArrowRight className="h-3.5 w-3.5 flex-shrink-0" /> Usar {nomeDe(A.dados)} no 2º turno de {A.ano}
      </button>
    );
  };

  const cartaoLado = (lado: Lado, i: number) => (
    <div key={i} className="rounded-xl p-3 sm:p-4 space-y-3 min-w-0"
      style={{
        border: lado.dados ? `1px solid ${comAlfa(ladosVisuais[i].cor, 0.35)}` : '1px solid var(--border-default)',
        background: lado.dados ? `linear-gradient(135deg, ${comAlfa(ladosVisuais[i].cor, 0.08)}, transparent 70%)` : 'var(--bg-card-subtle)',
      }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--text-tertiary)' }}>
          {i === 0 ? 'Antes' : 'Depois'}
        </span>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg p-0.5 text-xs h-9" style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--border-default)' }}>
            {([1, 2] as const).map(t => (
              <button key={t} type="button" onClick={() => trocarTurno(i, t)} disabled={buscando !== null}
                className="px-2.5 rounded-md font-semibold whitespace-nowrap transition-all"
                style={lado.turno === t ? { background: 'var(--brand-cobalt)', color: '#fff', boxShadow: '0 4px 12px -4px rgba(37,99,235,0.6)' } : { color: 'var(--text-secondary)' }}>
                {t}º turno
              </button>
            ))}
          </div>
          <div className="w-24">
            <Select value={lado.ano} onChange={(e) => atualizar(i, { ano: e.target.value, dados: null, homonimos: [] })} options={opcoesAnos(i)} />
          </div>
        </div>
      </div>
      {lado.dados ? (
        <div className="flex items-center gap-3 min-w-0">
          <Avatar nome={nomeDe(lado.dados)} cor={ladosVisuais[i].cor} tamanho={44} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold leading-tight break-words" style={{ color: 'var(--text-primary)' }}>{nomeDe(lado.dados)}</span>
            <span className="block text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{lado.dados.partido} · {lado.dados.cargo}</span>
            <span className="block text-[11px] font-semibold tabular-nums" style={{ color: 'var(--text-secondary)' }}>{fmt(lado.dados.totalVotos)} votos</span>
          </span>
          <button type="button" onClick={() => atualizar(i, { dados: null })} className="self-start p-1 rounded-md hover:bg-[var(--tint-08)]" aria-label="Trocar candidato">
            <X className="h-3.5 w-3.5" style={{ color: 'var(--text-tertiary)' }} />
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none" style={{ color: 'var(--text-tertiary)' }} />
            <Input value={lado.busca} onChange={(e) => setLados(p => p.map((l, j) => (j === i ? { ...l, busca: e.target.value } : l)) as [Lado, Lado])}
              onKeyDown={(e) => { if (e.key === 'Enter') buscar(i); }} placeholder="Nome do candidato" className="pl-8" />
          </div>
          <Button onClick={() => buscar(i)} disabled={buscando !== null} aria-label="Escolher candidato">
            {buscando === i ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>
      )}
      {atalhoSegundoTurno(lado, i)}
      {lado.homonimos.length > 0 && (
        <div className="max-h-48 overflow-y-auto scrollbar-dark rounded-lg" style={{ border: '1px solid var(--border-default)', background: 'var(--bg-card)' }}>
          {lado.homonimos.map(h => (
            <button key={h.id} type="button" onClick={() => escolherCandidato(i, h.id)}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-left hover:bg-[var(--tint-06)]">
              <span className="min-w-0">
                <span className="block text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{h.nomeUrna}</span>
                <span className="block text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{h.partido} · {h.cargo}</span>
              </span>
              <span className="text-xs font-semibold flex-shrink-0 tabular-nums" style={{ color: 'var(--acento-azul)' }}>{fmt(h.totalVotos)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <Painel titulo="Montar a evolução" icone={TrendingUp}>
        <div className="space-y-1 sm:max-w-sm">
          <label className="block text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--text-tertiary)' }}>Onde comparar</label>
          <Select value={abrangencia} onChange={(e) => { setAbrangencia(e.target.value); setLados(p => [{ ...p[0], dados: null, homonimos: [] }, { ...p[1], dados: null, homonimos: [] }]); voltarAoInicio(); }}
            options={[{ value: 'BR', label: 'Brasil (presidente)' }, ...ESTADOS_BRASIL.map(e => ({ value: e.sigla, label: e.nome }))]} />
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-center">
          {cartaoLado(A, 0)}
          <span className="mx-auto w-9 h-9 rounded-full flex items-center justify-center rotate-90 md:rotate-0"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)', color: 'var(--text-tertiary)' }}>
            <ArrowRight className="w-4 h-4" />
          </span>
          {cartaoLado(B, 1)}
        </div>
        {erro && (
          <p className="mt-3 text-xs flex items-start gap-1.5 rounded-lg px-3 py-2" style={{ color: 'var(--danger)', background: 'var(--danger-soft)' }}>
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-px" /> {erro}
          </p>
        )}
      </Painel>

      {!pronto ? (
        <EstadoVazio
          titulo="Escolha o candidato de cada eleição"
          texto="Pode ser o mesmo candidato em dois anos, no 1º e no 2º turno, ou dois candidatos diferentes. O mapa mostra onde os votos cresceram e onde caíram."
        />
      ) : (
        <>
          <Trilha
            passos={passos}
            meta={`${eleA} → ${eleB}`}
            acoes={nivel !== 'cidade' && (
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
          />

          {nivel === 'cidade' ? (
            <EvolucaoCidade
              uf={ufAtual} municipio={cidadeAtual!} rotA={rotA} rotB={rotB} titulo={titulo} lados={ladosVisuais}
              a={{ id: A.dados!.candidatoId, ano: A.ano, turno: A.turno, zonas: dadosNoNivel(0)?.zonas }}
              b={{ id: B.dados!.candidatoId, ano: B.ano, turno: B.turno, zonas: dadosNoNivel(1)?.zonas }}
            />
          ) : (
            <>
              <PlacarEvolucao lados={ladosVisuais} linhas={linhas} />
              <GradeMapa
                mapa={(
                  <CartaoMapa
                    titulo={nivel === 'brasil' ? 'Variação em cada estado' : `Variação em cada cidade de ${nomeDaUf(ufAtual)}`}
                    dica={nivel === 'brasil' ? 'Selecione um estado para ver as cidades.' : 'Selecione uma cidade para ver por bairro e zona.'}
                    legenda={<LegendaEvolucao />}
                  >
                    <MapaComparacao
                      tipo={nivel === 'brasil' ? 'brasil' : 'estado'}
                      uf={nivel === 'estado' ? ufAtual : undefined}
                      aparencia={aparencia}
                      versao={`${A.dados!.candidatoId}|${B.dados!.candidatoId}|${A.ano}|${A.turno}|${B.ano}|${B.turno}|${ufAberta}|${dadosUf ? 1 : 0}`}
                      altura="100%"
                      onClickArea={nivel === 'brasil' ? (uf) => abrirUf(uf) : (_c, nome) => setCidadeAberta(nome)}
                    />
                    {escopo === 'BR' && ufAberta && !dadosUf && (
                      <div className="absolute inset-0 z-[500] flex items-center justify-center" style={{ background: 'rgba(15,23,42,0.35)', backdropFilter: 'blur(2px)' }}>
                        <Loader2 className="h-7 w-7 animate-spin text-white" />
                      </div>
                    )}
                  </CartaoMapa>
                )}
                lateral={<PainelBalanco linhas={linhas} nomeArea={nivel === 'brasil' ? 'estados' : 'cidades'} />}
              />
              <GanhosEPerdas linhas={linhas} />
              <TabelaEvolucao
                linhas={linhas} lados={ladosVisuais}
                rotuloArea={nivel === 'brasil' ? 'Estado' : 'Cidade'}
                todasAsAreas={nivel === 'brasil' ? 'Todos os estados' : 'Todas as cidades'}
                onClickLinha={nivel === 'brasil' ? (l) => { if (l.chave !== 'ZZ') abrirUf(l.chave); } : (l) => setCidadeAberta(l.nome)}
                dicaClique={nivel === 'brasil' ? 'Selecione um estado para abrir' : 'Selecione uma cidade para abrir'}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
