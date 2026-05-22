"use client";

// TV /tree/tv 라우트 전용 백업 폴링 — Supabase Realtime 이 끊겨도
// 30초마다 RSC 를 다시 가져와 최신 상태로 회복시킨다.
// 화면이 hidden(다른 탭/모니터 절전) 일 땐 polling 스킵해서 자원 낭비 방지.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const REFRESH_INTERVAL_MS = 30_000;

export function TVAutoRefresh({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      router.refresh();
    };
    const t = setInterval(tick, REFRESH_INTERVAL_MS);
    return () => clearInterval(t);
  }, [router]);

  return <>{children}</>;
}
