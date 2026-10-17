'use client';

// Peças das janelas do Projeto de Campanha (editar município, adicionar,
// parceria, novo candidato): campos, cartões de meta, prioridade e
// interruptor, no mesmo padrão premium da tela. Só desenho.

import type { LucideIcon } from 'lucide-react';
import { comAlfa } from '@/components/mapa/comparacao-visual';

const fmt = (n: number) => Math.round(n).toLocaleString('pt-BR');

/** Classe dos campos de texto, número e seleção das janelas. */
export const CLASSE_CAMPO =
  'w-full h-10 rounded-xl px-3.5 text-sm outline-none transition-shadow focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-[var(--brand-cobalt)] placeholder:text-[color:var(--text-tertiary)]';
export const ESTILO_CAMPO: React.CSSProperties = {
  background: 'var(--bg-card-subtle)',
  border: '1px solid var(--border-default)',
  color: 'var(--text-primary)',
};

// ── Seção com título ─────────────────────────────────────────────────────────
export function SecaoJanela({ titulo, icone: Icone, cor = '#2563eb', direita, children }: {
  titulo: React.ReactNode;
  icone: LucideIcon;
  cor?: string;
  direita?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl p-4" style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--border-default)' }}>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: comAlfa(cor, 0.12), color: cor }}>
            <Icone className="w-3.5 h-3.5" />
          </span>
          <h4 className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--text-tertiary)' }}>{titulo}</h4>
        </div>
        {direita}
      </header>
      {children}
    </section>
  );
}

// ── Meta de um cenário ───────────────────────────────────────────────────────
export function CartaoMetaCenario({ rotulo, icone: Icone, cor, valor, onChange, base }: {
  rotulo: string;
  icone: LucideIcon;
  cor: string;
  valor: number;
  /** Sem onChange o cartão só mostra o número (sugestões). */
  onChange?: (v: number) => void;
  /** Votos da eleição de base — mostra a variação. */
  base?: number;
}) {
  const variacao = base !== undefined
    ? (base === 0 ? (valor > 0 ? null : 0) : (valor - base) / base)
    : undefined;
  return (
    <div className="relative rounded-xl p-3 overflow-hidden min-w-0"
      style={{ background: 'var(--bg-card)', border: `1px solid ${comAlfa(cor, 0.35)}` }}>
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: cor }} />
      <div className="flex items-center gap-1.5 mb-2">
        <span className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: comAlfa(cor, 0.14), color: cor }}>
          <Icone className="w-3.5 h-3.5" />
        </span>
        <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{rotulo}</span>
      </div>
      {onChange ? (
        <input
          type="number"
          min={0}
          value={valor}
          onChange={e => onChange(parseInt(e.target.value) || 0)}
          className="w-full h-10 rounded-lg px-3 text-lg font-bold tabular-nums outline-none focus:ring-2"
          style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', ['--tw-ring-color' as string]: comAlfa(cor, 0.4) }}
        />
      ) : (
        <p className="text-xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmt(valor)}</p>
      )}
      {variacao !== undefined && (
        <p className="text-[11px] font-semibold mt-1.5 tabular-nums"
          style={{ color: variacao === null || variacao > 0 ? 'var(--success)' : variacao < 0 ? 'var(--danger)' : 'var(--text-tertiary)' }}>
          {variacao === null ? 'cidade nova' : `${variacao > 0 ? '+' : ''}${(variacao * 100).toFixed(1).replace('.', ',')}% sobre a base`}
        </p>
      )}
    </div>
  );
}

// ── Prioridade ───────────────────────────────────────────────────────────────
const PRIORIDADES = [
  { valor: 'ALTA', rotulo: 'Alta', cor: '#dc2626' },
  { valor: 'MEDIA', rotulo: 'Média', cor: '#d97706' },
  { valor: 'BAIXA', rotulo: 'Baixa', cor: '#64748b' },
] as const;

export function SeletorPrioridade({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest font-bold mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Prioridade</p>
      <div className="grid grid-cols-3 gap-2">
        {PRIORIDADES.map(p => {
          const ativo = valor === p.valor;
          return (
            <button key={p.valor} type="button" onClick={() => onChange(p.valor)}
              className="h-10 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 transition-all"
              style={ativo
                ? { background: comAlfa(p.cor, 0.14), border: `1.5px solid ${p.cor}`, color: p.cor }
                : { background: 'var(--bg-card-subtle)', border: '1.5px solid var(--border-default)', color: 'var(--text-secondary)' }}>
              <span className="w-2 h-2 rounded-full" style={{ background: p.cor }} />
              {p.rotulo}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Interruptor (liga/desliga com título e descrição) ────────────────────────
export function Interruptor({ ativo, onChange, titulo, descricao, icone: Icone, cor = '#3b82f6' }: {
  ativo: boolean;
  onChange: (v: boolean) => void;
  titulo: string;
  descricao?: string;
  icone: LucideIcon;
  cor?: string;
}) {
  return (
    <button type="button" role="switch" aria-checked={ativo} onClick={() => onChange(!ativo)}
      className="w-full flex items-center gap-3 text-left">
      <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors"
        style={ativo ? { background: comAlfa(cor, 0.14), color: cor } : { background: 'var(--tint-06)', color: 'var(--text-tertiary)' }}>
        <Icone className="w-4 h-4" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold" style={{ color: ativo ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{titulo}</span>
        {descricao && <span className="block text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{descricao}</span>}
      </span>
      <span className="relative w-10 h-6 rounded-full flex-shrink-0 transition-colors"
        style={{ background: ativo ? cor : 'var(--tint-10, rgba(148,163,184,0.35))' }}>
        <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all" style={{ left: ativo ? 18 : 2 }} />
      </span>
    </button>
  );
}

// ── Botões do rodapé das janelas ─────────────────────────────────────────────
export function BotaoSecundario({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className="h-10 px-4 rounded-xl text-sm font-semibold transition-colors hover:bg-[var(--tint-06)]"
      style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
      {children}
    </button>
  );
}

export function BotaoPrincipal({ onClick, children, disabled, cor = '#10b981', icone: Icone }: {
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  cor?: string;
  icone?: LucideIcon;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="h-10 px-5 rounded-xl text-sm font-semibold text-white inline-flex items-center gap-2 transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ background: `linear-gradient(135deg, ${cor}, ${comAlfa(cor, 0.82)})`, boxShadow: `0 6px 16px -6px ${comAlfa(cor, 0.7)}` }}>
      {Icone && <Icone className="h-4 w-4" />}
      {children}
    </button>
  );
}
