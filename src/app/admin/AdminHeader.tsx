// 관리 화면 공통 헤더 — 제목 + 전체 메뉴 + 지점/본사 링크.
//
// 예전에는 페이지마다 "← 관리" 한 줄만 있었고 메뉴는 사과정원에만 있었다.
// 이제 이 컴포넌트를 얹으면 어느 관리 화면에서든 같은 메뉴로 바로 이동할 수 있다.
// (미리보기 계열 화면 /admin/*-preview 는 "학생 화면 그대로" 보여주는 게 목적이라
//  이 헤더를 붙이지 않는다 — 자체 '관리자 미리보기' 배너를 그대로 쓴다.)

import Link from "next/link";
import { getAdminBranchId, getAdminBranchName } from "@/lib/branch";
import { getMonsterSiteUrl } from "@/lib/monster-site";
import { ADMIN_NAV } from "./nav";

// 헤더 폭은 본문 폭(page 마다 max-w-md ~ max-w-5xl 로 제각각)과 분리한다.
// 본문에 맞추면 좁은 페이지에서 메뉴가 잘려 가로 스크롤을 해야만 보인다.
const SHELL = "max-w-7xl";

export function AdminHeader({
  current,
  title,
  extra,
}: {
  /** 현재 화면의 nav key — nav.ts 의 item.key 와 같아야 강조된다. */
  current: string;
  title: string;
  /** 그 화면에만 있는 버튼 (예: 몬스터종의 '도감 미리보기'). */
  extra?: React.ReactNode;
}) {
  const branchId = getAdminBranchId();
  const branchName = getAdminBranchName();

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-100">
      <div className={`${SHELL} mx-auto px-4 pt-3 pb-2 flex items-center justify-between gap-3`}>
        <div className="min-w-0 flex items-baseline gap-2">
          <h1 className="text-lg font-semibold text-gray-900 truncate leading-tight">{title}</h1>
          {branchName && <span className="text-xs text-gray-400 truncate">{branchName}</span>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {extra}
          {branchId && (
            <Link
              href={`/?branch=${encodeURIComponent(branchId)}`}
              target="_blank"
              className="text-xs text-gray-400 hover:text-gray-700 rounded-lg px-2 py-1 transition"
            >
              TV화면 ↗
            </Link>
          )}
          <Link
            href="/admin/select-branch"
            className="text-xs text-gray-400 hover:text-gray-700 rounded-lg px-2 py-1 transition"
            title={`지점: ${branchName ?? branchId ?? "미선택"}`}
          >
            지점 변경
          </Link>
          <a
            href={getMonsterSiteUrl()}
            className="text-xs text-gray-400 hover:text-gray-700 rounded-lg px-2 py-1 transition"
            aria-label="monster-site 지점 관리자 페이지로"
          >
            본사 ↗
          </a>
        </div>
      </div>

      {/* 메뉴 — 좁은 화면에서는 가로 스크롤. 묶음 사이는 세로 선으로 구분. */}
      <nav className={`${SHELL} mx-auto px-4 pb-2 overflow-x-auto`}>
        <div className="flex flex-nowrap items-center gap-1 whitespace-nowrap min-w-max">
          {ADMIN_NAV.map((group, gi) => (
            <div key={group.key} className="flex items-center gap-1">
              {gi > 0 && (
                <span className="shrink-0 w-px h-4 bg-gray-200 mx-1.5" aria-hidden="true" />
              )}
              {group.items.map((item) => {
                const active = item.key === current;
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={
                      "shrink-0 text-sm rounded-lg px-3 py-1.5 transition " +
                      (active
                        ? "font-semibold text-orange-600 bg-orange-50"
                        : "font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-50")
                    }
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </nav>
    </header>
  );
}
