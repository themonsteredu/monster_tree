// Run: node scripts/test-admin-suggestion-notifications.mjs
// Actual server modules in isolated VMs. Synthetic DB/JWT/keys and fake delivery only.
// No env files, credentials, network calls, real subscriptions, or notifications.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import * as crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plain = value => JSON.parse(JSON.stringify(value));
const CONFIG = "garden_admin_push_config";
const DEVICES = "garden_admin_push_subscriptions";
const suggestionId = "e23f82f4-3936-4c49-a798-9332f4b9af8c";
const studentId = "195980bd-6601-4676-ab7e-348aa5e6d529";
const branchId = "18a00fc8-9722-4794-b8a6-c4c980d7c765";
const signingKeys = () => {
  const ec = crypto.createECDH("prime256v1"); ec.generateKeys();
  return { publicKey: ec.getPublicKey().toString("base64url"), privateKey: ec.getPrivateKey().toString("base64url") };
};
const subscription = (suffix = "fixture-device") => {
  const keys = signingKeys();
  return { endpoint: `https://fcm.googleapis.com/fcm/send/${suffix}`, keys: { p256dh: keys.publicKey, auth: crypto.randomBytes(16).toString("base64url") } };
};

function harness() {
  const keys = signingKeys();
  const env = {
    NODE_ENV: "test", NEXT_PUBLIC_SUPABASE_URL: "https://fixture.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "fixture-service-key-not-real", ADMIN_KEY: "fixture-owner-not-real",
  };
  const rows = {
    [CONFIG]: [{ id: "suggestions", public_key: keys.publicKey, private_key: keys.privateKey }],
    [DEVICES]: [],
    garden_students: [{ id: studentId, name: "PRIVATE_STUDENT_NAME", branch_id: branchId, external_student_id: 42, is_active: true }],
    garden_suggestion_blocks: [], garden_suggestions: [],
  };
  const state = {
    admin: true, student: true, serviceCalls: 0, queries: [], deliveries: [], after: [],
    senderCalls: [], revalidated: [], cookiesDeleted: [], branches: [], logs: [],
    errors: new Map(), transport: async () => ({}), sender: async () => ({ sent: 0, failed: 0 }),
  };
  const fingerprint = () => crypto.createHash("sha256").update(`garden-suggestion-owner\0${env.ADMIN_KEY}`).digest("hex");
  const db = { from(table) {
    assert.ok(Object.hasOwn(rows, table), `Unapproved table ${table}`);
    const query = { table, operation: "select", filters: [], columns: "*", options: {}, mode: null, values: null };
    let executed;
    const run = () => {
      if (executed) return executed;
      state.queries.push(plain(query));
      const error = state.errors.get(`${table}:${query.operation}`) ?? state.errors.get(table);
      if (error) return executed = { data: null, error, count: null };
      const matches = row => query.filters.every(([key, value]) => row[key] === value) && (!query.or ||
        rowValueBefore(rowValue(row, "last_tested_at"), query.or.split("last_tested_at.lt.")[1]));
      let selected = rows[table].filter(matches);
      if (query.operation === "upsert") {
        const values = Array.isArray(query.values) ? query.values : [query.values];
        selected = values.map(value => {
          const old = rows[table].find(row => row[query.conflict] === value[query.conflict]);
          if (old) { if (!query.ignoreDuplicates) Object.assign(old, plain(value)); return old; }
          const row = { id: crypto.randomUUID(), ...plain(value) }; rows[table].push(row); return row;
        });
      } else if (query.operation === "insert") {
        selected = [{ id: suggestionId, ...plain(query.values) }]; rows[table].push(...selected);
      } else if (query.operation === "update") {
        selected.forEach(row => Object.assign(row, plain(query.values)));
      } else if (query.operation === "delete") {
        rows[table] = rows[table].filter(row => !selected.includes(row));
      }
      const count = selected.length;
      if (query.limit) selected = selected.slice(0, query.limit);
      const data = query.options.head ? null : (query.mode ? selected[0] ?? null : selected);
      return executed = { data: plain(data), error: null, count };
    };
    const builder = {
      select(columns = "*", options = {}) { query.columns = columns; query.options = options; return this; },
      eq(key, value) { query.filters.push([key, value]); return this; },
      or(expression) { query.or = expression; return this; },
      order() { return this; }, limit(value) { query.limit = value; return this; },
      upsert(values, options) { Object.assign(query, { operation: "upsert", values, conflict: options.onConflict, ignoreDuplicates: options.ignoreDuplicates }); return this; },
      insert(values) { Object.assign(query, { operation: "insert", values }); return this; },
      update(values) { Object.assign(query, { operation: "update", values }); return this; },
      delete() { query.operation = "delete"; return this; },
      maybeSingle() { query.mode = "maybe"; return this; }, single() { query.mode = "single"; return this; },
      then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); },
    };
    return builder;
  } };
  const modules = new Map();
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} }; modules.set(filename, module);
    const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      fileName: filename, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText;
    const imports = specifier => {
      if (specifier === "server-only") return {};
      if (specifier === "node:crypto") return crypto;
      if (specifier === "web-push") return {
        generateVAPIDKeys: signingKeys,
        sendNotification: async (sub, payload, options) => {
          state.deliveries.push({ subscription: plain(sub), payload: JSON.parse(payload), options: plain(options) });
          return state.transport(sub, payload, options);
        },
      };
      if (specifier === "@/lib/supabase/server") return { createSupabaseServiceClient: () => { state.serviceCalls++; return db; } };
      if (specifier === "../auth") return { isAdminAuthenticated: async () => state.admin };
      if (specifier === "next/headers") return { cookies: async () => ({
        get: () => state.student ? { value: "fixture-student-token" } : undefined,
        delete: name => state.cookiesDeleted.push(name),
      }) };
      if (specifier === "next/cache") return { revalidatePath: value => state.revalidated.push(value) };
      if (specifier === "next/server") return { after: callback => { state.after.push(callback); } };
      if (specifier === "@/lib/student-jwt") return {
        STUDENT_COOKIE_NAME: "monster_student", verifyStudentJwt: async token => token && state.student ?
          { branchId, studentLocalId: 42, name: "PRIVATE_STUDENT_NAME" } : null,
      };
      if (specifier === "@/lib/branch") return { setAdminBranchCookie: async branch => state.branches.push(branch) };
      if (specifier === "@/lib/admin-suggestion-push" && relative.includes("/me/suggest/")) return {
        AdminPushError: load("src/lib/admin-suggestion-push.ts").AdminPushError,
        sendNewSuggestionNotifications: async id => { state.senderCalls.push(id); return state.sender(id); },
      };
      if (specifier.startsWith("@/")) return load(`src/${specifier.slice(2)}.ts`);
      throw new Error(`Unexpected import ${specifier}: network/auth/DB SDKs are forbidden in this test.`);
    };
    vm.runInNewContext(code, {
      module, exports: module.exports, require: imports, process: { env }, Buffer, URL,
      console: { error: (...args) => state.logs.push(args), warn: (...args) => state.logs.push(args), log: (...args) => state.logs.push(args) },
    }, { filename });
    return module.exports;
  }
  const core = load("src/lib/admin-suggestion-push.ts");
  const actions = load("src/app/admin/suggest/notification-actions.ts");
  const student = () => load("src/app/me/suggest/actions.ts");
  const addDevice = (sub = subscription(), overrides = {}) => {
    const row = { id: crypto.randomUUID(), ...plain(sub), owner_fingerprint: fingerprint(), vapid_public_key: keys.publicKey,
      last_seen_at: "2026-09-09T00:00:00.000Z", last_tested_at: null, ...overrides };
    rows[DEVICES].push(row); return row;
  };
  return { env, rows, state, keys, fingerprint, core, actions, student, addDevice, drain: async () => { for (const callback of state.after.splice(0)) await callback(); } };
}
const rowValue = (row, key) => row[key];
const rowValueBefore = (value, threshold) => value == null || value < threshold;
let checks = 0;
async function test(name, run) {
  try { await run(); console.log(`ok ${++checks} - ${name}`); }
  catch (error) { console.error(`FAILED - ${name}`); throw error; }
}

await test("all administrator actions await authentication before database, key initialization, delivery or branch changes", async () => {
  const h = harness(); h.state.admin = false;
  const sub = subscription();
  for (const [name, input] of [
    ["getAdminNotificationStateAction", { endpoint: sub.endpoint }],
    ["enableAdminSuggestionNotificationsAction", sub],
    ["disableAdminSuggestionNotificationsAction", { endpoint: sub.endpoint }],
    ["sendAdminSuggestionTestAction", { endpoint: sub.endpoint }],
    ["openSuggestionNotificationAction", suggestionId],
  ]) assert.deepEqual(plain(await h.actions[name](input)), { ok: false, message: "관리자 로그인이 필요해요.", code: "AUTH_REQUIRED" });
  assert.equal(h.state.serviceCalls, 0); assert.equal(h.state.deliveries.length, 0); assert.equal(h.state.branches.length, 0);
});

await test("only recognized HTTPS push hosts and valid canonical P-256/auth keys are accepted; SSRF destinations fail closed", async () => {
  const h = harness(); const sub = subscription();
  for (const host of ["fcm.googleapis.com", "android.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com", "fixture.push.apple.com", "fixture.notify.windows.com"]) {
    assert.ok(h.core.validateAdminPushSubscription({ ...sub, endpoint: `https://${host}/fixture` }));
  }
  for (const endpoint of ["http://fcm.googleapis.com/send/a", "https://127.0.0.1/a", "https://[::1]/a", "https://169.254.169.254/latest/meta-data", "https://localhost/a", "https://evil.invalid/a",
    "https://fcm.googleapis.com.evil.invalid/a", "https://evil.invalid@fcm.googleapis.com/a", "https://fcm.googleapis.com:8443/a", "https://fcm.googleapis.com/a#fragment",
    "https://a.b.push.apple.com/a", "https://fcm.googleapis.com/", " https://fcm.googleapis.com/a", "https://fcm.googleapis.com/" + "a".repeat(2048), "file:///etc/passwd"]) {
    assert.equal(h.core.validateAdminPushEndpoint(endpoint), null, endpoint);
    assert.equal((await h.actions.enableAdminSuggestionNotificationsAction({ ...sub, endpoint })).ok, false);
  }
  for (const keys of [{}, { ...sub.keys, auth: "x" }, { ...sub.keys, auth: "a".repeat(101) },
    { ...sub.keys, p256dh: Buffer.alloc(65, 4).toString("base64url") },
    { ...sub.keys, p256dh: Buffer.from([3, ...Buffer.alloc(64)]).toString("base64url") },
    { ...sub.keys, p256dh: `${sub.keys.p256dh}!` }]) assert.equal(h.core.validateAdminPushSubscription({ ...sub, keys }), null);
  assert.equal(h.state.serviceCalls, 0); assert.equal(h.state.deliveries.length, 0);
});

await test("enrollment initializes stable administrator keys and writes only administrator subscription tables", async () => {
  const h = harness(); h.rows[CONFIG] = [];
  const first = await h.actions.getAdminNotificationStateAction();
  assert.equal(first.ok, true); assert.equal(first.subscribed, false);
  const again = await h.actions.getAdminNotificationStateAction(); assert.equal(first.publicKey, again.publicKey);
  const sub = subscription(); const result = await h.actions.enableAdminSuggestionNotificationsAction(sub);
  assert.equal(result.ok, true); assert.equal(h.rows[DEVICES].length, 1);
  assert.equal(h.rows[DEVICES][0].owner_fingerprint, h.fingerprint());
  assert.equal(h.rows[DEVICES][0].vapid_public_key, first.publicKey);
  assert.deepEqual(Object.keys(first).sort(), ["ok", "publicKey", "subscribed"]);
  assert.ok(h.state.queries.every(query => [CONFIG, DEVICES].includes(query.table)));
  assert.equal(h.state.deliveries.length, 0);
});

await test("browser endpoint alone cannot claim enabled status; only current owner and signing key count", async () => {
  const h = harness(); const sub = subscription();
  assert.equal((await h.actions.getAdminNotificationStateAction({ endpoint: sub.endpoint })).subscribed, false);
  const row = h.addDevice(sub);
  assert.equal((await h.actions.getAdminNotificationStateAction({ endpoint: sub.endpoint })).subscribed, true);
  row.owner_fingerprint = "previous-owner";
  assert.equal((await h.actions.getAdminNotificationStateAction({ endpoint: sub.endpoint })).subscribed, false);
  row.owner_fingerprint = h.fingerprint(); row.vapid_public_key = signingKeys().publicKey;
  assert.equal((await h.actions.getAdminNotificationStateAction({ endpoint: sub.endpoint })).subscribed, false);
});

await test("new-post payload is generic, owner/key scoped and links directly to the saved suggestion", async () => {
  const h = harness(); h.addDevice();
  h.addDevice(subscription("wrong-owner"), { owner_fingerprint: "previous-owner" });
  h.addDevice(subscription("wrong-key"), { vapid_public_key: signingKeys().publicKey });
  assert.deepEqual(plain(await h.core.sendNewSuggestionNotifications(suggestionId)), { sent: 1, failed: 0 });
  const sent = h.state.deliveries[0]; assert.deepEqual(Object.keys(sent.payload).sort(), ["body", "tag", "title", "url"]);
  assert.equal(sent.payload.url, `/tree/admin/suggest?notification=${suggestionId}`);
  assert.equal(sent.payload.tag, `garden-suggestion-${suggestionId}`);
  assert.doesNotMatch(JSON.stringify(sent.payload), /PRIVATE_|student_id|student_name|branch_id|privateKey|fixture-owner/);
  assert.equal(sent.options.timeout, 5000); assert.equal(sent.options.vapidDetails.publicKey, h.keys.publicKey);
  h.env.ADMIN_KEY = "rotated-owner-fixture";
  assert.deepEqual(plain(await h.core.sendNewSuggestionNotifications(suggestionId)), { sent: 0, failed: 0 });
  assert.equal(h.state.deliveries.length, 1);
});

await test("invalid suggestion IDs and unconfigured enrollment never generate notifications", async () => {
  const h = harness(); h.addDevice();
  for (const id of ["", "not-a-uuid", `${suggestionId}?url=https://evil.invalid`, null]) {
    assert.deepEqual(plain(await h.core.sendNewSuggestionNotifications(id)), { sent: 0, failed: 0 });
  }
  assert.equal(h.state.serviceCalls, 0);
  h.rows[CONFIG] = [];
  assert.deepEqual(plain(await h.core.sendNewSuggestionNotifications(suggestionId)), { sent: 0, failed: 0 });
  assert.equal(h.rows[CONFIG].length, 0); assert.equal(h.state.deliveries.length, 0);
});

await test("404/410 remove only the expired owner's unchanged subscription; renewed or other devices survive", async () => {
  for (const statusCode of [404, 410]) {
    const h = harness(); const expired = h.addDevice();
    const other = h.addDevice(subscription("other-owner"), { owner_fingerprint: "other-owner" });
    h.state.transport = async () => { throw { statusCode }; };
    assert.deepEqual(plain(await h.core.sendNewSuggestionNotifications(suggestionId)), { sent: 0, failed: 1 });
    assert.deepEqual(h.rows[DEVICES].map(row => row.id), [other.id]);
    const deletion = h.state.queries.find(query => query.operation === "delete");
    assert.ok(deletion.filters.some(([key, value]) => key === "id" && value === expired.id));
    assert.ok(deletion.filters.some(([key, value]) => key === "owner_fingerprint" && value === h.fingerprint()));
    assert.ok(deletion.filters.some(([key, value]) => key === "last_seen_at" && value === expired.last_seen_at));
    const renewed = h.addDevice(subscription("renewed"));
    h.state.transport = async () => { renewed.last_seen_at = "2026-09-09T00:01:00.000Z"; throw { statusCode }; };
    await h.core.sendNewSuggestionNotifications(suggestionId);
    assert.ok(h.rows[DEVICES].some(row => row.id === renewed.id));
  }
});

await test("temporary delivery failure retains subscriptions and cannot abort other recipient delivery", async () => {
  const h = harness(); const bad = h.addDevice(subscription("temporary-failure")); h.addDevice(subscription("healthy"));
  h.state.transport = async sub => { if (sub.endpoint === bad.endpoint) throw { statusCode: 503 }; };
  assert.deepEqual(plain(await h.core.sendNewSuggestionNotifications(suggestionId)), { sent: 1, failed: 1 });
  assert.equal(h.rows[DEVICES].length, 2);
  const invalid = h.addDevice(subscription("invalid-stored")); invalid.endpoint = "https://169.254.169.254/latest/meta-data";
  await h.core.sendNewSuggestionNotifications(suggestionId);
  assert.ok(h.state.deliveries.every(sent => sent.subscription.endpoint !== invalid.endpoint));
});

await test("disabling is idempotent and cannot delete another owner's registration", async () => {
  const h = harness(); const sub = subscription(); h.addDevice(sub);
  const other = h.addDevice(subscription("other"), { owner_fingerprint: "other-owner" });
  for (let i = 0; i < 2; i++) assert.equal((await h.actions.disableAdminSuggestionNotificationsAction({ endpoint: sub.endpoint })).ok, true);
  assert.equal((await h.actions.disableAdminSuggestionNotificationsAction({ endpoint: other.endpoint })).ok, true);
  assert.deepEqual(h.rows[DEVICES].map(row => row.id), [other.id]); assert.equal(h.state.deliveries.length, 0);
});

await test("test sends require a saved owner subscription and enforce a thirty-second per-device cooldown", async () => {
  const h = harness(); const sub = subscription();
  assert.equal((await h.actions.sendAdminSuggestionTestAction({ endpoint: sub.endpoint })).ok, false);
  assert.equal(h.state.deliveries.length, 0); h.addDevice(sub);
  assert.equal((await h.actions.sendAdminSuggestionTestAction({ endpoint: sub.endpoint })).ok, true);
  assert.equal((await h.actions.sendAdminSuggestionTestAction({ endpoint: sub.endpoint })).ok, false);
  assert.equal(h.state.deliveries.length, 1);
  const expired = harness(); expired.addDevice(sub);
  expired.state.transport = async () => { throw { statusCode: 410 }; };
  const result = await expired.actions.sendAdminSuggestionTestAction({ endpoint: sub.endpoint });
  assert.equal(result.ok, false); assert.equal(result.code, "SUBSCRIPTION_EXPIRED");
  assert.equal(expired.rows[DEVICES].length, 0);
});

await test("missing schema, inaccessible tables or invalid configuration report SETUP_REQUIRED without false success", async () => {
  for (const table of [CONFIG, DEVICES]) for (const code of ["42P01", "42501", "PGRST205", "PGRST204"]) {
    const h = harness(); h.state.errors.set(table, { code });
    const result = await h.actions.getAdminNotificationStateAction();
    assert.equal(result.ok, false); assert.equal(result.code, "SETUP_REQUIRED");
  }
  const h = harness(); h.rows[CONFIG][0].private_key = signingKeys().privateKey;
  assert.equal((await h.actions.getAdminNotificationStateAction()).code, "SETUP_REQUIRED");
  delete h.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.equal((await h.actions.getAdminNotificationStateAction()).code, "SETUP_REQUIRED");
  assert.equal(h.state.deliveries.length, 0);
});

await test("notification navigation selects the saved suggestion's branch only after authenticated lookup", async () => {
  const h = harness(); h.rows.garden_suggestions.push({ id: suggestionId, branch_id: branchId });
  assert.equal((await h.actions.openSuggestionNotificationAction("invalid")).ok, false); assert.equal(h.state.serviceCalls, 0);
  const result = await h.actions.openSuggestionNotificationAction(suggestionId);
  assert.equal(result.ok, true); assert.ok(result.url.includes(`branch=${branchId}`)); assert.ok(result.url.endsWith(`#suggestion-${suggestionId}`));
  assert.deepEqual(h.state.branches, [branchId]); assert.deepEqual(h.state.cookiesDeleted, ["garden_admin_branch_name"]);
  h.rows.garden_suggestions = [];
  assert.equal((await h.actions.openSuggestionNotificationAction(suggestionId)).ok, false);
  assert.equal(h.state.branches.length, 1);
});

const post = { category: "suggestion", title: "PRIVATE_SUGGESTION_TITLE", body: "PRIVATE_SUGGESTION_BODY", isAnonymous: true, visibility: "private" };
await test("unauthenticated, inactive, invalid, blocked and failed student posts never schedule or send notifications", async () => {
  for (const variant of ["no-session", "inactive", "invalid", "blocked", "insert-failed"]) {
    const h = harness();
    if (variant === "no-session") h.state.student = false;
    if (variant === "inactive") h.rows.garden_students[0].is_active = false;
    if (variant === "blocked") h.rows.garden_suggestion_blocks.push({ student_id: studentId, blocked_until: null, reason: "fixture restriction" });
    if (variant === "insert-failed") h.state.errors.set("garden_suggestions:insert", { message: "fixture insert failure" });
    const result = await h.student().submitSuggestionAction({ ...post, ...(variant === "invalid" ? { title: "" } : {}) });
    assert.equal(result.ok, false, variant); assert.equal(h.rows.garden_suggestions.length, 0);
    assert.equal(h.state.after.length, 0); assert.equal(h.state.senderCalls.length, 0);
    if (variant === "no-session") assert.equal(h.state.serviceCalls, 0);
  }
});

await test("successful post schedules only its saved ID after insertion; delivery errors cannot undo the saved post", async () => {
  const h = harness(); h.state.sender = async () => { throw new Error("fixture offline push service"); };
  const result = await h.student().submitSuggestionAction(post);
  assert.equal(result.ok, true); assert.equal(h.rows.garden_suggestions.length, 1);
  assert.equal(h.rows.garden_suggestions[0].visibility, "private");
  assert.equal(h.state.senderCalls.length, 0, "notification work runs after the response");
  assert.equal(h.state.after.length, 1, "only a successful insert queues a notification");
  await h.drain(); assert.deepEqual(h.state.senderCalls, [suggestionId]);
  assert.equal(h.rows.garden_suggestions.length, 1); assert.deepEqual(h.state.revalidated, ["/me/suggest", "/admin/suggest"]);
});

await test("setup SQL limits mutations to administrator tables and revokes browser roles before service-role grants", () => {
  const sql = fs.readFileSync(path.join(root, "supabase/admin_suggestion_notifications.sql"), "utf8").replace(/--[^\n]*/g, "");
  const mutated = [...sql.matchAll(/(?:create table if not exists|alter table)\s+public\.([a-z_]+)/gi)].map(match => match[1]);
  assert.deepEqual([...new Set(mutated)].sort(), [CONFIG, DEVICES]);
  for (const table of [CONFIG, DEVICES]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, "i"));
    assert.match(sql, new RegExp(`grant select, insert, update, delete on table public\\.${table} to service_role`, "i"));
  }
  assert.doesNotMatch(sql, /create\s+policy|grant[^;]+to\s+(?:anon|authenticated|public)\b|(?:update|delete from|insert into)\s+(?:public\.)?garden_(?:students|suggestions|push_subscriptions)\b/i);
});

await test("dedicated worker opens only same-origin administrator mailbox links and never takes over student windows", async () => {
  const handlers = new Map(); const shown = []; const opened = []; const navigated = []; const focused = [];
  const origin = "https://fixture.invalid";
  let windows = [{ url: `${origin}/tree/me`, navigate: async () => assert.fail("must not navigate a student window") }];
  const self = {
    location: { origin }, addEventListener: (name, fn) => handlers.set(name, fn),
    registration: { showNotification: async (title, options) => shown.push({ title, ...plain(options) }) },
    clients: { matchAll: async () => windows, openWindow: async url => opened.push(url) },
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, "public/admin/sw.js"), "utf8"), { self, URL });
  assert.equal(handlers.has("fetch"), false, "notification worker must not intercept app traffic");
  let pending;
  handlers.get("push")({ data: { json: () => ({ url: `/tree/admin/suggest?notification=${suggestionId}` }) }, waitUntil: work => { pending = work; } });
  await pending; assert.equal(shown[0].data.url, `${origin}/tree/admin/suggest?notification=${suggestionId}`);
  for (const url of ["https://evil.invalid/tree/admin/suggest", "/tree/me", "javascript:alert(1)", `/tree/admin/suggest?notification=bad&redirect=https://evil.invalid`]) {
    handlers.get("notificationclick")({ notification: { data: { url }, close() {} }, waitUntil: work => { pending = work; } });
    await pending; assert.equal(opened.at(-1), `${origin}/tree/admin/suggest`);
  }
  windows = [{ url: `${origin}/tree/admin/students`, navigate: async url => navigated.push(url), focus: async () => focused.push(true) }];
  const previousOpened = opened.length;
  handlers.get("notificationclick")({ notification: { data: shown[0].data, close() {} }, waitUntil: work => { pending = work; } });
  await pending;
  assert.deepEqual(navigated, [`${origin}/tree/admin/suggest?notification=${suggestionId}`]);
  assert.equal(focused.length, 1); assert.equal(opened.length, previousOpened);
});

console.log(`PASS ${checks} administrator suggestion notification checks; no real services contacted.`);
