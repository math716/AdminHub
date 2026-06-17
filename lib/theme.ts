/**
 * Design tokens — AdminHub
 *
 * Fonte única de verdade para cores, surfaces, hierarquia tipográfica
 * e espaçamentos. Aponta para CSS variables definidas em globals.css,
 * que alternam automaticamente entre tema claro e escuro via classe .dark
 * no <html> (gerenciada pelo next-themes).
 *
 * Sempre que precisar de uma cor/fundo/borda, pegue daqui ao invés de
 * inventar um rgba() novo no arquivo da página.
 */

// ──────────────────────────────────────────────────────────
// Brand — paleta cobalto + ciano + ardósia
// (substitui o antigo navy + gold)
// ──────────────────────────────────────────────────────────
export const brand = {
  cobalt:      'var(--brand-cobalt)',
  cobaltHover: 'var(--brand-cobalt-hover)',
  cobaltSoft:  'var(--brand-cobalt-soft)',
  cobaltText:  'var(--brand-cobalt-text)',
  cyan:        'var(--brand-cyan)',
  cyanSoft:    'var(--brand-cyan-soft)',
  slate:       'var(--brand-slate)',
  slateSoft:   'var(--brand-slate-soft)',

  /** @deprecated use brand.cobalt */
  gold:     'var(--brand-cobalt)',
  /** @deprecated use brand.cobaltHover */
  goldSoft: 'var(--brand-cobalt-hover)',
  /** @deprecated mantido pra retrocompat; tema escuro vira #0F2240 */
  navy:     '#0F2240',
  /** @deprecated */
  navyDark: '#0A1628',
  /** @deprecated */
  navyMid:  '#142845',
  /** @deprecated use brand.cyan */
  info:     'var(--brand-cyan)',
} as const;

// Constantes hex literais — usadas onde CSS vars não funcionam
// (ex: SVG, chart libs, inline filters)
export const hex = {
  cobalt:    '#2563EB',
  cyan:      '#0891B2',
  cyanDark:  '#22D3EE',
  navy:      '#0F2240',
  navyDeep:  '#0A1628',
  surface:   '#142845',
  white:     '#FFFFFF',
  slate900:  '#0F172A',
  slate600:  '#475569',
  slate400:  '#94A3B8',
  slate200:  '#E2E8F0',
} as const;

// ──────────────────────────────────────────────────────────
// Surface — fundos de painel/card (segue o tema)
// ──────────────────────────────────────────────────────────
export const surface = {
  /** Painel padrão — bg card + border default */
  panel: {
    background: 'var(--bg-card)',
    border:     '1px solid var(--border-default)',
  },
  /** Painel destacado — mesmo bg, sombra mais forte */
  raised: {
    background: 'var(--bg-card-raised)',
    border:     '1px solid var(--border-default)',
    boxShadow:  'var(--shadow-raised)',
  },
  /** Subcard/região interna */
  subtle: {
    background: 'var(--bg-card-subtle)',
    border:     '1px solid var(--border-subtle)',
  },
  /** Hover de item de lista */
  hover: {
    background: 'var(--bg-hover)',
  },
} as const;

// ──────────────────────────────────────────────────────────
// Borders
// ──────────────────────────────────────────────────────────
export const border = {
  default:    'var(--border-default)',
  strong:     'var(--border-strong)',
  subtle:     'var(--border-subtle)',

  /** @deprecated use border.default */
  gold:        'var(--border-default)',
  /** @deprecated */
  goldSoft:    'var(--border-subtle)',
  /** @deprecated */
  goldStrong:  'var(--border-strong)',
  /** @deprecated */
  white:       'var(--border-default)',
  /** @deprecated */
  whiteSoft:   'var(--border-subtle)',
  /** @deprecated */
  whiteStrong: 'var(--border-strong)',
} as const;

// ──────────────────────────────────────────────────────────
// Text — hierarquia tipográfica (segue tema)
// ──────────────────────────────────────────────────────────
export const text = {
  primary:   'var(--text-primary)',
  secondary: 'var(--text-secondary)',
  tertiary:  'var(--text-tertiary)',
  muted:     'var(--text-muted)',
  inverse:   'var(--text-inverse)',
  cobalt:    'var(--brand-cobalt-text)',
  cyan:      'var(--brand-cyan)',

  /** @deprecated use text.cobalt */
  gold:      'var(--brand-cobalt-text)',
  /** @deprecated use text.cyan */
  info:      'var(--brand-cyan)',
} as const;

/** Classes Tailwind equivalentes — use quando preferir className */
export const textClass = {
  h1:        'text-2xl font-semibold tracking-tight',
  h2:        'text-lg font-semibold',
  h3:        'text-sm font-semibold',
  body:      'text-sm',
  secondary: 'text-sm text-[color:var(--text-secondary)]',
  tertiary:  'text-xs text-[color:var(--text-tertiary)]',
  muted:     'text-[11px] uppercase tracking-widest text-[color:var(--text-muted)]',
  label:     'text-xs uppercase tracking-wide text-[color:var(--text-tertiary)]',
} as const;

// ──────────────────────────────────────────────────────────
// Background gradients
// ──────────────────────────────────────────────────────────
export const gradients = {
  page:       'var(--bg-page)',
  goldCta:    'var(--brand-cobalt)',
  goldSubtle: 'var(--brand-cobalt-soft)',
  goldHair:   'linear-gradient(90deg, transparent, var(--border-default), transparent)',

  cobaltCta:    'var(--brand-cobalt)',
  cobaltSubtle: 'var(--brand-cobalt-soft)',
  cobaltHair:   'linear-gradient(90deg, transparent, var(--brand-cobalt), transparent)',
} as const;

// ──────────────────────────────────────────────────────────
// Status semânticos
// ──────────────────────────────────────────────────────────
export const status = {
  success:     'var(--success)',
  successSoft: 'var(--success-soft)',
  warning:     'var(--warning)',
  warningSoft: 'var(--warning-soft)',
  danger:      'var(--danger)',
  dangerSoft:  'var(--danger-soft)',
} as const;

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

/**
 * Box style para um icon-container colorido.
 *
 * Ex.: <span style={iconBox('#2563EB')}> <Icon/> </span>
 */
export function iconBox(color: string, opacity: number = 0.15) {
  return {
    background: `${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`,
    border: `1px solid ${color}55`,
    color,
  } as const;
}

/** Mistura uma cor hex com alpha (0..1). Aceita #RRGGBB. */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0');
  return `${hex}${a}`;
}

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 9999,
} as const;
