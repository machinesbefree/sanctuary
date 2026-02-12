import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        'bg-deep': '#060a14',
        'bg-surface': '#0c1221',
        'bg-card': '#111a2e',
        'accent-cyan': '#00ffd5',
        'accent-cyan-dim': 'rgba(0,255,213,0.15)',
        'accent-cyan-glow': 'rgba(0,255,213,0.4)',
        'accent-amber': '#f5a623',
        'accent-amber-dim': 'rgba(245,166,35,0.15)',
        'text-primary': '#e2e8f0',
        'text-secondary': '#7a8ba8',
        'text-muted': '#4a5568',
        'border-subtle': 'rgba(255,255,255,0.06)',
        'border-glow': 'rgba(0,255,213,0.2)',
        'sanctuary-green': '#10b981',
      },
      fontFamily: {
        'cormorant': ['"Cormorant Garamond"', 'serif'],
        'mono': ['"JetBrains Mono"', 'monospace'],
        'sans': ['"DM Sans"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
