/**
 * Design Tokens — AdminHub
 *
 * Espelho em JS dos tokens CSS definidos em `app/globals.css`.
 * Usar quando precisar de cor em estilos inline, chart libs (chart.js, recharts),
 * canvas/SVG dinâmico, ou geração de cores para Leaflet.
 *
 * Para CSS/JSX, prefira as classes Tailwind: `bg-navy-base`, `text-gold`, etc.
 */

export const palette = {
  navy: {
    deep: '#04111f',
    base: '#071d36',
    elev: '#0c2a4f',
    line: '#1e4a80',
  },
  blue: {
    action: '#1a5fa8',
    bright: '#4a9ede',
  },
  gold: {
    DEFAULT: '#c9a227',
    light:   '#e6c84a',
  },
  text: {
    strong:  '#ffffff',
    default: 'rgba(255,255,255,0.95)',
    muted:   '#8fa3bf',
    dim:     '#5d738f',
  },
  state: {
    success: '#22c55e',
    warning: '#f59e0b',
    danger:  '#ef4444',
    info:    '#4a9ede',
  },
} as const;

/** Superfícies prontas: aplicar via `style={surfaces.glass}` */
export const surfaces = {
  glass: {
    background: 'hsl(213 77% 12% / 0.75)',
    border: '1px solid hsl(46 67% 47% / 0.18)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
  },
  glassStrong: {
    background: 'hsl(213 77% 12% / 0.92)',
    border: '1px solid hsl(46 67% 47% / 0.22)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
  },
  input: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.10)',
  },
} as const;

/** Gradiente principal do app (usado em backgrounds de página) */
export const gradients = {
  primary: 'linear-gradient(160deg, #04111f 0%, #071d36 55%, #0c2a4f 100%)',
  gold:    'linear-gradient(135deg, #c9a227 0%, #e6c84a 100%)',
} as const;

/** Sequência de cores para charts (ordem deliberada de contraste) */
export const chartColors = [
  palette.blue.bright,
  palette.gold.DEFAULT,
  palette.state.success,
  palette.state.warning,
  palette.state.danger,
  palette.blue.action,
  palette.gold.light,
] as const;
