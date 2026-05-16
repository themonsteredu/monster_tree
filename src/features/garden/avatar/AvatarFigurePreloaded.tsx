"use client";

// AvatarFigure 의 모든 갤러리 레이어 이미지를 미리 로드한 뒤 한 번에 표시.
// 갤러리 합성 아바타가 base → outfit → hair 순으로 한 장씩 나타나는
// 깜빡임을 방지한다.

import { useEffect, useMemo, useState } from "react";
import { AvatarFigure } from "./AvatarFigure";
import type { AvatarConfig, AvatarGalleryItemPosition } from "@/lib/types";

type Props = {
  config: AvatarConfig | null;
  size: number;
  galleryPositions?: Record<string, AvatarGalleryItemPosition>;
  className?: string;
};

function collectUrls(cfg: AvatarConfig | null): string[] {
  if (!cfg) return [];
  if (cfg.kind === "gallery") {
    const urls: string[] = [];
    for (const key of ["base", "outfit", "bottom", "shoes", "hair", "face", "hat", "accessory"] as const) {
      const v = cfg[key];
      if (typeof v === "string" && v.length > 0) urls.push(v);
    }
    return urls;
  }
  if (cfg.kind === "image") return cfg.url ? [cfg.url] : [];
  return [];
}

export function AvatarFigurePreloaded({ config, size, galleryPositions, className }: Props) {
  const urls = useMemo(() => collectUrls(config), [config]);
  const [ready, setReady] = useState(urls.length === 0);

  useEffect(() => {
    if (urls.length === 0) {
      setReady(true);
      return;
    }
    setReady(false);
    let cancelled = false;
    let remaining = urls.length;
    const onSettle = () => {
      remaining -= 1;
      if (remaining <= 0 && !cancelled) setReady(true);
    };
    for (const url of urls) {
      const img = new Image();
      img.onload = onSettle;
      img.onerror = onSettle; // 실패해도 통과 — 화면이 영원히 비지 않게
      img.src = url;
    }
    return () => {
      cancelled = true;
    };
  }, [urls]);

  if (!config) return null;

  return (
    <div
      style={{
        position: "relative",
        display: "inline-block",
        width: size,
        height: size,
        opacity: ready ? 1 : 0,
        transition: "opacity 120ms ease",
      }}
      className={className}
    >
      <AvatarFigure config={config} size={size} galleryPositions={galleryPositions} />
    </div>
  );
}
