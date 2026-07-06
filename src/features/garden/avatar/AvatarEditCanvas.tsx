"use client";

// 학생 아바타 꾸미기 — 터치/마우스로 직접 조작하는 인터랙티브 미리보기.
//
// 동작:
// - 아이템 탭/클릭 → 선택 (점선 테두리 + 8개 핸들 표시)
// - 빈 영역 탭 → 선택 해제
// - 선택된 아이템 본체 드래그 → 위치 이동 (x, y)
// - 핸들 8개 드래그:
//     · 모서리 (4개): 가로·세로 동시 변경
//     · 가로 엣지 (좌·우): scaleX 만 변경 (좌우 길이)
//     · 세로 엣지 (위·아래): scaleY 만 변경 (위아래 길이)
// - 두 손가락 핀치: 캔버스 어디서든 — 선택된 레이어의 scaleX/scaleY 동시 조절
// - 마우스 휠: 양쪽 동시 / Shift+휠 = scaleX / Alt+휠 = scaleY
//
// 모든 변환은 CSS transform / position 단위 %. canvas 미사용.
// requestAnimationFrame 으로 부드럽게.

import { useEffect, useRef, useState } from "react";
import type {
  AvatarConfig,
  AvatarGalleryCategory,
  AvatarGalleryItemPosition,
  AvatarGallerySlot,
  BackgroundConfig,
} from "@/lib/types";
import {
  DEFAULT_GALLERY_POSITION_BY_CATEGORY,
  getGallerySlotPosition,
  getGallerySlotUrl,
} from "@/lib/types";
import { BackgroundCanvas } from "@/features/garden/background/BackgroundCanvas";
import { useFittedImage } from "./AvatarFigure";

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

// 캔버스 전역 핀치 제스처 상태 — LayerNode 의 드래그와 조율하기 위해
// ref 로 공유한다 (핀치 시작 시 진행 중이던 드래그는 취소).
export type PinchState = {
  active: boolean;
  startDist: number;
  startPos: AvatarGalleryItemPosition | null;
  slot: GallerySlot | null;
  rafId: number | null;
  pending: AvatarGalleryItemPosition | null;
};

export function AvatarEditCanvas({
  draft,
  size,
  galleryPositions,
  selectedSlot,
  onSelectSlot,
  onPositionChange,
  previewBackground,
}: {
  draft: AvatarConfig;
  size: number;
  galleryPositions?: Record<string, AvatarGalleryItemPosition>;
  selectedSlot: GallerySlot | null;
  onSelectSlot: (slot: GallerySlot | null) => void;
  onPositionChange: (slot: GallerySlot, next: AvatarGalleryItemPosition) => void;
  // 학생의 현재 배경 — 있으면 미리보기 캔버스 배경으로 사용 (없으면 기존 크림).
  previewBackground?: BackgroundConfig | null;
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

  // AvatarFigure 의 AvatarComposite 과 동일한 inner box 계산.
  // base 이미지의 bbox 비율로 inner 박스를 만들어 layer 의 % 좌표가 그 안에서 동작.
  const baseUrl = isGallery
    ? getGallerySlotUrl(((draft as Record<string, unknown>).base) as AvatarGallerySlot | undefined)
    : undefined;
  const baseFitted = useFittedImage(baseUrl);
  const ratio = baseFitted?.ratio ?? 1.4;
  const innerWidth = ratio >= 1 ? size / ratio : size;
  const innerHeight = ratio >= 1 ? size : size * ratio;

  // ===== 두 손가락 핀치 = 선택 레이어 크기 =====
  // 캔버스(container) 레벨 capture 핸들러로 모든 포인터를 추적한다.
  // 자식(LayerNode)이 stopPropagation 해도 capture 단계는 먼저 실행되므로 안전.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<PinchState>({
    active: false,
    startDist: 0,
    startPos: null,
    slot: null,
    rafId: null,
    pending: null,
  });
  // 최신 layers / 콜백을 핸들러에서 읽기 위한 ref
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const selectedSlotRef = useRef(selectedSlot);
  selectedSlotRef.current = selectedSlot;
  const onPositionChangeRef = useRef(onPositionChange);
  onPositionChangeRef.current = onPositionChange;

  const pointerDist = () => {
    const pts = Array.from(pointersRef.current.values());
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  };

  const clampScale = (v: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, v));

  const onCanvasPointerDownCapture = (e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const slot = selectedSlotRef.current;
    if (pointersRef.current.size === 2 && slot) {
      const layer = layersRef.current.find((l) => l.key === slot);
      const dist = pointerDist();
      if (layer && dist > 0) {
        pinchRef.current.active = true;
        pinchRef.current.startDist = dist;
        pinchRef.current.startPos = { ...layer.position };
        pinchRef.current.slot = slot;
      }
    }
  };

  const onCanvasPointerMoveCapture = (e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = pinchRef.current;
    if (!p.active || !p.startPos || !p.slot || pointersRef.current.size < 2) return;
    const dist = pointerDist();
    if (dist <= 0 || p.startDist <= 0) return;
    const factor = dist / p.startDist;
    p.pending = {
      ...p.startPos,
      scaleX: clampScale(p.startPos.scaleX * factor),
      scaleY: clampScale(p.startPos.scaleY * factor),
    };
    if (p.rafId != null) return;
    p.rafId = requestAnimationFrame(() => {
      p.rafId = null;
      if (p.pending && p.slot) onPositionChangeRef.current(p.slot, p.pending);
    });
  };

  const onCanvasPointerEndCapture = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2 && pinchRef.current.active) {
      pinchRef.current.active = false;
      pinchRef.current.startPos = null;
      pinchRef.current.slot = null;
    }
  };

  useEffect(() => {
    const p = pinchRef.current;
    return () => {
      if (p.rafId != null) cancelAnimationFrame(p.rafId);
    };
  }, []);

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        background: previewBackground
          ? "transparent"
          : "linear-gradient(180deg, #fff5d6 0%, #ffe9b0 100%)",
        borderRadius: 14,
        overflow: "hidden",
        border: "1.5px solid #f0c050",
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
      onPointerDownCapture={onCanvasPointerDownCapture}
      onPointerMoveCapture={onCanvasPointerMoveCapture}
      onPointerUpCapture={onCanvasPointerEndCapture}
      onPointerCancelCapture={onCanvasPointerEndCapture}
      onPointerDown={(e) => {
        // 두 번째 손가락(핀치)은 선택 해제로 처리하지 않는다.
        if (pointersRef.current.size <= 1 && e.target === e.currentTarget) onSelectSlot(null);
      }}
    >
      {/* 학생의 현재 배경 미리보기 (있을 때만) */}
      {previewBackground && <BackgroundCanvas config={previewBackground} rounded={14} />}
      {/* inner 박스 — base 이미지 비율 기준. AvatarFigure 와 동일한 좌표계. */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: innerWidth,
          height: innerHeight,
          transform: "translate(-50%, -50%)",
        }}
        onPointerDown={(e) => {
          // inner 박스의 빈 공간 탭도 선택 해제로 처리 (핀치 두 번째 손가락 제외).
          if (pointersRef.current.size <= 1 && e.target === e.currentTarget) onSelectSlot(null);
        }}
      >
        {layers.map((layer) => (
          <LayerNode
            key={layer.key}
            layer={layer}
            innerWidth={innerWidth}
            innerHeight={innerHeight}
            selected={selectedSlot === layer.key}
            interactive={selectedSlot === null || selectedSlot === layer.key}
            onSelect={() => onSelectSlot(layer.key)}
            onPositionChange={onPositionChange}
            pinchRef={pinchRef}
          />
        ))}
      </div>
    </div>
  );
}

function LayerNode({
  layer,
  innerWidth,
  innerHeight,
  selected,
  interactive,
  onSelect,
  onPositionChange,
  pinchRef,
}: {
  layer: Layer;
  innerWidth: number;
  innerHeight: number;
  selected: boolean;
  interactive: boolean;
  onSelect: () => void;
  onPositionChange: (slot: GallerySlot, next: AvatarGalleryItemPosition) => void;
  // 캔버스 전역 핀치 상태 — 핀치 중엔 드래그/리사이즈를 중단한다.
  pinchRef: React.MutableRefObject<PinchState>;
}) {
  // 화면상 좌표 (CSS %): 중심점 (x, y), 크기 scaleX×scaleY% of size
  const { position, key } = layer;
  const ref = useRef<HTMLDivElement | null>(null);

  // 제스처 상태 — ref 로 추적 (re-render 비용 없이 빠름).
  // mode: idle / drag(본체 이동) / resize(핸들 끌어 크기)
  const stateRef = useRef<{
    mode: "idle" | "drag" | "resize";
    startX?: number;
    startY?: number;
    startPos?: AvatarGalleryItemPosition;
    resizeDir?: { x: -1 | 0 | 1; y: -1 | 0 | 1 };
    rafId?: number | null;
    pendingPos?: AvatarGalleryItemPosition;
  }>({ mode: "idle" });

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

  // 본체 드래그 — 위치 이동 (x, y)
  const onPointerDown = (e: React.PointerEvent) => {
    // 핀치(두 손가락 크기 조절) 진행 중이면 새 드래그 시작 안 함.
    if (pinchRef.current.active) return;
    // 이미 다른 제스처(handle resize 등) 진행 중이면 무시 — 멀티 터치가
    // mode state 를 덮어쓰지 않도록 보호.
    if (stateRef.current.mode !== "idle") return;
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    stateRef.current.mode = "drag";
    stateRef.current.startX = e.clientX;
    stateRef.current.startY = e.clientY;
    stateRef.current.startPos = { ...position };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = stateRef.current;
    // 핀치가 시작되면 진행 중이던 드래그/리사이즈는 취소 — 핀치 종료 후
    // 원래 시작점 기준으로 점프하는 것을 막는다.
    if (pinchRef.current.active) {
      s.mode = "idle";
      return;
    }
    if (s.mode === "idle") return;
    const rect = getCanvasRect();
    if (!rect) return;

    if (s.mode === "drag") {
      const dxPx = e.clientX - (s.startX ?? e.clientX);
      const dyPx = e.clientY - (s.startY ?? e.clientY);
      const dxPct = (dxPx / rect.width) * 100;
      const dyPct = (dyPx / rect.height) * 100;
      scheduleCommit({
        ...(s.startPos ?? position),
        x: clamp((s.startPos?.x ?? position.x) + dxPct, -20, 120),
        y: clamp((s.startPos?.y ?? position.y) + dyPct, -20, 120),
      });
    } else if (s.mode === "resize" && s.resizeDir) {
      const dxPx = e.clientX - (s.startX ?? e.clientX);
      const dyPx = e.clientY - (s.startY ?? e.clientY);
      const dxPct = (dxPx / rect.width) * 100;
      const dyPct = (dyPx / rect.height) * 100;
      // 중심 고정 가정 → 한쪽 엣지가 d 만큼 움직이면 폭은 2d 증가.
      const sxDelta = 2 * dxPct * s.resizeDir.x;
      const syDelta = 2 * dyPct * s.resizeDir.y;
      scheduleCommit({
        ...(s.startPos ?? position),
        scaleX: clamp((s.startPos?.scaleX ?? position.scaleX) + sxDelta, MIN_SCALE, MAX_SCALE),
        scaleY: clamp((s.startPos?.scaleY ?? position.scaleY) + syDelta, MIN_SCALE, MAX_SCALE),
      });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const s = stateRef.current;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    s.mode = "idle";
  };

  // 핸들에서 시작하는 resize 제스처
  const onHandleDown = (e: React.PointerEvent, dir: { x: -1 | 0 | 1; y: -1 | 0 | 1 }) => {
    // 핀치 진행 중이면 무시
    if (pinchRef.current.active) return;
    // 이미 다른 제스처 진행 중이면 무시 (멀티 터치 보호)
    if (stateRef.current.mode !== "idle") return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    stateRef.current.mode = "resize";
    stateRef.current.startX = e.clientX;
    stateRef.current.startY = e.clientY;
    stateRef.current.startPos = { ...position };
    stateRef.current.resizeDir = dir;
  };

  const onHandleMove = (e: React.PointerEvent) => onPointerMove(e);
  const onHandleUp = (e: React.PointerEvent) => onPointerUp(e);

  const onWheel = (e: React.WheelEvent) => {
    if (!selected) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.06 : 0.94;
    // Shift = 좌우(scaleX) 만, Alt = 상하(scaleY) 만, 기본 = 양쪽
    const adjustX = !e.altKey;
    const adjustY = !e.shiftKey;
    const nextSX = adjustX ? clamp(position.scaleX * factor, MIN_SCALE, MAX_SCALE) : position.scaleX;
    const nextSY = adjustY ? clamp(position.scaleY * factor, MIN_SCALE, MAX_SCALE) : position.scaleY;
    onPositionChange(key, { ...position, scaleX: nextSX, scaleY: nextSY });
  };

  useEffect(() => () => {
    if (stateRef.current.rafId != null) cancelAnimationFrame(stateRef.current.rafId);
  }, []);

  // AvatarLayer 와 동일하게 useFittedImage 로 투명 가장자리 자른 이미지 사용.
  const fitted = useFittedImage(layer.url);

  // 비주얼 영역 (시각 + interaction zone 위치 기준).
  const visualW = (position.scaleX / 100) * innerWidth;
  const visualH = (position.scaleY / 100) * innerHeight;

  return (
    <>
      {/* 비주얼 — AvatarLayer 완전히 동일한 패턴.
          박스 100%/100% + transform scale + objectFit:contain.
          이렇게 해야 /me 의 실제 렌더와 픽셀 단위로 일치한다. */}
      <div
        style={{
          position: "absolute",
          left: `${position.x}%`,
          top: `${position.y}%`,
          width: "100%",
          height: "100%",
          transform: `translate(-50%, -50%) scaleX(${position.scaleX / 100}) scaleY(${position.scaleY / 100})`,
          transformOrigin: "center center",
          zIndex: layer.zIndex,
          opacity: interactive ? 1 : 0.55,
          pointerEvents: "none",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fitted?.url ?? layer.url}
          alt=""
          draggable={false}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            objectPosition: "center",
            display: "block",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
        />
      </div>
      {/* Interaction zone — 비주얼 사이즈와 같게, 별도 div (scale 안 받음).
          핸들이 scale 영향 없이 항상 같은 크기로 표시되게 한다. */}
      <div
        ref={ref}
        onPointerDown={interactive ? onPointerDown : undefined}
        onPointerMove={interactive ? onPointerMove : undefined}
        onPointerUp={interactive ? onPointerUp : undefined}
        onPointerCancel={interactive ? onPointerUp : undefined}
        onWheel={interactive ? onWheel : undefined}
        style={{
          position: "absolute",
          left: `${position.x}%`,
          top: `${position.y}%`,
          width: visualW,
          height: visualH,
          transform: "translate(-50%, -50%)",
          zIndex: layer.zIndex + 100,
          cursor: interactive ? (selected ? "move" : "pointer") : "default",
          pointerEvents: interactive ? "auto" : "none",
          touchAction: "none",
          background: "transparent",
        }}
      >
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
            {/* 8개 기능 핸들 — 모서리 4개(양축) + 엣지 4개(한 축) */}
            {[
              { dir: { x: -1, y: -1 }, style: { top: -10, left: -10 }, cursor: "nwse-resize" as const },
              { dir: { x:  1, y: -1 }, style: { top: -10, right: -10 }, cursor: "nesw-resize" as const },
              { dir: { x: -1, y:  1 }, style: { bottom: -10, left: -10 }, cursor: "nesw-resize" as const },
              { dir: { x:  1, y:  1 }, style: { bottom: -10, right: -10 }, cursor: "nwse-resize" as const },
              { dir: { x: -1, y: 0 }, style: { top: "50%", left: -10, transform: "translateY(-50%)" }, cursor: "ew-resize" as const },
              { dir: { x:  1, y: 0 }, style: { top: "50%", right: -10, transform: "translateY(-50%)" }, cursor: "ew-resize" as const },
              { dir: { x: 0, y: -1 }, style: { left: "50%", top: -10, transform: "translateX(-50%)" }, cursor: "ns-resize" as const },
              { dir: { x: 0, y:  1 }, style: { left: "50%", bottom: -10, transform: "translateX(-50%)" }, cursor: "ns-resize" as const },
            ].map((h, i) => (
              <div
                key={i}
                onPointerDown={(e) => onHandleDown(e, h.dir as { x: -1 | 0 | 1; y: -1 | 0 | 1 })}
                onPointerMove={onHandleMove}
                onPointerUp={onHandleUp}
                onPointerCancel={onHandleUp}
                style={{
                  position: "absolute",
                  width: 20,
                  height: 20,
                  borderRadius: 999,
                  background: "#fff",
                  border: "2px solid #F26522",
                  cursor: h.cursor,
                  touchAction: "none",
                  ...h.style,
                }}
              />
            ))}
          </>
        )}
      </div>
    </>
  );
}
