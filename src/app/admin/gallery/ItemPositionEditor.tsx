"use client";

// 갤러리 항목 위치 미세조정 모달.
// - 미리보기: base 아바타(반투명) 위에 항목을 겹쳐 그림.
// - 항목을 드래그(터치/마우스) 해서 위치 이동, 슬라이더로 크기 조절.
// - 모든 처리는 CSS transform 만 사용 → 60fps, canvas 연산 없음.
// - "확정저장" 시 {x, y, scale} 만 DB 에 저장 (이미지 파일 미변경).

import { useEffect, useRef, useState, useTransition } from "react";
import type { AvatarGalleryItem, AvatarItemPosition } from "@/lib/types";
import { DEFAULT_ITEM_POSITION } from "@/lib/types";
import {
  setGalleryItemPositionAction,
  propagateGalleryItemPositionAction,
} from "../actions";

const PREVIEW_SIZE = 300;

type Props = {
  item: AvatarGalleryItem;
  baseImageUrl: string | null;
  onClose: () => void;
  onSaved: (position: AvatarItemPosition) => void;
};

export function ItemPositionEditor({ item, baseImageUrl, onClose, onSaved }: Props) {
  const [pos, setPos] = useState<AvatarItemPosition>(
    (item.position ?? null) ?? DEFAULT_ITEM_POSITION[item.category],
  );
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [savedPosition, setSavedPosition] = useState<AvatarItemPosition | null>((item.position ?? null));
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startPos: AvatarItemPosition; pointerId: number } | null>(null);

  useEffect(() => {
    setPos((item.position ?? null) ?? DEFAULT_ITEM_POSITION[item.category]);
    setSavedPosition((item.position ?? null));
    setInfo(null);
    setError(null);
  }, [item.id, (item.position ?? null), item.category]);

  // 포인터 이동 핸들러 — 드래그 중에는 stage 좌표계의 % 변화량을 누적.
  const onPointerDown = (e: React.PointerEvent) => {
    if (!stageRef.current) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { startPos: pos, pointerId: e.pointerId };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || !stage || drag.pointerId !== e.pointerId) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    setPos((p) => ({
      x: Math.max(0, Math.min(100, xPct)),
      y: Math.max(0, Math.min(100, yPct)),
      scale: p.scale,
    }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
    }
  };

  const onSave = () => {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const r = await setGalleryItemPositionAction({ id: item.id, position: pos });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setSavedPosition(pos);
      setInfo("저장됨. 새로 선택하는 학생부터 적용돼요.");
      onSaved(pos);
    });
  };

  // 저장된 위치를, 이 항목을 이미 선택한 모든 학생 아바타에 일괄 전파.
  const onPropagate = () => {
    if (!savedPosition) {
      setError("먼저 위치를 저장한 뒤 전파할 수 있어요.");
      return;
    }
    if (!confirm("이 항목을 선택한 모든 학생 아바타에 새 위치를 적용할까요?")) return;
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const r = await propagateGalleryItemPositionAction({ id: item.id });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setInfo(`${r.updated}명 학생 아바타에 적용됐어요.`);
    });
  };

  const onResetToCategory = () => setPos(DEFAULT_ITEM_POSITION[item.category]);

  const onClearOverride = () => {
    setError(null);
    startTransition(async () => {
      const r = await setGalleryItemPositionAction({ id: item.id, position: null });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      onSaved(DEFAULT_ITEM_POSITION[item.category]);
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="항목 위치 조정"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(61,40,24,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 110,
        padding: 12,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fffaf2",
          borderRadius: 16,
          padding: 16,
          width: "100%",
          maxWidth: 360,
          boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#3d2818" }}>
            위치 조정 — {item.label ?? item.category}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            style={{ border: "none", background: "transparent", fontSize: 22, color: "#9a8b6c", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>

        {/* 미리보기 stage */}
        <div
          ref={stageRef}
          style={{
            position: "relative",
            width: "100%",
            maxWidth: PREVIEW_SIZE,
            aspectRatio: "1 / 1",
            margin: "0 auto",
            background: "linear-gradient(180deg, #fff5d6 0%, #ffe9b0 100%)",
            border: "1.5px solid #f0c050",
            borderRadius: 12,
            overflow: "hidden",
            touchAction: "none",
          }}
        >
          {baseImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={baseImageUrl}
              alt=""
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "contain",
                opacity: 0.4,
                pointerEvents: "none",
              }}
            />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.image_url}
            alt=""
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            draggable={false}
            style={{
              position: "absolute",
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              width: "100%",
              height: "100%",
              objectFit: "contain",
              transform: `translate(-50%, -50%) scale(${pos.scale / 100})`,
              transformOrigin: "center center",
              cursor: dragRef.current ? "grabbing" : "grab",
              userSelect: "none",
            }}
          />
          {/* 중앙 십자선 — 위치 가늠 보조 */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              backgroundImage:
                "linear-gradient(to right, transparent calc(50% - 0.5px), rgba(61,40,24,0.15) calc(50% - 0.5px), rgba(61,40,24,0.15) calc(50% + 0.5px), transparent calc(50% + 0.5px)), linear-gradient(to bottom, transparent calc(50% - 0.5px), rgba(61,40,24,0.15) calc(50% - 0.5px), rgba(61,40,24,0.15) calc(50% + 0.5px), transparent calc(50% + 0.5px))",
            }}
          />
        </div>

        {/* 슬라이더 */}
        <div style={{ marginTop: 12, fontSize: 12, color: "#3d2818" }}>
          <SliderRow
            label="X"
            value={pos.x}
            min={0}
            max={100}
            onChange={(v) => setPos((p) => ({ ...p, x: v }))}
          />
          <SliderRow
            label="Y"
            value={pos.y}
            min={0}
            max={100}
            onChange={(v) => setPos((p) => ({ ...p, y: v }))}
          />
          <SliderRow
            label="크기"
            value={pos.scale}
            min={30}
            max={200}
            onChange={(v) => setPos((p) => ({ ...p, scale: v }))}
            suffix="%"
          />
        </div>

        {error && (
          <div
            style={{
              background: "#fde8e4",
              color: "#a83020",
              padding: "8px 10px",
              borderRadius: 8,
              fontSize: 12,
              marginTop: 10,
            }}
          >
            {error}
          </div>
        )}
        {info && (
          <div
            style={{
              background: "#e6f4e2",
              color: "#3a6b1f",
              padding: "8px 10px",
              borderRadius: 8,
              fontSize: 12,
              marginTop: 10,
            }}
          >
            {info}
          </div>
        )}

        <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onResetToCategory}
            disabled={pending}
            style={btnStyle("ghost")}
          >
            카테고리 기본값
          </button>
          <button
            type="button"
            onClick={onClearOverride}
            disabled={pending || (item.position ?? null) === null}
            style={btnStyle("ghost")}
            title="저장된 항목 위치를 삭제 — 이후 카테고리 기본값 사용"
          >
            저장값 삭제
          </button>
          <button type="button" onClick={onSave} disabled={pending} style={btnStyle("primary")}>
            {pending ? "저장 중..." : "확정 저장"}
          </button>
          <button
            type="button"
            onClick={onPropagate}
            disabled={pending || !savedPosition}
            style={btnStyle("ghost")}
            title="이 항목을 이미 선택한 학생들에게도 새 위치를 적용"
          >
            🔄 학생들에게 전파
          </button>
        </div>
      </div>
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <span style={{ width: 32, fontWeight: 700 }}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={Math.round(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1 }}
      />
      <span style={{ width: 44, textAlign: "right", color: "#9a8b6c" }}>
        {Math.round(value)}
        {suffix ?? "%"}
      </span>
    </div>
  );
}

function btnStyle(variant: "primary" | "ghost"): React.CSSProperties {
  if (variant === "primary") {
    return {
      flex: 1,
      minWidth: 100,
      padding: "10px 12px",
      border: "none",
      background: "#F26522",
      color: "#fff",
      borderRadius: 8,
      fontWeight: 800,
      fontSize: 13,
      cursor: "pointer",
    };
  }
  return {
    padding: "10px 12px",
    border: "1.5px solid #d6c2a0",
    background: "#fff",
    color: "#3d2818",
    borderRadius: 8,
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
  };
}
