// 학생 페이지 + TV 스포트라이트 배경 렌더러.
// SVG 로 깔리는 배경 — solid/pattern/scene 세 종류 지원.

import type { BackgroundConfig } from "@/lib/types";
import { DEFAULT_BACKGROUND } from "@/lib/types";

const SOLID: Record<string, string> = {
  cream: "#fff7e6",
  sky: "#dbeafe",
  mint: "#d4f5e0",
  peach: "#ffe4d1",
  lavender: "#ede0f5",
  rose: "#ffdde5",
  sunshine: "#fff3b8",
  forest: "#d2eacb",
  night: "#1f2a44",
  charcoal: "#2a2018",
};

const PATTERN_KINDS = ["dots", "stars", "hearts", "stripes", "clouds"] as const;
type PatternKind = (typeof PATTERN_KINDS)[number];

function PatternDefs() {
  return (
    <defs>
      <pattern id="bg-dots" width="20" height="20" patternUnits="userSpaceOnUse">
        <circle cx="10" cy="10" r="2.5" fill="#000" opacity="0.18" />
      </pattern>
      <pattern id="bg-stars" width="36" height="36" patternUnits="userSpaceOnUse">
        <path
          d="M18 6 L20 14 L28 14 L21 19 L23 28 L18 22 L13 28 L15 19 L8 14 L16 14 Z"
          fill="#fff"
          opacity="0.55"
        />
      </pattern>
      <pattern id="bg-hearts" width="28" height="28" patternUnits="userSpaceOnUse">
        <path
          d="M14 22 C 6 16 6 8 10 8 C 12 8 14 10 14 12 C 14 10 16 8 18 8 C 22 8 22 16 14 22 Z"
          fill="#ff9eb5"
          opacity="0.5"
        />
      </pattern>
      <pattern id="bg-stripes" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="8" height="16" fill="#000" opacity="0.08" />
      </pattern>
      <pattern id="bg-clouds" width="80" height="48" patternUnits="userSpaceOnUse">
        <g fill="#fff" opacity="0.7">
          <ellipse cx="20" cy="22" rx="14" ry="8" />
          <ellipse cx="30" cy="18" rx="10" ry="7" />
          <ellipse cx="60" cy="34" rx="12" ry="7" />
        </g>
      </pattern>
    </defs>
  );
}

function SolidLayer({ color }: { color: string }) {
  const fill = SOLID[color] ?? SOLID.cream;
  return <rect x="0" y="0" width="100%" height="100%" fill={fill} />;
}

function PatternLayer({ pattern, color }: { pattern: string; color: string }) {
  const fill = SOLID[color] ?? SOLID.cream;
  const id = PATTERN_KINDS.includes(pattern as PatternKind) ? `bg-${pattern}` : "bg-dots";
  return (
    <>
      <rect x="0" y="0" width="100%" height="100%" fill={fill} />
      <rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </>
  );
}

function GardenScene() {
  return (
    <g>
      <defs>
        <linearGradient id="garden-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe9b8" />
          <stop offset="60%" stopColor="#fff5e0" />
          <stop offset="100%" stopColor="#fff7e6" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100%" height="100%" fill="url(#garden-sky)" />
      <ellipse cx="80%" cy="22%" rx="60" ry="60" fill="#ffd87a" opacity="0.85" />
      <ellipse cx="20%" cy="18%" rx="40" ry="14" fill="#fff" opacity="0.8" />
      <ellipse cx="65%" cy="15%" rx="32" ry="10" fill="#fff" opacity="0.7" />
      <rect x="0" y="80%" width="100%" height="20%" fill="#c8e3a8" />
      <rect x="0" y="80%" width="100%" height="3" fill="#9bc77a" />
    </g>
  );
}

function ForestScene() {
  return (
    <g>
      <defs>
        <linearGradient id="forest-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9bd8e8" />
          <stop offset="100%" stopColor="#d6efe2" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100%" height="100%" fill="url(#forest-sky)" />
      <polygon points="10%,80% 25%,40% 40%,80%" fill="#3d8a5a" opacity="0.85" />
      <polygon points="30%,80% 50%,30% 70%,80%" fill="#2e7048" opacity="0.9" />
      <polygon points="60%,80% 80%,45% 95%,80%" fill="#3d8a5a" opacity="0.85" />
      <rect x="0" y="80%" width="100%" height="20%" fill="#6da558" />
    </g>
  );
}

function SkyScene() {
  return (
    <g>
      <defs>
        <linearGradient id="sky-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7ec8f0" />
          <stop offset="100%" stopColor="#cbe9f7" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100%" height="100%" fill="url(#sky-bg)" />
      <g fill="#fff" opacity="0.95">
        <ellipse cx="15%" cy="25%" rx="55" ry="18" />
        <ellipse cx="22%" cy="20%" rx="35" ry="14" />
        <ellipse cx="70%" cy="35%" rx="65" ry="20" />
        <ellipse cx="80%" cy="30%" rx="40" ry="16" />
        <ellipse cx="50%" cy="55%" rx="48" ry="14" />
      </g>
    </g>
  );
}

function NightScene() {
  return (
    <g>
      <defs>
        <linearGradient id="night-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a223d" />
          <stop offset="100%" stopColor="#3a4470" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100%" height="100%" fill="url(#night-sky)" />
      <circle cx="78%" cy="22%" r="36" fill="#fdf2c8" opacity="0.95" />
      <circle cx="74%" cy="20%" r="32" fill="#1a223d" />
      <g fill="#fff8d0">
        <circle cx="15%" cy="20%" r="1.5" />
        <circle cx="25%" cy="35%" r="1.2" />
        <circle cx="40%" cy="15%" r="2" />
        <circle cx="55%" cy="28%" r="1.4" />
        <circle cx="62%" cy="12%" r="1.7" />
        <circle cx="90%" cy="40%" r="1.6" />
        <circle cx="12%" cy="55%" r="1.5" />
        <circle cx="38%" cy="48%" r="1.3" />
      </g>
    </g>
  );
}

function OceanScene() {
  return (
    <g>
      <defs>
        <linearGradient id="ocean-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe0b0" />
          <stop offset="50%" stopColor="#ffcfa0" />
          <stop offset="100%" stopColor="#7cb5d4" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100%" height="100%" fill="url(#ocean-sky)" />
      <circle cx="50%" cy="55%" r="42" fill="#ffb070" opacity="0.95" />
      <rect x="0" y="60%" width="100%" height="40%" fill="#3a78a8" />
      <g stroke="#fff" strokeWidth="1.5" fill="none" opacity="0.6">
        <path d="M 0 72% Q 20% 70%, 40% 72% T 80% 72% T 100% 72%" />
        <path d="M 0 82% Q 25% 80%, 50% 82% T 100% 82%" />
        <path d="M 0 92% Q 20% 90%, 40% 92% T 80% 92% T 100% 92%" />
      </g>
    </g>
  );
}

const SCENES: Record<string, () => JSX.Element> = {
  garden: GardenScene,
  forest: ForestScene,
  sky: SkyScene,
  night: NightScene,
  ocean: OceanScene,
};

export function BackgroundCanvas({
  config,
  className,
  rounded = 20,
  style,
}: {
  config?: BackgroundConfig | null;
  className?: string;
  rounded?: number;
  style?: React.CSSProperties;
}) {
  const cfg: BackgroundConfig = config ?? DEFAULT_BACKGROUND;

  let layer: JSX.Element;
  if (cfg.kind === "solid") {
    layer = <SolidLayer color={cfg.color} />;
  } else if (cfg.kind === "pattern") {
    layer = <PatternLayer pattern={cfg.pattern} color={cfg.color} />;
  } else {
    const Scene = SCENES[cfg.scene] ?? GardenScene;
    layer = <Scene />;
  }

  return (
    <svg
      className={className}
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 400 400"
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        borderRadius: rounded,
        pointerEvents: "none",
        ...style,
      }}
    >
      <PatternDefs />
      {layer}
    </svg>
  );
}

export const BACKGROUND_OPTIONS = {
  solid: Object.keys(SOLID),
  pattern: PATTERN_KINDS as readonly string[],
  scene: Object.keys(SCENES),
};
