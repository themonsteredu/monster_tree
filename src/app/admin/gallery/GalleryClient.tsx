"use client";

// 아바타 갤러리 관리 UI.
// 카테고리별 섹션: 업로드 버튼 + 라벨 input + 그리드(썸네일 + 토글 + 삭제).

import { useRef, useState, useTransition } from "react";
import type { AvatarGalleryCategory, AvatarGalleryItem } from "@/lib/types";
import {
  uploadGalleryItemAction,
  setGalleryItemActiveAction,
  deleteGalleryItemAction,
} from "../actions";

const CATEGORIES: Array<{ key: AvatarGalleryCategory; label: string; hint: string }> = [
  { key: "base", label: "베이스 (캐릭터)", hint: "전신 캐릭터 이미지. 학생이 가장 먼저 고르는 레이어." },
  { key: "outfit", label: "의상", hint: "후드/티/원피스 등. 투명 PNG 권장 (베이스 위에 겹침)." },
  { key: "hat", label: "모자", hint: "모자/헤어 액세서리. 투명 PNG 권장." },
  { key: "accessory", label: "액세서리", hint: "안경/뱃지/소품. 투명 PNG 권장." },
];

export function GalleryClient({ initialItems }: { initialItems: AvatarGalleryItem[] }) {
  const [items, setItems] = useState<AvatarGalleryItem[]>(initialItems);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const byCategory = (cat: AvatarGalleryCategory) => items.filter((i) => i.category === cat);

  const refreshFromServer = async () => {
    // 간단히 page refresh — server action 후 revalidatePath 가 호출되긴 하나 클라이언트 state 도 갱신 필요
    if (typeof window !== "undefined") window.location.reload();
  };

  const handleUpload = (cat: AvatarGalleryCategory, file: File, label: string) => {
    setError(null);
    if (file.size > 2_097_152) {
      setError("이미지가 너무 커요 (2MB 이하).");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    fd.append("category", cat);
    if (label) fd.append("label", label);
    startTransition(async () => {
      const r = await uploadGalleryItemAction(fd);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      await refreshFromServer();
    });
  };

  const handleToggle = (id: string, active: boolean) => {
    setError(null);
    startTransition(async () => {
      const r = await setGalleryItemActiveAction({ id, active });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, active } : i)));
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("이 항목을 삭제할까요? 학생들의 아바타에서 사용 중이면 빈 슬롯이 됩니다.")) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteGalleryItemAction({ id });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== id));
    });
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 space-y-6">
      {error && (
        <div className="bg-[#fde8e4] text-[#a83020] px-3 py-2 rounded text-sm">
          {error}
        </div>
      )}
      <p className="text-sm text-ink-soft">
        학생들이 아바타 꾸미기에서 카테고리마다 1개씩 골라 합성한 아바타를 사용합니다. 같은 비율의
        정사각형 PNG (투명 배경) 가 가장 잘 어울려요.
      </p>
      {CATEGORIES.map((c) => (
        <CategorySection
          key={c.key}
          category={c.key}
          label={c.label}
          hint={c.hint}
          items={byCategory(c.key)}
          pending={pending}
          onUpload={handleUpload}
          onToggle={handleToggle}
          onDelete={handleDelete}
        />
      ))}
    </div>
  );
}

function CategorySection({
  category, label, hint, items, pending, onUpload, onToggle, onDelete,
}: {
  category: AvatarGalleryCategory;
  label: string;
  hint: string;
  items: AvatarGalleryItem[];
  pending: boolean;
  onUpload: (cat: AvatarGalleryCategory, file: File, label: string) => void;
  onToggle: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [draftLabel, setDraftLabel] = useState("");

  const onPick = () => fileRef.current?.click();
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    onUpload(category, f, draftLabel);
    setDraftLabel("");
  };

  return (
    <section className="bg-white border-[1.5px] border-pot/30 rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="font-extrabold text-ink">{label}</h2>
        <span className="text-xs text-ink-soft">{items.length}개</span>
      </div>
      <p className="text-xs text-ink-soft mb-3">{hint}</p>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input
          type="text"
          placeholder="라벨 (선택)"
          value={draftLabel}
          onChange={(e) => setDraftLabel(e.target.value)}
          className="px-3 py-2 border-[1.5px] border-pot/30 rounded text-sm flex-1 min-w-[120px]"
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={onFile}
          style={{ display: "none" }}
        />
        <button
          type="button"
          onClick={onPick}
          disabled={pending}
          className="px-3 py-2 rounded bg-apple text-white font-extrabold text-sm disabled:opacity-50"
        >
          {pending ? "업로드 중..." : "📷 이미지 추가"}
        </button>
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-ink-soft py-6 text-center bg-cream/50 rounded">
          업로드된 항목이 없어요.
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {items.map((it) => (
            <div
              key={it.id}
              className={`relative border-[1.5px] rounded-lg overflow-hidden bg-cream/30 ${
                it.active ? "border-pot/40" : "border-pot/20 opacity-50"
              }`}
            >
              <div className="aspect-square w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={it.image_url}
                  alt={it.label ?? ""}
                  className="w-full h-full object-contain bg-white"
                />
              </div>
              <div className="px-1.5 py-1 text-[11px] text-ink truncate">
                {it.label ?? "(라벨 없음)"}
              </div>
              <div className="flex border-t border-pot/20">
                <button
                  type="button"
                  onClick={() => onToggle(it.id, !it.active)}
                  disabled={pending}
                  className="flex-1 py-1 text-[11px] font-bold border-r border-pot/20"
                >
                  {it.active ? "비활성" : "활성화"}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(it.id)}
                  disabled={pending}
                  className="flex-1 py-1 text-[11px] font-bold text-[#a83020]"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
