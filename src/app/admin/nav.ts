// 몬스터마을 관리자 메뉴 정의 — 여기 한 곳만 고치면 모든 관리 화면에 반영된다.
//
// 이 파일이 생긴 이유(비개발자용):
//   · 예전에는 관리 메뉴가 사과정원(/admin/garden) 화면에만 달려 있었다.
//     그래서 리포트 화면에서 학생관리로 가려면 "← 관리" 로 사과정원까지
//     되돌아갔다가 다시 눌러야 했다(3번 이동).
//   · 게다가 마을 구성·상점·건의함은 아예 메뉴에 없어서, monster-site 로
//     나갔다 들어오거나 몬스터마을 미리보기에서 건물을 클릭해야만 갈 수 있었다.
//   · 이제 아래 목록이 모든 관리 화면 위쪽에 똑같이 붙는다. 어디서든 한 번에 이동.

export type AdminNavItem = {
  /** 화면 구분용 키. AdminHeader 의 current 와 같으면 주황으로 강조된다. */
  key: string;
  label: string;
  href: string;
};

export type AdminNavGroup = {
  key: string;
  items: AdminNavItem[];
};

/** 관리자 첫 화면. /admin 은 여기로 redirect 된다. */
export const ADMIN_HOME = "/admin/garden";

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    key: "garden",
    items: [
      { key: "garden", label: "사과정원", href: "/admin/garden" },
      { key: "students", label: "학생관리", href: "/admin/students" },
      { key: "reports", label: "리포트", href: "/admin/reports" },
    ],
  },
  {
    key: "village",
    items: [
      { key: "village", label: "마을 구성", href: "/admin/village" },
      { key: "village-preview", label: "마을 보기", href: "/admin/village-preview" },
    ],
  },
  {
    key: "content",
    items: [
      { key: "gallery", label: "아바타갤러리", href: "/admin/gallery" },
      { key: "tree", label: "나무이미지", href: "/admin/tree" },
      { key: "decorations", label: "마당소품", href: "/admin/decorations" },
      { key: "yard", label: "마당배경", href: "/admin/yard" },
      { key: "monsters", label: "몬스터종", href: "/admin/monsters" },
    ],
  },
  {
    key: "feature",
    items: [
      { key: "quiz-center", label: "퀴즈관리", href: "/admin/quiz-center" },
      { key: "shop", label: "상점", href: "/admin/shop" },
      { key: "suggest", label: "건의함", href: "/admin/suggest" },
    ],
  },
  {
    key: "system",
    items: [{ key: "reset", label: "학기리셋", href: "/admin/reset" }],
  },
];
