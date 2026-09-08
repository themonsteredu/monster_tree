// Run: node scripts/test-social-presence.mjs
// Deterministic network/lifecycle tests of the real presence hook, using a small
// hook harness and fake clock. This is not a browser or physical-phone test.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hookFile = path.join(root, "src/features/social/usePlazaPresence.ts");
const hookSource = ts.transpileModule(fs.readFileSync(hookFile, "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function harness(responder, { enabled = true, space = "plaza" } = {}) {
  let now = 100_000;
  let timerId = 0;
  let cursor = 0;
  let dirty = false;
  let result;
  let params = [space, enabled, { x: 50, y: 70 }];
  const timers = new Map();
  const slots = [];
  const effects = [];
  const requests = [];
  const document = new EventTarget();
  document.hidden = false;
  const navigator = { onLine: true };
  const window = new EventTarget();
  const schedule = (callback, delay, repeat = false) => {
    const id = ++timerId;
    timers.set(id, { callback, due: now + Math.max(1, delay), delay: Math.max(1, delay), repeat });
    return id;
  };
  window.setTimeout = (callback, delay) => schedule(callback, delay);
  window.clearTimeout = (id) => timers.delete(id);
  window.setInterval = (callback, delay) => schedule(callback, delay, true);
  window.clearInterval = (id) => timers.delete(id);
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === "function" ? initial() : initial };
      return [slots[index].value, (next) => {
        const value = typeof next === "function" ? next(slots[index].value) : next;
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; }
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect(effect, dependencies) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || !dependencies || dependencies.some((value, i) => !Object.is(value, previous.dependencies?.[i]))) {
        slots[index] = { ...previous, dependencies };
        effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = effect(); });
      }
    },
  };
  const context = vm.createContext({
    exports: {}, module: { exports: {} },
    require: (name) => {
      if (name === "react") return react;
      if (name === "@/lib/social/model") return { SOCIAL_IDLE_HEARTBEAT_MS: 8000, SOCIAL_MOVE_THROTTLE_MS: 1500, SOCIAL_POLL_MS: 3000 };
      throw new Error(`Unexpected hook dependency: ${name}`);
    },
    window, document, navigator, AbortController, AbortSignal, URL, URLSearchParams, DOMException, console,
    Date: class extends Date { static now() { return now; } },
    setTimeout: window.setTimeout, clearTimeout: window.clearTimeout,
    setInterval: window.setInterval, clearInterval: window.clearInterval,
    fetch: (url, options = {}) => {
      const call = { url, options, at: now };
      requests.push(call);
      return responder(call, requests.length);
    },
  });
  context.exports = context.module.exports;
  vm.runInContext(hookSource, context, { filename: hookFile });
  const hook = context.module.exports.usePlazaPresence;
  function render() {
    cursor = 0;
    dirty = false;
    result = hook(...params);
    while (effects.length) effects.shift()();
  }
  async function flush() {
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
      if (dirty) render();
    }
  }
  async function advance(ms) {
    const target = now + ms;
    let guard = 0;
    while (true) {
      if (++guard > 5000) throw new Error("Timer loop did not settle");
      const next = [...timers.entries()].filter(([, timer]) => timer.due <= target).sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) break;
      const [id, timer] = next;
      now = timer.due;
      if (timer.repeat) timer.due += timer.delay; else timers.delete(id);
      timer.callback();
      await flush();
    }
    now = target;
    await flush();
  }
  render();
  return {
    requests, flush, advance, get result() { return result; },
    async visibility(hidden) { document.hidden = hidden; document.dispatchEvent(new Event("visibilitychange")); await flush(); },
    async online(value) { navigator.onLine = value; window.dispatchEvent(new Event(value ? "online" : "offline")); await flush(); },
    async move(position) { params = [params[0], params[1], position]; render(); await flush(); },
    async enter(nextSpace) { params = [nextSpace, params[1], params[2]]; render(); await flush(); },
    // Inspect the exact value seen by the parent's effects in the new commit,
    // before effect-triggered state resets have caused another render.
    firstRender(nextSpace, nextEnabled = params[1]) {
      params = [nextSpace, nextEnabled, params[2]];
      render();
      return result;
    },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

const ok = () => Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, players: [] }) });
const fail = (status) => Promise.resolve({ ok: false, status, json: async () => ({ ok: false, error: "test" }) });
function hangUntilAborted(call) {
  return new Promise((resolve, reject) => {
    call.options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });
}

let passed = 0;
let failed = 0;
async function test(name, run) {
  try { await run(); passed++; console.log(`ok - ${name}`); }
  catch (error) { failed++; console.error(`not ok - ${name}: ${error.message}`); }
}

await test("admin/local preview makes no presence requests", async () => {
  const app = harness(ok, { enabled: false });
  await app.advance(60_000);
  assert.equal(app.requests.length, 0);
  app.unmount();
});

await test("normal polling bounds idle writes and sends movement without overlap", async () => {
  const app = harness(ok);
  await app.flush();
  await app.advance(9000);
  const writes = app.requests.filter((call) => call.options.method === "POST");
  assert.equal(writes.length, 2);
  assert.ok(writes[1].at - writes[0].at >= 8000);
  await app.move({ x: 55, y: 70 });
  await app.advance(1500);
  assert.equal(app.requests.filter((call) => call.options.method === "POST").length, 3);
  assert.equal(app.result.status, "online");
  app.unmount();
});

await test("settled sessions make no hidden/offline requests and resume on return", async () => {
  const app = harness(ok);
  await app.flush();
  const beforeHidden = app.requests.length;
  await app.visibility(true);
  await app.advance(30_000);
  assert.equal(app.requests.length, beforeHidden);
  await app.visibility(false);
  assert.ok(app.requests.length > beforeHidden);
  await app.online(false);
  const beforeOffline = app.requests.length;
  await app.advance(30_000);
  assert.equal(app.requests.length, beforeOffline);
  await app.online(true);
  assert.ok(app.requests.length > beforeOffline);
  app.unmount();
});

await test("private-home denial clears stale players and changes room cleanly", async () => {
  const app = harness((call) => call.url.includes("space=home") || String(call.options.body).includes("home:") ? fail(403) : ok(), { space: "home:10000000-0000-4000-8000-000000000002" });
  await app.flush();
  assert.equal(app.result.denied, true);
  assert.equal(app.result.players.length, 0);
  await app.enter("plaza");
  assert.equal(app.result.denied, false);
  assert.equal(app.result.status, "online");
  app.unmount();
});

await test("a stalled mobile request times out and retries instead of locking pending forever", async () => {
  const app = harness((call, index) => index === 1 ? hangUntilAborted(call) : ok());
  await app.advance(30_000);
  assert.ok(app.requests.length >= 2, "only the original hung request exists after 30 seconds");
  assert.equal(app.result.status, "online");
  app.unmount();
});

await test("hiding during a heartbeat prevents a following hidden-tab read", async () => {
  let resolveFirst;
  const app = harness((call, index) => index === 1 ? new Promise((resolve) => { resolveFirst = resolve; }) : ok());
  await app.visibility(true);
  resolveFirst({ ok: true, status: 200 });
  await app.flush();
  assert.equal(app.requests.length, 1, "a GET request started after the document became hidden");
  app.unmount();
});

await test("unauthorized sessions stop polling until a new authenticated mount", async () => {
  const app = harness(() => fail(401));
  await app.flush();
  const before = app.requests.length;
  await app.advance(30_000);
  assert.equal(app.requests.length, before, "expired-cookie requests repeat forever");
  app.unmount();
});

await test("timed-out response bodies recover under the same request deadline", async () => {
  let blockedRead = false;
  const app = harness((call) => {
    if (!call.options.method && !blockedRead) {
      blockedRead = true;
      return Promise.resolve({ ok: true, status: 200, json: () => new Promise(() => {}) });
    }
    return ok();
  });
  await app.flush();
  await app.advance(30_000);
  assert.equal(app.result.status, "online");
  assert.ok(app.requests.length > 2);
  app.unmount();
});

await test("late reads from an old room cannot overwrite the current room", async () => {
  let resolveOldRead;
  const app = harness((call, index) => index === 2
    ? new Promise((resolve) => { resolveOldRead = resolve; })
    : ok());
  await app.flush();
  await app.enter("home:10000000-0000-4000-8000-000000000002");
  assert.equal(app.result.status, "online");
  resolveOldRead({ ok: true, status: 200, json: async () => ({ ok: true, players: [{ id: "stale-plaza-player" }] }) });
  await app.flush();
  assert.equal(app.result.players.length, 0);
  assert.equal(app.result.status, "online");
  app.unmount();
});

await test("transient errors back off and lifecycle cleanup stops every request", async () => {
  const app = harness(() => fail(503));
  await app.flush();
  await app.advance(30_000);
  assert.ok(app.requests.length <= 5, "503 responses are retried too aggressively");
  const count = app.requests.length;
  app.unmount();
  await app.advance(60_000);
  assert.equal(app.requests.length, count);
});

await test("the first render in a different room never exposes the previous denial", async () => {
  const app = harness(() => fail(403), { space: "home:10000000-0000-4000-8000-000000000002" });
  await app.flush();
  assert.equal(app.result.denied, true);
  const first = app.firstRender("home:10000000-0000-4000-8000-000000000003");
  assert.equal(first.denied, false, "parent would close the new room from the old denied flag");
  assert.equal(first.status, "connecting");
  assert.equal(first.players.length, 0);
  app.unmount();
});

await test("the first render of a new space never exposes old players or online status", async () => {
  const app = harness(() => Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, players: [{ id: "old-plaza-player" }] }) }));
  await app.flush();
  assert.equal(app.result.players.length, 1);
  assert.equal(app.result.status, "online");
  const first = app.firstRender("home:10000000-0000-4000-8000-000000000002");
  assert.equal(first.players.length, 0, "old-space players appeared during the new room commit");
  assert.equal(first.status, "connecting");
  assert.equal(first.denied, false);
  app.unmount();
});

await test("disabling presence masks live data before its cleanup effect runs", async () => {
  const app = harness(() => Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, players: [{ id: "live-player" }] }) }));
  await app.flush();
  const first = app.firstRender("plaza", false);
  assert.equal(first.players.length, 0);
  assert.equal(first.status, "connecting");
  assert.equal(first.denied, false);
  app.unmount();
});

console.log(`Presence lifecycle checks: ${passed} passed, ${failed} failed. Fake timers only; no browser/device claim.`);
process.exitCode = failed ? 1 : 0;
