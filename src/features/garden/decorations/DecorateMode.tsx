"use client";

// 마이룸 꾸미기 모드 — 마당 안의 소품을 탭→핸들 패턴으로 편집.
// - 본체 드래그 = 이동 (x/y %)
// - 우하단 ↘ 핸들 = 크기 (width%)
// - 두 손가락 핀치 = 선택된 소품/나무/아바타/몬스터 크기
// - 상단 ↻ 핸들 = 회전 (deg)
// - 🗑️/⬆/⬇ 플로팅 버튼 = 삭제, z-index up/down
// - 하단 서랍에서 활성 소품을 탭해 가운데에 추가
//   (유료 소품은 🔒 + 가격표 — 탭하면 구매 확인 모달)
// - 상단 우측 ✓ 저장 / ✕ 취소
// 저장 시 부모가 replaceYardLayoutAction 호출.

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  DecorationCategory,
  DecorationItem,
  StudentYardItem,
  SceneItemLayout,
  SceneLayout,
} from "@/lib/types";
import {
  DECORATION_CATEGORIES,
  DECORATION_CATEGORY_LABEL,
} from "@/lib/types";
import { BuyConfirmModal } from "@/features/garden/avatar/BuyConfirmModal";
import { buyDecorationAction, getYardShopContextAction } from "@/app/me/actions";

type SceneActorKey = "tree" | "avatar" | "monster";

type EditableItem = StudentYardItem;

type DragMode = "move" | "resize" | "rotate";

type DragTarget =
  | { type: "deco"; instanceId: string }
  | { type: "scene"; key: SceneActorKey };

type DragState = {
  target: DragTarget;
  mode: DragMode;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number; // %
  startY: number; // %
  startWidth: number; // %
  startRotation: number; // deg
  // 회전용 — 화면 px 기준 중심점 + 시작 각도(rad)
  centerX: number;
  centerY: number;
  startPointerAngleRad: number;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function normalizeAngle(deg: number): number {
  let n = deg % 360;
  if (n > 180) n -= 360;
  if (n <= -180) n += 360;
  return n;
}
function genInstanceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `inst-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

type TabKey = "all" | DecorationCategory;
const TABS: TabKey[] = ["all", ...DECORATION_CATEGORIES];
const TAB_LABEL: Record<TabKey, string> = {
  all: "전체",
  ...DECORATION_CATEGORY_LABEL,
};

export function DecorateMode({
  items,
  initialLayout,
  initialSceneLayout,
  treeNode,
  avatarNode,
  monsterNode,
  treeNaturalPx,
  avatarNaturalPx,
  monsterNaturalPx,
  cqminPx,
  onSave,
  onCancel,
}: {
  items: DecorationItem[];
  initialLayout: EditableItem[];
  initialSceneLayout: {
    tree: SceneItemLayout;
    avatar: SceneItemLayout;
    monster: SceneItemLayout;
  };
  treeNode: React.ReactNode;
  avatarNode: React.ReactNode | null;
  monsterNode: React.ReactNode | null;
  treeNaturalPx: number;
  avatarNaturalPx: number;
  monsterNaturalPx: number;
  cqminPx: number;
  onSave: (args: {
    layout: EditableItem[];
    sceneLayout: SceneLayout;
  }) => Promise<{ ok: boolean; message?: string }>;
  onCancel: () => void;
}) {
  const [layout, setLayout] = useState<EditableItem[]>(initialLayout);
  const [sceneLayout, setSceneLayout] = useState(initialSceneLayout);
  const [selectedId, setSelectedId] = useState<
    string | "scene:tree" | "scene:avatar" | "scene:monster" | null
  >(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [tab, setTab] = useState<TabKey>("all");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const yardRef = useRef<HTMLDivElement | null>(null);

  // ===== 구매 루프 — 보유 소품 + 포인트 잔액 =====
  const [ownedIds, setOwnedIds] = useState<Set<string> | null>(null); // null = 로딩 중
  const [balance, setBalance] = useState<number | null>(null);
  const [buyTarget, setBuyTarget] = useState<DecorationItem | null>(null);
  const [buyBusy, setBuyBusy] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getYardShopContextAction().then((r) => {
      if (cancelled) return;
      if (r.ok) {
        setOwnedIds(new Set(r.ownedItemIds));
        setBalance(r.totalPoints);
      } else {
        // 실패해도 무료 소품은 계속 사용 가능 — 유료는 잠금 유지.
        setOwnedIds(new Set());
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const isOwnedItem = (item: DecorationItem) =>
    (item.price ?? 0) <= 0 || (ownedIds !== null && ownedIds.has(item.id));

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const visibleItems = useMemo(() => {
    if (tab === "all") return items;
    return items.filter((i) => i.category === tab);
  }, [items, tab]);

  // 모서리/모바일에서 잘 보이도록 z 정렬 (시각만 — DB 는 z_index 그대로).
  const orderedLayout = useMemo(
    () => [...layout].sort((a, b) => a.z_index - b.z_index),
    [layout],
  );

  /* ============== 추가 / 삭제 / z-index ============== */

  const onAdd = (item: DecorationItem) => {
    const maxZ = layout.reduce((m, l) => Math.max(m, l.z_index), 0);
    const newItem: EditableItem = {
      id: `tmp-${Date.now()}`,
      student_id: "",
      decoration_item_id: item.id,
      instance_id: genInstanceId(),
      position_x: 50,
      position_y: 50,
      width_percent: clamp(item.default_width_percent, 1, 80),
      rotation: 0,
      z_index: maxZ + 1,
      placed_at: new Date().toISOString(),
    };
    setLayout((prev) => [...prev, newItem]);
    setSelectedId(newItem.instance_id);
  };

  // 서랍 탭 — 미보유 유료 소품이면 구매 확인 모달, 아니면 바로 추가.
  const onPick = (item: DecorationItem) => {
    if (!isOwnedItem(item)) {
      setBuyError(null);
      setBuyTarget(item);
      return;
    }
    onAdd(item);
  };

  const onBuyConfirm = () => {
    if (!buyTarget || buyBusy) return;
    const target = buyTarget;
    setBuyBusy(true);
    setBuyError(null);
    buyDecorationAction({ itemId: target.id }).then((r) => {
      setBuyBusy(false);
      if (!r.ok) {
        if (r.balance !== undefined) setBalance(r.balance);
        setBuyError(r.message);
        return;
      }
      // 구매 성공 — 즉시 해금 + 마당에 추가 + 잔액 갱신.
      setOwnedIds((prev) => {
        const next = new Set(prev ?? []);
        next.add(target.id);
        return next;
      });
      setBalance(r.newTotal);
      setBuyTarget(null);
      onAdd(target);
    });
  };

  const onDelete = (instanceId: string) => {
    setLayout((prev) => prev.filter((l) => l.instance_id !== instanceId));
    if (selectedId === instanceId) setSelectedId(null);
  };

  const onBumpZ = (instanceId: string, dir: 1 | -1) => {
    setLayout((prev) => {
      const cur = prev.find((l) => l.instance_id === instanceId);
      if (!cur) return prev;
      const next = cur.z_index + dir;
      return prev.map((l) =>
        l.instance_id === instanceId ? { ...l, z_index: clamp(next, 0, 9999) } : l,
      );
    });
  };

  /* ============== 두 손가락 핀치 = 크기 ==============
   * 마당 레이어(capture 단계)에서 모든 포인터를 추적. 두 번째 손가락이 내려오면
   * 선택된 소품/씬 액터의 크기를 두 포인터 거리 비율로 조절한다.
   * 자식 요소들이 stopPropagation 해도 capture 핸들러는 먼저 실행되므로 안전.
   */
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{
    active: boolean;
    startDist: number;
    startWidth: number;
    target:
      | { type: "deco"; instanceId: string }
      | { type: "scene"; key: SceneActorKey }
      | null;
  }>({ active: false, startDist: 0, startWidth: 0, target: null });

  const pointerDist = () => {
    const pts = Array.from(pointersRef.current.values());
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  };

  const onYardPointerDownCapture = (e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size !== 2 || !selectedId) return;
    const dist = pointerDist();
    if (dist <= 0) return;
    if (selectedId.startsWith("scene:")) {
      const key = selectedId.slice("scene:".length) as SceneActorKey;
      pinchRef.current = {
        active: true,
        startDist: dist,
        startWidth: sceneLayout[key].width,
        target: { type: "scene", key },
      };
    } else {
      const li = layout.find((l) => l.instance_id === selectedId);
      if (!li) return;
      pinchRef.current = {
        active: true,
        startDist: dist,
        startWidth: li.width_percent,
        target: { type: "deco", instanceId: selectedId },
      };
    }
    // 진행 중이던 단일 포인터 드래그는 취소 — 핀치 종료 후 점프 방지.
    setDrag(null);
  };

  const onYardPointerMoveCapture = (e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = pinchRef.current;
    if (!p.active || !p.target || pointersRef.current.size < 2) return;
    const dist = pointerDist();
    if (dist <= 0 || p.startDist <= 0) return;
    const factor = dist / p.startDist;
    if (p.target.type === "scene") {
      const key = p.target.key;
      const maxWidthByKey = key === "tree" ? 90 : 60; // 드래그 리사이즈와 동일 클램프
      const nextWidth = clamp(p.startWidth * factor, 5, maxWidthByKey);
      setSceneLayout((prev) => ({ ...prev, [key]: { ...prev[key], width: nextWidth } }));
    } else {
      const instanceId = p.target.instanceId;
      const nextWidth = clamp(p.startWidth * factor, 3, 80); // 드래그 리사이즈와 동일 클램프
      setLayout((prev) =>
        prev.map((l) => (l.instance_id === instanceId ? { ...l, width_percent: nextWidth } : l)),
      );
    }
  };

  const onYardPointerEndCapture = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2 && pinchRef.current.active) {
      pinchRef.current = { active: false, startDist: 0, startWidth: 0, target: null };
    }
  };

  /* ============== 포인터 드래그 ============== */

  const handlePointerDown = (
    e: React.PointerEvent<HTMLElement>,
    li: EditableItem,
    mode: DragMode,
  ) => {
    if (pinchRef.current.active) return; // 핀치 중엔 새 드래그 시작 안 함
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setSelectedId(li.instance_id);

    let centerX = 0;
    let centerY = 0;
    let startPointerAngleRad = 0;
    if (mode === "rotate") {
      const box = (e.currentTarget as HTMLElement).closest("[data-yarditem]") as HTMLElement | null;
      const rect = (box ?? (e.currentTarget as HTMLElement)).getBoundingClientRect();
      centerX = rect.left + rect.width / 2;
      centerY = rect.top + rect.height / 2;
      startPointerAngleRad = Math.atan2(e.clientY - centerY, e.clientX - centerX);
    }

    setDrag({
      target: { type: "deco", instanceId: li.instance_id },
      mode,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: li.position_x,
      startY: li.position_y,
      startWidth: li.width_percent,
      startRotation: li.rotation ?? 0,
      centerX,
      centerY,
      startPointerAngleRad,
    });
  };

  // 씬 액터(나무/아바타) 포인터 다운. rotation 은 미지원 — move / resize 만.
  const handleScenePointerDown = (
    e: React.PointerEvent<HTMLElement>,
    key: SceneActorKey,
    mode: "move" | "resize",
  ) => {
    if (pinchRef.current.active) return; // 핀치 중엔 새 드래그 시작 안 함
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setSelectedId(`scene:${key}`);
    const cur = sceneLayout[key];
    setDrag({
      target: { type: "scene", key },
      mode,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: cur.x,
      startY: cur.y,
      startWidth: cur.width,
      startRotation: 0,
      centerX: 0,
      centerY: 0,
      startPointerAngleRad: 0,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (pinchRef.current.active) return; // 핀치 중엔 드래그 이동 무시
    if (!drag || drag.pointerId !== e.pointerId) return;
    const yard = yardRef.current;
    if (!yard) return;
    const rect = yard.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const dxPct = ((e.clientX - drag.startClientX) / rect.width) * 100;
    const dyPct = ((e.clientY - drag.startClientY) / rect.height) * 100;
    // 리사이즈는 cqmin (짧은 변) 기준. 가로 모드면 height, 세로면 width.
    const minDimPx = Math.min(rect.width, rect.height);
    const dxCqmin = ((e.clientX - drag.startClientX) / minDimPx) * 100;

    if (drag.target.type === "scene") {
      const key = drag.target.key;
      // 자연 크기 차이 반영 — 트리는 크게, 아바타/몬스터는 중간.
      const maxWidthByKey = key === "tree" ? 90 : 60;
      setSceneLayout((prev) => {
        const cur = prev[key];
        if (drag.mode === "move") {
          return {
            ...prev,
            [key]: {
              ...cur,
              x: clamp(drag.startX + dxPct, 0, 100),
              y: clamp(drag.startY + dyPct, 0, 100),
            },
          };
        }
        if (drag.mode === "resize") {
          return {
            ...prev,
            [key]: { ...cur, width: clamp(drag.startWidth + dxCqmin, 5, maxWidthByKey) },
          };
        }
        return prev;
      });
      return;
    }

    // 데코레이션
    setLayout((prev) =>
      prev.map((l) => {
        if (drag.target.type !== "deco" || l.instance_id !== drag.target.instanceId) return l;
        if (drag.mode === "move") {
          return {
            ...l,
            position_x: clamp(drag.startX + dxPct, 0, 100),
            position_y: clamp(drag.startY + dyPct, 0, 100),
          };
        }
        if (drag.mode === "resize") {
          return {
            ...l,
            width_percent: clamp(drag.startWidth + dxCqmin, 3, 80),
          };
        }
        // rotate
        const currentAngleRad = Math.atan2(e.clientY - drag.centerY, e.clientX - drag.centerX);
        const deltaDeg = ((currentAngleRad - drag.startPointerAngleRad) * 180) / Math.PI;
        return {
          ...l,
          rotation: normalizeAngle(drag.startRotation + deltaDeg),
        };
      }),
    );
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLElement>) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setDrag(null);
  };
  const handlePointerCancel = handlePointerUp;

  /* ============== 저장 / 취소 ============== */

  const submit = async () => {
    setSaving(true);
    setError(null);
    // 좌표/회전 반올림 후 전송.
    const cleaned = layout.map((l) => ({
      ...l,
      position_x: round1(l.position_x),
      position_y: round1(l.position_y),
      width_percent: round1(l.width_percent),
      rotation: round1(l.rotation ?? 0),
    }));
    const cleanedScene: SceneLayout = {
      tree: {
        x: round1(sceneLayout.tree.x),
        y: round1(sceneLayout.tree.y),
        width: round1(sceneLayout.tree.width),
        flipX: !!sceneLayout.tree.flipX,
        rotation: round1(sceneLayout.tree.rotation ?? 0),
      },
      avatar: {
        x: round1(sceneLayout.avatar.x),
        y: round1(sceneLayout.avatar.y),
        width: round1(sceneLayout.avatar.width),
        flipX: !!sceneLayout.avatar.flipX,
        rotation: round1(sceneLayout.avatar.rotation ?? 0),
      },
      monster: {
        x: round1(sceneLayout.monster.x),
        y: round1(sceneLayout.monster.y),
        width: round1(sceneLayout.monster.width),
        flipX: !!sceneLayout.monster.flipX,
        rotation: round1(sceneLayout.monster.rotation ?? 0),
      },
    };
    const r = await onSave({ layout: cleaned, sceneLayout: cleanedScene });
    setSaving(false);
    if (!r.ok) {
      setError(r.message ?? "저장에 실패했어요.");
      return;
    }
  };

  /* ============== 렌더 ============== */

  const selectedDeco =
    selectedId && !selectedId.startsWith("scene:")
      ? layout.find((l) => l.instance_id === selectedId) ?? null
      : null;
  const selectedScene: SceneActorKey | null =
    selectedId === "scene:tree"
      ? "tree"
      : selectedId === "scene:avatar"
        ? "avatar"
        : selectedId === "scene:monster"
          ? "monster"
          : null;

  return (
    <>
      {/* 마당 위 편집 레이어 — 부모 yard 박스의 absolute 자리에 들어감 */}
      <div
        ref={yardRef}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 50,
          touchAction: "none",
        }}
        onPointerDownCapture={onYardPointerDownCapture}
        onPointerMoveCapture={onYardPointerMoveCapture}
        onPointerUpCapture={onYardPointerEndCapture}
        onPointerCancelCapture={onYardPointerEndCapture}
        onPointerDown={() => {
          // 빈 곳 탭 → 선택 해제. 단, 두 번째 손가락(핀치)은 해제 아님.
          if (pointersRef.current.size <= 1) setSelectedId(null);
        }}
      >
        {/* 씬 액터: 나무 */}
        <SceneActorEditable
          actorKey="tree"
          layout={sceneLayout.tree}
          naturalPx={treeNaturalPx}
          cqminPx={cqminPx}
          selected={selectedScene === "tree"}
          onPointerDown={handleScenePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          {treeNode}
        </SceneActorEditable>
        {/* 씬 액터: 아바타 (있을 때만) */}
        {avatarNode && (
          <SceneActorEditable
            actorKey="avatar"
            layout={sceneLayout.avatar}
            naturalPx={avatarNaturalPx}
            cqminPx={cqminPx}
            selected={selectedScene === "avatar"}
            onPointerDown={handleScenePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            {avatarNode}
          </SceneActorEditable>
        )}
        {/* 씬 액터: 활성 몬스터 (있을 때만) */}
        {monsterNode && (
          <SceneActorEditable
            actorKey="monster"
            layout={sceneLayout.monster}
            naturalPx={monsterNaturalPx}
            cqminPx={cqminPx}
            selected={selectedScene === "monster"}
            onPointerDown={handleScenePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            {monsterNode}
          </SceneActorEditable>
        )}

        {orderedLayout.map((li) => {
          const item = itemById.get(li.decoration_item_id);
          if (!item) return null;
          const isSelected = selectedId === li.instance_id;
          const isDragging =
            drag?.target.type === "deco" && drag.target.instanceId === li.instance_id;

          return (
            <div
              key={li.instance_id}
              data-yarditem={li.instance_id}
              style={{
                position: "absolute",
                left: `${li.position_x}%`,
                top: `${li.position_y}%`,
                // width 는 짧은 변(cqmin) 기준 — 가로/세로 모드 모두에서 같은 크기.
                width: `${li.width_percent}cqmin`,
                transform: `translate(-50%, -50%) rotate(${li.rotation}deg)`,
                zIndex: li.z_index + 1,
                cursor: isDragging ? "grabbing" : "grab",
              }}
              onPointerDown={(e) => handlePointerDown(e, li, "move")}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  outline: isSelected
                    ? "2px solid #f59e0b"
                    : "1px dashed rgba(255,255,255,0.4)",
                  outlineOffset: 2,
                  borderRadius: 4,
                  opacity: isDragging ? 0.9 : 1,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.image_url}
                  alt={item.name}
                  draggable={false}
                  className="w-full h-auto object-contain pointer-events-none"
                />

                {isSelected && (
                  <>
                    {/* 회전 핸들 — 상단 */}
                    <button
                      type="button"
                      aria-label="회전"
                      onPointerDown={(e) => handlePointerDown(e, li, "rotate")}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: "absolute",
                        top: -28,
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        background: "#38bdf8",
                        border: "2px solid white",
                        boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
                        color: "white",
                        fontSize: 12,
                        fontWeight: 700,
                        touchAction: "none",
                        cursor: "grab",
                      }}
                    >
                      ↻
                    </button>

                    {/* 리사이즈 핸들 — 우하단 */}
                    <button
                      type="button"
                      aria-label="크기 조절"
                      onPointerDown={(e) => handlePointerDown(e, li, "resize")}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: "absolute",
                        bottom: -10,
                        right: -10,
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        background: "#f59e0b",
                        border: "2px solid white",
                        boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
                        color: "white",
                        fontSize: 11,
                        fontWeight: 700,
                        touchAction: "none",
                        cursor: "nwse-resize",
                      }}
                    >
                      ↘
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 상단 우측 — 저장 / 취소 (마당 박스 기준) */}
      <div
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          zIndex: 60,
          display: "flex",
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="font-pretendard bg-white/95 backdrop-blur rounded-full text-gray-700 hover:bg-gray-100 transition shadow"
          style={{ fontSize: 12, fontWeight: 700, padding: "8px 14px" }}
        >
          ✕ 취소
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="font-pretendard bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white rounded-full transition shadow"
          style={{ fontSize: 12, fontWeight: 700, padding: "8px 14px" }}
        >
          {saving ? "저장 중…" : "✓ 저장"}
        </button>
      </div>

      {/* 선택된 소품 플로팅 액션바 (앞으로/뒤로/삭제) — 마당 박스 하단 */}
      {selectedDeco && (
        <div
          style={{
            position: "absolute",
            bottom: 10,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 60,
            display: "flex",
            gap: 6,
            background: "rgba(17, 24, 39, 0.92)",
            padding: "6px 8px",
            borderRadius: 999,
            boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
          }}
        >
          <ActionPill onClick={() => onBumpZ(selectedDeco.instance_id, -1)} label="⬇ 뒤로" />
          <ActionPill onClick={() => onBumpZ(selectedDeco.instance_id, 1)} label="⬆ 앞으로" />
          <ActionPill
            onClick={() => onDelete(selectedDeco.instance_id)}
            label="🗑️ 삭제"
            danger
          />
        </div>
      )}

      {/* 선택된 씬 액터(나무/아바타) 액션바 — 좌우반전 토글 + 회전 슬라이더 */}
      {selectedScene && (
        <div
          style={{
            position: "absolute",
            bottom: 10,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 60,
            background: "rgba(17, 24, 39, 0.92)",
            padding: "8px 12px",
            borderRadius: 16,
            boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
            color: "white",
            fontSize: 11,
            fontWeight: 700,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            minWidth: 220,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>
              {selectedScene === "tree"
                ? "🌳 나무"
                : selectedScene === "avatar"
                  ? "🧍 아바타"
                  : "🥚 몬스터"}
            </span>
            <button
              type="button"
              onClick={() => {
                setSceneLayout((prev) => ({
                  ...prev,
                  [selectedScene]: {
                    ...prev[selectedScene],
                    flipX: !prev[selectedScene].flipX,
                  },
                }));
              }}
              className="bg-white/15 hover:bg-white/25 transition rounded-full px-3 py-1 text-xs font-semibold"
            >
              🔄 좌우반전 {sceneLayout[selectedScene].flipX ? "ON" : "OFF"}
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.7)" }}>회전</span>
            <input
              type="range"
              min={-30}
              max={30}
              step={1}
              value={Math.round(sceneLayout[selectedScene].rotation ?? 0)}
              onChange={(e) => {
                const v = Number(e.target.value);
                setSceneLayout((prev) => ({
                  ...prev,
                  [selectedScene]: { ...prev[selectedScene], rotation: v },
                }));
              }}
              style={{ flex: 1, accentColor: "#f59e0b" }}
            />
            <span style={{ fontSize: 10, minWidth: 30, textAlign: "right" }}>
              {Math.round(sceneLayout[selectedScene].rotation ?? 0)}°
            </span>
            <button
              type="button"
              onClick={() => {
                setSceneLayout((prev) => ({
                  ...prev,
                  [selectedScene]: { ...prev[selectedScene], rotation: 0 },
                }));
              }}
              className="text-[10px] text-gray-300 hover:text-white"
              title="0° 로 초기화"
            >
              ↺
            </button>
          </div>
        </div>
      )}

      {/* 하단 서랍 — viewport 기준 fixed */}
      <DecorationDrawer
        items={visibleItems}
        tab={tab}
        onTab={setTab}
        onPick={onPick}
        isOwned={isOwnedItem}
        balance={balance}
      />

      {/* 유료 소품 구매 확인 모달 */}
      {buyTarget && (
        <BuyConfirmModal
          itemName={buyTarget.name}
          imageUrl={buyTarget.image_url}
          price={buyTarget.price}
          balance={balance}
          busy={buyBusy}
          errorMessage={buyError}
          onConfirm={onBuyConfirm}
          onCancel={() => {
            if (!buyBusy) {
              setBuyTarget(null);
              setBuyError(null);
            }
          }}
        />
      )}

      {error && (
        <div
          role="alert"
          className="fixed left-1/2 -translate-x-1/2 z-[100] bg-rose-600 text-white text-sm font-semibold px-4 py-2 rounded-full shadow-lg"
          style={{ bottom: 240 }}
        >
          {error}
        </div>
      )}
    </>
  );
}

function ActionPill({
  onClick,
  label,
  danger,
}: {
  onClick: () => void;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "px-3 py-1.5 rounded-full text-xs font-semibold transition",
        danger
          ? "bg-rose-500 hover:bg-rose-600 text-white"
          : "bg-white/15 hover:bg-white/25 text-white",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function DecorationDrawer({
  items,
  tab,
  onTab,
  onPick,
  isOwned,
  balance,
}: {
  items: DecorationItem[];
  tab: TabKey;
  onTab: (t: TabKey) => void;
  onPick: (item: DecorationItem) => void;
  isOwned: (item: DecorationItem) => boolean;
  balance: number | null;
}) {
  return (
    <div
      className="fixed left-0 right-0 bottom-0 z-[80] bg-white border-t border-gray-200 shadow-[0_-10px_30px_rgba(0,0,0,0.12)]"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="max-w-3xl mx-auto px-3 py-2">
        {/* 카테고리 탭 + 포인트 잔액 */}
        <div className="flex items-center gap-1 overflow-x-auto pb-2 -mx-1 px-1">
          {TABS.map((t) => {
            const active = t === tab;
            return (
              <button
                key={t}
                type="button"
                onClick={() => onTab(t)}
                className={[
                  "shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition",
                  active
                    ? "bg-amber-500 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200",
                ].join(" ")}
              >
                {TAB_LABEL[t]}
              </button>
            );
          })}
          {balance !== null && (
            <span className="ml-auto shrink-0 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5 tabular-nums">
              내 포인트 {balance} P
            </span>
          )}
        </div>

        {/* 소품 가로 스크롤 그리드 */}
        {items.length === 0 ? (
          <div className="text-center text-xs text-gray-400 py-6">
            이 카테고리에 사용할 수 있는 소품이 없어요.
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto py-2 -mx-1 px-1">
            {items.map((it) => {
              const locked = !isOwned(it);
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => onPick(it)}
                  className="shrink-0 w-20 flex flex-col items-center gap-1 bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-xl p-2 transition"
                >
                  <div className="w-14 h-14 flex items-center justify-center relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={it.image_url}
                      alt={it.name}
                      draggable={false}
                      className={[
                        "max-w-full max-h-full object-contain",
                        locked ? "opacity-40" : "",
                      ].join(" ")}
                    />
                    {locked && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
                        <span className="text-base leading-none" aria-hidden>🔒</span>
                        <span className="text-[10px] font-extrabold text-amber-300 bg-gray-900/90 rounded-full px-1.5 py-px tabular-nums">
                          {it.price} P
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] font-semibold text-gray-700 truncate w-full text-center">
                    {it.name}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <p className="text-center text-[10px] text-gray-400 pb-1">
          탭하면 마당 가운데에 추가돼요 · 소품을 탭하면 핸들 · 두 손가락 = 크기
        </p>
      </div>
    </div>
  );
}

function SceneActorEditable({
  actorKey,
  layout,
  naturalPx,
  cqminPx,
  selected,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  children,
}: {
  actorKey: SceneActorKey;
  layout: SceneItemLayout;
  naturalPx: number;
  cqminPx: number;
  selected: boolean;
  onPointerDown: (
    e: React.PointerEvent<HTMLElement>,
    key: SceneActorKey,
    mode: "move" | "resize",
  ) => void;
  onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void;
  children: React.ReactNode;
}) {
  const scale = cqminPx > 0 ? (layout.width * cqminPx) / naturalPx : 1;
  return (
    <div
      style={{
        position: "absolute",
        left: `${layout.x}%`,
        top: `${layout.y}%`,
        width: 0,
        height: 0,
        zIndex: actorKey === "tree" ? 10 : 11,
        cursor: "grab",
        touchAction: "none",
      }}
      onPointerDown={(e) => onPointerDown(e, actorKey, "move")}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <div
        style={{
          position: "absolute",
          left: -naturalPx / 2,
          top: -naturalPx / 2,
          width: naturalPx,
          height: naturalPx,
          transform: `scale(${scale * (layout.flipX ? -1 : 1)}, ${scale}) rotate(${layout.rotation ?? 0}deg)`,
          transformOrigin: "center",
          outline: selected ? "2px dashed #f59e0b" : "1px dashed rgba(255,255,255,0.4)",
          outlineOffset: 2,
          borderRadius: 8,
          pointerEvents: "auto",
        }}
      >
        {children}
        {selected && (
          <button
            type="button"
            aria-label={`${actorKey === "tree" ? "나무" : "아바타"} 크기 조절`}
            onPointerDown={(e) => {
              e.stopPropagation();
              onPointerDown(e, actorKey, "resize");
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              // 트리/아바타는 보통 yard 하단에 배치되므로 핸들을 우상단으로
              // (우하단으로 두면 yard overflow:hidden 에 잘리는 경우 많음).
              right: -10,
              top: -10,
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "#f59e0b",
              border: "2px solid white",
              boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
              color: "white",
              fontSize: 13,
              fontWeight: 700,
              touchAction: "none",
              cursor: "nesw-resize",
              // 핸들은 스케일 영향을 받지 않게 (역스케일)
              transform: `scale(${1 / Math.max(scale, 0.1)})`,
              transformOrigin: "top right",
            }}
          >
            ↗
          </button>
        )}
      </div>
    </div>
  );
}
