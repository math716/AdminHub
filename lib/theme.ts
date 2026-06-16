/**
 * Design tokens — AdminHub
 *
 * Fonte única de verdade para cores, surfaces, hierarquia tipográfica
 * e espaçamentos do tema "navy + gold" do gabinete.
 *
 * Sempre que precisar de uma cor/fundo/borda, pegue daqui ao invés de
 * inventar um rgba() novo no arquivo da página.
 */

// ──────────────────────────────────────────────────────────
// Brand
// ──────────────────────────────────────────────────────────
export const brand = {
  gold:     '#c9a227',
  goldSoft: '#e6b83a',
  navy:     '#071d36',
  navyDark: '#04111f',
  navyMid:  '#0c2a4f',
  info:     '#4a9ede',
} as const;

// ──────────────────────────────────────────────────────────
// Surface — fundos de painel/card
// ──────────────────────────────────────────────────────────
export const surface = {
  /** Painel padrão — branco com sombra sutil */
  panel: {
    background: '#ffffff',
    border:     '1px solid #e5eaf3',
    backdropFilter: 'none',
    boxShadow:  '0 1px 3px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.04)',
  },
  /** Painel destacado — branco com sombra mais forte */
  raised: {
    background: '#ffffff',
    border:     '1px solid #e5eaf3',
    backdropFilter: 'none',
    boxShadow:  '0 2px 8px rgba(0,0,0,0.07), 0 8px 24px rgba(0,0,0,0.05)',
  },
  /** Subcard/região interna */
  subtle: {
    background: '#f8fafc',
    border:     '1px solid #f1f5f9',
  },
  /** Hover de item de lista */
  hover: {
    background: '#f8fafc',
  },
} as const;

// ──────────────────────────────────────────────────────────
// Borders
// ──────────────────────────────────────────────────────────
export const border = {
  gold:        'rgba(201,162,39,0.30)',
  goldSoft:    'rgba(201,162,39,0.15)',
  goldStrong:  'rgba(201,162,39,0.45)',
  white:       'rgba(255,255,255,0.10)',
  whiteSoft:   'rgba(255,255,255,0.06)',
  whiteStrong: 'rgba(255,255,255,0.20)',
} as const;

// ──────────────────────────────────────────────────────────
// Text — hierarquia tipográfica
// ──────────────────────────────────────────────────────────
export const text = {
  primary:   '#111827',
  secondary: '#374151',
  tertiary:  '#6b7280',
  muted:     '#9ca3af',
  gold:      brand.gold,
  info:      brand.info,
} as const;

/** Classes Tailwind equivalentes — use quando preferir className */
export const textClass = {
  h1:        'text-2xl font-bold text-white tracking-tight',
  h2:        'text-lg font-semibold text-white',
  h3:        'text-sm font-semibold text-white',
  body:      'text-sm text-white',
  secondary: 'text-sm text-slate-300',
  tertiary:  'text-xs text-slate-400',
  muted:     'text-[11px] uppercase tracking-widest text-white/45',
  label:     'text-xs uppercase tracking-wide text-white/55',
} as const;

// ──────────────────────────────────────────────────────────
// Background gradients
// ──────────────────────────────────────────────────────────
export const gradients = {
  page: 'linear-gradient(160deg, #04111f 0%, #071d36 55%, #0c2a4f 100%)',
  goldCta: 'linear-gradient(135deg, #c9a227, #e6b83a)',
  goldSubtle: 'linear-gradient(135deg, rgba(201,162,39,0.18) 0%, rgba(201,162,39,0.04) 100%)',
  goldHair: 'linear-gradient(90deg, transparent, rgba(201,162,39,0.4), transparent)',
} as const;

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

/**
 * Box style para um icon-container colorido.
 *
 * Ex.: <span style={iconBox('#c9a227')}> <Icon/> </span>
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
