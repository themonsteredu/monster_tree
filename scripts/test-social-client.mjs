// Run: node scripts/test-social-client.mjs
// Tests the real JSON helper using fake timers/network. No browser or live API.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const filename = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/lib/social/client.ts");
const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness(responder) {
  const requests = [];
  const timers = new Map();
  let id = 0;
  const window = {
    setTimeout(callback, delay) { const key = ++id; timers.set(key, { callback, delay }); return key; },
    clearTimeout(key) { timers.delete(key); },
  };
  const module = { exports: {} };
  const context = vm.createContext({ module, exports: module.exports, window, AbortController, DOMException, Promise,
    fetch: (url, init) => { requests.push({ url, init }); return responder(url, init); },
  });
  vm.runInContext(source, context, { filename });
  return {
    requests, timers, run: module.exports.fetchSocialJson,
    async timeout() {
      const waiting = [...timers.entries()];
      for (const [key, value] of waiting) {
        assert.equal(value.delay, 12000);
        timers.delete(key); value.callback();
      }
      await flush();
    },
  };
}

async function flush() { for (let i = 0; i < 25; i++) await Promise.resolve(); }
function observe(promise) {
  const result = { settled: false, value: undefined, error: undefined };
  promise.then((value) => { result.settled = true; result.value = value; }, (error) => { result.settled = true; result.error = error; });
  return result;
}
function abortable(signal) {
  return new Promise((_, reject) => {
    if (signal.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });
}
function upstreamWithCounters() {
  const controller = new AbortController();
  const added = new Set();
  const add = controller.signal.addEventListener.bind(controller.signal);
  const remove = controller.signal.removeEventListener.bind(controller.signal);
  controller.signal.addEventListener = (name, listener, options) => {
    if (name === "abort") added.add(listener);
    return add(name, listener, options);
  };
  controller.signal.removeEventListener = (name, listener, options) => {
    if (name === "abort") added.delete(listener);
    return remove(name, listener, options);
  };
  return { controller, added };
}
const response = (body, status = 200) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
let passed = 0;
let failed = 0;
async function test(name, run) {
  try { await run(); passed++; console.log(`ok - ${name}`); }
  catch (error) { failed++; console.error(`not ok - ${name}: ${error.message}`); }
}

await test("successful JSON preserves caller headers/body and forces same-origin/no-store", async () => {
  const { controller, added } = upstreamWithCounters();
  const app = harness(() => response({ ok: true, home: { theme: "cream" } }));
  const result = await app.run("/tree/api/social", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" }, signal: controller.signal, credentials: "include", cache: "force-cache" });
  assert.equal(result.home.theme, "cream");
  assert.equal(app.requests[0].init.method, "POST");
  assert.equal(app.requests[0].init.body, "{}");
  assert.equal(app.requests[0].init.headers["Content-Type"], "application/json");
  assert.equal(app.requests[0].init.credentials, "same-origin");
  assert.equal(app.requests[0].init.cache, "no-store");
  assert.notEqual(app.requests[0].init.signal, controller.signal);
  assert.equal(app.timers.size, 0);
  assert.equal(added.size, 0);
});

await test("API and application errors preserve safe messages and clean listeners", async () => {
  for (const status of [403, 200]) {
    const { controller, added } = upstreamWithCounters();
    const app = harness(() => response({ ok: false, error: "집을 비공개로 두었어요." }, status));
    await assert.rejects(app.run("/tree/api/social", { signal: controller.signal }), /집을 비공개/);
    assert.equal(app.timers.size, 0);
    assert.equal(added.size, 0);
  }
});

await test("network failures and invalid JSON reject and clear timers/listeners", async () => {
  for (const responder of [() => Promise.reject(new Error("network-test")), () => Promise.resolve({ ok: true, json: async () => { throw new SyntaxError("json-test"); } })]) {
    const { controller, added } = upstreamWithCounters();
    const app = harness(responder);
    await assert.rejects(app.run("/tree/api/social", { signal: controller.signal }));
    assert.equal(app.timers.size, 0);
    assert.equal(added.size, 0);
  }
});

await test("fetch timeout rejects after 12 seconds and clears upstream listener", async () => {
  const { controller, added } = upstreamWithCounters();
  const app = harness((url, init) => abortable(init.signal));
  const result = observe(app.run("/tree/api/social", { signal: controller.signal }));
  await app.timeout();
  assert.equal(result.settled, true);
  assert.match(result.error?.message ?? "", /연결이 오래/);
  assert.equal(app.requests[0].init.signal.aborted, true);
  assert.equal(app.timers.size, 0);
  assert.equal(added.size, 0);
});

await test("timeout stays active while the response body is loading", async () => {
  const { controller, added } = upstreamWithCounters();
  const app = harness((url, init) => Promise.resolve({ ok: true, status: 200, json: () => abortable(init.signal) }));
  const result = observe(app.run("/tree/api/social", { signal: controller.signal }));
  await flush();
  assert.equal(result.settled, false);
  assert.equal(app.timers.size, 1);
  await app.timeout();
  assert.equal(result.settled, true);
  assert.match(result.error?.message ?? "", /연결이 오래/);
  assert.equal(app.timers.size, 0);
  assert.equal(added.size, 0);
});

await test("upstream abort cancels an active request and removes its listener", async () => {
  const { controller, added } = upstreamWithCounters();
  const app = harness((url, init) => abortable(init.signal));
  const result = observe(app.run("/tree/api/social", { signal: controller.signal }));
  controller.abort();
  await flush();
  assert.equal(result.settled, true);
  assert.ok(result.error);
  assert.equal(app.requests[0].init.signal.aborted, true);
  assert.equal(app.timers.size, 0);
  assert.equal(added.size, 0);
});

await test("an already-aborted upstream signal cannot complete a request", async () => {
  const { controller, added } = upstreamWithCounters();
  controller.abort();
  const app = harness((url, init) => abortable(init.signal));
  await assert.rejects(app.run("/tree/api/social", { signal: controller.signal }));
  assert.equal(app.requests[0].init.signal.aborted, true);
  assert.equal(app.timers.size, 0);
  assert.equal(added.size, 0);
});

await test("deadline settles a body reader even if its adapter ignores abort", async () => {
  const app = harness(() => Promise.resolve({ ok: true, status: 200, json: () => new Promise(() => {}) }));
  const result = observe(app.run("/tree/api/social"));
  await flush();
  await app.timeout();
  assert.equal(result.settled, true, "aborting the signal alone left the request pending indefinitely");
  assert.ok(result.error);
  assert.equal(app.timers.size, 0);
});

await test("a late success after cancellation cannot run the caller success callback", async () => {
  let finishBody;
  let successes = 0;
  const { controller, added } = upstreamWithCounters();
  const app = harness(() => Promise.resolve({ ok: true, status: 200, json: () => new Promise((resolve) => { finishBody = resolve; }) }));
  const promise = app.run("/tree/api/social", { signal: controller.signal }).then((body) => { successes++; return body; });
  const result = observe(promise);
  await flush();
  controller.abort();
  await flush();
  assert.equal(result.settled, true);
  assert.ok(result.error);
  finishBody({ ok: true, home: { theme: "sage" } });
  await flush();
  assert.equal(successes, 0);
  assert.equal(result.value, undefined);
  assert.equal(app.timers.size, 0);
  assert.equal(added.size, 0);
});

console.log(`JSON helper checks: ${passed} passed, ${failed} failed. Fake timers/network only.`);
process.exitCode = failed ? 1 : 0;
