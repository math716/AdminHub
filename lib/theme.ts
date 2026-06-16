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
  /** Painel padrão (rgba(7,29,54,0.75) + border gold 15%) */
  panel: {
    background: 'rgba(7,29,54,0.75)',
    border:     '1px solid rgba(201,162,39,0.15)',
    backdropFilter: 'blur(8px)',
  },
  /** Painel destacado (mais opaco, borda gold mais forte) */
  raised: {
    background: 'rgba(7,29,54,0.85)',
    border:     '1px solid rgba(201,162,39,0.22)',
    backdropFilter: 'blur(10px)',
  },
  /** Subcard/região interna (mais sutil, sem ouro) */
  subtle: {
    background: 'rgba(255,255,255,0.04)',
    border:     '1px solid rgba(255,255,255,0.07)',
  },
  /** Hover de item de lista */
  hover: {
    background: 'rgba(255,255,255,0.05)',
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
  primary:   '#FFFFFF',
  secondary: 'rgba(255,255,255,0.70)',
  tertiary:  'rgba(255,255,255,0.50)',
  muted:     'rgba(255,255,255,0.32)',
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
