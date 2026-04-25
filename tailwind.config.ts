import type { Config } from "tailwindcss";

// 사과정원 디자인 토큰 - 기획서 §6 색상 팔레트 기반
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 사과나무 팔레트
        pot: "#c2734a",
        "pot-rim": "#a85d3d",
        soil: "#5a3a28",
        bark: "#7d5b3d",
        "leaf-dark": "#6ba34e",
        "leaf-light": "#85c469",
        apple: "#d63b3b",
        "apple-light": "#e74c4c",
        "blossom-dark": "#f4a8c0",
        "blossom-light": "#fdcfdf",
        "harvest-gold": "#f0c050",

        // UI 톤 (따뜻한 크림 베이스)
        cream: "#fff8ec",
        "cream-deep": "#fdeed1",
        "ink-strong": "#3a2a1a",
        "ink-soft": "#7a6552",
      },
      fontFamily: {
        sans: [
          "Pretendard",
          "Pretendard Variable",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "Roboto",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 6px 20px -10px rgba(122, 80, 40, 0.25)",
        "card-pop": "0 10px 30px -10px rgba(214, 59, 59, 0.45)",
      },
      keyframes: {
        "pop-in": {
          "0%": { transform: "scale(0.85)", opacity: "0" },
          "60%": { transform: "scale(1.06)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "soft-bounce": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-4px)" },
        },
        "fade-out": {
          "0%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
      },
      animation: {
        "pop-in": "pop-in 480ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        "soft-bounce": "soft-bounce 1.6s ease-in-out infinite",
        "fade-out": "fade-out 600ms ease-out forwards",
      },
    },
  },
  plugins: [],
};

export default config;
