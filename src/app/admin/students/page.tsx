// /admin/students - 학생 추가/수정/삭제
// 단순 CRUD. Phase 2 에서 반(class) 별 일괄 관리 추가 예정.

import Link from "next/link";
import { createSupabaseServerAnonClient } from "@/lib/supabase/server";
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

  const sb = createSupabaseServerAnonClient();
  const { data } = await sb
    .from("garden_students")
    .select("*")
    .order("is_active", { ascending: false })
    .order("class_name", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  return (
    <main className="min-h-screen pb-20">
      <header className="sticky top-0 z-30 bg-cream/90 backdrop-blur border-b border-pot/10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-ink-soft hover:text-apple text-sm">← 관리</Link>
            <h1 className="text-xl font-bold">학생 관리</h1>
          </div>
        </div>
      </header>
      <StudentsClient initialStudents={(data ?? []) as GardenStudent[]} />
    </main>
  );
}
