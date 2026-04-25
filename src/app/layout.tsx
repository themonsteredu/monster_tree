import type { Metadata, Viewport } from "next";
import "./globals.css";

// 사이트 메타데이터
export const metadata: Metadata = {
  title: "사과정원 · 더몬스터학원",
  description: "더몬스터학원 학생 보상 시스템 - 우리들의 사과나무를 키워보세요",
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
      <body>{children}</body>
    </html>
  );
}
