/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          200: '#c5d3e3', 300: '#a3b8d0', 400: '#8aa3c2', 500: '#6f89ab',
          600: '#5b7597', 800: '#34445a', 950: '#1c2430',
        },
        ok: {
          300: '#a9cdb8', 400: '#7fb095', 500: '#5f9477', 600: '#4d7d63',
          800: '#2f4d3c', 950: '#17251d',
        },
        warn: {
          300: '#dcc59a', 400: '#c9a96e', 500: '#b08d52',
          800: '#5c4a2a', 950: '#2a2214',
        },
        danger: {
          300: '#e0a9a6', 400: '#cc7f7b', 500: '#b45f5b',
          800: '#5e2f2d', 900: '#4a2523', 950: '#2a1615',
        },
      },
    },
  },
  plugins: [],
}
