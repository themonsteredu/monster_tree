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
  const [showPreview, setShowPreview] = useState(false);

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

      <section className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900">건물 5종</h2>
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg px-3 py-1.5 transition"
          >
            {showPreview ? "미리보기 닫기" : "미리보기 열기 ↓"}
          </button>
        </div>

        {showPreview && (
          <VillagePreview settings={settings} buildings={buildings} />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
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

      <div className="aspect-[16/10] w-full rounded-xl overflow-hidden bg-gradient-to-b from-slate-800 to-emerald-700 flex items-center justify-center mb-3">
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
  const [isReady, setIsReady] = useState(building.is_ready);
  const [isVisible, setIsVisible] = useState(building.is_visible);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setPositionTop(building.position_top);
    setPositionLeft(building.position_left ?? "");
    setPositionRight(building.position_right ?? "");
    setSize(building.size);
    setIsReady(building.is_ready);
    setIsVisible(building.is_visible);
  }, [building.id, building.position_top, building.position_left, building.position_right, building.size, building.is_ready, building.is_visible]);

  const dirty =
    positionTop !== building.position_top ||
    (positionLeft || "") !== (building.position_left ?? "") ||
    (positionRight || "") !== (building.position_right ?? "") ||
    size !== building.size ||
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
        is_ready: isReady,
        is_visible: isVisible,
        updated_at: new Date().toISOString(),
      });
      onToast(`${building.name} 설정을 저장했어요.`);
    });
  };

  return (
    <div className="bg-gray-50 rounded-xl border border-gray-100 p-3">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-16 h-16 rounded-lg bg-white border border-gray-100 flex items-center justify-center overflow-hidden shrink-0">
          {building.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={building.image_url} alt={building.name} className="max-w-full max-h-full object-contain" />
          ) : (
            <span className="text-[10px] text-gray-400">이미지 없음</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-gray-900 truncate">{building.name}</div>
          <div className="text-[11px] text-gray-400 truncate">{building.link}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => fileRef.current?.click()}
          className="text-xs font-semibold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 rounded-lg px-3 py-1.5 transition"
        >
          {pending ? "처리 중…" : "이미지 변경"}
        </button>
        {building.image_url && (
          <button
            type="button"
            disabled={pending}
            onClick={onDeleteImage}
            className="text-xs font-semibold text-gray-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg px-2 py-1.5 transition"
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

      <div className="grid grid-cols-2 gap-2 mb-3">
        <PercentField label="top" value={positionTop} onChange={setPositionTop} />
        <PercentField label="size" value={size} onChange={setSize} />
        <PercentField label="left" value={positionLeft} onChange={setPositionLeft} optional />
        <PercentField label="right" value={positionRight} onChange={setPositionRight} optional />
      </div>
      <p className="text-[10px] text-gray-400 mb-3">
        ※ left / right 중 한 쪽만 채워주세요. 둘 다 채우면 left 가 우선합니다.
      </p>

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

/* ============== 미리보기 ============== */

function VillagePreview({
  settings,
  buildings,
}: {
  settings: VillageSettings | null;
  buildings: VillageBuilding[];
}) {
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
    : {
        background: "linear-gradient(180deg, #0f172a 0%, #064e3b 100%)",
      };

  return (
    <div
      className="relative w-full aspect-[9/16] max-h-[560px] rounded-xl overflow-hidden border border-gray-200"
      style={bgStyle}
    >
      {visible.map((b) => {
        const positionStyle: React.CSSProperties = {
          position: "absolute",
          top: b.position_top,
          width: b.size,
        };
        if (b.position_left) positionStyle.left = b.position_left;
        else if (b.position_right) positionStyle.right = b.position_right;
        else positionStyle.left = "50%";

        return (
          <div key={b.id} style={positionStyle} className="text-center">
            {b.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.image_url} alt={b.name} className="w-full h-auto object-contain pointer-events-none" />
            ) : (
              <div className="w-full aspect-square bg-white/20 border border-white/40 rounded-xl flex items-center justify-center">
                <span className="text-white text-xs">{b.name}</span>
              </div>
            )}
            <div className="mt-1 inline-block bg-black/60 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
              {b.name}
              {!b.is_ready && <span className="ml-1 text-amber-200">· 준비중</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
