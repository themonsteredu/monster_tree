"use client";

// 씬 하단 시네마 자막 스타일 전광판.
// 오른쪽 밖 → 왼쪽 밖으로 천천히 흐른다. 텍스트가 비어있으면 렌더되지 않는다.

type Props = {
  text: string;
  height?: number;
  fontSize?: number;
  durationSec?: number;
  borderRadius?: number | string;
};

export function MoodTicker({
  text,
  height = 24,
  fontSize = 11,
  durationSec = 15,
  borderRadius,
}: Props) {
  const trimmed = text?.trim() ?? "";
  if (trimmed.length === 0) return null;

  return (
    <div
      aria-label="학생 한마디"
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height,
        background: "rgba(0,0,0,0.35)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 6,
        borderBottomLeftRadius: borderRadius,
        borderBottomRightRadius: borderRadius,
      }}
    >
      <div
        className="mood-ticker-text"
        style={{
          position: "absolute",
          top: "50%",
          transform: "translateY(-50%)",
          whiteSpace: "nowrap",
          color: "rgba(255,255,255,0.92)",
          fontSize,
          fontWeight: 600,
          letterSpacing: "0.01em",
          textShadow: "0 1px 2px rgba(0,0,0,0.4)",
          animationDuration: `${durationSec}s`,
        }}
      >
        {trimmed}
      </div>
    </div>
  );
}
