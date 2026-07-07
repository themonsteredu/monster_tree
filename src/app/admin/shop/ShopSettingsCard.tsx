"use client";

// /admin/shop 상단 — 상점 오픈 기간 설정 + 오픈 공지 푸시 카드.
// 모드(항상/기간/닫기) 선택 → 저장, 현재 상태 뱃지, "🔔 오픈 공지 보내기".

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  kstShortDateTime,
  shopOpenState,
  type ShopOpenMode,
  type ShopSettings,
} from "@/lib/types";
import { saveShopSettingsAction, sendShopOpenPushAction } from "./actions";

// timestamptz ISO → datetime-local 입력값 (KST 기준 "yyyy-MM-ddTHH:mm").
function isoToKstLocal(iso: string | null): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

const MODE_OPTIONS: Array<{ value: ShopOpenMode; label: string }> = [
  { value: "always", label: "항상 열림" },
  { value: "window", label: "기간 설정" },
  { value: "closed", label: "닫기" },
];

export function ShopSettingsCard({
  initialSettings,
}: {
  initialSettings: ShopSettings | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<ShopOpenMode>(initialSettings?.mode ?? "always");
  const [from, setFrom] = useState(isoToKstLocal(initialSettings?.open_from ?? null));
  const [until, setUntil] = useState(isoToKstLocal(initialSettings?.open_until ?? null));
  const [saved, setSaved] = useState<ShopSettings | null>(initialSettings);
  const [pushBody, setPushBody] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 저장된 설정 기준 현재 상태 (편집 중 값 아님).
  const state = useMemo(() => shopOpenState(saved), [saved]);
  const badge = state.open
    ? state.reason === "window"
      ? { text: `🟢 열림 · ${state.until ? `${kstShortDateTime(state.until)}까지` : "종료 미설정"}`, cls: "bg-emerald-50 text-emerald-700 border-emerald-200" }
      : { text: "🟢 항상 열림", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" }
    : state.reason === "before" && state.from
      ? { text: `⏰ ${kstShortDateTime(state.from)} 오픈 예정`, cls: "bg-amber-50 text-amber-700 border-amber-200" }
      : { text: "🔴 닫힘", cls: "bg-red-50 text-red-600 border-red-200" };

  const save = () => {
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await saveShopSettingsAction({
          mode,
          openFrom: from || null,
          openUntil: until || null,
        });
        if (!res.ok) {
          setMsg(res.message);
          return;
        }
        setSaved({
          branch_id: saved?.branch_id ?? "",
          mode,
          open_from: res.openInfo.from,
          open_until: res.openInfo.until,
          updated_at: new Date().toISOString(),
        });
        setMsg("저장했어요.");
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "저장에 실패했어요.");
      }
    });
  };

  const sendPush = () => {
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await sendShopOpenPushAction({ body: pushBody.trim() || undefined });
        setMsg(res.message);
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "발송에 실패했어요.");
      }
    });
  };

  // 자동 문구 미리보기 (저장된 설정 기준 — 서버 로직과 동일 규칙).
  const autoBody =
    saved?.mode === "window" && saved.open_until
      ? `상점이 열렸어요! ${kstShortDateTime(saved.open_until)}까지 사고 싶은 물건을 신청할 수 있어요 🍎`
      : "상점이 열렸어요! 모은 포인트로 사고 싶은 물건을 신청해보세요 🍎";

  return (
    <div className="max-w-3xl mx-auto px-4 pt-4">
      <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h2 className="text-sm font-bold text-gray-900">🗓 오픈 기간 설정</h2>
          <span className={`text-xs font-semibold border rounded-full px-2.5 py-1 ${badge.cls}`}>
            {badge.text}
          </span>
        </div>

        <div className="flex items-center gap-2 mb-3">
          {MODE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setMode(o.value)}
              className={[
                "text-xs font-semibold rounded-full px-3 py-1.5 border transition",
                mode === o.value
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50",
              ].join(" ")}
            >
              {o.label}
            </button>
          ))}
        </div>

        {mode === "window" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
            <label className="text-xs text-gray-500">
              시작 (비우면 즉시)
              <input
                type="datetime-local"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:border-gray-400"
              />
            </label>
            <label className="text-xs text-gray-500">
              종료 (비우면 무기한)
              <input
                type="datetime-local"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:border-gray-400"
              />
            </label>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            disabled={pending}
            onClick={save}
            className="text-xs font-semibold text-white bg-gray-900 rounded-lg px-4 py-2 hover:bg-gray-700 transition disabled:opacity-50"
          >
            {pending ? "저장 중..." : "저장"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={sendPush}
            className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2 hover:bg-emerald-100 transition disabled:opacity-50"
          >
            {pending ? "처리 중..." : "🔔 오픈 공지 보내기"}
          </button>
        </div>

        {/* 공지 문구 — 비우면 자동 문구 발송 */}
        <label className="block mt-3 text-xs text-gray-500">
          공지 문구 (비우면 자동:{" "}
          <span className="text-gray-400">&quot;{autoBody}&quot;</span>)
          <input
            value={pushBody}
            onChange={(e) => setPushBody(e.target.value)}
            maxLength={200}
            placeholder="직접 쓸 문구 (선택)"
            className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:border-gray-400"
          />
        </label>

        {msg && (
          <p className="mt-3 text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
            {msg}
          </p>
        )}
      </div>
    </div>
  );
}
