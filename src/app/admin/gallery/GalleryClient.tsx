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
  uploadGalleryItemAction,
  setGalleryItemActiveAction,
  deleteGalleryItemAction,
  updateGalleryItemPositionAction,
} from "../actions";

// 가장자리 N 픽셀에서 색 히스토그램을 만들어, 빈도 합 ≥40% 인 우세 색 1~2 개를 키로 잡고
// 본문 전체에서 tolerance 안에 들어오는 픽셀을 알파 0 으로 만든다.
// (편집기에서 체크무늬 transparency 배경이 픽셀로 baked-in 된 경우를 자동 정리)
// 마지막으로 투명 가장자리를 잘라내(crop) 인트린식 크기 = 콘텐츠 크기로 맞춰 슬롯 간 비율 정렬을 돕는다.
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

  // 위치 에디터 미리보기에서 배경에 깔 base 이미지 — 활성 base 아이템 중 첫번째.
  const baseBackdropUrl = useMemo(
    () => items.find((i) => i.category === "base" && i.active)?.image_url,
    [items],
  );

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
      <div className="bg-cream/60 border-[1.5px] border-pot/30 rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-ink-soft flex-1 min-w-[180px]">
          자동 크롭 도입 이전에 올린 이미지는 PNG 투명 여백이 남아 슬롯 비율이 어긋날 수 있어요.
          한 번에 모든 항목을 다시 크롭할 수 있습니다.
        </div>
        <button
          type="button"
          onClick={handleRecleanAll}
          disabled={pending || items.length === 0}
          className="px-3 py-2 rounded bg-pot text-white font-extrabold text-sm disabled:opacity-50 whitespace-nowrap"
        >
          {bulkProgress
            ? `🧹 ${bulkProgress.done}/${bulkProgress.total} 처리 중${bulkProgress.failed > 0 ? ` (실패 ${bulkProgress.failed})` : ""}…`
            : `🧹 전체 항목 다시 크롭 (${items.length})`}
        </button>
      </div>
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
          onEditPosition={(it) => setEditingItem(it)}
        />
      ))}
      {editingItem && (
        <PositionEditor
          item={editingItem}
          baseBackdropUrl={baseBackdropUrl}
          pending={pending}
          onClose={() => setEditingItem(null)}
          onSave={(position) => handleSavePosition(editingItem.id, position)}
        />
      )}
    </div>
  );
}

function CategorySection({
  category, label, hint, items, pending, onUpload, onToggle, onDelete, onReclean, onEditPosition,
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
  onEditPosition: (it: AvatarGalleryItem) => void;
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

// 위치/크기 조정 에디터 — 300×300 미리보기 + 슬라이더 4개.
// canvas 연산 없음, CSS transform 만으로 실시간 미리보기.
//   left: ${x}% / top: ${y}% / transform: translate(-50%,-50%) scaleX(...) scaleY(...)
// base 카테고리 아이템을 편집할 땐 backdrop 을 깔지 않음 (자기 자신이 base).
function PositionEditor({
  item,
  baseBackdropUrl,
  pending,
  onClose,
  onSave,
}: {
  item: AvatarGalleryItem;
  baseBackdropUrl: string | undefined;
  pending: boolean;
  onClose: () => void;
  onSave: (position: AvatarGalleryItemPosition) => void;
}) {
  const [pos, setPos] = useState<AvatarGalleryItemPosition>(() => getGalleryItemPosition(item));

  const showBackdrop = item.category !== "base" && !!baseBackdropUrl;

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

        {/* 미리보기 — 300×300, CSS transform 으로만 배치 */}
        <div
          style={{
            position: "relative",
            width: 300,
            height: 300,
            margin: "0 auto 14px",
            background: "#fff5d6",
            border: "1.5px solid #f0c050",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {showBackdrop && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={baseBackdropUrl}
              alt=""
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "contain",
                opacity: 0.4,
                pointerEvents: "none",
              }}
            />
          )}
          <div
            style={{
              position: "absolute",
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              width: "100%",
              height: "100%",
              transform: `translate(-50%, -50%) scaleX(${pos.scaleX / 100}) scaleY(${pos.scaleY / 100})`,
              transformOrigin: "center center",
              pointerEvents: "none",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.image_url}
              alt={item.label ?? ""}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                objectPosition: "center",
                display: "block",
              }}
            />
          </div>
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
