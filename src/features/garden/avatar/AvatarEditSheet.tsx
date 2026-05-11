"use client";

// 학생 본인의 아바타를 편집하는 시트.
// 카테고리 (사람/동물/판타지) 탭 + 각 카테고리에 맞는 옵션 선택.
// 미리보기는 AvatarFigure 로 즉시 반영. 저장 시 updateAvatarAction 호출.

import { useState, useTransition } from "react";
import type { AvatarConfig } from "@/lib/types";
import { DEFAULT_AVATAR } from "@/lib/types";
import { AvatarFigure, AVATAR_OPTIONS } from "./AvatarFigure";
import { updateAvatarAction } from "@/app/me/actions";

type Props = {
  open: boolean;
  initial: AvatarConfig;
  onClose: () => void;
  onSaved: (next: AvatarConfig) => void;
};

const HUMAN_PART_LABELS: Record<string, string> = {
  skin: "피부",
  hair: "머리",
  face: "표정",
  top: "상의",
  bottom: "하의",
  shoes: "신발",
};

const PART_VALUE_LABELS: Record<string, string> = {
  // 피부
  light: "밝은",
  tan: "보통",
  dark: "진한",
  // 머리
  short_brown: "갈색 단발",
  short_black: "검정 단발",
  short_blonde: "금색 단발",
  long_brown: "갈색 긴머리",
  long_black: "검정 긴머리",
  long_pink: "분홍 긴머리",
  // 얼굴
  smile: "웃음",
  neutral: "평범",
  surprised: "놀람",
  wink: "윙크",
  // 상의
  hoodie_white: "흰 후드",
  tshirt_blue: "파란 티",
  tshirt_red: "빨간 티",
  dress_pink: "분홍 원피스",
  jacket_yellow: "노랑 자켓",
  // 하의
  shorts_green: "초록 반바지",
  pants_blue: "청바지",
  skirt_pink: "분홍 치마",
  pants_black: "검정 바지",
  // 신발
  sneakers_brown: "갈색 운동화",
  sneakers_white: "흰 운동화",
  sneakers_red: "빨간 운동화",
  // 동물
  cat: "고양이",
  dog: "강아지",
  rabbit: "토끼",
  bear: "곰",
  // 판타지
  robot: "로봇",
  astronaut: "우주인",
  ghost: "유령",
};

function labelOf(value: string): string {
  return PART_VALUE_LABELS[value] ?? value;
}

export function AvatarEditSheet({ open, initial, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<AvatarConfig>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  const setKind = (kind: "human" | "animal" | "fantasy") => {
    setError(null);
    if (kind === "human") {
      setDraft(DEFAULT_AVATAR);
      return;
    }
    if (kind === "animal") {
      setDraft({ kind: "animal", variant: AVATAR_OPTIONS.animal[0] });
      return;
    }
    setDraft({ kind: "fantasy", variant: AVATAR_OPTIONS.fantasy[0] });
  };

  const setHumanPart = (key: string, value: string) => {
    if (draft.kind !== "human") return;
    setDraft({ ...draft, [key]: value } as AvatarConfig);
  };

  const setBody = (body: "boy" | "girl") => {
    if (draft.kind !== "human") return;
    setDraft({ ...draft, body });
  };

  const setVariant = (variant: string) => {
    if (draft.kind === "human") return;
    setDraft({ ...draft, variant });
  };

  const onSave = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateAvatarAction({ avatar: draft });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onSaved(result.avatar);
      onClose();
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="아바타 꾸미기"
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
          <h2 style={{ margin: 0, fontSize: 18, color: "#3d2818", fontWeight: 800 }}>아바타 꾸미기</h2>
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
            display: "flex",
            justifyContent: "center",
            background: "#fff5d6",
            borderRadius: 14,
            padding: "12px 0 4px",
            marginBottom: 14,
            border: "1.5px solid #f0c050",
          }}
        >
          <AvatarFigure config={draft} size={140} />
        </div>

        {/* 카테고리 탭 */}
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {(["human", "animal", "fantasy"] as const).map((k) => {
            const active = draft.kind === k;
            const label = k === "human" ? "사람" : k === "animal" ? "동물" : "판타지";
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

        {/* 사람 — body + part 슬롯 */}
        {draft.kind === "human" && (
          <>
            <Slot title="성별">
              {(["boy", "girl"] as const).map((b) => (
                <Chip key={b} active={draft.body === b} onClick={() => setBody(b)}>
                  {b === "boy" ? "남자" : "여자"}
                </Chip>
              ))}
            </Slot>
            {(["skin", "hair", "face", "top", "bottom", "shoes"] as const).map((key) => (
              <Slot key={key} title={HUMAN_PART_LABELS[key]}>
                {(AVATAR_OPTIONS[key] as string[]).map((value) => (
                  <Chip
                    key={value}
                    active={draft[key] === value}
                    onClick={() => setHumanPart(key, value)}
                  >
                    {labelOf(value)}
                  </Chip>
                ))}
              </Slot>
            ))}
          </>
        )}

        {/* 동물 — variant 그리드 */}
        {draft.kind === "animal" && (
          <Slot title="동물">
            {AVATAR_OPTIONS.animal.map((v) => (
              <Chip key={v} active={draft.variant === v} onClick={() => setVariant(v)}>
                {labelOf(v)}
              </Chip>
            ))}
          </Slot>
        )}

        {/* 판타지 — variant 그리드 */}
        {draft.kind === "fantasy" && (
          <Slot title="판타지">
            {AVATAR_OPTIONS.fantasy.map((v) => (
              <Chip key={v} active={draft.variant === v} onClick={() => setVariant(v)}>
                {labelOf(v)}
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
