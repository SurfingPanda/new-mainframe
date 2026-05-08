/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Eljin Corp navy (logo shield + wordmark)
        brand: {
          50: '#f2f5fb',
          100: '#e0e7f3',
          200: '#c2cee5',
          300: '#97a9cd',
          400: '#647eb1',
          500: '#3f5b95',
          600: '#2c447b',
          700: '#243866',
          800: '#1c2c50',
          900: '#0e1c3d',
          950: '#061029'
        },
        // Eljin Corp green (logo checkmark + "Corp." accent)
        accent: {
          50: '#ecfbef',
          100: '#d1f5d8',
          200: '#a3eab1',
          300: '#6dd986',
          400: '#3dc25b',
          500: '#22a23e',
          600: '#168532',
          700: '#126a2a',
          800: '#115425',
          900: '#0d4520',
          950: '#052711'
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace']
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(14 28 61 / 0.04), 0 1px 3px 0 rgb(14 28 61 / 0.06)',
        elevated: '0 12px 32px -14px rgb(14 28 61 / 0.22)',
        glow: '0 0 0 1px rgb(34 162 62 / 0.18), 0 12px 32px -14px rgb(14 28 61 / 0.22)'
      }
    }
  },
  plugins: []
};
