"use client";

// 아바타 갤러리 관리 UI.
// 카테고리별 섹션: 업로드 버튼 + 라벨 input + 그리드(썸네일 + 토글 + 삭제).
// 업로드 시 클라이언트에서 자동 배경 제거 — 가장자리 픽셀에서 1~2 개 우세 색을 찾아
// (체크무늬 baked-in 케이스 포함) 일치 픽셀을 투명 처리한 PNG 로 변환한 뒤 전송.

import { useRef, useState, useTransition } from "react";
import type { AvatarGalleryCategory, AvatarGalleryItem } from "@/lib/types";
import {
  uploadGalleryItemAction,
  setGalleryItemActiveAction,
  deleteGalleryItemAction,
} from "../actions";

// 가장자리 N 픽셀에서 색 히스토그램을 만들어, 빈도 합 ≥40% 인 우세 색 1~2 개를 키로 잡고
// 본문 전체에서 tolerance 안에 들어오는 픽셀을 알파 0 으로 만든다.
// (편집기에서 체크무늬 transparency 배경이 픽셀로 baked-in 된 경우를 자동 정리)
async function stripBackgroundToPng(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const w = bitmap.width;
  const h = bitmap.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0);
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // 가장자리 5px 깊이의 픽셀을 24 단위로 양자화해 빈도 집계.
  const border = 5;
  const quant = (v: number) => Math.round(v / 24) * 24;
  const counts = new Map<string, { c: number; r: number; g: number; b: number }>();
  let borderPx = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= border && x < w - border && y >= border && y < h - border) continue;
      const i = (y * w + x) * 4;
      if (data[i + 3] < 8) continue; // 이미 투명한 픽셀은 무시
      const r = quant(data[i]);
      const g = quant(data[i + 1]);
      const b = quant(data[i + 2]);
      const key = `${r}_${g}_${b}`;
      const prev = counts.get(key);
      if (prev) prev.c++;
      else counts.set(key, { c: 1, r, g, b });
      borderPx++;
    }
  }
  if (borderPx === 0) return await canvasToPngFile(canvas, file.name);

  const sorted = [...counts.values()].sort((a, b) => b.c - a.c);
  // top1 단일색이 ≥60% 이면 단색 배경, top2 합이 ≥50% 면 체크무늬 패턴으로 간주.
  const top: Array<{ r: number; g: number; b: number }> = [];
  const top1Pct = sorted[0].c / borderPx;
  const top2Pct = sorted.length > 1 ? (sorted[0].c + sorted[1].c) / borderPx : 0;
  if (top1Pct >= 0.6) {
    top.push(sorted[0]);
  } else if (top2Pct >= 0.5) {
    top.push(sorted[0], sorted[1]);
  } else {
    // 가장자리가 다채롭다면 배경 추정 실패 — 그대로 PNG 만 보장
    return await canvasToPngFile(canvas, file.name);
  }

  const tol = 28;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    for (const k of top) {
      if (Math.abs(r - k.r) <= tol && Math.abs(g - k.g) <= tol && Math.abs(b - k.b) <= tol) {
        data[i + 3] = 0;
        break;
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return await canvasToPngFile(canvas, file.name);
}

function canvasToPngFile(canvas: HTMLCanvasElement, originalName: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("canvas toBlob failed"));
      const base = originalName.replace(/\.[^.]+$/, "");
      resolve(new File([blob], `${base}.png`, { type: "image/png" }));
    }, "image/png");
  });
}

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
    if (file.size > 4_194_304) {
      setError("이미지가 너무 커요 (4MB 이하 원본만 처리해요).");
      return;
    }
    startTransition(async () => {
      let processed: File;
      try {
        processed = await stripBackgroundToPng(file);
      } catch (e) {
        setError(`이미지 처리 실패: ${(e as Error).message}`);
        return;
      }
      if (processed.size > 2_097_152) {
        setError("처리된 이미지가 2MB 를 초과해요. 더 작은 해상도로 다시 시도해주세요.");
        return;
      }
      const fd = new FormData();
      fd.append("file", processed);
      fd.append("category", cat);
      if (label) fd.append("label", label);
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

  // 기존 항목의 baked-in 배경을 청소해서 동일 카테고리에 새 항목으로 올린 뒤 기존 항목 삭제.
  const handleReclean = async (it: AvatarGalleryItem) => {
    if (!confirm("이 이미지의 배경을 다시 정리할까요? 새 항목으로 올라가고 원본은 삭제돼요.")) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(it.image_url, { cache: "no-store" });
        if (!res.ok) throw new Error(`이미지 fetch 실패 (${res.status})`);
        const blob = await res.blob();
        const file = new File([blob], "reclean.png", { type: blob.type || "image/png" });
        const processed = await stripBackgroundToPng(file);
        if (processed.size > 2_097_152) {
          setError("처리된 이미지가 2MB 를 초과해요.");
          return;
        }
        const fd = new FormData();
        fd.append("file", processed);
        fd.append("category", it.category);
        if (it.label) fd.append("label", it.label);
        const up = await uploadGalleryItemAction(fd);
        if (!up.ok) {
          setError(up.message);
          return;
        }
        const del = await deleteGalleryItemAction({ id: it.id });
        if (!del.ok) {
          setError(`새 항목 업로드는 됐지만 기존 삭제 실패: ${del.message}`);
          return;
        }
        await refreshFromServer();
      } catch (e) {
        setError(`재처리 실패: ${(e as Error).message}`);
      }
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
          onReclean={handleReclean}
        />
      ))}
    </div>
  );
}

function CategorySection({
  category, label, hint, items, pending, onUpload, onToggle, onDelete, onReclean,
}: {
  category: AvatarGalleryCategory;
  label: string;
  hint: string;
  items: AvatarGalleryItem[];
  pending: boolean;
  onUpload: (cat: AvatarGalleryCategory, file: File, label: string) => void;
  onToggle: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
  onReclean: (it: AvatarGalleryItem) => void;
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
          accept="image/png,image/webp"
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
                  onClick={() => onReclean(it)}
                  disabled={pending}
                  className="flex-1 py-1 text-[11px] font-bold border-r border-pot/20"
                  title="가장자리 색을 다시 분석해 baked-in 배경을 투명 처리"
                >
                  🧹 배경
                </button>
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
