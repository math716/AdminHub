import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },

        /* ───── Paleta semântica AdminHub
           Uso: bg-navy-base, text-gold, border-gold/20, ring-blue-bright, etc. */
        navy: {
          deep: 'hsl(var(--navy-deep))',
          base: 'hsl(var(--navy-base))',
          elev: 'hsl(var(--navy-elev))',
          line: 'hsl(var(--navy-line))',
        },
        gold: {
          DEFAULT: 'hsl(var(--gold))',
          light:   'hsl(var(--gold-light))',
        },
        blue: {
          action: 'hsl(var(--blue-action))',
          bright: 'hsl(var(--blue-bright))',
        },
        text: {
          strong:  'hsl(var(--text-strong))',
          default: 'hsl(var(--text-default))',
          muted:   'hsl(var(--text-muted))',
          dim:     'hsl(var(--text-dim))',
        },
        state: {
          success: 'hsl(var(--success))',
          warning: 'hsl(var(--warning))',
          danger:  'hsl(var(--danger))',
          info:    'hsl(var(--info))',
        },
      },
      boxShadow: {
        'glass':      '0 8px 32px rgba(0,0,0,0.35)',
        'glass-lg':   '0 24px 64px rgba(0,0,0,0.55), 0 4px 16px rgba(0,0,0,0.35)',
        'gold-glow':  '0 0 0 1px hsl(var(--gold) / 0.35), 0 8px 24px hsl(var(--gold) / 0.15)',
        'inner-line': 'inset 0 1px 0 rgba(255,255,255,0.04)',
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
export default config;
