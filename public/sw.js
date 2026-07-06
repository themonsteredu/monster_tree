// 사과정원 서비스워커 — 웹 푸시 수신 전용 (오프라인 캐시 없음).
// basePath '/tree' 아래에서 서빙되므로 scope 는 '/tree/'.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    // 페이로드가 JSON 이 아니면 기본 문구로 표시.
  }
  const title = data.title || "🍎 사과정원";
  const options = {
    body: data.body || "사과정원에 새 소식이 있어요!",
    icon: "/tree/icons/monster-symbol.png",
    badge: "/tree/icons/monster-symbol.png",
    data: { url: data.url || "/tree/me" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/tree/me";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        if (client.url.includes("/tree") && "focus" in client) {
          if ("navigate" in client) {
            try {
              await client.navigate(url);
            } catch (_) {
              // 페이지 이동 실패해도 포커스는 시도.
            }
          }
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
