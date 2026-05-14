// /admin/select-branch — 원장이 어느 지점을 관리할지 고르는 화면.
// garden_students 의 distinct branch_id 를 모아 보여준다.
// 선택 시 쿠키에 저장되고 /admin 으로 이동.

import { createSupabaseServerAnonClient } from "@/lib/supabase/server";
import { isAdminAuthenticated } from "../auth";
import { LoginForm } from "../LoginForm";
import { selectBranchAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = {
  branch_id: string;
  created_at: string;
};

type BranchSummary = {
  branchId: string;
  studentCount: number;
  firstCreatedAt: string;
};

function summarize(rows: Row[]): BranchSummary[] {
  const map = new Map<string, BranchSummary>();
  for (const r of rows) {
    if (!r.branch_id) continue;
    const cur = map.get(r.branch_id);
    if (!cur) {
      map.set(r.branch_id, {
        branchId: r.branch_id,
        studentCount: 1,
        firstCreatedAt: r.created_at,
      });
    } else {
      cur.studentCount += 1;
      if (r.created_at < cur.firstCreatedAt) {
        cur.firstCreatedAt = r.created_at;
      }
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.firstCreatedAt.localeCompare(b.firstCreatedAt),
  );
}

function formatBranchIdHint(id: string): string {
  // monster-site 의 "br_<timestamp(ms)>" 형식이면 날짜로 변환.
  const m = id.match(/^br_(\d{10,16})$/);
  if (!m) return "";
  const ms = Number(m[1]);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} 생성`;
}

export default async function SelectBranchPage({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
  if (!isAdminAuthenticated(searchParams.key)) {
    return <LoginForm initialKey={searchParams.key ?? ""} />;
  }

  const sb = createSupabaseServerAnonClient();
  const { data, error } = await sb
    .from("garden_students")
    .select("branch_id, created_at");

  const summaries = error ? [] : summarize((data ?? []) as Row[]);

  return (
    <main className="min-h-screen px-4 py-8 bg-gray-50">
      <div className="max-w-md mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">지점 선택</h1>
          <p className="mt-2 text-sm text-gray-500 leading-relaxed">
            관리할 지점을 골라주세요. 이후 admin 페이지가 이 지점의 학생만 보여줍니다. (브라우저
            쿠키에 30일간 저장)
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm p-3">
            지점 목록을 불러오지 못했어요: {error.message}
          </div>
        )}

        {summaries.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 text-center">
            <p className="text-sm text-gray-500 leading-relaxed">
              아직 등록된 학생이 없어요. monster-site 에서 학생 계정을 먼저 발급하면 여기서 지점이
              보입니다.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {summaries.map((b) => {
              const hint = formatBranchIdHint(b.branchId);
              return (
                <li key={b.branchId}>
                  <form action={selectBranchAction}>
                    <input type="hidden" name="branchId" value={b.branchId} />
                    <button
                      type="submit"
                      className="w-full text-left bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:border-amber-300 hover:bg-amber-50/40 transition flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-sm text-gray-900 truncate">{b.branchId}</div>
                        <div className="text-xs text-gray-400 mt-1">
                          학생 {b.studentCount}명{hint ? ` · ${hint}` : ""}
                        </div>
                      </div>
                      <span className="shrink-0 text-amber-700 font-medium text-sm">선택 →</span>
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
