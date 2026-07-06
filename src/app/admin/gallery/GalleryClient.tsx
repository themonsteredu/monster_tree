"use client";

// 아바타 갤러리 관리 UI.
// 카테고리별 섹션: 업로드 버튼 + 라벨 input + 그리드(썸네일 + 토글 + 삭제).
// 업로드 시 클라이언트에서 자동 배경 제거 — 가장자리 픽셀에서 1~2 개 우세 색을 찾아
// (체크무늬 baked-in 케이스 포함) 일치 픽셀을 투명 처리한 PNG 로 변환한 뒤 전송.

import { useMemo, useRef, useState, useTransition } from "react";
import type {
  AvatarGalleryCategory,
  AvatarGalleryItem,
  AvatarGalleryItemPosition,
} from "@/lib/types";
import { getGalleryItemPosition } from "@/lib/types";
import {
  AvatarComposite,
  type AvatarCompositeLayer,
} from "@/features/garden/avatar/AvatarFigure";
import {
  uploadGalleryItemAction,
  setGalleryItemActiveAction,
  deleteGalleryItemAction,
  updateGalleryItemPositionAction,
  updateGalleryItemMetaAction,
  generateAvatarItemAction,
} from "../actions";

// 가장자리 N 픽셀에서 색 히스토그램을 만들어, 빈도 합 ≥40% 인 우세 색 1~2 개를 키로 잡고
// 본문 전체에서 tolerance 안에 들어오는 픽셀을 알파 0 으로 만든다.
// (편집기에서 체크무늬 transparency 배경이 픽셀로 baked-in 된 경우를 자동 정리)
// 마지막으로 투명 가장자리를 잘라내(crop) 인트린식 크기 = 콘텐츠 크기로 맞춰 슬롯 간 비율 정렬을 돕는다.
// 누끼 건너뛰고 단순 PNG 변환만 (흰색 아이템 등 흰색이 사라지면 안 될 때).
async function convertToPng(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0);
  return await canvasToPngFile(canvas, file.name);
}

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

  if (borderPx > 0) {
    const sorted = [...counts.values()].sort((a, b) => b.c - a.c);
    const top: Array<{ r: number; g: number; b: number }> = [];
    const top1Pct = sorted[0].c / borderPx;
    const top2Pct = sorted.length > 1 ? (sorted[0].c + sorted[1].c) / borderPx : 0;
    if (top1Pct >= 0.6) {
      top.push(sorted[0]);
    } else if (top2Pct >= 0.5) {
      top.push(sorted[0], sorted[1]);
    }
    if (top.length > 0) {
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
    }
  }

  // 투명 가장자리 자르기 — alpha >= 16 픽셀의 바운딩 박스를 찾아 그 영역만 남긴다.
  return await cropTransparentToPng(canvas, file.name);
}

// 캔버스에서 알파 >= 16 인 픽셀의 바운딩 박스를 찾아 그 부분만 잘라 PNG File 로 반환.
// 콘텐츠 없으면 원본 캔버스 그대로.
async function cropTransparentToPng(canvas: HTMLCanvasElement, originalName: string): Promise<File> {
  const ctx = canvas.getContext("2d");
  if (!ctx) return await canvasToPngFile(canvas, originalName);
  const w = canvas.width;
  const h = canvas.height;
  const { data } = ctx.getImageData(0, 0, w, h);
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] >= 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return await canvasToPngFile(canvas, originalName);
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  if (cw === w && ch === h) return await canvasToPngFile(canvas, originalName);
  const out = document.createElement("canvas");
  out.width = cw;
  out.height = ch;
  const octx = out.getContext("2d");
  if (!octx) return await canvasToPngFile(canvas, originalName);
  octx.drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
  return await canvasToPngFile(out, originalName);
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
  { key: "outfit", label: "상의", hint: "후드/티/재킷 등 상체 의상. 투명 PNG 권장." },
  { key: "bottom", label: "하의", hint: "바지/치마/반바지 등 하체 의상. 투명 PNG 권장." },
  { key: "shoes", label: "신발", hint: "운동화/구두 등. 투명 PNG 권장." },
  { key: "hair", label: "헤어", hint: "머리/앞머리. 베이스 머리 위에 덮어쓰며 모자 아래에 표시." },
  { key: "face", label: "얼굴표정", hint: "눈코입 표정. 베이스 얼굴 위에 덮어씀." },
  { key: "hat", label: "모자", hint: "모자/헤어 액세서리. 투명 PNG 권장." },
  { key: "accessory", label: "액세서리", hint: "안경/뱃지/소품. 투명 PNG 권장." },
];

export function GalleryClient({ initialItems }: { initialItems: AvatarGalleryItem[] }) {
  const [items, setItems] = useState<AvatarGalleryItem[]>(initialItems);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; failed: number } | null>(null);
  const [editingItem, setEditingItem] = useState<AvatarGalleryItem | null>(null);

  const byCategory = (cat: AvatarGalleryCategory) => items.filter((i) => i.category === cat);

  const handleSavePosition = (id: string, position: AvatarGalleryItemPosition) => {
    setError(null);
    startTransition(async () => {
      const r = await updateGalleryItemPositionAction({ id, position });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, position } : i)));
      setEditingItem(null);
    });
  };

  const refreshFromServer = async () => {
    // 간단히 page refresh — server action 후 revalidatePath 가 호출되긴 하나 클라이언트 state 도 갱신 필요
    if (typeof window !== "undefined") window.location.reload();
  };

  // 파일 1개 처리+업로드. 성공 시 null, 실패 시 메시지 반환 (일괄 업로드에서 재사용).
  const uploadOne = async (
    cat: AvatarGalleryCategory,
    file: File,
    label: string,
    removeBg: boolean,
  ): Promise<string | null> => {
    if (file.size > 4_194_304) return "이미지가 너무 커요 (4MB 이하)";
    let processed: File;
    try {
      // removeBg=false (예: 흰색 아이템) 이면 누끼 건너뛰고 PNG 로만 변환.
      processed = removeBg ? await stripBackgroundToPng(file) : await convertToPng(file);
    } catch (e) {
      return `이미지 처리 실패: ${(e as Error).message}`;
    }
    if (processed.size > 2_097_152) return "처리 결과가 2MB 초과";
    const fd = new FormData();
    fd.append("file", processed);
    fd.append("category", cat);
    if (label) fd.append("label", label);
    const r = await uploadGalleryItemAction(fd);
    return r.ok ? null : r.message;
  };

  // 일괄 업로드 — 여러 장 선택 시 순차 처리 + 진행률. 라벨은 파일명(확장자 제외).
  const handleUploadMany = (
    cat: AvatarGalleryCategory,
    files: File[],
    label: string,
    removeBg: boolean,
  ) => {
    setError(null);
    if (files.length === 0) return;
    setBulkProgress({ done: 0, total: files.length, failed: 0 });
    startTransition(async () => {
      let failed = 0;
      const failures: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        // 한 장이면 입력한 라벨, 여러 장이면 파일명을 라벨로.
        const autoLabel =
          files.length === 1 && label
            ? label
            : f.name.replace(/\.[^.]+$/, "").slice(0, 60);
        const msg = await uploadOne(cat, f, autoLabel, removeBg);
        if (msg) {
          failed++;
          failures.push(`${f.name}: ${msg}`);
        }
        setBulkProgress({ done: i + 1, total: files.length, failed });
      }
      setBulkProgress(null);
      if (failures.length > 0) {
        setError(
          `${failures.length}/${files.length}개 실패 — ${failures.slice(0, 3).join(" / ")}${failures.length > 3 ? " …" : ""}`,
        );
      }
      await refreshFromServer();
    });
  };

  const handleSaveMeta = (id: string, price: number, isStyleRef: boolean) => {
    setError(null);
    startTransition(async () => {
      const r = await updateGalleryItemMetaAction({ id, price, is_style_ref: isStyleRef });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, price, is_style_ref: isStyleRef } : i)),
      );
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

  // 한 항목의 baked-in 배경/여백을 재처리해 새 PNG 로 갈아끼운다. (upload + delete 기존)
  // 성공시 null, 실패시 메시지.
  const recleanOne = async (it: AvatarGalleryItem): Promise<string | null> => {
    try {
      const res = await fetch(it.image_url, { cache: "no-store" });
      if (!res.ok) return `이미지 fetch 실패 (${res.status})`;
      const blob = await res.blob();
      const file = new File([blob], "reclean.png", { type: blob.type || "image/png" });
      const processed = await stripBackgroundToPng(file);
      if (processed.size > 2_097_152) return "처리된 이미지가 2MB 를 초과해요.";
      const fd = new FormData();
      fd.append("file", processed);
      fd.append("category", it.category);
      if (it.label) fd.append("label", it.label);
      const up = await uploadGalleryItemAction(fd);
      if (!up.ok) return up.message;
      const del = await deleteGalleryItemAction({ id: it.id });
      if (!del.ok) return `새 항목 업로드는 됐지만 기존 삭제 실패: ${del.message}`;
      return null;
    } catch (e) {
      return `재처리 실패: ${(e as Error).message}`;
    }
  };

  const handleReclean = async (it: AvatarGalleryItem) => {
    if (!confirm("이 이미지의 배경을 다시 정리할까요? 새 항목으로 올라가고 원본은 삭제돼요.")) return;
    setError(null);
    startTransition(async () => {
      const msg = await recleanOne(it);
      if (msg) {
        setError(msg);
        return;
      }
      await refreshFromServer();
    });
  };

  // 전체 항목을 순차 재크롭. 자동 크롭 도입 이전에 올린 이미지들의 투명 여백을 제거해
  // 슬롯 박스 안 비율을 통일하기 위함. 진행률을 표시하고, 일부 실패해도 나머지는 계속.
  const handleRecleanAll = async () => {
    const targets = items.slice();
    if (targets.length === 0) return;
    if (!confirm(`전체 ${targets.length}개 항목을 다시 크롭할까요? 시간이 좀 걸려요.`)) return;
    setError(null);
    setBulkProgress({ done: 0, total: targets.length, failed: 0 });
    startTransition(async () => {
      let failed = 0;
      const failures: string[] = [];
      for (let i = 0; i < targets.length; i++) {
        const it = targets[i];
        const msg = await recleanOne(it);
        if (msg) {
          failed++;
          failures.push(`${it.category}/${it.label ?? it.id.slice(0, 6)}: ${msg}`);
        }
        setBulkProgress({ done: i + 1, total: targets.length, failed });
      }
      if (failures.length > 0) {
        setError(`일괄 재크롭 ${failures.length}/${targets.length} 실패 — ${failures.slice(0, 3).join(" / ")}${failures.length > 3 ? " …" : ""}`);
      }
      setBulkProgress(null);
      await refreshFromServer();
    });
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}
      <p className="text-sm text-gray-500">
        학생들이 아바타 꾸미기에서 카테고리마다 1개씩 골라 합성한 아바타를 사용합니다. 같은 비율의
        정사각형 PNG (투명 배경) 가 가장 잘 어울려요.
      </p>
      <div className="bg-white border border-gray-100 shadow-sm rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-gray-500 flex-1 min-w-[180px]">
          자동 크롭 도입 이전에 올린 이미지는 PNG 투명 여백이 남아 슬롯 비율이 어긋날 수 있어요. 한
          번에 모든 항목을 다시 크롭할 수 있습니다.
        </div>
        <button
          type="button"
          onClick={handleRecleanAll}
          disabled={pending || items.length === 0}
          className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50 whitespace-nowrap"
        >
          {bulkProgress
            ? `${bulkProgress.done}/${bulkProgress.total} 처리 중${bulkProgress.failed > 0 ? ` (실패 ${bulkProgress.failed})` : ""}…`
            : `전체 항목 다시 크롭 (${items.length})`}
        </button>
      </div>
      <AiGeneratorSection
        pending={pending}
        styleRefCount={items.filter((i) => i.is_style_ref).length}
        onRegistered={refreshFromServer}
        onError={setError}
      />
      {CATEGORIES.map((c) => (
        <CategorySection
          key={c.key}
          category={c.key}
          label={c.label}
          hint={c.hint}
          items={byCategory(c.key)}
          pending={pending}
          onUpload={handleUploadMany}
          onToggle={handleToggle}
          onDelete={handleDelete}
          onReclean={handleReclean}
          onEditPosition={(it) => setEditingItem(it)}
          onSaveMeta={handleSaveMeta}
        />
      ))}
      {editingItem && (
        <PositionEditor
          item={editingItem}
          allItems={items}
          pending={pending}
          onClose={() => setEditingItem(null)}
          onSave={(position) => handleSavePosition(editingItem.id, position)}
        />
      )}
    </div>
  );
}

function CategorySection({
  category, label, hint, items, pending, onUpload, onToggle, onDelete, onReclean, onEditPosition, onSaveMeta,
}: {
  category: AvatarGalleryCategory;
  label: string;
  hint: string;
  items: AvatarGalleryItem[];
  pending: boolean;
  onUpload: (cat: AvatarGalleryCategory, files: File[], label: string, removeBg: boolean) => void;
  onToggle: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
  onReclean: (it: AvatarGalleryItem) => void;
  onEditPosition: (it: AvatarGalleryItem) => void;
  onSaveMeta: (id: string, price: number, isStyleRef: boolean) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [removeBg, setRemoveBg] = useState(true);

  const onPick = () => fileRef.current?.click();
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    onUpload(category, files, draftLabel, removeBg);
    setDraftLabel("");
  };

  return (
    <section className="bg-white border border-gray-100 shadow-sm rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="font-semibold text-gray-900">{label}</h2>
        <span className="text-xs text-gray-400">{items.length}개</span>
      </div>
      <p className="text-xs text-gray-500 mb-3">{hint}</p>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input
          type="text"
          placeholder="라벨 (선택)"
          value={draftLabel}
          onChange={(e) => setDraftLabel(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-transparent transition flex-1 min-w-[120px]"
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/webp"
          multiple
          onChange={onFile}
          style={{ display: "none" }}
        />
        <button
          type="button"
          onClick={onPick}
          disabled={pending}
          className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50"
        >
          {pending ? "업로드 중..." : "이미지 추가 (여러 장 가능)"}
        </button>
      </div>
      <label className="flex items-center gap-2 mb-3 text-xs text-gray-600 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={removeBg}
          onChange={(e) => setRemoveBg(e.target.checked)}
          className="w-4 h-4 accent-amber-500"
        />
        <span>배경 자동 제거 (흰색·연한색 아이템은 끄세요)</span>
      </label>
      {items.length === 0 ? (
        <div className="text-xs text-gray-400 py-6 text-center bg-gray-50 rounded-lg">
          업로드된 항목이 없어요.
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {items.map((it) => (
            <div
              key={it.id}
              className={`relative border rounded-lg overflow-hidden bg-white ${
                it.active ? "border-gray-200" : "border-gray-100 opacity-50"
              }`}
            >
              <div className="aspect-square w-full bg-gray-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={it.image_url}
                  alt={it.label ?? ""}
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="px-1.5 py-1 text-[11px] text-gray-700 truncate">
                {it.label ?? "(라벨 없음)"}
                {it.price > 0 && (
                  <span className="ml-1 text-amber-600 font-bold">{it.price}P</span>
                )}
                {it.is_style_ref && <span className="ml-1">⭐</span>}
              </div>
              <ItemMetaRow item={it} pending={pending} onSave={onSaveMeta} />
              <div className="flex border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => onEditPosition(it)}
                  disabled={pending}
                  className="flex-1 py-1 text-[11px] font-bold border-r border-pot/20"
                  title="아바타 안에서 이 아이템의 위치/크기 조정"
                >
                  🎯 위치조정
                </button>
                <button
                  type="button"
                  onClick={() => onReclean(it)}
                  disabled={pending}
                  className="flex-1 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 border-r border-gray-100 transition disabled:opacity-50"
                  title="가장자리 색을 다시 분석해 baked-in 배경을 투명 처리"
                >
                  배경
                </button>
                <button
                  type="button"
                  onClick={() => onToggle(it.id, !it.active)}
                  disabled={pending}
                  className="flex-1 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 border-r border-gray-100 transition disabled:opacity-50"
                >
                  {it.active ? "비활성" : "활성화"}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(it.id)}
                  disabled={pending}
                  className="flex-1 py-1 text-[11px] font-medium text-red-500 hover:bg-red-50 transition disabled:opacity-50"
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

// 아이템 가격/스타일기준 인라인 편집 줄.
function ItemMetaRow({
  item,
  pending,
  onSave,
}: {
  item: AvatarGalleryItem;
  pending: boolean;
  onSave: (id: string, price: number, isStyleRef: boolean) => void;
}) {
  const [price, setPrice] = useState(String(item.price ?? 0));
  const dirty = Number(price) !== (item.price ?? 0);
  return (
    <div className="flex items-center gap-1 px-1.5 pb-1">
      <input
        type="number"
        min={0}
        max={100000}
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        className="w-14 px-1 py-0.5 rounded border border-gray-200 text-[11px] text-gray-800"
        aria-label="가격 (P)"
      />
      <span className="text-[10px] text-gray-400">P</span>
      {dirty && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const v = Math.max(0, Math.min(100000, Math.floor(Number(price) || 0)));
            setPrice(String(v));
            onSave(item.id, v, item.is_style_ref ?? false);
          }}
          className="px-1.5 py-0.5 rounded bg-amber-500 text-white text-[10px] font-bold disabled:opacity-50"
        >
          저장
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => onSave(item.id, item.price ?? 0, !(item.is_style_ref ?? false))}
        className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-bold transition disabled:opacity-50 ${
          item.is_style_ref
            ? "bg-yellow-100 text-yellow-700 border border-yellow-300"
            : "bg-gray-50 text-gray-400 border border-gray-200"
        }`}
        title="AI 생성 시 이 그림체를 기준으로 참조"
      >
        ⭐기준
      </button>
    </div>
  );
}

// ============================================================
// AI 아이템 생성기 — 이름+카테고리 입력 → 같은 그림체로 생성 → 미리보기 → 등록.
// OPENAI_API_KEY 미설정이면 설정 안내만 표시.
// ============================================================
function AiGeneratorSection({
  pending,
  styleRefCount,
  onRegistered,
  onError,
}: {
  pending: boolean;
  styleRefCount: number;
  onRegistered: () => Promise<void> | void;
  onError: (msg: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [category, setCategory] = useState<AvatarGalleryCategory>("hat");
  const [generating, setGenerating] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [needKey, setNeedKey] = useState(false);
  const [result, setResult] = useState<{ b64: string; refs: number } | null>(null);
  const [price, setPrice] = useState("0");

  const generate = async () => {
    const p = prompt.trim();
    if (p.length < 2) {
      onError("만들 아이템을 입력해주세요 (예: 파란 야구모자)");
      return;
    }
    onError("");
    setGenerating(true);
    setResult(null);
    try {
      const r = await generateAvatarItemAction({ prompt: p, category });
      if (!r.ok) {
        if (r.needKey) setNeedKey(true);
        else onError(r.message);
        return;
      }
      setResult({ b64: r.imageB64, refs: r.usedStyleRefs });
    } catch (e) {
      onError(`생성 실패: ${(e as Error).message}`);
    } finally {
      setGenerating(false);
    }
  };

  const register = async () => {
    if (!result) return;
    setRegistering(true);
    try {
      // b64 → File → 투명 여백 크롭(기존 파이프라인) → 업로드
      const bin = atob(result.b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const raw = new File([bytes], `ai-${Date.now()}.png`, { type: "image/png" });
      const processed = await stripBackgroundToPng(raw);
      if (processed.size > 2_097_152) {
        onError("생성 이미지가 2MB 를 초과했어요. 다시 생성해주세요.");
        return;
      }
      const fd = new FormData();
      fd.append("file", processed);
      fd.append("category", category);
      fd.append("label", prompt.trim().slice(0, 60));
      const v = Math.max(0, Math.min(100000, Math.floor(Number(price) || 0)));
      fd.append("price", String(v));
      const r = await uploadGalleryItemAction(fd);
      if (!r.ok) {
        onError(r.message);
        return;
      }
      setResult(null);
      setPrompt("");
      setPrice("0");
      await onRegistered();
    } catch (e) {
      onError(`등록 실패: ${(e as Error).message}`);
    } finally {
      setRegistering(false);
    }
  };

  return (
    <section className="bg-gradient-to-br from-violet-50 to-fuchsia-50 border border-violet-200 shadow-sm rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="font-semibold text-violet-900">✨ AI 아이템 만들기</h2>
        <span className="text-xs text-violet-500">
          {styleRefCount > 0
            ? `⭐스타일 기준 ${styleRefCount}장 참조`
            : "⭐기준 이미지를 지정하면 그림체가 더 일정해져요"}
        </span>
      </div>
      <p className="text-xs text-violet-700/70 mb-3">
        이름만 입력하면 기존 아이템과 같은 그림체로 그려서 배경 투명 처리까지 자동으로 해줘요.
      </p>
      {needKey ? (
        <div className="bg-white border border-violet-200 rounded-lg p-3 text-xs text-gray-600 leading-relaxed">
          <b className="text-violet-700">OPENAI_API_KEY 가 설정되지 않았어요.</b>
          <br />
          1. platform.openai.com 에서 API 키 발급 (5분, 사용량만큼 과금 — 장당 수십 원)
          <br />
          2. Vercel → 이 프로젝트 → Settings → Environment Variables 에{" "}
          <code className="bg-violet-50 px-1 rounded">OPENAI_API_KEY</code> 추가 후 재배포
          <br />
          설정되면 이 자리에서 바로 생성할 수 있어요.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              placeholder="예: 파란 야구모자, 무지개 운동화"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !generating) generate();
              }}
              className="px-3 py-2 rounded-lg border border-violet-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-300 transition flex-1 min-w-[160px]"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as AvatarGalleryCategory)}
              className="px-2 py-2 rounded-lg border border-violet-200 text-sm text-gray-900 bg-white"
              aria-label="카테고리"
            >
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={generate}
              disabled={generating || pending}
              className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-bold hover:bg-violet-700 transition disabled:opacity-50"
            >
              {generating ? "그리는 중… (10~30초)" : "✨ 생성"}
            </button>
          </div>
          {result && (
            <div className="mt-3 bg-white border border-violet-200 rounded-xl p-3 flex items-center gap-4 flex-wrap">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/png;base64,${result.b64}`}
                alt="AI 생성 결과"
                className="w-28 h-28 object-contain rounded-lg bg-[repeating-conic-gradient(#f3f4f6_0%_25%,#ffffff_0%_50%)] bg-[length:16px_16px] border border-gray-100"
              />
              <div className="flex-1 min-w-[160px] space-y-2">
                <p className="text-xs text-gray-500">
                  마음에 들면 등록, 아니면 다시 생성하세요.
                  {result.refs > 0 && ` (기준 이미지 ${result.refs}장 참조됨)`}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="text-xs text-gray-600 flex items-center gap-1">
                    가격
                    <input
                      type="number"
                      min={0}
                      max={100000}
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="w-16 px-1.5 py-1 rounded border border-gray-200 text-xs"
                    />
                    P <span className="text-gray-400">(0=무료)</span>
                  </label>
                  <button
                    type="button"
                    onClick={register}
                    disabled={registering}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition disabled:opacity-50"
                  >
                    {registering ? "등록 중…" : "✅ 이대로 등록"}
                  </button>
                  <button
                    type="button"
                    onClick={generate}
                    disabled={generating}
                    className="px-3 py-1.5 rounded-lg border border-violet-300 text-violet-700 text-xs font-bold hover:bg-violet-50 transition disabled:opacity-50"
                  >
                    🔄 다시 생성
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// 카테고리별 합성 순서 (z-index) — GalleryAvatar 와 동일하게 유지.
// hair 가 outfit/face 위에 와야 머리카락이 옷깃과 이마 위를 자연스럽게 덮음.
const CATEGORY_Z: Record<AvatarGalleryCategory, number> = {
  base: 1, bottom: 2, outfit: 3, shoes: 4, face: 5, hair: 6, accessory: 7, hat: 8,
};
const ALL_CATEGORIES: AvatarGalleryCategory[] = [
  "base", "bottom", "outfit", "shoes", "face", "hair", "accessory", "hat",
];

// 위치/크기 조정 에디터 — 300×300 미리보기 + 슬라이더 4개.
// 미리보기는 실 렌더(/me, /tv) 와 동일한 AvatarComposite 로 그림.
// 배경 레이어: 편집 중 카테고리를 제외한 각 카테고리에서 첫 활성 아이템을 골라
// DB 에 저장된 position(없으면 카테고리 기본값) 으로 opacity 0.4 합성 — 그래서
// base 가 작게 저장되어 있으면 옷/모자도 그 작은 base 에 맞춰 조정 가능.
function PositionEditor({
  item,
  allItems,
  pending,
  onClose,
  onSave,
}: {
  item: AvatarGalleryItem;
  allItems: AvatarGalleryItem[];
  pending: boolean;
  onClose: () => void;
  onSave: (position: AvatarGalleryItemPosition) => void;
}) {
  const [pos, setPos] = useState<AvatarGalleryItemPosition>(() => getGalleryItemPosition(item));

  // 카테고리별 대표 아이템 (활성 우선, 그 다음 sort_order 첫번째).
  const representativeByCat = useMemo(() => {
    const map: Partial<Record<AvatarGalleryCategory, AvatarGalleryItem>> = {};
    for (const cat of ALL_CATEGORIES) {
      const candidates = allItems.filter((i) => i.category === cat);
      map[cat] =
        candidates.find((i) => i.active && i.id !== item.id) ??
        candidates.find((i) => i.id !== item.id);
    }
    return map;
  }, [allItems, item.id]);

  // inner-box 비율 결정용 base url — base 편집 중이면 자기 자신, 아니면 대표 base.
  const innerBoxBaseUrl =
    item.category === "base" ? item.image_url : representativeByCat.base?.image_url;

  // 미리보기 레이어 구성: 편집 중 카테고리는 현재 슬라이더 값으로 풀 불투명도,
  // 나머지 카테고리는 대표 아이템의 저장된 position 으로 opacity 0.4.
  const previewLayers = useMemo<AvatarCompositeLayer[]>(() => {
    const out: AvatarCompositeLayer[] = [];
    for (const cat of ALL_CATEGORIES) {
      if (cat === item.category) {
        out.push({
          key: `edit-${cat}`,
          url: item.image_url,
          position: pos,
          zIndex: CATEGORY_Z[cat],
        });
        continue;
      }
      const rep = representativeByCat[cat];
      if (!rep) continue;
      out.push({
        key: `bg-${cat}-${rep.id}`,
        url: rep.image_url,
        position: getGalleryItemPosition(rep),
        opacity: 0.4,
        zIndex: CATEGORY_Z[cat],
      });
    }
    return out;
  }, [item.category, item.image_url, pos, representativeByCat]);

  const update = (patch: Partial<AvatarGalleryItemPosition>) =>
    setPos((p) => ({ ...p, ...patch }));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="위치/크기 조정"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(61,40,24,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 380,
          background: "#fffaf2",
          borderRadius: 14,
          padding: 16,
          boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 16, color: "#3d2818", fontWeight: 800 }}>
            위치 / 크기 — {item.category}
            {item.label ? ` · ${item.label}` : ""}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            style={{ border: "none", background: "transparent", fontSize: 20, color: "#9a8b6c", cursor: "pointer", padding: 4 }}
          >
            ✕
          </button>
        </div>

        {/* 미리보기 — AvatarComposite 로 실제 렌더와 100% 동일하게 그림.
            base 카테고리 편집 시엔 자기 자신이 backdrop 이므로 별도 backdrop 레이어 없음. */}
        <div
          style={{
            margin: "0 auto 14px",
            width: 300,
            background: "#fff5d6",
            border: "1.5px solid #f0c050",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <AvatarComposite
            size={300}
            baseUrl={innerBoxBaseUrl}
            layers={previewLayers}
          />
        </div>

        {/* 슬라이더 4개 */}
        <SliderRow label="X 위치" value={pos.x} min={0} max={100} onChange={(v) => update({ x: v })} suffix="%" />
        <SliderRow label="Y 위치" value={pos.y} min={0} max={100} onChange={(v) => update({ y: v })} suffix="%" />
        <SliderRow label="가로폭" value={pos.scaleX} min={10} max={200} onChange={(v) => update({ scaleX: v })} suffix="%" />
        <SliderRow label="세로길이" value={pos.scaleY} min={10} max={200} onChange={(v) => update({ scaleY: v })} suffix="%" />

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button
            type="button"
            onClick={() => setPos(getGalleryItemPosition({ category: item.category, position: null }))}
            disabled={pending}
            style={{
              flex: 1,
              padding: "10px 0",
              border: "1.5px solid #d6c2a0",
              background: "#fff",
              color: "#3d2818",
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 13,
              cursor: pending ? "default" : "pointer",
            }}
          >
            기본값
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            style={{
              flex: 1,
              padding: "10px 0",
              border: "1.5px solid #d6c2a0",
              background: "#fff",
              color: "#3d2818",
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 13,
              cursor: pending ? "default" : "pointer",
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => onSave(pos)}
            disabled={pending}
            style={{
              flex: 2,
              padding: "10px 0",
              border: "none",
              background: pending ? "#d6c2a0" : "#F26522",
              color: "#fff",
              borderRadius: 10,
              fontWeight: 800,
              fontSize: 14,
              cursor: pending ? "default" : "pointer",
            }}
          >
            {pending ? "저장 중..." : "저장"}
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
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#3d2818", fontWeight: 700, marginBottom: 2 }}>
        <span>{label}</span>
        <span style={{ color: "#9a8b6c" }}>
          {Math.round(value)}
          {suffix ?? ""}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%" }}
      />
    </div>
  );
}
