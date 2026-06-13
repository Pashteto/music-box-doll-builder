/* =====================================================================
   linden_tar — Tailwind theme extension (TEMPLATE).
   Adopt by spreading into tailwind.config / @theme. Mirrors tokens.css.
   The app uses Tailwind v4: prefer the CSS-first @theme block (see
   `tailwindV4Theme` string export below) and reference design/tokens/tokens.css.
   This CJS object is provided for tooling, v3 fallback, or programmatic use.
   ===================================================================== */

const colors = {
  ink: {
    950: '#0B0907',
    900: '#12100D',
    800: '#1B1814',
    700: '#26211B',
    600: '#352E26',
    500: '#4A4137',
  },
  porcelain: {
    50:  '#F6F1E9',
    100: '#EBE3D7',
    200: '#D6CBBA',
    300: '#B6A992',
    400: '#8C7F6B',
  },
  crimson: {
    300: '#D9596A',
    400: '#C03A4A',
    500: '#A11D2C',
    600: '#841421',
    700: '#5E0E18',
  },
  ember: {
    300: '#E2935C',
    400: '#C9743C',
    500: '#A85A28',
  },
  verdigris: {
    300: '#7FA38C',
    400: '#5C8270',
    500: '#3E5E50',
  },
  clay: {
    300: '#C7A98F',
    400: '#A8835F',
  },
};

const theme = {
  extend: {
    colors: {
      ...colors,
      // semantic aliases (map to CSS vars so runtime theming stays possible)
      bg: {
        base: 'var(--color-bg-base)',
        DEFAULT: 'var(--color-bg)',
        subtle: 'var(--color-bg-subtle)',
      },
      surface: {
        DEFAULT: 'var(--color-surface)',
        overlay: 'var(--color-surface-overlay)',
      },
      primary: {
        DEFAULT: 'var(--color-primary)',
        hover: 'var(--color-primary-hover)',
        active: 'var(--color-primary-active)',
        subtle: 'var(--color-primary-subtle)',
      },
      accent: {
        ember: 'var(--color-accent-ember)',
        verdigris: 'var(--color-accent-verdigris)',
        clay: 'var(--color-accent-clay)',
      },
      content: {
        DEFAULT: 'var(--color-text)',
        heading: 'var(--color-text-heading)',
        secondary: 'var(--color-text-secondary)',
        muted: 'var(--color-text-muted)',
        faint: 'var(--color-text-faint)',
      },
      border: {
        DEFAULT: 'var(--color-border)',
        glaze: 'var(--color-border-glaze)',
      },
    },
    fontFamily: {
      display: ['Fraunces', 'Cormorant Garamond', 'Georgia', 'serif'],
      body: ['Mulish', 'Helvetica Neue', 'Arial', 'sans-serif'],
      mono: ['IBM Plex Mono', 'ui-monospace', 'Menlo', 'monospace'],
    },
    fontSize: {
      'display-2xl': ['clamp(2.75rem, 9vw, 3.25rem)', { lineHeight: '1.02', letterSpacing: '-0.02em' }],
      'display-xl':  ['clamp(2.1rem, 7vw, 2.5rem)',  { lineHeight: '1.04', letterSpacing: '-0.015em' }],
      'display-lg':  ['1.875rem', { lineHeight: '1.08', letterSpacing: '-0.01em' }],
      'display-md':  ['1.5rem',   { lineHeight: '1.15' }],
      'serif-italic':['1.125rem', { lineHeight: '1.4' }],
      'body-lg':     ['1.0625rem',{ lineHeight: '1.6' }],
      'body-md':     ['0.9375rem',{ lineHeight: '1.6' }],
      'body-sm':     ['0.8125rem',{ lineHeight: '1.5' }],
      'label':       ['0.75rem',  { lineHeight: '1.3', letterSpacing: '0.16em' }],
      'label-sm':    ['0.6875rem',{ lineHeight: '1.3', letterSpacing: '0.18em' }],
    },
    letterSpacing: {
      tighter: '-0.02em',
      tight: '-0.01em',
      wide: '0.08em',
      wider: '0.16em',
      widest: '0.2em',
    },
    borderRadius: {
      sm: '4px',
      md: '8px',
      lg: '14px',
      xl: '22px',
      pill: '999px',
    },
    boxShadow: {
      sm: '0 1px 2px rgba(0,0,0,0.5)',
      md: '0 8px 24px -8px rgba(0,0,0,0.6)',
      lg: '0 24px 60px -16px rgba(0,0,0,0.72)',
      glaze: 'inset 0 1px 0 rgba(246,241,233,0.10)',
      'glow-crimson': '0 0 0 1px rgba(192,58,74,0.30), 0 8px 28px -6px rgba(161,29,44,0.45)',
    },
    transitionTimingFunction: {
      standard: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
      emphasis: 'cubic-bezier(0.16, 1, 0.3, 1)',
    },
    transitionDuration: {
      fast: '160ms',
      base: '260ms',
      slow: '520ms',
    },
    maxWidth: {
      frame: '430px',
      content: '1100px',
    },
  },
};

/* Tailwind v4 CSS-first @theme snippet (paste into globals.css after importing tokens.css). */
const tailwindV4Theme = `
@theme {
  --color-ink-900: #12100D;
  --color-ink-800: #1B1814;
  --color-porcelain-50: #F6F1E9;
  --color-crimson-500: #A11D2C;
  --color-ember-400: #C9743C;
  --color-verdigris-400: #5C8270;
  --font-display: 'Fraunces', 'Cormorant Garamond', Georgia, serif;
  --font-body: 'Mulish', 'Helvetica Neue', Arial, sans-serif;
}
/* Then use design/tokens/tokens.css :root vars for the full semantic set. */
`;

module.exports = { colors, theme, tailwindV4Theme };
module.exports.default = theme;
