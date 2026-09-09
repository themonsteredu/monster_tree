// Run: node scripts/test-forest-yard.mjs
// Actual forest shell, main JSX and guarded preview. External effects/actions are
// isolated; this script never opens a browser, reads env files or accesses a DB.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");
const modules = new Map();
let authenticated = false;
let authCalls = 0;
const effectCalls = [];
const noEffect = (...args) => { effectCalls.push(args); };
const marker = (name, fields = []) => (props) => React.createElement("span", Object.fromEntries(
  [[`data-${name}`, "true"], ...fields.map((field) => [`data-${field.toLowerCase()}`, typeof props[field] === "object" ? JSON.stringify(props[field]) : props[field]])],
));
const empty = () => null;
const stubs = {
  "@/components/AppleTree": { AppleTree: marker("tree", ["stage", "imageConfig"]) },
  "@/features/garden/avatar/AvatarFigurePreloaded": { AvatarFigurePreloaded: marker("avatar", ["config"]) },
  "@/features/garden/avatar/AvatarEditSheet": { AvatarEditSheet: empty },
  "@/features/avatar-v2/PaperDoll": { PaperDoll: marker("preview-avatar", ["look"]) },
  "@/features/avatar-v2/Wardrobe": { Wardrobe: empty },
  "@/features/garden/avatar/useGalleryPositions": { useGalleryPositions: () => ({}) },
  "@/features/garden/tree/useTreeStages": { useTreeStages: () => ({}) },
  "@/features/garden/hooks/useStudentRealtime": { useStudentRealtime: noEffect },
  "@/features/garden/background/BackgroundCanvas": { BackgroundCanvas: marker("personal-background", ["config"]) },
  "@/features/garden/mood/MoodEditSheet": { MoodEditSheet: empty },
  "@/features/garden/mood/MoodTicker": { MoodTicker: marker("mood", ["text"]) },
  "@/features/garden/weather/WeatherEffect": { WeatherEffect: marker("weather", ["weather"]) },
  "@/features/garden/weather/WeatherPickerSheet": { WeatherPickerSheet: empty },
  "@/features/garden/decorations/YardLayer": { YardLayer: marker("decorations", ["layout"]) },
  "@/features/garden/decorations/DecorateMode": { DecorateMode: empty },
  "@/features/garden/effects/SprayWater": { SprayWaterMe: empty },
  "@/features/garden/effects/confetti": { fireConfetti: noEffect, firePtCelebration: noEffect },
  "./NotifyBell": { NotifyBell: empty },
  "./actions": new Proxy({}, { get: () => () => { throw new Error("Live actions are forbidden"); } }),
  "../auth": { isAdminAuthenticated: async () => { authCalls++; return authenticated; } },
  "../LoginForm": { LoginForm: marker("login") },
};
function load(relative) {
  const filename = path.resolve(root, relative);
  if (modules.has(filename)) return modules.get(filename).exports;
  const module = { exports: {} }; modules.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const imports = (specifier) => {
    if (specifier === "react" || specifier === "react/jsx-runtime") return require(specifier);
    if (specifier === "next/image") return { __esModule: true, default: ({ fill, priority, ...props }) => React.createElement("img", { ...props, "data-priority": !!priority, "data-fill": !!fill }) };
    if (specifier === "next/link") return { __esModule: true, default: ({ children, href, ...props }) => React.createElement("a", { ...props, href: href.startsWith("/") ? `/tree${href}` : href }, children) };
    if (specifier.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    if (Object.hasOwn(stubs, specifier)) return stubs[specifier];
    if (/supabase|server-only|next\/headers|\/actions$/.test(specifier)) throw new Error(`Forbidden live dependency: ${specifier}`);
    const base = specifier.startsWith("@/") ? path.join(root, "src", specifier.slice(2)) : path.resolve(path.dirname(filename), specifier);
    for (const suffix of [".tsx", ".ts"]) if (fs.existsSync(base + suffix)) return load(path.relative(root, base + suffix));
    throw new Error(`Unexpected dependency: ${specifier}`);
  };
  vm.runInNewContext(code, { module, exports: module.exports, require: imports,
    fetch: () => { throw new Error("Network access is forbidden"); },
  }, { filename });
  return module.exports;
}
let checks = 0;
async function test(name, run) {
  try { await run(); console.log(`ok ${++checks} - ${name}`); }
  catch (error) { console.error(`FAILED - ${name}`); throw error; }
}
const layout = load("src/features/garden/yard/forest-yard-layout.ts");
const shell = load("src/features/garden/yard/ForestYard.tsx");

await test("forest only replaces absent/database-default cream, preserving personal themes", () => {
  for (const value of [null, undefined, { kind: "solid", color: "cream" }]) assert.equal(layout.usesForestBackground(value), true);
  for (const value of [{ kind: "solid", color: "mint" }, { kind: "pattern", pattern: "dots", color: "cream" }, { kind: "scene", scene: "forest" }]) assert.equal(layout.usesForestBackground(value), false);
});
await test("saved actor coordinates, sizes, rotation and flips are unchanged in both backgrounds", () => {
  const saved = { tree: { x: 15, y: 90, width: 35, rotation: 20, flipX: true }, avatar: { x: 90, y: 82, width: 18 }, monster: { x: 70, y: 63, width: 12 } };
  for (const forest of [true, false]) {
    const resolved = layout.resolveYardScene(saved, forest);
    for (const key of ["tree", "avatar", "monster"]) assert.equal(resolved[key], saved[key]);
  }
  const defaults = layout.resolveYardScene(null, true);
  assert.equal(defaults.tree, layout.FOREST_SCENE_LAYOUT.tree);
  assert.equal(layout.resolveYardScene({ avatar: saved.avatar }, true).avatar, saved.avatar);
  for (const actor of Object.values(defaults)) assert.ok(actor.y + actor.width / 2 <= 75, "default actor feet stay behind the gate");
});
await test("real forest stage uses one optimized priority raster with responsive sizes", () => {
  const html = renderToStaticMarkup(React.createElement(shell.ForestYardScene, null, "real actor slot"));
  assert.match(html, /src="\/tree\/block-world\/forest-yard-v1.webp"/);
  assert.match(html, /data-priority="true"/); assert.match(html, /sizes="/);
  assert.match(html, /real actor slot/); assert.doesNotMatch(html, /<svg|canvas|webgl/i);
  const personal = renderToStaticMarkup(React.createElement(shell.ForestYardScene, { forest: false }, "personal theme"));
  assert.doesNotMatch(personal, /forest-yard-v1/); assert.match(personal, /personal theme/);
});
await test("header/sign text is native and safely escaped, with actual points/apples", () => {
  const longSign = "가".repeat(24);
  const html = renderToStaticMarkup(React.createElement(shell.ForestYard, { studentName: "<학생>", points: 150, apples: 2,
    sign: React.createElement("button", null, longSign) }, "yard"));
  assert.match(html, /&lt;학생&gt;/); assert.match(html, new RegExp(longSign));
  assert.match(html, /보유 포인트 150P/); assert.match(html, /수확한 사과 <b>2<\/b>개/);
});
await test("growth status uses provided real progress and has accessible progress semantics", () => {
  const html = renderToStaticMarkup(React.createElement(shell.ForestYardProgress, { stage: 5, name: "큰나무", progress: 2 / 7, remaining: 50, harvest: false }));
  assert.match(html, /나무 5단계/); assert.match(html, /50P/); assert.match(html, /aria-valuenow="29"/);
});
await test("real MeTree JSX preserves students, scenes, weather, decorations and primary action order", () => {
  const { MeTreeClient } = load("src/app/me/MeTreeClient.tsx");
  const props = { studentName: "원래학생", initialRow: { id: "local-test", total_points: 150, current_stage: 5, apples_harvested: 2,
    grade: "학년", avatar: { kind: "image", url: "https://image.example/avatar.png" }, background: { kind: "solid", color: "cream" }, mood_text: "기존 한마디" },
    initialPointLogs: [], initialHarvests: [], initialPending: [], initialWeather: "rain", initialYardLayout: [{ instance_id: "saved-decoration" }],
    yardBackgroundImage: "https://image.example/legacy-global.png" };
  const html = renderToStaticMarkup(React.createElement(MeTreeClient, props));
  assert.match(html, /forest-yard-v1.webp/); assert.doesNotMatch(html, /legacy-global.png/);
  assert.match(html, /data-avatar="true"/); assert.match(html, /data-stage="5"/);
  assert.match(html, /data-weather="rain"/); assert.match(html, /saved-decoration/); assert.match(html, /기존 한마디/);
  assert.ok(html.indexOf('href="/tree/me/plaza"') < html.indexOf("아바타 꾸미기"));
  assert.ok(html.indexOf("아바타 꾸미기") < html.indexOf("마당 꾸미기"));
  assert.match(html, /활동 기록 · 마일스톤/);
  const personal = renderToStaticMarkup(React.createElement(MeTreeClient, { ...props, initialRow: { ...props.initialRow, background: { kind: "scene", scene: "sunset" } } }));
  assert.match(personal, /data-personal-background="true"/); assert.doesNotMatch(personal, /forest-yard-v1.webp/);
});
await test("new preview awaits auth and renders only the shared local presentation when authenticated", async () => {
  const Page = load("src/app/admin/yard-preview/page.tsx").default;
  authenticated = false; authCalls = 0;
  const denied = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
  assert.equal(authCalls, 1); assert.match(denied, /data-login="true"/); assert.doesNotMatch(denied, /forest-yard-v1/);
  authenticated = true; effectCalls.length = 0;
  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
  assert.match(html, /테스트 모드 — 기록 저장 안 됨/); assert.match(html, /forest-yard-v1.webp/);
  assert.match(html, /tree-stages\/stage-5.png/);
  assert.match(html, /나의 아지트/); assert.match(html, /href="#plaza-preview"/); assert.match(html, /id="plaza-preview"/);
  assert.doesNotMatch(html, /href="\/tree\/me(?:\/|")/); assert.equal(effectCalls.length, 0);
});
await test("preview nav, mobile minimum touch size and reduced motion remain explicit", () => {
  const nav = load("src/app/admin/nav.ts");
  assert.ok(nav.ADMIN_NAV.flatMap((group) => group.items).some((item) => item.key === "yard-preview" && item.href === "/admin/yard-preview"));
  const css = source("src/features/garden/yard/ForestYard.module.css");
  assert.match(css, /minmax\(0,1fr\)/); assert.match(css, /min-height: 44px/); assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /overflow-wrap: anywhere/); assert.doesNotMatch(css, /backdrop-filter|perspective:/);
  assert.match(source("src/app/admin/yard-preview/ForestYardPreview.tsx"), /<YardSign adminMode/);
  assert.doesNotMatch(source("src/app/admin/yard-preview/ForestYardPreview.tsx"), /useStudentRealtime|from\s+["'][^"']*actions["']|fetch\(/);
});
console.log(`Passed ${checks} forest yard presentation, saved-layout, mobile and no-write preview checks. No live services used.`);
