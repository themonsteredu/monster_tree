"use client";

// 학기 리셋 클라이언트 — 확인 문구 일치 시에만 활성, 한 번 더 confirm 후 실행.

import { useState, useTransition } from "react";
import { resetSemesterAction } from "../actions";

const CONFIRM_PHRASE = "학기 리셋";

export function ResetClient() {
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const matched = text.trim() === CONFIRM_PHRASE;

  const onClick = () => {
    if (!matched) return;
    if (!window.confirm("정말 모든 학생을 초기화할까요? 이 작업은 되돌릴 수 없어요.")) return;
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await resetSemesterAction({ confirmText: text.trim() });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setResult(`${res.studentCount}명 초기화, ${res.pendingDeleted}개 미수령 삭제 완료`);
      setText("");
    });
  };

  return (
    <div className="mt-5 p-5 rounded-xl bg-red-50 border border-red-200">
      <div className="text-sm font-semibold text-red-700 mb-2">위험한 작업</div>
      <ul className="text-xs text-gray-700 space-y-1 mb-4 list-disc pl-5">
        <li>활성 학생의 누적 포인트 → 0pt</li>
        <li>단계 → 1단계 (화분)</li>
        <li>수확 사과 수 → 0개</li>
        <li>미수령 포인트(garden_pending_points) 전체 삭제</li>
        <li>포인트 로그(garden_point_logs), 수확 이력(garden_harvests) 은 보존</li>
        <li className="font-medium text-red-700">되돌릴 수 없음</li>
      </ul>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        정말 실행하려면 아래에{" "}
        <code className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-gray-900">
          {CONFIRM_PHRASE}
        </code>{" "}
        라고 입력하세요:
      </label>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={CONFIRM_PHRASE}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-transparent transition disabled:opacity-50"
        disabled={pending}
      />
      <button
        type="button"
        disabled={!matched || pending}
        onClick={onClick}
        className="mt-3 w-full py-2.5 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {pending ? "리셋 중…" : "학기 리셋 실행"}
      </button>
      {result && (
        <div
          role="status"
          className="mt-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm font-medium text-emerald-700"
        >
          ✓ {result}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="mt-3 p-3 rounded-lg bg-white border border-red-200 text-sm font-medium text-red-700"
        >
          ✕ {error}
        </div>
      )}
    </div>
  );
}
