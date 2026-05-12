"use client";

// 학생 본인의 아바타를 편집하는 시트.
// 카테고리 (사람/동물/판타지) 탭 + 각 카테고리에 맞는 옵션 선택.
// 모든 kind 공통으로 안경/모자 액세서리 슬롯 노출.
// 미리보기는 AvatarFigure 로 즉시 반영. 저장 시 updateAvatarAction 호출.

import { useRef, useState, useTransition } from "react";
import type { AvatarConfig, AvatarAccessories } from "@/lib/types";
import { DEFAULT_AVATAR } from "@/lib/types";
import { AvatarFigure, AVATAR_OPTIONS, COSTUME_SWATCH } from "./AvatarFigure";
import { updateAvatarAction, uploadAvatarImageAction } from "@/app/me/actions";

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
  costume: "코스튁",
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
  happy: "기본 눈",
  dot: "점 눈",
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
  // 코스튐 세트
  casual_olive: "올리브 후드",
  casual_blue: "캐주얼 블루",
  uniform_school: "교복",
  dress_pink: "분홍 원피스",
  sports_red: "빨강 운동복",
  winter_brown: "겨울 코트",
  hoodie_yellow: "노랑 후드",
  // 동물
  cat: "고양이",
  dog: "강아지",
  rabbit: "토끼",
  bear: "곰",
  pig: "돼지",
  fox: "여우",
  panda: "판다",
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
  light: "#f4c69a", tan: "#c89870", dark: "#7a4a30",
  short_brown: "#553420", short_black: "#1a1010", short_blonde: "#d4a040",
  long_brown: "#553420", long_black: "#0e0606", long_pink: "#d088a0",
  ...COSTUME_SWATCH,
};

function labelOf(value: string): string {
  return PART_VALUE_LABELS[value] ?? value;
}

export function AvatarEditSheet({ open, initial, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<AvatarConfig>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [imageTab, setImageTab] = useState<boolean>(initial.kind === "image");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

  const setKind = (kind: "human" | "animal" | "fantasy" | "image") => {
    setError(null);
    if (kind === "image") {
      // 이미지 탭으로 전환만 — 업로드 전에는 draft 변경 안 함 (기존 SVG 유지)
      if (draft.kind !== "image") {
        // draft 는 그대로 두고 탭만 image 로. 시각적 활성화를 위해 별도 ui state 필요해서
        // 여기서는 draft 를 image 로 바꾸지 않고, isImageTab 으로 추적.
      }
      setImageTab(true);
      return;
    }
    setImageTab(false);
    // 액세서리는 kind 전환 시에도 유지 (image → 아닐 때만)
    const keepAcc = draft.kind !== "image" ? draft.accessories : undefined;
    const accField = keepAcc ? { accessories: keepAcc } : {};
    if (kind === "human") {
      setDraft({ ...DEFAULT_AVATAR, ...accField });
      return;
    }
    if (kind === "animal") {
      setDraft({ kind: "animal", variant: AVATAR_OPTIONS.animal[0], costume: "none", ...accField });
      return;
    }
    setDraft({ kind: "fantasy", variant: AVATAR_OPTIONS.fantasy[0], costume: "none", ...accField });
  };

  const onPickFile = () => fileInputRef.current?.click();

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    if (file.size > 1_048_576) {
      setError("이미지가 너무 커요 (1MB 이하).");
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("PNG/JPG/WebP 만 업로드할 수 있어요.");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const result = await uploadAvatarImageAction(fd);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDraft(result.avatar);
      onSaved(result.avatar);
      onClose();
    });
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
    if (draft.kind !== "animal" && draft.kind !== "fantasy") return;
    setDraft({ ...draft, variant });
  };

  const setCostume = (costume: string) => {
    if (draft.kind === "human") {
      setDraft({ ...draft, costume });
    } else if (draft.kind === "animal" || draft.kind === "fantasy") {
      setDraft({ ...draft, costume });
    }
  };

  const setAccessory = (slot: "glasses" | "hat", value: string) => {
    if (draft.kind === "image") return;
    const nextAcc: AvatarAccessories = { ...(draft.accessories ?? {}) };
    if (value === "none") {
      delete nextAcc[slot];
    } else {
      nextAcc[slot] = value;
    }
    const hasAny = Object.keys(nextAcc).length > 0;
    setDraft({ ...draft, accessories: hasAny ? nextAcc : undefined });
  };

  const currentAcc: AvatarAccessories = draft.kind === "image" ? {} : draft.accessories ?? {};

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
          {(["human", "animal", "fantasy", "image"] as const).map((k) => {
            const active = k === "image" ? imageTab : !imageTab && draft.kind === k;
            const label = k === "human" ? "사람" : k === "animal" ? "동물" : k === "fantasy" ? "판타지" : "사진";
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

        {/* 사진 — 파일 업로드 */}
        {imageTab && (
          <div style={{ marginBottom: 12 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={onFileChange}
              style={{ display: "none" }}
            />
            <div
              style={{
                padding: 16,
                background: "#fff5e6",
                border: "1.5px dashed #f0c050",
                borderRadius: 12,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 13, color: "#3d2818", fontWeight: 700, marginBottom: 8 }}>
                내 사진 업로드
              </div>
              <div style={{ fontSize: 12, color: "#9a8b6c", marginBottom: 12 }}>
                PNG / JPG / WebP · 최대 1MB · 정사각 비율 권장
              </div>
              <button
                type="button"
                onClick={onPickFile}
                disabled={pending}
                style={{
                  padding: "10px 20px",
                  border: "none",
                  background: pending ? "#d6c2a0" : "#F26522",
                  color: "#fff",
                  borderRadius: 10,
                  fontWeight: 800,
                  cursor: pending ? "default" : "pointer",
                  fontSize: 14,
                }}
              >
                {pending ? "업로드 중..." : "📷 사진 선택"}
              </button>
              {draft.kind === "image" && (
                <div style={{ fontSize: 11, color: "#5a8a3a", marginTop: 8 }}>
                  ✓ 현재 사진이 적용된 상태예요. 새로 선택하면 교체됩니다.
                </div>
              )}
            </div>
          </div>
        )}

        {/* 사람 — body + part 슬롯 */}
        {!imageTab && draft.kind === "human" && (
          <>
            <Slot title="성별">
              {(["boy", "girl"] as const).map((b) => (
                <Chip key={b} active={draft.body === b} onClick={() => setBody(b)}>
                  {b === "boy" ? "남자" : "여자"}
                </Chip>
              ))}
            </Slot>
            {(["skin", "hair", "eyes", "mouth"] as const).map((key) => (
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
            <Slot title="코스튐 (의상 세트)">
              {AVATAR_OPTIONS.costume.map((value) => (
                <Chip
                  key={value}
                  active={draft.costume === value}
                  onClick={() => setCostume(value)}
                  swatch={SWATCH[value]}
                >
                  {value === "none" ? "맨몸" : labelOf(value)}
                </Chip>
              ))}
            </Slot>
          </>
        )}

        {/* 동물 — variant + 코스튐 */}
        {!imageTab && draft.kind === "animal" && (
          <>
            <Slot title="동물">
              {AVATAR_OPTIONS.animal.map((v) => (
                <Chip key={v} active={draft.variant === v} onClick={() => setVariant(v)}>
                  {labelOf(v)}
                </Chip>
              ))}
            </Slot>
            <Slot title="코스튐 (의상 세트)">
              {AVATAR_OPTIONS.costume.map((value) => (
                <Chip
                  key={value}
                  active={(draft.costume ?? "none") === value}
                  onClick={() => setCostume(value)}
                  swatch={SWATCH[value]}
                >
                  {value === "none" ? "맨몸" : labelOf(value)}
                </Chip>
              ))}
            </Slot>
          </>
        )}

        {/* 판타지 — variant + 코스튐 */}
        {!imageTab && draft.kind === "fantasy" && (
          <>
            <Slot title="판타지">
              {AVATAR_OPTIONS.fantasy.map((v) => (
                <Chip key={v} active={draft.variant === v} onClick={() => setVariant(v)}>
                  {labelOf(v)}
                </Chip>
              ))}
            </Slot>
            <Slot title="코스튐 (의상 세트)">
              {AVATAR_OPTIONS.costume.map((value) => (
                <Chip
                  key={value}
                  active={(draft.costume ?? "none") === value}
                  onClick={() => setCostume(value)}
                  swatch={SWATCH[value]}
                >
                  {value === "none" ? "기본" : labelOf(value)}
                </Chip>
              ))}
            </Slot>
          </>
        )}

        {/* 액세서리 — 사진 탭에서는 미적용 (이미지 위 오버레이 안 함) */}
        {!imageTab && draft.kind !== "image" && (
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
            {imageTab ? "닫기" : "취소"}
          </button>
          {!imageTab && (
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
          )}
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
