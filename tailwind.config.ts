import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#FDF7EF",
        parchment: "#F6E9D8",
        card: "#FFFCF7",
        ink: "#2B1D16",
        "ink-soft": "#6B5445",
        muted: "#9C8674",
        line: "#EADBC8",
        terracotta: "#C1553A",
        "terracotta-soft": "#E08560",
        amber: "#DE922B",
        honey: "#F2C14E",
        clay: "#8C4A32",
        olive: "#6E8257",
        berry: "#A03A4E",
        night: "#241710",
        "night-soft": "#33231A",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      boxShadow: {
        warm: "0 1px 2px rgba(80,45,25,.06), 0 8px 24px -12px rgba(80,45,25,.18)",
        "warm-lg":
          "0 2px 4px rgba(80,45,25,.06), 0 20px 48px -20px rgba(80,45,25,.30)",
        inset: "inset 0 1px 3px rgba(80,45,25,.10)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        pop: {
          "0%": { opacity: "0", transform: "scale(.94)" },
          "60%": { transform: "scale(1.02)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(.9)", opacity: "0.7" },
          "70%": { transform: "scale(1.8)", opacity: "0" },
          "100%": { transform: "scale(1.8)", opacity: "0" },
        },
        blink: {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
      },
      animation: {
        "fade-up": "fade-up .4s cubic-bezier(.2,.7,.3,1) both",
        pop: "pop .32s cubic-bezier(.2,.8,.3,1) both",
        shimmer: "shimmer 1.6s infinite",
        "pulse-ring": "pulse-ring 1.8s cubic-bezier(.2,.7,.3,1) infinite",
        blink: "blink 1s step-end infinite",
      },
    },
  },
  plugins: [],
};

export default config;
