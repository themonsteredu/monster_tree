// 사과나무 SVG 컴포넌트 (8단계, 일러스트북 톤)
//
// 비주얼 가이드:
// - 모든 메인 형태에 두꺼운 외곽선 (var(--ink), 2.5 / 작은 사이즈는 2)
// - 잎/사과/화분에 그라데이션
// - 사과/잎에 흰색 하이라이트
// - 4단계부터 잎 한가운데 얼굴 (눈/입/볼터치)
// - 화분 아래 옅은 그림자
//
// 좌표계: viewBox="-80 -120 160 160"
//   - 가로: -80 ~ 80 (중앙 0)
//   - 세로: -120 ~ 40 (화분 바닥이 +38, 캐노피는 음수 영역으로 자라남)

import React from "react";

export type AppleTreeSize = "xs" | "small" | "medium" | "large" | "xl";
export type AppleTreeMood = "happy" | "surprised" | "sad";

type Props = {
  stage: number; // 1~8 (범위 밖이면 1~8 로 강제)
  size?: AppleTreeSize;
  mood?: AppleTreeMood;
  /** 추가 className (예: 강조 wrapper) */
  className?: string;
  /** SVG title - 접근성용 */
  title?: string;
};

const SIZE_PX: Record<AppleTreeSize, number> = {
  xs: 64,
  small: 88,
  medium: 140,
  large: 220,
  xl: 340,
};

export function AppleTree({
  stage,
  size = "medium",
  mood = "happy",
  className,
  title,
}: Props) {
  const s = Math.min(8, Math.max(1, Math.floor(stage))) as
    | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  const px = SIZE_PX[size];
  const isSmall = size === "xs" || size === "small";
  const sw = isSmall ? 2 : 2.5;

  // 같은 페이지에 여러 사과나무를 그릴 때 그라데이션 id 충돌 방지
  const reactId = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = `at${reactId}`;

  return (
    <svg
      viewBox="-80 -120 160 160"
      width={px}
      height={px}
      role="img"
      aria-label={title ?? `사과나무 ${s}단계`}
      className={className}
    >
      <defs>
        <linearGradient id={`pot-${id}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="var(--pot-light)" />
          <stop offset="100%" stopColor="var(--pot-base)" />
        </linearGradient>
        <radialGradient id={`leaf-${id}`} cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="var(--leaf-highlight)" />
          <stop offset="55%" stopColor="var(--leaf-light)" />
          <stop offset="100%" stopColor="var(--leaf-deep)" />
        </radialGradient>
        <radialGradient id={`apple-${id}`} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="var(--apple-light)" />
          <stop offset="55%" stopColor="var(--apple-base)" />
          <stop offset="100%" stopColor="var(--apple-deep)" />
        </radialGradient>
        <linearGradient id={`trunk-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--trunk-light)" />
          <stop offset="100%" stopColor="var(--trunk-base)" />
        </linearGradient>
      </defs>

      {/* 바닥 그림자 */}
      <ellipse cx="0" cy="40" rx="26" ry="3" fill="var(--ink)" opacity="0.18" />

      {/* 화분 (모든 단계 공통) */}
      <Pot id={id} sw={sw} />

      {/* 단계별 본체 */}
      {s === 2 && <Stage2 sw={sw} />}
      {s === 3 && <Stage3 id={id} sw={sw} />}
      {s === 4 && <Stage4 id={id} sw={sw} mood={mood} />}
      {s === 5 && <Stage5 id={id} sw={sw} mood={mood} />}
      {s === 6 && <Stage6 id={id} sw={sw} mood={mood} />}
      {s === 7 && <Stage7 id={id} sw={sw} mood={mood} />}
      {s === 8 && <Stage8 id={id} sw={sw} mood={mood} />}
    </svg>
  );
}

/* ================================================================
   화분
================================================================ */

function Pot({ id, sw }: { id: string; sw: number }) {
  return (
    <g>
      {/* 화분 본체 (사다리꼴) */}
      <path
        d="M -22 8 L 22 8 L 18 38 L -18 38 Z"
        fill={`url(#pot-${id})`}
        stroke="var(--ink)"
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      {/* 화분 림 */}
      <rect
        x="-26"
        y="0"
        width="52"
        height="10"
        rx="2.5"
        fill="var(--pot-base)"
        stroke="var(--ink)"
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      {/* 흙 (림 내부) */}
      <ellipse cx="0" cy="6" rx="22" ry="2.6" fill="var(--pot-soil)" />
      {/* 화분 장식 (작은 화이트닷) */}
      <circle cx="-12" cy="22" r="2.4" fill="#fff" opacity="0.4" />
      <circle cx="9" cy="29" r="1.6" fill="#fff" opacity="0.3" />
    </g>
  );
}

/* ================================================================
   단계별 그래픽
================================================================ */

// 2단계: 씨앗 + 작은 새싹
function Stage2({ sw }: { sw: number }) {
  return (
    <g>
      {/* 씨앗 */}
      <ellipse
        cx="0"
        cy="3"
        rx="3.4"
        ry="2.4"
        fill="#5a3a1a"
        stroke="var(--ink)"
        strokeWidth={sw * 0.7}
      />
      <ellipse cx="-0.8" cy="2.4" rx="1" ry="0.7" fill="#a87a3f" />
      {/* 새싹 (얇은 줄기) */}
      <path
        d="M 0 1 L 0 -6"
        stroke="var(--leaf-base)"
        strokeWidth={sw * 0.9}
        strokeLinecap="round"
      />
      <path
        d="M 0 -3 Q -3 -5 -4 -8 Q -1 -7 0 -4"
        fill="var(--leaf-light)"
        stroke="var(--ink)"
        strokeWidth={sw * 0.7}
        strokeLinejoin="round"
      />
    </g>
  );
}

// 3단계: 새싹 (작은 줄기 + 양쪽 잎 두 개 + 점 표정)
function Stage3({ id, sw }: { id: string; sw: number }) {
  return (
    <g>
      {/* 줄기 */}
      <path
        d="M 0 2 L 0 -10"
        stroke="var(--leaf-deep)"
        strokeWidth={sw + 1}
        strokeLinecap="round"
      />
      {/* 좌측 잎 */}
      <path
        d="M 0 -8 Q -10 -10 -14 -16 Q -10 -22 -2 -16 Q 0 -12 0 -8 Z"
        fill={`url(#leaf-${id})`}
        stroke="var(--ink)"
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      {/* 우측 잎 */}
      <path
        d="M 0 -8 Q 10 -10 14 -16 Q 10 -22 2 -16 Q 0 -12 0 -8 Z"
        fill={`url(#leaf-${id})`}
        stroke="var(--ink)"
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      {/* 점 표정 (작은 두 눈) */}
      <circle cx="-2.6" cy="-13" r="0.9" fill="var(--ink)" />
      <circle cx="2.6" cy="-13" r="0.9" fill="var(--ink)" />
    </g>
  );
}

// 4단계: 어린나무 (짧은 줄기 + 작은 둥근 캐노피 + 작은 얼굴)
function Stage4({
  id,
  sw,
  mood,
}: {
  id: string;
  sw: number;
  mood: AppleTreeMood;
}) {
  return (
    <g>
      <Trunk id={id} sw={sw} length={18} width={9} />
      {/* 작은 둥근 캐노피 (구름 형태 축소) */}
      <path
        d="M -18 -12 Q -22 -22 -14 -28 Q -8 -34 0 -32 Q 8 -34 14 -28 Q 22 -22 18 -12 Q 14 -4 8 -6 Q 0 -2 -8 -6 Q -14 -4 -18 -12 Z"
        fill={`url(#leaf-${id})`}
        stroke="var(--ink)"
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      <path
        d="M -10 -24 Q -4 -30 4 -28"
        stroke="var(--leaf-highlight)"
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
        opacity="0.7"
      />
      <Face mood={mood} sw={sw} faceY={-18} scale={0.78} />
    </g>
  );
}

// 5단계: 큰나무 (긴 줄기 + 풍성한 캐노피)
function Stage5({
  id,
  sw,
  mood,
}: {
  id: string;
  sw: number;
  mood: AppleTreeMood;
}) {
  return (
    <g>
      <Trunk id={id} sw={sw} length={28} width={11} />
      <Canopy id={id} sw={sw} />
      <Face mood={mood} sw={sw} faceY={-30} />
    </g>
  );
}

// 6단계: 꽃나무 (5단계 + 분홍 꽃 5-7송이)
function Stage6({
  id,
  sw,
  mood,
}: {
  id: string;
  sw: number;
  mood: AppleTreeMood;
}) {
  return (
    <g>
      <Trunk id={id} sw={sw} length={28} width={11} />
      <Canopy id={id} sw={sw} />
      <Face mood={mood} sw={sw} faceY={-30} />
      {BLOSSOM_POSITIONS.map(([cx, cy], i) => (
        <Flower key={i} cx={cx} cy={cy} sw={sw} />
      ))}
    </g>
  );
}

// 7단계: 열매 (5단계 + 작은 사과 5개)
function Stage7({
  id,
  sw,
  mood,
}: {
  id: string;
  sw: number;
  mood: AppleTreeMood;
}) {
  return (
    <g>
      <Trunk id={id} sw={sw} length={28} width={11} />
      <Canopy id={id} sw={sw} />
      <Face mood={mood} sw={sw} faceY={-30} />
      {SMALL_APPLE_POSITIONS.map(([cx, cy], i) => (
        <Apple key={i} cx={cx} cy={cy} r={4.5} id={id} sw={sw} />
      ))}
    </g>
  );
}

// 8단계: 수확 (큰 나무 + 사과 6개 + 반짝이 + 별)
function Stage8({
  id,
  sw,
  mood,
}: {
  id: string;
  sw: number;
  mood: AppleTreeMood;
}) {
  return (
    <g>
      <Trunk id={id} sw={sw} length={32} width={13} />
      {/* 약간 더 큰 캐노피 */}
      <g transform="scale(1.1) translate(0, -2)">
        <Canopy id={id} sw={sw / 1.1} />
      </g>
      <Face mood={mood} sw={sw} faceY={-32} />
      {BIG_APPLE_POSITIONS.map(([cx, cy], i) => (
        <Apple key={i} cx={cx} cy={cy} r={5.5} id={id} sw={sw} />
      ))}
      {/* 머리 위 별 */}
      <Star cx={0} cy={-66} r={7} sw={sw} />
      {/* 반짝이 */}
      {SPARKLE_POSITIONS.map(([cx, cy, size], i) => (
        <Sparkle key={i} cx={cx} cy={cy} size={size} />
      ))}
    </g>
  );
}

/* ================================================================
   재사용 부품
================================================================ */

function Trunk({
  id,
  sw,
  length,
  width,
}: {
  id: string;
  sw: number;
  length: number;
  width: number;
}) {
  const half = width / 2;
  const topHalf = half - 1.2;
  return (
    <path
      d={`M -${half} 4 L ${half} 4 L ${topHalf} -${length} L -${topHalf} -${length} Z`}
      fill={`url(#trunk-${id})`}
      stroke="var(--ink)"
      strokeWidth={sw}
      strokeLinejoin="round"
    />
  );
}

// 부드러운 구름 형태 캐노피 (5~7단계 공통)
function Canopy({ id, sw }: { id: string; sw: number }) {
  return (
    <g>
      <path
        d="M -28 -18 Q -34 -32 -22 -42 Q -16 -52 -4 -50 Q 4 -58 14 -52 Q 28 -50 30 -36 Q 36 -22 28 -14 Q 24 -2 14 -4 Q 4 4 -8 -2 Q -22 0 -28 -18 Z"
        fill={`url(#leaf-${id})`}
        stroke="var(--ink)"
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      {/* 하이라이트 곡선 */}
      <path
        d="M -16 -38 Q -8 -46 4 -44"
        stroke="var(--leaf-highlight)"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        opacity="0.75"
      />
    </g>
  );
}

function Face({
  mood,
  sw,
  faceY,
  scale = 1,
}: {
  mood: AppleTreeMood;
  sw: number;
  faceY: number;
  scale?: number;
}) {
  const transform = `translate(0 ${faceY}) scale(${scale})`;
  if (mood === "surprised") {
    return (
      <g transform={transform}>
        <circle cx="-7" cy="-1" r="2.6" fill="var(--ink)" />
        <circle cx="7" cy="-1" r="2.6" fill="var(--ink)" />
        <circle cx="-6.5" cy="-1.5" r="0.9" fill="#fff" />
        <circle cx="7.5" cy="-1.5" r="0.9" fill="#fff" />
        {/* 'o' 입 */}
        <ellipse cx="0" cy="6" rx="2.2" ry="2.8" fill="var(--ink)" />
        <ellipse cx="0" cy="6.4" rx="1.1" ry="1.5" fill="#5a3a28" opacity="0.6" />
        {/* 강조 볼터치 */}
        <circle cx="-12" cy="3" r="3" fill="#ff8da8" opacity="0.85" />
        <circle cx="12" cy="3" r="3" fill="#ff8da8" opacity="0.85" />
      </g>
    );
  }
  if (mood === "sad") {
    return (
      <g transform={transform}>
        {/* X X 눈 */}
        <line x1="-9" y1="-3" x2="-5" y2="1" stroke="var(--ink)" strokeWidth={sw * 0.7} strokeLinecap="round" />
        <line x1="-9" y1="1" x2="-5" y2="-3" stroke="var(--ink)" strokeWidth={sw * 0.7} strokeLinecap="round" />
        <line x1="5" y1="-3" x2="9" y2="1" stroke="var(--ink)" strokeWidth={sw * 0.7} strokeLinecap="round" />
        <line x1="5" y1="1" x2="9" y2="-3" stroke="var(--ink)" strokeWidth={sw * 0.7} strokeLinecap="round" />
        {/* 슬픈 입 */}
        <path
          d="M -5 8 Q 0 4 5 8"
          stroke="var(--ink)"
          strokeWidth={sw * 0.8}
          fill="none"
          strokeLinecap="round"
        />
        {/* 눈물 */}
        <path
          d="M -7 4 Q -8.5 6 -7 8 Q -5.5 6 -7 4 Z"
          fill="#5cb8e8"
          stroke="var(--ink)"
          strokeWidth={sw * 0.5}
        />
      </g>
    );
  }
  // happy (default)
  return (
    <g transform={transform}>
      <circle cx="-7" cy="0" r="2.6" fill="var(--ink)" />
      <circle cx="7" cy="0" r="2.6" fill="var(--ink)" />
      <circle cx="-6.5" cy="-0.5" r="0.85" fill="#fff" />
      <circle cx="7.5" cy="-0.5" r="0.85" fill="#fff" />
      <path
        d="M -5 5 Q 0 9 5 5"
        stroke="var(--ink)"
        strokeWidth={sw * 0.8}
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="-11" cy="3" r="2.6" fill="#ff8da8" opacity="0.7" />
      <circle cx="11" cy="3" r="2.6" fill="#ff8da8" opacity="0.7" />
    </g>
  );
}

function Apple({
  cx,
  cy,
  r,
  id,
  sw,
}: {
  cx: number;
  cy: number;
  r: number;
  id: string;
  sw: number;
}) {
  return (
    <g>
      {/* 꼭지 (잎 사이로 살짝) */}
      <path
        d={`M ${cx} ${cy - r + 0.4} L ${cx + r * 0.35} ${cy - r - r * 0.7}`}
        stroke="var(--ink)"
        strokeWidth={sw * 0.7}
        strokeLinecap="round"
        fill="none"
      />
      {/* 사과 본체 */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={`url(#apple-${id})`}
        stroke="var(--ink)"
        strokeWidth={sw * 0.8}
      />
      {/* 빛 반사 */}
      <ellipse
        cx={cx - r * 0.32}
        cy={cy - r * 0.4}
        rx={r * 0.28}
        ry={r * 0.36}
        fill="#fff"
        opacity="0.85"
      />
    </g>
  );
}

function Flower({ cx, cy, sw }: { cx: number; cy: number; sw: number }) {
  return (
    <g transform={`translate(${cx} ${cy})`}>
      {[0, 72, 144, 216, 288].map((deg) => {
        const a = (deg * Math.PI) / 180;
        return (
          <circle
            key={deg}
            cx={Math.cos(a) * 2.4}
            cy={Math.sin(a) * 2.4}
            r="2.1"
            fill="var(--accent-pink)"
            stroke="var(--ink)"
            strokeWidth={sw * 0.45}
          />
        );
      })}
      <circle cx="0" cy="0" r="1.6" fill="var(--accent-gold)" />
    </g>
  );
}

function Star({
  cx,
  cy,
  r,
  sw,
}: {
  cx: number;
  cy: number;
  r: number;
  sw: number;
}) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r * 0.45;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return (
    <polygon
      points={pts.join(" ")}
      fill="var(--accent-gold)"
      stroke="var(--ink)"
      strokeWidth={sw * 0.7}
      strokeLinejoin="round"
    />
  );
}

function Sparkle({
  cx,
  cy,
  size,
}: {
  cx: number;
  cy: number;
  size: number;
}) {
  // 4-pointed 빛 모양 (네 갈래 별)
  const s = size;
  const t = size * 0.28;
  return (
    <path
      d={`M ${cx} ${cy - s} L ${cx + t} ${cy - t} L ${cx + s} ${cy} L ${cx + t} ${cy + t} L ${cx} ${cy + s} L ${cx - t} ${cy + t} L ${cx - s} ${cy} L ${cx - t} ${cy - t} Z`}
      fill="var(--accent-gold)"
      opacity="0.9"
    />
  );
}

/* ================================================================
   포지션 데이터 (캐노피 안쪽에 자연스럽게 배치)
================================================================ */

// 6단계 꽃 위치
const BLOSSOM_POSITIONS: ReadonlyArray<[number, number]> = [
  [-18, -26],
  [-6, -42],
  [10, -44],
  [22, -28],
  [-2, -20],
  [14, -16],
  [-22, -14],
];

// 7단계 작은 사과 위치
const SMALL_APPLE_POSITIONS: ReadonlyArray<[number, number]> = [
  [-16, -24],
  [-2, -36],
  [12, -38],
  [22, -22],
  [4, -16],
];

// 8단계 큰 사과 위치
const BIG_APPLE_POSITIONS: ReadonlyArray<[number, number]> = [
  [-22, -24],
  [-8, -42],
  [10, -46],
  [26, -28],
  [-4, -16],
  [18, -14],
];

// 8단계 반짝이 위치 [cx, cy, size]
const SPARKLE_POSITIONS: ReadonlyArray<[number, number, number]> = [
  [-38, -42, 4],
  [40, -52, 5],
  [-30, -68, 3.5],
  [44, -22, 4],
];
