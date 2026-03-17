/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Brushed aluminum palette
        metal: {
          50:  '#f8f8f8',
          100: '#f0f0f0',
          200: '#e0e0e0',
          300: '#d0d0d0',
          400: '#c0c0c0',
          500: '#a8a8a8',
          600: '#909090',
          700: '#707070',
          800: '#505050',
          900: '#333333',
          950: '#1a1a1a',
        },
        // Dark panel / console surface
        panel: {
          50:  '#3a3a3a',
          100: '#2e2e2e',
          200: '#282828',
          300: '#222222',
          400: '#1c1c1c',
          500: '#181818',
          600: '#141414',
          700: '#111111',
          800: '#0d0d0d',
          900: '#0a0a0a',
        },
        // LED / indicator colors
        led: {
          green:   '#44ff44',
          amber:   '#ffaa00',
          red:     '#ff3333',
          blue:    '#44aaff',
          dimGreen: '#1a3a1a',
        },
        // Accent warm gold
        accent: {
          warm:  '#d4a843',
          amber: '#c8901a',
          dim:   '#7a5010',
        },
      },
      fontFamily: {
        mono: ['"Courier New"', '"Lucida Console"', 'monospace'],
      },
      boxShadow: {
        'machined': 'inset 0 1px 3px rgba(0,0,0,0.35), inset 0 -1px 0 rgba(255,255,255,0.6), 0 1px 0 rgba(255,255,255,0.5)',
        'channel':  'inset 0 1px 0 rgba(255,255,255,0.7), inset 0 -1px 0 rgba(0,0,0,0.2), 0 2px 4px rgba(0,0,0,0.3)',
        'inset-deep': 'inset 0 2px 6px rgba(0,0,0,0.7), inset 0 1px 0 rgba(0,0,0,0.5)',
        'led-green': '0 0 6px rgba(68,255,68,0.5)',
        'led-amber': '0 0 6px rgba(255,170,0,0.5)',
        'led-red':   '0 0 6px rgba(255,51,51,0.5)',
        'led-blue':  '0 0 6px rgba(68,170,255,0.5)',
      },
    },
  },
  plugins: [],
}
