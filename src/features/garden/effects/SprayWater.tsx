// 사과정원 분무기 효과 — TV 화면 / /me 화면이 각자 다른 변형으로 사용.
//
// 공유 부분: SVG 본체 (SprayBottleSvg)
// 변형 별 차이:
//   tv-spotlight: 큰 분무기 (56px), 16 입자, var(--ink) stroke
//   tv-compact:   작은 분무기 (28px), 8 입자, 좁은 분사
//   me:           가장 큰 분무기 (90px), 28 입자, drop-shadow + 색 alternating

import React from "react";

/* ================================================================
   공유 SVG
================================================================ */

// gradient id 가 한 페이지에 중복되지 않도록 호출자가 idSuffix 를 줄 수 있다.
// 기본값은 변형 별로 분리되어 있다.
export function SprayBottleSvg({ idSuffix = "shared" }: { idSuffix?: string }) {
  const gradId = `bottle-grad-${idSuffix}`;
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#a8e0ff" />
          <stop offset="100%" stopColor="#5cb8e8" />
        </linearGradient>
      </defs>
      <rect
        x="36"
        y="40"
        width="44"
        height="48"
        rx="6"
        fill={`url(#${gradId})`}
        stroke="var(--ink)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <rect x="42" y="56" width="32" height="18" rx="2" fill="#fff" stroke="var(--ink)" strokeWidth="1.6" />
      <line x1="46" y1="61" x2="70" y2="61" stroke="#5cb8e8" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="46" y1="65" x2="66" y2="65" stroke="#5cb8e8" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="46" y1="69" x2="68" y2="69" stroke="#5cb8e8" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="46" y="32" width="20" height="10" fill="#5cb8e8" stroke="var(--ink)" strokeWidth="2.5" />
      <path
        d="M 36 44 L 24 44 L 22 56 L 30 56 L 34 50 Z"
        fill="#7fc6e8"
        stroke="var(--ink)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M 46 32 L 46 22 L 18 22 L 12 26 L 18 30 L 46 30 Z"
        fill="#5cb8e8"
        stroke="var(--ink)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <circle cx="13" cy="26" r="1.4" fill="var(--ink)" />
    </svg>
  );
}

/* ================================================================
   TV 변형 — Tailwind 기반 absolute layout
================================================================ */

export function SprayWaterTv({ compact = false }: { compact?: boolean }) {
  const particleCount = compact ? 8 : 16;
  const bottlePx = compact ? 28 : 56;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-visible z-30"
    >
      <div
        className="absolute spray-wiggle"
        style={{
          top: compact ? 0 : 6,
          right: compact ? -2 : 12,
          width: bottlePx,
          height: bottlePx,
        }}
      >
        <SprayBottleSvg idSuffix={compact ? "tv-compact" : "tv"} />
      </div>

      {Array.from({ length: particleCount }).map((_, i) => {
        const nozzleTop = compact ? 6 : 14;
        const nozzleRight = compact ? 16 : 38;
        const angleDeg = -160 - (i / particleCount) * 80 + ((i * 13) % 7) * 2;
        const angleRad = (angleDeg * Math.PI) / 180;
        const distance = (compact ? 26 : 60) + ((i * 7) % 11) * 2;
        const dx = Math.cos(angleRad) * distance;
        const dy = -Math.sin(angleRad) * distance;
        const delay = i * 35;
        const dotSize = compact ? 3.5 : 6;
        return (
          <div
            key={i}
            className="spray-mist absolute rounded-full"
            style={{
              top: nozzleTop,
              right: nozzleRight,
              width: dotSize,
              height: dotSize,
              background: "#7fc6e8",
              border: "1.2px solid var(--ink)",
              opacity: 0,
              animationDelay: `${delay}ms`,
              ["--spray-x" as string]: `${dx}px`,
              ["--spray-y" as string]: `${dy}px`,
            }}
          />
        );
      })}
    </div>
  );
}

/* ================================================================
   /me 변형 — 인라인 style, 더 큰 본체와 더 많은 입자, 색 alternating + drop-shadow
================================================================ */

export function SprayWaterMe() {
  const particleCount = 28;
  const bottlePx = 90;
  return (
    <div
      aria-hidden
      style={{ pointerEvents: "none", position: "absolute", inset: 0, overflow: "visible", zIndex: 4 }}
    >
      <div
        className="spray-wiggle"
        style={{
          position: "absolute",
          top: -4,
          right: -8,
          width: bottlePx,
          height: bottlePx,
          filter: "drop-shadow(0 6px 12px rgba(61,40,24,0.30))",
        }}
      >
        <SprayBottleSvg idSuffix="me" />
      </div>
      {Array.from({ length: particleCount }).map((_, i) => {
        const nozzleTop = 14;
        const nozzleRight = 60;
        // /me 변형은 더 넓은 부채꼴 (-150 ~ -240도)
        const angleDeg = -150 - (i / particleCount) * 90 + ((i * 17) % 11) * 1.5;
        const angleRad = (angleDeg * Math.PI) / 180;
        const distance = 100 + ((i * 11) % 13) * 6;
        const dx = Math.cos(angleRad) * distance;
        const dy = -Math.sin(angleRad) * distance;
        const delay = i * 28;
        const dotSize = 6 + ((i * 7) % 5);
        return (
          <div
            key={i}
            className="spray-mist"
            style={{
              position: "absolute",
              top: nozzleTop,
              right: nozzleRight,
              width: dotSize,
              height: dotSize,
              borderRadius: 999,
              background: i % 4 === 0 ? "#a8e0ff" : "#7fc6e8",
              border: "1.5px solid #3d2818",
              opacity: 0,
              animationDelay: `${delay}ms`,
              ["--spray-x" as string]: `${dx}px`,
              ["--spray-y" as string]: `${dy}px`,
              boxShadow: "0 2px 4px rgba(61,40,24,0.25)",
            }}
          />
        );
      })}
    </div>
  );
}
