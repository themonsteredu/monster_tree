"use client";

// 학생 본인의 아바타를 편집하는 시트.
// 관리자 갤러리(base/outfit/hat/accessory)에서 슬롯마다 1개씩 골라 합성한다.
// 미리보기는 AvatarEditCanvas 로 즉시 반영. 저장 시 updateAvatarAction 호출.
//
// - 유료 아이템(price>0)은 🔒 + 가격표 — 탭하면 구매 확인 모달 (garden_shop_deduct).
// - 닫기/배경 탭 시 draft 가 저장본과 다르면(dirty) 자체 확인 모달로 유실 방지.
// - [위치 원래대로] = 슬롯 위치/크기만 기본값으로 (선택 아이템 유지)
//   [모두 벗기] = 모든 슬롯 비우기 (확인 모달)

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type {
  AvatarConfig,
  AvatarGalleryCategory,
  AvatarGalleryItem,
  AvatarGalleryItemPosition,
  AvatarGallerySlot,
  BackgroundConfig,
} from "@/lib/types";
import { getGallerySlotPosition, getGallerySlotUrl } from "@/lib/types";
import { AvatarEditCanvas } from "./AvatarEditCanvas";
import { BuyConfirmModal } from "./BuyConfirmModal";
import {
  updateAvatarAction,
  listGalleryItemsAction,
  buyAvatarItemAction,
} from "@/app/me/actions";

const GALLERY_CAT_LABELS: Record<AvatarGalleryCategory, string> = {
  base: "베이스",
  outfit: "상의",
  bottom: "하의",
  shoes: "신발",
  hair: "헤어",
  face: "얼굴표정",
  hat: "모자",
  accessory: "액세서리",
};

const GALLERY_CAT_ORDER: AvatarGalleryCategory[] = [
  "base",
  "hair",
  "face",
  "outfit",
  "bottom",
  "shoes",
  "hat",
  "accessory",
];

type Props = {
  open: boolean;
  initial: AvatarConfig;
  onClose: () => void;
  onSaved: (next: AvatarConfig) => void;
  // 학생의 현재 배경 — 미리보기 캔버스 배경으로 사용 (없으면 기존 크림).
  previewBackground?: BackgroundConfig | null;
};

function toGalleryDraft(cfg: AvatarConfig): AvatarConfig {
  if (cfg.kind === "gallery") return cfg;
  return { kind: "gallery" };
}

export function AvatarEditSheet({ open, initial, onClose, onSaved, previewBackground }: Props) {
  const [draft, setDraft] = useState<AvatarConfig>(() => toGalleryDraft(initial));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [galleryItems, setGalleryItems] = useState<AvatarGalleryItem[]>([]);
  const [galleryLoaded, setGalleryLoaded] = useState(false);
  // 보유 유료 아이템 id 집합 + 포인트 잔액 (구매 루프)
  const [ownedIds, setOwnedIds] = useState<Set<string>>(() => new Set());
  const [balance, setBalance] = useState<number | null>(null);
  // 구매 확인 모달 상태
  const [buyTarget, setBuyTarget] = useState<AvatarGalleryItem | null>(null);
  const [buyBusy, setBuyBusy] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  // 나가기/모두 벗기 확인 모달
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);
  const [confirmStripOpen, setConfirmStripOpen] = useState(false);
  // 카테고리별 펼침 상태 — 첫 번째 카테고리만 기본 펼침. 헤더 누르면 토글.
  // collapsed[cat] === false (명시) 일 때만 펼침. undefined/true 면 접힘.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => ({
    [GALLERY_CAT_ORDER[0]]: false,
  }));
  const toggleCategory = (cat: AvatarGalleryCategory) =>
    setCollapsed((prev) => ({
      ...prev,
      // 기본 접힘(undefined) → false(펼침). false(펼침) → true(접힘). true → false.
      [cat]: prev[cat] === false ? true : false,
    }));
  // 미리보기 캔버스에서 선택된 슬롯 (터치 조작 대상)
  const [selectedSlot, setSelectedSlot] = useState<AvatarGalleryCategory | null>(null);

  // 저장본 스냅샷 — dirty 판정용 (열릴 때/저장 성공 시 갱신).
  const savedSnapshotRef = useRef<string>(JSON.stringify(toGalleryDraft(initial)));

  useEffect(() => {
    if (!open) return;
    const base = toGalleryDraft(initial);
    setDraft(base);
    savedSnapshotRef.current = JSON.stringify(base);
    setError(null);
    setSelectedSlot(null);
    setConfirmLeaveOpen(false);
    setConfirmStripOpen(false);
    setBuyTarget(null);
  }, [open, initial]);

  useEffect(() => {
    if (!open || galleryLoaded) return;
    let cancelled = false;
    listGalleryItemsAction().then((r) => {
      if (cancelled) return;
      if (r.ok) {
        setGalleryItems(r.items as AvatarGalleryItem[]);
        setOwnedIds(new Set(r.ownedGalleryIds ?? []));
        setBalance(r.totalPoints ?? null);
      }
      setGalleryLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open, galleryLoaded]);

  const galleryPositions = useMemo(() => {
    const map: Record<string, AvatarGalleryItemPosition> = {};
    for (const it of galleryItems) {
      if (it.position) map[it.image_url] = it.position;
    }
    return map;
  }, [galleryItems]);

  if (!open) return null;

  const isDirty = () => JSON.stringify(draft) !== savedSnapshotRef.current;

  // 닫기 요청 — dirty 면 자체 확인 모달 (window.confirm 금지).
  const requestClose = () => {
    if (pending || buyBusy) return;
    if (isDirty()) {
      setConfirmLeaveOpen(true);
      return;
    }
    onClose();
  };

  const isOwned = (it: AvatarGalleryItem) => (it.price ?? 0) <= 0 || ownedIds.has(it.id);

  const setGallerySlot = (slot: AvatarGalleryCategory, url: string | undefined) => {
    if (draft.kind !== "gallery") {
      setDraft({ kind: "gallery", [slot]: url });
      return;
    }
    const next = { ...draft, [slot]: url };
    if (!url) delete (next as Record<string, unknown>)[slot];
    setDraft(next);
  };

  // 아이템 칩 탭 — 미보유 유료 아이템이면 구매 확인 모달, 아니면 장착.
  const onPickItem = (it: AvatarGalleryItem) => {
    if (!isOwned(it)) {
      setBuyError(null);
      setBuyTarget(it);
      return;
    }
    setGallerySlot(it.category, it.image_url);
  };

  const onBuyConfirm = () => {
    if (!buyTarget || buyBusy) return;
    const target = buyTarget;
    setBuyBusy(true);
    setBuyError(null);
    buyAvatarItemAction({ galleryId: target.id }).then((r) => {
      setBuyBusy(false);
      if (!r.ok) {
        if (r.balance !== undefined) setBalance(r.balance);
        setBuyError(r.message);
        return;
      }
      // 구매 성공 — 즉시 해금 + 장착 + 잔액 갱신.
      setOwnedIds((prev) => {
        const next = new Set(prev);
        next.add(target.id);
        return next;
      });
      setBalance(r.newTotal);
      setGallerySlot(target.category, target.image_url);
      setBuyTarget(null);
    });
  };

  // 슬롯의 position 만 갱신 (URL 은 유지). url 없으면 no-op.
  const setSlotPosition = (
    slot: AvatarGalleryCategory,
    nextPos: AvatarGalleryItemPosition,
  ) => {
    if (draft.kind !== "gallery") return;
    const current = (draft as Record<string, unknown>)[slot];
    const url = getGallerySlotUrl(current as AvatarGallerySlot | undefined);
    if (!url) return;
    const next = { ...draft, [slot]: { url, position: nextPos } };
    setDraft(next);
  };

  // 슬롯의 custom position 제거 → 관리자 기본값으로 복원 (URL 은 유지).
  const resetSlotPosition = (slot: AvatarGalleryCategory) => {
    if (draft.kind !== "gallery") return;
    const current = (draft as Record<string, unknown>)[slot];
    const url = getGallerySlotUrl(current as AvatarGallerySlot | undefined);
    if (!url) return;
    const next = { ...draft, [slot]: url };
    setDraft(next);
  };

  // [위치 원래대로] — 모든 슬롯의 위치/크기만 기본값으로 (선택 아이템 유지).
  const resetAllPositions = () => {
    if (draft.kind !== "gallery") return;
    const next: AvatarConfig = { kind: "gallery" };
    for (const cat of GALLERY_CAT_ORDER) {
      const url = getGallerySlotUrl(
        (draft as Record<string, unknown>)[cat] as AvatarGallerySlot | undefined,
      );
      if (url) (next as Record<string, unknown>)[cat] = url;
    }
    setDraft(next);
  };

  // [모두 벗기] — 모든 슬롯 비우기 (확인 모달 통과 후).
  const stripAllItems = () => {
    setDraft({ kind: "gallery" });
    setSelectedSlot(null);
    setConfirmStripOpen(false);
  };

  // 레이어 순서 변경 — 현재 effective zIndex 에서 ±1.
  const CATEGORY_DEFAULT_Z: Record<AvatarGalleryCategory, number> = {
    base: 1, bottom: 2, outfit: 3, shoes: 4, face: 5, hair: 6, accessory: 7, hat: 8,
  };
  const adjustZ = (slot: AvatarGalleryCategory, delta: number) => {
    if (draft.kind !== "gallery") return;
    const current = (draft as Record<string, unknown>)[slot];
    const url = getGallerySlotUrl(current as AvatarGallerySlot | undefined);
    if (!url) return;
    const customPos = getGallerySlotPosition(current as AvatarGallerySlot | undefined);
    const adminPos = galleryPositions[url];
    const base = customPos ?? adminPos ?? { x: 50, y: 50, scaleX: 100, scaleY: 100 };
    const currentZ = customPos?.zIndex ?? CATEGORY_DEFAULT_Z[slot];
    const nextZ = Math.min(20, Math.max(0, currentZ + delta));
    const nextPos: AvatarGalleryItemPosition = { ...base, zIndex: nextZ };
    setDraft({ ...draft, [slot]: { url, position: nextPos } });
  };

  const onSave = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateAvatarAction({ avatar: draft });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      savedSnapshotRef.current = JSON.stringify(result.avatar);
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
      onClick={requestClose}
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
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {balance !== null && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: "#3d2818",
                  background: "#fff5d6",
                  border: "1.5px solid #f0c050",
                  borderRadius: 999,
                  padding: "4px 10px",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                내 포인트 {balance} P
              </span>
            )}
            <button
              type="button"
              onClick={requestClose}
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
          <AvatarEditCanvas
            draft={draft}
            size={240}
            galleryPositions={galleryPositions}
            selectedSlot={selectedSlot}
            onSelectSlot={setSelectedSlot}
            onPositionChange={setSlotPosition}
            previewBackground={previewBackground}
          />
        </div>

        {/* 선택된 아이템 컨트롤 — 미리보기 캔버스에서 아이템 탭하면 표시 */}
        {selectedSlot && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              background: "#fff8e8",
              border: "1.5px solid #f1e8d8",
              borderRadius: 12,
              marginBottom: 12,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: "#3d2818" }}>
              선택: {GALLERY_CAT_LABELS[selectedSlot]}
            </span>
            <span style={{ fontSize: 10, color: "#8a6f52" }}>
              한 손가락 끌기 = 이동 / 두 손가락 = 크기
            </span>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              onClick={() => adjustZ(selectedSlot, -1)}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: "1.5px solid #d6c2a0",
                background: "#fff",
                color: "#3d2818",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
              aria-label="뒤로"
            >
              ⬇ 뒤로
            </button>
            <button
              type="button"
              onClick={() => adjustZ(selectedSlot, 1)}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: "1.5px solid #d6c2a0",
                background: "#fff",
                color: "#3d2818",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
              aria-label="앞으로"
            >
              ⬆ 앞으로
            </button>
            <button
              type="button"
              onClick={() => resetSlotPosition(selectedSlot)}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: "1.5px solid #d6c2a0",
                background: "#fff",
                color: "#8a6f52",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              원래대로
            </button>
          </div>
        )}

        {/* 갤러리 — 관리자가 올린 이미지에서 카테고리마다 1개씩 선택 */}
        <div style={{ marginBottom: 12 }}>
          {!galleryLoaded ? (
            <div style={{ padding: 16, textAlign: "center", color: "#9a8b6c", fontSize: 13 }}>
              갤러리를 불러오는 중...
            </div>
          ) : galleryItems.length === 0 ? (
            <div
              style={{
                padding: 16,
                background: "#fff5e6",
                border: "1.5px dashed #f0c050",
                borderRadius: 12,
                textAlign: "center",
                fontSize: 13,
                color: "#3d2818",
              }}
            >
              선생님이 아직 갤러리에 이미지를 올리지 않았어요.
            </div>
          ) : (
            GALLERY_CAT_ORDER.map((cat) => {
              // 스타일 기준 이미지(is_style_ref)는 학생 착용 목록에서 제외.
              const inCat = galleryItems.filter((it) => it.category === cat && !it.is_style_ref);
              const slotValue =
                draft.kind === "gallery"
                  ? ((draft as Record<string, unknown>)[cat] as AvatarGallerySlot | undefined)
                  : undefined;
              const selectedUrl = getGallerySlotUrl(slotValue);
              const isOpen = collapsed[cat] === false; // 첫 카테고리만 기본 펼침. 명시적으로 false 일 때만 펼침.
              return (
                <div key={cat} style={{ marginBottom: 10 }}>
                  {/* 카테고리 헤더 — 클릭하면 접기/펼치기 */}
                  <button
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      padding: "10px 12px",
                      background: "#fff",
                      border: "1.5px solid #e8d8b8",
                      borderRadius: 10,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#3d2818" }}>
                        {GALLERY_CAT_LABELS[cat]}
                      </span>
                      {selectedUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={selectedUrl}
                          alt=""
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 4,
                            objectFit: "contain",
                            background: "#fff5e6",
                            border: "1px solid #e8d8b8",
                          }}
                        />
                      ) : (
                        <span style={{ fontSize: 11, color: "#9a8b6c" }}>(선택 안함)</span>
                      )}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 11, color: "#9a8b6c" }}>{inCat.length}개</span>
                      <span
                        style={{
                          fontSize: 10,
                          color: "#9a8b6c",
                          transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
                          transition: "transform 200ms ease",
                          display: "inline-block",
                        }}
                        aria-hidden
                      >
                        ▼
                      </span>
                    </span>
                  </button>
                  {!isOpen ? null : inCat.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#9a8b6c", padding: "8px 12px" }}>
                      이 카테고리에 항목 없음
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(70px, 1fr))",
                        gap: 6,
                        marginTop: 6,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setGallerySlot(cat, undefined)}
                        style={{
                          aspectRatio: "1",
                          border: !selectedUrl ? "2px solid #F26522" : "1.5px solid #d6c2a0",
                          background: "#fff5d6",
                          color: "#3d2818",
                          borderRadius: 8,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: "pointer",
                          alignSelf: "start",
                        }}
                      >
                        선택 안함
                      </button>
                      {inCat.map((it) => {
                        const isActive = selectedUrl === it.image_url;
                        const locked = !isOwned(it);
                        return (
                          <button
                            key={it.id}
                            type="button"
                            onClick={() => onPickItem(it)}
                            style={{
                              border: isActive ? "2px solid #F26522" : "1.5px solid #d6c2a0",
                              background: "#fff",
                              borderRadius: 8,
                              padding: 2,
                              cursor: "pointer",
                              overflow: "hidden",
                              position: "relative",
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "stretch",
                              alignSelf: "start",
                            }}
                            title={it.label ?? ""}
                          >
                            <div style={{ aspectRatio: "1", position: "relative", width: "100%" }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={it.image_url}
                                alt={it.label ?? ""}
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  objectFit: "contain",
                                  display: "block",
                                  opacity: locked ? 0.45 : 1,
                                }}
                              />
                              {locked && (
                                <div
                                  style={{
                                    position: "absolute",
                                    inset: 0,
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 2,
                                  }}
                                >
                                  <span style={{ fontSize: 16 }} aria-hidden>🔒</span>
                                  <span
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 800,
                                      background: "#3d2818",
                                      color: "#ffd873",
                                      padding: "1px 6px",
                                      borderRadius: 999,
                                      fontVariantNumeric: "tabular-nums",
                                    }}
                                  >
                                    {it.price} P
                                  </span>
                                </div>
                              )}
                            </div>
                            {it.label ? (
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 600,
                                  color: "#8a6f52",
                                  textAlign: "center",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  padding: "1px 2px 2px",
                                }}
                              >
                                {it.label}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  )}

                </div>
              );
            })
          )}
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
            onClick={resetAllPositions}
            disabled={pending}
            style={{
              flex: 1,
              padding: "12px 0",
              border: "1.5px solid #d6c2a0",
              background: "#fff",
              color: "#8a6f52",
              borderRadius: 10,
              fontWeight: 600,
              cursor: pending ? "default" : "pointer",
              fontSize: 12,
            }}
          >
            위치 원래대로
          </button>
          <button
            type="button"
            onClick={() => setConfirmStripOpen(true)}
            disabled={pending}
            style={{
              flex: 1,
              padding: "12px 0",
              border: "1.5px solid #f5cdc4",
              background: "#fff",
              color: "#b04020",
              borderRadius: 10,
              fontWeight: 600,
              cursor: pending ? "default" : "pointer",
              fontSize: 12,
            }}
          >
            모두 벗기
          </button>
          <button
            type="button"
            onClick={requestClose}
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
              fontSize: 13,
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

      {/* 저장 안 하고 나가기 확인 */}
      {confirmLeaveOpen && (
        <ConfirmModal
          message="저장하지 않고 나갈까요?"
          detail="바뀐 내용이 사라져요."
          confirmLabel="나가기"
          cancelLabel="계속 꾸미기"
          danger
          onConfirm={() => {
            setConfirmLeaveOpen(false);
            onClose();
          }}
          onCancel={() => setConfirmLeaveOpen(false)}
        />
      )}

      {/* 모두 벗기 확인 */}
      {confirmStripOpen && (
        <ConfirmModal
          message="아이템을 모두 벗을까요?"
          detail="구매한 아이템은 사라지지 않아요 — 언제든 다시 입을 수 있어요."
          confirmLabel="모두 벗기"
          cancelLabel="취소"
          danger
          onConfirm={stripAllItems}
          onCancel={() => setConfirmStripOpen(false)}
        />
      )}

      {/* 유료 아이템 구매 확인 */}
      {buyTarget && (
        <BuyConfirmModal
          itemName={buyTarget.label ?? GALLERY_CAT_LABELS[buyTarget.category]}
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
    </div>
  );
}

// 자체 확인 모달 — window.confirm 대체. 시트 위(z 300)에 뜬다.
function ConfirmModal({
  message,
  detail,
  confirmLabel,
  cancelLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  message: string;
  detail?: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={message}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(61,40,24,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 300,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onCancel();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fffaf2",
          border: "2px solid #e8d8b8",
          borderRadius: 18,
          padding: "20px 18px",
          width: "100%",
          maxWidth: 300,
          textAlign: "center",
          boxShadow: "0 20px 60px rgba(61,40,24,0.35)",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 800, color: "#3d2818", marginBottom: 6 }}>
          {message}
        </div>
        {detail && (
          <div style={{ fontSize: 12, fontWeight: 600, color: "#8a6f52", marginBottom: 14, lineHeight: 1.5 }}>
            {detail}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1,
              padding: "11px 0",
              border: "1.5px solid #d6c2a0",
              background: "#fff",
              color: "#3d2818",
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              flex: 1,
              padding: "11px 0",
              border: "none",
              background: danger ? "#b04020" : "#F26522",
              color: "#fff",
              borderRadius: 10,
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
