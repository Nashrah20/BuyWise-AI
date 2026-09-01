/**
 * BuyWise design tokens.
 *
 * A warm, light, "classy" palette: ivory paper, ink text, a deep forest green
 * for anything the agent decides, and brass for highlights. Deliberately calm -
 * the shopper should be reading recommendations, not fighting the interface.
 */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#FBFAF7',
        card: '#FFFFFF',
        ink: {
          DEFAULT: '#1C1B18',
          soft: '#4A4842',
          muted: '#7A776E',
          faint: '#A5A29A',
        },
        line: {
          DEFAULT: '#E7E3DA',
          soft: '#F1EEE7',
        },
        forest: {
          50: '#F0F6F3',
          100: '#DCEBE4',
          200: '#B7D6C8',
          300: '#8ABBA6',
          500: '#2F7D5F',
          600: '#256349',
          700: '#1C4E3A',
          900: '#123326',
        },
        brass: {
          50: '#FBF6EC',
          100: '#F5E9D2',
          300: '#DFC08A',
          500: '#B8863B',
          600: '#966B2C',
        },
        clay: {
          50: '#FCF1EE',
          200: '#F4D3CA',
          500: '#B4553F',
        },
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(28,27,24,0.04), 0 8px 24px -12px rgba(28,27,24,0.12)',
        lift: '0 2px 4px rgba(28,27,24,0.05), 0 18px 40px -18px rgba(28,27,24,0.22)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-dot': {
          '0%, 80%, 100%': { opacity: '0.25', transform: 'scale(0.8)' },
          '40%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.35s ease-out both',
        'pulse-dot': 'pulse-dot 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
