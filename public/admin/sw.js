// Dedicated administrator push worker. No fetch handler, cache, or student subscription changes.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

function mailboxUrl(raw) {
  const fallback = new URL("/tree/admin/suggest", self.location.origin);
  try {
    const input = new URL(typeof raw === "string" ? raw : "", self.location.origin);
    if (input.origin !== fallback.origin || input.pathname !== fallback.pathname) return fallback.href;
    const id = input.searchParams.get("notification");
    if (id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      fallback.searchParams.set("notification", id);
    }
  } catch (_) { /* Untrusted targets always fall back to the authenticated mailbox. */ }
  return fallback.href;
}

self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { /* Default message below. */ }
  if (!data || typeof data !== "object") data = {};
  event.waitUntil(self.registration.showNotification(
    typeof data.title === "string" ? data.title.slice(0, 100) : "더몬스터 · 새 건의",
    {
      body: typeof data.body === "string" ? data.body.slice(0, 200) : "건의함에 새 소식이 있어요.",
      icon: "/tree/icons/monster-symbol.png", badge: "/tree/icons/monster-symbol.png",
      tag: typeof data.tag === "string" ? data.tag.slice(0, 100) : "garden-suggestion",
      data: { url: mailboxUrl(data.url) },
    },
  ));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = mailboxUrl(event.notification.data?.url);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      const current = new URL(client.url);
      if (current.origin !== self.location.origin || !current.pathname.startsWith("/tree/admin/")) continue;
      try { await client.navigate(url); return await client.focus(); } catch (_) { /* Try another admin window. */ }
    }
    return self.clients.openWindow(url);
  })());
});
