'use client';

// Peças visuais do Projeto de Campanha, no mesmo padrão do Mapa Eleitoral
// (components/mapa/comparacao-visual.tsx). Só desenho — as contas ficam na
// página.

import { ArrowRight, Handshake, MapPin, Trash2, UserCheck } from 'lucide-react';
import { Avatar, comAlfa } from '@/components/mapa/comparacao-visual';

const fmt = (n: number) => Math.round(n).toLocaleString('pt-BR');

/** "DEPUTADO_ESTADUAL" / "Deputado Estadual" → "Deputado estadual". */
export function rotuloCargo(cargo: string): string {
  const t = String(cargo ?? '').replace(/_/g, ' ').trim().toLowerCase();
  return t ? t[0].toUpperCase() + t.slice(1) : '';
}

/** Uma cor por cargo, para o avatar e o filete do cartão. */
export function corDoCargo(cargo: string): string {
  const c = String(cargo ?? '').toUpperCase();
  if (c.includes('VEREADOR')) return '#7c3aed';
  if (c.includes('PREFEITO')) return '#d97706';
  if (c.includes('SENADOR')) return '#059669';
  if (c.includes('GOVERNADOR')) return '#db2777';
  if (c.includes('ESTADUAL') || c.includes('DISTRITAL')) return '#0891b2';
  return '#2563eb';
}

// ── Campo do formulário de busca ─────────────────────────────────────────────
export function CampoBusca({ rotulo, className = '', children }: { rotulo: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 min-w-0 ${className}`}>
      <label className="block text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--text-tertiary)' }}>{rotulo}</label>
      {children}
    </div>
  );
}

// ── Cartão de uma projeção salva ─────────────────────────────────────────────
export interface ResumoProjecaoSalva {
  nome: string;
  cargo: string;
  uf: string;
  anoBase: number;
  anoProjecao: number;
  /** Votos da eleição de base (0 = estreante). */
  base: number;
  /** Meta do cenário realista. */
  meta: number;
  municipios: number;
  dobradas: number;
  estreante: boolean;
}

export function CartaoProjecaoSalva({ resumo: r, onAbrir, onExcluir }: {
  resumo: ResumoProjecaoSalva;
  onAbrir: () => void;
  onExcluir: () => void;
}) {
  const cor = corDoCargo(r.cargo);
  const crescimento = r.base > 0 ? (r.meta - r.base) / r.base : null;
  // Barra: a base em cheio e o que falta até a meta em tom claro.
  const maior = Math.max(r.base, r.meta, 1);
  const larguraBase = (Math.min(r.base, r.meta || r.base) / maior) * 100;
  const larguraMeta = (r.meta / maior) * 100;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onAbrir}
      onKeyDown={e => { if (e.key === 'Enter') onAbrir(); }}
      className="group relative rounded-2xl p-4 cursor-pointer transition-all hover:-translate-y-0.5 overflow-hidden min-w-0"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-default)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      {/* Filete na cor do cargo + brilho ao passar o mouse */}
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${cor}, ${comAlfa(cor, 0.25)})` }} />
      <span aria-hidden className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none rounded-2xl"
        style={{ boxShadow: `inset 0 0 0 1px ${comAlfa(cor, 0.5)}` }} />

      {/* Quem */}
      <div className="flex items-start gap-3">
        <Avatar nome={r.nome} cor={cor} tamanho={42} />
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold leading-snug line-clamp-2" style={{ color: 'var(--text-primary)' }} title={r.nome}>{r.nome}</p>
          {r.cargo && <p className="text-[11.5px] mt-0.5 truncate" style={{ color: 'var(--text-tertiary)' }}>{rotuloCargo(r.cargo)}</p>}
        </div>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onExcluir(); }}
          className="acao-no-hover p-1.5 rounded-lg transition-all hover:bg-red-500/15 flex-shrink-0"
          style={{ color: '#ef4444' }}
          title="Excluir projeção"
          aria-label="Excluir projeção"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Onde e quando */}
      <div className="flex flex-wrap items-center gap-1.5 mt-3">
        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold" style={{ background: 'var(--tint-06)', color: 'var(--text-secondary)' }}>{r.uf}</span>
        {r.estreante ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold"
            style={{ background: 'rgba(16,185,129,0.12)', color: 'var(--success)' }}>
            <UserCheck className="h-3 w-3" /> Estreante
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold" style={{ background: 'var(--tint-06)', color: 'var(--text-secondary)' }}>{r.anoBase}</span>
        )}
        <ArrowRight className="h-3 w-3" style={{ color: 'var(--text-tertiary)' }} />
        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold" style={{ background: comAlfa(cor, 0.14), color: cor }}>{r.anoProjecao}</span>
      </div>

      {/* Números */}
      <div className="grid grid-cols-3 gap-2 mt-3.5">
        <div className="min-w-0">
          <p className="text-[9.5px] uppercase tracking-widest font-bold" style={{ color: 'var(--text-tertiary)' }}>{r.estreante ? 'Base' : `Votos ${r.anoBase}`}</p>
          <p className="text-[15px] font-bold tabular-nums truncate" style={{ color: 'var(--text-primary)' }}>{r.estreante ? '—' : fmt(r.base)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[9.5px] uppercase tracking-widest font-bold" style={{ color: 'var(--text-tertiary)' }}>Meta {r.anoProjecao}</p>
          <p className="text-[15px] font-bold tabular-nums truncate" style={{ color: cor }}>{fmt(r.meta)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[9.5px] uppercase tracking-widest font-bold" style={{ color: 'var(--text-tertiary)' }}>Crescimento</p>
          <p className="text-[15px] font-bold tabular-nums truncate"
            style={{ color: crescimento === null ? 'var(--text-tertiary)' : crescimento >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {crescimento === null ? '—' : `${crescimento >= 0 ? '+' : ''}${(crescimento * 100).toFixed(1).replace('.', ',')}%`}
          </p>
        </div>
      </div>

      {/* Base × meta */}
      <div className="relative h-1.5 rounded-full mt-2.5 overflow-hidden" style={{ background: 'var(--tint-06)' }}
        title={r.estreante ? `Meta de ${fmt(r.meta)} votos` : `${fmt(r.base)} votos em ${r.anoBase} → meta de ${fmt(r.meta)}`}>
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${larguraMeta}%`, background: comAlfa(cor, 0.35) }} />
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${larguraBase}%`, background: cor }} />
      </div>

      {/* Rodapé */}
      <div className="flex items-center justify-between gap-2 mt-3.5 pt-3" style={{ borderTop: '1px solid var(--border-default)' }}>
        <div className="flex items-center gap-3 text-[11.5px] min-w-0" style={{ color: 'var(--text-secondary)' }}>
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <MapPin className="h-3.5 w-3.5" style={{ color: 'var(--text-tertiary)' }} />
            {fmt(r.municipios)} {r.municipios === 1 ? 'município' : 'municípios'}
          </span>
          {r.dobradas > 0 && (
            <span className="inline-flex items-center gap-1 whitespace-nowrap" style={{ color: '#3b82f6' }}>
              <Handshake className="h-3.5 w-3.5" />
              {r.dobradas} {r.dobradas === 1 ? 'dobrada' : 'dobradas'}
            </span>
          )}
        </div>
        <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold transition-transform group-hover:translate-x-0.5 whitespace-nowrap"
          style={{ color: 'var(--brand-cobalt-text)' }}>
          Abrir <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  );
}
