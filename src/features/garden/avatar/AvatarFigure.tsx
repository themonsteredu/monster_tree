// 학생 아바타 (사과정원 me 페이지 + TV 화면) 렌더 컴포넌트.
// voxel-look 픽셀 캐릭터. config 의 kind/part 에 따라 SVG 도형 합성.
// 알 수 없는 키는 디폴트 폴백.

import type { AvatarConfig } from "@/lib/types";
import { DEFAULT_AVATAR } from "@/lib/types";

// 사람 part 팔레트
const SKIN: Record<string, string> = {
  light: "#f4d4a8",
  tan: "#d4a77a",
  dark: "#8b5a3c",
};
const HAIR: Record<string, string> = {
  short_brown: "#5c3a1f",
  short_black: "#2a1a14",
  short_blonde: "#d4a55a",
  long_brown: "#6a4828",
  long_black: "#1a0f0a",
  long_pink: "#e8a8c0",
};
const TOP: Record<string, string> = {
  hoodie_white: "#f5f1ea",
  tshirt_blue: "#5b8db8",
  tshirt_red: "#c0524a",
  dress_pink: "#e8a8c0",
  jacket_yellow: "#f5c850",
};
const BOTTOM: Record<string, string> = {
  shorts_green: "#7a9858",
  pants_blue: "#3a5878",
  skirt_pink: "#e8a8c0",
  pants_black: "#2a2018",
};
const SHOES: Record<string, string> = {
  sneakers_brown: "#5c3a1f",
  sneakers_white: "#f5f5f5",
  sneakers_red: "#c0524a",
};

type FaceVariant = "smile" | "neutral" | "surprised" | "wink";

function FaceFeatures({ variant, x, y }: { variant: FaceVariant; x: number; y: number }) {
  // 얼굴 영역 (x,y) 기준 상대 좌표
  const eyeY = y + 8;
  const mouthY = y + 14;
  return (
    <g>
      {/* 눈 */}
      {variant === "wink" ? (
        <>
          <rect x={x + 4} y={eyeY + 1} width={3} height={1.5} fill="#2a1a14" />
          <rect x={x + 11} y={eyeY} width={2} height={2.5} fill="#2a1a14" />
        </>
      ) : variant === "surprised" ? (
        <>
          <circle cx={x + 5.5} cy={eyeY + 1} r={1.5} fill="#2a1a14" />
          <circle cx={x + 12} cy={eyeY + 1} r={1.5} fill="#2a1a14" />
        </>
      ) : (
        <>
          <rect x={x + 4} y={eyeY} width={2} height={2.5} fill="#2a1a14" />
          <rect x={x + 11} y={eyeY} width={2} height={2.5} fill="#2a1a14" />
        </>
      )}
      {/* 볼터치 */}
      <circle cx={x + 3} cy={eyeY + 4} r={1.4} fill="#f4a8a8" opacity={0.7} />
      <circle cx={x + 14} cy={eyeY + 4} r={1.4} fill="#f4a8a8" opacity={0.7} />
      {/* 입 */}
      {variant === "smile" ? (
        <path
          d={`M ${x + 6} ${mouthY} Q ${x + 8.5} ${mouthY + 2} ${x + 11} ${mouthY}`}
          stroke="#a05030"
          strokeWidth={0.8}
          fill="none"
          strokeLinecap="round"
        />
      ) : variant === "surprised" ? (
        <ellipse cx={x + 8.5} cy={mouthY + 1} rx={1.2} ry={1.5} fill="#a05030" />
      ) : (
        <rect x={x + 7} y={mouthY + 0.5} width={3} height={0.8} fill="#a05030" />
      )}
    </g>
  );
}

function HumanFigure({
  body,
  skin,
  hair,
  face,
  top,
  bottom,
  shoes,
}: {
  body: "boy" | "girl";
  skin: string;
  hair: string;
  face: string;
  top: string;
  bottom: string;
  shoes: string;
}) {
  const skinC = SKIN[skin] ?? SKIN.light;
  const hairC = HAIR[hair] ?? HAIR.short_brown;
  const topC = TOP[top] ?? TOP.hoodie_white;
  const bottomC = BOTTOM[bottom] ?? BOTTOM.shorts_green;
  const shoesC = SHOES[shoes] ?? SHOES.sneakers_brown;
  const faceV: FaceVariant = (["smile", "neutral", "surprised", "wink"].includes(face) ? face : "smile") as FaceVariant;

  // 60x80 viewBox 안에서 캐릭터 그리기 (그림자 포함)
  const isGirl = body === "girl";
  const hairLong = hair.startsWith("long_") || isGirl;

  return (
    <g>
      {/* 발 그림자 */}
      <ellipse cx={30} cy={75} rx={14} ry={2.5} fill="#000" opacity={0.12} />

      {/* 머리 (사각형 voxel) */}
      <rect x={20} y={8} width={20} height={20} fill={skinC} />
      {/* 머리 위쪽 더 어둡게 → voxel 느낌 */}
      <rect x={20} y={8} width={20} height={2} fill={skinC} opacity={0.85} />

      {/* 머리카락 */}
      {hairLong ? (
        <>
          <rect x={17} y={7} width={26} height={6} fill={hairC} />
          <rect x={17} y={13} width={4} height={18} fill={hairC} />
          <rect x={39} y={13} width={4} height={18} fill={hairC} />
        </>
      ) : (
        <>
          <rect x={19} y={7} width={22} height={5} fill={hairC} />
          <rect x={19} y={12} width={4} height={3} fill={hairC} />
          <rect x={37} y={12} width={4} height={3} fill={hairC} />
        </>
      )}

      {/* 얼굴 features (오프셋: 머리 안쪽) */}
      <FaceFeatures variant={faceV} x={21} y={12} />

      {/* 목 */}
      <rect x={27} y={28} width={6} height={3} fill={skinC} opacity={0.85} />

      {/* 상체 (상의) */}
      <rect x={17} y={31} width={26} height={22} fill={topC} />
      {/* 상의 하이라이트 (왼쪽 1px) */}
      <rect x={17} y={31} width={1.5} height={22} fill={topC} opacity={0.8} />
      {/* 상의 그림자 (오른쪽 1px) */}
      <rect x={41.5} y={31} width={1.5} height={22} fill="#000" opacity={0.15} />
      {/* 후드 끈 (hoodie 인 경우 간략 표시) */}
      {top.startsWith("hoodie") && (
        <>
          <rect x={28} y={31} width={1} height={5} fill={topC} opacity={0.6} />
          <rect x={31} y={31} width={1} height={5} fill={topC} opacity={0.6} />
        </>
      )}

      {/* 팔 */}
      <rect x={13} y={32} width={4} height={18} fill={topC} />
      <rect x={43} y={32} width={4} height={18} fill={topC} />
      {/* 손 */}
      <rect x={13} y={50} width={4} height={3} fill={skinC} />
      <rect x={43} y={50} width={4} height={3} fill={skinC} />

      {/* 하의 */}
      {bottom.startsWith("skirt") ? (
        <polygon
          points={`19,53 41,53 44,68 16,68`}
          fill={bottomC}
        />
      ) : (
        <>
          <rect x={19} y={53} width={9} height={18} fill={bottomC} />
          <rect x={32} y={53} width={9} height={18} fill={bottomC} />
          <rect x={28} y={53} width={4} height={18} fill={bottomC} opacity={0.85} />
        </>
      )}

      {/* 다리 (스커트일 경우 종아리 노출) */}
      {bottom.startsWith("skirt") && (
        <>
          <rect x={22} y={68} width={6} height={6} fill={skinC} />
          <rect x={32} y={68} width={6} height={6} fill={skinC} />
        </>
      )}

      {/* 신발 */}
      <rect x={bottom.startsWith("skirt") ? 21 : 19} y={71} width={9} height={4} fill={shoesC} />
      <rect x={bottom.startsWith("skirt") ? 31 : 32} y={71} width={9} height={4} fill={shoesC} />
    </g>
  );
}

const ANIMAL: Record<string, () => JSX.Element> = {
  cat: () => (
    <g>
      <ellipse cx={30} cy={75} rx={14} ry={2.5} fill="#000" opacity={0.12} />
      {/* 몸 */}
      <rect x={17} y={38} width={26} height={28} fill="#f5c850" />
      <rect x={17} y={38} width={1.5} height={28} fill="#f5c850" opacity={0.8} />
      <rect x={41.5} y={38} width={1.5} height={28} fill="#000" opacity={0.15} />
      {/* 머리 */}
      <rect x={18} y={14} width={24} height={22} fill="#f5c850" />
      {/* 귀 */}
      <polygon points="18,14 18,6 25,14" fill="#f5c850" />
      <polygon points="42,14 42,6 35,14" fill="#f5c850" />
      <polygon points="19,13 19,9 24,13" fill="#e8a8c0" />
      <polygon points="41,13 41,9 36,13" fill="#e8a8c0" />
      {/* 눈 */}
      <ellipse cx={24} cy={22} rx={1.5} ry={2} fill="#2a1a14" />
      <ellipse cx={36} cy={22} rx={1.5} ry={2} fill="#2a1a14" />
      {/* 코 */}
      <polygon points="30,27 28,29 32,29" fill="#a05030" />
      {/* 입 */}
      <path d="M 30 29 Q 28 31 26 30" stroke="#a05030" strokeWidth={0.8} fill="none" strokeLinecap="round" />
      <path d="M 30 29 Q 32 31 34 30" stroke="#a05030" strokeWidth={0.8} fill="none" strokeLinecap="round" />
      {/* 수염 */}
      <line x1={16} y1={27} x2={22} y2={28} stroke="#888" strokeWidth={0.4} />
      <line x1={44} y1={27} x2={38} y2={28} stroke="#888" strokeWidth={0.4} />
      {/* 발 */}
      <rect x={18} y={66} width={9} height={5} fill="#e8a55a" />
      <rect x={33} y={66} width={9} height={5} fill="#e8a55a" />
    </g>
  ),
  dog: () => (
    <g>
      <ellipse cx={30} cy={75} rx={14} ry={2.5} fill="#000" opacity={0.12} />
      <rect x={17} y={38} width={26} height={28} fill="#c08a5a" />
      <rect x={17} y={38} width={1.5} height={28} fill="#c08a5a" opacity={0.8} />
      <rect x={41.5} y={38} width={1.5} height={28} fill="#000" opacity={0.15} />
      {/* 머리 */}
      <rect x={18} y={12} width={24} height={22} fill="#c08a5a" />
      {/* 늘어진 귀 */}
      <ellipse cx={16} cy={20} rx={4} ry={8} fill="#8b5a3c" />
      <ellipse cx={44} cy={20} rx={4} ry={8} fill="#8b5a3c" />
      {/* 주둥이 */}
      <rect x={24} y={24} width={12} height={10} fill="#e8c0a0" />
      <ellipse cx={30} cy={26} rx={2} ry={1.5} fill="#2a1a14" />
      <path d="M 30 27 L 30 30" stroke="#2a1a14" strokeWidth={0.6} />
      <path d="M 28 30 Q 30 32 32 30" stroke="#2a1a14" strokeWidth={0.6} fill="none" />
      {/* 눈 */}
      <ellipse cx={24} cy={20} rx={1.5} ry={2} fill="#2a1a14" />
      <ellipse cx={36} cy={20} rx={1.5} ry={2} fill="#2a1a14" />
      <rect x={18} y={66} width={9} height={5} fill="#8b5a3c" />
      <rect x={33} y={66} width={9} height={5} fill="#8b5a3c" />
    </g>
  ),
  rabbit: () => (
    <g>
      <ellipse cx={30} cy={75} rx={14} ry={2.5} fill="#000" opacity={0.12} />
      <rect x={17} y={38} width={26} height={28} fill="#f5f1ea" />
      <rect x={17} y={38} width={1.5} height={28} fill="#f5f1ea" opacity={0.8} />
      <rect x={41.5} y={38} width={1.5} height={28} fill="#000" opacity={0.15} />
      <rect x={18} y={18} width={24} height={18} fill="#f5f1ea" />
      {/* 긴 귀 */}
      <rect x={20} y={2} width={5} height={18} fill="#f5f1ea" rx={2} />
      <rect x={35} y={2} width={5} height={18} fill="#f5f1ea" rx={2} />
      <rect x={21.5} y={4} width={2} height={14} fill="#e8a8c0" rx={1} />
      <rect x={36.5} y={4} width={2} height={14} fill="#e8a8c0" rx={1} />
      {/* 눈 */}
      <ellipse cx={24} cy={24} rx={1.5} ry={2} fill="#2a1a14" />
      <ellipse cx={36} cy={24} rx={1.5} ry={2} fill="#2a1a14" />
      {/* 코 */}
      <ellipse cx={30} cy={29} rx={1.2} ry={0.8} fill="#e8a8c0" />
      <path d="M 30 30 L 30 31.5" stroke="#a05030" strokeWidth={0.5} />
      <rect x={18} y={66} width={9} height={5} fill="#e8e0d4" />
      <rect x={33} y={66} width={9} height={5} fill="#e8e0d4" />
    </g>
  ),
  bear: () => (
    <g>
      <ellipse cx={30} cy={75} rx={14} ry={2.5} fill="#000" opacity={0.12} />
      <rect x={16} y={38} width={28} height={28} fill="#8b5a3c" />
      <rect x={16} y={38} width={1.5} height={28} fill="#8b5a3c" opacity={0.8} />
      <rect x={42.5} y={38} width={1.5} height={28} fill="#000" opacity={0.15} />
      <rect x={17} y={14} width={26} height={22} fill="#8b5a3c" />
      {/* 둥근 귀 */}
      <circle cx={18} cy={14} r={4} fill="#8b5a3c" />
      <circle cx={42} cy={14} r={4} fill="#8b5a3c" />
      <circle cx={18} cy={14} r={2} fill="#e8c0a0" />
      <circle cx={42} cy={14} r={2} fill="#e8c0a0" />
      {/* 주둥이 */}
      <rect x={23} y={24} width={14} height={10} fill="#e8c0a0" />
      <ellipse cx={30} cy={26} rx={2} ry={1.5} fill="#2a1a14" />
      <ellipse cx={24} cy={20} rx={1.5} ry={2} fill="#2a1a14" />
      <ellipse cx={36} cy={20} rx={1.5} ry={2} fill="#2a1a14" />
      <rect x={17} y={66} width={10} height={5} fill="#5c3a1f" />
      <rect x={33} y={66} width={10} height={5} fill="#5c3a1f" />
    </g>
  ),
};

const FANTASY: Record<string, () => JSX.Element> = {
  robot: () => (
    <g>
      <ellipse cx={30} cy={75} rx={14} ry={2.5} fill="#000" opacity={0.15} />
      {/* 머리 */}
      <rect x={20} y={6} width={20} height={18} fill="#b8c0c8" />
      <rect x={20} y={6} width={20} height={2} fill="#d8e0e8" />
      <rect x={20} y={22} width={20} height={2} fill="#000" opacity={0.2} />
      {/* 안테나 */}
      <rect x={29} y={2} width={2} height={4} fill="#888" />
      <circle cx={30} cy={2} r={2} fill="#f0524a" />
      {/* 눈 (LED) */}
      <rect x={23} y={12} width={4} height={3} fill="#5acefc" />
      <rect x={33} y={12} width={4} height={3} fill="#5acefc" />
      <rect x={26} y={18} width={8} height={1.5} fill="#000" opacity={0.6} />
      {/* 몸 */}
      <rect x={17} y={26} width={26} height={26} fill="#b8c0c8" />
      <rect x={17} y={26} width={26} height={2} fill="#d8e0e8" />
      <rect x={17} y={50} width={26} height={2} fill="#000" opacity={0.2} />
      <circle cx={30} cy={38} r={3} fill="#f0c850" />
      <rect x={24} y={44} width={4} height={2} fill="#5acefc" />
      <rect x={32} y={44} width={4} height={2} fill="#5acefc" />
      {/* 팔 */}
      <rect x={12} y={28} width={5} height={20} fill="#888" />
      <rect x={43} y={28} width={5} height={20} fill="#888" />
      {/* 다리 */}
      <rect x={20} y={52} width={8} height={18} fill="#888" />
      <rect x={32} y={52} width={8} height={18} fill="#888" />
      <rect x={18} y={70} width={11} height={5} fill="#2a3038" />
      <rect x={31} y={70} width={11} height={5} fill="#2a3038" />
    </g>
  ),
  astronaut: () => (
    <g>
      <ellipse cx={30} cy={75} rx={14} ry={2.5} fill="#000" opacity={0.15} />
      {/* 헬멧 */}
      <circle cx={30} cy={20} r={13} fill="#f5f5f5" />
      <ellipse cx={30} cy={20} rx={9} ry={8} fill="#3a5878" />
      <ellipse cx={26} cy={17} rx={3} ry={2} fill="#fff" opacity={0.5} />
      {/* 몸 */}
      <rect x={17} y={31} width={26} height={22} fill="#f5f5f5" />
      <rect x={17} y={31} width={26} height={2} fill="#fff" />
      <rect x={17} y={51} width={26} height={2} fill="#000" opacity={0.2} />
      {/* 마크 */}
      <circle cx={30} cy={42} r={3} fill="#c0524a" />
      <rect x={28} y={36} width={4} height={3} fill="#3a78b8" />
      {/* 팔 */}
      <rect x={13} y={32} width={5} height={18} fill="#f5f5f5" />
      <rect x={42} y={32} width={5} height={18} fill="#f5f5f5" />
      <rect x={13} y={48} width={5} height={3} fill="#3a3a40" />
      <rect x={42} y={48} width={5} height={3} fill="#3a3a40" />
      {/* 다리 */}
      <rect x={19} y={53} width={9} height={17} fill="#f5f5f5" />
      <rect x={32} y={53} width={9} height={17} fill="#f5f5f5" />
      <rect x={18} y={70} width={11} height={5} fill="#3a3a40" />
      <rect x={31} y={70} width={11} height={5} fill="#3a3a40" />
    </g>
  ),
  ghost: () => (
    <g>
      <ellipse cx={30} cy={75} rx={14} ry={2.5} fill="#000" opacity={0.12} />
      <path
        d="M 16 70 L 16 28 Q 16 12 30 12 Q 44 12 44 28 L 44 70 L 39 66 L 34 70 L 30 66 L 26 70 L 21 66 Z"
        fill="#f5f1ea"
      />
      <path
        d="M 16 70 L 16 28 Q 16 12 30 12"
        stroke="#fff"
        strokeWidth={2}
        fill="none"
        opacity={0.6}
      />
      <ellipse cx={24} cy={28} rx={2} ry={3} fill="#2a1a14" />
      <ellipse cx={36} cy={28} rx={2} ry={3} fill="#2a1a14" />
      <ellipse cx={30} cy={38} rx={3} ry={2} fill="#2a1a14" />
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

  let inner: JSX.Element;
  if (cfg.kind === "human") {
    inner = (
      <HumanFigure
        body={cfg.body}
        skin={cfg.skin}
        hair={cfg.hair}
        face={cfg.face}
        top={cfg.top}
        bottom={cfg.bottom}
        shoes={cfg.shoes}
      />
    );
  } else if (cfg.kind === "animal") {
    const draw = ANIMAL[cfg.variant] ?? ANIMAL.cat;
    inner = draw();
  } else {
    const draw = FANTASY[cfg.variant] ?? FANTASY.robot;
    inner = draw();
  }

  return (
    <svg
      viewBox="0 0 60 80"
      width={size}
      height={(size * 80) / 60}
      shapeRendering="crispEdges"
      className={className}
      aria-hidden
    >
      {inner}
    </svg>
  );
}

// 단계 B 의 편집 UI 가 사용할 part 옵션 목록.
export const AVATAR_OPTIONS = {
  skin: Object.keys(SKIN),
  hair: Object.keys(HAIR),
  face: ["smile", "neutral", "surprised", "wink"] as FaceVariant[],
  top: Object.keys(TOP),
  bottom: Object.keys(BOTTOM),
  shoes: Object.keys(SHOES),
  animal: Object.keys(ANIMAL),
  fantasy: Object.keys(FANTASY),
};
