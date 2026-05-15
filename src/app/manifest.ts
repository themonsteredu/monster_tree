import type { MetadataRoute } from "next";

// PWA 매니페스트 — 홈 화면에 바로가기로 추가될 때 사용되는 아이콘/이름/색.
// 사이트가 basePath '/tree' 아래 배포되므로 모든 경로에 /tree 명시 필요.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "사과정원 · 더몬스터학원",
    short_name: "사과정원",
    description: "더몬스터학원 학생 보상 시스템",
    start_url: "/tree/me",
    scope: "/tree/",
    display: "standalone",
    background_color: "#fff8ec",
    theme_color: "#F26522",
    lang: "ko",
    icons: [
      {
        src: "/tree/icons/monster-symbol.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/tree/icons/monster-symbol.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/tree/icons/monster-symbol.png",
        sizes: "1254x1254",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
