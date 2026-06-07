import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        axle: {
          green: '#5dc89a',
          dark: '#0a0a0a',
          surface: '#141414',
          border: '#2a2a2a',
        },
      },
    },
  },
  plugins: [],
};

export default config;
