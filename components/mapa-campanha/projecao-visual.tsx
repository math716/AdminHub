'use client';

// Peças da tela da projeção (Projeto de Campanha): cabeçalho do candidato,
// faixa de números, cenários, linha da lista de cidades e a análise abaixo do
// mapa. Mesmo padrão do Mapa Eleitoral; só desenho — as contas vêm da página.

import { useMemo, useState } from 'react';
import { ArrowRight, Flag, Handshake, List, PieChart, Save, Trash2, TrendingUp, UserCheck, type LucideIcon } from 'lucide-react';
import { Avatar, BarraDividida, BarraSimples, CampoFiltro, Painel, Rosca, comAlfa, pctBR } from '@/components/mapa/comparacao-visual';
import { corDoCargo, rotuloCargo } from './visual';

const fmt = (n: number) => Math.round(n).toLocaleString('pt-BR');
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ── Cabeçalho do candidato ───────────────────────────────────────────────────
export type AbaProjecao = 'historico' | 'projecao';

export function CabecalhoProjecao({ nome, cargo, estado, anoBase, anoProjecao, estreante, abas, abaAtiva, onAba, corCenario, onSalvar, salvando }: {
  nome: string;
  cargo: string;
  estado: string;
  anoBase: number | string;
  anoProjecao: number | string;
  estreante: boolean;
  abas: Array<{ chave: AbaProjecao; rotulo: string; icone: LucideIcon }>;
  abaAtiva: AbaProjecao;
  onAba: (a: AbaProjecao) => void;
  /** Cor do cenário ativo — pinta a aba Projeção. */
  corCenario: string;
  onSalvar: () => void;
  salvando: boolean;
}) {
  const cor = corDoCargo(cargo);
  return (
    <section className="relative rounded-2xl px-4 py-3 sm:px-5 overflow-hidden"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}>
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: `linear-gradient(180deg, ${cor}, ${comAlfa(cor, 0.2)})` }} />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-5">
        {/* Quem */}
        <div className="flex items-center gap-3 min-w-0 lg:flex-1">
          <Avatar nome={nome} cor={cor} tamanho={46} />
          <div className="min-w-0">
            <p className="text-lg sm:text-xl font-bold leading-tight break-words" style={{ color: 'var(--text-primary)' }}>{nome}</p>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {cargo && <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{rotuloCargo(cargo)}</span>}
              {cargo && <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>·</span>}
              <span className="px-1.5 py-0.5 rounded-md text-[11px] font-bold" style={{ background: 'var(--tint-06)', color: 'var(--text-secondary)' }}>{estado}</span>
              {estreante ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold"
                  style={{ background: 'rgba(16,185,129,0.12)', color: 'var(--success)' }}>
                  <UserCheck className="h-3 w-3" /> Estreante
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded-md text-[11px] font-semibold" style={{ background: 'var(--tint-06)', color: 'var(--text-secondary)' }}>Eleição {anoBase}</span>
              )}
              <ArrowRight className="h-3 w-3" style={{ color: 'var(--text-tertiary)' }} />
              <span className="px-1.5 py-0.5 rounded-md text-[11px] font-bold" style={{ background: comAlfa(corCenario, 0.14), color: corCenario }}>Projeção {anoProjecao}</span>
            </div>
          </div>
        </div>

        {/* Abas + salvar */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 lg:flex-shrink-0">
          <div className="flex items-center rounded-xl p-1 gap-0.5 w-full sm:w-auto"
            style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--border-default)' }}>
            {abas.map(a => {
              const ativa = a.chave === abaAtiva;
              const corAba = a.chave === 'projecao' ? corCenario : '#2563eb';
              const Icone = a.icone;
              return (
                <button key={a.chave} type="button" onClick={() => onAba(a.chave)}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold transition-all"
                  style={ativa
                    ? { background: corAba, color: '#fff', boxShadow: `0 6px 16px -6px ${comAlfa(corAba, 0.7)}` }
                    : { color: 'var(--text-secondary)' }}>
                  <Icone className="h-4 w-4" />
                  {a.rotulo}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={onSalvar} disabled={salvando}
            className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 6px 16px -6px rgba(16,185,129,0.7)' }}>
            <Save className="h-4 w-4" />
            {salvando ? 'Salvando…' : 'Salvar projeção'}
          </button>
        </div>
      </div>
    </section>
  );
}

// ── Indicador (faixa de números) ─────────────────────────────────────────────
export function Indicador({ icone: Icone, rotulo, valor, cor, detalhe, destaque = false, apagado = false, acao, children }: {
  icone: LucideIcon;
  rotulo: string;
  valor: React.ReactNode;
  cor: string;
  detalhe?: React.ReactNode;
  /** Moldura na cor (filtro ativo ligado a este número). */
  destaque?: boolean;
  /** Fora da simulação (ex.: parcerias ocultas). */
  apagado?: boolean;
  /** Botão no canto (ex.: mostrar/ocultar parcerias). */
  acao?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative rounded-2xl p-3.5 min-w-0"
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${destaque ? comAlfa(cor, 0.55) : 'var(--border-default)'}`,
        boxShadow: destaque ? `0 0 0 3px ${comAlfa(cor, 0.12)}, var(--shadow-card)` : 'var(--shadow-card)',
      }}>
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: comAlfa(cor, 0.12), color: cor, border: `1px solid ${comAlfa(cor, 0.22)}` }}>
          <Icone className="w-3.5 h-3.5" />
        </span>
        <p className="text-[10px] uppercase tracking-widest font-bold flex-1 min-w-0 truncate" style={{ color: 'var(--text-tertiary)' }}>{rotulo}</p>
        {acao}
      </div>
      <div className={`transition-opacity ${apagado ? 'opacity-50' : ''}`}>
        <p className="text-xl font-bold tabular-nums leading-tight mt-2 break-words" style={{ color: 'var(--text-primary)' }}>{valor}</p>
        {detalhe && <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{detalhe}</p>}
        {children && <div className="mt-2">{children}</div>}
      </div>
    </div>
  );
}

// ── Cenários ─────────────────────────────────────────────────────────────────
export interface CenarioInfo<C extends string = string> {
  chave: C;
  rotulo: string;
  descricao: string;
  icone: LucideIcon;
  cor: string;
  meta: number;
}

export function PainelCenarios<C extends string>({ cenarios, ativo, onEscolher, base, anoBase, anoProjecao, parcerias }: {
  cenarios: CenarioInfo<C>[];
  ativo: C;
  onEscolher: (chave: C) => void;
  base: number;
  anoBase: number | string;
  anoProjecao: number | string;
  /** Votos que vêm das parcerias no cenário ativo (0 se ocultas). */
  parcerias: number;
}) {
  const atual = cenarios.find(c => c.chave === ativo) ?? cenarios[0];
  const maior = Math.max(...cenarios.map(c => c.meta), base, 1);
  const crescimento = atual.meta - base - parcerias;
  const variacao = base > 0 ? (atual.meta - base) / base : null;

  return (
    <section className="rounded-2xl p-4 flex flex-col gap-3 h-full min-h-0 overflow-y-auto scrollbar-dark"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}>
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--brand-cobalt-soft)', color: 'var(--brand-cobalt-text)' }}>
          <Flag className="w-3.5 h-3.5" />
        </span>
        <h3 className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--text-tertiary)' }}>Cenário de projeção</h3>
      </div>

      {/* Os três com a sua meta: dá para comparar sem clicar */}
      <div className="flex flex-col gap-2">
        {cenarios.map(c => {
          const isAtivo = c.chave === ativo;
          const Icone = c.icone;
          return (
            <button key={c.chave} type="button" onClick={() => onEscolher(c.chave)}
              className="w-full text-left rounded-xl px-3 py-2.5 transition-all"
              style={isAtivo
                ? { background: comAlfa(c.cor, 0.12), border: `1.5px solid ${c.cor}`, boxShadow: `0 6px 18px -10px ${comAlfa(c.cor, 0.9)}` }
                : { background: 'transparent', border: '1.5px solid var(--border-default)' }}>
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={isAtivo ? { background: c.cor, color: '#fff' } : { background: comAlfa(c.cor, 0.14), color: c.cor }}>
                  <Icone className="w-3.5 h-3.5" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>{c.rotulo}</span>
                  <span className="block text-[11px] leading-tight mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{c.descricao}</span>
                </span>
                <span className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: isAtivo ? c.cor : 'var(--text-secondary)' }}>{fmt(c.meta)}</span>
              </div>
              <div className="mt-2">
                <BarraSimples fracao={c.meta / maior} cor={isAtivo ? c.cor : comAlfa(c.cor, 0.55)} altura={5} />
              </div>
            </button>
          );
        })}
      </div>

      {/* Meta do cenário ativo e de onde ela vem */}
      <div className="mt-auto pt-3 space-y-2.5" style={{ borderTop: '1px solid var(--border-default)' }}>
        <div>
          <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--text-tertiary)' }}>Meta total · {anoProjecao}</p>
          <p className="text-2xl font-bold tabular-nums leading-tight" style={{ color: atual.cor }}>{fmt(atual.meta)}</p>
          {base > 0 && (
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              Base {anoBase}: {fmt(base)}
              {variacao !== null && (
                <span className="font-semibold" style={{ color: variacao >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {' · '}{variacao >= 0 ? '+' : ''}{pctBR(variacao)}
                </span>
              )}
            </p>
          )}
        </div>
        {base > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--text-tertiary)' }}>De onde vem a meta</p>
            <BarraDividida altura={9} partes={[
              { chave: 'base', valor: Math.max(0, Math.min(base, atual.meta - parcerias)), cor: '#64748b', rotulo: `Base ${anoBase}` },
              { chave: 'cresc', valor: Math.max(0, crescimento), cor: atual.cor, rotulo: 'Crescimento' },
              { chave: 'parc', valor: Math.max(0, parcerias), cor: '#d97706', rotulo: 'Parcerias' },
            ]} />
            <ul className="space-y-1 text-[11px]">
              <LinhaComposicao cor="#64748b" rotulo={`Votos de ${anoBase}`} valor={fmt(base)} />
              <LinhaComposicao cor={atual.cor} rotulo={crescimento >= 0 ? 'Crescimento' : 'Abaixo da base'}
                valor={`${crescimento >= 0 ? '+' : '−'}${fmt(Math.abs(crescimento))}`} />
              {parcerias > 0 && <LinhaComposicao cor="#d97706" rotulo="Parcerias" valor={`+${fmt(parcerias)}`} />}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function LinhaComposicao({ cor, rotulo, valor }: { cor: string; rotulo: string; valor: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cor }} />
      <span className="flex-1" style={{ color: 'var(--text-secondary)' }}>{rotulo}</span>
      <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{valor}</span>
    </li>
  );
}

// ── Linha da lista de cidades ────────────────────────────────────────────────
export function LinhaMunicipio({ posicao, nome, base, meta, anoBase, maiorMeta, cor, novo, dobrada, dobradaNome, prioridadeAlta, extra, onClick, onRemover }: {
  posicao: number;
  nome: string;
  base: number;
  meta: number;
  anoBase: number | string;
  /** Maior meta da lista — escala da barra. */
  maiorMeta: number;
  cor: string;
  novo: boolean;
  dobrada: boolean;
  dobradaNome?: string;
  prioridadeAlta: boolean;
  /** Selo a mais (ex.: "+120 bairros"). */
  extra?: React.ReactNode;
  onClick: () => void;
  onRemover?: () => void;
}) {
  const diff = meta - base;
  const pct = base > 0 ? Math.round((diff / base) * 100) : null;
  return (
    <div role="button" tabIndex={0} onClick={onClick} onKeyDown={e => { if (e.key === 'Enter') onClick(); }}
      className="group relative px-3.5 py-2.5 cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
      style={{ borderBottom: '1px solid var(--tint-06)' }}>
      {(novo || dobrada) && (
        <span aria-hidden className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r"
          style={{ background: novo ? '#10b981' : '#3b82f6' }} />
      )}
      <div className="flex items-center gap-2">
        <span className="text-[10.5px] font-bold tabular-nums w-6 text-right flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>{posicao}</span>
        <span className="flex-1 min-w-0 text-[13px] font-semibold truncate" style={{ color: 'var(--text-primary)' }} title={nome}>{nome}</span>
        <span className="flex items-center gap-1 flex-shrink-0">
          {novo && <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(16,185,129,0.14)', color: 'var(--success)' }}>NOVO</span>}
          {prioridadeAlta && <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--danger)' }} title="Prioridade alta">ALTA</span>}
          {dobrada && <Handshake className="h-3.5 w-3.5" style={{ color: '#3b82f6' }} />}
          {extra}
          {onRemover && (
            <button type="button" onClick={e => { e.stopPropagation(); onRemover(); }}
              className="p-0.5 rounded acao-no-hover transition-opacity hover:text-red-400" style={{ color: 'var(--text-tertiary)' }}
              title="Remover da projeção" aria-label="Remover da projeção">
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </span>
      </div>
      <div className="flex items-center gap-1.5 mt-1 pl-8 text-[11px] tabular-nums">
        {novo ? (
          <span style={{ color: 'var(--text-tertiary)' }}>Sem votos em {anoBase} →</span>
        ) : (
          <>
            <span style={{ color: 'var(--text-tertiary)' }}>{anoBase}</span>
            <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>{fmt(base)}</span>
            <ArrowRight className="h-3 w-3" style={{ color: 'var(--text-tertiary)' }} />
          </>
        )}
        <span className="font-bold" style={{ color: cor }}>{fmt(meta)}</span>
        {pct !== null && diff !== 0 && (
          <span className="ml-auto font-semibold" style={{ color: diff > 0 ? 'var(--success)' : 'var(--danger)' }}>
            {diff > 0 ? '+' : ''}{pct}%
          </span>
        )}
      </div>
      <div className="mt-1.5 pl-8">
        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--tint-06)' }}>
          <div className="h-full rounded-full" style={{ width: `${Math.max(1.5, (meta / Math.max(maiorMeta, 1)) * 100)}%`, background: cor }} />
        </div>
      </div>
      {dobrada && dobradaNome && (
        <p className="mt-1 pl-8 text-[11px] truncate" style={{ color: '#3b82f6' }}>Dobrada com {dobradaNome}</p>
      )}
    </div>
  );
}

// ── Análise da projeção (abaixo do mapa) ─────────────────────────────────────
export interface LinhaProjecao {
  nome: string;
  base: number;
  meta: number;
  prioridade?: string;
  dobrada: boolean;
  parceria: boolean;
}

const FAIXAS = [
  { chave: 'top1', de: 0, ate: 1, cor: '#2563eb', rotulo: 'Maior cidade' },
  { chave: 'top2a5', de: 1, ate: 5, cor: '#0891b2', rotulo: 'Da 2ª à 5ª' },
  { chave: 'top6a10', de: 5, ate: 10, cor: '#7c3aed', rotulo: 'Da 6ª à 10ª' },
  { chave: 'resto', de: 10, ate: Infinity, cor: '#94a3b8', rotulo: 'Demais cidades' },
] as const;

const COR_PRIORIDADE = { ALTA: '#dc2626', MEDIA: '#d97706', BAIXA: '#64748b' } as const;
const ROTULO_PRIORIDADE = { ALTA: 'Alta', MEDIA: 'Média', BAIXA: 'Baixa' } as const;

export function AnaliseProjecao({ linhas, cor, rotuloCenario, anoBase, anoProjecao, onClickLinha }: {
  linhas: LinhaProjecao[];
  /** Cor do cenário ativo. */
  cor: string;
  rotuloCenario: string;
  anoBase: number | string;
  anoProjecao: number | string;
  onClickLinha: (nome: string) => void;
}) {
  const ordenadas = useMemo(() => [...linhas].sort((a, b) => b.meta - a.meta || b.base - a.base), [linhas]);
  const [texto, setTexto] = useState('');
  const total = ordenadas.reduce((s, l) => s + l.meta, 0);
  // Com uma ou duas cidades (vereador, prefeito) não há o que analisar aqui.
  if (ordenadas.length < 3 || total <= 0) return null;

  const soma = (de: number, ate: number) => ordenadas.slice(de, ate === Infinity ? undefined : ate).reduce((s, l) => s + l.meta, 0);
  const fatias = FAIXAS.map(f => ({ ...f, valor: soma(f.de, f.ate) })).filter(f => f.valor > 0);

  // Onde a meta pede mais votos do que a base: o esforço do cenário.
  const crescer = ordenadas.filter(l => l.meta - l.base > 0).sort((a, b) => (b.meta - b.base) - (a.meta - a.base));
  const maiorGanho = crescer[0] ? crescer[0].meta - crescer[0].base : 0;

  const prioridades = (['ALTA', 'MEDIA', 'BAIXA'] as const).map(p => {
    const doGrupo = ordenadas.filter(l => (l.prioridade ?? 'MEDIA') === p);
    return { p, qtd: doGrupo.length, meta: doGrupo.reduce((s, l) => s + l.meta, 0) };
  });

  const alvo = semAcento(texto.trim());
  const visiveis = ordenadas.map((l, i) => ({ l, pos: i + 1 })).filter(x => !alvo || semAcento(x.l.nome).includes(alvo));
  const maiorMeta = ordenadas[0].meta;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-12 gap-4">
        <Painel titulo="Onde está a meta" icone={PieChart} className="xl:col-span-4">
          <div className="flex flex-col sm:flex-row items-center gap-5">
            <Rosca fatias={fatias.map(f => ({ chave: f.chave, valor: f.valor, cor: f.cor }))} centro={fmt(ordenadas.length)} rotuloCentro="cidades" tamanho={140} />
            <ul className="flex-1 w-full space-y-2.5">
              {fatias.map(f => (
                <li key={f.chave} className="flex items-center gap-2 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: f.cor }} />
                  <span className="flex-1" style={{ color: 'var(--text-secondary)' }}>{f.rotulo}</span>
                  <span className="font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{pctBR(f.valor / total)}</span>
                </li>
              ))}
            </ul>
          </div>
        </Painel>

        <Painel titulo="Onde dá para crescer" icone={TrendingUp} className="xl:col-span-5">
          {crescer.length === 0 ? (
            <p className="text-xs py-6 text-center" style={{ color: 'var(--text-tertiary)' }}>
              No cenário {rotuloCenario.toLowerCase()}, nenhuma cidade tem meta acima dos votos de {anoBase}.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {crescer.slice(0, 8).map(l => {
                const ganho = l.meta - l.base;
                return (
                  <li key={l.nome}>
                    <button type="button" onClick={() => onClickLinha(l.nome)} className="w-full text-left group">
                      <div className="flex items-baseline justify-between gap-3 mb-1">
                        <span className="text-xs font-medium truncate group-hover:underline" style={{ color: 'var(--text-primary)' }}>{l.nome}</span>
                        <span className="text-xs font-bold tabular-nums whitespace-nowrap" style={{ color: 'var(--success)' }}>
                          +{fmt(ganho)}{' '}
                          <span className="font-medium" style={{ color: 'var(--text-tertiary)' }}>
                            {l.base > 0 ? `(${fmt(l.base)} → ${fmt(l.meta)})` : '(cidade nova)'}
                          </span>
                        </span>
                      </div>
                      <BarraSimples fracao={ganho / maiorGanho} cor={`linear-gradient(90deg, ${comAlfa('#10b981', 0.5)}, #10b981)`} altura={7} />
                    </button>
                  </li>
                );
              })}
              {crescer.length > 8 && (
                <li className="text-[11px] pt-1" style={{ color: 'var(--text-tertiary)' }}>
                  Mais {fmt(crescer.length - 8)} {crescer.length - 8 === 1 ? 'cidade' : 'cidades'} com meta acima da base — estão na tabela abaixo.
                </li>
              )}
            </ul>
          )}
        </Painel>

        <Painel titulo="Prioridades" icone={Flag} className="lg:col-span-2 xl:col-span-3">
          <ul className="space-y-3">
            {prioridades.map(({ p, qtd, meta }) => (
              <li key={p}>
                <div className="flex items-baseline justify-between gap-2 mb-1 text-xs">
                  <span className="flex items-center gap-1.5 font-semibold" style={{ color: 'var(--text-primary)' }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: COR_PRIORIDADE[p] }} />{ROTULO_PRIORIDADE[p]}
                  </span>
                  <span className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                    {fmt(qtd)} {qtd === 1 ? 'cidade' : 'cidades'} · <b style={{ color: 'var(--text-primary)' }}>{pctBR(meta / total, 0)}</b>
                  </span>
                </div>
                <BarraSimples fracao={meta / total} cor={COR_PRIORIDADE[p]} altura={6} />
              </li>
            ))}
          </ul>
          <p className="text-[11px] mt-3" style={{ color: 'var(--text-tertiary)' }}>
            Quanto da meta está em cada prioridade. A prioridade de cada cidade é definida ao editá-la.
          </p>
        </Painel>
      </div>

      <Painel
        titulo={<>Todas as cidades <span className="normal-case tracking-normal font-semibold">({fmt(ordenadas.length)})</span></>}
        icone={List}
        direita={<CampoFiltro valor={texto} onChange={setTexto} placeholder="Filtrar por cidade…" />}
        corpo="pt-3"
      >
        <div className="overflow-auto max-h-[560px] scrollbar-dark" style={{ borderTop: '1px solid var(--tint-06)' }}>
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
                <th className="text-right px-4 py-2.5 w-12" style={{ background: 'var(--bg-card-subtle)' }}>#</th>
                <th className="text-left px-3 py-2.5 min-w-[160px]" style={{ background: 'var(--bg-card-subtle)' }}>Cidade</th>
                <th className="text-right px-3 py-2.5 whitespace-nowrap" style={{ background: 'var(--bg-card-subtle)' }}>Votos {anoBase}</th>
                <th className="text-right px-3 py-2.5 whitespace-nowrap" style={{ background: 'var(--bg-card-subtle)' }}>Meta {anoProjecao}</th>
                <th className="text-right px-3 py-2.5" style={{ background: 'var(--bg-card-subtle)' }}>Diferença</th>
                <th className="text-left px-4 py-2.5 min-w-[140px]" style={{ background: 'var(--bg-card-subtle)' }}>% da meta</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: 'var(--text-tertiary)' }}>Nada encontrado com esse filtro.</td></tr>
              )}
              {visiveis.map(({ l, pos }) => {
                const diff = l.meta - l.base;
                return (
                  <tr key={l.nome} onClick={() => onClickLinha(l.nome)} className="cursor-pointer hover:bg-[var(--bg-hover)]"
                    style={{ borderTop: '1px solid var(--tint-06)' }}>
                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-tertiary)' }}>{pos}º</td>
                    <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--text-primary)' }}>
                      <span className="inline-flex items-center gap-1.5 flex-wrap">
                        {l.nome}
                        {l.dobrada && <Handshake className="h-3 w-3" style={{ color: '#3b82f6' }} />}
                        {l.parceria && <span className="text-[9.5px] font-bold px-1 rounded" style={{ background: 'rgba(217,119,6,0.14)', color: '#d97706' }}>PARCERIA</span>}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>{l.base > 0 ? fmt(l.base) : '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: 'var(--text-primary)' }}>{fmt(l.meta)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold"
                      style={{ color: diff > 0 ? 'var(--success)' : diff < 0 ? 'var(--danger)' : 'var(--text-tertiary)' }}>
                      {diff === 0 ? '—' : `${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff))}`}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2">
                        <span className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--tint-06)' }}>
                          <span className="block h-full rounded-full" style={{ width: `${(l.meta / maiorMeta) * 100}%`, background: cor }} />
                        </span>
                        <span className="tabular-nums w-12 text-right" style={{ color: 'var(--text-secondary)' }}>{pctBR(l.meta / total)}</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Painel>
    </div>
  );
}
