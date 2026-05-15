"use client";

// "나의 한마디" 입력 시트. 학생이 자유 텍스트로 기분/상태를 입력한다.

import { useEffect, useState, useTransition } from "react";
import { MOOD_TEXT_MAX } from "@/lib/types";
import { updateMoodAction } from "@/app/me/actions";

type Props = {
  open: boolean;
  initial: string;
  onClose: () => void;
  onSaved: (next: string) => void;
};

const QUICK_PRESETS = [
  "오늘 기분 최고! ✌️",
  "조금 피곤해요 😴",
  "수학 100점 받았어요!",
  "친구랑 놀고 싶어요 🎮",
  "공부 화이팅 💪",
];

export function MoodEditSheet({ open, initial, onClose, onSaved }: Props) {
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setText(initial);
      setError(null);
    }
  }, [open, initial]);

  if (!open) return null;

  const trimmed = text.trim();
  const count = [...trimmed].length;
  const overLimit = count > MOOD_TEXT_MAX;

  const onSave = () => {
    if (overLimit) {
      setError(`${MOOD_TEXT_MAX}자 이내로 입력해주세요`);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateMoodAction({ text: trimmed });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onSaved(result.moodText);
      onClose();
    });
  };

  const onClear = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateMoodAction({ text: "" });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onSaved("");
      onClose();
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="한마디 입력"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(61,40,24,0.4)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 520,
          background: "#fffaf2",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: 20,
          maxHeight: "85vh",
          overflowY: "auto",
          boxShadow: "0 -10px 30px rgba(61,40,24,0.18)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 12, color: "#9a8b6c", fontWeight: 700, letterSpacing: "0.02em" }}>
              💬 나의 한마디
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#1f2937", marginTop: 2 }}>
              지금 기분을 알려줘요
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              background: "#fff",
              border: "1.5px solid #e8d8b8",
              fontSize: 14,
              color: "#8a6f52",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="예: 오늘 수학 100점! 기분 최고 ✌️"
          maxLength={MOOD_TEXT_MAX * 2}
          rows={2}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "12px 14px",
            borderRadius: 12,
            border: `1.5px solid ${overLimit ? "#f5cdc4" : "#e8d8b8"}`,
            background: "#fff",
            fontSize: 15,
            fontFamily: "inherit",
            color: "#1f2937",
            resize: "none",
            outline: "none",
            lineHeight: 1.5,
          }}
        />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 6,
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          <span style={{ color: error ? "#b04020" : "#9a8b6c" }}>
            {error ?? "전광판에 흐르는 한마디 (최대 30자)"}
          </span>
          <span
            style={{
              color: overLimit ? "#b04020" : count > MOOD_TEXT_MAX - 5 ? "#d6831f" : "#9a8b6c",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {count} / {MOOD_TEXT_MAX}자
          </span>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, color: "#9a8b6c", fontWeight: 700, marginBottom: 6 }}>
            빠른 입력
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {QUICK_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setText(preset)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: "#fff",
                  border: "1px solid #e8d8b8",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#3d2818",
                  cursor: "pointer",
                }}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          {initial.trim().length > 0 && (
            <button
              type="button"
              onClick={onClear}
              disabled={pending}
              style={{
                padding: "12px 16px",
                borderRadius: 12,
                background: "#fff",
                border: "1.5px solid #e8d8b8",
                fontSize: 13,
                fontWeight: 700,
                color: "#8a6f52",
                cursor: pending ? "not-allowed" : "pointer",
                flexShrink: 0,
              }}
            >
              지우기
            </button>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={pending || overLimit}
            style={{
              flex: 1,
              padding: "12px 16px",
              borderRadius: 12,
              background: pending || overLimit ? "#d6c2a0" : "#f59e0b",
              border: "none",
              color: "#fff",
              fontSize: 14,
              fontWeight: 800,
              cursor: pending || overLimit ? "not-allowed" : "pointer",
            }}
          >
            {pending ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
