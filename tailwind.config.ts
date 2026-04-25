import type { Config } from "tailwindcss";

// 사과정원 디자인 토큰 - 새 비주얼 가이드 (트렌디 + 따뜻한 + 아이들이 좋아하는)
// CSS 변수와 1:1 매칭됨 (globals.css 참조)
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 메인 텍스트/외곽선
        ink: "var(--ink)",
        "ink-soft": "var(--ink-soft)",

        // 배경
        "bg-warm-start": "var(--bg-warm-start)",
        "bg-warm-end": "var(--bg-warm-end)",

        // 화분 / 줄기 / 잎 / 사과 (SVG 외에서도 사용 가능하게 노출)
        "pot-light": "var(--pot-light)",
        "pot-base": "var(--pot-base)",
        "pot-soil": "var(--pot-soil)",
        "trunk-light": "var(--trunk-light)",
        "trunk-base": "var(--trunk-base)",
        "leaf-light": "var(--leaf-light)",
        "leaf-base": "var(--leaf-base)",
        "leaf-deep": "var(--leaf-deep)",
        "leaf-highlight": "var(--leaf-highlight)",
        "leaf-sick": "var(--leaf-sick)",
        "apple-light": "var(--apple-light)",
        "apple-base": "var(--apple-base)",
        "apple-deep": "var(--apple-deep)",

        // 포인트/액센트
        "accent-gold": "var(--accent-gold)",
        "accent-gold-deep": "var(--accent-gold-deep)",
        "accent-purple": "var(--accent-purple)",
        "accent-pink": "var(--accent-pink)",
        "accent-success": "var(--accent-success)",
        "accent-warning": "var(--accent-warning)",
        "accent-warning-bg": "var(--accent-warning-bg)",

        // 카드 배경
        "card-bg": "var(--card-bg)",
        "card-bg-hero": "var(--card-bg-hero)",

        // === 하위호환용 별칭 (legacy 컴포넌트들이 참조 중) ===
        apple: "var(--apple-base)",
        "ink-strong": "var(--ink)",
        cream: "var(--bg-warm-start)",
        "cream-deep": "var(--bg-warm-end)",
        "harvest-gold": "var(--accent-gold)",
        pot: "var(--pot-base)",
        "leaf-dark": "var(--leaf-base)",
      },
      fontFamily: {
        sans: [
          "Pretendard Variable",
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "Roboto",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "var(--card-shadow)",
        "card-pop": "var(--card-shadow-pop)",
      },
      borderRadius: {
        "4xl": "1.5rem",
      },
      keyframes: {
        "pop-in": {
          "0%": { transform: "scale(0.8)", opacity: "0" },
          "60%": { transform: "scale(1.08)", opacity: "1" },
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
        sparkle: {
          "0%, 100%": { transform: "scale(1) rotate(0deg)", opacity: "0.8" },
          "50%": { transform: "scale(1.25) rotate(15deg)", opacity: "1" },
        },
      },
      animation: {
        "pop-in": "pop-in 480ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        "soft-bounce": "soft-bounce 1.6s ease-in-out infinite",
        "fade-out": "fade-out 600ms ease-out forwards",
        sparkle: "sparkle 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
