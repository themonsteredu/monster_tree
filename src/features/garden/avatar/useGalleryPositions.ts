"use client";

// 갤러리 아이템 url → position 매핑을 한 번 로드해서 캐시.
// /me, /tv 등 학생 row 의 avatar config(URL만 담김) 만으로 합성 아바타를
// 그리는 페이지에서 사용 — AvatarFigure 에 galleryPositions prop 으로 전달하면
// 관리자가 /admin/gallery 에서 미세조정한 위치가 그대로 반영됨.
//
// 모듈 레벨 캐시 + in-flight 프라미스 deduplication — TV 처럼 다수의
// AvatarFigure 가 동시에 렌더되어도 listGalleryItemsAction 은 한 번만 호출됨.

import { useEffect, useState } from "react";
import type { AvatarGalleryItemPosition } from "@/lib/types";
import { listGalleryItemsAction } from "@/app/me/actions";

type PositionsMap = Record<string, AvatarGalleryItemPosition>;

let cache: PositionsMap | null = null;
let inflight: Promise<PositionsMap> | null = null;

async function load(): Promise<PositionsMap> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const r = await listGalleryItemsAction();
    const map: PositionsMap = {};
    if (r.ok) {
      for (const it of r.items as Array<{ image_url: string; position: AvatarGalleryItemPosition | null }>) {
        if (it.position) map[it.image_url] = it.position;
      }
    }
    cache = map;
    inflight = null;
    return map;
  })();
  return inflight;
}

export function useGalleryPositions(): PositionsMap {
  const [positions, setPositions] = useState<PositionsMap>(() => cache ?? {});
  useEffect(() => {
    if (cache) {
      setPositions(cache);
      return;
    }
    let cancelled = false;
    load().then((m) => {
      if (!cancelled) setPositions(m);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return positions;
}
