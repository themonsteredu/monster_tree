"use client";

// /shop 학생 UI — 모바일 세로 최적화.
// 신청 폼(링크 + 옵션 + 예상가격 → 필요 포인트 환산) + 내 신청 내역(상태/취소).
// 관리자 테스트 모드(adminMode): 실제 저장 없이 입력 환산만 확인.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  POINT_TO_WON,
  SHOP_STATUS_LABEL,
  wonToPoints,
  type ShopRequest,
  type ShopRequestStatus,
} from "@/lib/types";
import { submitShopRequestAction, cancelMyShopRequestAction } from "./actions";

const STATUS_STYLE: Record<ShopRequestStatus, string> = {
  requested: "bg-amber-100 text-amber-800",
  purchased: "bg-blue-100 text-blue-700",
  shipping: "bg-indigo-100 text-indigo-700",
  delivered: "bg-emerald-100 text-emerald-700",
  canceled: "bg-gray-100 text-gray-500",
};

export function ShopClient({
  studentName,
  adminMode,
  balance,
  initialRequests,
}: {
  studentName: string | null;
  adminMode: boolean;
  balance: number;
  initialRequests: ShopRequest[];
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [options, setOptions] = useState("");
  const [memo, setMemo] = useState("");
  const [priceWon, setPriceWon] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const wonNum = Math.max(0, Math.trunc(Number(priceWon) || 0));
  const needPoints = wonToPoints(wonNum);
  const enough = needPoints > 0 && needPoints <= balance;

  const requests = initialRequests;
  const sortedByRecent = useMemo(
    () =>
      [...requests].sort(
        (a, b) =>
          new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime(),
      ),
    [requests],
  );

  function resetForm() {
    setUrl("");
    setOptions("");
    setMemo("");
    setPriceWon("");
  }

  function handleSubmit() {
    setError(null);
    setDone(null);
    if (!/^https?:\/\//i.test(url.trim())) {
      setError("사고 싶은 물건의 링크를 http:// 또는 https:// 로 넣어주세요.");
      return;
    }
    if (wonNum <= 0) {
      setError("예상 가격(원)을 입력해주세요.");
      return;
    }

    if (adminMode) {
      setDone(
        `테스트 모드 — 실제 신청은 저장되지 않아요. (예상 ${wonNum.toLocaleString()}원 = ${needPoints}P 차감 예정)`,
      );
      resetForm();
      return;
    }

    startTransition(async () => {
      const res = await submitShopRequestAction({
        productUrl: url.trim(),
        options: options.trim() || undefined,
        memo: memo.trim() || undefined,
        estimatedPriceWon: wonNum,
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setDone("신청이 접수됐어요! 원장님이 확인 후 결제·전달해 주세요.");
      resetForm();
      router.refresh();
    });
  }

  function handleCancel(id: string) {
    if (adminMode) return;
    setError(null);
    setDone(null);
    startTransition(async () => {
      const res = await cancelMyShopRequestAction({ id });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <main
      className="min-h-screen w-full"
      style={{
        background: "linear-gradient(180deg, #fff7ed 0%, #fffbeb 55%, #fefce8 100%)",
        fontFamily: "'Jua', 'Pretendard Variable', 'Pretendard', system-ui, sans-serif",
      }}
    >
      <div className="max-w-md mx-auto px-4 pt-6 pb-12">
        {adminMode && (
          <div className="mb-3 flex items-center gap-2 bg-amber-100 border border-amber-200 text-amber-800 rounded-xl px-3 py-2 text-sm">
            <span>🛠</span>
            <span className="font-bold">테스트 모드</span>
            <span className="text-xs ml-auto text-amber-700">신청 저장 안 됨</span>
          </div>
        )}

        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-extrabold text-gray-900">🏪 상점</h1>
          <div className="bg-white/80 rounded-full px-3 py-1.5 text-sm font-bold flex items-center gap-1.5 border border-amber-200">
            {studentName && <span className="text-gray-700">{studentName}</span>}
            <span className="text-amber-600">🍎 {balance.toLocaleString()}P</span>
          </div>
        </div>

        <p className="text-sm text-gray-600 mb-4 leading-relaxed">
          모은 사과 포인트로 갖고 싶은 물건을 신청해요. 원장님이 대신 결제해서
          학원으로 받아 전달해 줘요. <b className="text-amber-700">1P = {POINT_TO_WON}원</b>
        </p>

        {/* 신청 폼 */}
        <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-4 mb-5">
          <label className="block text-xs font-bold text-gray-500 mb-1">
            사고 싶은 물건 링크
          </label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            className="w-full mb-3 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-amber-400"
          />

          <label className="block text-xs font-bold text-gray-500 mb-1">
            옵션 (색상·사이즈 등, 선택)
          </label>
          <input
            value={options}
            onChange={(e) => setOptions(e.target.value)}
            placeholder="예: 파란색 / M 사이즈"
            className="w-full mb-3 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-amber-400"
          />

          <label className="block text-xs font-bold text-gray-500 mb-1">
            예상 가격 (원, 배송비 포함)
          </label>
          <input
            value={priceWon}
            onChange={(e) => setPriceWon(e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            placeholder="예: 12000"
            className="w-full mb-2 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-amber-400"
          />
          {wonNum > 0 && (
            <p
              className={`text-sm mb-3 font-semibold ${enough ? "text-amber-700" : "text-rose-600"}`}
            >
              필요 포인트: {needPoints}P{" "}
              {enough ? (
                <span className="text-gray-400 font-normal">
                  (잔액 {balance}P)
                </span>
              ) : (
                <span>· 포인트가 부족해요 (잔액 {balance}P)</span>
              )}
            </p>
          )}

          <label className="block text-xs font-bold text-gray-500 mb-1">
            메모 (선택)
          </label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={2}
            placeholder="원장님께 남길 말"
            className="w-full mb-3 px-3 py-2 rounded-lg border border-gray-200 text-sm resize-none focus:outline-none focus:border-amber-400"
          />

          {error && (
            <p className="text-sm text-rose-600 mb-2 font-semibold">{error}</p>
          )}
          {done && (
            <p className="text-sm text-emerald-700 mb-2 font-semibold">{done}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={pending}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-[0.99] text-white font-extrabold text-base transition disabled:opacity-60"
          >
            {pending ? "신청 중…" : "신청하기"}
          </button>
          <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
            신청해도 바로 차감되지 않아요. 원장님이 승인할 때 포인트가 빠져요.
          </p>
        </div>

        {/* 내 신청 내역 */}
        <h2 className="text-base font-bold text-gray-800 mb-2">내 신청 내역</h2>
        {sortedByRecent.length === 0 ? (
          <div className="bg-white/70 rounded-xl border border-amber-100 p-8 text-center text-sm text-gray-400">
            아직 신청한 물건이 없어요.
          </div>
        ) : (
          <ul className="space-y-2">
            {sortedByRecent.map((r) => (
              <li
                key={r.id}
                className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_STYLE[r.status]}`}
                  >
                    {SHOP_STATUS_LABEL[r.status]}
                  </span>
                  <span className="text-sm font-bold text-amber-700">
                    {r.point_cost}P
                  </span>
                </div>
                <a
                  href={r.product_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-sm text-blue-600 underline break-all"
                >
                  {r.product_url}
                </a>
                {r.options && (
                  <p className="text-xs text-gray-500 mt-1">옵션: {r.options}</p>
                )}
                <p className="text-[11px] text-gray-400 mt-1">
                  {new Date(r.requested_at).toLocaleDateString("ko-KR")} 신청 · 예상{" "}
                  {r.estimated_price_won.toLocaleString()}원
                </p>
                {!adminMode && r.status === "requested" && (
                  <button
                    onClick={() => handleCancel(r.id)}
                    disabled={pending}
                    className="mt-2 text-xs text-gray-500 hover:text-rose-600 underline disabled:opacity-50"
                  >
                    신청 취소
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
