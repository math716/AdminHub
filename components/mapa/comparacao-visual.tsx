'use client';

// Peças visuais do comparador e da evolução: painel, avatar, rosca, barras,
// trilha de navegação, cartão do mapa e legenda. Sem regra de negócio — só
// desenho — para os dois modos e os três níveis (Brasil, estado, cidade)
// terem a mesma cara.

import { motion } from 'framer-motion';
import { ChevronRight, MousePointerClick, Search, type LucideIcon } from 'lucide-react';

export const pctBR = (fracao: number, casas = 1) => `${(fracao * 100).toFixed(casas).replace('.', ',')}%`;

/** Cor em hex (#rrggbb) com transparência. */
export function comAlfa(hex: string, alfa: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alfa})`;
}

export function iniciais(nome: string): string {
  const todas = String(nome ?? '').trim().split(/\s+/).filter(Boolean);
  // "Maria DA Silva" → MS: preposições não entram.
  const p = todas.filter(x => !/^(DA|DE|DO|DAS|DOS|E)$/i.test(x));
  if (p.length === 0) return '?';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

// ── Painel ───────────────────────────────────────────────────────────────────
export function Painel({ titulo, icone: Icone, direita, children, className = '', corpo = 'p-4 sm:p-5', style }: {
  titulo?: React.ReactNode;
  icone?: LucideIcon;
  direita?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Classes do corpo (padding). */
  corpo?: string;
  style?: React.CSSProperties;
}) {
  return (
    <section className={`rounded-2xl min-w-0 ${className}`}
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)', ...style }}>
      {(titulo || direita) && (
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 sm:px-5 pt-4">
          {titulo && (
            <div className="flex items-center gap-2 min-w-0">
              {Icone && (
                <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--brand-cobalt-soft)', color: 'var(--brand-cobalt-text)' }}>
                  <Icone className="w-3.5 h-3.5" />
                </span>
              )}
              <h3 className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--text-tertiary)' }}>{titulo}</h3>
            </div>
          )}
          {direita}
        </header>
      )}
      <div className={corpo}>{children}</div>
    </section>
  );
}

// ── Avatar ───────────────────────────────────────────────────────────────────
export function Avatar({ nome, cor, tamanho = 44 }: { nome: string; cor: string; tamanho?: number }) {
  return (
    <span className="rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white select-none"
      style={{
        width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.36),
        background: `linear-gradient(135deg, ${cor}, ${comAlfa(cor, 0.72)})`,
        boxShadow: `0 0 0 3px ${comAlfa(cor, 0.18)}, 0 6px 16px -6px ${comAlfa(cor, 0.6)}`,
        letterSpacing: '0.02em',
      }}>
      {iniciais(nome)}
    </span>
  );
}

// ── Rosca ────────────────────────────────────────────────────────────────────
export interface Fatia { chave: string; valor: number; cor: string; opacidade?: number }

export function Rosca({ fatias, tamanho = 156, espessura = 16, centro, rotuloCentro }: {
  fatias: Fatia[];
  tamanho?: number;
  espessura?: number;
  centro: React.ReactNode;
  rotuloCentro?: React.ReactNode;
}) {
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  const r = (tamanho - espessura) / 2;
  const C = 2 * Math.PI * r;
  const visiveis = fatias.filter(f => f.valor > 0);
  const vao = visiveis.length > 1 ? Math.min(3, C * 0.006) : 0;
  let acum = 0;
  return (
    <div className="relative flex-shrink-0" style={{ width: tamanho, height: tamanho }}>
      <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke="var(--tint-06)" strokeWidth={espessura} />
        {total > 0 && visiveis.map(f => {
          const comp = (f.valor / total) * C;
          const traco = Math.max(comp - vao, 0.5);
          const inicio = acum;
          acum += comp;
          return (
            <motion.circle key={f.chave} cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none"
              stroke={f.cor} strokeOpacity={f.opacidade ?? 1} strokeWidth={espessura}
              strokeDashoffset={-inicio}
              initial={{ strokeDasharray: `0 ${C}` }}
              animate={{ strokeDasharray: `${traco} ${C - traco}` }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
        <span className="font-bold tabular-nums leading-none" style={{ color: 'var(--text-primary)', fontSize: Math.round(tamanho * 0.17) }}>{centro}</span>
        {rotuloCentro && <span className="text-[10px] uppercase tracking-wider font-semibold mt-1" style={{ color: 'var(--text-tertiary)' }}>{rotuloCentro}</span>}
      </div>
    </div>
  );
}

// ── Barras ───────────────────────────────────────────────────────────────────
export interface Parte { chave: string; valor: number; cor: string; opacidade?: number; rotulo?: string }

/** Barra dividida entre as partes, proporcional ao valor de cada uma. */
export function BarraDividida({ partes, altura = 8, rotulos = false, arredondada = true, animar = true }: {
  partes: Parte[];
  altura?: number;
  /** Escreve, dentro de cada parte que tiver espaço, o % ou o próprio valor. */
  rotulos?: false | 'pct' | 'valor';
  arredondada?: boolean;
  /** Tabelas com milhares de linhas desenham sem animação. */
  animar?: boolean;
}) {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  const comValor = partes.filter(p => p.valor > 0);
  return (
    <div className={`flex w-full overflow-hidden ${arredondada ? 'rounded-full' : 'rounded'}`}
      style={{ height: altura, background: 'var(--tint-06)', gap: comValor.length > 1 ? 2 : 0 }}>
      {total > 0 && comValor.map(p => {
        const f = p.valor / total;
        // Parte clara (vantagem pequena) leva o texto na cor do tema; as fortes, em branco.
        const clara = p.opacidade !== undefined && p.opacidade < 0.5;
        const estilo: React.CSSProperties = {
          background: p.opacidade !== undefined ? comAlfa(p.cor, p.opacidade) : p.cor, minWidth: 2,
        };
        const texto = rotulos && f >= (rotulos === 'valor' ? 0.07 : 0.09) && (
          <span className="text-[11px] font-bold tabular-nums whitespace-nowrap px-1.5"
            style={clara ? { color: 'var(--text-primary)' } : { color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.25)' }}>
            {rotulos === 'valor' ? p.valor.toLocaleString('pt-BR') : pctBR(f)}
          </span>
        );
        return animar ? (
          <motion.div key={p.chave} className="h-full flex items-center justify-center overflow-hidden" style={estilo}
            initial={{ width: 0 }} animate={{ width: `${f * 100}%` }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} title={p.rotulo}>
            {texto}
          </motion.div>
        ) : (
          <div key={p.chave} className="h-full flex items-center justify-center overflow-hidden"
            style={{ ...estilo, width: `${f * 100}%` }} title={p.rotulo}>
            {texto}
          </div>
        );
      })}
    </div>
  );
}

/** Barra simples de 0 a 100%. */
export function BarraSimples({ fracao, cor, altura = 8, fundo = 'var(--tint-06)' }: { fracao: number; cor: string; altura?: number; fundo?: string }) {
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ height: altura, background: fundo }}>
      <motion.div className="h-full rounded-full" style={{ background: cor }}
        initial={{ width: 0 }} animate={{ width: `${Math.max(0, Math.min(1, fracao)) * 100}%` }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} />
    </div>
  );
}

// ── Etiqueta ─────────────────────────────────────────────────────────────────
export function Etiqueta({ cor, children, forte = false }: { cor: string; children: React.ReactNode; forte?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap tabular-nums"
      style={forte
        ? { background: cor, color: '#fff' }
        : { background: comAlfa(cor, 0.12), color: cor, border: `1px solid ${comAlfa(cor, 0.28)}` }}>
      {children}
    </span>
  );
}

// ── Trilha (Brasil › Estado › Cidade) ────────────────────────────────────────
export interface Passo { rotulo: string; onClick?: () => void }

export function Trilha({ passos, meta, acoes }: { passos: Passo[]; meta?: React.ReactNode; acoes?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <nav className="flex flex-wrap items-center gap-1 rounded-xl px-2 py-1.5"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}>
        {passos.map((p, i) => {
          const ultimo = i === passos.length - 1;
          return (
            <span key={`${p.rotulo}-${i}`} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />}
              {p.onClick && !ultimo ? (
                <button type="button" onClick={p.onClick}
                  className="text-xs font-medium px-1.5 py-0.5 rounded-md hover:bg-[var(--tint-06)] transition-colors"
                  style={{ color: 'var(--text-secondary)' }}>
                  {p.rotulo}
                </button>
              ) : (
                <span className="text-xs font-semibold px-1.5 py-0.5" style={{ color: ultimo ? 'var(--brand-cobalt-text)' : 'var(--text-secondary)' }}>
                  {p.rotulo}
                </span>
              )}
            </span>
          );
        })}
        {meta && (
          <>
            <span className="w-px h-4 mx-1.5" style={{ background: 'var(--tint-10)' }} />
            <span className="text-[11px] font-medium px-1" style={{ color: 'var(--text-tertiary)' }}>{meta}</span>
          </>
        )}
      </nav>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}

// ── Seletor em pílulas (visões, turno) ───────────────────────────────────────
export function Pilulas<T extends string | number>({ opcoes, valor, onChange, desabilitada }: {
  opcoes: ReadonlyArray<readonly [T, string]>;
  valor: T;
  onChange: (v: T) => void;
  desabilitada?: (v: T) => boolean;
}) {
  return (
    <div className="inline-flex items-center rounded-xl p-1 text-xs gap-0.5"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}>
      {opcoes.map(([v, rotulo]) => {
        const ativo = v === valor;
        return (
          <button key={String(v)} type="button" onClick={() => onChange(v)} disabled={desabilitada?.(v)}
            className="px-3 py-1.5 rounded-lg font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={ativo
              ? { background: 'var(--brand-cobalt)', color: '#fff', boxShadow: '0 4px 12px -4px rgba(37,99,235,0.6)' }
              : { color: 'var(--text-secondary)' }}>
            {rotulo}
          </button>
        );
      })}
    </div>
  );
}

// ── Cartão do mapa ───────────────────────────────────────────────────────────
export function CartaoMapa({ titulo, dica, direita, legenda, children }: {
  titulo: React.ReactNode;
  /** Ação do clique ("Selecione uma cidade para abrir"). */
  dica?: string;
  direita?: React.ReactNode;
  legenda?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl overflow-hidden min-w-0 flex flex-col"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}>
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3" style={{ borderBottom: '1px solid var(--tint-06)' }}>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{titulo}</h3>
          {dica && (
            <p className="text-[11px] flex items-center gap-1 mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              <MousePointerClick className="w-3 h-3 flex-shrink-0" />{dica}
            </p>
          )}
        </div>
        {direita}
      </header>
      <div className="relative h-[340px] sm:h-[440px] xl:h-[520px]">{children}</div>
      {legenda && <footer className="px-4 py-2.5" style={{ borderTop: '1px solid var(--tint-06)', background: 'var(--bg-card-subtle)' }}>{legenda}</footer>}
    </section>
  );
}

/** Legenda do mapa: itens coloridos + escala de intensidade + "sem votos". */
export function LegendaMapa({ itens, escala, semVoto }: {
  itens: Array<{ chave: string; cor: string; rotulo: string }>;
  escala?: { inicio: string; fim: string };
  semVoto?: { cor: string; rotulo: string };
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
      {itens.map(i => (
        <span key={i.chave} className="flex items-center gap-1.5 font-medium">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: i.cor, boxShadow: `0 0 0 2px ${comAlfa(i.cor, 0.2)}` }} />{i.rotulo}
        </span>
      ))}
      {escala && (
        <span className="flex items-center gap-1.5" style={{ color: 'var(--text-tertiary)' }}>
          {escala.inicio}
          <span className="w-14 h-2 rounded-full" style={{ background: 'linear-gradient(90deg, rgba(100,116,139,0.3), rgba(100,116,139,0.95))' }} />
          {escala.fim}
        </span>
      )}
      {semVoto && (
        <span className="flex items-center gap-1.5" style={{ color: 'var(--text-tertiary)' }}>
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: semVoto.cor }} />{semVoto.rotulo}
        </span>
      )}
    </div>
  );
}

// ── Busca e filtros da tabela ────────────────────────────────────────────────
export function CampoFiltro({ valor, onChange, placeholder }: { valor: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative flex items-center w-full sm:w-56">
      <Search className="absolute left-2.5 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-tertiary)' }} />
      <input value={valor} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full h-8 rounded-lg pl-8 pr-2 text-xs outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
        style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }} />
    </label>
  );
}

export function ChipFiltro({ ativo, cor, onClick, children }: { ativo: boolean; cor?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all whitespace-nowrap"
      style={ativo
        ? { background: cor ? comAlfa(cor, 0.14) : 'var(--brand-cobalt-soft)', color: cor ?? 'var(--brand-cobalt-text)', border: `1px solid ${cor ? comAlfa(cor, 0.45) : 'var(--brand-cobalt)'}` }
        : { background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}>
      {cor && <span className="w-2 h-2 rounded-full" style={{ background: cor }} />}
      {children}
    </button>
  );
}

/** Grade do mapa + coluna lateral. Abaixo de 1280px a lateral vai para baixo do mapa, na largura toda. */
export function GradeMapa({ mapa, lateral }: { mapa: React.ReactNode; lateral: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
      <div className="xl:col-span-8 min-w-0">{mapa}</div>
      <div className="xl:col-span-4 min-w-0 grid grid-cols-1 gap-4 content-start">{lateral}</div>
    </div>
  );
}

/** Antes de escolher os candidatos. */
export function EstadoVazio({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="rounded-2xl py-12 px-6 flex flex-col items-center text-center"
      style={{ border: '1.5px dashed var(--border-strong)', background: 'var(--bg-card-subtle)' }}>
      <div className="flex -space-x-3 mb-4">
        {['#dc2626', '#ca8a04', '#2563eb'].map(c => (
          <span key={c} className="w-11 h-11 rounded-full" style={{ background: `linear-gradient(135deg, ${c}, ${comAlfa(c, 0.6)})`, boxShadow: '0 0 0 3px var(--bg-card-subtle)' }} />
        ))}
      </div>
      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{titulo}</p>
      <p className="text-xs mt-1 max-w-sm" style={{ color: 'var(--text-tertiary)' }}>{texto}</p>
    </div>
  );
}
