"use client";

// 로비 TV 화면 절전 방지 — Screen Wake Lock API.
// 브라우저가 지원하면 화면 꺼짐/잠금을 막고, 탭이 다시 보일 때 잠금이 풀려 있으면
// 재획득한다. 미지원 브라우저(구형 안드로이드 박스 등)에서는 조용히 무시되므로
// 그 경우 기기 설정이나 키오스크 앱(Fully Kiosk 등)으로 화면 꺼짐을 막아야 한다.

import { useEffect } from "react";

type WakeLockSentinel = { release: () => Promise<void>; released?: boolean };
type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> };
};

export function TVWakeLock() {
  useEffect(() => {
    const nav = navigator as WakeLockNavigator;
    if (!nav.wakeLock) return;

    let sentinel: WakeLockSentinel | null = null;
    let disposed = false;

    const acquire = async () => {
      try {
        const s = await nav.wakeLock!.request("screen");
        if (disposed) {
          s.release().catch(() => {});
          return;
        }
        sentinel = s;
      } catch {
        // 절전 모드/권한 정책으로 거부될 수 있음 — TV 표시 자체에는 영향 없음
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") acquire();
    };

    acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      sentinel?.release().catch(() => {});
    };
  }, []);

  return null;
}
