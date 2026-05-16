"use client";

// 학생 본인의 아바타를 편집하는 시트.
// 관리자 갤러리(base/outfit/hat/accessory)에서 슬롯마다 1개씩 골라 합성한다.
// 미리보기는 AvatarFigure 로 즉시 반영. 저장 시 updateAvatarAction 호출.

import { useEffect, useMemo, useState, useTransition } from "react";
import type {
  AvatarConfig,
  AvatarGalleryCategory,
  AvatarGalleryItem,
  AvatarGalleryItemPosition,
  AvatarGallerySlot,
} from "@/lib/types";
import { getGallerySlotUrl } from "@/lib/types";
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
  onReset?: () => void;
};

function toGalleryDraft(cfg: AvatarConfig): AvatarConfig {
  if (cfg.kind === "gallery") return cfg;
  return { kind: "gallery" };
}

export function AvatarEditSheet({ open, initial, onClose, onSaved, onReset }: Props) {
  const [draft, setDraft] = useState<AvatarConfig>(() => toGalleryDraft(initial));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [galleryItems, setGalleryItems] = useState<AvatarGalleryItem[]>([]);
  const [galleryLoaded, setGalleryLoaded] = useState(false);
  // 카테고리별 펼침 상태 — 기본 전부 펼침 (학생이 바로 아이템 보고 고를 수 있게).
  // 스크롤이 부담되면 헤더 누르면 개별 접힘.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleCategory = (cat: AvatarGalleryCategory) =>
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));

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

  const galleryPositions = useMemo(() => {
    const map: Record<string, AvatarGalleryItemPosition> = {};
    for (const it of galleryItems) {
      if (it.position) map[it.image_url] = it.position;
    }
    return map;
  }, [galleryItems]);

  if (!open) return null;

  const setGallerySlot = (slot: AvatarGalleryCategory, url: string | undefined) => {
    if (draft.kind !== "gallery") {
      setDraft({ kind: "gallery", [slot]: url });
      return;
    }
    const next = { ...draft, [slot]: url };
    if (!url) delete (next as Record<string, unknown>)[slot];
    setDraft(next);
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
          <AvatarFigure config={draft} size={180} galleryPositions={galleryPositions} />
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
              const selectedSlot =
                draft.kind === "gallery"
                  ? ((draft as Record<string, unknown>)[cat] as AvatarGallerySlot | undefined)
                  : undefined;
              const selectedUrl = getGallerySlotUrl(selectedSlot);
              const isOpen = !collapsed[cat];  // 기본 펼침, 접으면 collapsed=true
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
                        }}
                      >
                        선택 안함
                      </button>
                      {inCat.map((it) => {
                        const isActive = selectedUrl === it.image_url;
                        return (
                          <button
                            key={it.id}
                            type="button"
                            onClick={() => setGallerySlot(cat, it.image_url)}
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
          {onReset && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("아바타를 리셋할까요? 저장된 아바타가 사라집니다.")) {
                  onReset();
                }
              }}
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
                fontSize: 13,
              }}
            >
              리셋
            </button>
          )}
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

