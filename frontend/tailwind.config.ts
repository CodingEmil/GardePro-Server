import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:            '#0d1117',
        surface:       '#161b22',
        border:        '#30363d',
        accent:        '#3fb950',
        'accent-dim':  '#2ea043',
        muted:         '#8b949e',
        text:          '#e6edf3',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
