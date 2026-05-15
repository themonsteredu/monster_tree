"use client";

// 사과나무 단계별 이미지 관리 UI.
// - 8개 단계 카드 그리드 → 하나 선택하면 아래 편집 패널 표시
// - 미리보기(배경 + 나무 + 샘플 아바타)
// - 업로드 / 삭제 / 크기·좌우·상하 슬라이더 / 저장

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AppleTree } from "@/components/AppleTree";
import { AvatarFigure } from "@/features/garden/avatar/AvatarFigure";
import { BackgroundCanvas } from "@/features/garden/background/BackgroundCanvas";
import { useGalleryPositions } from "@/features/garden/avatar/useGalleryPositions";
import { invalidateTreeStagesCache } from "@/features/garden/tree/useTreeStages";
import { STAGE_ACCENT } from "@/features/garden/stage-accent";
import { getStageInfo } from "@/lib/garden";
import { DEFAULT_AVATAR, DEFAULT_BACKGROUND } from "@/lib/types";
import type { GardenTreeStage } from "@/lib/types";
import {
  uploadTreeStageImageAction,
  deleteTreeStageImageAction,
  updateTreeStageTransformAction,
} from "./actions";

type Stage = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export function TreeStagesClient({ initialStages }: { initialStages: GardenTreeStage[] }) {
  const [stages, setStages] = useState<GardenTreeStage[]>(() => normalize(initialStages));
  const [selected, setSelected] = useState<Stage>(1);
  const [toast, setToast] = useState<string | null>(null);
  const galleryPositions = useGalleryPositions();

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const selectedRow = stages.find((s) => s.stage === selected) ?? defaultRow(selected);

  const onSavedRow = (next: GardenTreeStage) => {
    setStages((prev) => prev.map((s) => (s.stage === next.stage ? next : s)));
    invalidateTreeStagesCache();
  };

  return (
    <div className="max-w-3xl mx-auto px-4 pt-4">
      <p className="text-xs text-gray-500 mb-4 leading-relaxed">
        단계별로 PNG / WebP (투명 배경 권장, 1MB 이하) 이미지를 업로드하고
        크기·좌우·상하 위치를 조정할 수 있어요. 이미지가 없는 단계는 기본 SVG 가
        그대로 표시됩니다.
      </p>

      {/* 단계 카드 그리드 */}
      <div className="grid grid-cols-4 gap-2 mb-6">
        {stages.map((row) => {
          const stage = row.stage as Stage;
          const info = getStageInfo(stage);
          const accent = STAGE_ACCENT[stage];
          const isSel = stage === selected;
          const hasImage = !!row.image_url;
          return (
            <button
              key={stage}
              type="button"
              onClick={() => setSelected(stage)}
              aria-pressed={isSel}
              className={[
                "flex flex-col items-center justify-center gap-1 p-2 rounded-xl border transition text-center",
                isSel
                  ? "bg-amber-50 border-amber-300 ring-2 ring-amber-300"
                  : "bg-white border-gray-100 hover:border-gray-200 hover:shadow-sm",
              ].join(" ")}
            >
              <div className="relative w-12 h-12 flex items-center justify-center">
                {hasImage ? (
                  <img
                    src={row.image_url!}
                    alt={`${stage}단계 이미지`}
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <span className="text-3xl" aria-hidden>
                    {accent.emoji}
                  </span>
                )}
                {hasImage && (
                  <span className="absolute -top-1 -right-1 text-[8px] font-bold bg-emerald-500 text-white px-1 py-0.5 rounded-full">
                    PNG
                  </span>
                )}
              </div>
              <div className="text-[11px] font-semibold text-gray-900">{stage}단계</div>
              <div className="text-[10px] text-gray-500">{info.name}</div>
            </button>
          );
        })}
      </div>

      {/* 편집 패널 */}
      <StageEditor
        key={selected}
        row={selectedRow}
        galleryPositions={galleryPositions}
        onSaved={onSavedRow}
        onToast={setToast}
      />

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-full shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function StageEditor({
  row,
  galleryPositions,
  onSaved,
  onToast,
}: {
  row: GardenTreeStage;
  galleryPositions: Record<string, import("@/lib/types").AvatarGalleryItemPosition>;
  onSaved: (next: GardenTreeStage) => void;
  onToast: (msg: string) => void;
}) {
  const stage = row.stage as Stage;
  const info = getStageInfo(stage);
  const [scale, setScale] = useState<number>(Number(row.scale) || 1);
  const [offsetX, setOffsetX] = useState<number>(Number(row.offset_x) || 0);
  const [offsetY, setOffsetY] = useState<number>(Number(row.offset_y) || 0);
  const [imageUrl, setImageUrl] = useState<string | null>(row.image_url);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setScale(Number(row.scale) || 1);
    setOffsetX(Number(row.offset_x) || 0);
    setOffsetY(Number(row.offset_y) || 0);
    setImageUrl(row.image_url);
    setError(null);
  }, [row.stage, row.scale, row.offset_x, row.offset_y, row.image_url]);

  const previewConfig = useMemo(
    () =>
      imageUrl
        ? { url: imageUrl, scale, offsetX, offsetY }
        : null,
    [imageUrl, scale, offsetX, offsetY],
  );

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    startTransition(async () => {
      // 자동 누끼 — 모서리 색 기준 배경 제거 후 업로드.
      let processed: File;
      try {
        const { removeBackground } = await import("@/lib/image/removeBackground");
        processed = await removeBackground(file);
      } catch (err) {
        setError(`배경 제거 실패: ${(err as Error).message}`);
        return;
      }
      const fd = new FormData();
      fd.set("stage", String(stage));
      fd.set("file", processed);
      const r = await uploadTreeStageImageAction(fd);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setImageUrl(r.imageUrl);
      onSaved({
        ...row,
        image_url: r.imageUrl,
        updated_at: new Date().toISOString(),
      });
      onToast(`${stage}단계 이미지 업로드 완료 (배경 자동 제거)`);
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  };

  const onDelete = () => {
    if (!imageUrl) return;
    if (!window.confirm(`${stage}단계 이미지를 삭제할까요? (SVG fallback 으로 돌아갑니다)`)) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteTreeStageImageAction({ stage });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setImageUrl(null);
      onSaved({
        ...row,
        image_url: null,
        updated_at: new Date().toISOString(),
      });
      onToast(`${stage}단계 이미지 삭제 완료`);
    });
  };

  const onSave = () => {
    setError(null);
    startTransition(async () => {
      const r = await updateTreeStageTransformAction({ stage, scale, offsetX, offsetY });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      onSaved({
        ...row,
        scale: r.scale,
        offset_x: r.offsetX,
        offset_y: r.offsetY,
        updated_at: new Date().toISOString(),
      });
      onToast(`${stage}단계 설정 저장 완료`);
    });
  };

  const onResetTransform = () => {
    setScale(1);
    setOffsetX(0);
    setOffsetY(0);
  };

  const dirty =
    Number(row.scale) !== scale ||
    Number(row.offset_x) !== offsetX ||
    Number(row.offset_y) !== offsetY;

  return (
    <section className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">
            {stage}단계 · {info.name}
          </div>
          <div className="text-[11px] text-gray-500">
            {info.threshold}P 이상부터 표시되는 나무
          </div>
        </div>
      </div>

      {/* 미리보기 */}
      <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden mb-4">
        <div className="relative w-full aspect-[3/4] max-h-[420px] mx-auto">
          <BackgroundCanvas config={DEFAULT_BACKGROUND} rounded={12} />
          <div className="absolute inset-0 flex items-end justify-center pt-12 pb-2">
            <div className="relative flex items-end justify-center gap-0">
              <AppleTree stage={stage} size="xl" imageConfig={previewConfig} />
              <div style={{ marginLeft: -70, marginBottom: 4 }}>
                <AvatarFigure
                  config={DEFAULT_AVATAR}
                  size={170}
                  galleryPositions={galleryPositions}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 업로드 / 삭제 */}
      <div className="flex flex-wrap gap-2 mb-4">
        <label
          className={[
            "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold cursor-pointer transition",
            pending
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : "bg-emerald-500 text-white hover:bg-emerald-600",
          ].join(" ")}
        >
          {pending ? "처리 중…" : "📤 이미지 업로드 (자동 누끼)"}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/webp,image/jpeg"
            className="hidden"
            disabled={pending}
            onChange={onFile}
          />
        </label>
        <button
          type="button"
          onClick={onDelete}
          disabled={!imageUrl || pending}
          className={[
            "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition",
            !imageUrl || pending
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50",
          ].join(" ")}
        >
          🗑 이미지 삭제
        </button>
        <span className="text-[11px] text-gray-400 self-center">
          ※ PNG · WebP · JPG · 1MB 이하 — 모서리 색 기준 자동 배경 제거
        </span>
      </div>

      {/* 슬라이더 */}
      <div className="space-y-3 mb-4">
        <SliderRow
          label="크기"
          unit="%"
          min={0.5}
          max={1.5}
          step={0.05}
          value={scale}
          display={Math.round(scale * 100)}
          onChange={setScale}
          range="(50% ~ 150%)"
        />
        <SliderRow
          label="좌우"
          unit=""
          min={-50}
          max={50}
          step={1}
          value={offsetX}
          display={Math.round(offsetX)}
          onChange={setOffsetX}
          range="(-50 ~ +50)"
        />
        <SliderRow
          label="상하"
          unit=""
          min={-50}
          max={50}
          step={1}
          value={offsetY}
          display={Math.round(offsetY)}
          onChange={setOffsetY}
          range="(-50 ~ +50)"
        />
      </div>

      {error && (
        <div className="mb-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onResetTransform}
          disabled={pending}
          className="px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
        >
          기본값
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={pending || !dirty}
          className={[
            "flex-1 px-4 py-2 rounded-lg text-sm font-bold transition",
            pending || !dirty
              ? "bg-gray-200 text-gray-400 cursor-not-allowed"
              : "bg-amber-500 text-white hover:bg-amber-600",
          ].join(" ")}
        >
          {pending ? "저장 중…" : dirty ? "저장" : "변경 사항 없음"}
        </button>
      </div>
    </section>
  );
}

function SliderRow({
  label,
  unit,
  min,
  max,
  step,
  value,
  display,
  onChange,
  range,
}: {
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: number;
  onChange: (v: number) => void;
  range: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-semibold text-gray-700 mb-1">
        <span>{label}</span>
        <span className="tabular-nums text-gray-900">
          {display}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-amber-500"
      />
      <div className="text-[10px] text-gray-400 mt-0.5">{range}</div>
    </div>
  );
}

function defaultRow(stage: number): GardenTreeStage {
  return {
    stage,
    image_url: null,
    scale: 1,
    offset_x: 0,
    offset_y: 0,
    updated_at: new Date().toISOString(),
  };
}

function normalize(rows: GardenTreeStage[]): GardenTreeStage[] {
  const map = new Map(rows.map((r) => [r.stage, r]));
  const out: GardenTreeStage[] = [];
  for (let s = 1; s <= 8; s++) {
    out.push(map.get(s) ?? defaultRow(s));
  }
  return out;
}
