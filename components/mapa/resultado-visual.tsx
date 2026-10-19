'use client';

// Peças do modo Resultado do Mapa Eleitoral, no mesmo visual do comparador e
// da evolução (comparacao-visual): cartão do candidato, painel da área
// selecionada no mapa e a análise "onde estão os votos" com a tabela completa.

import { useMemo, useState } from 'react';
import { Calendar, List, MapPin, MousePointerClick, PieChart, Star, Trophy, Vote, X, type LucideIcon } from 'lucide-react';
import { campoDoPartido, coresDosCandidatos, NOME_CAMPO } from '@/lib/partidos-espectro';
import {
  Avatar, BarraSimples, CampoFiltro, Etiqueta, Painel, Pilulas, Rosca, comAlfa, pctBR,
} from '@/components/mapa/comparacao-visual';

const fmt = (n: number) => n.toLocaleString('pt-BR');
const semAcento = (s: string) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

// ── Cartão do candidato ──────────────────────────────────────────────────────
/** Cor da situação: eleito em verde, suplente em âmbar, não eleito em cinza. */
function corDaSituacao(situacao: string): string {
  const s = semAcento(situacao);
  if (s.includes('NAO ELEITO')) return '#64748b';
  if (s.includes('SUPLENTE')) return '#d97706';
  if (s.includes('ELEITO')) return '#16a34a';
  return '#2563eb';
}

export function CartaoCandidato({ nome, nomeUrna, partido, numero, ano, cargo, situacao, totalVotos, aviso, favorito, onFavoritar, turno, segundoTurno, onTurno, trocandoTurno }: {
  nome: string;
  nomeUrna?: string;
  partido: string;
  numero?: number;
  ano: number | string;
  cargo: string;
  situacao?: string;
  totalVotos: number;
  aviso?: string;
  favorito: boolean;
  onFavoritar: () => void;
  turno: number;
  segundoTurno?: boolean;
  onTurno: (t: 1 | 2) => void;
  trocandoTurno?: boolean;
}) {
  const cor = coresDosCandidatos([partido])[0];
  const exibido = nomeUrna || nome;
  return (
    <section className="rounded-2xl overflow-hidden"
      style={{
        background: 'var(--bg-card)',
        backgroundImage: `linear-gradient(160deg, ${comAlfa(cor, 0.12)} 0%, transparent 55%)`,
        border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)',
      }}>
      <div className="h-1" style={{ background: `linear-gradient(90deg, ${cor}, ${comAlfa(cor, 0.25)})` }} />
      <div className="p-4 space-y-3.5">
        <div className="flex items-start gap-3">
          <Avatar nome={exibido} cor={cor} tamanho={52} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--text-tertiary)' }}>Resultado</p>
            <p className="text-base font-bold leading-tight break-words" style={{ color: 'var(--text-primary)' }}>{nome}</p>
            {nomeUrna && nomeUrna !== nome && (
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Nome de urna: {nomeUrna}</p>
            )}
          </div>
          <button type="button" onClick={onFavoritar} disabled={favorito}
            className="p-1.5 rounded-lg transition-colors hover:bg-[var(--tint-06)] disabled:cursor-default"
            title={favorito ? 'Já está nos favoritos' : 'Guardar nos favoritos'} aria-label="Favoritar">
            <Star className="h-4 w-4" style={favorito ? { color: '#eab308', fill: '#eab308' } : { color: 'var(--text-tertiary)' }} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Etiqueta cor={cor}>{partido} · {NOME_CAMPO[campoDoPartido(partido)]}</Etiqueta>
          {numero ? <Etiqueta cor="#64748b">Nº {numero}</Etiqueta> : null}
          {situacao && <Etiqueta cor={corDaSituacao(situacao)} forte>{situacao}</Etiqueta>}
        </div>

        <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
          <Calendar className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
          {ano} · {cargo}
        </p>

        <div className="rounded-xl px-3.5 py-3" style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--tint-06)' }}>
          <p className="text-[10px] uppercase tracking-widest font-bold flex items-center gap-1.5" style={{ color: 'var(--text-tertiary)' }}>
            <Vote className="h-3 w-3" /> Total de votos{segundoTurno ? ` · ${turno}º turno` : ''}
          </p>
          <p className="text-3xl font-bold tabular-nums tracking-tight leading-tight mt-1" style={{ color: 'var(--text-primary)' }}>
            {fmt(totalVotos ?? 0)}
          </p>
        </div>

        {segundoTurno && (
          <div className={trocandoTurno ? 'opacity-60 pointer-events-none' : ''}>
            <Pilulas opcoes={[[1, '1º turno'], [2, '2º turno']] as const} valor={turno as 1 | 2} onChange={onTurno} />
          </div>
        )}

        {aviso && (
          <p className="text-xs rounded-lg px-3 py-2" style={{ color: 'var(--warning)', background: 'var(--warning-soft)' }}>{aviso}</p>
        )}
      </div>
    </section>
  );
}

// ── Painel lateral (título pequeno + ícone) ──────────────────────────────────
export function PainelLateral({ titulo, icone, direita, children, corpo = 'p-4' }: {
  titulo: string; icone: LucideIcon; direita?: React.ReactNode; children: React.ReactNode; corpo?: string;
}) {
  return <Painel titulo={titulo} icone={icone} direita={direita} corpo={corpo}>{children}</Painel>;
}

// ── Área selecionada no mapa (distrito, RA, bairro) ──────────────────────────
export function PainelAreaSelecionada({ sobre, nome, votos, total, rotuloTotal, nota, onFechar, children }: {
  sobre: string;
  nome: string;
  votos: number;
  /** Total do candidato no mapa, para o %. */
  total?: number;
  /** "de São Paulo", "do DF"… */
  rotuloTotal?: string;
  nota?: string;
  onFechar: () => void;
  children?: React.ReactNode;
}) {
  const fracao = total ? votos / total : 0;
  return (
    <section className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}>
      <div className="h-1" style={{ background: 'linear-gradient(90deg, #2563eb, rgba(37,99,235,0.2))' }} />
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest font-bold flex items-center gap-1.5" style={{ color: 'var(--text-tertiary)' }}>
              <MapPin className="h-3 w-3" /> {sobre}
            </p>
            <p className="text-sm font-bold leading-tight break-words mt-0.5" style={{ color: 'var(--text-primary)' }}>{nome}</p>
          </div>
          <button type="button" onClick={onFechar} className="p-1 rounded-md hover:bg-[var(--tint-08)] flex-shrink-0" aria-label="Fechar">
            <X className="h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
          </button>
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums leading-none" style={{ color: 'var(--text-primary)' }}>
            {fmt(votos)} <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>votos</span>
          </p>
          {total ? (
            <div className="mt-2.5 space-y-1">
              <BarraSimples fracao={fracao} cor="linear-gradient(90deg, rgba(37,99,235,0.6), #2563eb)" altura={7} />
              <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                <strong style={{ color: 'var(--text-primary)' }}>{pctBR(fracao)}</strong> {rotuloTotal ?? 'do total'}
              </p>
            </div>
          ) : null}
        </div>
        {children}
        {nota && <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{nota}</p>}
      </div>
    </section>
  );
}

// ── Moldura do mapa: título, dica e legenda ──────────────────────────────────
export function MolduraMapa({ titulo, dica, legenda = 'intensidade', children }: {
  titulo: string;
  dica?: string;
  /** intensidade = escala de "menos" a "mais votos"; presenca = "teve votos" / "sem votos". */
  legenda?: 'intensidade' | 'presenca';
  children: React.ReactNode;
}) {
  return (
    <div className="h-full flex flex-col">
      {/* pr-12: o botão de tela cheia fica no canto de cima do cartão. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pl-3 pr-12 pt-2 pb-2.5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{titulo}</h3>
          {dica && (
            <p className="text-[11px] flex items-center gap-1 mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              <MousePointerClick className="w-3 h-3 flex-shrink-0" />{dica}
            </p>
          )}
        </div>
        {legenda === 'presenca' ? <LegendaPresenca /> : <LegendaIntensidade />}
      </div>
      <div className="flex-1 min-h-0 relative rounded-xl overflow-hidden">{children}</div>
    </div>
  );
}

export function LegendaIntensidade() {
  return (
    <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
      menos votos
      <span className="w-16 h-2 rounded-full" style={{ background: 'linear-gradient(90deg, hsl(214,60%,88%), hsl(214,90%,32%))' }} />
      mais votos
    </span>
  );
}

export function LegendaPresenca() {
  return (
    <span className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-sm" style={{ background: '#2f6fd6', opacity: 0.8 }} />teve votos
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-sm" style={{ background: '#e2e8f0', border: '1px solid var(--border-default)' }} />sem votos
      </span>
    </span>
  );
}

// ── Onde estão os votos ──────────────────────────────────────────────────────
export interface LinhaResultado { chave: string; nome: string; votos: number }

const FAIXAS_CONCENTRACAO = [
  { chave: 'top1', rotulo: 'A maior', de: 0, ate: 1, cor: '#1d4ed8' },
  { chave: 'top5', rotulo: '2ª a 5ª', de: 1, ate: 5, cor: '#3b82f6' },
  { chave: 'top10', rotulo: '6ª a 10ª', de: 5, ate: 10, cor: '#93c5fd' },
  { chave: 'resto', rotulo: 'Demais', de: 10, ate: Infinity, cor: '#94a3b8' },
] as const;

export function AnaliseResultado({ linhas, area, areaSingular, rotuloColuna, titulo, onClickLinha, dicaClique }: {
  linhas: LinhaResultado[];
  /** Plural: "estados", "cidades", "bairros", "zonas". */
  area: string;
  /** Singular: "estado", "cidade"… */
  areaSingular: string;
  /** Cabeçalho da 1ª coluna da tabela: "Cidade", "Bairro"… */
  rotuloColuna: string;
  /** "Todas as cidades", "Todos os bairros"… */
  titulo: string;
  onClickLinha?: (l: LinhaResultado) => void;
  dicaClique?: string;
}) {
  const ordenadas = useMemo(() => [...linhas].filter(l => l.votos > 0).sort((a, b) => b.votos - a.votos), [linhas]);
  const total = ordenadas.reduce((s, l) => s + l.votos, 0);
  const [texto, setTexto] = useState('');
  if (ordenadas.length === 0 || total === 0) return null;

  const soma = (de: number, ate: number) => ordenadas.slice(de, ate === Infinity ? undefined : ate).reduce((s, l) => s + l.votos, 0);
  const fatias = FAIXAS_CONCENTRACAO.map(f => ({ ...f, valor: soma(f.de, f.ate) })).filter(f => f.valor > 0);
  const maior = ordenadas[0];
  const top10 = soma(0, 10);
  const destaques = ordenadas.slice(0, 10);
  const alvo = semAcento(texto.trim());
  const visiveis = ordenadas.map((l, i) => ({ l, pos: i + 1 })).filter(x => !alvo || semAcento(x.l.nome).includes(alvo));

  const kpis: Array<{ icone: LucideIcon; rotulo: string; valor: string; sub: string; cor: string }> = [
    { icone: Vote, rotulo: 'Votos', valor: fmt(total), sub: `em ${fmt(ordenadas.length)} ${ordenadas.length === 1 ? areaSingular : area}`, cor: '#2563eb' },
    { icone: Trophy, rotulo: 'Maior reduto', valor: maior.nome, sub: `${fmt(maior.votos)} votos · ${pctBR(maior.votos / total)}`, cor: '#d97706' },
    { icone: PieChart, rotulo: 'Concentração', valor: pctBR(top10 / total), sub: `dos votos nas ${Math.min(10, ordenadas.length)} primeiras posições`, cor: '#7c3aed' },
    { icone: MapPin, rotulo: `Média por ${areaSingular}`, valor: fmt(Math.round(total / ordenadas.length)), sub: 'votos', cor: '#0d9488' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {kpis.map(k => (
          <div key={k.rotulo} className="rounded-2xl p-4 flex items-center gap-3 min-w-0"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}>
            <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: comAlfa(k.cor, 0.12), color: k.cor, border: `1px solid ${comAlfa(k.cor, 0.25)}` }}>
              <k.icone className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--text-tertiary)' }}>{k.rotulo}</p>
              <p className="text-base sm:text-lg font-bold leading-tight break-words tabular-nums" style={{ color: 'var(--text-primary)' }}>{k.valor}</p>
              <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{k.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <Painel titulo="Onde estão os votos" icone={PieChart} className="xl:col-span-5">
          <div className="flex flex-col sm:flex-row items-center gap-5">
            <Rosca fatias={fatias} centro={fmt(ordenadas.length)} rotuloCentro={area} />
            <ul className="flex-1 w-full space-y-2.5">
              {fatias.map(f => (
                <li key={f.chave} className="flex items-center gap-2 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: f.cor }} />
                  <span className="flex-1" style={{ color: 'var(--text-secondary)' }}>
                    {f.chave === 'top1' ? `Maior ${areaSingular}` : f.chave === 'resto' ? `Demais ${area}` : `Da ${f.rotulo.replace(' a ', ' à ')} posição`}
                  </span>
                  <span className="font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{pctBR(f.valor / total)}</span>
                </li>
              ))}
            </ul>
          </div>
        </Painel>

        <Painel titulo={`Maiores ${area}`} icone={Trophy} className="xl:col-span-7">
          <ul className="space-y-2.5">
            {destaques.map((l, i) => (
              <li key={l.chave}>
                <button type="button" onClick={onClickLinha ? () => onClickLinha(l) : undefined}
                  className={`w-full text-left ${onClickLinha ? 'cursor-pointer group' : 'cursor-default'}`}>
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <span className="text-xs font-medium min-w-0 break-words group-hover:underline" style={{ color: 'var(--text-primary)' }}>
                      <span className="tabular-nums mr-1.5" style={{ color: 'var(--text-tertiary)' }}>{i + 1}.</span>{l.nome}
                    </span>
                    <span className="text-xs font-bold tabular-nums whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                      {fmt(l.votos)} <span className="font-medium" style={{ color: 'var(--text-tertiary)' }}>({pctBR(l.votos / total)})</span>
                    </span>
                  </div>
                  <BarraSimples fracao={l.votos / maior.votos} cor="linear-gradient(90deg, rgba(37,99,235,0.55), #2563eb)" altura={8} />
                </button>
              </li>
            ))}
          </ul>
        </Painel>
      </div>

      <Painel
        titulo={<>{titulo} <span className="normal-case tracking-normal font-semibold">({fmt(ordenadas.length)})</span></>}
        icone={List}
        direita={<CampoFiltro valor={texto} onChange={setTexto} placeholder={`Filtrar por ${rotuloColuna.toLowerCase()}…`} />}
        corpo="pt-3"
      >
        {dicaClique && (
          <p className="px-4 sm:px-5 pb-3 text-[11px] flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
            <MousePointerClick className="w-3 h-3" />{dicaClique}
          </p>
        )}
        <div className="overflow-auto max-h-[560px] scrollbar-dark" style={{ borderTop: '1px solid var(--tint-06)' }}>
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
                <th className="text-right px-4 py-2.5 w-12" style={{ background: 'var(--bg-card-subtle)' }}>#</th>
                <th className="text-left px-3 py-2.5 min-w-[160px]" style={{ background: 'var(--bg-card-subtle)' }}>{rotuloColuna}</th>
                <th className="text-right px-3 py-2.5" style={{ background: 'var(--bg-card-subtle)' }}>Votos</th>
                <th className="text-left px-4 py-2.5 min-w-[150px]" style={{ background: 'var(--bg-card-subtle)' }}>% do total</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center" style={{ color: 'var(--text-tertiary)' }}>Nada encontrado com esse filtro.</td></tr>
              )}
              {visiveis.map(({ l, pos }) => (
                <tr key={l.chave} onClick={onClickLinha ? () => onClickLinha(l) : undefined}
                  className={`${onClickLinha ? 'cursor-pointer' : ''} hover:bg-[var(--bg-hover)]`}
                  style={{ borderTop: '1px solid var(--tint-06)' }}>
                  <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-tertiary)' }}>{pos}º</td>
                  <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--text-primary)' }}>{l.nome}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: 'var(--text-primary)' }}>{fmt(l.votos)}</td>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      <span className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--tint-06)' }}>
                        <span className="block h-full rounded-full" style={{ width: `${(l.votos / maior.votos) * 100}%`, background: '#2563eb' }} />
                      </span>
                      <span className="tabular-nums w-12 text-right" style={{ color: 'var(--text-secondary)' }}>{pctBR(l.votos / total)}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Painel>
    </div>
  );
}
