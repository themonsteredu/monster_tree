// /admin/students - 학생 추가/수정/삭제
// admin 쿠키에 저장된 지점의 학생만 표시. 쿠키 없으면 /admin/select-branch 로 이동.

import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerAnonClient } from "@/lib/supabase/server";
import { getMonsterSiteUrl } from "@/lib/monster-site";
import { getAdminBranchId } from "@/lib/branch";
import { isAdminAuthenticated } from "../auth";
import { LoginForm } from "../LoginForm";
import { StudentsClient } from "./StudentsClient";
import type { GardenStudent } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
  if (!isAdminAuthenticated(searchParams.key)) {
    return <LoginForm initialKey={searchParams.key ?? ""} />;
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return (
      <main className="p-6 text-center text-gray-400 bg-gray-50 min-h-screen">
        Supabase 환경변수가 설정되지 않았어요.
      </main>
    );
  }

  const branchId = getAdminBranchId();
  const monsterUrl = getMonsterSiteUrl();

  if (!branchId) {
    redirect("/admin/select-branch");
  }

  const sb = createSupabaseServerAnonClient();
  const { data } = await sb
    .from("garden_students")
    .select("*")
    .eq("branch_id", branchId)
    .order("is_active", { ascending: false })
    .order("class_name", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  return (
    <main className="min-h-screen pb-20 bg-gray-50">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href="/admin"
              className="shrink-0 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg px-3 py-1.5 transition"
            >
              ← 관리
            </Link>
            <h1 className="text-lg font-semibold text-gray-900 truncate">학생 관리</h1>
          </div>
          <a
            href={monsterUrl}
            className="shrink-0 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg px-3 py-1.5 transition"
            aria-label="monster-site 지점 관리자 페이지로"
          >
            ← 본사
          </a>
        </div>
      </header>
      <StudentsClient initialStudents={(data ?? []) as GardenStudent[]} />
    </main>
  );
}
