"use client";

// 학생 본인의 아바타를 편집하는 시트.
// 카테고리 (사람/동물/판타지) 탭 + 각 카테고리에 맞는 옵션 선택.
// 모든 kind 공통으로 안경/모자 액세서리 슬롯 노출.
// 미리보기는 AvatarFigure 로 즉시 반영. 저장 시 updateAvatarAction 호출.

import { useState, useTransition } from "react";
import type { AvatarConfig, AvatarAccessories } from "@/lib/types";
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
  eyes: "눈",
  mouth: "입",
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
  // 눈
  dot: "또렷한 눈",
  wink: "윙크",
  round: "큰 눈",
  sleepy: "졸린 눈",
  star: "별눈",
  sharp: "날카로운 눈",
  // 입
  smile: "웃음",
  neutral: "다물기",
  oh: "놀람",
  smirk: "씨익",
  tongue: "메롱",
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
  // 액세서리
  none: "없음",
  square: "사각 뿔테",
  sunglasses: "선글라스",
  beanie_navy: "네이비 비니",
  newsboy_brown: "뉴스보이 캡",
  wizard_purple: "마법사 모자",
  graduation_black: "학사모",
  cap_red: "빨간 캡",
};

// 색 스와치 — 칩에 작은 점 표시. 없는 값은 swatch 미표시.
const SWATCH: Record<string, string> = {
  light: "#f0c896", tan: "#c89870", dark: "#7a4a30",
  short_brown: "#5a3820", short_black: "#1a1010", short_blonde: "#d4a040",
  long_brown: "#684028", long_black: "#100808", long_pink: "#d088a0",
  hoodie_white: "#e8e0d0", tshirt_blue: "#4878a8", tshirt_red: "#b04038",
  dress_pink: "#d088a0", jacket_yellow: "#e8b840",
  shorts_green: "#608048", pants_blue: "#2c4868",
  skirt_pink: "#d088a0", pants_black: "#201810",
  sneakers_brown: "#4a2c18", sneakers_white: "#e8e0d0", sneakers_red: "#a83828",
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
    // 액세서리는 kind 전환 시에도 유지
    const keepAcc = draft.accessories;
    if (kind === "human") {
      setDraft({ ...DEFAULT_AVATAR, accessories: keepAcc });
      return;
    }
    if (kind === "animal") {
      setDraft({ kind: "animal", variant: AVATAR_OPTIONS.animal[0], accessories: keepAcc });
      return;
    }
    setDraft({ kind: "fantasy", variant: AVATAR_OPTIONS.fantasy[0], accessories: keepAcc });
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

  const setAccessory = (slot: "glasses" | "hat", value: string) => {
    const nextAcc: AvatarAccessories = { ...(draft.accessories ?? {}) };
    if (value === "none") {
      delete nextAcc[slot];
    } else {
      nextAcc[slot] = value;
    }
    const hasAny = Object.keys(nextAcc).length > 0;
    setDraft({ ...draft, accessories: hasAny ? nextAcc : undefined } as AvatarConfig);
  };

  const currentAcc = draft.accessories ?? {};

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

        {/* 미리보기 (스크롤해도 따라옴) */}
        <div
          style={{
            position: "sticky",
            top: 0,
            display: "flex",
            justifyContent: "center",
            background: "linear-gradient(180deg, #fff5d6 0%, #ffe9b0 100%)",
            borderRadius: 14,
            padding: "16px 0 10px",
            marginBottom: 14,
            border: "1.5px solid #f0c050",
            boxShadow: "0 2px 6px rgba(61,40,24,0.08)",
            zIndex: 1,
          }}
        >
          <AvatarFigure config={draft} size={180} />
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
            {(["skin", "hair", "eyes", "mouth", "top", "bottom", "shoes"] as const).map((key) => (
              <Slot key={key} title={HUMAN_PART_LABELS[key]}>
                {(AVATAR_OPTIONS[key] as readonly string[]).map((value) => (
                  <Chip
                    key={value}
                    active={draft[key] === value}
                    onClick={() => setHumanPart(key, value)}
                    swatch={SWATCH[value]}
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

        {/* 액세서리 — 전 kind 공통 */}
        <div
          style={{
            marginTop: 14,
            padding: 12,
            background: "#fff5e6",
            borderRadius: 12,
            border: "1.5px solid #f0c050",
          }}
        >
          <div
            style={{
              fontSize: 13,
              color: "#3d2818",
              fontWeight: 800,
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>✨ 꾸미기</span>
            <span style={{ fontSize: 11, color: "#9a8b6c", fontWeight: 500 }}>
              사람·동물·판타지 공통
            </span>
          </div>
          <Slot title="안경">
            {AVATAR_OPTIONS.glasses.map((v) => (
              <Chip
                key={v}
                active={(currentAcc.glasses ?? "none") === v}
                onClick={() => setAccessory("glasses", v)}
              >
                {labelOf(v)}
              </Chip>
            ))}
          </Slot>
          <Slot title="모자">
            {AVATAR_OPTIONS.hat.map((v) => (
              <Chip
                key={v}
                active={(currentAcc.hat ?? "none") === v}
                onClick={() => setAccessory("hat", v)}
              >
                {labelOf(v)}
              </Chip>
            ))}
          </Slot>
        </div>

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
  swatch,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  swatch?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
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
      {swatch && (
        <span
          aria-hidden
          style={{
            display: "inline-block",
            width: 12,
            height: 12,
            borderRadius: 999,
            background: swatch,
            border: "1px solid #2a1a14",
          }}
        />
      )}
      {children}
    </button>
  );
}
