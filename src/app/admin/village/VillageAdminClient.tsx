"use client";

// 마을 관리 UI — 배경/시즌 + 건물 카드 5개 + 미리보기.
// 업로드 시 자동 누끼는 하지 않는다 (마을 건물 이미지는 디자이너가 직접 투명 PNG 로 준비).

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { VillageBuilding, VillageSettings } from "@/lib/types";
import {
  deleteBuildingImageAction,
  deleteVillageBackgroundAction,
  updateBuildingAction,
  updateVillageSeasonAction,
  uploadBuildingImageAction,
  uploadVillageBackgroundAction,
} from "./actions";

type Props = {
  initialSettings: VillageSettings | null;
  initialBuildings: VillageBuilding[];
};

export function VillageAdminClient({ initialSettings, initialBuildings }: Props) {
  const [settings, setSettings] = useState<VillageSettings | null>(initialSettings);
  const [buildings, setBuildings] = useState<VillageBuilding[]>(initialBuildings);
  const [toast, setToast] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const onBuildingChanged = (next: VillageBuilding) => {
    setBuildings((prev) => prev.map((b) => (b.id === next.id ? next : b)));
  };

  return (
    <div className="max-w-3xl mx-auto px-4 pt-4 space-y-6">
      <p className="text-xs text-gray-500 leading-relaxed">
        학생이 로그인 후 처음 만나는 마을 화면이에요. 배경 1장 + 건물 5개를 PNG/JPG/WebP
        (2MB 이하) 로 업로드하고, 각 건물의 위치(%)와 오픈 여부를 조정할 수 있어요.
      </p>

      <BackgroundSection
        settings={settings}
        onSettingsChange={setSettings}
        onToast={setToast}
      />

      {/* ① 건물별 이미지 + 설정 (카드) — 가장 먼저 보이도록 */}
      <section className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="mb-3">
          <h2 className="text-base font-semibold text-gray-900">🏠 건물별 이미지 & 설정</h2>
          <p className="text-[11px] text-gray-500 mt-0.5">
            각 카드에서 이미지를 업로드하고, 말풍선 소개·위치·회전·오픈 여부를 설정해요.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {buildings.map((b) => (
            <BuildingCard
              key={b.id}
              building={b}
              onChange={onBuildingChanged}
              onToast={setToast}
            />
          ))}
        </div>
      </section>

      {/* ② 미리보기 — 드래그로 위치/회전/크기 정렬 */}
      <section className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">🎯 위치 / 회전 / 크기 정렬</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              건물을 <b>드래그</b>로 이동, 우하단 <b>↘</b> 로 크기, 상단 <b>↻</b> 로 회전. 손을 떼면 자동 저장돼요.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg px-3 py-1.5 transition shrink-0"
          >
            {showPreview ? "닫기" : "열기 ↓"}
          </button>
        </div>
        {showPreview && (
          <InteractiveVillagePreview
            settings={settings}
            buildings={buildings}
            onBuildingChange={onBuildingChanged}
            onToast={setToast}
          />
        )}
      </section>

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

/* ============== 배경 섹션 ============== */

function BackgroundSection({
  settings,
  onSettingsChange,
  onToast,
}: {
  settings: VillageSettings | null;
  onSettingsChange: (s: VillageSettings) => void;
  onToast: (msg: string) => void;
}) {
  const [seasonInput, setSeasonInput] = useState<string>(settings?.season ?? "기본");
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSeasonInput(settings?.season ?? "기본");
  }, [settings?.season]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    startTransition(async () => {
      const fd = new FormData();
      fd.set("file", file);
      const r = await uploadVillageBackgroundAction(fd);
      if (!r.ok) {
        onToast(r.message);
        return;
      }
      onSettingsChange({
        id: settings?.id ?? "",
        background_image: r.url,
        season: settings?.season ?? "기본",
        is_active: settings?.is_active ?? true,
        updated_at: new Date().toISOString(),
      });
      onToast("배경 이미지를 업데이트했어요.");
    });
  };

  const onDelete = () => {
    if (!settings?.background_image) return;
    if (!confirm("배경 이미지를 삭제할까요?")) return;
    startTransition(async () => {
      const r = await deleteVillageBackgroundAction();
      if (!r.ok) {
        onToast(r.message);
        return;
      }
      onSettingsChange({
        id: settings?.id ?? "",
        background_image: null,
        season: settings?.season ?? "기본",
        is_active: settings?.is_active ?? true,
        updated_at: new Date().toISOString(),
      });
      onToast("배경 이미지를 삭제했어요.");
    });
  };

  const onSaveSeason = () => {
    startTransition(async () => {
      const r = await updateVillageSeasonAction({ season: seasonInput });
      if (!r.ok) {
        onToast(r.message);
        return;
      }
      onSettingsChange({
        id: settings?.id ?? "",
        background_image: settings?.background_image ?? null,
        season: r.season,
        is_active: settings?.is_active ?? true,
        updated_at: new Date().toISOString(),
      });
      onToast("시즌을 저장했어요.");
    });
  };

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-4">
      <h2 className="text-sm font-semibold text-gray-900 mb-3">마을 배경</h2>

      <div className="aspect-[16/9] w-full rounded-xl overflow-hidden bg-gradient-to-b from-slate-800 to-emerald-700 flex items-center justify-center mb-3">
        {settings?.background_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={settings.background_image}
            alt="마을 배경"
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-white/80 text-sm">아직 배경 이미지가 없어요</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          type="button"
          disabled={pending}
          onClick={() => fileRef.current?.click()}
          className="text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 rounded-lg px-4 py-2 transition"
        >
          {pending ? "업로드 중…" : settings?.background_image ? "배경 변경" : "배경 업로드"}
        </button>
        {settings?.background_image && (
          <button
            type="button"
            disabled={pending}
            onClick={onDelete}
            className="text-sm font-semibold text-gray-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg px-3 py-2 transition"
          >
            삭제
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={onFile}
        />
      </div>

      <label className="block text-xs font-semibold text-gray-700 mb-1">시즌 이름</label>
      <div className="flex items-center gap-2">
        <input
          value={seasonInput}
          onChange={(e) => setSeasonInput(e.target.value)}
          maxLength={40}
          className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
          placeholder="예: 기본 / 크리스마스 / 여름"
        />
        <button
          type="button"
          onClick={onSaveSeason}
          disabled={pending || seasonInput.trim() === (settings?.season ?? "")}
          className="text-sm font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 disabled:opacity-40 rounded-lg px-3 py-2 transition"
        >
          저장
        </button>
      </div>
    </section>
  );
}

/* ============== 건물 카드 ============== */

function BuildingCard({
  building,
  onChange,
  onToast,
}: {
  building: VillageBuilding;
  onChange: (next: VillageBuilding) => void;
  onToast: (msg: string) => void;
}) {
  const [positionTop, setPositionTop] = useState(building.position_top);
  const [positionLeft, setPositionLeft] = useState(building.position_left ?? "");
  const [positionRight, setPositionRight] = useState(building.position_right ?? "");
  const [size, setSize] = useState(building.size);
  const [rotation, setRotation] = useState<number>(building.rotation ?? 0);
  const [description, setDescription] = useState<string>(building.description ?? "");
  const [isReady, setIsReady] = useState(building.is_ready);
  const [isVisible, setIsVisible] = useState(building.is_visible);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setPositionTop(building.position_top);
    setPositionLeft(building.position_left ?? "");
    setPositionRight(building.position_right ?? "");
    setSize(building.size);
    setRotation(building.rotation ?? 0);
    setDescription(building.description ?? "");
    setIsReady(building.is_ready);
    setIsVisible(building.is_visible);
  }, [building.id, building.position_top, building.position_left, building.position_right, building.size, building.rotation, building.description, building.is_ready, building.is_visible]);

  const dirty =
    positionTop !== building.position_top ||
    (positionLeft || "") !== (building.position_left ?? "") ||
    (positionRight || "") !== (building.position_right ?? "") ||
    size !== building.size ||
    Math.abs(rotation - (building.rotation ?? 0)) >= 0.5 ||
    description.trim() !== (building.description ?? "").trim() ||
    isReady !== building.is_ready ||
    isVisible !== building.is_visible;

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    startTransition(async () => {
      const fd = new FormData();
      fd.set("buildingKey", building.building_key);
      fd.set("file", file);
      const r = await uploadBuildingImageAction(fd);
      if (!r.ok) {
        onToast(r.message);
        return;
      }
      onChange({ ...building, image_url: r.url, updated_at: new Date().toISOString() });
      onToast(`${building.name} 이미지를 업데이트했어요.`);
    });
  };

  const onDeleteImage = () => {
    if (!building.image_url) return;
    if (!confirm(`${building.name} 이미지를 삭제할까요?`)) return;
    startTransition(async () => {
      const r = await deleteBuildingImageAction({ buildingKey: building.building_key });
      if (!r.ok) {
        onToast(r.message);
        return;
      }
      onChange({ ...building, image_url: null, updated_at: new Date().toISOString() });
      onToast(`${building.name} 이미지를 삭제했어요.`);
    });
  };

  const onSave = () => {
    startTransition(async () => {
      const r = await updateBuildingAction({
        buildingKey: building.building_key,
        positionTop,
        positionLeft: positionLeft || null,
        positionRight: positionRight || null,
        size,
        rotation,
        description,
        isReady,
        isVisible,
      });
      if (!r.ok) {
        onToast(r.message);
        return;
      }
      onChange({
        ...building,
        position_top: positionTop,
        position_left: positionLeft || null,
        position_right: positionRight || null,
        size,
        rotation,
        description: description.trim(),
        is_ready: isReady,
        is_visible: isVisible,
        updated_at: new Date().toISOString(),
      });
      onToast(`${building.name} 설정을 저장했어요.`);
    });
  };

  return (
    <div className="bg-gray-50 rounded-xl border border-gray-100 p-3">
      <div className="flex items-baseline justify-between mb-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900 truncate">{building.name}</div>
          <div className="text-[11px] text-gray-400 truncate">{building.link}</div>
        </div>
        {building.image_url && (
          <button
            type="button"
            disabled={pending}
            onClick={onDeleteImage}
            className="text-[10px] font-semibold text-gray-500 hover:text-rose-600 hover:bg-rose-50 rounded px-2 py-1 transition shrink-0"
          >
            이미지 삭제
          </button>
        )}
      </div>

      {/* 큰 이미지 업로드 영역 — 클릭 가능. 빈 상태일 때 명확한 안내. */}
      <button
        type="button"
        disabled={pending}
        onClick={() => fileRef.current?.click()}
        aria-label={`${building.name} 이미지 업로드`}
        className={[
          "w-full aspect-[16/10] mb-3 rounded-lg border-2 border-dashed transition flex items-center justify-center overflow-hidden relative",
          building.image_url
            ? "border-transparent bg-white hover:border-amber-300"
            : "border-amber-300 bg-amber-50 hover:bg-amber-100 hover:border-amber-400",
        ].join(" ")}
      >
        {building.image_url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={building.image_url}
              alt={building.name}
              className="max-w-[80%] max-h-[80%] object-contain pointer-events-none"
            />
            <span className="absolute bottom-1 right-1 text-[10px] font-semibold text-white bg-black/60 rounded px-1.5 py-0.5">
              {pending ? "처리 중…" : "이미지 변경"}
            </span>
          </>
        ) : (
          <span className="text-xs font-semibold text-amber-700 text-center px-3">
            {pending ? "업로드 중…" : "📁 이미지 업로드 (PNG / JPG / WebP, 2MB↓)"}
          </span>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={onFile}
      />

      <div className="grid grid-cols-2 gap-2 mb-3">
        <PercentField label="top" value={positionTop} onChange={setPositionTop} />
        <PercentField label="size" value={size} onChange={setSize} />
        <PercentField label="left" value={positionLeft} onChange={setPositionLeft} optional />
        <PercentField label="right" value={positionRight} onChange={setPositionRight} optional />
      </div>
      <p className="text-[10px] text-gray-400 mb-3">
        ※ left / right 중 한 쪽만 채워주세요. 둘 다 채우면 left 가 우선합니다.
      </p>

      <div className="mb-3">
        <div className="flex items-center justify-between text-[10px] font-semibold text-gray-500 mb-1">
          <span>회전 (rotation)</span>
          <button
            type="button"
            onClick={() => setRotation(0)}
            className="text-[10px] text-gray-400 hover:text-gray-700"
          >
            0°로 초기화
          </button>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={-180}
            max={180}
            step={1}
            value={Math.round(rotation)}
            onChange={(e) => setRotation(Number(e.target.value))}
            className="flex-1 accent-sky-500"
          />
          <input
            type="number"
            value={Math.round(rotation)}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) setRotation(v);
            }}
            min={-180}
            max={180}
            step={1}
            className="w-16 px-2 py-1 rounded-md border border-gray-200 text-xs text-right bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
          />
          <span className="text-[11px] text-gray-500">°</span>
        </div>
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between text-[10px] font-semibold text-gray-500 mb-1">
          <span>말풍선 소개 (description)</span>
          <span className="text-gray-400">{description.length} / 200</span>
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 200))}
          rows={2}
          placeholder="학생 화면에서 건물 위에 마우스/손가락을 올리면 보일 짧은 소개"
          className="w-full px-2 py-1.5 rounded-md border border-gray-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none leading-snug"
        />
      </div>

      <div className="flex items-center justify-between text-xs text-gray-700 mb-1">
        <span>오픈 여부 (is_ready)</span>
        <Toggle value={isReady} onChange={setIsReady} />
      </div>
      <div className="flex items-center justify-between text-xs text-gray-700 mb-3">
        <span>표시 여부 (is_visible)</span>
        <Toggle value={isVisible} onChange={setIsVisible} />
      </div>

      <button
        type="button"
        onClick={onSave}
        disabled={!dirty || pending}
        className="w-full text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 rounded-lg py-2 transition"
      >
        저장
      </button>
    </div>
  );
}

function PercentField({
  label,
  value,
  onChange,
  optional,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  optional?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold text-gray-500 block mb-1">
        {label}
        {optional && <span className="text-gray-400"> (선택)</span>}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={optional ? "" : "예: 30%"}
        inputMode="decimal"
        className="w-full px-2 py-1.5 rounded-md border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
      />
    </label>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={[
        "relative inline-flex h-6 w-11 items-center rounded-full transition",
        value ? "bg-emerald-500" : "bg-gray-300",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition",
          value ? "translate-x-5" : "translate-x-0.5",
        ].join(" ")}
      />
    </button>
  );
}

/* ============== 인터랙티브 미리보기 (드래그 / 리사이즈) ============== */

function parsePct(v: string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim().replace("%", "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// 현재 저장된 위치를 left(%) 기준으로 정규화. right 만 있으면 left = 100 - right - size 로 환산.
function effectiveLeft(b: VillageBuilding): number {
  if (b.position_left) return parsePct(b.position_left);
  if (b.position_right) return clamp(100 - parsePct(b.position_right) - parsePct(b.size), 0, 100);
  return 50;
}

type DragState = {
  buildingId: string;
  mode: "move" | "resize" | "rotate";
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startTop: number;
  startLeft: number;
  startSize: number;
  startRotation: number;
  // 회전용 — 건물 중심점(화면 px) + 시작 시 포인터-중심 각도(rad)
  centerX: number;
  centerY: number;
  startPointerAngleRad: number;
};

function normalizeAngle(deg: number): number {
  let n = deg % 360;
  if (n > 180) n -= 360;
  if (n <= -180) n += 360;
  return n;
}

function InteractiveVillagePreview({
  settings,
  buildings,
  onBuildingChange,
  onToast,
}: {
  settings: VillageSettings | null;
  buildings: VillageBuilding[];
  onBuildingChange: (b: VillageBuilding) => void;
  onToast: (msg: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [transient, setTransient] = useState<
    Record<string, { top: number; left: number; size: number; rotation: number }>
  >({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const uploadInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  const onPickFile = (b: VillageBuilding) => async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingKey(b.building_key);
    try {
      const fd = new FormData();
      fd.set("buildingKey", b.building_key);
      fd.set("file", file);
      const r = await uploadBuildingImageAction(fd);
      if (!r.ok) {
        onToast(r.message);
        return;
      }
      onBuildingChange({ ...b, image_url: r.url, updated_at: new Date().toISOString() });
      onToast(`${b.name} 이미지를 업데이트했어요.`);
    } finally {
      setUploadingKey(null);
    }
  };

  const visible = useMemo(
    () => buildings.filter((b) => b.is_visible).sort((a, b) => a.display_order - b.display_order),
    [buildings],
  );

  const bgStyle: React.CSSProperties = settings?.background_image
    ? {
        backgroundImage: `url(${settings.background_image})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : { background: "linear-gradient(180deg, #0f172a 0%, #064e3b 100%)" };

  const handlePointerDown = (
    e: React.PointerEvent<HTMLElement>,
    b: VillageBuilding,
    mode: "move" | "resize" | "rotate",
    refEl?: HTMLElement | null,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    // 회전 모드에서는 건물 박스의 중심점이 필요하다.
    // refEl 은 회전 핸들이 부착된 건물 컨테이너(또는 가장 가까운 ancestor).
    let centerX = 0;
    let centerY = 0;
    let startPointerAngleRad = 0;
    if (mode === "rotate") {
      const box = (refEl ?? (e.currentTarget as HTMLElement).closest("[data-building]")) as HTMLElement | null;
      const rect = (box ?? (e.currentTarget as HTMLElement)).getBoundingClientRect();
      centerX = rect.left + rect.width / 2;
      centerY = rect.top + rect.height / 2;
      startPointerAngleRad = Math.atan2(e.clientY - centerY, e.clientX - centerX);
    }

    setSelectedId(b.id);
    setDrag({
      buildingId: b.id,
      mode,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startTop: parsePct(b.position_top),
      startLeft: effectiveLeft(b),
      startSize: parsePct(b.size),
      startRotation: b.rotation ?? 0,
      centerX,
      centerY,
      startPointerAngleRad,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const dxPct = ((e.clientX - drag.startClientX) / rect.width) * 100;
    const dyPct = ((e.clientY - drag.startClientY) / rect.height) * 100;

    if (drag.mode === "move") {
      const size = transient[drag.buildingId]?.size ?? drag.startSize;
      const rotation = transient[drag.buildingId]?.rotation ?? drag.startRotation;
      const newLeft = clamp(drag.startLeft + dxPct, 0, Math.max(0, 100 - size));
      const newTop = clamp(drag.startTop + dyPct, 0, 100);
      setTransient((prev) => ({
        ...prev,
        [drag.buildingId]: { top: newTop, left: newLeft, size, rotation },
      }));
    } else if (drag.mode === "resize") {
      const rotation = transient[drag.buildingId]?.rotation ?? drag.startRotation;
      const newSize = clamp(drag.startSize + dxPct, 5, 100 - drag.startLeft);
      setTransient((prev) => ({
        ...prev,
        [drag.buildingId]: {
          top: drag.startTop,
          left: drag.startLeft,
          size: newSize,
          rotation,
        },
      }));
    } else {
      // rotate: 건물 중심점 기준 포인터 각도 변화량만큼 회전.
      const currentAngleRad = Math.atan2(e.clientY - drag.centerY, e.clientX - drag.centerX);
      const deltaDeg = ((currentAngleRad - drag.startPointerAngleRad) * 180) / Math.PI;
      const newRotation = normalizeAngle(drag.startRotation + deltaDeg);
      setTransient((prev) => ({
        ...prev,
        [drag.buildingId]: {
          top: drag.startTop,
          left: drag.startLeft,
          size: drag.startSize,
          rotation: newRotation,
        },
      }));
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLElement>) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    const tr = transient[drag.buildingId];
    const targetId = drag.buildingId;
    setDrag(null);

    if (!tr) return;

    const building = buildings.find((b) => b.id === targetId);
    if (!building) return;

    const startRotation = building.rotation ?? 0;
    const noChange =
      Math.abs(tr.top - parsePct(building.position_top)) < 0.5 &&
      Math.abs(tr.left - effectiveLeft(building)) < 0.5 &&
      Math.abs(tr.size - parsePct(building.size)) < 0.5 &&
      Math.abs(normalizeAngle(tr.rotation - startRotation)) < 0.5;

    if (noChange) {
      setTransient((prev) => {
        const next = { ...prev };
        delete next[targetId];
        return next;
      });
      return;
    }

    const positionTop = `${round1(tr.top)}%`;
    const positionLeft = `${round1(tr.left)}%`;
    const size = `${round1(tr.size)}%`;
    const rotation = round1(tr.rotation);

    (async () => {
      const r = await updateBuildingAction({
        buildingKey: building.building_key,
        positionTop,
        positionLeft,
        positionRight: null,
        size,
        rotation,
      });
      if (!r.ok) {
        onToast(r.message);
        setTransient((prev) => {
          const next = { ...prev };
          delete next[targetId];
          return next;
        });
        return;
      }
      onBuildingChange({
        ...building,
        position_top: positionTop,
        position_left: positionLeft,
        position_right: null,
        size,
        rotation,
        updated_at: new Date().toISOString(),
      });
      setTransient((prev) => {
        const next = { ...prev };
        delete next[targetId];
        return next;
      });
    })();
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLElement>) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const id = drag.buildingId;
    setDrag(null);
    setTransient((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const dragInfo = drag ? transient[drag.buildingId] : null;
  const dragBuilding = drag ? buildings.find((b) => b.id === drag.buildingId) : null;

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="relative w-full aspect-[16/9] rounded-xl overflow-hidden border border-gray-200 select-none"
        style={bgStyle}
        onClick={() => setSelectedId(null)}
      >
        {visible.map((b) => {
          const t = transient[b.id];
          const top = t ? `${t.top}%` : b.position_top;
          const size = t ? `${t.size}%` : b.size;
          const rotation = t ? t.rotation : (b.rotation ?? 0);

          const positionStyle: React.CSSProperties = {
            position: "absolute",
            top,
            width: size,
            touchAction: "none",
            cursor: drag?.buildingId === b.id ? "grabbing" : "grab",
          };

          if (t) {
            positionStyle.left = `${t.left}%`;
          } else if (b.position_left) {
            positionStyle.left = b.position_left;
          } else if (b.position_right) {
            positionStyle.right = b.position_right;
          } else {
            positionStyle.left = "50%";
          }

          const isSelected = selectedId === b.id;
          const isDragging = drag?.buildingId === b.id;

          return (
            <div
              key={b.id}
              data-building={b.id}
              style={positionStyle}
              className={[
                "text-center group",
                isSelected ? "z-30" : "z-10",
              ].join(" ")}
              onPointerDown={(e) => handlePointerDown(e, b, "move")}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedId(b.id);
              }}
            >
              {/* 회전 박스 — 이미지 + 선택 outline + 핸들들이 함께 회전 */}
              <div
                className={[
                  "relative w-full rounded-lg",
                  isSelected
                    ? "outline outline-2 outline-amber-400 outline-offset-2"
                    : "outline outline-1 outline-white/30 outline-offset-1 opacity-95",
                  isDragging ? "opacity-90" : "",
                ].join(" ")}
                style={{ transform: rotation ? `rotate(${rotation}deg)` : undefined }}
              >
                {b.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={b.image_url}
                    alt={b.name}
                    draggable={false}
                    className="w-full h-auto object-contain pointer-events-none"
                  />
                ) : (
                  <div className="w-full aspect-square bg-white/20 border border-white/40 rounded-xl flex items-center justify-center">
                    <span className="text-white text-xs px-2 text-center">{b.name}</span>
                  </div>
                )}

                {isSelected && (
                  <>
                    {/* 회전 핸들 — 상단 가운데 위로 살짝 띄움 */}
                    <div
                      className="absolute left-1/2 -top-7 -translate-x-1/2 flex flex-col items-center pointer-events-none"
                      aria-hidden
                    >
                      <div className="w-px h-3 bg-amber-400" />
                    </div>
                    <button
                      type="button"
                      aria-label={`${b.name} 회전`}
                      onPointerDown={(e) => handlePointerDown(e, b, "rotate")}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerCancel}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute -top-10 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-sky-400 border-2 border-white shadow-md flex items-center justify-center text-[11px] text-white font-bold"
                      style={{ touchAction: "none", cursor: "grab" }}
                    >
                      ↻
                    </button>

                    {/* 리사이즈 핸들 — 우하단 */}
                    <button
                      type="button"
                      aria-label={`${b.name} 크기 조절`}
                      onPointerDown={(e) => handlePointerDown(e, b, "resize")}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerCancel}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute -right-2 -bottom-2 w-6 h-6 rounded-full bg-amber-400 border-2 border-white shadow-md flex items-center justify-center text-[10px] text-white font-bold"
                      style={{ touchAction: "none", cursor: "nwse-resize" }}
                    >
                      ↘
                    </button>

                    {/* 빠른 업로드 — 좌하단 */}
                    <button
                      type="button"
                      aria-label={`${b.name} 이미지 업로드`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        uploadInputRefs.current[b.building_key]?.click();
                      }}
                      className="absolute -left-2 -bottom-2 px-2 h-6 rounded-full bg-emerald-500 hover:bg-emerald-600 border-2 border-white shadow-md flex items-center justify-center text-[10px] text-white font-bold gap-1"
                      style={{ cursor: "pointer" }}
                    >
                      {uploadingKey === b.building_key ? "업로드중…" : "📁 이미지"}
                    </button>
                    <input
                      ref={(el) => {
                        uploadInputRefs.current[b.building_key] = el;
                      }}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={onPickFile(b)}
                    />
                  </>
                )}
              </div>
              <div className="mt-1 inline-block bg-black/60 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full pointer-events-none">
                {b.name}
                {!b.is_ready && <span className="ml-1 text-amber-200">· 준비중</span>}
              </div>
            </div>
          );
        })}

        {/* 드래그 중 좌표 표시 */}
        {drag && dragBuilding && dragInfo && (
          <div className="absolute top-2 left-2 bg-black/70 text-white text-[10px] font-mono px-2 py-1 rounded pointer-events-none">
            {dragBuilding.name} · top {round1(dragInfo.top)}% · left {round1(dragInfo.left)}% · size {round1(dragInfo.size)}% · rot {round1(dragInfo.rotation)}°
          </div>
        )}
      </div>

      <p className="text-[11px] text-gray-500 leading-relaxed">
        💡 건물을 <b>탭</b> → 노란 테두리 + 핸들 표시 → 본체 <b>드래그</b>로 이동, 우하단 <b>↘</b> 로 크기,
        상단 <b>↻</b> 로 회전. 손을 떼면 자동 저장돼요. 드래그 후에는 left 기준으로 좌표가 통일됩니다.
      </p>
    </div>
  );
}
