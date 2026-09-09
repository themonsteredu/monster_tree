/* Run with node scripts/check-avatar-v2.cjs. Uses only existing dev dependencies. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { renderToStaticMarkup } = require("react-dom/server");
const { createElement } = require("react");

function loadTypeScript(relativePath, imports = {}) {
  const filename = path.join(__dirname, "..", relativePath);
  const source = fs.readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    fileName: filename,
  });
  const loaded = { exports: {} };
  vm.runInNewContext(outputText, {
    exports: loaded.exports, module: loaded,
    require: name => Object.prototype.hasOwnProperty.call(imports, name) ? imports[name] : require(name),
  }, { filename });
  return loaded.exports;
}

const catalog = loadTypeScript("src/lib/avatar-v2.ts");
const { DEFAULT_LOOK, LOOK_OPTIONS, LOOK_PRESETS, parsePaperDollLook, normalizeLook } = catalog;
const { PaperDoll } = loadTypeScript("src/features/avatar-v2/PaperDoll.tsx", { "@/lib/avatar-v2": catalog });
let cases = 0;
let maximumNodes = 0;

function valid(look) {
  const parsed = parsePaperDollLook(look);
  assert.ok(parsed, `Valid catalog selection rejected: ${JSON.stringify(look)}`);
  assert.notEqual(parsed, look, "Validation must return a detached canonical record");
  assert.equal(JSON.stringify(parsed), JSON.stringify(look));
  const html = renderToStaticMarkup(createElement(PaperDoll, { look: parsed, size: 100 }));
  assert.match(html, /width:60px;height:100px/, "Public size must mean avatar height");
  assert.doesNotMatch(html, /<(svg|canvas|foreignObject|script|animate)\b/i, "Block avatars must use generated raster assets, never SVG/canvas/animation loops");
  const sources = [...html.matchAll(/src="([^"]+)"/g)].map(match => match[1]);
  assert.ok(sources.length >= 9 && sources.length <= 15, "Every avatar must compose bounded real raster slots");
  assert.ok(sources.every(source => /^\/tree\/_next\/image\?url=%2Ftree%2Fblock-world%2Favatar-(heads|hair|clothes)-v1\.png&amp;w=640&amp;q=82$/.test(source)), "Only local640px optimized atlas resources are allowed, including on high-DPR phones");
  assert.ok(new Set(sources).size <= 3, "All parts must share at most three cached resources");
  const nodes = (html.match(/<[a-z][\w:]*(?=[\s>])/gi) || []).length;
  assert.ok(nodes <= 50, `Low-end phone avatar DOM budget exceeded: ${nodes}`);
  maximumNodes = Math.max(maximumNodes, nodes);
  cases++;
}

valid(DEFAULT_LOOK);
for (const preset of LOOK_PRESETS) valid(preset.look);
for (const [field, options] of Object.entries(LOOK_OPTIONS)) {
  for (const option of options) valid({ ...DEFAULT_LOOK, [field]: option });
  assert.equal(parsePaperDollLook({ ...DEFAULT_LOOK, [field]: "not-a-catalog-item" }), null);
  assert.equal(parsePaperDollLook({ ...DEFAULT_LOOK, [field]: { url: "https://example.com/tracker" } }), null);
  const missing = { ...DEFAULT_LOOK };
  delete missing[field];
  assert.equal(parsePaperDollLook(missing), null);
}

// Every enabled wardrobe choice must change actual rendered pixels/selection windows.
for (const [field, options] of Object.entries(LOOK_OPTIONS)) {
  const context = field === "hatColor" ? { ...DEFAULT_LOOK, hat: "beret" } : DEFAULT_LOOK;
  const variants = options.map(option => renderToStaticMarkup(createElement(PaperDoll, { look: { ...context, [field]: option }, size: 100 })));
  assert.equal(new Set(variants).size, options.length, `${field} must never be a cosmetic/nonfunctional control`);
}

for (const malformed of [null, undefined, [], {}, "paperdoll", { ...DEFAULT_LOOK, version: 1 },
  { ...DEFAULT_LOOK, version: 3 }, { ...DEFAULT_LOOK, kind: "gallery" },
  { ...DEFAULT_LOOK, url: "https://example.com/image.svg" }]) {
  assert.equal(parsePaperDollLook(malformed), null);
  assert.equal(JSON.stringify(normalizeLook(malformed)), JSON.stringify(DEFAULT_LOOK));
}
const legacy = { kind: "gallery", base: "legacy-image.png" };
assert.equal(JSON.stringify(normalizeLook(legacy)), JSON.stringify(DEFAULT_LOOK));
assert.equal(legacy.base, "legacy-image.png", "Normalizing must not mutate legacy saved data");
assert.ok(Buffer.byteLength(JSON.stringify(DEFAULT_LOOK), "utf8") < 400, "Saved avatar must remain compact");
for (const name of ["heads", "clothes", "hair"]) {
  const asset = fs.readFileSync(path.join(__dirname, "..", "public", "block-world", `avatar-${name}-v1.png`));
  assert.equal(asset.subarray(1, 4).toString(), "PNG", "Source artwork must be a real generated PNG");
  assert.ok(asset.length < 2_000_000, "Source atlas must remain bounded and always served via640px optimizer");
}
console.log(`Block avatars: ${cases} valid look renders and all individual controls verified; max ${maximumNodes} DOM nodes; three cached640px raster atlases; malformed payloads rejected.`);
