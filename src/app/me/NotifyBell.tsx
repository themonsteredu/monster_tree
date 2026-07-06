"use client";

// 🔔 알림 켜기 — 웹 푸시 구독 버튼 (/me 받을 포인트 카드 근처).
//
// - NEXT_PUBLIC_VAPID_PUBLIC_KEY 가 없으면 아무것도 렌더하지 않음 (기능 비활성).
// - iOS 는 16.4+ 에서 "홈 화면에 추가"된 웹앱에서만 푸시 지원 → 사파리로 열었으면
//   버튼 대신 홈 화면 추가 안내를 보여준다.
// - 구독 성공 시 서버(garden_push_subscriptions)에 저장, 이후엔 "알림 켜짐" 표시.

import { useEffect, useState } from "react";
import { savePushSubscriptionAction } from "./actions";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

// PushManager.subscribe 가 요구하는 형식으로 base64url VAPID 키 변환.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

type BellState =
  | "checking"      // 마운트 직후 지원/구독 여부 확인 중
  | "idle"          // 켤 수 있음
  | "loading"       // 구독 진행 중
  | "subscribed"    // 이미 켜짐
  | "denied"        // 사용자가 알림 차단
  | "ios-install"   // iOS 인데 홈 화면 추가 안 된 브라우저
  | "unsupported";  // 그 외 미지원 환경

export function NotifyBell() {
  const [state, setState] = useState<BellState>("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!VAPID_PUBLIC_KEY) return;
    let cancelled = false;

    (async () => {
      const supported =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;
      if (!supported) {
        const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const standalone =
          window.matchMedia("(display-mode: standalone)").matches ||
          (navigator as unknown as { standalone?: boolean }).standalone === true;
        if (!cancelled) setState(isIos && !standalone ? "ios-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (!cancelled) setState(sub ? "subscribed" : "idle");
      } catch {
        if (!cancelled) setState("idle");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!VAPID_PUBLIC_KEY) return null;
  if (state === "checking" || state === "unsupported") return null;

  const onEnable = async () => {
    setError(null);
    setState("loading");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "idle");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }));
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("구독 정보를 읽지 못했어요.");
      }
      const res = await savePushSubscriptionAction({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
      if (!res.ok) throw new Error(res.message);
      setState("subscribed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "알림을 켜지 못했어요. 다시 시도해주세요.");
      setState("idle");
    }
  };

  return (
    <div
      style={{
        marginBottom: 14,
        background: "#F5F0E6",
        borderRadius: 14,
        padding: "10px 12px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <span style={{ fontSize: 18, flexShrink: 0 }}>🔔</span>
      <div className="font-pretendard" style={{ flex: 1, minWidth: 160 }}>
        {state === "subscribed" ? (
          <span style={{ fontSize: 12, fontWeight: 600, color: "#4a8030" }}>
            알림 켜짐 — 받을 포인트가 쌓이면 알려드려요!
          </span>
        ) : state === "denied" ? (
          <span style={{ fontSize: 12, color: "#8a6f52" }}>
            알림이 차단돼 있어요. 휴대폰 설정 &gt; 사과정원에서 알림을 허용해주세요.
          </span>
        ) : state === "ios-install" ? (
          <span style={{ fontSize: 12, color: "#8a6f52" }}>
            아이폰은 <b>공유 → 홈 화면에 추가</b> 후, 홈 화면의 사과정원 앱에서 열면
            알림을 켤 수 있어요.
          </span>
        ) : (
          <span style={{ fontSize: 12, color: "#5c4a35" }}>
            받을 포인트가 생기면 폰으로 알려드려요!
          </span>
        )}
        {error && (
          <div style={{ fontSize: 11, color: "#b04020", marginTop: 2 }}>{error}</div>
        )}
      </div>
      {(state === "idle" || state === "loading") && (
        <button
          type="button"
          onClick={onEnable}
          disabled={state === "loading"}
          className="font-pretendard"
          style={{
            flexShrink: 0,
            fontSize: 12,
            fontWeight: 700,
            padding: "8px 14px",
            borderRadius: 999,
            border: "1.5px solid #3d2818",
            background: state === "loading" ? "#e8ddc8" : "#f0c050",
            color: "#3d2818",
            cursor: state === "loading" ? "wait" : "pointer",
          }}
        >
          {state === "loading" ? "켜는 중..." : "알림 켜기"}
        </button>
      )}
    </div>
  );
}
