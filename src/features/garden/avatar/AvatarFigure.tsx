// 학생 아바타 (사과정원 me 페이지 + TV 화면) 렌더 컴포넌트.
// 정면 픽셀 캐릭터: 마인크래프트 블록감 + 메이플 표정 톤, 공부 RPG 분위기.
// 120×160 viewBox, crispEdges, 정수 좌표 격자. 알 수 없는 키는 디폴트 폴백.

import type { AvatarConfig } from "@/lib/types";
import { DEFAULT_AVATAR } from "@/lib/types";

const OUTLINE = "#2a1a14";

// 사람 part 팔레트 — {base, shade}. shade = 1px 그림자/외곽선 톤.
const SKIN: Record<string, { base: string; shade: string }> = {
  light: { base: "#f0c896", shade: "#c89870" },
  tan:   { base: "#c89870", shade: "#a07050" },
  dark:  { base: "#7a4a30", shade: "#4a2c18" },
};
const HAIR: Record<string, { base: string; shade: string }> = {
  short_brown:  { base: "#5a3820", shade: "#2c1808" },
  short_black:  { base: "#1a1010", shade: "#000000" },
  short_blonde: { base: "#d4a040", shade: "#8a6818" },
  long_brown:   { base: "#684028", shade: "#3a2010" },
  long_black:   { base: "#100808", shade: "#000000" },
  long_pink:    { base: "#d088a0", shade: "#a05878" },
};
const TOP: Record<string, { base: string; shade: string }> = {
  hoodie_white:  { base: "#e8e0d0", shade: "#a89880" },
  tshirt_blue:   { base: "#4878a8", shade: "#2c4878" },
  tshirt_red:    { base: "#b04038", shade: "#702018" },
  dress_pink:    { base: "#d088a0", shade: "#a05878" },
  jacket_yellow: { base: "#e8b840", shade: "#a07818" },
};
const BOTTOM: Record<string, { base: string; shade: string }> = {
  shorts_green: { base: "#608048", shade: "#3a5028" },
  pants_blue:   { base: "#2c4868", shade: "#182840" },
  skirt_pink:   { base: "#d088a0", shade: "#a05878" },
  pants_black:  { base: "#201810", shade: "#000000" },
};
const SHOES: Record<string, { base: string; shade: string }> = {
  sneakers_brown: { base: "#4a2c18", shade: "#2c180c" },
  sneakers_white: { base: "#e8e0d0", shade: "#a09078" },
  sneakers_red:   { base: "#a83828", shade: "#702018" },
};

type EyesVariant = "dot" | "wink" | "round" | "sleepy" | "star" | "sharp";
type MouthVariant = "smile" | "neutral" | "oh" | "smirk" | "tongue";

// 메이플 톤 눈: 흰자 사각 + 동공 + 1px 하이라이트.
// (lx, rx) = 왼/오 눈의 중심 x. cy = 눈 중심 y.
function Eyes({ variant, lx, rx, cy }: { variant: string; lx: number; rx: number; cy: number }) {
  const v = (["dot", "wink", "round", "sleepy", "star", "sharp"] as const).includes(variant as EyesVariant)
    ? (variant as EyesVariant)
    : "dot";

  if (v === "wink") {
    return (
      <g>
        {/* 왼쪽: 감김(-) */}
        <rect x={lx - 3} y={cy + 1} width={6} height={2} fill={OUTLINE} />
        {/* 오른쪽: 또렷한 눈 */}
        <rect x={rx - 3} y={cy - 3} width={6} height={6} fill="#fff" />
        <rect x={rx - 3} y={cy - 3} width={6} height={1} fill={OUTLINE} />
        <rect x={rx - 1} y={cy - 1} width={3} height={3} fill={OUTLINE} />
        <rect x={rx} y={cy - 1} width={1} height={1} fill="#fff" />
      </g>
    );
  }
  if (v === "round") {
    return (
      <g>
        {[lx, rx].map((cx) => (
          <g key={cx}>
            <circle cx={cx} cy={cy} r={3.5} fill="#fff" />
            <circle cx={cx} cy={cy} r={3.5} fill="none" stroke={OUTLINE} strokeWidth={1} />
            <circle cx={cx} cy={cy} r={2} fill={OUTLINE} />
            <circle cx={cx - 0.5} cy={cy - 0.5} r={0.6} fill="#fff" />
          </g>
        ))}
      </g>
    );
  }
  if (v === "sleepy") {
    return (
      <g>
        <path d={`M ${lx - 3} ${cy} Q ${lx} ${cy + 2} ${lx + 3} ${cy}`} stroke={OUTLINE} strokeWidth={1.4} fill="none" strokeLinecap="round" />
        <path d={`M ${rx - 3} ${cy} Q ${rx} ${cy + 2} ${rx + 3} ${cy}`} stroke={OUTLINE} strokeWidth={1.4} fill="none" strokeLinecap="round" />
      </g>
    );
  }
  if (v === "star") {
    return (
      <g>
        {[lx, rx].map((cx) => (
          <g key={cx}>
            <rect x={cx - 3} y={cy - 3} width={6} height={6} fill="#fff" />
            <rect x={cx - 3} y={cy - 3} width={6} height={1} fill={OUTLINE} />
            {/* 별 모양 동공 */}
            <rect x={cx - 1} y={cy - 2} width={2} height={4} fill="#f8c850" />
            <rect x={cx - 2} y={cy - 1} width={4} height={2} fill="#f8c850" />
            <rect x={cx} y={cy} width={1} height={1} fill="#fff" />
          </g>
        ))}
      </g>
    );
  }
  if (v === "sharp") {
    // 또렷한 사각 학구파 눈 (작고 가늘게)
    return (
      <g>
        <rect x={lx - 2} y={cy - 1} width={4} height={3} fill={OUTLINE} />
        <rect x={rx - 2} y={cy - 1} width={4} height={3} fill={OUTLINE} />
        <rect x={lx} y={cy - 1} width={1} height={1} fill="#fff" />
        <rect x={rx} y={cy - 1} width={1} height={1} fill="#fff" />
      </g>
    );
  }
  // dot (기본) — 메이플 톤 큰 동공 + 하이라이트
  return (
    <g>
      {[lx, rx].map((cx) => (
        <g key={cx}>
          <rect x={cx - 2} y={cy - 3} width={4} height={6} fill="#fff" />
          <rect x={cx - 2} y={cy - 3} width={4} height={1} fill={OUTLINE} />
          <rect x={cx - 2} y={cy - 1} width={4} height={3} fill={OUTLINE} />
          <rect x={cx - 1} y={cy} width={1} height={1} fill="#fff" />
        </g>
      ))}
    </g>
  );
}

function Mouth({ variant, cx, cy }: { variant: string; cx: number; cy: number }) {
  const v = (["smile", "neutral", "oh", "smirk", "tongue"] as const).includes(variant as MouthVariant)
    ? (variant as MouthVariant)
    : "smile";
  if (v === "neutral") {
    return <rect x={cx - 3} y={cy} width={6} height={1.5} fill={OUTLINE} />;
  }
  if (v === "oh") {
    return (
      <g>
        <ellipse cx={cx} cy={cy + 1} rx={2} ry={2.5} fill="#a05030" />
        <ellipse cx={cx} cy={cy + 1} rx={2} ry={2.5} fill="none" stroke={OUTLINE} strokeWidth={0.8} />
      </g>
    );
  }
  if (v === "smirk") {
    return (
      <g>
        <path d={`M ${cx - 4} ${cy + 1} L ${cx + 2} ${cy + 1} Q ${cx + 4} ${cy + 1} ${cx + 4} ${cy - 1}`}
          stroke={OUTLINE} strokeWidth={1.2} fill="none" strokeLinecap="round" />
      </g>
    );
  }
  if (v === "tongue") {
    return (
      <g>
        <path d={`M ${cx - 4} ${cy} Q ${cx} ${cy + 3} ${cx + 4} ${cy}`}
          stroke={OUTLINE} strokeWidth={1.2} fill="none" strokeLinecap="round" />
        <rect x={cx - 1.5} y={cy + 1.5} width={3} height={2} fill="#e07878" />
      </g>
    );
  }
  // smile — 입꼬리 또렷한 1px 코너
  return (
    <g>
      <path d={`M ${cx - 4} ${cy} Q ${cx} ${cy + 3} ${cx + 4} ${cy}`}
        stroke={OUTLINE} strokeWidth={1.2} fill="none" strokeLinecap="round" />
      <rect x={cx - 4.5} y={cy - 0.5} width={1} height={1} fill={OUTLINE} />
      <rect x={cx + 3.5} y={cy - 0.5} width={1} height={1} fill={OUTLINE} />
    </g>
  );
}

// kind 별 얼굴 anchor — 안경(eyes 중심), 모자(머리 위 박스).
type HeadAnchor = {
  eyesLx: number; eyesRx: number; eyesCy: number;
  hatX: number; hatY: number; hatW: number;
};
const HEAD_ANCHORS: Record<string, HeadAnchor> = {
  human:     { eyesLx: 50, eyesRx: 70, eyesCy: 38, hatX: 36, hatY: 12, hatW: 48 },
  cat:       { eyesLx: 48, eyesRx: 72, eyesCy: 44, hatX: 36, hatY: 16, hatW: 48 },
  dog:       { eyesLx: 48, eyesRx: 72, eyesCy: 40, hatX: 36, hatY: 12, hatW: 48 },
  rabbit:    { eyesLx: 48, eyesRx: 72, eyesCy: 48, hatX: 40, hatY: 28, hatW: 40 },
  bear:      { eyesLx: 48, eyesRx: 72, eyesCy: 40, hatX: 32, hatY: 16, hatW: 56 },
  robot:     { eyesLx: 50, eyesRx: 70, eyesCy: 26, hatX: 36, hatY: 0,  hatW: 48 },
  astronaut: { eyesLx: 52, eyesRx: 68, eyesCy: 36, hatX: 32, hatY: 2,  hatW: 56 },
  ghost:     { eyesLx: 48, eyesRx: 72, eyesCy: 56, hatX: 36, hatY: 18, hatW: 48 },
};

function Glasses({ variant, anchor }: { variant: string; anchor: HeadAnchor }) {
  const { eyesLx, eyesRx, eyesCy } = anchor;
  if (variant === "round") {
    return (
      <g>
        <circle cx={eyesLx} cy={eyesCy} r={5} fill="none" stroke={OUTLINE} strokeWidth={1.2} />
        <circle cx={eyesRx} cy={eyesCy} r={5} fill="none" stroke={OUTLINE} strokeWidth={1.2} />
        <rect x={eyesLx + 5} y={eyesCy - 0.5} width={eyesRx - eyesLx - 10} height={1} fill={OUTLINE} />
        {/* 빛 반사 */}
        <rect x={eyesLx - 3} y={eyesCy - 3} width={1.5} height={1.5} fill="#fff" opacity={0.6} />
        <rect x={eyesRx - 3} y={eyesCy - 3} width={1.5} height={1.5} fill="#fff" opacity={0.6} />
      </g>
    );
  }
  if (variant === "square") {
    // 뿔테
    return (
      <g>
        <rect x={eyesLx - 6} y={eyesCy - 4} width={12} height={8} fill="none" stroke={OUTLINE} strokeWidth={1.6} />
        <rect x={eyesRx - 6} y={eyesCy - 4} width={12} height={8} fill="none" stroke={OUTLINE} strokeWidth={1.6} />
        <rect x={eyesLx + 6} y={eyesCy - 0.5} width={eyesRx - eyesLx - 12} height={1.4} fill={OUTLINE} />
        <rect x={eyesLx - 5} y={eyesCy - 3} width={2} height={1} fill="#fff" opacity={0.5} />
        <rect x={eyesRx - 5} y={eyesCy - 3} width={2} height={1} fill="#fff" opacity={0.5} />
      </g>
    );
  }
  if (variant === "sunglasses") {
    return (
      <g>
        <rect x={eyesLx - 6} y={eyesCy - 4} width={12} height={7} fill="#1a1a1a" stroke={OUTLINE} strokeWidth={1} />
        <rect x={eyesRx - 6} y={eyesCy - 4} width={12} height={7} fill="#1a1a1a" stroke={OUTLINE} strokeWidth={1} />
        <rect x={eyesLx + 6} y={eyesCy - 1} width={eyesRx - eyesLx - 12} height={1.4} fill={OUTLINE} />
        <rect x={eyesLx - 5} y={eyesCy - 3} width={3} height={1.2} fill="#5acefc" opacity={0.7} />
        <rect x={eyesRx - 5} y={eyesCy - 3} width={3} height={1.2} fill="#5acefc" opacity={0.7} />
      </g>
    );
  }
  return null;
}

function Hat({ variant, anchor }: { variant: string; anchor: HeadAnchor }) {
  const { hatX, hatY, hatW } = anchor;
  if (variant === "beanie_navy") {
    return (
      <g>
        <rect x={hatX} y={hatY + 6} width={hatW} height={10} fill="#2c4868" />
        <rect x={hatX - 2} y={hatY + 14} width={hatW + 4} height={4} fill="#3a5878" />
        <rect x={hatX} y={hatY + 6} width={hatW} height={2} fill="#3a5878" />
        <rect x={hatX} y={hatY + 6} width={hatW} height={10} fill="none" stroke={OUTLINE} strokeWidth={1} />
        <rect x={hatX + hatW / 2 - 2} y={hatY + 2} width={4} height={5} fill="#2c4868" stroke={OUTLINE} strokeWidth={0.8} />
      </g>
    );
  }
  if (variant === "newsboy_brown") {
    return (
      <g>
        <ellipse cx={hatX + hatW / 2} cy={hatY + 10} rx={hatW / 2 + 2} ry={5} fill="#5a3820" stroke={OUTLINE} strokeWidth={1} />
        <rect x={hatX - 2} y={hatY + 14} width={hatW + 4} height={3} fill="#3a2210" stroke={OUTLINE} strokeWidth={0.8} />
        <rect x={hatX + hatW / 2 - 2} y={hatY + 7} width={4} height={3} fill="#3a2210" />
      </g>
    );
  }
  if (variant === "wizard_purple") {
    return (
      <g>
        <polygon points={`${hatX + hatW / 2 - 14},${hatY + 18} ${hatX + hatW / 2 + 14},${hatY + 18} ${hatX + hatW / 2 + 2},${hatY - 16}`}
          fill="#5a2878" stroke={OUTLINE} strokeWidth={1.2} />
        <rect x={hatX - 2} y={hatY + 16} width={hatW + 4} height={4} fill="#3a1858" stroke={OUTLINE} strokeWidth={0.8} />
        {/* 별 */}
        <rect x={hatX + hatW / 2 - 3} y={hatY + 6} width={2} height={2} fill="#f8c850" />
        <rect x={hatX + hatW / 2} y={hatY + 2} width={2} height={2} fill="#f8c850" />
        <rect x={hatX + hatW / 2 + 4} y={hatY + 10} width={2} height={2} fill="#f8c850" />
      </g>
    );
  }
  if (variant === "graduation_black") {
    return (
      <g>
        {/* 모자 본체 */}
        <rect x={hatX + 4} y={hatY + 8} width={hatW - 8} height={6} fill="#1a1010" stroke={OUTLINE} strokeWidth={1} />
        {/* 사각 윗판 */}
        <rect x={hatX - 4} y={hatY + 4} width={hatW + 8} height={4} fill="#000" stroke={OUTLINE} strokeWidth={1} />
        {/* 술 */}
        <rect x={hatX + hatW - 6} y={hatY + 6} width={1.5} height={10} fill="#f8c850" />
        <rect x={hatX + hatW - 7} y={hatY + 14} width={3.5} height={3} fill="#f8c850" />
      </g>
    );
  }
  if (variant === "cap_red") {
    return (
      <g>
        <rect x={hatX + 4} y={hatY + 6} width={hatW - 8} height={10} fill="#b04038" stroke={OUTLINE} strokeWidth={1} />
        <ellipse cx={hatX + hatW / 2 + 6} cy={hatY + 15} rx={hatW / 2 + 4} ry={3} fill="#702018" stroke={OUTLINE} strokeWidth={0.8} />
        <rect x={hatX + hatW / 2 - 3} y={hatY + 9} width={6} height={3} fill="#e8e0d0" />
      </g>
    );
  }
  return null;
}

function HumanFigure({
  body,
  skin,
  hair,
  eyes,
  mouth,
  top,
  bottom,
  shoes,
}: {
  body: "boy" | "girl";
  skin: string;
  hair: string;
  eyes: string;
  mouth: string;
  top: string;
  bottom: string;
  shoes: string;
}) {
  const sk = SKIN[skin] ?? SKIN.light;
  const hr = HAIR[hair] ?? HAIR.short_brown;
  const tp = TOP[top] ?? TOP.hoodie_white;
  const bt = BOTTOM[bottom] ?? BOTTOM.shorts_green;
  const sh = SHOES[shoes] ?? SHOES.sneakers_brown;

  const isGirl = body === "girl";
  const hairLong = hair.startsWith("long_") || isGirl;

  return (
    <g>
      {/* 발 그림자 */}
      <ellipse cx={60} cy={150} rx={28} ry={4} fill="#000" opacity={0.18} />

      {/* 머리 (40×40, 블록감) */}
      <rect x={40} y={16} width={40} height={40} fill={sk.base} />
      <rect x={40} y={16} width={40} height={2} fill={sk.shade} opacity={0.7} />
      <rect x={40} y={54} width={40} height={2} fill={sk.shade} opacity={0.5} />
      {/* 머리 윤곽 */}
      <rect x={40} y={16} width={40} height={40} fill="none" stroke={OUTLINE} strokeWidth={1} />

      {/* 머리카락 */}
      {hairLong ? (
        <>
          <rect x={36} y={14} width={48} height={12} fill={hr.base} />
          <rect x={36} y={14} width={48} height={2} fill={hr.shade} />
          <rect x={36} y={26} width={6} height={32} fill={hr.base} />
          <rect x={78} y={26} width={6} height={32} fill={hr.base} />
          <rect x={36} y={26} width={2} height={32} fill={hr.shade} />
          <rect x={82} y={26} width={2} height={32} fill={hr.shade} />
          {/* 결 */}
          <rect x={42} y={16} width={1} height={8} fill={hr.shade} opacity={0.6} />
          <rect x={56} y={14} width={1} height={10} fill={hr.shade} opacity={0.6} />
          <rect x={70} y={16} width={1} height={8} fill={hr.shade} opacity={0.6} />
        </>
      ) : (
        <>
          <rect x={38} y={14} width={44} height={10} fill={hr.base} />
          <rect x={38} y={14} width={44} height={2} fill={hr.shade} />
          <rect x={38} y={24} width={6} height={6} fill={hr.base} />
          <rect x={76} y={24} width={6} height={6} fill={hr.base} />
          {/* 결 */}
          <rect x={48} y={14} width={1} height={8} fill={hr.shade} opacity={0.6} />
          <rect x={64} y={14} width={1} height={8} fill={hr.shade} opacity={0.6} />
        </>
      )}

      {/* 얼굴 features */}
      <Eyes variant={eyes} lx={50} rx={70} cy={38} />
      <Mouth variant={mouth} cx={60} cy={48} />
      {/* 볼터치 (톤다운) */}
      <rect x={43} y={44} width={3} height={2} fill="#f0a8a8" opacity={0.35} />
      <rect x={74} y={44} width={3} height={2} fill="#f0a8a8" opacity={0.35} />

      {/* 목 */}
      <rect x={54} y={56} width={12} height={6} fill={sk.base} />
      <rect x={54} y={56} width={12} height={6} fill={sk.shade} opacity={0.4} />

      {/* 상체 (52×44) */}
      <rect x={34} y={62} width={52} height={44} fill={tp.base} />
      <rect x={34} y={62} width={3} height={44} fill={tp.shade} opacity={0.5} />
      <rect x={83} y={62} width={3} height={44} fill={tp.shade} opacity={0.7} />
      <rect x={34} y={62} width={52} height={3} fill={tp.shade} opacity={0.4} />
      <rect x={34} y={62} width={52} height={44} fill="none" stroke={OUTLINE} strokeWidth={1} />
      {/* 후드 끈 */}
      {top.startsWith("hoodie") && (
        <>
          <rect x={56} y={62} width={2} height={10} fill={tp.shade} opacity={0.7} />
          <rect x={62} y={62} width={2} height={10} fill={tp.shade} opacity={0.7} />
          <rect x={56} y={71} width={2} height={2} fill={tp.base} />
          <rect x={62} y={71} width={2} height={2} fill={tp.base} />
        </>
      )}
      {/* 티셔츠 V넥 */}
      {top.startsWith("tshirt") && (
        <polygon points="58,62 62,62 60,68" fill={sk.base} stroke={OUTLINE} strokeWidth={0.6} />
      )}
      {/* 자켓 지퍼 */}
      {top.startsWith("jacket") && (
        <rect x={59.5} y={62} width={1} height={42} fill={tp.shade} />
      )}

      {/* 팔 */}
      <rect x={26} y={64} width={8} height={36} fill={tp.base} />
      <rect x={26} y={64} width={2} height={36} fill={tp.shade} opacity={0.5} />
      <rect x={26} y={64} width={8} height={36} fill="none" stroke={OUTLINE} strokeWidth={1} />
      <rect x={86} y={64} width={8} height={36} fill={tp.base} />
      <rect x={92} y={64} width={2} height={36} fill={tp.shade} opacity={0.7} />
      <rect x={86} y={64} width={8} height={36} fill="none" stroke={OUTLINE} strokeWidth={1} />
      {/* 손 */}
      <rect x={26} y={100} width={8} height={6} fill={sk.base} stroke={OUTLINE} strokeWidth={1} />
      <rect x={86} y={100} width={8} height={6} fill={sk.base} stroke={OUTLINE} strokeWidth={1} />

      {/* 하의 */}
      {bottom.startsWith("skirt") ? (
        <>
          <polygon points="38,106 82,106 88,136 32,136" fill={bt.base} stroke={OUTLINE} strokeWidth={1} />
          <polygon points="38,106 40,136 32,136" fill={bt.shade} opacity={0.5} />
        </>
      ) : (
        <>
          <rect x={38} y={106} width={18} height={36} fill={bt.base} />
          <rect x={64} y={106} width={18} height={36} fill={bt.base} />
          <rect x={38} y={106} width={2} height={36} fill={bt.shade} opacity={0.5} />
          <rect x={80} y={106} width={2} height={36} fill={bt.shade} opacity={0.7} />
          <rect x={56} y={106} width={8} height={36} fill={bt.shade} opacity={0.4} />
          <rect x={38} y={106} width={18} height={36} fill="none" stroke={OUTLINE} strokeWidth={1} />
          <rect x={64} y={106} width={18} height={36} fill="none" stroke={OUTLINE} strokeWidth={1} />
        </>
      )}

      {/* 다리 (스커트일 때) */}
      {bottom.startsWith("skirt") && (
        <>
          <rect x={44} y={136} width={12} height={10} fill={sk.base} stroke={OUTLINE} strokeWidth={1} />
          <rect x={64} y={136} width={12} height={10} fill={sk.base} stroke={OUTLINE} strokeWidth={1} />
        </>
      )}

      {/* 신발 */}
      <rect x={bottom.startsWith("skirt") ? 42 : 38} y={142} width={18} height={8} fill={sh.base} stroke={OUTLINE} strokeWidth={1} />
      <rect x={bottom.startsWith("skirt") ? 62 : 64} y={142} width={18} height={8} fill={sh.base} stroke={OUTLINE} strokeWidth={1} />
      <rect x={bottom.startsWith("skirt") ? 42 : 38} y={148} width={18} height={2} fill={sh.shade} />
      <rect x={bottom.startsWith("skirt") ? 62 : 64} y={148} width={18} height={2} fill={sh.shade} />
    </g>
  );
}

const ANIMAL: Record<string, () => JSX.Element> = {
  cat: () => (
    <g>
      <ellipse cx={60} cy={150} rx={28} ry={5} fill="#000" opacity={0.18} />
      {/* 몸 */}
      <rect x={34} y={76} width={52} height={56} fill="#e8b840" stroke={OUTLINE} strokeWidth={1} />
      <rect x={34} y={76} width={3} height={56} fill="#a07818" opacity={0.5} />
      <rect x={83} y={76} width={3} height={56} fill="#a07818" opacity={0.7} />
      {/* 머리 */}
      <rect x={36} y={28} width={48} height={44} fill="#e8b840" stroke={OUTLINE} strokeWidth={1} />
      {/* 귀 */}
      <polygon points="36,28 36,12 50,28" fill="#e8b840" stroke={OUTLINE} strokeWidth={1} />
      <polygon points="84,28 84,12 70,28" fill="#e8b840" stroke={OUTLINE} strokeWidth={1} />
      <polygon points="38,26 38,18 48,26" fill="#d088a0" />
      <polygon points="82,26 82,18 72,26" fill="#d088a0" />
      {/* 눈 (메이플 톤) */}
      <ellipse cx={48} cy={44} rx={3} ry={4} fill={OUTLINE} />
      <ellipse cx={72} cy={44} rx={3} ry={4} fill={OUTLINE} />
      <rect x={47} y={42} width={1.5} height={1.5} fill="#fff" />
      <rect x={71} y={42} width={1.5} height={1.5} fill="#fff" />
      {/* 코 */}
      <polygon points="60,54 56,58 64,58" fill="#a05030" stroke={OUTLINE} strokeWidth={0.8} />
      {/* 입 */}
      <path d="M 60 58 Q 56 62 52 60" stroke={OUTLINE} strokeWidth={1.2} fill="none" strokeLinecap="round" />
      <path d="M 60 58 Q 64 62 68 60" stroke={OUTLINE} strokeWidth={1.2} fill="none" strokeLinecap="round" />
      {/* 수염 */}
      <line x1={32} y1={54} x2={44} y2={56} stroke="#888" strokeWidth={0.8} />
      <line x1={88} y1={54} x2={76} y2={56} stroke="#888" strokeWidth={0.8} />
      {/* 발 */}
      <rect x={36} y={132} width={18} height={10} fill="#d09830" stroke={OUTLINE} strokeWidth={1} />
      <rect x={66} y={132} width={18} height={10} fill="#d09830" stroke={OUTLINE} strokeWidth={1} />
    </g>
  ),
  dog: () => (
    <g>
      <ellipse cx={60} cy={150} rx={28} ry={5} fill="#000" opacity={0.18} />
      <rect x={34} y={76} width={52} height={56} fill="#a87850" stroke={OUTLINE} strokeWidth={1} />
      <rect x={34} y={76} width={3} height={56} fill="#7a5028" opacity={0.5} />
      <rect x={83} y={76} width={3} height={56} fill="#7a5028" opacity={0.7} />
      <rect x={36} y={24} width={48} height={44} fill="#a87850" stroke={OUTLINE} strokeWidth={1} />
      {/* 늘어진 귀 */}
      <ellipse cx={32} cy={40} rx={8} ry={16} fill="#6a4828" stroke={OUTLINE} strokeWidth={1} />
      <ellipse cx={88} cy={40} rx={8} ry={16} fill="#6a4828" stroke={OUTLINE} strokeWidth={1} />
      {/* 주둥이 */}
      <rect x={48} y={48} width={24} height={20} fill="#e8c8a0" stroke={OUTLINE} strokeWidth={1} />
      <ellipse cx={60} cy={52} rx={3} ry={2} fill={OUTLINE} />
      <path d="M 60 54 L 60 60" stroke={OUTLINE} strokeWidth={1.2} />
      <path d="M 56 60 Q 60 64 64 60" stroke={OUTLINE} strokeWidth={1.2} fill="none" />
      {/* 눈 */}
      <ellipse cx={48} cy={40} rx={3} ry={4} fill={OUTLINE} />
      <ellipse cx={72} cy={40} rx={3} ry={4} fill={OUTLINE} />
      <rect x={47} y={38} width={1.5} height={1.5} fill="#fff" />
      <rect x={71} y={38} width={1.5} height={1.5} fill="#fff" />
      <rect x={36} y={132} width={18} height={10} fill="#6a4828" stroke={OUTLINE} strokeWidth={1} />
      <rect x={66} y={132} width={18} height={10} fill="#6a4828" stroke={OUTLINE} strokeWidth={1} />
    </g>
  ),
  rabbit: () => (
    <g>
      <ellipse cx={60} cy={150} rx={28} ry={5} fill="#000" opacity={0.18} />
      <rect x={34} y={76} width={52} height={56} fill="#f0e8d8" stroke={OUTLINE} strokeWidth={1} />
      <rect x={34} y={76} width={3} height={56} fill="#a89878" opacity={0.5} />
      <rect x={83} y={76} width={3} height={56} fill="#a89878" opacity={0.7} />
      <rect x={36} y={36} width={48} height={36} fill="#f0e8d8" stroke={OUTLINE} strokeWidth={1} />
      {/* 긴 귀 */}
      <rect x={40} y={4} width={10} height={36} fill="#f0e8d8" rx={4} stroke={OUTLINE} strokeWidth={1} />
      <rect x={70} y={4} width={10} height={36} fill="#f0e8d8" rx={4} stroke={OUTLINE} strokeWidth={1} />
      <rect x={43} y={8} width={4} height={28} fill="#d088a0" rx={2} />
      <rect x={73} y={8} width={4} height={28} fill="#d088a0" rx={2} />
      {/* 눈 */}
      <ellipse cx={48} cy={48} rx={3} ry={4} fill={OUTLINE} />
      <ellipse cx={72} cy={48} rx={3} ry={4} fill={OUTLINE} />
      <rect x={47} y={46} width={1.5} height={1.5} fill="#fff" />
      <rect x={71} y={46} width={1.5} height={1.5} fill="#fff" />
      {/* 코 */}
      <ellipse cx={60} cy={58} rx={2.4} ry={1.6} fill="#d088a0" stroke={OUTLINE} strokeWidth={0.8} />
      <path d="M 60 60 L 60 63" stroke={OUTLINE} strokeWidth={1} />
      <rect x={36} y={132} width={18} height={10} fill="#d0c8b8" stroke={OUTLINE} strokeWidth={1} />
      <rect x={66} y={132} width={18} height={10} fill="#d0c8b8" stroke={OUTLINE} strokeWidth={1} />
    </g>
  ),
  bear: () => (
    <g>
      <ellipse cx={60} cy={150} rx={28} ry={5} fill="#000" opacity={0.18} />
      <rect x={32} y={76} width={56} height={56} fill="#7a4a30" stroke={OUTLINE} strokeWidth={1} />
      <rect x={32} y={76} width={3} height={56} fill="#4a2c18" opacity={0.5} />
      <rect x={85} y={76} width={3} height={56} fill="#4a2c18" opacity={0.7} />
      <rect x={34} y={28} width={52} height={44} fill="#7a4a30" stroke={OUTLINE} strokeWidth={1} />
      {/* 둥근 귀 */}
      <circle cx={36} cy={28} r={8} fill="#7a4a30" stroke={OUTLINE} strokeWidth={1} />
      <circle cx={84} cy={28} r={8} fill="#7a4a30" stroke={OUTLINE} strokeWidth={1} />
      <circle cx={36} cy={28} r={4} fill="#e8c8a0" />
      <circle cx={84} cy={28} r={4} fill="#e8c8a0" />
      {/* 주둥이 */}
      <rect x={46} y={48} width={28} height={20} fill="#e8c8a0" stroke={OUTLINE} strokeWidth={1} />
      <ellipse cx={60} cy={52} rx={3} ry={2} fill={OUTLINE} />
      <ellipse cx={48} cy={40} rx={3} ry={4} fill={OUTLINE} />
      <ellipse cx={72} cy={40} rx={3} ry={4} fill={OUTLINE} />
      <rect x={47} y={38} width={1.5} height={1.5} fill="#fff" />
      <rect x={71} y={38} width={1.5} height={1.5} fill="#fff" />
      <rect x={34} y={132} width={20} height={10} fill="#4a2c18" stroke={OUTLINE} strokeWidth={1} />
      <rect x={66} y={132} width={20} height={10} fill="#4a2c18" stroke={OUTLINE} strokeWidth={1} />
    </g>
  ),
};

const FANTASY: Record<string, () => JSX.Element> = {
  robot: () => (
    <g>
      <ellipse cx={60} cy={150} rx={28} ry={5} fill="#000" opacity={0.2} />
      {/* 머리 */}
      <rect x={40} y={12} width={40} height={36} fill="#a8b0b8" stroke={OUTLINE} strokeWidth={1} />
      <rect x={40} y={12} width={40} height={4} fill="#c8d0d8" />
      <rect x={40} y={44} width={40} height={4} fill={OUTLINE} opacity={0.4} />
      {/* 안테나 */}
      <rect x={58} y={4} width={4} height={8} fill="#888" stroke={OUTLINE} strokeWidth={0.8} />
      <circle cx={60} cy={4} r={3} fill="#e04038" stroke={OUTLINE} strokeWidth={1} />
      {/* LED 눈 */}
      <rect x={46} y={24} width={8} height={6} fill="#5acefc" stroke={OUTLINE} strokeWidth={0.8} />
      <rect x={66} y={24} width={8} height={6} fill="#5acefc" stroke={OUTLINE} strokeWidth={0.8} />
      <rect x={47} y={25} width={2} height={2} fill="#fff" />
      <rect x={67} y={25} width={2} height={2} fill="#fff" />
      <rect x={52} y={36} width={16} height={3} fill={OUTLINE} opacity={0.7} />
      {/* 몸 */}
      <rect x={34} y={52} width={52} height={52} fill="#a8b0b8" stroke={OUTLINE} strokeWidth={1} />
      <rect x={34} y={52} width={52} height={4} fill="#c8d0d8" />
      <rect x={34} y={100} width={52} height={4} fill={OUTLINE} opacity={0.4} />
      <circle cx={60} cy={76} r={6} fill="#e8b840" stroke={OUTLINE} strokeWidth={1} />
      <rect x={48} y={88} width={8} height={4} fill="#5acefc" stroke={OUTLINE} strokeWidth={0.6} />
      <rect x={64} y={88} width={8} height={4} fill="#5acefc" stroke={OUTLINE} strokeWidth={0.6} />
      {/* 팔 */}
      <rect x={24} y={56} width={10} height={40} fill="#888" stroke={OUTLINE} strokeWidth={1} />
      <rect x={86} y={56} width={10} height={40} fill="#888" stroke={OUTLINE} strokeWidth={1} />
      {/* 다리 */}
      <rect x={40} y={104} width={16} height={36} fill="#888" stroke={OUTLINE} strokeWidth={1} />
      <rect x={64} y={104} width={16} height={36} fill="#888" stroke={OUTLINE} strokeWidth={1} />
      <rect x={36} y={140} width={22} height={10} fill="#2a2830" stroke={OUTLINE} strokeWidth={1} />
      <rect x={62} y={140} width={22} height={10} fill="#2a2830" stroke={OUTLINE} strokeWidth={1} />
    </g>
  ),
  astronaut: () => (
    <g>
      <ellipse cx={60} cy={150} rx={28} ry={5} fill="#000" opacity={0.2} />
      {/* 헬멧 */}
      <circle cx={60} cy={40} r={26} fill="#f0e8d8" stroke={OUTLINE} strokeWidth={1} />
      <ellipse cx={60} cy={40} rx={18} ry={16} fill="#2c4868" stroke={OUTLINE} strokeWidth={1} />
      <ellipse cx={52} cy={34} rx={6} ry={4} fill="#fff" opacity={0.5} />
      {/* 몸 */}
      <rect x={34} y={62} width={52} height={44} fill="#f0e8d8" stroke={OUTLINE} strokeWidth={1} />
      <rect x={34} y={62} width={52} height={4} fill="#fff" />
      <rect x={34} y={102} width={52} height={4} fill={OUTLINE} opacity={0.4} />
      {/* 마크 */}
      <circle cx={60} cy={84} r={6} fill="#b04038" stroke={OUTLINE} strokeWidth={1} />
      <rect x={56} y={72} width={8} height={6} fill="#4878a8" stroke={OUTLINE} strokeWidth={0.6} />
      {/* 팔 */}
      <rect x={26} y={64} width={10} height={36} fill="#f0e8d8" stroke={OUTLINE} strokeWidth={1} />
      <rect x={84} y={64} width={10} height={36} fill="#f0e8d8" stroke={OUTLINE} strokeWidth={1} />
      <rect x={26} y={96} width={10} height={6} fill="#3a3a40" stroke={OUTLINE} strokeWidth={0.8} />
      <rect x={84} y={96} width={10} height={6} fill="#3a3a40" stroke={OUTLINE} strokeWidth={0.8} />
      {/* 다리 */}
      <rect x={38} y={106} width={18} height={34} fill="#f0e8d8" stroke={OUTLINE} strokeWidth={1} />
      <rect x={64} y={106} width={18} height={34} fill="#f0e8d8" stroke={OUTLINE} strokeWidth={1} />
      <rect x={36} y={140} width={22} height={10} fill="#3a3a40" stroke={OUTLINE} strokeWidth={1} />
      <rect x={62} y={140} width={22} height={10} fill="#3a3a40" stroke={OUTLINE} strokeWidth={1} />
    </g>
  ),
  ghost: () => (
    <g>
      <ellipse cx={60} cy={150} rx={28} ry={5} fill="#000" opacity={0.18} />
      <path
        d="M 32 140 L 32 56 Q 32 24 60 24 Q 88 24 88 56 L 88 140 L 78 132 L 68 140 L 60 132 L 52 140 L 42 132 Z"
        fill="#f0e8d8"
        stroke={OUTLINE}
        strokeWidth={1.2}
      />
      <path d="M 32 140 L 32 56 Q 32 24 60 24" stroke="#fff" strokeWidth={3} fill="none" opacity={0.6} />
      <ellipse cx={48} cy={56} rx={3} ry={5} fill={OUTLINE} />
      <ellipse cx={72} cy={56} rx={3} ry={5} fill={OUTLINE} />
      <rect x={47} y={54} width={1.5} height={1.5} fill="#fff" />
      <rect x={71} y={54} width={1.5} height={1.5} fill="#fff" />
      <ellipse cx={60} cy={76} rx={6} ry={4} fill={OUTLINE} />
    </g>
  ),
};

export function AvatarFigure({
  config,
  size = 144,
  className,
}: {
  config?: AvatarConfig | null;
  size?: number;
  className?: string;
}) {
  const cfg: AvatarConfig = config ?? DEFAULT_AVATAR;

  // 사진 업로드 아바타 — img 로 직접 렌더 (정사각, 둥근 모서리, 외곽선 픽셀톤 유지)
  if (cfg.kind === "image") {
    return (
      <img
        src={cfg.url}
        alt=""
        width={size}
        height={(size * 160) / 120}
        className={className}
        style={{
          width: size,
          height: (size * 160) / 120,
          objectFit: "cover",
          objectPosition: "center top",
          borderRadius: 12,
          border: "2px solid #2a1a14",
          background: "#fff",
          imageRendering: "auto",
          display: "block",
        }}
      />
    );
  }

  let inner: JSX.Element;
  let anchorKey: string;
  if (cfg.kind === "human") {
    inner = (
      <HumanFigure
        body={cfg.body}
        skin={cfg.skin}
        hair={cfg.hair}
        eyes={cfg.eyes}
        mouth={cfg.mouth}
        top={cfg.top}
        bottom={cfg.bottom}
        shoes={cfg.shoes}
      />
    );
    anchorKey = "human";
  } else if (cfg.kind === "animal") {
    const draw = ANIMAL[cfg.variant] ?? ANIMAL.cat;
    inner = draw();
    anchorKey = ANIMAL[cfg.variant] ? cfg.variant : "cat";
  } else {
    const draw = FANTASY[cfg.variant] ?? FANTASY.robot;
    inner = draw();
    anchorKey = FANTASY[cfg.variant] ? cfg.variant : "robot";
  }

  const anchor = HEAD_ANCHORS[anchorKey] ?? HEAD_ANCHORS.human;
  const acc = cfg.accessories;
  const glassesV = acc?.glasses && acc.glasses !== "none" ? acc.glasses : null;
  const hatV = acc?.hat && acc.hat !== "none" ? acc.hat : null;

  return (
    <svg
      viewBox="0 0 120 160"
      width={size}
      height={(size * 160) / 120}
      shapeRendering="crispEdges"
      className={className}
      aria-hidden
    >
      {inner}
      {glassesV && <Glasses variant={glassesV} anchor={anchor} />}
      {hatV && <Hat variant={hatV} anchor={anchor} />}
    </svg>
  );
}

// 편집 UI 가 사용할 part 옵션 목록.
export const AVATAR_OPTIONS = {
  skin: Object.keys(SKIN),
  hair: Object.keys(HAIR),
  eyes: ["dot", "wink", "round", "sleepy", "star", "sharp"] as const,
  mouth: ["smile", "neutral", "oh", "smirk", "tongue"] as const,
  top: Object.keys(TOP),
  bottom: Object.keys(BOTTOM),
  shoes: Object.keys(SHOES),
  animal: Object.keys(ANIMAL),
  fantasy: Object.keys(FANTASY),
  glasses: ["none", "round", "square", "sunglasses"] as const,
  hat: ["none", "beanie_navy", "newsboy_brown", "wizard_purple", "graduation_black", "cap_red"] as const,
};
