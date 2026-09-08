// Run: node scripts/test-social-retired.mjs. No database client, cookies or network are available to these tests.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let checks = 0;
function source(relative) { return fs.readFileSync(path.join(root, relative), "utf8"); }
function load(relative, configuredUrl) {
  const filename = path.join(root, relative);
  const module = { exports: {} };
  const code = ts.transpileModule(source(relative), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, fileName: filename,
  }).outputText;
  const imports = (specifier) => {
    if (specifier === "next/server") return { NextResponse: { json: (body, init) => Response.json(body, init) } };
    if (specifier === "next/navigation") return { redirect: (url) => { throw Object.assign(new Error("redirect"), { url }); } };
    if (specifier === "@/lib/social/retired") return load("src/lib/social/retired.ts", configuredUrl);
    throw new Error(`Retired routes must not import auth, database or live UI: ${specifier}`);
  };
  vm.runInNewContext(code, {
    module, exports: module.exports, require: imports, URL,
    process: { env: { NEXT_PUBLIC_MONSTER_SITE_URL: configuredUrl } },
    fetch: () => { throw new Error("Retired routes must not access a network"); },
  }, { filename });
  return module.exports;
}

const untouchedRequest = new Proxy({}, { get() { throw new Error("Retired API must not read the request or cookies"); } });
for (const route of ["src/app/api/social/route.ts", "src/app/api/social/presence/route.ts"]) {
  const handlers = load(route);
  for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
    const response = await handlers[method](untouchedRequest);
    assert.equal(response.status, 410);
    assert.match(response.headers.get("cache-control"), /no-store/);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(body.redirectTo, "https://www.themonster.kr/plaza");
    assert.equal(Object.keys(body).sort().join(","), "error,ok,redirectTo");
    checks++;
  }
}

for (const [configured, expected] of [
  [undefined, "https://www.themonster.kr/plaza"],
  ["https://preview.example/old?student_id=private#secret", "https://preview.example/plaza"],
  ["http://localhost:3200/base", "http://localhost:3200/plaza"],
  ["javascript:alert(1)", "https://www.themonster.kr/plaza"],
  ["not a URL", "https://www.themonster.kr/plaza"],
  ["https://name:password@example.com", "https://www.themonster.kr/plaza"],
]) {
  assert.equal(load("src/lib/social/retired.ts", configured).getSitePlazaUrl(), expected);
  assert.throws(() => load("src/app/me/plaza/page.tsx", configured).default(), (error) => error.url === expected);
  checks++;
}

for (const removed of [
  "src/lib/social/server.ts", "src/lib/social/policy.ts", "scripts/test-social.mjs", "scripts/test-social-schema.mjs",
  "supabase/migrations/20260908022930_social_plaza_homes.sql",
]) assert.equal(fs.existsSync(path.join(root, removed)), false, `${removed} must stay retired`);
const village = source("src/app/me/village/VillageClient.tsx");
const plazaNav = village.slice(village.indexOf('aria-label="새 광장 바로가기"'), village.indexOf("</nav>", village.indexOf('aria-label="새 광장 바로가기"')));
assert.doesNotMatch(plazaNav, /<svg\b/i);
assert.match(plazaNav, /🏘️/u);
assert.match(source("src/app/admin/plaza-preview/page.tsx"), /<PlazaClient adminMode/);
checks++;
console.log(`Passed ${checks} retired-route, redirect and architecture checks. No database or network access.`);
