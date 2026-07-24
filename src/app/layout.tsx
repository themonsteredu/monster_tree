import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./math-adventure.css";

// 사이트 메타데이터
export const metadata: Metadata = {
  title: "사과정원 · 더몬스터학원",
  description: "더몬스터학원 학생 보상 시스템 - 우리들의 사과나무를 키워보세요",
  // iOS Safari 홈화면 추가 시 PWA 처럼 동작 + 학원 로고 사용
  appleWebApp: {
    capable: true,
    title: "사과정원",
    statusBarStyle: "default",
  },
  // basePath '/tree' 때문에 명시적으로 절대 경로로 지정 (자동 감지가 basePath 누락 가능).
  icons: {
    icon: [
      { url: "/tree/icons/monster-symbol.png", type: "image/png", sizes: "any" },
    ],
    apple: [
      { url: "/tree/icons/monster-symbol.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: [
      { url: "/tree/icons/monster-symbol.png" },
    ],
  },
};

// 모바일 admin 화면을 위한 뷰포트 설정 (확대 가능, 한 손 조작 편의성)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#fff8ec",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/galmuri/dist/galmuri.css"
        />
        {/* 손글씨 느낌 폰트 — 학생 건의함 칠판/포스트잇용 */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Gaegu:wght@400;700&family=Nanum+Pen+Script&family=Jua&display=swap"
        />
        {/* iOS / 안드로이드 홈화면 아이콘 — basePath 포함 명시 */}
        <link rel="apple-touch-icon" href="/tree/icons/monster-symbol.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/tree/icons/monster-symbol.png" />
        <link rel="icon" type="image/png" href="/tree/icons/monster-symbol.png" />
        {/* 서비스워커 등록 — 웹 푸시(미수령 포인트 알림) 수신용. basePath 포함 경로 필수 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'if("serviceWorker" in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("/tree/sw.js").catch(function(){})})}',
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
