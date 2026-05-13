"use client";

// 학생 본인의 아바타를 편집하는 시트.
// 관리자 갤러리(base/outfit/hat/accessory)에서 슬롯마다 1개씩 골라 합성한다.
// 미리보기는 AvatarFigure 로 즉시 반영. 저장 시 updateAvatarAction 호출.

import { useEffect, useState, useTransition } from "react";
import type {
  AvatarConfig,
  AvatarGalleryCategory,
  AvatarGalleryItem,
  AvatarGallerySlotValue,
} from "@/lib/types";
import { AvatarFigure } from "./AvatarFigure";
import { updateAvatarAction, listGalleryItemsAction } from "@/app/me/actions";

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
};

function toGalleryDraft(cfg: AvatarConfig): AvatarConfig {
  if (cfg.kind === "gallery") return cfg;
  return { kind: "gallery" };
}

export function AvatarEditSheet({ open, initial, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<AvatarConfig>(() => toGalleryDraft(initial));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [galleryItems, setGalleryItems] = useState<AvatarGalleryItem[]>([]);
  const [galleryLoaded, setGalleryLoaded] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(toGalleryDraft(initial));
    setError(null);
  }, [open, initial]);

  useEffect(() => {
    if (!open || galleryLoaded) return;
    let cancelled = false;
    listGalleryItemsAction().then((r) => {
      if (cancelled) return;
      if (r.ok) setGalleryItems(r.items as AvatarGalleryItem[]);
      setGalleryLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open, galleryLoaded]);

  if (!open) return null;

  // 슬롯에 항목을 끼울 때 항목의 현재 위치 메타데이터를 함께 스냅샷.
  // (관리자가 나중에 위치를 바꿔도 이미 선택한 학생 아바타는 그 시점의 위치 유지.)
  const setGallerySlot = (slot: AvatarGalleryCategory, item: AvatarGalleryItem | null) => {
    const value: AvatarGallerySlotValue | undefined = item
      ? { url: item.image_url, ...(item.position && { position: item.position }) }
      : undefined;
    if (draft.kind !== "gallery") {
      setDraft({ kind: "gallery", ...(value && { [slot]: value }) });
      return;
    }
    const next = { ...draft, [slot]: value };
    if (!value) delete (next as Record<string, unknown>)[slot];
    setDraft(next);
  };

  const slotUrl = (slot: AvatarGalleryCategory): string | undefined => {
    if (draft.kind !== "gallery") return undefined;
    const v = (draft as Record<string, unknown>)[slot];
    if (typeof v === "string") return v;
    if (v && typeof v === "object" && typeof (v as { url?: unknown }).url === "string") {
      return (v as { url: string }).url;
    }
    return undefined;
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
              const inCat = galleryItems.filter((it) => it.category === cat);
              const selected = slotUrl(cat);
              return (
                <div key={cat} style={{ marginBottom: 14 }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#9a8b6c",
                      marginBottom: 6,
                      fontWeight: 700,
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>{GALLERY_CAT_LABELS[cat]}</span>
                    <span>{inCat.length}개</span>
                  </div>
                  {inCat.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#9a8b6c", padding: 8 }}>
                      이 카테고리에 항목 없음
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(70px, 1fr))",
                        gap: 6,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setGallerySlot(cat, null)}
                        style={{
                          aspectRatio: "1",
                          border: !selected ? "2px solid #F26522" : "1.5px solid #d6c2a0",
                          background: "#fff5d6",
                          color: "#3d2818",
                          borderRadius: 8,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        선택 안함
                      </button>
                      {inCat.map((it) => {
                        const isActive = selected === it.image_url;
                        return (
                          <button
                            key={it.id}
                            type="button"
                            onClick={() => setGallerySlot(cat, it)}
                            style={{
                              aspectRatio: "1",
                              border: isActive ? "2px solid #F26522" : "1.5px solid #d6c2a0",
                              background: "#fff",
                              borderRadius: 8,
                              padding: 2,
                              cursor: "pointer",
                              overflow: "hidden",
                              position: "relative",
                            }}
                            title={it.label ?? ""}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={it.image_url}
                              alt={it.label ?? ""}
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "contain",
                                display: "block",
                              }}
                            />
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
