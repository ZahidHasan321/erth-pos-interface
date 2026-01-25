import type { Config } from 'tailwindcss'
import { fontFamily } from 'tailwindcss/defaultTheme'

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Montserrat', ...fontFamily.sans],
        heading: ['Marcellus', 'serif'],
        brand: ['Hidayatullah', 'cursive'],
      },
    },
  },
  plugins: [],
} satisfies Config
