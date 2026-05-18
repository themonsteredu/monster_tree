"use client";

// 몬스터 마을 학생 화면.
// - 배경 16:9 위에 건물을 절대좌표로 배치 (좌표는 % 기반, 회전 적용).
// - is_ready=true 인 건물은 link 이동, false 면 자물쇠 + 어두운 필터 + 토스트.
// - 첫 진입 시 환영 메시지가 떴다가 1.5s 뒤 fade-out.

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
  const [welcomeVisible, setWelcomeVisible] = useState(true);
  const [welcomeFading, setWelcomeFading] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  // 환영 메시지 — 1.5s 표시 → 1s fade out → DOM 제거.
  useEffect(() => {
    const fadeAt = window.setTimeout(() => setWelcomeFading(true), 1500);
    const removeAt = window.setTimeout(() => setWelcomeVisible(false), 1500 + 1000);
    return () => {
      window.clearTimeout(fadeAt);
      window.clearTimeout(removeAt);
    };
  }, []);

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
      {/* 상단 우측 — 학생 이름 + 포인트만 유지 (좌측 타이틀 제거) */}
      <header className="absolute top-0 right-0 z-30 px-4 pt-3 pointer-events-none">
        <div className="bg-black/55 backdrop-blur-sm rounded-full px-3 py-1.5 text-xs font-semibold flex items-center gap-2 pointer-events-auto">
          <span className="text-white/90">{studentName}</span>
          <span className="text-amber-300">⭐ {totalPoints}</span>
        </div>
      </header>

      {/* 16:9 무대 */}
      <div style={stageStyle}>
        {visible.map((b) => {
          const positionStyle: React.CSSProperties = {
            position: "absolute",
            top: b.position_top,
            width: b.size,
          };
          if (b.position_left) positionStyle.left = b.position_left;
          else if (b.position_right) positionStyle.right = b.position_right;
          else positionStyle.left = "50%";

          const locked = !b.is_ready;

          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onBuildingClick(b)}
              style={positionStyle}
              className="group focus:outline-none active:scale-95"
              aria-label={`${b.name}${locked ? " (준비 중)" : ""}`}
            >
              {/* 회전 적용 영역 — 이미지만 회전, 자물쇠/라벨은 미회전 */}
              <div
                className="relative w-full transition-transform group-hover:scale-105 group-active:scale-95"
                style={{ transform: b.rotation ? `rotate(${b.rotation}deg)` : undefined }}
              >
                {b.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={b.image_url}
                    alt={b.name}
                    draggable={false}
                    className="w-full h-auto object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.45)]"
                    style={locked ? { filter: "brightness(0.55) saturate(0.7)" } : undefined}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                    }}
                  />
                ) : (
                  <div
                    className="w-full aspect-square bg-white/15 border border-white/40 rounded-xl flex items-center justify-center backdrop-blur-sm"
                    style={locked ? { filter: "brightness(0.55) saturate(0.7)" } : undefined}
                  >
                    <span className="text-white text-[11px] font-semibold px-2 text-center">
                      {b.name}
                    </span>
                  </div>
                )}
              </div>

              {/* 자물쇠 뱃지 — 우상단, 회전 영향 받지 않음 */}
              {locked && <LockBadge />}

              {/* 라벨 — 건물 아래 중앙, 회전 영향 받지 않음 */}
              <BuildingLabel name={b.name} isReady={b.is_ready} />
            </button>
          );
        })}
      </div>

      {/* 환영 메시지 — 첫 진입 시 1.5s 표시 후 fade out */}
      {welcomeVisible && (
        <div
          className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center"
          style={{
            opacity: welcomeFading ? 0 : 1,
            transition: "opacity 1s ease-out",
          }}
        >
          <div
            className="px-6 text-center"
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: "#fff",
              letterSpacing: "0.4px",
              textShadow:
                "0 2px 6px rgba(0,0,0,0.95), 0 0 18px rgba(0,0,0,0.8), 0 4px 12px rgba(0,0,0,0.6)",
            }}
          >
            {studentName}의 몬스터 마을
          </div>
        </div>
      )}

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

function BuildingLabel({ name, isReady }: { name: string; isReady: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: -28,
        left: "50%",
        transform: "translateX(-50%)",
        fontSize: 16,
        color: "#fff",
        fontWeight: 500,
        textShadow:
          "0 1px 3px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.7), 0 2px 4px rgba(0,0,0,0.5)",
        letterSpacing: "0.3px",
        whiteSpace: "nowrap",
        pointerEvents: "none",
      }}
    >
      {isReady && (
        <span
          style={{
            color: "#80f080",
            fontSize: "0.7em",
            verticalAlign: "2px",
            marginRight: 4,
          }}
        >
          ●
        </span>
      )}
      {name}
    </div>
  );
}

function LockBadge() {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        top: -6,
        right: -6,
        width: 24,
        height: 24,
        borderRadius: "50%",
        background: "rgba(0,0,0,0.8)",
        border: "1.5px solid rgba(255,255,255,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        lineHeight: 1,
        zIndex: 2,
        pointerEvents: "none",
        boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
      }}
    >
      🔒
    </div>
  );
}
