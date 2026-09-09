import "server-only";
import { createHash, createECDH, ECDH } from "node:crypto";
import webpush from "web-push";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

const CONFIG_TABLE = "garden_admin_push_config";
const SUBSCRIPTIONS_TABLE = "garden_admin_push_subscriptions";
const MAX_DEVICES = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SETUP_MESSAGE = "건의 알림의 최초 DB 설정이 필요해요. 설정을 마친 뒤 다시 확인해주세요.";
type Database = ReturnType<typeof createSupabaseServiceClient>;
type PushKeys = { publicKey: string; privateKey: string };
type Subscription = { endpoint: string; keys: { p256dh: string; auth: string } };
type SubscriptionRow = Subscription & { id: string; last_seen_at: string; last_tested_at?: string | null };
type Payload = { title: string; body: string; url: string; tag: string };

export class AdminPushError extends Error {
  constructor(message: string, readonly code: string = "REQUEST_FAILED") { super(message); }
}

function serviceDatabase(): Database {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.ADMIN_KEY?.trim()) {
    throw new AdminPushError(SETUP_MESSAGE, "SETUP_REQUIRED");
  }
  return createSupabaseServiceClient();
}

function ownerFingerprint(): string {
  const key = process.env.ADMIN_KEY;
  if (!key?.trim()) throw new AdminPushError("관리자 로그인이 필요해요.", "AUTH_REQUIRED");
  return createHash("sha256").update(`garden-suggestion-owner\0${key}`).digest("hex");
}

function checkDatabase(error: { code?: string } | null) {
  if (!error) return;
  if (["42P01", "42501", "PGRST205", "PGRST204"].includes(error.code ?? "")) {
    throw new AdminPushError(SETUP_MESSAGE, "SETUP_REQUIRED");
  }
  throw new AdminPushError("알림 설정을 저장하지 못했어요. 잠시 후 다시 시도해주세요.");
}

function decodeKey(raw: unknown, bytes: number): Buffer | null {
  if (typeof raw !== "string" || !/^[A-Za-z0-9_-]+={0,2}$/.test(raw) || raw.length > 100) return null;
  const result = Buffer.from(raw, "base64url");
  return result.length === bytes && result.toString("base64url") === raw.replace(/=+$/, "") ? result : null;
}

/** Browser-provided endpoints must never turn the sender into an arbitrary HTTP client. */
export function validateAdminPushEndpoint(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 2048 || raw.trim() !== raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || url.pathname === "/") return null;
    const host = url.hostname;
    const trusted = host === "fcm.googleapis.com" || host === "android.googleapis.com" ||
      host === "updates.push.services.mozilla.com" || host === "web.push.apple.com" ||
      /^[a-z0-9-]+\.push\.apple\.com$/.test(host) || /^[a-z0-9-]+\.notify\.windows\.com$/.test(host);
    return trusted ? url.href : null;
  } catch { return null; }
}

export function validateAdminPushSubscription(raw: unknown): Subscription | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const endpoint = validateAdminPushEndpoint(value.endpoint);
  if (!endpoint || !value.keys || typeof value.keys !== "object" || Array.isArray(value.keys)) return null;
  const keys = value.keys as Record<string, unknown>;
  const publicKey = decodeKey(keys.p256dh, 65);
  const auth = decodeKey(keys.auth, 16);
  if (!publicKey || publicKey[0] !== 4 || !auth) return null;
  try { ECDH.convertKey(publicKey, "prime256v1"); } catch { return null; }
  return { endpoint, keys: { p256dh: publicKey.toString("base64url"), auth: auth.toString("base64url") } };
}

function validKeys(keys: PushKeys): boolean {
  const privateKey = decodeKey(keys.privateKey, 32);
  const publicKey = decodeKey(keys.publicKey, 65);
  if (!privateKey || !publicKey) return false;
  try {
    const ec = createECDH("prime256v1");
    ec.setPrivateKey(privateKey);
    return ec.getPublicKey().equals(publicKey);
  } catch { return false; }
}

/** Dedicated admin worker has its own stable signing key; no student key changes. */
async function loadKeys(sb: Database, initialize: boolean): Promise<PushKeys | null> {
  const read = () => sb.from(CONFIG_TABLE).select("public_key, private_key").eq("id", "suggestions").maybeSingle();
  let result = await read();
  checkDatabase(result.error);
  if (!result.data && initialize) {
    const configured = process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
      ? { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY } : null;
    const generated = configured && validKeys(configured) ? configured : webpush.generateVAPIDKeys();
    const inserted = await sb.from(CONFIG_TABLE).upsert({
      id: "suggestions", public_key: generated.publicKey, private_key: generated.privateKey,
    }, { onConflict: "id", ignoreDuplicates: true });
    checkDatabase(inserted.error);
    // Concurrent first registrations must all use the same winning key pair.
    result = await read();
    checkDatabase(result.error);
  }
  if (!result.data) return null;
  const keys = { publicKey: result.data.public_key, privateKey: result.data.private_key };
  if (!validKeys(keys)) throw new AdminPushError("알림 발송 설정을 확인해야 해요.", "SETUP_REQUIRED");
  return keys;
}

async function findSubscription(sb: Database, endpoint: string, publicKey: string) {
  const result = await sb.from(SUBSCRIPTIONS_TABLE)
    .select("id, endpoint, keys, last_seen_at, last_tested_at")
    .eq("endpoint", endpoint).eq("owner_fingerprint", ownerFingerprint()).eq("vapid_public_key", publicKey).maybeSingle();
  checkDatabase(result.error);
  return result.data as SubscriptionRow | null;
}

export async function adminNotificationState(endpoint?: unknown) {
  if (endpoint !== undefined && !validateAdminPushEndpoint(endpoint)) throw new AdminPushError("기기의 알림 주소를 확인하지 못했어요.");
  const sb = serviceDatabase();
  const keys = await loadKeys(sb, true);
  if (!keys) throw new AdminPushError(SETUP_MESSAGE, "SETUP_REQUIRED");
  // Verify the subscriptions table even before this browser has registered.
  const row = await findSubscription(sb, endpoint ? validateAdminPushEndpoint(endpoint)! : "", keys.publicKey);
  return { publicKey: keys.publicKey, subscribed: Boolean(row) };
}

export async function enableAdminNotifications(raw: unknown) {
  const subscription = validateAdminPushSubscription(raw);
  if (!subscription) throw new AdminPushError("유효한 기기 알림 정보를 확인하지 못했어요.");
  const sb = serviceDatabase();
  const keys = await loadKeys(sb, true);
  if (!keys) throw new AdminPushError(SETUP_MESSAGE, "SETUP_REQUIRED");
  const existing = await findSubscription(sb, subscription.endpoint, keys.publicKey);
  if (!existing) {
    const count = await sb.from(SUBSCRIPTIONS_TABLE).select("id", { count: "exact", head: true }).eq("owner_fingerprint", ownerFingerprint());
    checkDatabase(count.error);
    if ((count.count ?? 0) >= MAX_DEVICES) throw new AdminPushError("등록된 기기가 많아요. 사용하지 않는 기기의 알림을 먼저 꺼주세요.");
  }
  const result = await sb.from(SUBSCRIPTIONS_TABLE).upsert({
    ...subscription, owner_fingerprint: ownerFingerprint(), vapid_public_key: keys.publicKey,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: "endpoint" }).select("id").single();
  checkDatabase(result.error);
  if (!result.data) throw new AdminPushError("알림 등록을 확인하지 못했어요. 다시 시도해주세요.");
}

export async function disableAdminNotifications(raw: unknown) {
  const endpoint = validateAdminPushEndpoint(raw);
  if (!endpoint) throw new AdminPushError("기기의 알림 주소를 확인하지 못했어요.");
  const sb = serviceDatabase();
  const result = await sb.from(SUBSCRIPTIONS_TABLE).delete().eq("endpoint", endpoint).eq("owner_fingerprint", ownerFingerprint());
  checkDatabase(result.error);
}

async function deliver(sb: Database, row: SubscriptionRow, keys: PushKeys, payload: Payload): Promise<"sent" | "expired" | "failed"> {
  const subscription = validateAdminPushSubscription(row);
  if (!subscription) return "failed";
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload), {
      vapidDetails: { subject: "https://www.themonster.kr", ...keys }, TTL: 24 * 3600, timeout: 5000,
    });
    return "sent";
  } catch (error) {
    const status = (error as { statusCode?: number } | null)?.statusCode;
    if (status === 404 || status === 410) {
      await sb.from(SUBSCRIPTIONS_TABLE).delete().eq("id", row.id)
        .eq("owner_fingerprint", ownerFingerprint()).eq("last_seen_at", row.last_seen_at);
      return "expired";
    }
    return "failed";
  }
}

export async function testAdminNotification(raw: unknown) {
  const endpoint = validateAdminPushEndpoint(raw);
  if (!endpoint) throw new AdminPushError("기기의 알림 주소를 확인하지 못했어요.");
  const sb = serviceDatabase();
  const keys = await loadKeys(sb, false);
  if (!keys) throw new AdminPushError(SETUP_MESSAGE, "SETUP_REQUIRED");
  const row = await findSubscription(sb, endpoint, keys.publicKey);
  if (!row) throw new AdminPushError("이 기기의 건의 알림을 먼저 켜주세요.");
  const threshold = new Date(Date.now() - 30_000).toISOString();
  const claim = await sb.from(SUBSCRIPTIONS_TABLE).update({ last_tested_at: new Date().toISOString() })
    .eq("id", row.id).eq("owner_fingerprint", ownerFingerprint())
    .or(`last_tested_at.is.null,last_tested_at.lt.${threshold}`).select("id").maybeSingle();
  checkDatabase(claim.error);
  if (!claim.data) throw new AdminPushError("테스트 알림은 30초 뒤에 다시 보낼 수 있어요.");
  const sent = await deliver(sb, row, keys, {
    title: "더몬스터 · 건의 알림", body: "알림 연결 테스트예요. 새 건의가 올라오면 이 기기로 알려드릴게요.",
    url: "/tree/admin/suggest", tag: "garden-suggestion-test",
  });
  if (sent === "expired") throw new AdminPushError("기기의 알림 연결이 만료됐어요. 알림을 다시 켜주세요.", "SUBSCRIPTION_EXPIRED");
  if (sent !== "sent") throw new AdminPushError("기기로 알림을 보내지 못했어요. 잠시 후 다시 시도해주세요.");
}

/** Only called after a successful student insert. Lock screens contain no student content. */
export async function sendNewSuggestionNotifications(suggestionId: string): Promise<{ sent: number; failed: number }> {
  if (!UUID.test(suggestionId)) return { sent: 0, failed: 0 };
  const sb = serviceDatabase();
  const keys = await loadKeys(sb, false);
  if (!keys) return { sent: 0, failed: 0 };
  const result = await sb.from(SUBSCRIPTIONS_TABLE).select("id, endpoint, keys, last_seen_at")
    .eq("owner_fingerprint", ownerFingerprint()).eq("vapid_public_key", keys.publicKey)
    .order("created_at", { ascending: true }).limit(MAX_DEVICES);
  checkDatabase(result.error);
  const rows = (result.data ?? []) as SubscriptionRow[];
  const payload = {
    title: "더몬스터 · 새 건의", body: "학생이 건의함에 새 글을 올렸어요. 눌러서 확인해주세요.",
    url: `/tree/admin/suggest?notification=${encodeURIComponent(suggestionId)}`, tag: `garden-suggestion-${suggestionId}`,
  };
  let sent = 0;
  for (let offset = 0; offset < rows.length; offset += 10) {
    const outcomes = await Promise.allSettled(rows.slice(offset, offset + 10).map(row => deliver(sb, row, keys, payload)));
    sent += outcomes.filter(result => result.status === "fulfilled" && result.value === "sent").length;
  }
  return { sent, failed: rows.length - sent };
}
