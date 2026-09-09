// Run: node scripts/test-yard-plaza-entry.mjs
// Render the actual entry and guarded preview JSX with isolated auth/action stubs.
// No environment files, production services, browser, cookies or database access.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
let authenticated = false;
let authCalls = 0;
const avatarSaves = [];
function PreviewPlaza({ adminMode, previewCrowd }) {
  assert.equal(adminMode, true, "preview must not mount the live plaza");
  return createElement("div", { "data-preview-plaza": previewCrowd }, "테스트 모드 — 기록 저장 안 됨");
}
function WardrobeStub() { throw new Error("The wardrobe props are checked without mounting or saving live data"); }
function load(relative) {
  const filename = path.join(root, relative);
  const module = { exports: {} };
  const code = ts.transpileModule(source(relative), {
    fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const imports = (specifier) => {
    if (specifier === "react/jsx-runtime") return require(specifier);
    if (specifier === "@/features/social/YardPlazaEntry") return load("src/features/social/YardPlazaEntry.tsx");
    if (specifier === "@/features/social/PlazaClient") return { PlazaClient: PreviewPlaza };
    if (specifier === "../auth") return { isAdminAuthenticated: async () => { authCalls++; return authenticated; } };
    if (specifier === "../LoginForm") return { LoginForm: () => createElement("div", { "data-login-required": true }) };
    if (specifier === "@/features/avatar-v2/Wardrobe") return { Wardrobe: WardrobeStub };
    if (specifier === "@/lib/avatar-v2") return load("src/lib/avatar-v2.ts");
    if (specifier === "@/app/me/actions") return { updateAvatarAction: async ({ avatar }) => {
      avatarSaves.push(avatar); return { ok: true, avatar };
    } };
    throw new Error(`Unexpected import: ${specifier}. Live auth, database and navigation are unavailable.`);
  };
  vm.runInNewContext(code, {
    module, exports: module.exports, require: imports,
    fetch: () => { throw new Error("Network access is forbidden in this regression"); },
  }, { filename });
  return module.exports;
}
let checks = 0;
async function test(name, check) {
  try { await check(); checks++; console.log(`ok ${checks} - ${name}`); }
  catch (error) { console.error(`FAILED - ${name}`); throw error; }
}
const { YardPlazaEntry } = load("src/features/social/YardPlazaEntry.tsx");
const links = (html) => [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"[^>]*>/g)];
const noNewTabOrCredentials = (html) => {
  assert.doesNotMatch(html, /\btarget\s*=/i, "entry must stay in the same tab");
  assert.doesNotMatch(html, /student_id|branch_id|owner_id|login_id|jwt|token|password|secret|[?&](?:key|auth)=/i);
};

await test("actual student entry uses the configured SITE redirect in the same tab without credentials", () => {
  const html = renderToStaticMarkup(createElement(YardPlazaEntry));
  const anchors = links(html);
  assert.equal(anchors.length, 1);
  assert.equal(anchors[0][1], "/tree/me/plaza");
  for (const origin of ["https://www.themonster.kr", "https://monster-tree.vercel.app", "http://localhost:3103"]) {
    const url = new URL(anchors[0][1], origin);
    assert.equal(url.origin, origin);
    assert.equal(url.pathname, "/tree/me/plaza");
    for (const property of ["username", "password", "search", "hash"]) assert.equal(url[property], "");
  }
  const redirectPage = source("src/app/me/plaza/page.tsx");
  assert.match(redirectPage, /redirect\(getSitePlazaUrl\(\)\)/, "shared entry must resolve the configured destination on the server");
  assert.doesNotMatch(html, /\/tree\/plaza|<svg\b/i);
  assert.match(html, /우리 광장으로 가기/);
  assert.match(html, /min-h-\[76px\]/);
  noNewTabOrCredentials(html);
});

await test("actual preview entry stays on the same page instead of entering live SITE", () => {
  const html = renderToStaticMarkup(createElement(YardPlazaEntry, { previewMode: true }));
  assert.deepEqual(links(html).map((link) => link[1]), ["#plaza-preview"]);
  assert.doesNotMatch(html, /https?:\/\/|\/tree\/plaza/);
  noNewTabOrCredentials(html);
});

await test("unauthenticated preview awaits the guard and renders neither entrance nor plaza", async () => {
  authenticated = false; authCalls = 0;
  const Page = load("src/app/admin/plaza-preview/page.tsx").default;
  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
  assert.equal(authCalls, 1);
  assert.match(html, /data-login-required/);
  assert.equal(links(html).length, 0);
  assert.doesNotMatch(html, /data-preview-plaza|id="plaza-preview"/);
});

await test("guarded preview renders the shared entrance and its matching local target", async () => {
  authenticated = true;
  const Page = load("src/app/admin/plaza-preview/page.tsx").default;
  for (const [crowd, expected] of [[undefined, 6], ["24", 24]]) {
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ crowd }) }));
    const anchors = links(html);
    assert.deepEqual(anchors.map((link) => link[1]), ["#plaza-preview"]);
    assert.equal((html.match(/id="plaza-preview"/g) ?? []).length, 1);
    assert.ok(html.indexOf('href="#plaza-preview"') < html.indexOf('id="plaza-preview"'));
    assert.match(html, new RegExp(`data-preview-plaza="${expected}"`));
    assert.match(html, /테스트 모드 — 기록 저장 안 됨/);
    noNewTabOrCredentials(html);
  }
});

function descendants(node, predicate) {
  const found = [];
  const visit = (child) => { if (predicate(child)) found.push(child); ts.forEachChild(child, visit); };
  visit(node); return found;
}
const mainFile = ts.createSourceFile("MeTreeClient.tsx", source("src/app/me/MeTreeClient.tsx"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const mainFunction = mainFile.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "MeTreeClient");
assert.ok(mainFunction?.body);
const mainReturn = mainFunction.body.statements.find(ts.isReturnStatement);
assert.ok(mainReturn?.expression);
const jsx = (name) => descendants(mainReturn.expression, (node) =>
  (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(mainFile) === name);
const attribute = (node, name) => node.attributes.properties.find((entry) => ts.isJsxAttribute(entry) && entry.name.getText(mainFile) === name);

await test("main yard really imports and renders the live entrance before its existing avatar button", () => {
  const imported = mainFile.statements.some((node) => ts.isImportDeclaration(node) &&
    node.moduleSpecifier.text === "@/features/social/YardPlazaEntry" &&
    node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings) &&
    node.importClause.namedBindings.elements.some((entry) => entry.name.text === "YardPlazaEntry"));
  assert.equal(imported, true);
  const entries = jsx("YardPlazaEntry");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].attributes.properties.length, 0, "student entry cannot receive preview mode or private identity props");
  const buttons = descendants(mainReturn.expression, (node) => ts.isJsxElement(node) &&
    node.openingElement.tagName.getText(mainFile) === "button" &&
    node.children.some((child) => ts.isJsxText(child) && child.text.trim() === "아바타 꾸미기"));
  assert.equal(buttons.length, 1);
  assert.ok(entries[0].getStart(mainFile) < buttons[0].getStart(mainFile));
  assert.match(attribute(buttons[0].openingElement, "onClick")?.initializer?.getText(mainFile) ?? "", /setAvatarSheetOpen\(true\)/);
});

await test("main yard preserves the open state and saved-avatar callback to AvatarEditSheet", () => {
  const sheets = jsx("AvatarEditSheet");
  assert.equal(sheets.length, 1);
  assert.equal(attribute(sheets[0], "open")?.initializer?.getText(mainFile), "{avatarSheetOpen}");
  assert.equal(attribute(sheets[0], "initial")?.initializer?.getText(mainFile), "{currentAvatar}");
  assert.match(attribute(sheets[0], "onSaved")?.initializer?.getText(mainFile) ?? "", /setRow[\s\S]*avatar:\s*next/);
});

await test("actual AvatarEditSheet still opens the new Wardrobe and forwards a saved paperdoll", async () => {
  const { AvatarEditSheet } = load("src/features/garden/avatar/AvatarEditSheet.tsx");
  const { DEFAULT_LOOK, DEFAULT_LOOK_V2 } = load("src/lib/avatar-v2.ts");
  const saved = [];
  const element = AvatarEditSheet({ open: true, initial: { kind: "gallery", base: "legacy-test-only" },
    onClose() {}, onSaved: (look) => saved.push(look) });
  assert.equal(element.type, WardrobeStub);
  assert.equal(element.props.open, true);
  assert.equal(element.props.initial.kind, "paperdoll");
  assert.equal(element.props.initial.version, 3);
  const oldSavedLook = Object.freeze({ ...DEFAULT_LOOK_V2, face: "rabbit", top: "dress", bottom: "pants", bottomColor: "navy" });
  const oldView = AvatarEditSheet({ open: true, initial: oldSavedLook, onClose() {}, onSaved: (look) => saved.push(look) });
  assert.equal(oldSavedLook.version, 2, "Opening cannot rewrite the saved v2 input");
  assert.equal(oldView.props.initial.version, 3, "Only the in-memory editor value is normalized to v3");
  for (const field of ["face", "top", "bottom", "bottomColor"]) assert.equal(oldView.props.initial[field], oldSavedLook[field]);
  for (const field of ["bag", "glasses", "neckwear"]) assert.equal(oldView.props.initial[field], "none");
  assert.equal(avatarSaves.length, 0, "Opening either legacy format cannot automatically save");
  await element.props.onSave(DEFAULT_LOOK);
  assert.equal(avatarSaves.length, 1);
  assert.equal(saved[0], DEFAULT_LOOK);
});

console.log(`Passed ${checks} rendered yard/plaza links, guarded preview and wardrobe integration checks. No live services used.`);
