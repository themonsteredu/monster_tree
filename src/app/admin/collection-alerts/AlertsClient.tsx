"use client";

// 관리자 알림함 목록 — 안읽음 강조 + 읽음 처리 버튼.

import { useState, useTransition } from "react";
import { markAlertReadAction, markAllAlertsReadAction } from "./actions";

export type AdminAlertRow = {
  id: string;
  branch_id: string;
  type: string;
  threshold: number;
  payload: { student_name?: string | null; species_count?: number | null } | null;
  status: string;
  created_at: string;
  read_at: string | null;
};

function alertTitle(a: AdminAlertRow): string {
  const name = a.payload?.student_name || "학생";
  if (a.type === "collection_milestone") {
    return `🎉 ${name} 학생이 도감 ${a.threshold}종을 모았어요!`;
  }
  return `${name} 알림`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AlertsClient({
  alerts,
  branchId,
}: {
  alerts: AdminAlertRow[];
  branchId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>("");

  const unreadCount = alerts.filter((a) => a.status === "unread").length;

  function markOne(id: string) {
    startTransition(async () => {
      const r = await markAlertReadAction({ id });
      if (!r.ok) setError(r.message);
    });
  }
  function markAll() {
    startTransition(async () => {
      const r = await markAllAlertsReadAction({ branchId });
      if (!r.ok) setError(r.message);
    });
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pb-16">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          {unreadCount > 0 ? (
            <>
              안 읽은 알림 <b className="text-orange-600">{unreadCount}</b>건
            </>
          ) : (
            "새 알림이 없어요."
          )}
        </p>
        {unreadCount > 0 && (
          <button
            onClick={markAll}
            disabled={pending}
            className="text-sm font-semibold text-gray-500 hover:text-gray-800 disabled:opacity-50"
          >
            모두 읽음
          </button>
        )}
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      {alerts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400">
          아직 알림이 없어요.
          <p className="mt-2 text-xs text-gray-300">
            학생이 게임센터에서 몬스터를 키워 도감 7종을 모으면 여기에 알림이 쌓여요.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {alerts.map((a) => (
            <li
              key={a.id}
              className={`rounded-2xl border p-4 flex items-start gap-3 ${
                a.status === "unread"
                  ? "bg-orange-50 border-orange-200"
                  : "bg-white border-gray-100"
              }`}
            >
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm ${
                    a.status === "unread" ? "font-bold text-gray-900" : "text-gray-600"
                  }`}
                >
                  {alertTitle(a)}
                </p>
                <p className="mt-1 text-xs text-gray-400">{formatDate(a.created_at)}</p>
              </div>
              {a.status === "unread" && (
                <button
                  onClick={() => markOne(a.id)}
                  disabled={pending}
                  className="shrink-0 rounded-lg bg-white border border-orange-200 px-3 py-1.5 text-xs font-semibold text-orange-600 hover:bg-orange-100 disabled:opacity-50"
                >
                  읽음
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
