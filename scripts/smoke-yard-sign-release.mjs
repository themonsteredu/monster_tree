// Public, read-only release checks: no student cookies, account data or mutations.
import assert from "node:assert/strict";

const base = new URL(process.argv[2] || "https://www.themonster.kr");
if (!["https:", "http:"].includes(base.protocol) || base.username || base.password) throw new Error("Invalid origin");
let checks = 0;
for (const endpoint of ["/tree/api/yard-sign"]) {
  const response = await fetch(new URL(endpoint, base), { redirect: "manual" });
  assert.equal(response.status, 401, `${endpoint}: anonymous access must be denied`);
  assert.match(response.headers.get("cache-control") || "", /private.*no-store/);
  assert.match(response.headers.get("vary") || "", /Cookie/i);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(Object.hasOwn(body, "signText"), false);
  checks++;
}
const preview = await fetch(new URL("/tree/admin/yard-preview", base));
assert.equal(preview.status, 200);
const html = await preview.text();
assert.doesNotMatch(html, /data-forest-yard|간판 문구 바꾸기|테스트 모드 — 기록 저장 안 됨/);
checks++;
const asset = await fetch(new URL("/tree/block-world/forest-yard-v1.webp", base));
assert.equal(asset.status, 200);
assert.match(asset.headers.get("content-type") || "", /image\/webp/);
const bytes = (await asset.arrayBuffer()).byteLength;
assert.ok(bytes > 0 && bytes < 400_000, `background budget exceeded: ${bytes}`);
checks++;
console.log(`Passed ${checks} public forest-yard checks on ${base.origin}; background ${bytes} bytes. No live student writes.`);
