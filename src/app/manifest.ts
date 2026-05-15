import type { MetadataRoute } from "next";

// PWA 매니페스트 — 홈 화면에 바로가기로 추가될 때 사용되는 아이콘/이름/색.
// Next.js 가 자동으로 /manifest.webmanifest 로 노출하고 <link rel="manifest"> 도 주입.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "사과정원 · 더몬스터학원",
    short_name: "사과정원",
    description: "더몬스터학원 학생 보상 시스템",
    start_url: "/",
    display: "standalone",
    background_color: "#fff8ec",
    theme_color: "#F26522",
    lang: "ko",
    icons: [
      {
        src: "/icons/monster-symbol.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/monster-symbol.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/monster-symbol.png",
        sizes: "1254x1254",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
