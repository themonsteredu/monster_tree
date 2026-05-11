"use client";

// 학생이 본인 배경을 편집하는 시트.
// 카테고리: 단색 / 패턴 / 풍경

import { useState, useTransition } from "react";
import type { BackgroundConfig } from "@/lib/types";
import { DEFAULT_BACKGROUND } from "@/lib/types";
import { BackgroundCanvas, BACKGROUND_OPTIONS } from "./BackgroundCanvas";
import { updateBackgroundAction } from "@/app/me/actions";

type Props = {
  open: boolean;
  initial: BackgroundConfig;
  onClose: () => void;
  onSaved: (next: BackgroundConfig) => void;
};

const LABELS: Record<string, string> = {
  // 단색
  cream: "크림",
  sky: "하늘",
  mint: "민트",
  peach: "복숭아",
  lavender: "라벤더",
  rose: "장미",
  sunshine: "햇살",
  forest: "숲",
  night: "밤",
  charcoal: "차콜",
  // 패턴
  dots: "물방울",
  stars: "별",
  hearts: "하트",
  stripes: "줄무늬",
  clouds: "구름",
  // 풍경
  garden: "정원",
  sky_scene: "하늘",
  ocean: "바다",
};

function labelOf(value: string): string {
  return LABELS[value] ?? value;
}

export function BackgroundEditSheet({ open, initial, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<BackgroundConfig>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  const setKind = (kind: "solid" | "pattern" | "scene") => {
    setError(null);
    if (kind === "solid") {
      setDraft(DEFAULT_BACKGROUND);
      return;
    }
    if (kind === "pattern") {
      setDraft({ kind: "pattern", pattern: BACKGROUND_OPTIONS.pattern[0], color: "cream" });
      return;
    }
    setDraft({ kind: "scene", scene: BACKGROUND_OPTIONS.scene[0] });
  };

  const setSolidColor = (color: string) => {
    if (draft.kind !== "solid") return;
    setDraft({ kind: "solid", color });
  };
  const setPatternKind = (pattern: string) => {
    if (draft.kind !== "pattern") return;
    setDraft({ ...draft, pattern });
  };
  const setPatternColor = (color: string) => {
    if (draft.kind !== "pattern") return;
    setDraft({ ...draft, color });
  };
  const setScene = (scene: string) => {
    if (draft.kind !== "scene") return;
    setDraft({ kind: "scene", scene });
  };

  const onSave = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateBackgroundAction({ background: draft });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onSaved(result.background);
      onClose();
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="배경 꾸미기"
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
          padding: 16,
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 -8px 24px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: "#3d2818", fontWeight: 800 }}>배경 꾸미기</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            style={{
              border: "none",
              background: "transparent",
              fontSize: 22,
              color: "#9a8b6c",
              cursor: "pointer",
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* 미리보기 */}
        <div
          style={{
            position: "relative",
            height: 180,
            borderRadius: 14,
            overflow: "hidden",
            marginBottom: 14,
            border: "1.5px solid #d6c2a0",
          }}
        >
          <BackgroundCanvas config={draft} rounded={14} />
        </div>

        {/* 카테고리 탭 */}
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {(["solid", "pattern", "scene"] as const).map((k) => {
            const active = draft.kind === k;
            const label = k === "solid" ? "단색" : k === "pattern" ? "패턴" : "풍경";
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  border: "1.5px solid #d6c2a0",
                  background: active ? "#3d2818" : "#fff",
                  color: active ? "#fff8e8" : "#3d2818",
                  fontWeight: 700,
                  borderRadius: 10,
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {draft.kind === "solid" && (
          <Slot title="색상">
            {BACKGROUND_OPTIONS.solid.map((c) => (
              <Chip key={c} active={draft.color === c} onClick={() => setSolidColor(c)}>
                {labelOf(c)}
              </Chip>
            ))}
          </Slot>
        )}

        {draft.kind === "pattern" && (
          <>
            <Slot title="무늬">
              {BACKGROUND_OPTIONS.pattern.map((p) => (
                <Chip key={p} active={draft.pattern === p} onClick={() => setPatternKind(p)}>
                  {labelOf(p)}
                </Chip>
              ))}
            </Slot>
            <Slot title="바탕색">
              {BACKGROUND_OPTIONS.solid.map((c) => (
                <Chip key={c} active={draft.color === c} onClick={() => setPatternColor(c)}>
                  {labelOf(c)}
                </Chip>
              ))}
            </Slot>
          </>
        )}

        {draft.kind === "scene" && (
          <Slot title="풍경">
            {BACKGROUND_OPTIONS.scene.map((s) => (
              <Chip key={s} active={draft.scene === s} onClick={() => setScene(s)}>
                {labelOf(s)}
              </Chip>
            ))}
          </Slot>
        )}

        {error && (
          <div
            style={{
              background: "#fde8e4",
              color: "#a83020",
              padding: "8px 12px",
              borderRadius: 8,
              fontSize: 13,
              marginTop: 12,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            style={{
              flex: 1,
              padding: "12px 0",
              border: "1.5px solid #d6c2a0",
              background: "#fff",
              color: "#3d2818",
              borderRadius: 10,
              fontWeight: 700,
              cursor: pending ? "default" : "pointer",
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={pending}
            style={{
              flex: 2,
              padding: "12px 0",
              border: "none",
              background: pending ? "#d6c2a0" : "#F26522",
              color: "#fff",
              borderRadius: 10,
              fontWeight: 800,
              cursor: pending ? "default" : "pointer",
              fontSize: 15,
            }}
          >
            {pending ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Slot({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: "#9a8b6c", marginBottom: 6, fontWeight: 700 }}>{title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 12px",
        border: active ? "1.5px solid #F26522" : "1.5px solid #d6c2a0",
        background: active ? "#fff5d6" : "#fff",
        color: "#3d2818",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: active ? 700 : 500,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
