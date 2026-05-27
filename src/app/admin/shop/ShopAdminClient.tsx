"use client";

// /admin/shop 관리 UI — 신청 목록(상태 필터) + 승인(차감)/배송/전달/취소.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  SHOP_STATUS_LABEL,
  type ShopRequest,
  type ShopRequestStatus,
} from "@/lib/types";
import {
  approveShopRequestAction,
  advanceShopStatusAction,
  cancelShopRequestAction,
} from "./actions";

export type ShopRequestRow = ShopRequest & { student_balance: number };

const STATUS_STYLE: Record<ShopRequestStatus, string> = {
  requested: "bg-amber-100 text-amber-800",
  purchased: "bg-blue-100 text-blue-700",
  shipping: "bg-indigo-100 text-indigo-700",
  delivered: "bg-emerald-100 text-emerald-700",
  canceled: "bg-gray-100 text-gray-500",
};

const FILTERS: Array<{ value: "all" | ShopRequestStatus; label: string }> = [
  { value: "all", label: "전체" },
  { value: "requested", label: "신청됨" },
  { value: "purchased", label: "구매완료" },
  { value: "shipping", label: "배송중" },
  { value: "delivered", label: "전달완료" },
  { value: "canceled", label: "취소됨" },
];

export function ShopAdminClient({ initialRows }: { initialRows: ShopRequestRow[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | ShopRequestStatus>("all");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: initialRows.length };
    for (const r of initialRows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [initialRows]);

  const rows = useMemo(
    () => (filter === "all" ? initialRows : initialRows.filter((r) => r.status === filter)),
    [initialRows, filter],
  );

  function run(fn: () => Promise<{ ok: boolean; message?: string } & Record<string, unknown>>, okMsg: string) {
    setErr(null);
    setMsg(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setErr(res.message ?? "처리 실패");
        return;
      }
      setMsg(okMsg);
      router.refresh();
    });
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-5">
      {/* 필터 */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold transition ${
              filter === f.value
                ? "bg-gray-900 text-white"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-100"
            }`}
          >
            {f.label}
            <span className="ml-1 opacity-70">{counts[f.value] ?? 0}</span>
          </button>
        ))}
      </div>

      {(msg || err) && (
        <div
          className={`mb-3 rounded-lg px-3 py-2 text-sm font-semibold ${
            err ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {err ?? msg}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-sm text-gray-400">
          해당 상태의 신청이 없어요.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <RequestCard key={r.id} row={r} pending={pending} run={run} />
          ))}
        </ul>
      )}
    </div>
  );
}

function RequestCard({
  row,
  pending,
  run,
}: {
  row: ShopRequestRow;
  pending: boolean;
  run: (
    fn: () => Promise<{ ok: boolean; message?: string } & Record<string, unknown>>,
    okMsg: string,
  ) => void;
}) {
  const [finalCost, setFinalCost] = useState<number>(row.point_cost);

  return (
    <li className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_STYLE[row.status]}`}
          >
            {SHOP_STATUS_LABEL[row.status]}
          </span>
          <span className="font-bold text-gray-900">{row.student_name_snapshot}</span>
          <span className="text-xs text-gray-400">잔액 {row.student_balance}P</span>
        </div>
        <span className="text-sm font-bold text-amber-700">{row.point_cost}P</span>
      </div>

      <a
        href={row.product_url}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-sm text-blue-600 underline break-all mb-1"
      >
        {row.product_url}
      </a>
      <p className="text-xs text-gray-500">
        예상 {row.estimated_price_won.toLocaleString()}원
        {row.options ? ` · 옵션: ${row.options}` : ""}
      </p>
      {row.memo && <p className="text-xs text-gray-500 mt-0.5">메모: {row.memo}</p>}
      <p className="text-[11px] text-gray-400 mt-1">
        {new Date(row.requested_at).toLocaleString("ko-KR")} 신청
      </p>

      {/* 액션 */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {row.status === "requested" && (
          <>
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500">최종</span>
              <input
                type="number"
                value={finalCost}
                min={0}
                onChange={(e) => setFinalCost(Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
                className="w-20 px-2 py-1 rounded-lg border border-gray-200 text-sm"
              />
              <span className="text-xs text-gray-500">P</span>
            </div>
            <button
              disabled={pending}
              onClick={() => {
                if (!confirm(`${row.student_name_snapshot} 학생에게서 ${finalCost}P를 차감하고 승인할까요?`)) return;
                run(
                  () => approveShopRequestAction({ id: row.id, finalPointCost: finalCost }),
                  "승인 + 차감 완료",
                );
              }}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50"
            >
              승인(차감)
            </button>
          </>
        )}

        {row.status === "purchased" && (
          <button
            disabled={pending}
            onClick={() => run(() => advanceShopStatusAction({ id: row.id, status: "shipping" }), "배송중으로 변경")}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50"
          >
            배송중으로
          </button>
        )}

        {row.status === "shipping" && (
          <button
            disabled={pending}
            onClick={() => run(() => advanceShopStatusAction({ id: row.id, status: "delivered" }), "전달완료로 변경")}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50"
          >
            전달완료로
          </button>
        )}

        {row.status !== "delivered" && row.status !== "canceled" && (
          <button
            disabled={pending}
            onClick={() => {
              const willRefund = row.status === "purchased" || row.status === "shipping";
              if (
                !confirm(
                  willRefund
                    ? `취소하고 ${row.point_cost}P를 학생에게 복구할까요?`
                    : "이 신청을 취소할까요?",
                )
              )
                return;
              run(() => cancelShopRequestAction({ id: row.id }), "취소 완료");
            }}
            className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-rose-50 hover:text-rose-600 text-sm font-semibold disabled:opacity-50"
          >
            취소
          </button>
        )}
      </div>
    </li>
  );
}
