"use client";

// 단계별 이미지 설정을 한 번 로드해서 캐시한다.
// useGalleryPositions 와 같은 패턴: 모듈 레벨 캐시 + in-flight dedup.
// SSR 으로 초기 데이터가 주입되면 즉시 캐시에 채워서 client fetch 없이 사용.

import { useEffect, useState } from "react";
import type { GardenTreeStage, TreeStageImageConfig } from "@/lib/types";
import { listTreeStagesAction } from "./listTreeStagesAction";

type StageMap = Record<number, TreeStageImageConfig | null>;

let cache: StageMap | null = null;
let inflight: Promise<StageMap> | null = null;

function toMap(rows: GardenTreeStage[]): StageMap {
  const map: StageMap = {};
  for (const row of rows) {
    if (row.image_url && row.image_url.length > 0) {
      map[row.stage] = {
        url: row.image_url,
        scale: Number(row.scale) || 1,
        offsetX: Number(row.offset_x) || 0,
        offsetY: Number(row.offset_y) || 0,
      };
    } else {
      map[row.stage] = null;
    }
  }
  return map;
}

async function load(): Promise<StageMap> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const r = await listTreeStagesAction();
    const map = r.ok ? toMap(r.stages) : {};
    cache = map;
    inflight = null;
    return map;
  })();
  return inflight;
}

export function invalidateTreeStagesCache() {
  cache = null;
  inflight = null;
}

// SSR 에서 초기 데이터를 받아 캐시 채우기.
export function primeTreeStagesCache(rows: GardenTreeStage[]) {
  cache = toMap(rows);
}

export function useTreeStages(initial?: GardenTreeStage[]): StageMap {
  // 첫 렌더 시 initial 이 있으면 캐시 채우고 그 값을 바로 반환 — flash 방지.
  if (initial && !cache) {
    cache = toMap(initial);
  }
  const [map, setMap] = useState<StageMap>(() => cache ?? {});
  useEffect(() => {
    if (cache) {
      setMap(cache);
      return;
    }
    let cancelled = false;
    load().then((m) => {
      if (!cancelled) setMap(m);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return map;
}
