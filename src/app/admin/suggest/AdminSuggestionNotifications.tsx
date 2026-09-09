"use client";

import { useEffect, useState } from "react";
import {
  disableAdminSuggestionNotificationsAction,
  enableAdminSuggestionNotificationsAction,
  getAdminNotificationStateAction,
  sendAdminSuggestionTestAction,
} from "./notification-actions";
import styles from "./AdminSuggestionNotifications.module.css";

const WORKER_PATH = "/tree/admin/sw.js";
const WORKER_SCOPE = "/tree/admin/";

type Device = "checking" | "supported" | "ios-install" | "unsupported";
type Availability = "checking" | "ready" | "setup" | "auth" | "error";
type Pending = "enable" | "disable" | "test" | null;

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error("연결이 지연되고 있어요. 잠시 후 다시 시도해주세요.")),
      milliseconds,
    );
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error: unknown) => { window.clearTimeout(timer); reject(error); },
    );
  });
}

function publicKeyBytes(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const decoded = window.atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(decoded.length));
  for (let i = 0; i < decoded.length; i += 1) bytes[i] = decoded.charCodeAt(i);
  return bytes;
}

function waitForAdminWorker(registration: ServiceWorkerRegistration): Promise<void> {
  if (registration.active?.state === "activated") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const watched = new Set<ServiceWorker>();
    const cleanup = () => {
      window.clearTimeout(timer);
      registration.removeEventListener("updatefound", check);
      for (const worker of watched) worker.removeEventListener("statechange", check);
    };
    const check = () => {
      if (registration.active?.state === "activated") {
        cleanup();
        resolve();
        return;
      }
      for (const worker of [registration.installing, registration.waiting, registration.active]) {
        if (worker && !watched.has(worker)) {
          watched.add(worker);
          worker.addEventListener("statechange", check);
        }
      }
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("알림 연결이 완료되지 않았어요. 화면을 새로고침한 후 다시 시도해주세요."));
    }, 10000);
    registration.addEventListener("updatefound", check);
    check();
  });
}

/** Administrator-only enrollment. Preview mode never touches browser or server APIs. */
export function AdminSuggestionNotifications({ previewMode = false }: { previewMode?: boolean }) {
  const [device, setDevice] = useState<Device>(previewMode ? "supported" : "checking");
  const [availability, setAvailability] = useState<Availability>(previewMode ? "ready" : "checking");
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [publicKey, setPublicKey] = useState("");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [renewOnEnable, setRenewOnEnable] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (previewMode) return;
    let cancelled = false;
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const supported = window.isSecureContext && "serviceWorker" in navigator
      && "PushManager" in window && "Notification" in window;
    const currentDevice: Device = isIos && !standalone ? "ios-install" : supported ? "supported" : "unsupported";
    setDevice(currentDevice);
    if ("Notification" in window) setPermission(Notification.permission);
    setAvailability("checking");
    setError(null);
    setMessage(null);

    void (async () => {
      try {
        let currentEndpoint: string | undefined;
        if (supported) {
          const registration = await withTimeout(navigator.serviceWorker.getRegistration(WORKER_SCOPE), 5000);
          // getRegistration may otherwise return the broader student worker.
          if (registration?.scope === new URL(WORKER_SCOPE, window.location.origin).href) {
            const subscription = await withTimeout(registration.pushManager.getSubscription(), 5000);
            currentEndpoint = subscription?.endpoint;
          }
        }
        const result = await withTimeout(getAdminNotificationStateAction({ endpoint: currentEndpoint }), 15000);
        if (cancelled) return;
        setEndpoint(currentEndpoint ?? null);
        if (!result.ok) {
          setSubscribed(false);
          setAvailability(result.code === "SETUP_REQUIRED" ? "setup" : result.code === "AUTH_REQUIRED" ? "auth" : "error");
          setError(result.message);
          return;
        }
        setPublicKey(result.publicKey);
        setSubscribed(Boolean(currentEndpoint && result.subscribed));
        setAvailability("ready");
      } catch (cause) {
        if (cancelled) return;
        setAvailability("error");
        setError(cause instanceof Error ? cause.message : "알림 상태를 확인하지 못했어요.");
      }
    })();
    return () => { cancelled = true; };
  }, [previewMode, retry]);

  const enable = async () => {
    setError(null);
    setMessage(null);
    if (previewMode) {
      setSubscribed(true);
      setMessage("미리보기에서 알림을 켰어요. 실제 알림은 발송하지 않아요.");
      return;
    }
    setPending("enable");
    try {
      // Keep the browser permission request directly within the user's click.
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted") {
        setMessage(nextPermission === "denied" ? null : "알림 허용을 선택하면 연결할 수 있어요.");
        return;
      }
      const state = await withTimeout(getAdminNotificationStateAction({}), 15000);
      if (!state.ok) {
        setAvailability(state.code === "SETUP_REQUIRED" ? "setup" : state.code === "AUTH_REQUIRED" ? "auth" : "error");
        throw new Error(state.message);
      }
      setPublicKey(state.publicKey);
      if (!state.publicKey) throw new Error("알림 연결 준비가 필요해요. 잠시 후 다시 확인해주세요.");
      const registration = await withTimeout(navigator.serviceWorker.register(WORKER_PATH, { scope: WORKER_SCOPE }), 10000);
      if (registration.scope !== new URL(WORKER_SCOPE, window.location.origin).href) {
        throw new Error("관리자 알림 연결을 확인하지 못했어요. 다시 시도해주세요.");
      }
      await waitForAdminWorker(registration);
      const applicationServerKey = publicKeyBytes(state.publicKey);
      let subscription = await withTimeout(registration.pushManager.getSubscription(), 5000);
      if (subscription) {
        const previousKey = subscription.options.applicationServerKey;
        const previousBytes = previousKey ? new Uint8Array(previousKey) : null;
        const keyMatches = previousBytes?.length === applicationServerKey.length
          && applicationServerKey.every((value, index) => value === previousBytes[index]);
        if (!keyMatches || renewOnEnable) {
          // Explicit enable repairs a rotated key or confirmed expired admin subscription.
          // Remove its old enrollment too so key rotation cannot consume the device quota.
          const removed = await withTimeout(disableAdminSuggestionNotificationsAction({ endpoint: subscription.endpoint }), 15000);
          if (!removed.ok) throw new Error(removed.message);
          const unsubscribed = await withTimeout(subscription.unsubscribe(), 5000);
          if (!unsubscribed) throw new Error("이전 알림 연결을 해제하지 못했어요. 새로고침 후 다시 시도해주세요.");
          subscription = null;
          setEndpoint(null);
        }
      }
      subscription ??= await withTimeout(registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        }), 15000);
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error("기기의 알림 정보를 읽지 못했어요.");
      const result = await withTimeout(enableAdminSuggestionNotificationsAction({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      }), 15000);
      if (!result.ok) throw new Error(result.message);
      setEndpoint(json.endpoint);
      setSubscribed(true);
      setRenewOnEnable(false);
      setAvailability("ready");
      setMessage(result.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "알림을 켜지 못했어요. 다시 시도해주세요.");
    } finally {
      setPending(null);
    }
  };

  const changeEnrollment = async (action: "disable" | "test") => {
    setError(null);
    setMessage(null);
    if (previewMode) {
      if (action === "disable") setSubscribed(false);
      setMessage(action === "disable" ? "미리보기에서 알림을 껐어요." : "미리보기예요. 실제 기기로 알림을 보내지 않아요.");
      return;
    }
    if (!endpoint) {
      setError("기기의 알림 정보를 다시 확인해주세요.");
      return;
    }
    setPending(action);
    let expired = false;
    try {
      const result = await withTimeout(action === "disable"
        ? disableAdminSuggestionNotificationsAction({ endpoint })
        : sendAdminSuggestionTestAction({ endpoint }), 15000);
      if (!result.ok) {
        if (action === "test" && result.code === "SUBSCRIPTION_EXPIRED") {
          expired = true;
          setRenewOnEnable(true);
          setSubscribed(false);
        }
        throw new Error(result.message);
      }
      // Leave the browser subscription intact; only remove administrator enrollment.
      if (action === "disable") setSubscribed(false);
      setMessage(result.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "알림 설정을 변경하지 못했어요.");
      if (action === "test") {
        // A failed delivery may have removed an expired endpoint on the server.
        // Show enable again only after confirming the actual enrollment state.
        try {
          const state = await withTimeout(getAdminNotificationStateAction({ endpoint }), 15000);
          if (state.ok) {
            setPublicKey(state.publicKey);
            setSubscribed(state.subscribed && !expired);
          } else {
            setAvailability(state.code === "SETUP_REQUIRED" ? "setup" : state.code === "AUTH_REQUIRED" ? "auth" : "error");
          }
        } catch {
          setAvailability("error");
        }
      }
    } finally {
      setPending(null);
    }
  };

  const blocked = !previewMode && permission === "denied";
  const busy = pending !== null || availability === "checking";
  const canEnable = availability === "ready" && device === "supported" && !blocked && (previewMode || Boolean(publicKey));
  const status = availability === "checking" ? "확인 중"
    : availability === "setup" ? "연결 준비 중"
      : availability === "auth" ? "로그인 필요"
        : availability === "error" ? "확인 필요"
          : blocked ? "기기에서 차단됨"
            : subscribed ? "이 기기에서 켜짐" : "이 기기에서 꺼짐";

  return (
    <section className={styles.panel} aria-label="건의함 알림 설정">
      <div className={styles.heading}>
        <div>
          <h2 className={styles.title}>건의함 알림</h2>
          <p className={styles.description}>새 건의가 올라오면 휴대폰과 컴퓨터로 알려드려요. 모든 지점의 새 글을 받습니다.</p>
        </div>
        <span className={`${styles.status} ${subscribed && !blocked && availability === "ready" ? styles.enabled : ""}`} role="status">{status}</span>
      </div>

      {previewMode && <p className={styles.hint}>테스트 모드 — 기기 설정이나 기록을 저장하지 않아요.</p>}
      {!previewMode && device === "ios-install" && (
        <p className={styles.hint}>아이폰·아이패드는 Safari에서 <strong>공유 → 홈 화면에 추가</strong> 후, 추가된 아이콘으로 이 화면을 열고 알림을 켜주세요.</p>
      )}
      {!previewMode && device === "unsupported" && (
        <p className={styles.hint}>이 브라우저에서는 알림을 지원하지 않아요. 안드로이드는 Chrome으로 열어주세요. 아이폰·아이패드는 최신 iOS에서 홈 화면에 추가한 앱으로 열어주세요.</p>
      )}
      {blocked && <p className={styles.hint}>기기나 브라우저 설정에서 이 사이트의 알림을 허용한 뒤, 아래 ‘다시 확인’을 눌러주세요.</p>}

      <div className={styles.actions}>
        {subscribed ? (
          <>
            <button type="button" className={styles.primary} onClick={() => void changeEnrollment("test")} disabled={busy || blocked || availability !== "ready"}>{pending === "test" ? "보내는 중…" : "테스트 알림 받기"}</button>
            <button type="button" className={styles.secondary} onClick={() => void changeEnrollment("disable")} disabled={busy || availability !== "ready"}>{pending === "disable" ? "끄는 중…" : "이 기기 알림 끄기"}</button>
          </>
        ) : (
          <button type="button" className={styles.primary} onClick={() => void enable()} disabled={busy || !canEnable}>{pending === "enable" ? "연결하는 중…" : "이 기기 알림 켜기"}</button>
        )}
        {!previewMode && (blocked || availability === "error" || availability === "setup" || availability === "auth") && (
          <button type="button" className={styles.secondary} onClick={() => setRetry((value) => value + 1)} disabled={busy}>다시 확인</button>
        )}
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {message && <p className={styles.message} role="status">{message}</p>}
      {!previewMode && (
        <details className={styles.guide}>
          <summary>휴대폰에서 알림 받는 방법</summary>
          <p><strong>안드로이드</strong> · Chrome에서 이 관리 화면을 열고 ‘이 기기 알림 켜기’ → ‘허용’을 눌러주세요.</p>
          <p><strong>아이폰·아이패드</strong> · Safari에서 ‘공유’ → ‘홈 화면에 추가’ 후, 추가된 아이콘으로 열어 알림을 허용해주세요.</p>
          <p>알림을 받을 기기마다 한 번씩 켜주세요. 알림에는 학생 이름이나 건의 내용을 표시하지 않아요.</p>
        </details>
      )}
    </section>
  );
}
