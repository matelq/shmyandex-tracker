/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Токены сохранили имена «1c-*», но теперь это компактная нейтральная
        // тема Tracker (акцент Indigo). Имена оставлены, чтобы не трогать JSX.
        '1c': {
          bg: '#f6f7f8',
          surface: '#ffffff',
          panel: '#fafafb',
          border: '#d7d9de',
          'border-light': '#e6e7ea',
          'border-dark': '#c4c7cd',
          'border-highlight': '#ffffff',
          text: '#1b1c20',
          'text-secondary': '#52555c',
          'text-muted': '#8b8f98',
          'header-bg': '#1b1c20',
          'header-text': '#ffffff',
          'toolbar-bg': '#fafafb',
          'toolbar-border': '#e6e7ea',
          'menu-bg': '#fafafb',
          'menu-hover': '#ececfb',
          'accent': '#4f5bd5',
          'accent-light': '#6b74de',
          'btn-face': '#ffffff',
          'btn-hover': '#f3f4f6',
          'input-bg': '#ffffff',
          'status-bar': '#fafafb',
          'link': '#4f5bd5',
          'danger': '#cf5454',
          'warning': '#c5810f',
          'success': '#2f9e6e',
          'selected': '#ececfb',
          'selected-text': '#4148b8',
        },
      },
      fontFamily: {
        '1c': ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '1c-xs': ['11px', '15px'],
        '1c-sm': ['12px', '16px'],
        '1c-base': ['13px', '18px'],
        '1c-lg': ['15px', '20px'],
      },
      boxShadow: {
        '1c-raised': '0 1px 2px rgba(0,0,0,.05), 0 10px 28px rgba(0,0,0,.10)',
        '1c-sunken': 'inset 0 0 0 1px #d7d9de',
        '1c-etched': '0 1px 2px rgba(0,0,0,.04)',
        '1c-field': 'inset 0 0 0 1px #d7d9de',
      },
    },
  },
  plugins: [],
};
