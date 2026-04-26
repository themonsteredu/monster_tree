// 사과나무 SVG 컴포넌트 (8단계, 일러스트북 스타일)
//
// 새 비주얼 가이드 (참고 이미지 톤):
// - 얼굴은 화분에 (모든 단계 공통, 화분 자체가 캐릭터)
// - 잎은 캐노피 한 덩어리가 아니라 개별 잎사귀가 가지에 붙은 형태
// - 사과는 잎이 함께 달린 형태
// - 두꺼운 외곽선 + 부드러운 그라데이션
//
// 좌표계: viewBox="-80 -120 160 160"
//   x: -80 ~ 80 (중앙 0)
//   y: -120 ~ 40 (화분 바닥이 +38, 캐노피는 음수 영역으로 자라남)

import React from "react";

export type AppleTreeSize = "xs" | "small" | "medium" | "large" | "xl";
export type AppleTreeMood = "happy" | "surprised" | "sad";

type Props = {
  stage: number;
  size?: AppleTreeSize;
  mood?: AppleTreeMood;
  /** 잎이 시들어 보이게 (포인트 차감 시 일시적) */
  wilted?: boolean;
  /** 단계 내에서의 진행도 0~1 (sub-stage 성장: 키가 점점 자라남) */
  growthBoost?: number;
  className?: string;
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
  wilted = false,
  growthBoost = 0,
  className,
  title,
}: Props) {
  const s = Math.min(8, Math.max(1, Math.floor(stage))) as
    | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  const px = SIZE_PX[size];
  const isSmall = size === "xs" || size === "small";
  const sw = isSmall ? 1.8 : 2.5;
  // sub-stage 성장: 0 → 1 사이를 0.92 → 1.08 로 매핑 (단계 시작점 살짝 작게, 끝점 살짝 크게)
  const g = Math.min(1, Math.max(0, growthBoost));
  const treeScaleY = 0.92 + g * 0.16;
  // y=4 (화분 림 위) 기준으로 스케일하므로 transform 매트릭스로 처리
  const treeMatrix = `matrix(1 0 0 ${treeScaleY} 0 ${4 * (1 - treeScaleY)})`;

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
        {/* 밝은 잎 (앞쪽 / 햇빛 받는 쪽) */}
        <radialGradient id={`leaf-${id}`} cx="32%" cy="28%" r="85%">
          {wilted ? (
            <>
              <stop offset="0%" stopColor="#f0e090" />
              <stop offset="50%" stopColor="var(--leaf-sick)" />
              <stop offset="100%" stopColor="#8a7820" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="var(--leaf-highlight)" />
              <stop offset="45%" stopColor="var(--leaf-light)" />
              <stop offset="100%" stopColor="var(--leaf-deep)" />
            </>
          )}
        </radialGradient>
        {/* 어두운 잎 (뒤쪽 / 그늘진 쪽) - 두 톤으로 입체감 */}
        <radialGradient id={`leaf-dark-${id}`} cx="32%" cy="28%" r="85%">
          {wilted ? (
            <>
              <stop offset="0%" stopColor="var(--leaf-sick)" />
              <stop offset="100%" stopColor="#6e5b18" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="var(--leaf-light)" />
              <stop offset="55%" stopColor="var(--leaf-base)" />
              <stop offset="100%" stopColor="var(--leaf-deep)" />
            </>
          )}
        </radialGradient>
        <radialGradient id={`apple-${id}`} cx="32%" cy="28%" r="75%">
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

      {/* 화분 (얼굴 포함, 모든 단계 공통) */}
      <Pot id={id} sw={sw} mood={mood} />

      {/* 단계별 식물 본체 (sub-stage 키 자람을 위해 scaleY 매트릭스 wrapper) */}
      <g transform={treeMatrix}>
        {s === 2 && <Sprout sw={sw} />}
        {s === 3 && <YoungSprout id={id} sw={sw} />}
        {s === 4 && <YoungTree id={id} sw={sw} />}
        {s === 5 && <SmallTree id={id} sw={sw} />}
        {s === 6 && <MediumTree id={id} sw={sw} />}
        {s === 7 && <FloweringTree id={id} sw={sw} />}
        {s === 8 && <FruitfulTree id={id} sw={sw} />}
      </g>
    </svg>
  );
}

/* ================================================================
   화분 + 얼굴
================================================================ */

function Pot({
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
      {/* 화분 본체 (살짝 둥근 사다리꼴) */}
      <path
        d="M -22 10 C -22 18 -20 30 -18 38 L 18 38 C 20 30 22 18 22 10 Z"
        fill={`url(#pot-${id})`}
        stroke="var(--ink)"
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      {/* 화분 림 */}
      <path
        d="M -27 2 L 27 2 Q 28 7 27 12 L -27 12 Q -28 7 -27 2 Z"
        fill="var(--pot-base)"
        stroke="var(--ink)"
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      {/* 림 위쪽 살짝 밝은 라인 (광택) */}
      <path
        d="M -24 4 L 24 4"
        stroke="#fff"
        strokeWidth="1.4"
        opacity="0.5"
        strokeLinecap="round"
      />
      {/* 흙 (림 안쪽) */}
      <ellipse cx="0" cy="8" rx="22" ry="2.6" fill="var(--pot-soil)" />

      {/* 얼굴 (화분 가운데 아래쪽) */}
      <PotFace mood={mood} />
    </g>
  );
}

function PotFace({ mood }: { mood: AppleTreeMood }) {
  const cy = 24; // 화분 중앙 약간 아래쪽

  if (mood === "surprised") {
    return (
      <g transform={`translate(0 ${cy})`}>
        <circle cx="-6.5" cy="-1" r="2.4" fill="var(--ink)" />
        <circle cx="6.5" cy="-1" r="2.4" fill="var(--ink)" />
        <circle cx="-6" cy="-1.5" r="0.85" fill="#fff" />
        <circle cx="7" cy="-1.5" r="0.85" fill="#fff" />
        {/* 'o' 입 */}
        <ellipse cx="0" cy="6" rx="2" ry="2.6" fill="var(--ink)" />
        <ellipse cx="0" cy="6.4" rx="1" ry="1.4" fill="#5a3a28" opacity="0.55" />
        {/* 강조 볼터치 */}
        <ellipse cx="-12" cy="3" rx="3" ry="2.2" fill="#ff8da8" opacity="0.85" />
        <ellipse cx="12" cy="3" rx="3" ry="2.2" fill="#ff8da8" opacity="0.85" />
      </g>
    );
  }
  if (mood === "sad") {
    return (
      <g transform={`translate(0 ${cy})`}>
        {/* X X 눈 */}
        <line x1="-9" y1="-3" x2="-5" y2="1" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" />
        <line x1="-9" y1="1" x2="-5" y2="-3" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" />
        <line x1="5" y1="-3" x2="9" y2="1" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" />
        <line x1="5" y1="1" x2="9" y2="-3" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" />
        {/* 슬픈 입 */}
        <path d="M -5 7 Q 0 4 5 7" stroke="var(--ink)" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        {/* 눈물 */}
        <path
          d="M -7 4 Q -8.5 6 -7 8 Q -5.5 6 -7 4 Z"
          fill="#5cb8e8"
          stroke="var(--ink)"
          strokeWidth="0.8"
        />
      </g>
    );
  }
  // happy (기본)
  return (
    <g transform={`translate(0 ${cy})`}>
      {/* 눈 (살짝 위 방향, 웃는 인상) */}
      <circle cx="-6.5" cy="0" r="2.4" fill="var(--ink)" />
      <circle cx="6.5" cy="0" r="2.4" fill="var(--ink)" />
      <circle cx="-6" cy="-0.6" r="0.85" fill="#fff" />
      <circle cx="7" cy="-0.6" r="0.85" fill="#fff" />
      {/* 웃는 입 */}
      <path
        d="M -4 5 Q 0 8 4 5"
        stroke="var(--ink)"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
      {/* 분홍 볼터치 */}
      <ellipse cx="-12" cy="3.5" rx="2.8" ry="2" fill="#ff8da8" opacity="0.7" />
      <ellipse cx="12" cy="3.5" rx="2.8" ry="2" fill="#ff8da8" opacity="0.7" />
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
  const halfBottom = width / 2;
  const halfTop = halfBottom - 1.2;
  return (
    <path
      d={`M -${halfBottom} 4 L ${halfBottom} 4 L ${halfTop} -${length} L -${halfTop} -${length} Z`}
      fill={`url(#trunk-${id})`}
      stroke="var(--ink)"
      strokeWidth={sw}
      strokeLinejoin="round"
    />
  );
}

// 가지 (얇은 곡선)
function Branch({
  d,
  sw,
}: {
  d: string;
  sw: number;
}) {
  return (
    <path
      d={d}
      stroke="var(--trunk-base)"
      strokeWidth={sw + 0.4}
      strokeLinecap="round"
      fill="none"
    />
  );
}

// 개별 잎 - 둥글둥글 여리여리한 모양
// 양쪽 대칭의 부드러운 잎: 뾰족한 점 대신 둥근 곡선 끝, 얇은 외곽선, 단일 잎맥, 부드러운 하이라이트
function Leaf({
  cx,
  cy,
  rotate = 0,
  size = 1,
  dark = false,
  id,
  sw,
}: {
  cx: number;
  cy: number;
  rotate?: number;
  size?: number;
  dark?: boolean;
  id: string;
  sw: number;
}) {
  const h = 7.6 * size; // 잎 절반 높이
  const w = 4.4 * size; // 잎 절반 폭

  return (
    <g transform={`translate(${cx} ${cy}) rotate(${rotate})`}>
      {/* 둥글둥글 잎 (양쪽 대칭, 끝이 뾰족하지 않게 cubic 곡선으로 둥글게 마감) */}
      <path
        d={`M 0 ${-h}
            C ${w * 0.95} ${-h * 0.95}, ${w * 1.2} ${-h * 0.15}, ${w * 0.78} ${h * 0.5}
            C ${w * 0.45} ${h * 0.96}, ${-w * 0.45} ${h * 0.96}, ${-w * 0.78} ${h * 0.5}
            C ${-w * 1.2} ${-h * 0.15}, ${-w * 0.95} ${-h * 0.95}, 0 ${-h} Z`}
        fill={dark ? `url(#leaf-dark-${id})` : `url(#leaf-${id})`}
        stroke="var(--ink)"
        strokeWidth={sw * 0.38}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* 부드러운 단일 잎맥 (얇게) */}
      <path
        d={`M 0 ${-h * 0.7} Q 0 0, 0 ${h * 0.78}`}
        stroke="var(--leaf-deep)"
        strokeWidth={sw * 0.2}
        fill="none"
        opacity="0.32"
        strokeLinecap="round"
      />
      {/* 부드러운 빛 하이라이트 (좌상단 한 곳만, 타원으로 은은하게) */}
      {!dark && (
        <ellipse
          cx={-w * 0.32}
          cy={-h * 0.42}
          rx={w * 0.42}
          ry={h * 0.3}
          fill="var(--leaf-highlight)"
          opacity="0.55"
        />
      )}
    </g>
  );
}

// 꽃 (5개 꽃잎 + 노란 가운데)
function Flower({
  cx,
  cy,
  sw,
}: {
  cx: number;
  cy: number;
  sw: number;
}) {
  return (
    <g transform={`translate(${cx} ${cy})`}>
      {[0, 72, 144, 216, 288].map((deg) => {
        const a = (deg * Math.PI) / 180;
        return (
          <ellipse
            key={deg}
            cx={Math.cos(a) * 2.3}
            cy={Math.sin(a) * 2.3}
            rx="2.1"
            ry="1.7"
            transform={`rotate(${deg} ${Math.cos(a) * 2.3} ${Math.sin(a) * 2.3})`}
            fill="#fff"
            stroke="var(--ink)"
            strokeWidth={sw * 0.45}
          />
        );
      })}
      <circle cx="0" cy="0" r="1.5" fill="var(--accent-gold)" stroke="var(--ink)" strokeWidth={sw * 0.4} />
    </g>
  );
}

// 사과 (잎과 꼭지가 달린 형태)
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
      {/* 꼭지 */}
      <path
        d={`M ${cx} ${cy - r + 0.5} L ${cx + r * 0.3} ${cy - r - r * 0.7}`}
        stroke="var(--ink)"
        strokeWidth={sw * 0.7}
        strokeLinecap="round"
        fill="none"
      />
      {/* 사과 잎 (꼭지 옆으로 살짝) */}
      <path
        d={`M ${cx + r * 0.3} ${cy - r - r * 0.7}
            Q ${cx + r * 1.0} ${cy - r - r * 0.45} ${cx + r * 1.15} ${cy - r * 0.95}
            Q ${cx + r * 0.55} ${cy - r - 0.4} ${cx + r * 0.3} ${cy - r - r * 0.7} Z`}
        fill="var(--leaf-base)"
        stroke="var(--ink)"
        strokeWidth={sw * 0.55}
        strokeLinejoin="round"
      />
      {/* 사과 본체 */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={`url(#apple-${id})`}
        stroke="var(--ink)"
        strokeWidth={sw * 0.85}
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

/* ================================================================
   단계별 식물 본체
================================================================ */

// 2단계: 작은 새싹 (흙 위로 살짝 올라온 어린 잎)
function Sprout({ sw }: { sw: number }) {
  return (
    <g>
      <path
        d="M 0 6 L 0 -2"
        stroke="var(--leaf-deep)"
        strokeWidth={sw + 0.4}
        strokeLinecap="round"
      />
      <path
        d="M 0 -1 Q -3.5 -3 -3 -7 Q 0 -6 0 -1 Z"
        fill="var(--leaf-light)"
        stroke="var(--ink)"
        strokeWidth={sw * 0.7}
        strokeLinejoin="round"
      />
      <path
        d="M 0 -1 Q 3.5 -3 3 -7 Q 0 -6 0 -1 Z"
        fill="var(--leaf-light)"
        stroke="var(--ink)"
        strokeWidth={sw * 0.7}
        strokeLinejoin="round"
      />
    </g>
  );
}

// 3단계: 새싹 (얇은 줄기 + 두 잎)
function YoungSprout({ id, sw }: { id: string; sw: number }) {
  return (
    <g>
      <path
        d="M 0 4 L 0 -10"
        stroke="var(--leaf-deep)"
        strokeWidth={sw + 0.5}
        strokeLinecap="round"
      />
      <Leaf cx={-3.5} cy={-7} rotate={-55} size={0.85} id={id} sw={sw} />
      <Leaf cx={3.5} cy={-7} rotate={55} size={0.85} id={id} sw={sw} />
      <Leaf cx={0} cy={-12} rotate={0} size={0.7} id={id} sw={sw} />
    </g>
  );
}

// 4단계: 어린나무 (가는 줄기 + 캐노피가 이미 화분보다 큰 정도)
function YoungTree({ id, sw }: { id: string; sw: number }) {
  return (
    <g>
      <Trunk id={id} sw={sw} length={22} width={6} />
      <Branch d="M 0 -16 Q -7 -22 -14 -24" sw={sw} />
      <Branch d="M 0 -16 Q 7 -22 14 -24" sw={sw} />
      {LEAVES_4.map((l, i) => (
        <Leaf key={i} cx={l.cx} cy={l.cy} rotate={l.rotate} size={l.size} dark={l.dark} id={id} sw={sw} />
      ))}
    </g>
  );
}

// 5단계: 큰나무 (가지 + 풍성한 잎)
function SmallTree({ id, sw }: { id: string; sw: number }) {
  return (
    <g>
      <Trunk id={id} sw={sw} length={30} width={7} />
      <Branch d="M 0 -22 Q -10 -32 -22 -38" sw={sw} />
      <Branch d="M 0 -22 Q 10 -32 22 -38" sw={sw} />
      <Branch d="M 0 -26 L 0 -50" sw={sw} />
      {LEAVES_5.map((l, i) => (
        <Leaf key={i} cx={l.cx} cy={l.cy} rotate={l.rotate} size={l.size} dark={l.dark} id={id} sw={sw} />
      ))}
    </g>
  );
}

// 6단계: 큰나무 (가장 풍성한 캐노피, 화분의 2배 이상 너비)
function MediumTree({ id, sw }: { id: string; sw: number }) {
  return (
    <g>
      <MediumTreeBody id={id} sw={sw} />
    </g>
  );
}

function MediumTreeBody({ id, sw }: { id: string; sw: number }) {
  return (
    <g>
      <Trunk id={id} sw={sw} length={34} width={8} />
      <Branch d="M 0 -24 Q -12 -36 -28 -42" sw={sw} />
      <Branch d="M 0 -24 Q 12 -36 28 -42" sw={sw} />
      <Branch d="M 0 -28 L 0 -56" sw={sw} />
      <Branch d="M 0 -32 Q -8 -42 -16 -52" sw={sw} />
      <Branch d="M 0 -32 Q 8 -42 16 -52" sw={sw} />
      {LEAVES_6.map((l, i) => (
        <Leaf key={i} cx={l.cx} cy={l.cy} rotate={l.rotate} size={l.size} dark={l.dark} id={id} sw={sw} />
      ))}
    </g>
  );
}

// 7단계: 꽃나무 (큰나무 + 꽃 7송이)
function FloweringTree({ id, sw }: { id: string; sw: number }) {
  return (
    <g>
      <MediumTreeBody id={id} sw={sw} />
      {FLOWER_POSITIONS.map((p, i) => (
        <Flower key={i} cx={p[0]} cy={p[1]} sw={sw} />
      ))}
    </g>
  );
}

// 8단계: 사과나무 (큰나무 + 사과 5개 + 꽃 3송이)
function FruitfulTree({ id, sw }: { id: string; sw: number }) {
  return (
    <g>
      <MediumTreeBody id={id} sw={sw} />
      {APPLE_POSITIONS.map((p, i) => (
        <Apple key={i} cx={p[0]} cy={p[1]} r={5.5} id={id} sw={sw} />
      ))}
      {FLOWER_POSITIONS_FEW.map((p, i) => (
        <Flower key={i} cx={p[0]} cy={p[1]} sw={sw} />
      ))}
    </g>
  );
}

/* ================================================================
   잎 / 꽃 / 사과 위치 데이터
   각 항목: [cx, cy, rotateDeg, size]
================================================================ */

// 잎 위치를 캐노피 타원 안쪽에 절차적으로 분포.
// sunflower-spiral (golden angle) + seeded jitter 로 자연스러우면서 결정적으로 생성 → 동일 결과.
type LeafSpec = {
  cx: number;
  cy: number;
  rotate: number;
  size: number;
  dark: boolean; // 뒤쪽(그늘) 잎 → 어두운 그라데이션
  z: number; // z-order (먼저 그릴수록 뒤에)
};

function generateLeaves(
  seed: number,
  count: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  baseSize: number,
): ReadonlyArray<LeafSpec> {
  // 결정적 의사난수 (xorshift 변형)
  let s = seed >>> 0;
  const rand = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const out: LeafSpec[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const r = Math.sqrt(t);
    const angle = i * goldenAngle;
    const rj = 0.92 + rand() * 0.16;
    const x = cx + Math.cos(angle) * rx * r * rj;
    const y = cy + Math.sin(angle) * ry * r * rj;
    // 잎이 캐노피 중심에서 바깥쪽을 향하게 회전 (잎 끝이 바깥으로)
    const dx = x - cx;
    const dy = y - cy;
    const outwardDeg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    const sj = 0.85 + rand() * 0.3;
    // 약 35% 잎은 어둡게 (그늘), 입체감 부여
    const dark = rand() < 0.35;
    // z-order: 어두운 잎(뒤)은 먼저, 밝은 잎(앞)은 나중에 그려져서 위에 올라감
    // 가장자리 → 안쪽 순으로 큰 z 값 → 안쪽 잎이 위에 오게 (내부 밀도감)
    const distFromCenter = Math.hypot(dx, dy);
    const z = (dark ? 0 : 1000) + (1000 - distFromCenter * 10);
    out.push({ cx: x, cy: y, rotate: outwardDeg, size: baseSize * sj, dark, z });
  }
  // z 오름차순: 작은 z → 먼저 그림 → 뒤로 감
  out.sort((a, b) => a.z - b.z);
  return out;
}

// 4단계: 어린나무 (캐노피가 이미 화분보다 큼, 잎 27개)
const LEAVES_4 = generateLeaves(4, 27, 0, -22, 18, 14, 0.95);

// 5단계: 큰나무 (캐노피 화분 1.6배, 잎 42개)
const LEAVES_5 = generateLeaves(5, 42, 0, -36, 26, 22, 1.15);

// 6단계: 가장 풍성한 캐노피 (화분의 2배 이상, 잎 63개)
const LEAVES_6 = generateLeaves(6, 63, 0, -42, 34, 28, 1.25);

// 7단계 꽃 위치 (큰 캐노피에 흩뿌리듯)
const FLOWER_POSITIONS: ReadonlyArray<[number, number]> = [
  [-22, -40],
  [-12, -52],
  [-3, -60],
  [10, -52],
  [22, -40],
  [-16, -30],
  [16, -30],
  [-6, -36],
  [6, -36],
];

// 8단계 사과 위치 (큰 캐노피에 균형 있게)
const APPLE_POSITIONS: ReadonlyArray<[number, number]> = [
  [-22, -36],
  [-10, -52],
  [3, -42],
  [13, -52],
  [22, -34],
  [-3, -28],
];

// 8단계 꽃 (소수, 사과 사이사이)
const FLOWER_POSITIONS_FEW: ReadonlyArray<[number, number]> = [
  [-28, -46],
  [0, -60],
  [28, -42],
  [-15, -42],
  [16, -42],
];
