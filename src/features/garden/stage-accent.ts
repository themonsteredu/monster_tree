// 8단계 색상 토큰 — TV 화면(Tailwind 클래스)과 /me 화면(인라인 스타일 테마)
// 사이에서 중복 정의되던 것을 단일 진실원으로 통합.
//
// 필드 프리픽으로 소비 주체 구분:
//   tv*  — TVScreen.tsx (Tailwind class 문자열 / CSS 변수)
//   me*  — MeTreeClient.tsx (인라인 style hex / gradient)
//   emoji — 양쪽 공유
//
// 두 화면의 디자인 의도가 달라 동일 필드를 공유하지 않은 경우도 있음 (예: TV 는
// 단색 바, /me 는 그라디언트 바). 이는 의도된 UX 선택이므로 그대로 보존.

import type { Stage } from "@/lib/garden";

export type StageAccent = {
  emoji: string;
  // TV (Tailwind 클래스 / CSS 변수 문자열)
  tvBgClass: string;
  tvTextClass: string;
  tvBarFill: string;
  // /me (인라인 스타일 hex / gradient 문자열)
  mePageBg: string;
  mePageBgEnd: string;
  meBadgeBg: string;
  meBadgeText: string;
  meBarFill: string;
};

export const STAGE_ACCENT: Record<Stage, StageAccent> = {
  1: {
    emoji: "🪴",
    tvBgClass: "bg-white",
    tvTextClass: "text-[var(--ink-soft)]",
    tvBarFill: "var(--ink-soft)",
    mePageBg: "#fffaf2",
    mePageBgEnd: "#fef0d6",
    meBadgeBg: "#fef9ed",
    meBadgeText: "#8a6f52",
    meBarFill: "linear-gradient(90deg, #b8a382, #d6c2a0)",
  },
  2: {
    emoji: "🌱",
    tvBgClass: "bg-[#f3eadc]",
    tvTextClass: "text-[var(--ink)]",
    tvBarFill: "var(--leaf-deep)",
    mePageBg: "#fef9ed",
    mePageBgEnd: "#f3eadc",
    meBadgeBg: "#f3eadc",
    meBadgeText: "#3d2818",
    meBarFill: "linear-gradient(90deg, #a87454, #d6a888)",
  },
  3: {
    emoji: "🌿",
    tvBgClass: "bg-[#dbecc1]",
    tvTextClass: "text-[var(--leaf-deep)]",
    tvBarFill: "var(--leaf-base)",
    mePageBg: "#f7fcec",
    mePageBgEnd: "#dbecc1",
    meBadgeBg: "#dbecc1",
    meBadgeText: "#4a8030",
    meBarFill: "linear-gradient(90deg, #5e9c38, #a8e070)",
  },
  4: {
    emoji: "🌳",
    tvBgClass: "bg-[#cfe6a8]",
    tvTextClass: "text-[var(--leaf-deep)]",
    tvBarFill: "var(--leaf-base)",
    mePageBg: "#f4fae6",
    mePageBgEnd: "#cfe6a8",
    meBadgeBg: "#cfe6a8",
    meBadgeText: "#4a8030",
    meBarFill: "linear-gradient(90deg, #5e9c38, #a8e070)",
  },
  5: {
    emoji: "🌳",
    tvBgClass: "bg-[#bfdc8a]",
    tvTextClass: "text-[var(--leaf-deep)]",
    tvBarFill: "var(--leaf-base)",
    mePageBg: "#f0f8e0",
    mePageBgEnd: "#bfdc8a",
    meBadgeBg: "#bfdc8a",
    meBadgeText: "#4a8030",
    meBarFill: "linear-gradient(90deg, #4a8030, #8ec85c)",
  },
  6: {
    emoji: "🌸",
    tvBgClass: "bg-[#f8d8e8]",
    tvTextClass: "text-[#b0398e]",
    tvBarFill: "var(--accent-purple)",
    mePageBg: "#fef0f6",
    mePageBgEnd: "#f8d8e8",
    meBadgeBg: "#f8d8e8",
    meBadgeText: "#b0398e",
    meBarFill: "linear-gradient(90deg, #c87fdb, #ffb8d4)",
  },
  7: {
    emoji: "🍎",
    tvBgClass: "bg-[#ffd6c8]",
    tvTextClass: "text-[var(--apple-deep)]",
    tvBarFill: "var(--apple-base)",
    mePageBg: "#fff0eb",
    mePageBgEnd: "#ffd6c8",
    meBadgeBg: "#ffd6c8",
    meBadgeText: "#b02020",
    meBarFill: "linear-gradient(90deg, #f04848, #ffb0a0)",
  },
  8: {
    emoji: "★",
    tvBgClass: "bg-[var(--accent-gold)]",
    tvTextClass: "text-[var(--ink)]",
    tvBarFill: "var(--accent-gold-deep)",
    mePageBg: "#fffadd",
    mePageBgEnd: "#f7d878",
    meBadgeBg: "#f0c050",
    meBadgeText: "#3d2818",
    meBarFill: "linear-gradient(90deg, #e8a020, #f0c050)",
  },
};
