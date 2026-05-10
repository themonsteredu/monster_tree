// /admin/students - 학생 추가/수정/삭제
// 해당 지점 (BRANCH_ID env) 의 학생만 표시.

import Link from "next/link";
import { createSupabaseServerAnonClient } from "@/lib/supabase/server";
import { getMonsterSiteUrl } from "@/lib/monster-site";
import { getBranchId } from "@/lib/branch";
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
      <main className="p-6 text-center text-ink-soft">
        Supabase 환경변수가 설정되지 않았어요.
      </main>
    );
  }

  const branchId = getBranchId();
  const monsterUrl = getMonsterSiteUrl();

  if (!branchId) {
    return (
      <main className="p-6">
        <div className="max-w-lg mx-auto bg-[#fef2f0] border-[2.5px] border-[var(--apple-deep)] rounded-2xl p-6">
          <div className="text-3xl mb-2">⚠️</div>
          <h1 className="text-lg font-extrabold text-[var(--apple-deep)] mb-2">
            BRANCH_ID 환경변수가 설정되지 않았어요
          </h1>
          <p className="text-sm text-[var(--ink)]">
            Vercel 프로젝트 설정에서 <code className="px-1.5 py-0.5 bg-white rounded">BRANCH_ID</code> 추가 필요.
          </p>
        </div>
      </main>
    );
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
    <main className="min-h-screen pb-20">
      <header className="sticky top-0 z-30 bg-cream/90 backdrop-blur border-b border-pot/10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link href="/admin" className="text-ink-soft hover:text-apple text-sm shrink-0">← 관리</Link>
            <h1 className="text-xl font-bold truncate">학생 관리</h1>
          </div>
          <a
            href={monsterUrl}
            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white border-[1.5px] border-[var(--ink)] text-[var(--ink)] text-xs font-extrabold shadow-card"
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
