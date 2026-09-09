/* Run with node scripts/check-avatar-v2.cjs. Uses only existing dev dependencies. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { renderToStaticMarkup } = require("react-dom/server");
const { createElement } = require("react");
const { createHash } = require("node:crypto");

function loadTypeScript(relativePath, imports = {}, sourceOverride, globals = {}) {
  const filename = path.join(__dirname, "..", relativePath);
  const source = sourceOverride ?? fs.readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    fileName: filename,
  });
  const loaded = { exports: {} };
  vm.runInNewContext(outputText, {
    exports: loaded.exports, module: loaded,
    require: name => Object.prototype.hasOwnProperty.call(imports, name) ? imports[name] : require(name),
    ...globals,
  }, { filename });
  return loaded.exports;
}

const catalog = loadTypeScript("src/lib/avatar-v2.ts");
const { DEFAULT_LOOK, DEFAULT_LOOK_V2, LOOK_OPTIONS, AVAILABLE_LOOK_OPTIONS, LEGACY_LOOK_OPTIONS, LOOK_PRESETS,
  parsePaperDollLook, normalizeLook, changeLook, isDressTop } = catalog;
const { PaperDoll, WardrobeItemArt } = loadTypeScript("src/features/avatar-v2/PaperDoll.tsx", { "@/lib/avatar-v2": catalog });
const plain = value => JSON.parse(JSON.stringify(value));
const visualOptions = process.argv.some(flag => flag === "--release" || flag === "--art-ready") ? LOOK_OPTIONS : AVAILABLE_LOOK_OPTIONS;
const render = look => renderToStaticMarkup(createElement(PaperDoll, { look, size: 100 }));
const stableMarkup = html => html.replace(/<link\b[^>]*>/g, "").replace(/ data-slot="[^"]*"/g, "");
const frozenV2 = {
  face: ["human", "rabbit", "cat"], skin: ["peach", "honey", "cocoa"], hair: ["short", "bob", "pigtails", "long"],
  hairColor: ["chestnut", "ink", "honey", "rose"], eyes: ["bright", "smile", "wink"],
  top: ["sweatshirt", "stripe", "hoodie", "blazer", "dress"], topColor: ["cream", "sage", "rose", "lilac", "navy", "apricot"],
  bottom: ["shorts", "skirt", "pants"], bottomColor: ["sage", "navy", "cream", "rose", "lilac", "apricot"],
  shoes: ["sneakers", "loafers", "boots"], shoeColor: ["apricot", "cream", "navy", "rose", "sage", "lilac"],
  hat: ["none", "beret", "cap", "bow"], hatColor: ["sage", "rose", "cream", "lilac", "navy", "apricot"],
};
const frozenDefaultV2 = { kind: "paperdoll", version: 2, face: "human", skin: "peach", hair: "pigtails", hairColor: "chestnut",
  eyes: "bright", top: "sweatshirt", topColor: "cream", bottom: "shorts", bottomColor: "sage", shoes: "sneakers",
  shoeColor: "apricot", hat: "none", hatColor: "sage" };
assert.deepEqual(plain(LEGACY_LOOK_OPTIONS), frozenV2, "Legacy envelope must never acquire new IDs");
assert.deepEqual(plain(DEFAULT_LOOK_V2), frozenDefaultV2);
assert.equal(DEFAULT_LOOK.version, 3); assert.equal(Object.keys(DEFAULT_LOOK).length, 21);
assert.equal(Object.keys(LOOK_OPTIONS).length, 19);
let cases = 0;
let maximumNodes = 0;
let maximumParts = 0, maximumResources = 0, legacyCases = 0, combinations = 0, itemCards = 0;

function valid(look) {
  const parsed = parsePaperDollLook(look);
  assert.ok(parsed, `Valid catalog selection rejected: ${JSON.stringify(look)}`);
  assert.notEqual(parsed, look, "Validation must return a detached canonical record");
  assert.equal(JSON.stringify(parsed), JSON.stringify(look));
  const html = renderToStaticMarkup(createElement(PaperDoll, { look: parsed, size: 100 }));
  assert.match(html, /width:60px;height:100px/, "Public size must mean avatar height");
  assert.doesNotMatch(html, /<(svg|canvas|foreignObject|script|animate)\b/i, "Block avatars must use generated raster assets, never SVG/canvas/animation loops");
  const sources = [...html.matchAll(/src="([^"]+)"/g)].map(match => match[1]);
  assert.ok(sources.length >= 9 && sources.length <= 18, "Every avatar must compose at most18 real raster slots");
  assert.ok(sources.every(source => /^\/tree\/_next\/image\?url=%2Ftree%2Fblock-world%2Favatar-(heads-v1|hair-v1|clothes-v1|clothing-v3|bags-v3|accessories-v3)\.png&amp;w=640&amp;q=82$/.test(source)), "Only allowlisted local640px optimized atlas resources are allowed, including high-DPR phones");
  assert.ok(new Set(sources).size <= 6, "All parts must share at most six cached resources");
  const nodes = (html.match(/<[a-z][\w:]*(?=[\s>])/gi) || []).length;
  assert.ok(nodes <= 64, `Low-end phone avatar DOM budget exceeded: ${nodes}`);
  maximumNodes = Math.max(maximumNodes, nodes);
  maximumParts = Math.max(maximumParts, sources.length); maximumResources = Math.max(maximumResources, new Set(sources).size);
  assert.ok(Buffer.byteLength(JSON.stringify(parsed), "utf8") <= 512, "All saved combinations remain compact");
  cases++;
  return html;
}

valid(DEFAULT_LOOK);
valid({ ...DEFAULT_LOOK, ...Object.fromEntries(Object.entries(LOOK_OPTIONS).map(([field, values]) =>
  [field, [...values].sort((a, b) => b.length - a.length)[0]])) });
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
for (const [field, options] of Object.entries(visualOptions)) {
  let context = field === "hatColor" ? { ...DEFAULT_LOOK, hat: "beret" } : DEFAULT_LOOK;
  const colorSlot = ["bag", "glasses", "neckwear"].find(slot => `${slot}Color` === field);
  if (colorSlot) {
    const visible = visualOptions[colorSlot].find(value => value !== "none");
    if (!visible) continue;
    context = { ...DEFAULT_LOOK, [colorSlot]: visible };
  }
  const variants = options.map(option => render(changeLook(context, field, option)));
  assert.equal(new Set(variants).size, options.length, `${field} must never be a cosmetic/nonfunctional control`);
}

for (const malformed of [null, undefined, [], {}, "paperdoll", { ...DEFAULT_LOOK, version: 1 },
  { ...DEFAULT_LOOK, version: 4 }, { ...DEFAULT_LOOK, version: "3" }, { ...DEFAULT_LOOK, version: 2 }, { ...DEFAULT_LOOK, kind: "gallery" },
  { ...DEFAULT_LOOK, url: "https://example.com/image.svg" }]) {
  assert.equal(parsePaperDollLook(malformed), null);
  assert.equal(JSON.stringify(normalizeLook(malformed)), JSON.stringify(DEFAULT_LOOK));
}
const legacy = { kind: "gallery", base: "legacy-image.png" };
assert.equal(JSON.stringify(normalizeLook(legacy)), JSON.stringify(DEFAULT_LOOK));
assert.equal(legacy.base, "legacy-image.png", "Normalizing must not mutate legacy saved data");
assert.ok(Buffer.byteLength(JSON.stringify(DEFAULT_LOOK), "utf8") <= 512, "Saved avatar must remain compact");
for (const name of ["heads-v1", "clothes-v1", "hair-v1", "clothing-v3", "bags-v3", "accessories-v3"]) {
  const filename = path.join(__dirname, "..", "public", "block-world", `avatar-${name}.png`);
  if (!fs.existsSync(filename) && !process.argv.includes("--release") && name.endsWith("v3")) continue;
  const asset = fs.readFileSync(filename);
  assert.equal(asset.subarray(1, 4).toString(), "PNG", "Source artwork must be a real generated PNG");
  assert.ok(asset.length < 2_000_000, "Source atlas must remain bounded and always served via640px optimizer");
  if (name.endsWith("v3")) assert.equal(asset[25], 6, "New PNG atlas must have true RGBA, not a painted checker");
}

const legacyHtml = [];
for (const face of frozenV2.face) for (const [field, options] of Object.entries(frozenV2)) for (const value of options) {
  const old = Object.freeze({ ...frozenDefaultV2, face, [field]: value });
  const before = JSON.stringify(old), normalized = normalizeLook(old);
  for (const key of Object.keys(frozenV2)) assert.equal(normalized[key], old[key]);
  for (const slot of ["bag", "glasses", "neckwear"]) assert.equal(normalized[slot], "none");
  assert.equal(stableMarkup(render(old)), stableMarkup(render(normalized)), "Saved v2 and in-memory v3 have identical artwork/layout");
  legacyHtml.push(stableMarkup(render(old))); assert.equal(JSON.stringify(old), before); legacyCases++;
}
const legacyChecksum = createHash("sha256").update(legacyHtml.join("\n")).digest("hex");
assert.equal(legacyChecksum, "6e1e3932031086d06e938135b31606c39c403eec6852bd4b74eb1130847df8bd",
  "Frozen v2 artwork/layout must match the independently audited pre-v3 release");
if (process.argv.includes("--audit-legacy")) {
  // Read-only optional audit against the actual release before this change.
  // No checkout, writes, network, credentials or database access is involved.
  const { execFileSync } = require("node:child_process");
  const ref = "6aa43519d66729c2d76444e4ce9cb2fe87bd34c3";
  const readBase = file => execFileSync("git", ["show", `${ref}:${file}`], { cwd: path.join(__dirname, ".."), encoding: "utf8" });
  const oldCatalog = loadTypeScript("src/lib/avatar-v2.ts", {}, readBase("src/lib/avatar-v2.ts"));
  const { PaperDoll: OldPaperDoll } = loadTypeScript("src/features/avatar-v2/PaperDoll.tsx", { "@/lib/avatar-v2": oldCatalog }, readBase("src/features/avatar-v2/PaperDoll.tsx"));
  let index = 0;
  for (const face of frozenV2.face) for (const [field, options] of Object.entries(frozenV2)) for (const value of options) {
    const old = { ...frozenDefaultV2, face, [field]: value };
    const baseline = stableMarkup(renderToStaticMarkup(createElement(OldPaperDoll, { look: old, size: 100 })));
    assert.equal(legacyHtml[index++], baseline, `Actual previous-release appearance changed: ${face}/${field}/${value}`);
  }
  console.log(`Actual pre-v3 release ${ref.slice(0, 8)}: ${index} legacy renders exactly preserved (excluding data-slot/preload attributes).`);
}
for (const face of visualOptions.face) for (const bag of visualOptions.bag)
  for (const glasses of visualOptions.glasses) for (const neckwear of visualOptions.neckwear) {
    const look = Object.freeze({ ...DEFAULT_LOOK, face, bag, glasses, neckwear, hat: "beret" });
    const html = valid(look);
    for (const slot of ["bag", "glasses", "neckwear"]) {
      assert.equal(html.includes(`data-slot="${slot}"`), look[slot] !== "none", `${slot} must coexist with other slots on ${face}`);
      for (const field of [slot, `${slot}Color`]) for (const option of LOOK_OPTIONS[field])
        assert.deepEqual(plain(changeLook(look, field, option)), { ...plain(look), [field]: option }, "An accessory or its color cannot change any other slot");
    }
    combinations++;
  }
for (const top of LOOK_OPTIONS.top.filter(isDressTop)) {
  const withDress = changeLook({ ...DEFAULT_LOOK, bottom: "pants", bottomColor: "navy" }, "top", top);
  assert.equal(withDress.bottom, "pants"); assert.equal(withDress.bottomColor, "navy");
  for (const field of ["bottom", "bottomColor"]) assert.deepEqual(plain(changeLook(withDress, field, LOOK_OPTIONS[field][0])),
    { ...plain(withDress), [field]: LOOK_OPTIONS[field][0], top: "sweatshirt" }, "Bottom selection exits the dress without disturbing other saved choices");
}
// New clothing plus old shoes/hats and all accessories exercises the six-resource
// worst case, not just a default outfit with accessories attached.
for (const face of visualOptions.face) for (const top of visualOptions.top) for (const hat of visualOptions.hat) {
  valid({ ...DEFAULT_LOOK, face, top, hat, bottom: "pants", shoes: "boots",
    bag: visualOptions.bag.find(value => value !== "none") ?? "none",
    glasses: visualOptions.glasses.find(value => value !== "none") ?? "none",
    neckwear: visualOptions.neckwear.find(value => value !== "none") ?? "none" });
}
for (const slot of ["face", "hair", "top", "bottom", "shoes", "hat", "bag", "glasses", "neckwear"]) {
  for (const value of visualOptions[slot]) {
    const html = renderToStaticMarkup(createElement(WardrobeItemArt, { look: { ...DEFAULT_LOOK, [slot]: value }, slot, size: 96 }));
    if (value === "none") { assert.equal(html, ""); continue; }
    const sources = [...html.matchAll(/src="([^"]+)"/g)].map(match => match[1]);
    assert.ok(sources.length > 0 && sources.length <= 2, `${slot}:${value} must be an isolated real item, not a full avatar`);
    assert.ok(sources.every(source => source.startsWith("/tree/")), "Cards cannot load remote artwork");
    assert.doesNotMatch(html, /<(svg|canvas|script)\b/i); itemCards++;
  }
}
for (const key of ["kind", "version"]) {
  const inherited = Object.assign(Object.create({ [key]: DEFAULT_LOOK[key] }), DEFAULT_LOOK); delete inherited[key];
  assert.equal(parsePaperDollLook(inherited), null, `${key} must be an own field`);
}
for (const [field, options] of Object.entries(LOOK_OPTIONS)) {
  if (!Object.hasOwn(frozenV2, field)) continue;
  for (const value of options.filter(option => !frozenV2[field].includes(option))) assert.equal(parsePaperDollLook({ ...frozenDefaultV2, [field]: value }), null);
}
if (process.argv.includes("--release")) {
  assert.deepEqual(plain(AVAILABLE_LOOK_OPTIONS), plain(LOOK_OPTIONS), "Do not release a silently reduced wardrobe");
  assert.equal(combinations, 240, "All three faces × all independent accessory combinations");
  for (const slot of ["top", "bottom", "shoes", "hat", "bag", "glasses", "neckwear"]) for (const option of LOOK_OPTIONS[slot]) {
    if (option === "none" || frozenV2[slot]?.includes(option)) continue;
    const thumb = fs.readFileSync(path.join(__dirname, "..", "public", "block-world", "wardrobe-thumbs-v3", `${option}.webp`));
    assert.equal(thumb.subarray(0, 4).toString(), "RIFF"); assert.equal(thumb.subarray(8, 12).toString(), "WEBP");
    assert.ok(thumb.length < 40_000, "A wardrobe card remains cheap on student phones");
  }
}
// Actual selection handlers, with browser effects/server actions isolated. Hidden
// stored bottom/color values must remain selectable while wearing any dress.
for (const top of LOOK_OPTIONS.top.filter(isDressTop)) {
  const initial = Object.freeze({ ...DEFAULT_LOOK, top, bottom: "pants", bottomColor: "navy" });
  const states = [true, initial, "bottom", "all", 12, false, "", false]; let cursor = 0;
  const reactFixture = { useEffect() {}, useId: () => "local-fixture", useRef: value => ({ current: value }),
    useState: () => { const index = cursor++; return [states[index], value => { states[index] = typeof value === "function" ? value(states[index]) : value; }]; } };
  const { Wardrobe } = loadTypeScript("src/features/avatar-v2/Wardrobe.tsx", {
    react: reactFixture, "react-dom": { createPortal: child => child }, "@/lib/avatar-v2": catalog,
    "./PaperDoll": { PaperDoll: () => null, WardrobeItemArt: () => null },
    "./Wardrobe.module.css": { default: new Proxy({}, { get: (_, key) => String(key) }) },
  }, undefined, { document: { body: {} } });
  const controls = [];
  function walk(element) {
    if (!element || typeof element !== "object") return;
    if (Array.isArray(element)) { element.forEach(walk); return; }
    if (typeof element.type === "function") { walk(element.type(element.props)); return; }
    if (element.type === "input") controls.push(element.props);
    walk(element.props?.children);
  }
  walk(Wardrobe({ open: true, initial, onClose() {}, onSave() { throw new Error("Selection cannot save"); }, adminMode: true }));
  for (const [field, value] of [["bottom", "pants"], ["bottomColor", "navy"]]) {
    const choices = controls.filter(control => control.name === field);
    assert.ok(choices.length > 0); assert.ok(choices.every(control => control.checked === false));
    states[1] = initial;
    const selected = choices.find(control => control.value === value); assert.ok(selected);
    selected.onChange();
    assert.deepEqual(plain(states[1]), { ...plain(initial), top: "sweatshirt" }, "Clicking the hidden same bottom/color exits a dress without losing saved choices");
  }
}
console.log(`Block wardrobe: ${cases} safe renders, ${legacyCases} frozen-v2 cases, ${combinations} accessory combinations, ${itemCards} isolated item cards; max ${maximumNodes} DOM/${maximumParts} parts/${maximumResources} shared640px atlases. Legacy corpus ${legacyChecksum}. Actual dress/bottom/color selection handlers verified. No live services.`);
