// Real save action and catalogue, with isolated JWT/database adapters. No live services.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
let authenticated = true, active = true, owned = true, fail = false, stored = null;
let calls = [];
function db() { return { from(table) {
  const call = { table, ops: [] }; calls.push(call);
  const query = new Proxy({}, { get(_target, name) {
    const result = () => table === "garden_students" ? { data: fail && call.ops.some(([n]) => n === "update") ? null : { id: "self", is_active: active, scene_layout: stored }, error: null }
      : { data: table === "decoration_items" ? [{ id: "paid", name: "유료", price: 10 }] : owned ? [{ decoration_item_id: "paid" }] : [], error: null };
    if (name === "then") return (resolve) => resolve(result());
    return (...args) => { call.ops.push([name, ...args]); return name === "maybeSingle" ? Promise.resolve(result()) : query; };
  }}); return query;
}}; }
const cache = new Map();
function load(file) {
  const full = path.join(root, file);
  if (cache.has(full)) return cache.get(full).exports;
  const module = { exports: {} }; cache.set(full, module);
  const code = ts.transpileModule(fs.readFileSync(full, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  function local(id) {
    if (id === "next/headers") return { cookies: async () => ({ get: () => ({ value: "test" }) }) };
    if (id === "next/cache") return { revalidatePath() {} };
    if (id.endsWith("student-jwt")) return { STUDENT_COOKIE_NAME: "test", verifyStudentJwt: async () => authenticated ? { branchId: "branch", studentLocalId: 7 } : null };
    if (id.endsWith("supabase/server")) return { createSupabaseServiceClient: db };
    if (id === "@/lib/avatar-v2") return {};
    if (id.startsWith("@/") || id.startsWith(".")) {
      const target = id.startsWith("@/") ? path.join(root, "src", id.slice(2)) : path.resolve(path.dirname(full), id);
      for (const ext of [".ts", ".tsx"]) if (fs.existsSync(target + ext)) return load(path.relative(root, target + ext));
    }
    return require(id);
  }
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: full })(local, module, module.exports);
  return module.exports;
}
const { replaceYardLayoutAction: save } = load("src/app/me/actions.ts");
const { DECOR_CATALOG } = load("src/lib/decor-catalog.ts");
const { yardPlacements } = load("src/lib/yard-decoration.ts");
const { DecorArt } = load("src/features/social/DecorArt.tsx");
const item = { decorationItemId: "builtin:tent", instanceId: "one", positionX: 50, positionY: 60, widthPercent: 22, rotation: 135, zIndex: 4, flipX: true };
const scene = { tree: { x: 40, y: 70, width: 30, rotation: 180, flipX: true }, avatar: { x: 60, y: 75, width: 20 } };
const writes = () => calls.filter(call => call.ops.some(([name]) => ["update", "insert", "delete", "upsert"].includes(name)));
const reset = () => { authenticated = active = owned = true; fail = false; stored = null; calls = []; };
assert.equal(DECOR_CATALOG.length, 36);
assert.equal(new Set(DECOR_CATALOG.map(item => item.id)).size, 36);
for (const entry of DECOR_CATALOG) assert.match(renderToStaticMarkup(React.createElement(DecorArt, { id: entry.id, basePath: "/tree" })), /\/tree\/block-world\/decor-atlas-v2.png/);
reset();
assert.equal((await save({ layoutVersion: 2, items: [item, { ...item, instanceId: "two", flipX: false }], sceneLayout: scene })).ok, true);
assert.equal(writes().length, 1);
const write = writes()[0];
assert.equal(write.table, "garden_students");
const payload = write.ops.find(([name]) => name === "update")[1];
assert.deepEqual(Object.keys(payload), ["scene_layout"]);
assert.equal(payload.scene_layout.yard.length, 2);
assert.equal(payload.scene_layout.yard[0].flipX, true);
assert.equal(payload.scene_layout.yard[0].rotation, 135);
assert.equal(payload.scene_layout.tree.rotation, 180);
assert.ok(write.ops.some(op => op[0] === "eq" && op[1] === "id" && op[2] === "self"));
assert.ok(!calls.some(call => call.table === "student_yard_layout"));
assert.equal(yardPlacements([{ id: "legacy" }], { yard: [] }).length, 0);
assert.equal(yardPlacements([{ id: "legacy" }], null)[0].id, "legacy");
for (const args of [
  { items: [item, item], sceneLayout: scene },
  { items: [{ ...item, flipX: "yes" }], sceneLayout: scene },
  { items: [null], sceneLayout: scene },
  { items: [item], sceneLayout: { tree: { ...scene.tree, rotation: 181 } } },
  { items: [item], sceneLayout: { avatar: { ...scene.avatar, width: NaN } } },
  { items: Array.from({ length: 201 }, (_,i) => ({ ...item, instanceId: String(i) })), sceneLayout: scene },
  { items: [{ ...item, decorationItemId: "builtin:unknown" }], sceneLayout: scene },
]) { reset(); assert.equal((await save({ layoutVersion: 2, ...args })).ok, false); assert.equal(writes().length, 0); }
reset(); owned = false;
assert.equal((await save({ layoutVersion: 2, items: [{ ...item, decorationItemId: "paid" }], sceneLayout: scene })).ok, false); assert.equal(writes().length, 0);
reset(); active = false;
assert.equal((await save({ layoutVersion: 2, items: [item], sceneLayout: scene })).ok, false); assert.equal(writes().length, 0);
reset(); authenticated = false;
assert.equal((await save({ layoutVersion: 2, items: [item], sceneLayout: scene })).ok, false); assert.equal(calls.length, 0);
reset(); stored = { yard: [] };
assert.equal((await save({ items: [], sceneLayout: scene })).ok, false); assert.equal(writes().length, 0);
reset(); fail = true;
assert.equal((await save({ layoutVersion: 2, items: [item], sceneLayout: scene })).ok, false);
console.log("PASS: 36 rendered props; atomic save and duplicates; flips/rotation; legacy fallback and empty scene; invalid input; ownership; inactive/expired sessions; stale clients; failed writes.");
