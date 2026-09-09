// Run: node scripts/test-yard-background-scope.mjs
// Real modules with synthetic rows, mocked auth/storage/cache and SSR only.
// No env files, real uploads, live databases, student requests or network.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { File } from "node:buffer";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");
const fixtureUrl = "https://assets.local.invalid/storage/v1/object/public/yard/fixture.webp";
const setting = { id: "fixture-yard", background_image: fixtureUrl, is_active: true, updated_at: "2026-01-01T00:00:00Z" };
const student = { id: "fixture-student", branch_id: "fixture-branch", total_points: 10, is_active: true, scene_layout: null };
let mode = "admin", authenticated = false, authGate = null, factoryCalls = 0;
let queries = [], storageCalls = [], invalidated = [];
const modules = new Map();
const environment = { NEXT_PUBLIC_SUPABASE_URL: "https://db.local.invalid", NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-not-a-key" };
const noNetwork = () => { throw new Error("Network is forbidden in this regression"); };
const noopComponent = () => null;
function fakeDb() {
  factoryCalls++;
  return {
    from(table) {
      const call = { table, operations: [] }; queries.push(call);
      if (mode === "admin") assert.equal(table, "yard_settings", "admin background cannot access student tables");
      const query = {};
      for (const method of ["select", "eq", "in", "gte", "order", "limit", "maybeSingle", "update", "insert"])
        query[method] = (...args) => { call.operations.push([method, ...args]); return query; };
      query.then = (resolve, reject) => Promise.resolve().then(() => {
        const write = call.operations.find(([name]) => ["update", "insert"].includes(name));
        if (write) {
          assert.equal(mode, "admin"); assert.equal(table, "yard_settings");
          assert.ok(Object.keys(write[1]).every((key) => ["background_image", "updated_at"].includes(key)));
          return { data: null, error: null };
        }
        if (table === "yard_settings") return { data: setting, error: null };
        if (table === "garden_students") return { data: [student], error: null };
        assert.ok(["garden_tree_stages", "garden_harvests", "decoration_items", "student_yard_layout", "student_weather_setting", "student_monsters"].includes(table), `unexpected TV table ${table}`);
        return { data: [], error: null };
      }).then(resolve, reject);
      return query;
    },
    storage: { from(bucket) {
      assert.equal(mode, "admin"); assert.equal(bucket, "yard");
      return {
        upload: async (...args) => { storageCalls.push(["upload", ...args]); return { error: null }; },
        remove: async (...args) => { storageCalls.push(["remove", ...args]); return { error: null }; },
        getPublicUrl: (file) => ({ data: { publicUrl: `https://assets.local.invalid/storage/v1/object/public/yard/${file}` } }),
      };
    } },
  };
}
function load(relative) {
  const filename = path.resolve(root, relative);
  if (modules.has(filename)) return modules.get(filename).exports;
  const module = { exports: {} }; modules.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const imports = (name) => {
    if (name === "react" || name === "react/jsx-runtime") return require(name);
    if (name === "next/link") return { default: ({ children, ...props }) => createElement("a", props, children), __esModule: true };
    if (name === "next/cache") return { revalidatePath: (route) => invalidated.push(route) };
    if (name === "@/lib/supabase/server") return { createSupabaseServiceClient: fakeDb, createSupabaseServerAnonClient: fakeDb };
    if (name === "@/lib/branch") return { getBranchId: () => "fixture-branch" };
    if (name === "../auth") return { isAdminAuthenticated: async () => { if (authGate) await authGate; return authenticated; } };
    if (name === "../LoginForm") return { LoginForm: () => createElement("div", { "data-login-required": true }) };
    if (name === "../AdminHeader") return { AdminHeader: ({ title }) => createElement("h1", null, title) };
    if (name.endsWith("/TVScreen")) return { TVScreen: ({ yardBackgroundImage }) => createElement("div", { "data-tv-background": yardBackgroundImage }) };
    if (name.endsWith("/TVWakeLock")) return { TVWakeLock: noopComponent };
    if (name.endsWith("/TVViewport")) return { TVViewport: noopComponent };
    if (name.endsWith("/TVAutoRefresh")) return { TVAutoRefresh: ({ children }) => children };
    if (name === "@/features/garden/background/BackgroundCanvas") return { BackgroundCanvas: ({ config }) => createElement("div", { "data-personal-background": JSON.stringify(config) }) };
    for (const component of ["AppleTree", "AvatarFigurePreloaded", "WeatherEffect", "YardLayer"])
      if (name.endsWith(`/${component}`)) return { [component]: noopComponent };
    if (name.startsWith("@/")) return load(`src/${name.slice(2)}.ts`);
    if (name.startsWith(".")) {
      const base = path.resolve(path.dirname(filename), name);
      return load(fs.existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`);
    }
    throw new Error(`Unexpected import ${name}: live services are forbidden`);
  };
  vm.runInNewContext(code, { module, exports: module.exports, require: imports,
    process: { env: environment }, Buffer, File, FormData, fetch: noNetwork }, { filename });
  return module.exports;
}
const reset = (nextMode = "admin") => { mode = nextMode; factoryCalls = 0; queries = []; storageCalls = []; invalidated = []; };
const nodes = (file, predicate) => {
  const ast = ts.createSourceFile(file, source(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = []; const visit = (node) => { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); }; visit(ast); return found;
};
let checks = 0;
async function test(name, run) { try { await run(); console.log(`ok ${++checks} - ${name}`); } catch (error) { console.error(`FAILED - ${name}`); throw error; } }

await test("personal yard no longer queries or accepts the obsolete global setting", () => {
  const globalQueries = nodes("src/app/me/page.tsx", (node) => ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === "from" && node.arguments[0]?.text === "yard_settings");
  assert.equal(globalQueries.length, 0);
  for (const file of ["src/app/me/page.tsx", "src/app/me/MeTreeClient.tsx"]) {
    assert.equal(nodes(file, (node) => ts.isIdentifier(node) && node.text === "yardBackgroundImage").length, 0);
  }
  assert.match(source("src/app/me/MeTreeClient.tsx"), /usesForestBackground\(row\?\.background\)/);
});

await test("actual TV loader retains global background and branch-scoped read-only loading", async () => {
  reset("tv");
  const data = await load("src/lib/tv-data.ts").loadTvData("fixture-branch");
  assert.equal(data.yardBackgroundImage, fixtureUrl);
  assert.equal(queries.filter((call) => call.table === "yard_settings").length, 1);
  assert.ok(queries.some((call) => call.table === "garden_students" && call.operations.some(([op, key, value]) => op === "eq" && key === "branch_id" && value === "fixture-branch")));
  assert.equal(storageCalls.length, 0);
  assert.ok(queries.every((call) => !call.operations.some(([op]) => ["update", "insert"].includes(op))));
});

await test("both actual TV pages still pass the loaded global background to TVScreen", async () => {
  reset("tv");
  for (const file of ["src/app/page.tsx", "src/app/tv/page.tsx"]) {
    const page = load(file);
    assert.equal(page.dynamic, "force-dynamic"); assert.equal(page.revalidate, 0);
    const html = renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({ branch: "fixture-branch" }) }));
    assert.match(html, /data-tv-background="https:\/\/assets\.local\.invalid\/storage\/v1\/object\/public\/yard\/fixture\.webp"/);
  }
  assert.ok(nodes("src/app/TVScreen.tsx", (node) => ts.isJsxAttribute(node) && node.name.text === "yardBackgroundImage"
    && node.initializer?.expression?.getText() === "yardBackgroundImage").length >= 2);
});

await test("actual TV YardScene renders global background and preserves personal fallback", () => {
  const { YardScene } = load("src/features/garden/scene/YardScene.tsx");
  const props = { yardBackgroundImage: fixtureUrl, studentBackground: { kind: "solid", color: "green" }, treeStage: 2,
    treeMood: "happy", avatar: null, galleryPositions: {}, sceneLayout: null, decorationItems: [], yardLayout: [], weather: "none",
    activeMonster: null, activeMonsterSpecies: null, activeMonsterStages: [], evolvedMonsters: [], monsterSpeciesById: {}, monsterStagesBySpecies: {} };
  const html = renderToStaticMarkup(createElement(YardScene, props));
  assert.ok(html.includes(`background-image:url(${fixtureUrl})`)); assert.doesNotMatch(html, /data-personal-background/);
  const fallback = renderToStaticMarkup(createElement(YardScene, { ...props, yardBackgroundImage: null }));
  assert.match(fallback, /data-personal-background/); assert.match(fallback, /green/);
});

await test("admin page awaits authorization before any database access", async () => {
  reset(); authenticated = false;
  let release; authGate = new Promise((resolve) => { release = resolve; });
  const pending = load("src/app/admin/yard/page.tsx").default({ searchParams: Promise.resolve({}) });
  await new Promise((resolve) => setImmediate(resolve)); assert.equal(factoryCalls, 0);
  release(); const html = renderToStaticMarkup(await pending); authGate = null;
  assert.match(html, /data-login-required/); assert.equal(factoryCalls, 0); assert.equal(storageCalls.length, 0);
});

await test("authorized admin UI accurately describes TV-only scope and links the forest preview", async () => {
  reset(); authenticated = true;
  const html = renderToStaticMarkup(await load("src/app/admin/yard/page.tsx").default({ searchParams: Promise.resolve({}) }));
  assert.match(html, /TV 마당 배경/); assert.match(html, /TV 정원 화면/);
  assert.match(html, /학생의 개인 화면은 새 숲속 마당으로 분리/);
  assert.match(html, /학생의 마당·간판·나무·포인트는 바뀌지 않아요/);
  assert.match(html, /href="\/admin\/yard-preview"/);
  assert.doesNotMatch(html, /모든 학생의 마이룸 마당에 동일하게 적용/);
  assert.match(source("src/app/admin/nav.ts"), /key:\s*"yard",\s*label:\s*"TV마당배경"/);
  assert.equal(storageCalls.length, 0); assert.equal(invalidated.length, 0);
});

const actions = load("src/app/admin/yard/actions.ts");
await test("both actual background mutations await authorization before storage, DB or cache effects", async () => {
  for (const [name, args] of [["uploadYardBackgroundAction", [new FormData()]], ["deleteYardBackgroundAction", []]]) {
    reset(); authenticated = false;
    let release; authGate = new Promise((resolve) => { release = resolve; });
    const pending = actions[name](...args);
    await new Promise((resolve) => setImmediate(resolve)); assert.equal(factoryCalls, 0);
    release(); await assert.rejects(pending, /AUTH_REQUIRED/); authGate = null;
    assert.equal(factoryCalls, 0); assert.equal(storageCalls.length, 0); assert.equal(invalidated.length, 0);
  }
});

await test("upload and delete preserve TV storage/settings behavior and invalidate TV routes only", async () => {
  for (const operation of ["upload", "delete"]) {
    reset(); authenticated = true;
    let response;
    if (operation === "upload") {
      const form = new FormData(); form.set("file", new File([new Uint8Array([1, 2, 3])], "fixture.png", { type: "image/png" }));
      response = await actions.uploadYardBackgroundAction(form);
      assert.equal(storageCalls.filter(([name]) => name === "upload").length, 1);
      assert.match(response.url, /https:\/\/assets\.local\.invalid\/storage\/v1\/object\/public\/yard\/yard-bg-/);
    } else response = await actions.deleteYardBackgroundAction();
    assert.equal(response.ok, true);
    assert.deepEqual([...invalidated].sort(), ["/", "/admin/yard", "/tv"]);
    assert.ok(storageCalls.some(([name, files]) => name === "remove" && files[0] === "fixture.webp"));
    assert.ok(queries.every((call) => call.table === "yard_settings"));
    const updates = queries.flatMap((call) => call.operations.filter(([name]) => name === "update"));
    assert.equal(updates.length, 1);
    assert.deepEqual(Object.keys(updates[0][1]).sort(), ["background_image", "updated_at"]);
    if (operation === "delete") assert.equal(updates[0][1].background_image, null);
  }
});

console.log(`Passed ${checks} personal/TV background scope, real consumer, guarded admin and mutation regression checks. No live services used.`);
