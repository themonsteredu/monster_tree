// Run: node scripts/test-yard-sign.mjs [optional monster-site checkout]
// Execute the actual TREE route, JWT, parsers and client JSX in isolated VMs.
// Only synthetic sessions, fake fetch and controlled timers: no env files or live services.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { SignJWT, jwtVerify } from "jose";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (file) => fs.readFileSync(path.resolve(root, file), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));
const fixtureSecret = "yard-sign-local-fixture-only-".repeat(4);
const claims = { branchId: "fixture-branch", studentLocalId: 41, loginId: "private-fixture-login", name: "테스트" };
const sign = (payload = claims, alg = "HS256", exp = "5m", secret = fixtureSecret) => new SignJWT(payload)
  .setProtectedHeader({ alg }).setIssuedAt().setExpirationTime(exp).sign(new TextEncoder().encode(secret));
const token = await sign();
const siteOrigin = "https://site.local.invalid";
const treeOrigin = "https://tree.local.invalid";

function harness({ react, clientFetch } = {}) {
  const env = { NODE_ENV: "production", JWT_SECRET: fixtureSecret, NEXT_PUBLIC_MONSTER_SITE_URL: `${siteOrigin}/ignored?x=1#hash` };
  const calls = [], deadlines = [], timers = new Map(), modules = new Map();
  let timerId = 0;
  let respond = async () => Response.json({ ok: true, signText: "내 숲속 집" });
  const network = async (url, init) => {
    calls.push({ url: String(url), init });
    return (clientFetch ?? respond)(url, init);
  };
  const window = {
    setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
  };
  const load = (relative) => {
    const filename = path.resolve(root, relative);
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} }; modules.set(filename, module);
    const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      fileName: filename,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    const imports = (specifier) => {
      if (specifier === "server-only") return {};
      if (specifier === "next/server") return { NextResponse: { json: (data, init) => Response.json(data, init) } };
      if (specifier === "jose") return { jwtVerify };
      if (specifier === "react") { assert.ok(react, "client hooks must be isolated"); return react; }
      if (specifier === "react/jsx-runtime") return require(specifier);
      if (specifier.startsWith("@/")) return load(`src/${specifier.slice(2)}.ts`);
      if (specifier.startsWith(".")) return load(path.relative(root, path.resolve(path.dirname(filename), `${specifier}.ts`)));
      throw new Error(`Unexpected import ${specifier}; database and live auth clients are forbidden.`);
    };
    vm.runInNewContext(code, {
      module, exports: module.exports, require: imports, process: { env },
      URL, Request, Response, Headers, Uint8Array, TextEncoder, TextDecoder, AbortController,
      AbortSignal: { timeout: (delay) => { const controller = new AbortController(); deadlines.push({ delay, controller }); return controller.signal; } },
      fetch: network, window,
    }, { filename });
    return module.exports;
  };
  return { env, calls, deadlines, timers, load, setResponse: (fn) => { respond = fn; } };
}

function request({ method = "GET", body, rawBody, headers = {}, cookie = token, url = `${treeOrigin}/tree/api/yard-sign`, origin = treeOrigin } = {}) {
  const out = new Headers(headers);
  if (method === "POST") {
    if (origin !== null) out.set("origin", origin);
    if (!out.has("content-type")) out.set("content-type", "application/json");
  }
  const data = rawBody ?? (body === undefined ? undefined : JSON.stringify(body));
  const req = new Request(url, { method, headers: out, ...(data !== undefined ? { body: data, duplex: "half" } : {}) });
  Object.defineProperty(req, "nextUrl", { value: new URL(url) });
  Object.defineProperty(req, "cookies", { value: { get: (name) => name === "monster_student" && cookie ? { name, value: cookie } : undefined } });
  return req;
}
async function result(response, status) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("vary"), "Cookie");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("location"), null);
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), status === 200 ? ["ok", "signText"] : ["error", "ok"]);
  assert.equal(body.ok, status === 200);
  assert.doesNotMatch(JSON.stringify(body), /private-fixture|sensitive-upstream|service_role|password|eyJhbGci/);
  return body;
}
let checks = 0;
async function test(name, run) {
  try { await run(); console.log(`ok ${++checks} - ${name}`); }
  catch (error) { console.error(`FAILED - ${name}`); throw error; }
}
const h = harness();
const route = h.load("src/app/api/yard-sign/route.ts");
const parser = h.load("src/lib/yard-sign.ts");
const invoke = (options) => route[options?.method ?? "GET"](request(options));
const reset = () => { h.calls.length = 0; h.deadlines.length = 0; h.setResponse(async () => Response.json({ ok: true, signText: "내 숲속 집" })); };

await test("actual route is a dynamic Node handler with no cached response", () => {
  assert.equal(route.runtime, "nodejs"); assert.equal(route.dynamic, "force-dynamic"); assert.equal(route.revalidate, 0);
  assert.equal(route.GET, route.POST);
});

const validTexts = ["집", " 나의 숲 🌳 ", "한글", "🌳".repeat(24), "가".repeat(24), "<b>집</b>"];
const invalidTexts = [null, undefined, false, 3, {}, [], "", "  ", "가".repeat(25), "🌳".repeat(25), " ".repeat(193) + "집"];
for (let cp = 0; cp <= 0x9f; cp++) if (cp < 0x20 || cp >= 0x7f) invalidTexts.push(`집${String.fromCodePoint(cp)}집`);
for (const cp of [0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]) invalidTexts.push(`집${String.fromCodePoint(cp)}집`);
await test("plain-text parser normalizes NFC, counts code points, rejects controls and exact-key violations", () => {
  assert.equal(parser.MAX_YARD_SIGN_LENGTH, 24);
  for (const text of validTexts) assert.equal(parser.parseYardSign(text), text.normalize("NFC").trim());
  for (const text of invalidTexts) assert.equal(parser.parseYardSign(text), null, `must reject ${JSON.stringify(text)}`);
  for (const value of [null, [], {}, { signText: "집", studentId: "other" }, { signText: "집", theme: "forest" }, "집"]) {
    assert.equal(parser.parseYardSignInput(value), null);
  }
  assert.equal(parser.parseYardSignInput({ signText: "  집  " }), "집");
});

const siteRoot = path.resolve(process.argv[2] || path.join(root, "..", "monster-site"));
if (fs.existsSync(path.join(siteRoot, "lib/plaza/policy.ts"))) {
  await test("actual SITE and TREE sign contracts agree on the complete boundary corpus", () => {
    const sitePolicy = h.load(path.join(siteRoot, "lib/plaza/policy.ts"));
    for (const text of [...validTexts, ...invalidTexts]) {
      assert.equal(sitePolicy.parseSignText(text), parser.parseYardSign(text));
      assert.equal(sitePolicy.parseSignInput({ signText: text })?.signText ?? null, parser.parseYardSignInput({ signText: text }));
    }
  });
} else console.log("SKIP cross-repository contract check: pass the monster-site checkout as argument to enable it.");

await test("absent, malformed, oversized, forged, expired and non-HS256 sessions never reach SITE", async () => {
  reset();
  for (const cookie of [null, "not-a-jwt", "a.b.c; other=leak", "a".repeat(8193), await sign(claims, "HS512"),
    await sign(claims, "HS256", 1), await sign(claims, "HS256", "5m", "wrong-fixture-secret".repeat(4)), await sign({ ...claims, studentLocalId: "41" })]) {
    await result(await invoke({ cookie }), 401);
  }
  delete h.env.JWT_SECRET;
  await result(await invoke(), 401);
  h.env.JWT_SECRET = fixtureSecret;
  assert.equal(h.calls.length, 0);
});

await test("destination ignores user URL/header/query input and forwards only the student cookie", async () => {
  reset();
  await result(await invoke({ url: `${treeOrigin}/tree/api/yard-sign?url=https://evil.invalid&studentId=other`, headers: {
    cookie: `garden_admin_key=private-fixture-admin; monster_student=${token}; another=secret`,
    authorization: "Bearer private-fixture-bearer", "x-forwarded-host": "evil.invalid", "x-forwarded-proto": "http",
  } }), 200);
  assert.equal(h.calls.length, 1);
  const { url, init } = h.calls[0];
  assert.equal(url, `${siteOrigin}/api/plaza/sign`);
  assert.deepEqual(Object.fromEntries(new Headers(init.headers)), { accept: "application/json", cookie: `monster_student=${token}` });
  assert.equal(init.method, "GET"); assert.equal(init.body, undefined);
  assert.equal(init.cache, "no-store"); assert.equal(init.redirect, "error");
  assert.equal(h.deadlines[0].delay, 10_000); assert.equal(init.signal, h.deadlines[0].controller.signal);
});

await test("forged, missing, null, noncanonical and cross-site write origins fail before fetch", async () => {
  reset();
  for (const origin of [null, "null", "https://evil.invalid", `${treeOrigin}/`, `${siteOrigin}.evil.invalid`, "https://user@tree.local.invalid", "not an origin"]) {
    await result(await invoke({ method: "POST", body: { signText: "집" }, origin,
      headers: { "x-forwarded-host": "evil.invalid", "x-forwarded-origin": origin ?? siteOrigin } }), 403);
  }
  await result(await invoke({ method: "POST", body: { signText: "집" }, headers: { "sec-fetch-site": "cross-site" } }), 403);
  assert.equal(h.calls.length, 0);
});

await test("same TREE, trusted SITE and configured Vercel origins preserve only normalized sign text", async () => {
  reset(); h.env.VERCEL_URL = "preview.local.invalid"; h.env.VERCEL_PROJECT_PRODUCTION_URL = "production.local.invalid";
  for (const origin of [treeOrigin, siteOrigin, "https://preview.local.invalid", "https://production.local.invalid"]) {
    await result(await invoke({ method: "POST", origin, body: { signText: " 한글 🌳 " }, headers: { "sec-fetch-site": "same-site" } }), 200);
    const init = h.calls.at(-1).init;
    assert.equal(init.body, JSON.stringify({ signText: "한글 🌳" }));
    assert.deepEqual(Object.fromEntries(new Headers(init.headers)), { accept: "application/json", "content-type": "application/json", cookie: `monster_student=${token}`, origin: siteOrigin });
  }
  delete h.env.VERCEL_URL; delete h.env.VERCEL_PROJECT_PRODUCTION_URL;
});

await test("wrong media types and invalid JSON payloads cannot cause writes", async () => {
  reset();
  for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data", ""]) {
    await result(await invoke({ method: "POST", body: { signText: "집" }, headers: { "content-type": type } }), 415);
  }
  for (const body of [null, [], {}, { signText: "집", studentId: "other" }, { signText: "집", allowVisits: true }, { signText: "\n집" }, { signText: "🌳".repeat(25) }]) {
    await result(await invoke({ method: "POST", body }), 400);
  }
  for (const rawBody of ["{", "", new Uint8Array([0xc3, 0x28])]) await result(await invoke({ method: "POST", rawBody }), 400);
  assert.equal(h.calls.length, 0);
});

await test("request length is checked both by header and actual streamed bytes", async () => {
  reset();
  for (const length of ["1025", "-1", "not-a-number", "1e3"]) {
    await result(await invoke({ method: "POST", body: { signText: "집" }, headers: { "content-length": length } }), 413);
  }
  const oversized = `${" ".repeat(1025)}${JSON.stringify({ signText: "집" })}`;
  for (const headers of [{}, { "content-length": "1" }]) await result(await invoke({ method: "POST", rawBody: oversized, headers }), 413);
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(600)); controller.enqueue(new Uint8Array(600)); }, cancel() { cancelled = true; } });
  await result(await invoke({ method: "POST", rawBody: stream }), 413);
  assert.equal(cancelled, true); assert.equal(h.calls.length, 0);
});

await test("success returns only normalized public text without upstream headers or private fields", async () => {
  reset(); h.setResponse(async () => Response.json({ ok: true, signText: "  나의 집  ", studentId: "private-fixture-id", password: "sensitive-upstream" }, {
    headers: { "set-cookie": "admin=sensitive-upstream", location: "https://evil.invalid", "x-private": "sensitive-upstream" },
  }));
  const response = await invoke(); assert.equal(response.headers.get("x-private"), null);
  assert.deepEqual(await result(response, 200), { ok: true, signText: "나의 집" });
});

await test("malformed, non-JSON, oversized and invalid upstream success bodies fail closed", async () => {
  reset();
  const responses = [
    () => new Response("sensitive-upstream", { headers: { "content-type": "text/html" } }),
    () => new Response("{", { headers: { "content-type": "application/json" } }),
    () => new Response(new Uint8Array([0xc3, 0x28]), { headers: { "content-type": "application/json" } }),
    () => Response.json({ ok: true, signText: "집" }, { headers: { "content-length": "1025" } }),
    () => new Response(" ".repeat(1025), { headers: { "content-type": "application/json", "content-length": "1" } }),
    ...[null, [], "text", { ok: false, signText: "집" }, { ok: true }, { ok: true, signText: "\n집" }, { ok: true, signText: "가".repeat(25) }].map((value) => () => Response.json(value)),
  ];
  for (const response of responses) { h.setResponse(response); await result(await invoke(), 503); }
});

await test("upstream failures map safe statuses and never disclose upstream diagnostics", async () => {
  reset();
  for (const status of [301, 302, 307, 308, 400, 401, 403, 404, 413, 415, 429, 500, 503]) {
    h.setResponse(async () => new Response("sensitive-upstream service_role password", { status, headers: { location: "https://evil.invalid" } }));
    await result(await invoke(), [400, 401, 403, 413, 415, 429].includes(status) ? status : 503);
  }
  h.setResponse(async (_url, init) => { assert.equal(init.redirect, "error"); throw new TypeError("sensitive-upstream redirected or network failed"); });
  await result(await invoke(), 503);
});

await test("upstream deadline cancels a stalled fetch and a stalled response body", async () => {
  for (const phase of ["fetch", "body"]) {
    reset(); let entered;
    const ready = new Promise((resolve) => { entered = resolve; });
    h.setResponse(async (_url, { signal }) => {
      entered();
      if (phase === "fetch") return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("sensitive-upstream timeout")), { once: true }));
      return new Response(new ReadableStream({ start(controller) { signal.addEventListener("abort", () => controller.error(new Error("sensitive-upstream timeout")), { once: true }); } }), { headers: { "content-type": "application/json" } });
    });
    const pending = invoke(); await ready;
    assert.equal(h.deadlines.at(-1).delay, 10_000); h.deadlines.at(-1).controller.abort();
    await result(await pending, 503);
  }
});

await test("only configured destinations are used and HTTP is forbidden outside development", async () => {
  reset(); h.env.NEXT_PUBLIC_MONSTER_SITE_URL = "http://localhost:3200/path";
  await result(await invoke(), 503); assert.equal(h.calls.length, 0);
  h.env.NODE_ENV = "development"; await result(await invoke(), 200);
  assert.equal(h.calls.at(-1).url, "http://localhost:3200/api/plaza/sign");
  h.env.NODE_ENV = "production";
  for (const configured of ["javascript:alert(1)", "https://user:pass@evil.invalid", "not a URL"]) {
    h.env.NEXT_PUBLIC_MONSTER_SITE_URL = configured; await result(await invoke(), 200);
    assert.equal(h.calls.at(-1).url, "https://www.themonster.kr/api/plaza/sign");
  }
  h.env.NEXT_PUBLIC_MONSTER_SITE_URL = siteOrigin;
});

function client({ adminMode = false, fetch } = {}) {
  const slots = [], effects = [];
  let cursor = 0, tree;
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }]; },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useId() { const index = cursor++; return `fixture-id-${index}`; },
    useCallback(fn, deps) { const index = cursor++; const old = slots[index];
      if (!old || deps.some((value, i) => value !== old.deps[i])) slots[index] = { fn, deps }; return slots[index].fn; },
    useEffect(fn, deps) { const index = cursor++; const old = slots[index];
      if (!old || deps.some((value, i) => value !== old.deps[i])) { old?.cleanup?.(); slots[index] = { deps }; effects.push(() => { slots[index].cleanup = fn(); }); } },
  };
  const ctx = harness({ react: hooks, clientFetch: fetch });
  const Component = ctx.load("src/features/garden/yard/YardSign.tsx").default;
  const render = () => { cursor = 0; tree = Component({ adminMode }); return tree; };
  const find = (predicate) => {
    const visit = (node) => { if (!node || typeof node !== "object") return null;
      if (predicate(node)) return node;
      for (const child of [node.props?.children].flat(Infinity)) { const found = visit(child); if (found) return found; }
      return null; };
    const match = visit(tree); assert.ok(match, "expected rendered element"); return match;
  };
  render();
  return { ...ctx, render, find, html: () => renderToStaticMarkup(tree), mount: () => { for (const effect of effects.splice(0)) effect(); },
    unmount: () => { for (const value of slots) value?.cleanup?.(); },
    input: (value) => { find((el) => el.type === "input").props.onChange({ target: { value } }); render(); },
    submit: () => find((el) => el.type === "form").props.onSubmit({ preventDefault() {} }),
  };
}
const flush = async () => { for (let i = 0; i < 12; i++) await new Promise((resolve) => setImmediate(resolve)); };

await test("admin preview mounts, edits and renders escaped sign text without any network", async () => {
  const ui = client({ adminMode: true, fetch: async () => { throw new Error("admin preview must never fetch"); } });
  ui.mount(); await flush(); ui.render();
  assert.equal(ui.find((el) => el.type === "button").props.disabled, false);
  ui.input("<b>내 집</b>"); await ui.submit(); ui.render();
  assert.match(ui.html(), /&lt;b&gt;내 집&lt;\/b&gt;/); assert.doesNotMatch(ui.html(), /<b>내 집/);
  assert.match(ui.html(), /실제 기록은 저장하지 않아요/);
  assert.equal(ui.calls.length, 0); assert.equal(ui.timers.size, 0); ui.unmount();
});

await test("student client uses same-origin no-store requests, validates draft and keeps normalized saved text", async () => {
  const ui = client({ fetch: async (_url, init) => Response.json({ ok: true, signText: init.method === "POST" ? JSON.parse(init.body).signText : "처음 간판" }) });
  ui.mount(); await flush(); ui.render();
  assert.match(ui.html(), /처음 간판/);
  ui.input("\n집"); await ui.submit(); assert.equal(ui.calls.length, 1);
  ui.input(" 한글 🌳 "); await ui.submit(); ui.render();
  assert.match(ui.html(), /한글 🌳/); assert.match(ui.html(), /간판 문구를 저장했어요/);
  assert.equal(ui.calls.length, 2);
  for (const { url, init } of ui.calls) { assert.equal(url, "/tree/api/yard-sign"); assert.equal(init.credentials, "same-origin"); assert.equal(init.cache, "no-store"); }
  assert.deepEqual(plain(JSON.parse(ui.calls[1].init.body)), { signText: "한글 🌳" });
  assert.equal(ui.timers.size, 0); ui.unmount();
});

await test("mobile load timeout and unmount abort leave a retry path without leaking timers", async () => {
  const stalled = async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });
  const ui = client({ fetch: stalled }); ui.mount();
  assert.equal(ui.timers.size, 1); const timer = [...ui.timers.values()][0]; assert.equal(timer.delay, 15_000);
  timer.fn(); await flush(); ui.render(); assert.match(ui.html(), /다시 연결/); assert.equal(ui.timers.size, 0);
  ui.unmount();
  const leaving = client({ fetch: stalled }); leaving.mount(); leaving.unmount(); await flush();
  assert.equal(leaving.calls[0].init.signal.aborted, true); assert.equal(leaving.timers.size, 0);
});

await test("mobile save timeout covers response JSON, retains draft and re-enables submission", async () => {
  const ui = client({ fetch: async (_url, init) => {
    if (init.method !== "POST") return Response.json({ ok: true, signText: "원래 간판" });
    return { ok: true, json: () => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })) };
  } });
  ui.mount(); await flush(); ui.render(); ui.input("새 간판");
  const pending = ui.submit(); await flush(); ui.render();
  assert.equal(ui.find((el) => el.type === "button" && el.props.type === "submit").props.disabled, true);
  assert.equal(ui.timers.size, 1); [...ui.timers.values()][0].fn(); await pending; ui.render();
  assert.match(ui.html(), /연결이 오래 걸려요/); assert.equal(ui.find((el) => el.type === "input").props.value, "새 간판");
  assert.equal(ui.find((el) => el.type === "button" && el.props.type === "submit").props.disabled, false);
  assert.equal(ui.timers.size, 0); ui.unmount();
});

console.log(`Passed ${checks} yard-sign route, security, contract and rendered-client regression checks. No live services used.`);
