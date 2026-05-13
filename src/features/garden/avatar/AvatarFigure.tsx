// 학생 아바타 — 마인크래프트 블록 스타일 3D-feel 렌더러.
// 각 신체 부위(머리/몸통/팔/다리)를 그라데이션 박스로 그려서 입체감을 표현하고,
// 얼굴은 큰 픽셀 단위(4px 격자)로 또렷한 캐릭터성을 만든다.
// viewBox 120×170. 다양한 size 지원 (제어 props: config, size, className).

import { useEffect, useState } from "react";
import type { AvatarConfig, AvatarGalleryItemPosition } from "@/lib/types";
import { DEFAULT_AVATAR, DEFAULT_GALLERY_POSITION_BY_CATEGORY } from "@/lib/types";

// ============================================================
// 갤러리 PNG auto-fit — 이미지를 로드해서 alpha 채널의 실제 bbox 를 구한 뒤
// 그 영역만 잘라낸 data URL + bbox 비율(h/w) 을 반환.
// 잘라낸 이미지가 슬롯 박스에 object-fit:contain 으로 들어가면 슬롯에 꽉 차게
// 그려진다. base 의 bbox 비율은 inner 박스(실제 캐릭터 영역) 크기 계산에 사용 —
// 다른 슬롯들이 base 의 몸 위치에 정확히 정렬되도록.
// CORS 실패 시 원본 URL fallback — broken image 아이콘 노출 방지.
// ============================================================
type FittedImage = { url: string; ratio: number }; // ratio = bboxHeight / bboxWidth
const CROP_CACHE = new Map<string, FittedImage>();

function useFittedImage(url: string | undefined): FittedImage | undefined {
  const [fitted, setFitted] = useState<FittedImage | undefined>(() =>
    url ? CROP_CACHE.get(url) : undefined,
  );
  useEffect(() => {
    if (!url) {
      setFitted(undefined);
      return;
    }
    const cached = CROP_CACHE.get(url);
    if (cached) {
      setFitted(cached);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (w === 0 || h === 0) return;
        const c1 = document.createElement("canvas");
        c1.width = w;
        c1.height = h;
        const ctx = c1.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, w, h).data;
        let minX = w, minY = h, maxX = -1, maxY = -1;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (data[(y * w + x) * 4 + 3] >= 16) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX < 0) return;
        const cw = maxX - minX + 1;
        const ch = maxY - minY + 1;
        const ratio = ch / cw;
        // 이미 tight 한 이미지면 원본 그대로 사용 (data URL 변환 비용 회피)
        if (cw === w && ch === h) {
          const result = { url, ratio };
          CROP_CACHE.set(url, result);
          if (!cancelled) setFitted(result);
          return;
        }
        const c2 = document.createElement("canvas");
        c2.width = cw;
        c2.height = ch;
        const ctx2 = c2.getContext("2d");
        if (!ctx2) return;
        ctx2.drawImage(img, minX, minY, cw, ch, 0, 0, cw, ch);
        const dataUrl = c2.toDataURL("image/png");
        const result = { url: dataUrl, ratio };
        CROP_CACHE.set(url, result);
        if (!cancelled) setFitted(result);
      } catch {
        // CORS / 알 수 없는 에러 → 원본 URL + naturalWidth/Height 기반 비율
        const fallback = {
          url,
          ratio: img.naturalWidth > 0 ? img.naturalHeight / img.naturalWidth : 1.4,
        };
        CROP_CACHE.set(url, fallback);
        if (!cancelled) setFitted(fallback);
      }
    };
    img.onerror = () => {
      const fallback = { url, ratio: 1.4 };
      CROP_CACHE.set(url, fallback);
      if (!cancelled) setFitted(fallback);
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);
  return fitted;
}

// ============================================================
// Palette type — 모든 부위가 4단계 음영을 가짐 (light=하이라이트, base=정면, shade=측면, dark=그림자/외곽선)
// ============================================================
type Palette = { light: string; base: string; shade: string; dark: string };

const SKIN: Record<string, Palette> = {
  light: { light: "#fde0bc", base: "#f4c69a", shade: "#d9a275", dark: "#a8754e" },
  tan:   { light: "#e8b58a", base: "#c89870", shade: "#a07050", dark: "#704830" },
  dark:  { light: "#a06848", base: "#7a4a30", shade: "#4a2c18", dark: "#2c1408" },
};

const HAIR: Record<string, Palette> = {
  short_brown:  { light: "#7e5236", base: "#553420", shade: "#321e10", dark: "#1a0e06" },
  short_black:  { light: "#3a2a22", base: "#1a1010", shade: "#0a0606", dark: "#000000" },
  short_blonde: { light: "#f0c878", base: "#d4a040", shade: "#8a6818", dark: "#5a4010" },
  long_brown:   { light: "#7e5236", base: "#553420", shade: "#321e10", dark: "#1a0e06" },
  long_black:   { light: "#2a2020", base: "#0e0606", shade: "#000000", dark: "#000000" },
  long_pink:    { light: "#e8a8c0", base: "#d088a0", shade: "#a05878", dark: "#684060" },
};

// 의상 세트 — 상의/하의/신발을 하나의 룩으로 묶음.
type CostumeSet = {
  top?: { palette: Palette; trim?: string }; // 상의 (몸통+팔뚝 덮음)
  bottom?: { palette: Palette; length: "short" | "long" }; // 하의 (다리 덮음)
  shoes?: { palette: Palette; sock?: string }; // 신발 (+양말)
  hood?: { palette: Palette }; // 후드(머리 뒤 후두부)
};

const COSTUMES: Record<string, CostumeSet> = {
  none: {},
  casual_olive: {
    top: {
      palette: { light: "#fdf8e8", base: "#ebe2cf", shade: "#b8ad96", dark: "#857a66" },
      trim: "#7e8c4a",
    },
    bottom: {
      palette: { light: "#92a05a", base: "#6e7c46", shade: "#4a522c", dark: "#2c3418" },
      length: "short",
    },
    shoes: {
      palette: { light: "#7a4a2c", base: "#4a2c18", shade: "#2a180c", dark: "#180c04" },
      sock: "#f4ecd8",
    },
  },
  casual_blue: {
    top: {
      palette: { light: "#7aa8d4", base: "#4878a8", shade: "#2a4870", dark: "#162840" },
      trim: "#fff",
    },
    bottom: {
      palette: { light: "#5a78a8", base: "#2c4868", shade: "#182840", dark: "#0c1828" },
      length: "long",
    },
    shoes: {
      palette: { light: "#f0e8d8", base: "#d8c8a8", shade: "#9a8868", dark: "#5a4830" },
    },
  },
  uniform_school: {
    top: {
      palette: { light: "#fffaf0", base: "#f0e8d0", shade: "#b8ad96", dark: "#857a66" },
      trim: "#2a3850",
    },
    bottom: {
      palette: { light: "#2a3850", base: "#162028", shade: "#0a0e14", dark: "#000000" },
      length: "long",
    },
    shoes: {
      palette: { light: "#3a2a20", base: "#1a1010", shade: "#0a0606", dark: "#000000" },
    },
  },
  dress_pink: {
    top: {
      palette: { light: "#f4b8d0", base: "#d088a0", shade: "#a05878", dark: "#684060" },
      trim: "#fff",
    },
    shoes: {
      palette: { light: "#fdfafa", base: "#f0e8d8", shade: "#a09078", dark: "#6a604c" },
    },
  },
  sports_red: {
    top: {
      palette: { light: "#d85848", base: "#a83828", shade: "#702018", dark: "#42100a" },
      trim: "#fff",
    },
    bottom: {
      palette: { light: "#3a2a22", base: "#1a1010", shade: "#0a0606", dark: "#000000" },
      length: "short",
    },
    shoes: {
      palette: { light: "#d85848", base: "#a83828", shade: "#702018", dark: "#42100a" },
      sock: "#fff",
    },
  },
  winter_brown: {
    top: {
      palette: { light: "#a87038", base: "#7a4a20", shade: "#4a2c10", dark: "#281806" },
      trim: "#f0e0c0",
    },
    bottom: {
      palette: { light: "#5a78a8", base: "#2c4868", shade: "#182840", dark: "#0c1828" },
      length: "long",
    },
    shoes: {
      palette: { light: "#5a3820", base: "#321e10", shade: "#1a0e06", dark: "#0a0402" },
    },
  },
  hoodie_yellow: {
    top: {
      palette: { light: "#f8d878", base: "#e8b840", shade: "#a07818", dark: "#5a4010" },
      trim: "#5a4010",
    },
    bottom: {
      palette: { light: "#9a9a9a", base: "#6a6a6a", shade: "#3a3a3a", dark: "#1a1a1a" },
      length: "long",
    },
    shoes: {
      palette: { light: "#7a4a2c", base: "#4a2c18", shade: "#2a180c", dark: "#180c04" },
    },
  },
};

// ============================================================
// Geometry — 120×170 viewBox, blocky proportions
// ============================================================
const HEAD = { x: 38, y: 8, w: 44, h: 44 };
const TORSO = { x: 40, y: 54, w: 40, h: 38 };
const ARM_L = { x: 22, y: 54, w: 16, h: 58 };
const ARM_R = { x: 82, y: 54, w: 16, h: 58 };
const LEG_L = { x: 42, y: 94, w: 16, h: 64 };
const LEG_R = { x: 62, y: 94, w: 16, h: 64 };

// ============================================================
// BlockyBox — 3D 느낌의 박스 (top→bottom 그라데이션 + 우측면 음영 스트립)
// ============================================================
function BlockyBox({
  x, y, w, h,
  palette,
  id,
  cornerRadius = 1.5,
}: {
  x: number; y: number; w: number; h: number;
  palette: Palette;
  id: string;
  cornerRadius?: number;
}) {
  const gid = `g-${id}`;
  return (
    <g>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.light} />
          <stop offset="35%" stopColor={palette.base} />
          <stop offset="100%" stopColor={palette.shade} />
        </linearGradient>
      </defs>
      {/* 그림자 (바닥) */}
      <rect x={x + 1} y={y + h - 1.5} width={w - 1} height={2} rx={cornerRadius} fill={palette.dark} opacity={0.4} />
      {/* 본체 */}
      <rect x={x} y={y} width={w} height={h} rx={cornerRadius} fill={`url(#${gid})`} />
      {/* 우측 면 그림자 */}
      <rect x={x + w - 2.5} y={y + 1} width={2.5} height={h - 2} rx={cornerRadius} fill={palette.shade} opacity={0.55} />
      {/* 상단 하이라이트 */}
      <rect x={x + 1} y={y + 1} width={w - 3} height={1.2} rx={0.6} fill={palette.light} opacity={0.7} />
    </g>
  );
}

// ============================================================
// Pixel block — 픽셀 1단위(4px) 블록. 얼굴/머리/장식 디테일에 사용.
// ============================================================
function Px({ x, y, w = 4, h = 4, fill, opacity }: { x: number; y: number; w?: number; h?: number; fill: string; opacity?: number }) {
  return <rect x={x} y={y} width={w} height={h} fill={fill} opacity={opacity} />;
}

// ============================================================
// Eyes — 머리 정면에 픽셀 단위 그리기. (cx, cy) 양 눈 중점, gap = 두 눈 사이 거리.
// ============================================================
type EyesVariant = "happy" | "dot" | "wink" | "round" | "sleepy" | "star" | "sharp";

function Eyes({ variant, cx, cy, gap = 12, dark = "#2a1810" }: { variant: string; cx: number; cy: number; gap?: number; dark?: string }) {
  const v = (["happy", "dot", "wink", "round", "sleepy", "star", "sharp"] as const).includes(variant as EyesVariant)
    ? (variant as EyesVariant)
    : "happy";
  const lx = cx - gap / 2 - 3;
  const rx = cx + gap / 2 - 3;

  if (v === "wink") {
    return (
      <g>
        <Px x={lx} y={cy + 1} w={6} h={1.5} fill={dark} />
        <Px x={rx} y={cy - 3} w={6} h={7} fill={dark} />
        <Px x={rx + 4} y={cy - 1.5} w={1.5} h={1.5} fill="#fff" />
      </g>
    );
  }
  if (v === "sleepy") {
    return (
      <g>
        <Px x={lx} y={cy} w={6} h={2} fill={dark} />
        <Px x={rx} y={cy} w={6} h={2} fill={dark} />
      </g>
    );
  }
  if (v === "star") {
    return (
      <g>
        {[lx + 3, rx + 3].map((x) => (
          <g key={x}>
            <Px x={x - 1} y={cy - 3} w={2} h={2} fill="#ffd848" />
            <Px x={x - 3} y={cy - 1} w={6} h={2} fill="#ffd848" />
            <Px x={x - 1} y={cy + 1} w={2} h={2} fill="#ffd848" />
            <Px x={x - 0.5} y={cy - 0.5} w={1} h={1} fill="#fff" />
          </g>
        ))}
      </g>
    );
  }
  if (v === "sharp") {
    return (
      <g>
        <Px x={lx} y={cy - 1.5} w={6} h={3} fill={dark} />
        <Px x={rx} y={cy - 1.5} w={6} h={3} fill={dark} />
      </g>
    );
  }
  if (v === "round") {
    return (
      <g>
        {[lx + 3, rx + 3].map((x) => (
          <g key={x}>
            <Px x={x - 3} y={cy - 4} w={6} h={8} fill="#fff" />
            <Px x={x - 2.5} y={cy - 3} w={5} h={6} fill={dark} />
            <Px x={x + 0.5} y={cy - 2.5} w={1.5} h={1.5} fill="#fff" />
          </g>
        ))}
      </g>
    );
  }
  if (v === "dot") {
    return (
      <g>
        <Px x={lx + 2} y={cy} w={2} h={2} fill={dark} />
        <Px x={rx + 2} y={cy} w={2} h={2} fill={dark} />
      </g>
    );
  }
  // happy (default) — 큰 직사각 눈 + 흰 하이라이트 (참고 이미지 매칭)
  return (
    <g>
      <Px x={lx} y={cy - 4} w={6} h={8} fill={dark} />
      <Px x={lx + 0.5} y={cy - 3.5} w={2} h={3} fill="#fff" />
      <Px x={rx} y={cy - 4} w={6} h={8} fill={dark} />
      <Px x={rx + 0.5} y={cy - 3.5} w={2} h={3} fill="#fff" />
    </g>
  );
}

// ============================================================
// Mouth — 단순 픽셀 입.
// ============================================================
type MouthVariant = "smile" | "neutral" | "oh" | "smirk" | "tongue";

function Mouth({ variant, cx, cy, dark = "#2a1810" }: { variant: string; cx: number; cy: number; dark?: string }) {
  const v = (["smile", "neutral", "oh", "smirk", "tongue"] as const).includes(variant as MouthVariant)
    ? (variant as MouthVariant)
    : "smile";
  if (v === "neutral") return <Px x={cx - 3} y={cy} w={6} h={1.5} fill={dark} />;
  if (v === "oh") return <Px x={cx - 2} y={cy - 2} w={4} h={4} fill={dark} />;
  if (v === "smirk") return (
    <g>
      <Px x={cx} y={cy - 1} w={4} h={1.5} fill={dark} />
      <Px x={cx + 3} y={cy} w={1.5} h={2} fill={dark} />
    </g>
  );
  if (v === "tongue") return (
    <g>
      <Px x={cx - 3} y={cy - 1} w={6} h={2} fill={dark} />
      <Px x={cx - 1} y={cy + 1} w={3} h={2} fill="#e88098" />
    </g>
  );
  // smile — 아래로 볼록한 곡선 (3-px 표현)
  return (
    <g>
      <Px x={cx - 3} y={cy} w={6} h={1.5} fill={dark} />
      <Px x={cx - 4} y={cy - 1} w={1.5} h={1.5} fill={dark} />
      <Px x={cx + 2.5} y={cy - 1} w={1.5} h={1.5} fill={dark} />
    </g>
  );
}

// ============================================================
// 사람 헤어 — 픽셀 블록 다발로 머리 위에 얹기
// ============================================================
function Hair({ variant, palette }: { variant: string; palette: Palette }) {
  const isLong = variant.startsWith("long_");
  // 머리 박스 (HEAD): x=38..82, y=8..52, 정면 4×4 픽셀 격자
  // 픽셀 블록 그룹으로 헤어 실루엣
  const blocks: Array<[number, number, number, number]> = [];
  // 윗부분 블록 라인 (불규칙해서 자연스럽게)
  // row 1 (y=6)
  blocks.push([36, 6, 6, 6]);
  blocks.push([42, 4, 8, 8]);
  blocks.push([50, 6, 8, 6]);
  blocks.push([58, 4, 8, 8]);
  blocks.push([66, 6, 8, 6]);
  blocks.push([74, 6, 8, 6]);
  blocks.push([80, 8, 4, 6]);
  // row 2 (y=10..16) — 이마/측면 덮기
  blocks.push([34, 12, 6, 8]);
  blocks.push([78, 12, 8, 8]);
  blocks.push([40, 12, 6, 6]); // 이마 옆
  blocks.push([72, 12, 6, 6]);
  // 앞머리 (이마 살짝)
  blocks.push([46, 14, 6, 6]);
  blocks.push([66, 14, 6, 6]);
  if (isLong) {
    // 긴 머리 — 양 사이드 길게 (어깨까지)
    blocks.push([32, 18, 6, 36]);
    blocks.push([80, 18, 8, 36]);
    blocks.push([34, 50, 6, 6]);
    blocks.push([80, 50, 6, 6]);
  } else {
    // 짧은 머리 — 옆머리 살짝만
    blocks.push([34, 20, 4, 12]);
    blocks.push([82, 20, 4, 12]);
  }
  return (
    <g>
      {/* 어두운 외곽선 */}
      {blocks.map(([x, y, w, h], i) => (
        <rect key={`d-${i}`} x={x - 0.5} y={y - 0.5} width={w + 1} height={h + 1} fill={palette.dark} opacity={0.5} rx={0.8} />
      ))}
      {blocks.map(([x, y, w, h], i) => (
        <rect key={`b-${i}`} x={x} y={y} width={w} height={h} fill={palette.base} rx={0.8} />
      ))}
      {/* 하이라이트 */}
      {blocks.map(([x, y, w], i) => (
        <rect key={`l-${i}`} x={x + 0.5} y={y + 0.5} width={w - 1} height={1.2} fill={palette.light} opacity={0.65} rx={0.4} />
      ))}
    </g>
  );
}

// ============================================================
// 사람 머리 (얼굴 박스 + 헤어 + 눈/입)
// ============================================================
function HumanHead({
  skin, hair, eyes, mouth,
}: {
  skin: Palette; hair: Palette; eyes: string; mouth: string;
}) {
  const cx = HEAD.x + HEAD.w / 2; // 60
  return (
    <g>
      {/* 얼굴 박스 */}
      <BlockyBox x={HEAD.x} y={HEAD.y} w={HEAD.w} h={HEAD.h} palette={skin} id="head" cornerRadius={2.5} />
      {/* 헤어 */}
      <Hair variant="" palette={hair} />
      {/* 눈 */}
      <Eyes variant={eyes} cx={cx} cy={HEAD.y + 24} gap={14} />
      {/* 입 */}
      <Mouth variant={mouth} cx={cx} cy={HEAD.y + 34} />
    </g>
  );
}

// ============================================================
// 의상 — 상의/하의/신발을 신체 위에 레이어
// ============================================================
function CostumeLayer({ costume, skin }: { costume: CostumeSet; skin: Palette }) {
  return (
    <g>
      {/* 상의 — 몸통 + 팔뚝(어깨~팔꿈치) 덮기 */}
      {costume.top && (
        <>
          <BlockyBox x={TORSO.x} y={TORSO.y} w={TORSO.w} h={TORSO.h} palette={costume.top.palette} id="top-torso" cornerRadius={1.5} />
          {/* 팔 — 상부 70% 덮기 */}
          <BlockyBox x={ARM_L.x} y={ARM_L.y} w={ARM_L.w} h={ARM_L.h * 0.7} palette={costume.top.palette} id="top-arml" cornerRadius={1.5} />
          <BlockyBox x={ARM_R.x} y={ARM_R.y} w={ARM_R.w} h={ARM_R.h * 0.7} palette={costume.top.palette} id="top-armr" cornerRadius={1.5} />
          {/* 트림 (밑단 + 후드 끈) */}
          {costume.top.trim && (
            <>
              <Px x={TORSO.x} y={TORSO.y + TORSO.h - 2} w={TORSO.w} h={2.5} fill={costume.top.trim} />
              <Px x={ARM_L.x} y={ARM_L.y + ARM_L.h * 0.7 - 1.5} w={ARM_L.w} h={2} fill={costume.top.trim} />
              <Px x={ARM_R.x} y={ARM_R.y + ARM_R.h * 0.7 - 1.5} w={ARM_R.w} h={2} fill={costume.top.trim} />
              {/* 후드 끈 (가운데 V 라인) */}
              <Px x={TORSO.x + TORSO.w / 2 - 1.5} y={TORSO.y + 2} w={3} h={2} fill={skin.shade} opacity={0.7} />
              <Px x={TORSO.x + TORSO.w / 2 - 4} y={TORSO.y + 4} w={1.5} h={10} fill={costume.top.trim} />
              <Px x={TORSO.x + TORSO.w / 2 + 2.5} y={TORSO.y + 4} w={1.5} h={10} fill={costume.top.trim} />
              <Px x={TORSO.x + TORSO.w / 2 - 4.5} y={TORSO.y + 13} w={2.5} h={2} fill={costume.top.trim} />
              <Px x={TORSO.x + TORSO.w / 2 + 2} y={TORSO.y + 13} w={2.5} h={2} fill={costume.top.trim} />
            </>
          )}
        </>
      )}
      {/* 하의 */}
      {costume.bottom && (
        <>
          {(() => {
            const isShort = costume.bottom.length === "short";
            const bh = isShort ? LEG_L.h * 0.45 : LEG_L.h * 0.78;
            return (
              <>
                <BlockyBox x={LEG_L.x} y={LEG_L.y} w={LEG_L.w} h={bh} palette={costume.bottom.palette} id="bot-l" cornerRadius={1.5} />
                <BlockyBox x={LEG_R.x} y={LEG_R.y} w={LEG_R.w} h={bh} palette={costume.bottom.palette} id="bot-r" cornerRadius={1.5} />
              </>
            );
          })()}
        </>
      )}
      {/* 양말 + 신발 */}
      {costume.shoes && (
        <>
          {costume.shoes.sock && (
            <>
              <Px x={LEG_L.x} y={LEG_L.y + LEG_L.h - 14} w={LEG_L.w} h={6} fill={costume.shoes.sock} />
              <Px x={LEG_R.x} y={LEG_R.y + LEG_R.h - 14} w={LEG_R.w} h={6} fill={costume.shoes.sock} />
            </>
          )}
          <BlockyBox x={LEG_L.x - 1} y={LEG_L.y + LEG_L.h - 8} w={LEG_L.w + 2} h={8} palette={costume.shoes.palette} id="shoe-l" cornerRadius={1.5} />
          <BlockyBox x={LEG_R.x - 1} y={LEG_R.y + LEG_R.h - 8} w={LEG_R.w + 2} h={8} palette={costume.shoes.palette} id="shoe-r" cornerRadius={1.5} />
          {/* 신발 끈/장식 — 흰 줄 */}
          <Px x={LEG_L.x + 2} y={LEG_L.y + LEG_L.h - 4} w={4} h={1.5} fill="#fff" opacity={0.85} />
          <Px x={LEG_R.x + 2} y={LEG_R.y + LEG_R.h - 4} w={4} h={1.5} fill="#fff" opacity={0.85} />
        </>
      )}
    </g>
  );
}

// ============================================================
// 사람 전신
// ============================================================
function HumanFigure({
  body, skin, hair, eyes, mouth, costume,
}: {
  body: "boy" | "girl"; skin: Palette; hair: Palette;
  eyes: string; mouth: string; costume: CostumeSet;
}) {
  void body; // 향후 머리/체형 분기에 사용
  return (
    <g>
      {/* 다리 (피부) — 양말/신발/바지 아래에 깔림 */}
      <BlockyBox x={LEG_L.x} y={LEG_L.y} w={LEG_L.w} h={LEG_L.h} palette={skin} id="leg-l" cornerRadius={1.5} />
      <BlockyBox x={LEG_R.x} y={LEG_R.y} w={LEG_R.w} h={LEG_R.h} palette={skin} id="leg-r" cornerRadius={1.5} />
      {/* 팔 (피부) */}
      <BlockyBox x={ARM_L.x} y={ARM_L.y} w={ARM_L.w} h={ARM_L.h} palette={skin} id="arm-l" cornerRadius={1.5} />
      <BlockyBox x={ARM_R.x} y={ARM_R.y} w={ARM_R.w} h={ARM_R.h} palette={skin} id="arm-r" cornerRadius={1.5} />
      {/* 몸통 (피부) */}
      <BlockyBox x={TORSO.x} y={TORSO.y} w={TORSO.w} h={TORSO.h} palette={skin} id="torso" cornerRadius={1.5} />
      {/* 의상 레이어 */}
      <CostumeLayer costume={costume} skin={skin} />
      {/* 머리 (제일 위) */}
      <HumanHead skin={skin} hair={hair} eyes={eyes} mouth={mouth} />
    </g>
  );
}

// ============================================================
// 동물 헤드 — 각 종류별로 머리 박스 + 귀 + 얼굴 디테일
// 몸은 공통 (skin 톤). 머리만 다름.
// ============================================================
type AnimalDef = {
  // 머리 베이스 색
  headPalette: Palette;
  // 귀 그리는 함수 (HEAD 위쪽에 그림)
  ears: () => JSX.Element;
  // 얼굴 디테일 (눈/코/볼/입은 자유로이) — 기본 face는 외부에서 그림. 여기선 추가 디테일만.
  faceDetail: () => JSX.Element;
  // 얼굴 색이 머리 일부에만 한정될 때 (예: 강아지 이마 흰 무늬) — 옵션
  faceMask?: () => JSX.Element;
};

const ANIMAL: Record<string, AnimalDef> = {
  rabbit: {
    headPalette: { light: "#fdf7e8", base: "#f0e4c4", shade: "#c8b890", dark: "#8a7a58" },
    ears: () => (
      <g>
        {/* 양 귀 박스 — 머리 위로 솟음 */}
        <BlockyBox x={HEAD.x + 8} y={HEAD.y - 18} w={8} h={20} palette={{ light: "#fdf7e8", base: "#f0e4c4", shade: "#c8b890", dark: "#8a7a58" }} id="ear-rl" cornerRadius={2} />
        <BlockyBox x={HEAD.x + 28} y={HEAD.y - 18} w={8} h={20} palette={{ light: "#fdf7e8", base: "#f0e4c4", shade: "#c8b890", dark: "#8a7a58" }} id="ear-rr" cornerRadius={2} />
        {/* 핑크 안쪽 */}
        <Px x={HEAD.x + 10} y={HEAD.y - 14} w={4} h={12} fill="#f4b8c0" />
        <Px x={HEAD.x + 30} y={HEAD.y - 14} w={4} h={12} fill="#f4b8c0" />
      </g>
    ),
    faceDetail: () => (
      <g>
        {/* 볼터치 (분홍) */}
        <Px x={HEAD.x + 4} y={HEAD.y + 28} w={6} h={3} fill="#f4b8c0" opacity={0.8} />
        <Px x={HEAD.x + 34} y={HEAD.y + 28} w={6} h={3} fill="#f4b8c0" opacity={0.8} />
        {/* 코 */}
        <Px x={HEAD.x + 20} y={HEAD.y + 30} w={4} h={2.5} fill="#e88098" />
      </g>
    ),
  },
  cat: {
    headPalette: { light: "#fdf2d8", base: "#f0deb0", shade: "#c8b078", dark: "#8a7848" },
    ears: () => (
      <g>
        {/* 삼각 귀 — 직사각 박스 위쪽 잘라 표현 (사다리꼴) */}
        <polygon points={`${HEAD.x + 2},${HEAD.y + 4} ${HEAD.x + 10},${HEAD.y - 8} ${HEAD.x + 16},${HEAD.y + 4}`} fill="#e89048" />
        <polygon points={`${HEAD.x + 28},${HEAD.y + 4} ${HEAD.x + 34},${HEAD.y - 8} ${HEAD.x + 42},${HEAD.y + 4}`} fill="#e89048" />
        {/* 안쪽 핑크 */}
        <polygon points={`${HEAD.x + 7},${HEAD.y + 2} ${HEAD.x + 10},${HEAD.y - 4} ${HEAD.x + 13},${HEAD.y + 2}`} fill="#f4b8c0" />
        <polygon points={`${HEAD.x + 31},${HEAD.y + 2} ${HEAD.x + 34},${HEAD.y - 4} ${HEAD.x + 37},${HEAD.y + 2}`} fill="#f4b8c0" />
        {/* 머리 위 줄무늬 */}
        <Px x={HEAD.x + 6} y={HEAD.y + 4} w={4} h={3} fill="#e89048" />
        <Px x={HEAD.x + 14} y={HEAD.y + 4} w={4} h={3} fill="#e89048" />
        <Px x={HEAD.x + 26} y={HEAD.y + 4} w={4} h={3} fill="#e89048" />
        <Px x={HEAD.x + 34} y={HEAD.y + 4} w={4} h={3} fill="#e89048" />
      </g>
    ),
    faceDetail: () => (
      <g>
        {/* 핑크 코 */}
        <Px x={HEAD.x + 20} y={HEAD.y + 28} w={4} h={3} fill="#f08098" />
        {/* 수염 (좌우) */}
        <Px x={HEAD.x + 2} y={HEAD.y + 30} w={6} h={1} fill="#8a5a30" />
        <Px x={HEAD.x + 2} y={HEAD.y + 34} w={6} h={1} fill="#8a5a30" />
        <Px x={HEAD.x + 36} y={HEAD.y + 30} w={6} h={1} fill="#8a5a30" />
        <Px x={HEAD.x + 36} y={HEAD.y + 34} w={6} h={1} fill="#8a5a30" />
      </g>
    ),
  },
  bear: {
    headPalette: { light: "#c8945a", base: "#a07038", shade: "#6a4a20", dark: "#3a2810" },
    ears: () => (
      <g>
        {/* 둥근 귀 (위쪽 양옆) */}
        <BlockyBox x={HEAD.x + 2} y={HEAD.y - 6} w={10} h={12} palette={{ light: "#c8945a", base: "#a07038", shade: "#6a4a20", dark: "#3a2810" }} id="ear-bl" cornerRadius={4} />
        <BlockyBox x={HEAD.x + 32} y={HEAD.y - 6} w={10} h={12} palette={{ light: "#c8945a", base: "#a07038", shade: "#6a4a20", dark: "#3a2810" }} id="ear-br" cornerRadius={4} />
      </g>
    ),
    faceDetail: () => (
      <g>
        {/* 주둥이 (밝은 영역) */}
        <BlockyBox x={HEAD.x + 12} y={HEAD.y + 24} w={20} h={16} palette={{ light: "#f8d8a8", base: "#e8c088", shade: "#b89860", dark: "#7a6238" }} id="bear-muzzle" cornerRadius={3} />
        {/* 코 */}
        <Px x={HEAD.x + 19} y={HEAD.y + 26} w={6} h={4} fill="#1a0e06" />
      </g>
    ),
  },
  dog: {
    headPalette: { light: "#d8a868", base: "#b88848", shade: "#7a5828", dark: "#42301a" },
    ears: () => (
      <g>
        {/* 늘어진 귀 (양옆 아래로) */}
        <BlockyBox x={HEAD.x - 4} y={HEAD.y + 4} w={12} h={20} palette={{ light: "#a07038", base: "#7a4a20", shade: "#4a2c10", dark: "#281806" }} id="ear-dl" cornerRadius={4} />
        <BlockyBox x={HEAD.x + 36} y={HEAD.y + 4} w={12} h={20} palette={{ light: "#a07038", base: "#7a4a20", shade: "#4a2c10", dark: "#281806" }} id="ear-dr" cornerRadius={4} />
      </g>
    ),
    faceDetail: () => (
      <g>
        {/* 이마/얼굴 흰 무늬 (가운데 세로 줄) */}
        <Px x={HEAD.x + 16} y={HEAD.y + 4} w={12} h={36} fill="#fdf7e8" />
        <Px x={HEAD.x + 18} y={HEAD.y + 4} w={8} h={38} fill="#f5ebd0" opacity={0.6} />
        {/* 코 */}
        <Px x={HEAD.x + 19} y={HEAD.y + 24} w={6} h={4} fill="#2a1810" />
        {/* 볼터치 */}
        <Px x={HEAD.x + 4} y={HEAD.y + 28} w={5} h={3} fill="#f4b8c0" opacity={0.8} />
        <Px x={HEAD.x + 35} y={HEAD.y + 28} w={5} h={3} fill="#f4b8c0" opacity={0.8} />
      </g>
    ),
    faceMask: () => null as unknown as JSX.Element,
  },
  pig: {
    headPalette: { light: "#fad8d8", base: "#f4b8b8", shade: "#c88a8a", dark: "#8a5858" },
    ears: () => (
      <g>
        {/* 작은 사각 귀 (위쪽 코너) */}
        <BlockyBox x={HEAD.x + 2} y={HEAD.y - 4} w={8} h={10} palette={{ light: "#fad8d8", base: "#f4b8b8", shade: "#c88a8a", dark: "#8a5858" }} id="ear-pl" cornerRadius={1.5} />
        <BlockyBox x={HEAD.x + 34} y={HEAD.y - 4} w={8} h={10} palette={{ light: "#fad8d8", base: "#f4b8b8", shade: "#c88a8a", dark: "#8a5858" }} id="ear-pr" cornerRadius={1.5} />
        <Px x={HEAD.x + 4} y={HEAD.y - 1} w={4} h={4} fill="#e08a8a" />
        <Px x={HEAD.x + 36} y={HEAD.y - 1} w={4} h={4} fill="#e08a8a" />
      </g>
    ),
    faceDetail: () => (
      <g>
        {/* 큰 코 (분홍 사각) */}
        <BlockyBox x={HEAD.x + 14} y={HEAD.y + 24} w={16} h={10} palette={{ light: "#fae0e0", base: "#f5c8c8", shade: "#c89898", dark: "#8a6868" }} id="pig-snout" cornerRadius={3} />
        {/* 콧구멍 */}
        <Px x={HEAD.x + 17} y={HEAD.y + 27} w={3} h={4} fill="#8a5050" />
        <Px x={HEAD.x + 24} y={HEAD.y + 27} w={3} h={4} fill="#8a5050" />
        {/* 볼터치 */}
        <Px x={HEAD.x + 2} y={HEAD.y + 28} w={5} h={3} fill="#e88898" opacity={0.7} />
        <Px x={HEAD.x + 37} y={HEAD.y + 28} w={5} h={3} fill="#e88898" opacity={0.7} />
      </g>
    ),
  },
  fox: {
    headPalette: { light: "#f0a058", base: "#d8783a", shade: "#9a5020", dark: "#5a2c10" },
    ears: () => (
      <g>
        <polygon points={`${HEAD.x + 2},${HEAD.y + 4} ${HEAD.x + 8},${HEAD.y - 12} ${HEAD.x + 14},${HEAD.y + 4}`} fill="#9a5020" />
        <polygon points={`${HEAD.x + 30},${HEAD.y + 4} ${HEAD.x + 36},${HEAD.y - 12} ${HEAD.x + 42},${HEAD.y + 4}`} fill="#9a5020" />
        <polygon points={`${HEAD.x + 6},${HEAD.y + 2} ${HEAD.x + 8},${HEAD.y - 6} ${HEAD.x + 10},${HEAD.y + 2}`} fill="#fad8d8" />
        <polygon points={`${HEAD.x + 34},${HEAD.y + 2} ${HEAD.x + 36},${HEAD.y - 6} ${HEAD.x + 38},${HEAD.y + 2}`} fill="#fad8d8" />
      </g>
    ),
    faceDetail: () => (
      <g>
        {/* 흰 턱 */}
        <Px x={HEAD.x + 12} y={HEAD.y + 28} w={20} h={14} fill="#fdf7e8" />
        <Px x={HEAD.x + 19} y={HEAD.y + 26} w={6} h={4} fill="#2a1810" />
      </g>
    ),
  },
  panda: {
    headPalette: { light: "#ffffff", base: "#f0eee8", shade: "#b8b6b0", dark: "#7a7872" },
    ears: () => (
      <g>
        <BlockyBox x={HEAD.x + 2} y={HEAD.y - 6} w={10} h={12} palette={{ light: "#3a3030", base: "#1a1010", shade: "#0a0606", dark: "#000000" }} id="ear-panda-l" cornerRadius={4} />
        <BlockyBox x={HEAD.x + 32} y={HEAD.y - 6} w={10} h={12} palette={{ light: "#3a3030", base: "#1a1010", shade: "#0a0606", dark: "#000000" }} id="ear-panda-r" cornerRadius={4} />
      </g>
    ),
    faceDetail: () => (
      <g>
        {/* 검은 눈가 패치 */}
        <Px x={HEAD.x + 6} y={HEAD.y + 16} w={10} h={12} fill="#1a1010" />
        <Px x={HEAD.x + 28} y={HEAD.y + 16} w={10} h={12} fill="#1a1010" />
        {/* 코 */}
        <Px x={HEAD.x + 20} y={HEAD.y + 28} w={4} h={3} fill="#1a1010" />
      </g>
    ),
  },
};

function AnimalHead({ animal, eyes, mouth, skin }: { animal: AnimalDef; eyes: string; mouth: string; skin: Palette }) {
  void skin;
  const cx = HEAD.x + HEAD.w / 2;
  return (
    <g>
      {/* 귀 먼저 (머리 뒤) */}
      {animal.ears()}
      {/* 머리 박스 */}
      <BlockyBox x={HEAD.x} y={HEAD.y} w={HEAD.w} h={HEAD.h} palette={animal.headPalette} id="animal-head" cornerRadius={2.5} />
      {/* 얼굴 디테일 (귀 안쪽/주둥이/볼터치 등) */}
      {animal.faceDetail()}
      {/* 눈 */}
      <Eyes variant={eyes} cx={cx} cy={HEAD.y + 22} gap={14} />
      {/* 입 */}
      <Mouth variant={mouth} cx={cx} cy={HEAD.y + 36} />
    </g>
  );
}

function AnimalFigure({ variant, costume, eyes, mouth }: { variant: string; costume: CostumeSet; eyes: string; mouth: string }) {
  const animal = ANIMAL[variant] ?? ANIMAL.rabbit;
  const bodySkin = SKIN.light; // 동물 몸은 공통 살구톤
  return (
    <g>
      <BlockyBox x={LEG_L.x} y={LEG_L.y} w={LEG_L.w} h={LEG_L.h} palette={bodySkin} id="aleg-l" cornerRadius={1.5} />
      <BlockyBox x={LEG_R.x} y={LEG_R.y} w={LEG_R.w} h={LEG_R.h} palette={bodySkin} id="aleg-r" cornerRadius={1.5} />
      <BlockyBox x={ARM_L.x} y={ARM_L.y} w={ARM_L.w} h={ARM_L.h} palette={bodySkin} id="aarm-l" cornerRadius={1.5} />
      <BlockyBox x={ARM_R.x} y={ARM_R.y} w={ARM_R.w} h={ARM_R.h} palette={bodySkin} id="aarm-r" cornerRadius={1.5} />
      <BlockyBox x={TORSO.x} y={TORSO.y} w={TORSO.w} h={TORSO.h} palette={bodySkin} id="atorso" cornerRadius={1.5} />
      <CostumeLayer costume={costume} skin={bodySkin} />
      <AnimalHead animal={animal} eyes={eyes} mouth={mouth} skin={bodySkin} />
    </g>
  );
}

// ============================================================
// 판타지 — 로봇/우주인/유령. 머리 박스를 다르게 처리.
// ============================================================
function FantasyFigure({ variant, costume, eyes, mouth }: { variant: string; costume: CostumeSet; eyes: string; mouth: string }) {
  const cx = HEAD.x + HEAD.w / 2;
  const bodySkin = SKIN.light;

  if (variant === "robot") {
    const metal: Palette = { light: "#d8e0e8", base: "#a8b0b8", shade: "#686e78", dark: "#383e48" };
    const metalDark: Palette = { light: "#888a90", base: "#5a5c62", shade: "#2a2c32", dark: "#000000" };
    return (
      <g>
        <BlockyBox x={LEG_L.x} y={LEG_L.y} w={LEG_L.w} h={LEG_L.h} palette={metalDark} id="rleg-l" cornerRadius={1.5} />
        <BlockyBox x={LEG_R.x} y={LEG_R.y} w={LEG_R.w} h={LEG_R.h} palette={metalDark} id="rleg-r" cornerRadius={1.5} />
        <BlockyBox x={ARM_L.x} y={ARM_L.y} w={ARM_L.w} h={ARM_L.h} palette={metalDark} id="rarm-l" cornerRadius={1.5} />
        <BlockyBox x={ARM_R.x} y={ARM_R.y} w={ARM_R.w} h={ARM_R.h} palette={metalDark} id="rarm-r" cornerRadius={1.5} />
        <BlockyBox x={TORSO.x} y={TORSO.y} w={TORSO.w} h={TORSO.h} palette={metal} id="rtorso" cornerRadius={1.5} />
        {/* 가슴 LED */}
        <Px x={TORSO.x + 16} y={TORSO.y + 12} w={8} h={4} fill="#48d8a0" />
        <Px x={TORSO.x + 12} y={TORSO.y + 20} w={16} h={2} fill="#48a0d8" opacity={0.7} />
        <CostumeLayer costume={costume} skin={bodySkin} />
        {/* 머리 */}
        <BlockyBox x={HEAD.x} y={HEAD.y} w={HEAD.w} h={HEAD.h} palette={metal} id="rhead" cornerRadius={3} />
        {/* 안테나 */}
        <Px x={cx - 1} y={HEAD.y - 8} w={2} h={8} fill={metal.shade} />
        <Px x={cx - 2} y={HEAD.y - 10} w={4} h={4} fill="#e84830" />
        <Eyes variant={eyes} cx={cx} cy={HEAD.y + 22} gap={14} dark="#1828a0" />
        <Mouth variant={mouth} cx={cx} cy={HEAD.y + 34} dark="#1828a0" />
      </g>
    );
  }
  if (variant === "astronaut") {
    const suit: Palette = { light: "#ffffff", base: "#ece8e0", shade: "#a8a49a", dark: "#5a5650" };
    const visor: Palette = { light: "#88e0ff", base: "#48a8d8", shade: "#1c5a88", dark: "#0a2840" };
    return (
      <g>
        <BlockyBox x={LEG_L.x} y={LEG_L.y} w={LEG_L.w} h={LEG_L.h} palette={suit} id="astleg-l" cornerRadius={1.5} />
        <BlockyBox x={LEG_R.x} y={LEG_R.y} w={LEG_R.w} h={LEG_R.h} palette={suit} id="astleg-r" cornerRadius={1.5} />
        <BlockyBox x={ARM_L.x} y={ARM_L.y} w={ARM_L.w} h={ARM_L.h} palette={suit} id="astarm-l" cornerRadius={1.5} />
        <BlockyBox x={ARM_R.x} y={ARM_R.y} w={ARM_R.w} h={ARM_R.h} palette={suit} id="astarm-r" cornerRadius={1.5} />
        <BlockyBox x={TORSO.x} y={TORSO.y} w={TORSO.w} h={TORSO.h} palette={suit} id="asttorso" cornerRadius={1.5} />
        {/* 가슴 컨트롤 패널 */}
        <Px x={TORSO.x + 12} y={TORSO.y + 14} w={16} h={10} fill="#3a4858" />
        <Px x={TORSO.x + 14} y={TORSO.y + 16} w={3} h={2} fill="#e85048" />
        <Px x={TORSO.x + 19} y={TORSO.y + 16} w={3} h={2} fill="#48d870" />
        <Px x={TORSO.x + 24} y={TORSO.y + 16} w={3} h={2} fill="#d8c848" />
        {/* 헬멧 (얼굴 박스 + 바이저) */}
        <BlockyBox x={HEAD.x - 2} y={HEAD.y - 2} w={HEAD.w + 4} h={HEAD.h + 4} palette={suit} id="asthelmet" cornerRadius={6} />
        <BlockyBox x={HEAD.x + 4} y={HEAD.y + 8} w={HEAD.w - 8} h={HEAD.h - 16} palette={visor} id="astvisor" cornerRadius={2} />
        <Eyes variant={eyes} cx={cx} cy={HEAD.y + 22} gap={14} dark="#0a2030" />
        <Mouth variant={mouth} cx={cx} cy={HEAD.y + 32} dark="#0a2030" />
      </g>
    );
  }
  // ghost
  const ghost: Palette = { light: "#ffffff", base: "#f0eef8", shade: "#b8b6c8", dark: "#7a7888" };
  return (
    <g opacity={0.92}>
      <BlockyBox x={LEG_L.x - 4} y={LEG_L.y} w={LEG_L.w + 8} h={LEG_L.h} palette={ghost} id="gleg-l" cornerRadius={6} />
      <BlockyBox x={LEG_R.x - 4} y={LEG_R.y} w={LEG_R.w + 8} h={LEG_R.h - 4} palette={ghost} id="gleg-r" cornerRadius={6} />
      <BlockyBox x={ARM_L.x} y={ARM_L.y} w={ARM_L.w} h={ARM_L.h} palette={ghost} id="garm-l" cornerRadius={4} />
      <BlockyBox x={ARM_R.x} y={ARM_R.y} w={ARM_R.w} h={ARM_R.h} palette={ghost} id="garm-r" cornerRadius={4} />
      <BlockyBox x={TORSO.x} y={TORSO.y} w={TORSO.w} h={TORSO.h} palette={ghost} id="gtorso" cornerRadius={6} />
      <BlockyBox x={HEAD.x} y={HEAD.y} w={HEAD.w} h={HEAD.h} palette={ghost} id="ghead" cornerRadius={8} />
      <Eyes variant={eyes} cx={cx} cy={HEAD.y + 22} gap={14} dark="#3a3848" />
      <Mouth variant={mouth} cx={cx} cy={HEAD.y + 34} dark="#3a3848" />
    </g>
  );
}

// ============================================================
// 액세서리 — 안경/모자. 머리 박스(HEAD) 위쪽에 그림.
// ============================================================
function Glasses({ variant }: { variant: string }) {
  const cx = HEAD.x + HEAD.w / 2;
  const cy = HEAD.y + 22;
  if (variant === "round") {
    return (
      <g>
        <circle cx={cx - 7} cy={cy} r={5} fill="none" stroke="#2a1810" strokeWidth={1.5} />
        <circle cx={cx + 7} cy={cy} r={5} fill="none" stroke="#2a1810" strokeWidth={1.5} />
        <line x1={cx - 2} y1={cy} x2={cx + 2} y2={cy} stroke="#2a1810" strokeWidth={1.5} />
      </g>
    );
  }
  if (variant === "sunglasses") {
    return (
      <g>
        <rect x={cx - 12} y={cy - 4} width={10} height={6} rx={1.5} fill="#1a1010" />
        <rect x={cx + 2} y={cy - 4} width={10} height={6} rx={1.5} fill="#1a1010" />
        <Px x={cx - 11} y={cy - 3} w={3} h={1.5} fill="#fff" opacity={0.5} />
        <Px x={cx + 3} y={cy - 3} w={3} h={1.5} fill="#fff" opacity={0.5} />
        <Px x={cx - 2} y={cy - 1} w={4} h={1.5} fill="#1a1010" />
      </g>
    );
  }
  // square
  return (
    <g>
      <rect x={cx - 12} y={cy - 4} width={10} height={7} rx={1} fill="none" stroke="#2a1810" strokeWidth={1.5} />
      <rect x={cx + 2} y={cy - 4} width={10} height={7} rx={1} fill="none" stroke="#2a1810" strokeWidth={1.5} />
      <line x1={cx - 2} y1={cy} x2={cx + 2} y2={cy} stroke="#2a1810" strokeWidth={1.5} />
    </g>
  );
}

function Hat({ variant }: { variant: string }) {
  if (variant === "beanie_navy") {
    const p: Palette = { light: "#4868a8", base: "#28488a", shade: "#162850", dark: "#0a1428" };
    return (
      <g>
        <BlockyBox x={HEAD.x - 2} y={HEAD.y - 6} w={HEAD.w + 4} h={14} palette={p} id="hat-beanie" cornerRadius={3} />
        <Px x={HEAD.x - 2} y={HEAD.y + 6} w={HEAD.w + 4} h={3} fill={p.dark} />
      </g>
    );
  }
  if (variant === "newsboy_brown") {
    const p: Palette = { light: "#a87038", base: "#7a4a20", shade: "#4a2c10", dark: "#281806" };
    return (
      <g>
        <BlockyBox x={HEAD.x - 4} y={HEAD.y + 2} w={HEAD.w + 8} h={6} palette={p} id="hat-news-brim" cornerRadius={2} />
        <BlockyBox x={HEAD.x + 2} y={HEAD.y - 8} w={HEAD.w - 4} h={12} palette={p} id="hat-news-top" cornerRadius={3} />
      </g>
    );
  }
  if (variant === "wizard_purple") {
    return (
      <g>
        <polygon points={`${HEAD.x - 4},${HEAD.y + 4} ${HEAD.x + HEAD.w / 2},${HEAD.y - 22} ${HEAD.x + HEAD.w + 4},${HEAD.y + 4}`} fill="#4830a0" />
        <polygon points={`${HEAD.x - 2},${HEAD.y + 3} ${HEAD.x + HEAD.w / 2 - 2},${HEAD.y - 14} ${HEAD.x + HEAD.w / 2},${HEAD.y - 14}`} fill="#6850c8" opacity={0.7} />
        <Px x={HEAD.x + HEAD.w / 2 - 2} y={HEAD.y - 24} w={4} h={4} fill="#f8d848" />
      </g>
    );
  }
  if (variant === "graduation_black") {
    const p: Palette = { light: "#3a3030", base: "#1a1010", shade: "#0a0606", dark: "#000000" };
    return (
      <g>
        <BlockyBox x={HEAD.x + 2} y={HEAD.y - 2} w={HEAD.w - 4} h={6} palette={p} id="hat-grad-base" cornerRadius={1} />
        <Px x={HEAD.x - 4} y={HEAD.y - 5} w={HEAD.w + 8} h={4} fill={p.base} />
        {/* 술 */}
        <Px x={HEAD.x + HEAD.w - 6} y={HEAD.y - 4} w={2} h={10} fill="#e8b840" />
      </g>
    );
  }
  if (variant === "cap_red") {
    const p: Palette = { light: "#d85848", base: "#a83828", shade: "#702018", dark: "#42100a" };
    return (
      <g>
        <BlockyBox x={HEAD.x - 2} y={HEAD.y + 2} w={HEAD.w + 6} h={4} palette={p} id="hat-cap-brim" cornerRadius={1.5} />
        <BlockyBox x={HEAD.x + 2} y={HEAD.y - 6} w={HEAD.w - 4} h={10} palette={p} id="hat-cap-top" cornerRadius={3} />
        <Px x={HEAD.x + HEAD.w / 2 - 2} y={HEAD.y - 3} w={4} h={3} fill="#fff" />
      </g>
    );
  }
  return null;
}

// ============================================================
// 갤러리 합성 아바타 — 8 슬롯을 base 캐릭터 위에 겹쳐 표시.
//
// 좌표계 동기화 (중요):
//   에디터(/admin/gallery 위치조정) 미리보기와 실제 렌더(/me, /tv) 가 같은
//   좌표/스케일/object-fit/auto-crop 로직을 쓰도록 AvatarLayer + AvatarComposite
//   두 컴포넌트로 묶어 export. 둘 다 이 컴포넌트만 통해 렌더되므로 한 픽셀
//   어긋남도 발생하지 않음.
//
// AvatarLayer: 단일 레이어. position {x,y,scaleX,scaleY} 를 CSS 로 그대로 적용.
//   - 좌표 컨테이너(inner 박스) 의 100% × 100% 가 레이어 기본 박스.
//   - left: x% / top: y% / translate(-50%, -50%) 로 중심점 위치.
//   - scaleX/scaleY 로 100 기준 % 스케일.
//   - 이미지는 width/height 100% + object-fit: contain + useFittedImage 로
//     투명 여백 잘라낸 PNG 사용 (인트린식 비율 유지).
//
// AvatarComposite: 외곽 size×size 컨테이너 + base bbox 비율로 만든 inner 박스.
//   baseUrl 의 alpha bbox 비율(h/w) 을 측정해서 size×size 안에 들어가는
//   최대 직사각형을 inner 박스로 만들고, 그 안에 layers 를 쌓음. 모든 좌표는
//   inner 박스 % 기준.
//
// 레이어 순서(z): base → bottom → outfit → shoes → hair → face → accessory → hat
// ============================================================
type GallerySlot = "base" | "hair" | "hat" | "face" | "accessory" | "outfit" | "bottom" | "shoes";

export function AvatarLayer({
  url,
  position,
  zIndex,
  opacity,
}: {
  url: string;
  position: AvatarGalleryItemPosition;
  zIndex?: number;
  opacity?: number;
}) {
  const fitted = useFittedImage(url);
  return (
    <div
      style={{
        position: "absolute",
        left: `${position.x}%`,
        top: `${position.y}%`,
        width: "100%",
        height: "100%",
        transform: `translate(-50%, -50%) scaleX(${position.scaleX / 100}) scaleY(${position.scaleY / 100})`,
        transformOrigin: "center center",
        zIndex,
        opacity,
        pointerEvents: "none",
      }}
    >
      <img
        src={fitted?.url ?? url}
        alt=""
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          objectPosition: "center",
          display: "block",
        }}
      />
    </div>
  );
}

export type AvatarCompositeLayer = {
  key: string;
  url: string;
  position: AvatarGalleryItemPosition;
  zIndex?: number;
  opacity?: number;
};

export function AvatarComposite({
  size,
  baseUrl,
  layers,
  className,
}: {
  size: number;
  baseUrl: string | undefined;
  layers: AvatarCompositeLayer[];
  className?: string;
}) {
  const baseFitted = useFittedImage(baseUrl);
  const ratio = baseFitted?.ratio ?? 1.4; // height / width
  const innerHeight = ratio >= 1 ? size : size * ratio;
  const innerWidth = ratio >= 1 ? size / ratio : size;
  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "block",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: innerWidth,
          height: innerHeight,
          transform: "translate(-50%, -50%)",
        }}
      >
        {layers.map((l) => (
          <AvatarLayer
            key={l.key}
            url={l.url}
            position={l.position}
            zIndex={l.zIndex}
            opacity={l.opacity}
          />
        ))}
      </div>
    </div>
  );
}

function GalleryAvatar({
  cfg,
  size,
  className,
  galleryPositions,
}: {
  cfg: Extract<AvatarConfig, { kind: "gallery" }>;
  size: number;
  className?: string;
  galleryPositions?: Record<string, AvatarGalleryItemPosition>;
}) {
  const ordered: Array<{ key: GallerySlot; url?: string; z: number }> = [
    { key: "base", url: cfg.base, z: 1 },
    { key: "bottom", url: cfg.bottom, z: 2 },
    { key: "outfit", url: cfg.outfit, z: 3 },
    { key: "shoes", url: cfg.shoes, z: 4 },
    { key: "hair", url: cfg.hair, z: 5 },
    { key: "face", url: cfg.face, z: 6 },
    { key: "accessory", url: cfg.accessory, z: 7 },
    { key: "hat", url: cfg.hat, z: 8 },
  ];
  const layers: AvatarCompositeLayer[] = ordered
    .filter((l): l is { key: GallerySlot; url: string; z: number } => !!l.url)
    .map((l) => ({
      key: l.key,
      url: l.url,
      position:
        (galleryPositions && galleryPositions[l.url]) ??
        DEFAULT_GALLERY_POSITION_BY_CATEGORY[l.key],
      zIndex: l.z,
    }));

  if (layers.length === 0) {
    return (
      <div
        className={className}
        style={{
          position: "relative",
          width: size,
          height: size,
          display: "block",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#9a8b6c",
            fontSize: 12,
          }}
        >
          아이템을 골라주세요
        </div>
      </div>
    );
  }

  return (
    <AvatarComposite
      size={size}
      baseUrl={cfg.base}
      layers={layers}
      className={className}
    />
  );
}

// ============================================================
// 최상위 렌더 컴포넌트
// ============================================================
export function AvatarFigure({
  config,
  size = 144,
  className,
  galleryPositions,
}: {
  config?: AvatarConfig | null;
  size?: number;
  className?: string;
  galleryPositions?: Record<string, AvatarGalleryItemPosition>;
}) {
  const cfg: AvatarConfig = config ?? DEFAULT_AVATAR;

  // 사진 업로드 아바타 — img 그대로 출력
  if (cfg.kind === "image") {
    return (
      <img
        src={cfg.url}
        alt=""
        width={size}
        height={(size * 170) / 120}
        className={className}
        style={{
          width: size,
          height: (size * 170) / 120,
          objectFit: "contain",
          objectPosition: "center bottom",
          display: "block",
        }}
      />
    );
  }

  if (cfg.kind === "gallery") {
    return (
      <GalleryAvatar
        cfg={cfg}
        size={size}
        className={className}
        galleryPositions={galleryPositions}
      />
    );
  }

  const skinPal = (cfg.kind === "human" ? SKIN[cfg.skin] : undefined) ?? SKIN.light;
  const hairPal = (cfg.kind === "human" ? HAIR[cfg.hair] : undefined) ?? HAIR.short_brown;
  const eyes = cfg.kind === "human" ? cfg.eyes : "happy";
  const mouth = cfg.kind === "human" ? cfg.mouth : "smile";
  const costumeKey =
    cfg.kind === "human"
      ? cfg.costume
      : cfg.kind === "animal" || cfg.kind === "fantasy"
      ? cfg.costume ?? "none"
      : "none";
  const costume = COSTUMES[costumeKey] ?? COSTUMES.none;

  let inner: JSX.Element;
  if (cfg.kind === "human") {
    inner = (
      <HumanFigure body={cfg.body} skin={skinPal} hair={hairPal} eyes={eyes} mouth={mouth} costume={costume} />
    );
  } else if (cfg.kind === "animal") {
    inner = <AnimalFigure variant={cfg.variant} costume={costume} eyes={eyes} mouth={mouth} />;
  } else {
    inner = <FantasyFigure variant={cfg.variant} costume={costume} eyes={eyes} mouth={mouth} />;
  }

  const acc = cfg.accessories;
  const glassesV = acc?.glasses && acc.glasses !== "none" ? acc.glasses : null;
  const hatV = acc?.hat && acc.hat !== "none" ? acc.hat : null;

  return (
    <svg
      viewBox="0 0 120 170"
      width={size}
      height={(size * 170) / 120}
      className={className}
      aria-hidden
    >
      {inner}
      {glassesV && <Glasses variant={glassesV} />}
      {hatV && <Hat variant={hatV} />}
    </svg>
  );
}

// ============================================================
// 편집 UI 가 사용할 옵션 목록
// ============================================================
export const AVATAR_OPTIONS = {
  skin: Object.keys(SKIN),
  hair: Object.keys(HAIR),
  eyes: ["happy", "dot", "wink", "round", "sleepy", "star", "sharp"] as const,
  mouth: ["smile", "neutral", "oh", "smirk", "tongue"] as const,
  costume: Object.keys(COSTUMES),
  animal: Object.keys(ANIMAL),
  fantasy: ["robot", "astronaut", "ghost"] as const,
  glasses: ["none", "round", "square", "sunglasses"] as const,
  hat: ["none", "beanie_navy", "newsboy_brown", "wizard_purple", "graduation_black", "cap_red"] as const,
};

// 스와치 색 (편집 UI 칩에 표시) — 의상 세트별 대표 색
export const COSTUME_SWATCH: Record<string, string> = {
  none: "#f4c69a",
  casual_olive: "#6e7c46",
  casual_blue: "#4878a8",
  uniform_school: "#162028",
  dress_pink: "#d088a0",
  sports_red: "#a83828",
  winter_brown: "#7a4a20",
  hoodie_yellow: "#e8b840",
};
