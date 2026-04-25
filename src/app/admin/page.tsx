// /admin - 원장 입력 화면 (모바일 최적화)
// 비밀번호가 없으면 로그인 폼 표시, 있으면 학생 리스트 + 빠른 입력 버튼

import Link from "next/link";
import { createSupabaseServerAnonClient } from "@/lib/supabase/server";
import type { GardenPointLog, GardenStudent } from "@/lib/types";
import { isAdminAuthenticated } from "./auth";
import { LoginForm } from "./LoginForm";
import { AdminClient } from "./AdminClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPage({
  searchParams,
}: {
  searchParams: { key?: string; class?: string };
}) {
  const authed = isAdminAuthenticated(searchParams.key);

  if (!authed) {
    return <LoginForm initialKey={searchParams.key ?? ""} />;
  }

  // 환경변수 미설정 안내
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return (
      <main className="min-h-screen p-6">
        <div className="max-w-md mx-auto bg-white rounded-2xl shadow-card p-6 text-center">
          <div className="text-4xl mb-2">🪴</div>
          <p className="text-ink-strong leading-relaxed">
            Supabase 환경변수가 비어 있어요. 프로젝트 루트의 <code>.env.local</code> 을 채워주세요.
          </p>
        </div>
      </main>
    );
  }

  const sb = createSupabaseServerAnonClient();
  const [{ data: students }, { data: recentLogs }] = await Promise.all([
    sb
      .from("garden_students")
      .select("*")
      .eq("is_active", true)
      .order("class_name", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true }),
    sb
      .from("garden_point_logs")
      .select("*")
      .order("logged_at", { ascending: false })
      .limit(30),
  ]);

  // 학생 이름 매핑 (최근 기록 표시용)
  const studentMap = new Map<string, GardenStudent>();
  for (const s of (students ?? []) as GardenStudent[]) studentMap.set(s.id, s);

  return (
    <main className="min-h-screen pb-32">
      <header className="sticky top-0 z-30 bg-cream/90 backdrop-blur border-b border-pot/10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold">사과정원 관리</h1>
          <nav className="flex gap-3 text-sm">
            <Link href="/admin/students" className="text-ink-soft hover:text-apple">
              학생 관리
            </Link>
            <Link href="/" target="_blank" className="text-ink-soft hover:text-apple">
              TV 화면 보기 ↗
            </Link>
          </nav>
        </div>
      </header>

      <AdminClient
        students={(students ?? []) as GardenStudent[]}
        recentLogs={(recentLogs ?? []) as GardenPointLog[]}
        studentMap={Object.fromEntries(
          Array.from(studentMap.entries()).map(([k, v]) => [k, { name: v.name, class_name: v.class_name }]),
        )}
        initialClass={searchParams.class ?? null}
      />
    </main>
  );
}
