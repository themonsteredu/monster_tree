// 사과나무 SVG 컴포넌트 (8단계)
// - 화분은 항상 같은 위치에 고정 (viewBox 0 0 160 160, 화분 중앙 하단)
// - stage 가 커질수록 줄기 → 잎 → 꽃 → 사과가 순차적으로 추가됨
// - size 로 small / medium / large 픽셀 크기를 지정
//
// 색상 토큰은 tailwind.config.ts 의 팔레트와 동일합니다.

import React from "react";

export type AppleTreeSize = "small" | "medium" | "large";

type Props = {
  stage: number; // 1~8 (범위 밖이면 1~8 로 강제)
  size?: AppleTreeSize;
  /** 추가 className (예: 강조 테두리용 wrapper 등) */
  className?: string;
  /** SVG title - 접근성용 */
  title?: string;
};

const SIZE_PX: Record<AppleTreeSize, number> = {
  small: 88,
  medium: 140,
  large: 220,
};

// 팔레트 (Tailwind 와 동일)
const COLOR = {
  pot: "#c2734a",
  potRim: "#a85d3d",
  soil: "#5a3a28",
  bark: "#7d5b3d",
  barkDark: "#5e4429",
  leafDark: "#6ba34e",
  leafLight: "#85c469",
  apple: "#d63b3b",
  appleLight: "#e74c4c",
  blossomDark: "#f4a8c0",
  blossomLight: "#fdcfdf",
  gold: "#f0c050",
  goldDeep: "#d8a738",
  seed: "#7a5a2f",
  sky: "#fff8ec",
} as const;

export function AppleTree({
  stage,
  size = "medium",
  className,
  title,
}: Props) {
  const s = Math.min(8, Math.max(1, Math.floor(stage))) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  const px = SIZE_PX[size];

  return (
    <svg
      viewBox="0 0 160 160"
      width={px}
      height={px}
      role="img"
      aria-label={title ?? `사과나무 ${s}단계`}
      className={className}
    >
      {/* 부드러운 바닥 그림자 */}
      <ellipse cx="80" cy="148" rx="40" ry="4" fill="#000" opacity="0.08" />

      {/* === 단계별 본체 === */}
      {s === 1 && <Pot />}
      {s === 2 && <PotWithSeed />}
      {s === 3 && <Sprout />}
      {s === 4 && <YoungTree />}
      {s === 5 && <BigTree />}
      {s === 6 && <BlossomTree />}
      {s === 7 && <FruitTree />}
      {s === 8 && <HarvestTree />}
    </svg>
  );
}

/* ================================================================
   공통 부품들
================================================================ */

// 화분 (모든 단계 공통)
function Pot() {
  return (
    <g>
      {/* 화분 본체 (사다리꼴) */}
      <path
        d="M 50 110 L 110 110 L 104 146 L 56 146 Z"
        fill={COLOR.pot}
      />
      {/* 화분 음영 (왼쪽 살짝 어둡게) */}
      <path d="M 50 110 L 56 110 L 60 146 L 56 146 Z" fill="#000" opacity="0.12" />
      {/* 화분 림(테두리) */}
      <rect x="46" y="104" width="68" height="10" rx="2" fill={COLOR.potRim} />
      {/* 흙 (림 안쪽) */}
      <ellipse cx="80" cy="109" rx="30" ry="3.2" fill={COLOR.soil} />
    </g>
  );
}

// 1단계: 화분만
// (Pot 만 그림)
// 위 컴포넌트에서 직접 사용

// 2단계: 화분 + 씨앗 (흙 위에 작은 갈색 알갱이)
function PotWithSeed() {
  return (
    <g>
      <Pot />
      <ellipse cx="80" cy="106" rx="3.5" ry="2.6" fill={COLOR.seed} />
      <ellipse cx="80" cy="105.4" rx="1.6" ry="1.2" fill="#a87a3f" />
    </g>
  );
}

// 3단계: 새싹 (두 잎)
function Sprout() {
  return (
    <g>
      <Pot />
      {/* 짧은 줄기 */}
      <rect x="78.5" y="92" width="3" height="14" rx="1.5" fill={COLOR.leafDark} />
      {/* 두 잎 */}
      <path
        d="M 80 96 C 70 92, 66 84, 72 80 C 78 84, 82 90, 80 96 Z"
        fill={COLOR.leafLight}
      />
      <path
        d="M 80 96 C 90 92, 94 84, 88 80 C 82 84, 78 90, 80 96 Z"
        fill={COLOR.leafDark}
      />
    </g>
  );
}

// 4단계: 어린나무 (작은 줄기 + 작은 수관)
function YoungTree() {
  return (
    <g>
      <Pot />
      {/* 줄기 */}
      <rect x="76" y="68" width="8" height="42" rx="2" fill={COLOR.bark} />
      {/* 줄기 음영 */}
      <rect x="76" y="68" width="2.5" height="42" fill={COLOR.barkDark} opacity="0.5" />
      {/* 작은 수관 (3개의 원) */}
      <circle cx="68" cy="62" r="14" fill={COLOR.leafDark} />
      <circle cx="92" cy="62" r="14" fill={COLOR.leafDark} />
      <circle cx="80" cy="52" r="16" fill={COLOR.leafLight} />
    </g>
  );
}

// 5단계: 큰나무 (풍성한 수관)
function BigTree() {
  return (
    <g>
      <Pot />
      <Trunk />
      <Canopy />
    </g>
  );
}

// 6단계: 꽃나무
function BlossomTree() {
  return (
    <g>
      <Pot />
      <Trunk />
      <Canopy />
      {/* 분홍/연분홍 꽃 무리 */}
      {BLOSSOM_POSITIONS.map(([cx, cy, dark], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r={3.2} fill={dark ? COLOR.blossomDark : COLOR.blossomLight} />
          <circle cx={cx} cy={cy} r={1.1} fill="#fff7fa" />
        </g>
      ))}
    </g>
  );
}

// 7단계: 열매 (작은 빨간 사과 4-5개)
function FruitTree() {
  return (
    <g>
      <Pot />
      <Trunk />
      <Canopy />
      {SMALL_APPLE_POSITIONS.map(([cx, cy], i) => (
        <SmallApple key={i} cx={cx} cy={cy} />
      ))}
    </g>
  );
}

// 8단계: 수확! (더 큰 나무 + 큰 사과 6개 + 금색 별)
function HarvestTree() {
  return (
    <g>
      <Pot />
      {/* 약간 더 두꺼운 줄기 */}
      <rect x="73" y="58" width="14" height="52" rx="3" fill={COLOR.bark} />
      <rect x="73" y="58" width="4" height="52" fill={COLOR.barkDark} opacity="0.5" />
      {/* 더 풍성한 수관 */}
      <circle cx="56" cy="52" r="22" fill={COLOR.leafDark} />
      <circle cx="104" cy="52" r="22" fill={COLOR.leafDark} />
      <circle cx="80" cy="34" r="26" fill={COLOR.leafLight} />
      <circle cx="68" cy="46" r="20" fill={COLOR.leafLight} />
      <circle cx="92" cy="46" r="20" fill={COLOR.leafLight} />
      {BIG_APPLE_POSITIONS.map(([cx, cy], i) => (
        <BigApple key={i} cx={cx} cy={cy} />
      ))}
      {/* 금색 별 (수관 위쪽 가운데) */}
      <Star cx={80} cy={14} r={9} />
    </g>
  );
}

/* ================================================================
   재사용 부품
================================================================ */

function Trunk() {
  return (
    <g>
      <rect x="74" y="62" width="12" height="48" rx="2.5" fill={COLOR.bark} />
      <rect x="74" y="62" width="3.5" height="48" fill={COLOR.barkDark} opacity="0.5" />
    </g>
  );
}

function Canopy() {
  // 5개 원으로 구름 모양 수관
  return (
    <g>
      <circle cx="58" cy="58" r="20" fill={COLOR.leafDark} />
      <circle cx="102" cy="58" r="20" fill={COLOR.leafDark} />
      <circle cx="80" cy="40" r="24" fill={COLOR.leafLight} />
      <circle cx="68" cy="50" r="18" fill={COLOR.leafLight} />
      <circle cx="92" cy="50" r="18" fill={COLOR.leafLight} />
    </g>
  );
}

function SmallApple({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      {/* 줄기 */}
      <rect x={cx - 0.5} y={cy - 6} width="1.5" height="3" fill={COLOR.barkDark} />
      <circle cx={cx} cy={cy} r="3.6" fill={COLOR.apple} />
      <circle cx={cx - 1} cy={cy - 1} r="1" fill="#fff" opacity="0.5" />
    </g>
  );
}

function BigApple({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      <rect x={cx - 0.7} y={cy - 8} width="2" height="4" fill={COLOR.barkDark} />
      <circle cx={cx} cy={cy} r="5.5" fill={COLOR.apple} />
      <circle cx={cx + 1.5} cy={cy + 1} r="3" fill={COLOR.appleLight} opacity="0.7" />
      <circle cx={cx - 1.5} cy={cy - 1.5} r="1.4" fill="#fff" opacity="0.55" />
    </g>
  );
}

function Star({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  // 5각 별 (단순 path)
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r * 0.45;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return (
    <g>
      <polygon points={pts.join(" ")} fill={COLOR.gold} stroke={COLOR.goldDeep} strokeWidth="0.8" />
    </g>
  );
}

/* ================================================================
   포지션 데이터 (수관 안쪽에 자연스럽게 배치)
================================================================ */

// [cx, cy, dark]
const BLOSSOM_POSITIONS: ReadonlyArray<[number, number, boolean]> = [
  [60, 56, true],
  [70, 44, false],
  [82, 36, true],
  [94, 44, false],
  [100, 56, true],
  [76, 56, false],
  [88, 60, true],
  [66, 64, false],
];

const SMALL_APPLE_POSITIONS: ReadonlyArray<[number, number]> = [
  [62, 58],
  [80, 46],
  [98, 58],
  [72, 66],
  [90, 66],
];

const BIG_APPLE_POSITIONS: ReadonlyArray<[number, number]> = [
  [56, 54],
  [76, 38],
  [96, 38],
  [104, 54],
  [68, 62],
  [92, 62],
];
