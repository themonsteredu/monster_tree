"use client";

// 아바타 갤러리 관리 UI.
// 카테고리별 섹션: 업로드 버튼 + 라벨 input + 그리드(썸네일 + 토글 + 삭제).
// 업로드 시 클라이언트에서 자동 배경 제거 — 가장자리 dominant 색 + ChatGPT 류
// "가짜 투명" 회색 체크무늬 패턴을 둘 다 감지해 알파 0 으로 만든다.
// 원본 캔버스 크기는 보존 (정렬을 위해 base 와 같은 좌표계 유지).

import { useMemo, useRef, useState, useTransition } from "react";
import type { AvatarGalleryCategory, AvatarGalleryItem } from "@/lib/types";
import {
  uploadGalleryItemAction,
  setGalleryItemActiveAction,
  deleteGalleryItemAction,
  seedDefaultPositionsAction,
} from "../actions";
import { ItemPositionEditor } from "./ItemPositionEditor";

// ChatGPT 이미지 생성기가 만든 PNG 는 알파 채널이 전부 255 (완전 불투명) 이면서
// 체크무늬(투명 표시) 가 실제 픽셀로 그려져 있는 경우가 흔하다. 가장자리 도미넌트
// 색만 제거하는 1차 패스가 실패하면 (=투명 처리된 픽셀이 전체의 10% 미만)
// 2차 패스로 "회색 체크무늬" 패턴을 직접 감지해 제거한다.
//
// 결정적으로, 캔버스 크기는 보존한다 (cropping 하지 않음). 그래야 모자/상의/신발
// 등 각 아이템이 base 와 동일한 좌표계에서 같은 위치에 있는 채로 렌더 시점에
// 100%×100% 로 겹쳐졌을 때 정렬된다.
async function stripBackgroundToPng(file: File): Promise<File> {
  console.log("[gallery] 배경 제거 시작", {
    name: file.name,
    type: file.type,
    sizeKB: Math.round(file.size / 1024),
  });
  const t0 = performance.now();

  const bitmap = await createImageBitmap(file);
  const w = bitmap.width;
  const h = bitmap.height;
  console.log("[gallery] createImageBitmap 완료", { w, h, ms: Math.round(performance.now() - t0) });

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    console.warn("[gallery] 2d context 없음 — 원본 그대로 반환");
    return file;
  }
  ctx.drawImage(bitmap, 0, 0);
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const totalPx = w * h;

  // ── 1차 패스: 가장자리 도미넌트 색 기반 투명화 ──
  // 가장자리 5px 깊이 픽셀을 24 단위로 양자화해 빈도 집계.
  const t1 = performance.now();
  const border = 5;
  const quant = (v: number) => Math.round(v / 24) * 24;
  const counts = new Map<string, { c: number; r: number; g: number; b: number }>();
  let borderPx = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= border && x < w - border && y >= border && y < h - border) continue;
      const i = (y * w + x) * 4;
      if (data[i + 3] < 8) continue;
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
    }
  }
  console.log("[gallery] 1차 패스 완료", { ms: Math.round(performance.now() - t1) });

  // ── 2차 패스: 1차에서 충분히 투명화되지 않았으면 체크무늬 감지 모드 ──
  // 이 단계에서 버그/행이 발생해도 업로드가 막히지 않도록 try/catch 로 격리.
  // 실패 시엔 1차 패스 결과만으로 진행.
  try {
    const t2 = performance.now();
    let transparentPx = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] === 0) transparentPx++;
    }
    const transparentPct = transparentPx / totalPx;
    console.log("[gallery] 1차 투명 픽셀 비율", {
      pct: Math.round(transparentPct * 100),
    });
    if (transparentPct < 0.1) {
      const detected = detectGreyCheckerCorners(data, w, h);
      console.log("[gallery] 체크무늬 감지 결과", { detected });
      if (detected) {
        stripGreyChecker(data, w, h);
        console.log("[gallery] 체크무늬 제거 완료", {
          ms: Math.round(performance.now() - t2),
        });
      }
    }
  } catch (e) {
    console.error("[gallery] 2차 패스 실패 — 1차 결과만 사용", e);
  }

  ctx.putImageData(imgData, 0, 0);
  const out = await canvasToPngFile(canvas, file.name);
  console.log("[gallery] 배경 제거 종료", {
    outSizeKB: Math.round(out.size / 1024),
    totalMs: Math.round(performance.now() - t0),
  });
  return out;
}

// 네 코너의 10×10 영역에서 회색(R==G==B, ±10) & 값 >= 225 인 픽셀 비율을
// 측정. 4 개 코너 중 3 개 이상에서 60% 이상이 그런 픽셀이면 체크무늬로 판정.
function detectGreyCheckerCorners(data: Uint8ClampedArray, w: number, h: number): boolean {
  const size = 10;
  const corners: Array<[number, number]> = [
    [0, 0],
    [w - size, 0],
    [0, h - size],
    [w - size, h - size],
  ];
  let positive = 0;
  for (const [cx, cy] of corners) {
    let grey = 0;
    let total = 0;
    for (let y = cy; y < cy + size && y < h; y++) {
      for (let x = cx; x < cx + size && x < w; x++) {
        const i = (y * w + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        total++;
        if (Math.abs(r - g) < 10 && Math.abs(g - b) < 10 && Math.abs(r - b) < 10 && r >= 225) {
          grey++;
        }
      }
    }
    if (total > 0 && grey / total >= 0.6) positive++;
  }
  return positive >= 3;
}

// 회색 체크무늬 제거 — R==G==B(±8) & 값>225 인 픽셀을 알파 0 으로.
// 본문 가장자리(1px 안쪽) 픽셀이 그 기준에 걸리면 부분 알파(180) 로 두어
// anti-aliasing 효과를 살린다.
function stripGreyChecker(data: Uint8ClampedArray, w: number, h: number) {
  const isCheckerPx = (i: number) => {
    if (data[i + 3] === 0) return false;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    return (
      Math.abs(r - g) <= 8 &&
      Math.abs(g - b) <= 8 &&
      Math.abs(r - b) <= 8 &&
      r > 225
    );
  };
  // 1패스: 마스크 구성
  const mask = new Uint8Array(w * h);
  for (let p = 0, i = 0; p < mask.length; p++, i += 4) {
    if (isCheckerPx(i)) mask[p] = 1;
  }
  // 2패스: 마스크가 1 인 픽셀은 알파 0, 인접 8픽셀 중 하나라도 0(콘텐츠) 이면
  // 알파 0 대신 부분 알파로 두어 콘텐츠 경계가 거칠게 잘리지 않게.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!mask[p]) continue;
      const i = p * 4;
      let touchesContent = false;
      outer: for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (!mask[ny * w + nx]) {
            touchesContent = true;
            break outer;
          }
        }
      }
      data[i + 3] = touchesContent ? 180 : 0;
    }
  }
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
  const [editorItem, setEditorItem] = useState<AvatarGalleryItem | null>(null);

  const byCategory = (cat: AvatarGalleryCategory) => items.filter((i) => i.category === cat);

  // 위치 에디터의 base 오버레이용 — 활성 base 항목 중 첫 번째.
  const baseImageUrl = useMemo(() => {
    const base = items.find((i) => i.category === "base" && i.active);
    return base?.image_url ?? null;
  }, [items]);

  const handleSeedDefaults = () => {
    if (!confirm("위치값이 비어있는 항목들에 카테고리 기본 위치를 채울까요?")) return;
    setError(null);
    startTransition(async () => {
      const r = await seedDefaultPositionsAction();
      if (!r.ok) {
        setError(r.message);
        return;
      }
      await refreshFromServer();
    });
  };

  const refreshFromServer = async () => {
    // 간단히 page refresh — server action 후 revalidatePath 가 호출되긴 하나 클라이언트 state 도 갱신 필요
    if (typeof window !== "undefined") window.location.reload();
  };

  const handleUpload = (cat: AvatarGalleryCategory, file: File, label: string) => {
    console.log("[gallery] 업로드 시작", { cat, name: file.name, sizeKB: Math.round(file.size / 1024) });
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
        console.error("[gallery] 배경 제거 실패", e);
        setError(`이미지 처리 실패: ${(e as Error).message}`);
        return;
      }
      if (processed.size > 2_097_152) {
        console.warn("[gallery] 처리 결과 2MB 초과", { sizeKB: Math.round(processed.size / 1024) });
        setError("처리된 이미지가 2MB 를 초과해요. 더 작은 해상도로 다시 시도해주세요.");
        return;
      }
      const fd = new FormData();
      fd.append("file", processed);
      fd.append("category", cat);
      if (label) fd.append("label", label);
      console.log("[gallery] 스토리지 + DB 저장 시작");
      try {
        const r = await uploadGalleryItemAction(fd);
        if (!r.ok) {
          console.error("[gallery] 서버 업로드 실패", r.message);
          setError(r.message);
          return;
        }
        console.log("[gallery] 서버 업로드 완료");
      } catch (e) {
        console.error("[gallery] 서버 업로드 예외", e);
        setError(`업로드 실패: ${(e as Error).message}`);
        return;
      }
      console.log("[gallery] 페이지 새로고침");
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

  // 전체 항목을 순차 재처리. ChatGPT 가짜 투명(체크무늬 baked-in) 배경을 비롯한
  // 모든 baked-in 배경을 강화된 stripBackgroundToPng 로 다시 정리한다. 진행률을
  // 표시하고, 일부 실패해도 나머지는 계속.
  const handleRecleanAll = async () => {
    const targets = items.slice();
    if (targets.length === 0) return;
    if (!confirm(`전체 ${targets.length}개 항목 배경을 다시 정리할까요? 시간이 좀 걸려요.`)) return;
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
        setError(`일괄 재처리 ${failures.length}/${targets.length} 실패 — ${failures.slice(0, 3).join(" / ")}${failures.length > 3 ? " …" : ""}`);
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
          ChatGPT 가 만든 PNG 는 알파 채널이 불투명한 채 체크무늬가 픽셀로 그려진
          "가짜 투명" 인 경우가 있어요. 강화된 배경 제거 로직으로 모든 항목을 한
          번에 다시 정리할 수 있습니다.
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleSeedDefaults}
            disabled={pending || items.length === 0}
            className="px-3 py-2 rounded bg-cream text-ink font-extrabold text-sm disabled:opacity-50 whitespace-nowrap border-[1.5px] border-pot/30"
            title="position 이 비어있는 항목에 카테고리별 기본 위치를 자동 채움"
          >
            📐 기본 위치 채우기
          </button>
          <button
            type="button"
            onClick={handleRecleanAll}
            disabled={pending || items.length === 0}
            className="px-3 py-2 rounded bg-pot text-white font-extrabold text-sm disabled:opacity-50 whitespace-nowrap"
          >
            {bulkProgress
              ? `🧹 ${bulkProgress.done}/${bulkProgress.total} 처리 중${bulkProgress.failed > 0 ? ` (실패 ${bulkProgress.failed})` : ""}…`
              : `🧹 전체 항목 배경 재처리 (${items.length})`}
          </button>
        </div>
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
          onEditPosition={(it) => setEditorItem(it)}
        />
      ))}
      {editorItem && (
        <ItemPositionEditor
          item={editorItem}
          baseImageUrl={baseImageUrl}
          onClose={() => setEditorItem(null)}
          onSaved={(position) => {
            setItems((prev) =>
              prev.map((p) => (p.id === editorItem.id ? { ...p, position } : p)),
            );
            setEditorItem(null);
          }}
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
              <div className="px-1.5 py-1 text-[11px] text-ink truncate flex items-center gap-1">
                <span
                  title={it.position ? "위치 저장됨" : "카테고리 기본 위치"}
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    it.position ? "bg-apple" : "bg-pot/30"
                  }`}
                />
                <span className="truncate">{it.label ?? "(라벨 없음)"}</span>
              </div>
              <div className="flex border-t border-pot/20">
                <button
                  type="button"
                  onClick={() => onEditPosition(it)}
                  disabled={pending}
                  className="flex-1 py-1 text-[11px] font-bold border-r border-pot/20"
                  title="아바타 base 위에 겹쳐서 위치/크기 미세조정"
                >
                  📍 위치
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
                  {it.active ? "끔" : "켬"}
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
