import type { Config } from "tailwindcss";

// Paper Dashboard theme. Neutral + accent palettes resolve to CSS variables
// (see globals.css) so every utility automatically switches between light and dark mode.
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
const palette = (name: string) =>
  Object.fromEntries(SHADES.map((s) => [s, `rgb(var(--${name}-${s}) / <alpha-value>)`]));

export default {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Montserrat", "system-ui", "sans-serif"] },
      colors: {
        page: "rgb(var(--page) / <alpha-value>)",
        card: "rgb(var(--card) / <alpha-value>)",
        sidebar: "rgb(var(--sidebar) / <alpha-value>)",
        slate: palette("slate"),
        blue: palette("blue"),
        indigo: palette("indigo"),
        emerald: palette("emerald"),
        orange: palette("orange"),
        amber: palette("amber"),
        rose: palette("rose"),
        violet: palette("violet"),
        pink: palette("pink"),
        teal: palette("emerald"),
      },
      boxShadow: {
        card: "0 1px 2px rgb(0 0 0 / 0.05), 0 6px 10px -4px rgb(0 0 0 / var(--shadow-a))",
      },
    },
  },
  plugins: [],
} satisfies Config;
