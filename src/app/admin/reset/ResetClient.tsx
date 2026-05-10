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
    if (
      !window.confirm(
        "정말 모든 학생을 초기화할까요? 이 작업은 되돌릴 수 없어요.",
      )
    )
      return;
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await resetSemesterAction({ confirmText: text.trim() });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setResult(
        `${res.studentCount}명 초기화, ${res.pendingDeleted}개 미수령 삭제 완료`,
      );
      setText("");
    });
  };

  return (
    <div className="mt-6 p-5 rounded-2xl bg-[#fef2f0] border-[2.5px] border-[var(--apple-deep)]">
      <div className="text-sm font-extrabold text-[var(--apple-deep)] mb-2">
        ⚠️ 위험한 작업
      </div>
      <ul className="text-xs text-[var(--ink)] space-y-1 mb-4 list-disc pl-5">
        <li>활성 학생의 누적 포인트 → 0pt</li>
        <li>단계 → 1단계 (화분)</li>
        <li>수확 사과 수 → 0개</li>
        <li>미수령 포인트(garden_pending_points) 전체 삭제</li>
        <li>
          포인트 로그(garden_point_logs), 수확 이력(garden_harvests) 은 보존
        </li>
        <li className="font-bold text-[var(--apple-deep)]">되돌릴 수 없음</li>
      </ul>
      <label className="block text-xs font-bold text-[var(--ink)] mb-1">
        정말 실행하려면 아래에{" "}
        <code className="px-1.5 py-0.5 bg-white rounded">{CONFIRM_PHRASE}</code>{" "}
        라고 입력하세요:
      </label>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={CONFIRM_PHRASE}
        className="w-full px-3 py-2.5 rounded-xl border-[2px] border-[var(--ink)]/40 focus:outline-none focus:border-[var(--apple-deep)] font-medium"
        disabled={pending}
      />
      <button
        type="button"
        disabled={!matched || pending}
        onClick={onClick}
        className="mt-3 w-full py-3 rounded-xl bg-[var(--apple-deep)] text-white font-extrabold border-[2px] border-[var(--ink)] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {pending ? "리셋 중…" : "학기 리셋 실행"}
      </button>
      {result && (
        <div
          role="status"
          className="mt-3 p-3 rounded-xl bg-[#dff5d0] border border-[var(--accent-success)] text-sm font-bold text-[var(--ink)]"
        >
          ✓ {result}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="mt-3 p-3 rounded-xl bg-white border border-[var(--apple-deep)] text-sm font-bold text-[var(--apple-deep)]"
        >
          ✕ {error}
        </div>
      )}
    </div>
  );
}
