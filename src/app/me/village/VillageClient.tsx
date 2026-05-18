"use client";

// 몬스터 마을 학생 화면.
// - 배경 이미지(없으면 그라데이션) 위에 건물을 절대좌표로 배치.
// - is_ready=true 인 건물은 해당 경로로 이동, false 면 "곧 오픈 예정" 토스트.
// - 모바일 한 화면에 들어맞도록 9:16 비율의 컨테이너 사용.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { VillageBuilding, VillageSettings } from "@/lib/types";

type Props = {
  settings: VillageSettings | null;
  buildings: VillageBuilding[];
  studentName: string;
  totalPoints: number;
};

export function VillageClient({ settings, buildings, studentName, totalPoints }: Props) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  const visible = useMemo(
    () => buildings.filter((b) => b.is_visible),
    [buildings],
  );

  const onBuildingClick = (b: VillageBuilding) => {
    if (b.is_ready) {
      router.push(b.link);
      return;
    }
    setToast(`${b.name}은(는) 곧 오픈 예정이에요! 기대해주세요 🎉`);
  };

  // 배경은 16:9 — 컨테이너도 16:9 로 고정해야 좌표 매핑이 어긋나지 않는다.
  // mobile portrait: 너비 기준 (위/아래 레터박스), PC wide: 높이 기준 (좌/우 레터박스).
  const stageStyle: React.CSSProperties = {
    position: "relative",
    width: "min(100vw, calc(100dvh * 16 / 9))",
    maxHeight: "100dvh",
    aspectRatio: "16 / 9",
    ...(settings?.background_image
      ? {
          backgroundImage: `url(${settings.background_image})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }
      : { background: "linear-gradient(180deg, #0f172a 0%, #064e3b 100%)" }),
  };

  return (
    <main className="fixed inset-0 bg-black overflow-hidden text-white flex items-center justify-center">
      {/* 상단 정보 — 레터박스 영역까지 덮도록 main 기준 absolute */}
      <header className="absolute top-0 inset-x-0 z-30 px-4 pt-3 flex items-start justify-between gap-3 pointer-events-none">
        <h1
          className="text-lg sm:text-xl font-extrabold tracking-tight"
          style={{ textShadow: "0 2px 8px rgba(0,0,0,0.6)" }}
        >
          몬스터 마을
        </h1>
        <div className="bg-black/55 backdrop-blur-sm rounded-full px-3 py-1.5 text-xs font-semibold flex items-center gap-2 pointer-events-auto">
          <span className="text-white/90">{studentName}</span>
          <span className="text-amber-300">⭐ {totalPoints}</span>
        </div>
      </header>

      {/* 16:9 무대 */}
      <div style={stageStyle}>
        {visible.map((b) => {
          const style: React.CSSProperties = {
            position: "absolute",
            top: b.position_top,
            width: b.size,
            transition: "transform 0.15s ease",
          };
          if (b.position_left) style.left = b.position_left;
          else if (b.position_right) style.right = b.position_right;
          else style.left = "50%";

          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onBuildingClick(b)}
              style={style}
              className="group focus:outline-none active:scale-95"
              aria-label={`${b.name}${b.is_ready ? "" : " (준비 중)"}`}
            >
              <div className="w-full transition-transform group-hover:scale-105 group-active:scale-95">
                {b.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={b.image_url}
                    alt={b.name}
                    draggable={false}
                    className="w-full h-auto object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.45)]"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                    }}
                  />
                ) : (
                  <div className="w-full aspect-square bg-white/15 border border-white/40 rounded-xl flex items-center justify-center backdrop-blur-sm">
                    <span className="text-white text-[11px] font-semibold px-2 text-center">
                      {b.name}
                    </span>
                  </div>
                )}
              </div>
              <div className="mt-1 inline-block bg-black/65 text-white text-[10px] sm:text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
                {b.name}
                {!b.is_ready && <span className="ml-1 text-amber-200">· 준비중</span>}
              </div>
            </button>
          );
        })}
      </div>

      {/* 토스트 */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 bg-black/80 text-white text-sm font-medium px-4 py-2.5 rounded-full shadow-lg animate-[villagefadein_0.15s_ease-out]"
        >
          {toast}
        </div>
      )}

      <style jsx>{`
        @keyframes villagefadein {
          from {
            opacity: 0;
            transform: translate(-50%, 8px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
      `}</style>
    </main>
  );
}
