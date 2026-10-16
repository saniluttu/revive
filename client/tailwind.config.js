/** @type {import('tailwindcss').Config} */

// Design system (Stitch): Material-style colour roles, an elderly-friendly type
// scale (nothing below 16px) and soft rounded cards.
const PRIMARY = '#00685f'

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: PRIMARY,
        'primary-container': '#008378',
        'on-primary': '#ffffff',
        'primary-fixed': '#89f5e7',
        secondary: '#006d3e',
        'secondary-container': '#8cf5b2',
        tertiary: '#97422b',
        'tertiary-fixed': '#ffdbd2',
        background: '#f9f9ff',
        surface: '#f9f9ff',
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#f0f3ff',
        'surface-container': '#e7eeff',
        'surface-container-high': '#dee8ff',
        'on-surface': '#111c2d',
        'on-surface-variant': '#3d4947',
        'outline-variant': '#bcc9c6',
        error: '#ba1a1a',
        // Older pages use brand-*: the same teal family, so they match
        brand: {
          50: '#e8f6f4',
          100: '#c8ece7',
          500: '#008378',
          600: PRIMARY,
          700: '#00544d',
          800: '#003f3a',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '"Noto Sans Malayalam"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // never below 16px
        xs: ['16px', '22px'],
        sm: ['16px', '24px'],
        display: ['40px', { lineHeight: '52px', fontWeight: '700' }],
        'headline-lg': ['32px', { lineHeight: '44px', fontWeight: '700' }],
        'headline-md': ['24px', { lineHeight: '34px', fontWeight: '600' }],
        'body-xl': ['20px', '32px'],
        'body-lg': ['18px', '28px'],
        'label-lg': ['18px', { lineHeight: '24px', fontWeight: '600' }],
      },
      borderRadius: {
        xl: '0.75rem',
      },
      boxShadow: {
        soft: '0 4px 20px -2px rgba(30, 41, 59, 0.05)',
      },
    },
  },
  plugins: [],
}
