"use client";

// 학생 아바타 꾸미기 — 터치/마우스로 직접 조작하는 인터랙티브 미리보기.
//
// 동작:
// - 아이템 탭/클릭 → 선택 (점선 테두리 + 네 모서리 핸들)
// - 빈 영역 탭 → 선택 해제
// - 1손가락 드래그 / 마우스 드래그 → 위치 이동 (x, y)
// - 2손가락 핀치 → 크기 조절 (scaleX, scaleY 동시)
// - 마우스 휠 → 크기 조절
//
// 모든 변환은 CSS transform (position 단위 % / scale 단위 %).
// canvas 미사용. requestAnimationFrame 으로 부드럽게.

import { useEffect, useRef, useState } from "react";
import type {
  AvatarConfig,
  AvatarGalleryCategory,
  AvatarGalleryItemPosition,
  AvatarGallerySlot,
} from "@/lib/types";
import {
  DEFAULT_GALLERY_POSITION_BY_CATEGORY,
  getGallerySlotPosition,
  getGallerySlotUrl,
} from "@/lib/types";

type GallerySlot = "base" | "outfit" | "bottom" | "shoes" | "hair" | "face" | "hat" | "accessory";

const SLOT_ORDER: Array<{ key: GallerySlot; z: number }> = [
  { key: "base", z: 1 },
  { key: "bottom", z: 2 },
  { key: "outfit", z: 3 },
  { key: "shoes", z: 4 },
  { key: "face", z: 5 },
  { key: "hair", z: 6 },
  { key: "accessory", z: 7 },
  { key: "hat", z: 8 },
];

const MIN_SCALE = 10;
const MAX_SCALE = 200;
const TAP_THRESHOLD_PX = 6; // 이 이하 움직이면 탭으로 판정

type Layer = {
  key: GallerySlot;
  url: string;
  position: AvatarGalleryItemPosition;
  zIndex: number;
};

export function AvatarEditCanvas({
  draft,
  size,
  galleryPositions,
  selectedSlot,
  onSelectSlot,
  onPositionChange,
}: {
  draft: AvatarConfig;
  size: number;
  galleryPositions?: Record<string, AvatarGalleryItemPosition>;
  selectedSlot: GallerySlot | null;
  onSelectSlot: (slot: GallerySlot | null) => void;
  onPositionChange: (slot: GallerySlot, next: AvatarGalleryItemPosition) => void;
}) {
  // 갤러리 형태가 아니면 편집 불가 — 그냥 빈 영역 렌더
  const isGallery = draft.kind === "gallery";

  // 각 슬롯 effective position 계산 (custom > admin > category 기본)
  const layers: Layer[] = SLOT_ORDER
    .map(({ key, z }) => {
      const slot = isGallery
        ? ((draft as Record<string, unknown>)[key] as AvatarGallerySlot | undefined)
        : undefined;
      const url = getGallerySlotUrl(slot);
      if (!url) return null;
      const custom = getGallerySlotPosition(slot);
      const admin = galleryPositions?.[url];
      const position = custom ?? admin ?? DEFAULT_GALLERY_POSITION_BY_CATEGORY[key];
      const zIndex = custom?.zIndex ?? z;
      return { key, url, position, zIndex };
    })
    .filter((l): l is Layer => l !== null);

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        background: "linear-gradient(180deg, #fff5d6 0%, #ffe9b0 100%)",
        borderRadius: 14,
        overflow: "hidden",
        border: "1.5px solid #f0c050",
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
      onPointerDown={(e) => {
        // 빈 영역 탭 → 선택 해제. 자식이 stopPropagation 하면 여기 안 옴.
        if (e.target === e.currentTarget) onSelectSlot(null);
      }}
    >
      {layers.map((layer) => (
        <LayerNode
          key={layer.key}
          layer={layer}
          size={size}
          selected={selectedSlot === layer.key}
          onSelect={() => onSelectSlot(layer.key)}
          onPositionChange={onPositionChange}
        />
      ))}
    </div>
  );
}

function LayerNode({
  layer,
  size,
  selected,
  onSelect,
  onPositionChange,
}: {
  layer: Layer;
  size: number;
  selected: boolean;
  onSelect: () => void;
  onPositionChange: (slot: GallerySlot, next: AvatarGalleryItemPosition) => void;
}) {
  // 화면상 좌표 (CSS %): 중심점 (x, y), 크기 scaleX×scaleY% of size
  const { position, key } = layer;
  const ref = useRef<HTMLDivElement | null>(null);

  // 제스처 상태 — ref 로 추적 (re-render 비용 없이 빠름)
  const stateRef = useRef<{
    mode: "idle" | "drag" | "pinch";
    startX?: number;
    startY?: number;
    startPos?: AvatarGalleryItemPosition;
    pointers: Map<number, { x: number; y: number }>;
    initialDist?: number;
    initialScaleX?: number;
    initialScaleY?: number;
    moved?: boolean;
    rafId?: number | null;
    pendingPos?: AvatarGalleryItemPosition;
  }>({ mode: "idle", pointers: new Map() });

  // 부모 박스(canvas) 의 picel 크기 → % 변환에 사용
  const getCanvasRect = () => ref.current?.parentElement?.getBoundingClientRect() ?? null;

  // 다음 프레임에 position 커밋 (requestAnimationFrame)
  const scheduleCommit = (next: AvatarGalleryItemPosition) => {
    stateRef.current.pendingPos = next;
    if (stateRef.current.rafId != null) return;
    stateRef.current.rafId = requestAnimationFrame(() => {
      stateRef.current.rafId = null;
      const p = stateRef.current.pendingPos;
      if (p) onPositionChange(key, p);
    });
  };

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    stateRef.current.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    stateRef.current.moved = false;

    if (stateRef.current.pointers.size === 1) {
      stateRef.current.mode = "drag";
      stateRef.current.startX = e.clientX;
      stateRef.current.startY = e.clientY;
      stateRef.current.startPos = { ...position };
    } else if (stateRef.current.pointers.size === 2) {
      // 두 번째 손가락 들어옴 → 핀치 모드
      const pts = Array.from(stateRef.current.pointers.values());
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      stateRef.current.mode = "pinch";
      stateRef.current.initialDist = Math.sqrt(dx * dx + dy * dy);
      stateRef.current.initialScaleX = position.scaleX;
      stateRef.current.initialScaleY = position.scaleY;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = stateRef.current;
    if (s.mode === "idle") return;
    if (!s.pointers.has(e.pointerId)) return;
    s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const rect = getCanvasRect();
    if (!rect) return;

    if (s.mode === "drag" && s.pointers.size === 1) {
      const dxPx = e.clientX - (s.startX ?? e.clientX);
      const dyPx = e.clientY - (s.startY ?? e.clientY);
      if (Math.abs(dxPx) > TAP_THRESHOLD_PX || Math.abs(dyPx) > TAP_THRESHOLD_PX) s.moved = true;
      const dxPct = (dxPx / rect.width) * 100;
      const dyPct = (dyPx / rect.height) * 100;
      const next: AvatarGalleryItemPosition = {
        ...(s.startPos ?? position),
        x: clamp((s.startPos?.x ?? position.x) + dxPct, -20, 120),
        y: clamp((s.startPos?.y ?? position.y) + dyPct, -20, 120),
      };
      scheduleCommit(next);
    } else if (s.mode === "pinch" && s.pointers.size === 2) {
      const pts = Array.from(s.pointers.values());
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ratio = s.initialDist && s.initialDist > 0 ? dist / s.initialDist : 1;
      const nextSX = clamp((s.initialScaleX ?? position.scaleX) * ratio, MIN_SCALE, MAX_SCALE);
      const nextSY = clamp((s.initialScaleY ?? position.scaleY) * ratio, MIN_SCALE, MAX_SCALE);
      scheduleCommit({ ...position, scaleX: nextSX, scaleY: nextSY });
      s.moved = true;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const s = stateRef.current;
    s.pointers.delete(e.pointerId);
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (s.pointers.size === 0) {
      s.mode = "idle";
    } else if (s.pointers.size === 1 && s.mode === "pinch") {
      // 핀치 끝나고 한 손가락만 남으면 드래그 모드로 전환
      const rest = Array.from(s.pointers.entries())[0];
      s.mode = "drag";
      s.startX = rest[1].x;
      s.startY = rest[1].y;
      s.startPos = { ...position };
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!selected) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.06 : 0.94;
    const nextSX = clamp(position.scaleX * factor, MIN_SCALE, MAX_SCALE);
    const nextSY = clamp(position.scaleY * factor, MIN_SCALE, MAX_SCALE);
    onPositionChange(key, { ...position, scaleX: nextSX, scaleY: nextSY });
  };

  useEffect(() => () => {
    if (stateRef.current.rafId != null) cancelAnimationFrame(stateRef.current.rafId);
  }, []);

  // 화면 표시: 중심점 (x%, y%), 크기 (scaleX% × scaleY% of canvas).
  // 컨테이너 사이즈는 100% × 100% 가정. innerSize = scaleX/100 * size.
  const innerW = (position.scaleX / 100) * size;
  const innerH = (position.scaleY / 100) * size;

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      style={{
        position: "absolute",
        left: `${position.x}%`,
        top: `${position.y}%`,
        width: innerW,
        height: innerH,
        transform: "translate(-50%, -50%)",
        zIndex: layer.zIndex,
        cursor: selected ? "move" : "pointer",
        touchAction: "none",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={layer.url}
        alt=""
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          pointerEvents: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      />
      {selected && (
        <>
          {/* 점선 테두리 */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: -2,
              border: "1.5px dashed #F26522",
              borderRadius: 4,
              pointerEvents: "none",
            }}
          />
          {/* 네 모서리 핸들 (시각용) */}
          {[
            { top: -5, left: -5 },
            { top: -5, right: -5 },
            { bottom: -5, left: -5 },
            { bottom: -5, right: -5 },
          ].map((pos, i) => (
            <div
              key={i}
              aria-hidden
              style={{
                position: "absolute",
                width: 10,
                height: 10,
                borderRadius: 999,
                background: "#fff",
                border: "1.5px solid #F26522",
                pointerEvents: "none",
                ...pos,
              }}
            />
          ))}
        </>
      )}
    </div>
  );
}
