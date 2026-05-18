"use client";

// 마이룸 날씨 / 분위기 선택 시트.
// 8가지 옵션을 2×4 그리드로 표시. 누르면 즉시 적용 + 시트 닫힘.

import { useEffect, useState, useTransition } from "react";
import type { WeatherType } from "@/lib/types";
import { WEATHER_TYPES, WEATHER_LABEL } from "@/lib/types";
import { setWeatherAction } from "@/app/me/actions";

export function WeatherPickerSheet({
  open,
  current,
  onClose,
  onApplied,
}: {
  open: boolean;
  current: WeatherType;
  onClose: () => void;
  onApplied: (w: WeatherType) => void;
}) {
  const [selected, setSelected] = useState<WeatherType>(current);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setSelected(current);
  }, [open, current]);

  if (!open) return null;

  const apply = (w: WeatherType) => {
    setSelected(w);
    setError(null);
    startTransition(async () => {
      const r = await setWeatherAction({ weather: w });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      onApplied(w);
      onClose();
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 flex items-end sm:items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">오늘의 마당 분위기</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-lg leading-none p-1"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          {WEATHER_TYPES.map((w) => {
            const isActive = selected === w;
            const meta = WEATHER_LABEL[w];
            return (
              <button
                key={w}
                type="button"
                onClick={() => apply(w)}
                disabled={pending}
                className={[
                  "flex flex-col items-center justify-center gap-1 py-4 rounded-2xl border-2 transition disabled:opacity-60",
                  isActive
                    ? "bg-amber-50 border-amber-400 text-amber-900"
                    : "bg-gray-50 border-transparent hover:bg-gray-100 text-gray-700",
                ].join(" ")}
              >
                <span className="text-2xl leading-none" aria-hidden>
                  {meta.icon}
                </span>
                <span className="text-[11px] font-semibold">{meta.name}</span>
              </button>
            );
          })}
        </div>

        <p className="text-[11px] text-gray-400 text-center">
          탭하면 즉시 적용돼요. "맑음" 을 선택하면 효과가 꺼집니다.
        </p>

        {error && (
          <div className="mt-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg p-2 text-center">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
