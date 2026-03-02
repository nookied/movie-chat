import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        plex: {
          bg: '#1a1a1a',
          card: '#252525',
          border: '#333333',
          accent: '#e5a00d',
          'accent-hover': '#f0b429',
        },
      },
    },
  },
  plugins: [],
};

export default config;
