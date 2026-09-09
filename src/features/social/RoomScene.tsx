"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { fitRoomPlacement, FURNITURE_CATALOG, MAX_ROOM_FURNITURE, ROOM_THEMES, type FurnitureId, type FurniturePlacement, type HomeConfig } from "@/lib/social/model";
import { FurnitureArt } from "./FurnitureArt";
import styles from "./RoomScene.module.css";

type RoomSceneProps = {
  home: HomeConfig;
  ownerName: string;
  editing: boolean;
  onChange?: (home: HomeConfig) => void;
  onMove?: (position: { x: number; y: number }) => void;
  children?: ReactNode;
};

type Gesture = {
  pointerId: number;
  item: FurniturePlacement;
  startX: number;
  startY: number;
  pending?: FurniturePlacement;
  frame?: number;
};

const itemKey = (item: FurniturePlacement) => item.instanceId ?? item.id;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const fitPlacement = fitRoomPlacement;

const ROOM_MATERIALS: Record<HomeConfig["theme"], { src: string; label: string; color: string }> = {
  cream: { src: "/tree/block-world/room-oak-v1.png", label: "참나무", color: "#b97b32" },
  sage: { src: "/tree/block-world/room-spruce-v1.png", label: "숲속 목재", color: "#627847" },
  lilac: { src: "/tree/block-world/room-stone-v1.png", label: "돌 벽돌", color: "#919091" },
  peach: { src: "/tree/block-world/room-acacia-v1.png", label: "아카시아", color: "#bb602c" },
};

function DirectionIcon({ direction }: { direction: "up" | "down" | "left" | "right" }) {
  const arrow = { up: "↑", right: "→", down: "↓", left: "←" }[direction];
  return <span className={styles.directionIcon} aria-hidden="true">{arrow}</span>;
}

function RoomArchitecture({ theme }: { theme: HomeConfig["theme"] }) {
  const material = ROOM_MATERIALS[theme] ?? ROOM_MATERIALS.cream;
  return <Image className={styles.architecture} src={material.src} alt="" fill
    sizes="(max-width: 700px) calc(100vw - 44px), 688px" quality={85} draggable={false} />;
}

export function RoomScene({ home, ownerName, editing, onChange, onMove, children }: RoomSceneProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [category, setCategory] = useState("전체");
  const [search, setSearch] = useState("");
  const undoRef = useRef<HomeConfig[]>([]);
  const redoRef = useRef<HomeConfig[]>([]);
  const [, refreshHistory] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const homeRef = useRef(home);
  const onChangeRef = useRef(onChange);
  const canEdit = editing && Boolean(onChange);
  const canEditRef = useRef(canEdit);
  homeRef.current = home;
  onChangeRef.current = onChange;
  canEditRef.current = canEdit;

  const selectedItem = home.furniture.find((entry) => itemKey(entry) === selectedId);
  const selectedDefinition = FURNITURE_CATALOG.find((entry) => entry.id === selectedItem?.id);

  const checkpoint = () => {
    undoRef.current = [...undoRef.current.slice(-39), homeRef.current];
    redoRef.current = [];
    refreshHistory(n => n + 1);
  };
  const travel = (direction: "undo" | "redo") => {
    if (!canEditRef.current) return;
    finishGesture(false);
    const source = direction === "undo" ? undoRef : redoRef;
    const target = direction === "undo" ? redoRef : undoRef;
    const previous = source.current.pop();
    if (!previous) return;
    target.current.push(homeRef.current);
    updateHome(previous, false);
    refreshHistory(n => n + 1);
  };
  const updateHome = (next: HomeConfig, record = true) => {
    if (!canEditRef.current) return;
    if (record) checkpoint();
    homeRef.current = next;
    onChangeRef.current?.(next);
  };

  const moveFurniture = (item: FurniturePlacement, record = true) => {
    const next = fitPlacement(item);
    updateHome({ ...homeRef.current, furniture: homeRef.current.furniture.map((entry) => itemKey(entry) === itemKey(next) ? next : entry) }, record);
  };

  const finishGesture = (flush: boolean) => {
    const gesture = gestureRef.current;
    if (!gesture) return;
    if (gesture.frame != null) cancelAnimationFrame(gesture.frame);
    gestureRef.current = null;
    if (flush && gesture.pending) moveFurniture(gesture.pending, false);
  };

  useEffect(() => {
    if (!canEdit) {
      undoRef.current = [];
      redoRef.current = [];
      const gesture = gestureRef.current;
      if (gesture?.frame != null) cancelAnimationFrame(gesture.frame);
      gestureRef.current = null;
      setSelectedId(null);
    }
  }, [canEdit]);

  useEffect(() => () => {
    const gesture = gestureRef.current;
    if (gesture?.frame != null) cancelAnimationFrame(gesture.frame);
    gestureRef.current = null;
  }, []);

  const startDrag = (event: PointerEvent<HTMLButtonElement>, item: FurniturePlacement) => {
    if (!canEdit || event.button !== 0 || gestureRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedId(itemKey(item));
    gestureRef.current = { pointerId: event.pointerId, item: { ...item }, startX: event.clientX, startY: event.clientY };
  };

  const drag = (event: PointerEvent<HTMLButtonElement>) => {
    const gesture = gestureRef.current;
    if (!canEdit || !gesture || event.pointerId !== gesture.pointerId) return;
    event.stopPropagation();
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (!gesture.pending && Math.hypot(dx, dy) < 3) return;
    if (!gesture.pending) checkpoint();
    gesture.pending = { ...gesture.item, x: gesture.item.x + dx / rect.width * 100, y: gesture.item.y + dy / rect.height * 100 };
    if (gesture.frame != null) return;
    gesture.frame = requestAnimationFrame(() => {
      gesture.frame = undefined;
      if (gestureRef.current === gesture && gesture.pending && canEditRef.current) moveFurniture(gesture.pending, false);
    });
  };

  const endDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (gestureRef.current?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    finishGesture(true);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const nudge = (id: string, dx: number, dy: number) => {
    finishGesture(true);
    const item = homeRef.current.furniture.find((entry) => itemKey(entry) === id);
    if (item) moveFurniture({ ...item, x: item.x + dx, y: item.y + dy });
  };

  const removeFurniture = (id: string) => {
    finishGesture(false);
    const removed = homeRef.current.furniture.find(entry => itemKey(entry) === id);
    updateHome({ ...homeRef.current, furniture: homeRef.current.furniture.filter((entry) => itemKey(entry) !== id) });
    setSelectedId(null);
    setAnnouncement(`${FURNITURE_CATALOG.find((entry) => entry.id === removed?.id)?.label ?? "소품"}를 보관했어요.`);
  };

  const addFurniture = (id: FurnitureId, source?: FurniturePlacement) => {
    finishGesture(true);
    if (homeRef.current.furniture.length >= MAX_ROOM_FURNITURE) {
      setAnnouncement("한 방에 48개까지 놓을 수 있어요."); return;
    }
    const instanceId = crypto.randomUUID();
    const item = fitPlacement({ id, x: 50, y: 78, ...source, instanceId,
      ...(source ? { x: source.x + 3, y: source.y + 2 } : {}) });
    updateHome({ ...homeRef.current, furniture: [...homeRef.current.furniture, item] });
    setSelectedId(instanceId);
    setAnnouncement(`${FURNITURE_CATALOG.find(entry => entry.id === id)?.label}를 놓았어요.`);
  };
  const changeSelected = (patch: Partial<FurniturePlacement>) => {
    if (selectedItem) moveFurniture({ ...selectedItem, ...patch });
  };
  const reorder = (front: boolean) => {
    if (!selectedItem) return;
    const ordered = [...homeRef.current.furniture].sort((a,b) => (a.layer ?? (a.id === "rug" ? 1 : a.y)) - (b.layer ?? (b.id === "rug" ? 1 : b.y)));
    const remaining = ordered.filter(item => itemKey(item) !== selectedId);
    const furniture = (front ? [...remaining, selectedItem] : [selectedItem, ...remaining]).map((item, layer) => ({ ...item, layer: layer + 2 }));
    updateHome({ ...homeRef.current, furniture });
  };

  return <section className={styles.room} aria-label={`${ownerName}의 방`}>
    <div
      ref={stageRef}
      className={`${styles.stage} ${canEdit ? styles.editing : ""}`}
      onClick={(event) => {
        if (canEdit || editing || !onMove) return;
        if ((event.target as HTMLElement).closest("button, a, input, select, textarea, [role='button']")) return;
        const rect = event.currentTarget.getBoundingClientRect();
        onMove({ x: clamp((event.clientX - rect.left) / rect.width * 100, 10, 90), y: clamp((event.clientY - rect.top) / rect.height * 100, 55, 90) });
      }}
    >
      <RoomArchitecture theme={home.theme} />
      <div className={styles.roomTag} aria-hidden="true"><span className={styles.tagDot} />{canEdit ? "블록 집을 꾸미는 중" : "나만의 블록 하우스"}</div>
      {home.furniture.map((item) => {
        const definition = FURNITURE_CATALOG.find((entry) => entry.id === item.id);
        if (!definition) return null;
        const selected = canEdit && itemKey(item) === selectedId;
        return <div
          key={itemKey(item)}
          className={`${styles.furniture} ${selected ? styles.selected : ""}`}
          style={{ left: `${item.x}%`, top: `${item.y}%`, width: `${definition.width * (item.scale ?? 1)}%`, height: `${definition.height * (item.scale ?? 1)}%`, transform: `translate(-50%, -100%) rotate(${item.rotation ?? 0}deg)`, transformOrigin: "50% 50%", zIndex: selected ? 119 : item.layer ?? (item.id === "rug" ? 1 : Math.round(item.y)) }}
        >
          <div className={styles.sprite} style={{ transform: `scaleX(${item.flipX ? -1 : 1})` }}><FurnitureArt id={item.id} className={styles.sprite} /></div>
          {canEdit && <button
            type="button"
            className={styles.furnitureHit}
            aria-label={`${definition.label} 선택 및 이동. 방향키로 이동, Delete 키로 보관`}
            aria-pressed={selected}
            onClick={(event) => { event.stopPropagation(); setSelectedId(itemKey(item)); }}
            onPointerDown={(event) => startDrag(event, item)}
            onPointerMove={drag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
            onKeyDown={(event) => {
              const directions: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
              const direction = directions[event.key];
              if (direction) {
                event.preventDefault(); event.stopPropagation(); setSelectedId(itemKey(item));
                const step = event.shiftKey ? 5 : 2;
                nudge(itemKey(item), direction[0] * step, direction[1] * step);
              } else if (event.key === "Delete" || event.key === "Backspace") {
                event.preventDefault(); event.stopPropagation(); removeFurniture(itemKey(item));
              } else if (event.key === "Escape") {
                event.preventDefault(); event.stopPropagation(); finishGesture(true); setSelectedId(null);
              }
            }}
          />}
        </div>;
      })}
      <div className={styles.actors}>{children}</div>
      <div className={styles.ownerPlaque}>{ownerName}<span>의 방</span></div>
    </div>

    {canEdit ? <div className={styles.workshop}>
      <div className={styles.workshopHeading}><div><span className={styles.eyebrow}>BUILD MODE</span><h3>블록으로 채우는 내 집</h3></div><span className={styles.itemCount}>{home.furniture.length} / {MAX_ROOM_FURNITURE}</span></div>
      <div className={styles.themeRow} role="group" aria-label="집의 벽 재료">
        {ROOM_THEMES.map((entry) => <button key={entry.id} type="button" className={`${styles.theme} ${home.theme === entry.id ? styles.activeTheme : ""}`} aria-pressed={home.theme === entry.id} onClick={() => updateHome({ ...homeRef.current, theme: entry.id })}>
          <span className={styles.swatch} style={{ background: ROOM_MATERIALS[entry.id].color }}>{home.theme === entry.id && <span aria-hidden="true">✓</span>}</span>
          <span>{ROOM_MATERIALS[entry.id].label}</span>
        </button>)}
      </div>
      <div className={styles.editorTools}>
        <button type="button" disabled={!undoRef.current.length} onClick={() => travel("undo")}>↶ 실행 취소</button>
        <button type="button" disabled={!redoRef.current.length} onClick={() => travel("redo")}>↷ 다시 실행</button>
        <input aria-label="소품 검색" placeholder="43종 소품 검색" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className={styles.categoryRow} role="group" aria-label="소품 종류">
        {["전체", "거실", "주방", "정원", "캠핑", "취미"].map(value => <button key={value} type="button" aria-pressed={category === value} onClick={() => setCategory(value)}>{value}</button>)}
      </div>
      <div className={styles.catalog} role="group" aria-label="가구 보관함">
        {FURNITURE_CATALOG.filter(entry => (category === "전체" || (entry.category ?? "거실") === category) && entry.label.includes(search.trim())).map((entry) => {
          const placed = home.furniture.some((item) => item.id === entry.id);
          return <button key={entry.id} type="button" className={`${styles.catalogItem} ${selectedItem?.id === entry.id ? styles.catalogSelected : ""}`} aria-pressed={selectedItem?.id === entry.id} aria-label={`${entry.label} 하나 더 놓기`} disabled={home.furniture.length >= MAX_ROOM_FURNITURE} onClick={() => addFurniture(entry.id)}>
            <span className={styles.catalogArt}><FurnitureArt id={entry.id} className={styles.sprite} catalog /></span>
            <span className={styles.catalogName}>{entry.label}</span>
            <span className={`${styles.catalogStatus} ${placed ? styles.placed : ""}`}>{placed ? "+ 하나 더" : "+ 놓기"}</span>
          </button>;
        })}
      </div>
      {selectedItem && selectedDefinition ? <div className={styles.selectedControls}>
        <div className={styles.selectionTitle}><span className={styles.selectionDot} /><strong>{selectedDefinition.label}</strong><span>어디에 둘까?</span></div>
        <div className={styles.editorTools}>
          <label>회전 {selectedItem.rotation ?? 0}°<input aria-label="소품 회전" type="range" min={-180} max={180} step={5} value={selectedItem.rotation ?? 0} onChange={e => changeSelected({ rotation: Number(e.target.value) })} /></label>
          <label>크기 {Math.round((selectedItem.scale ?? 1) * 100)}%<input aria-label="소품 크기" type="range" min={40} max={160} step={5} value={(selectedItem.scale ?? 1)*100} onChange={e => changeSelected({ scale: Number(e.target.value)/100 })} /></label>
          <button type="button" aria-pressed={!!selectedItem.flipX} onClick={() => changeSelected({ flipX: !selectedItem.flipX })}>↔ 좌우반전</button>
          <button type="button" disabled={home.furniture.length >= MAX_ROOM_FURNITURE} onClick={() => addFurniture(selectedItem.id, selectedItem)}>＋ 복제</button>
          <button type="button" onClick={() => reorder(false)}>맨 뒤로</button>
          <button type="button" onClick={() => reorder(true)}>맨 앞으로</button>
          <button type="button" onClick={() => changeSelected({ rotation: 0, scale: 1, flipX: false })}>각도·크기 초기화</button>
        </div>
        <div className={styles.controlRow}>
          <div className={styles.nudges} role="group" aria-label={`${selectedDefinition.label} 위치 조절`}>
            {([{ direction: "left", dx: -2, dy: 0, label: "왼쪽으로" }, { direction: "up", dx: 0, dy: -2, label: "위로" }, { direction: "down", dx: 0, dy: 2, label: "아래로" }, { direction: "right", dx: 2, dy: 0, label: "오른쪽으로" }] as const).map(({ direction, dx, dy, label }) => <button key={direction} type="button" className={styles.nudge} aria-label={`${selectedDefinition.label} ${label} 옮기기`} onClick={() => nudge(itemKey(selectedItem), dx, dy)}><DirectionIcon direction={direction} /></button>)}
          </div>
          <button className={styles.storeButton} type="button" onClick={() => removeFurniture(itemKey(selectedItem))} aria-label={`${selectedDefinition.label} 보관함으로 돌려놓기`}><span className={styles.storageIcon} aria-hidden="true">▣</span>보관</button>
        </div>
      </div> : <p className={styles.hint}><span aria-hidden="true">✦</span> 가구를 고른 뒤 끌거나 방향 버튼으로 옮겨봐.</p>}
      <div className={styles.visitsRow}><div><strong>친구에게 문 열어두기</strong><p>친구들이 내 방에 놀러 올 수 있어요.</p></div><button type="button" className={`${styles.toggle} ${home.allowVisits ? styles.toggleOn : ""}`} role="switch" aria-checked={home.allowVisits} aria-label="친구 방문 허용" onClick={() => updateHome({ ...homeRef.current, allowVisits: !homeRef.current.allowVisits })}><span /></button></div>
    </div> : onMove ? <p className={styles.walkHint}><span className={styles.walkIcon} aria-hidden="true">↗</span>바닥을 누르면 그곳으로 걸어가요</p> : null}
    <span className={styles.srOnly} role="status" aria-live="polite">{announcement}</span>
  </section>;
}
