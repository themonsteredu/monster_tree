// /admin/students - 학생 추가/수정/삭제
// admin 쿠키에 저장된 지점의 학생만 표시. 쿠키 없으면 /admin/select-branch 로 이동.

import { redirect } from "next/navigation";
import { createSupabaseServerAnonClient } from "@/lib/supabase/server";
import { getAdminBranchId } from "@/lib/branch";
import { isAdminAuthenticated } from "../auth";
import { LoginForm } from "../LoginForm";
import { AdminHeader } from "../AdminHeader";
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
      <AdminHeader current="students" title="학생 관리" />
      <StudentsClient initialStudents={(data ?? []) as GardenStudent[]} />
    </main>
  );
}
