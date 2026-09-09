// Run: node scripts/test-avatar-actions.mjs
// Uses installed TypeScript to load the tested sources; no extra test dependency,
// production credentials or live network access is needed.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { SignJWT } from "jose";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modules = new Map();
let database;
let actionCookie;
const revalidated = [];
function WardrobeStub() { throw new Error("The actual wrapper is inspected without mounting a live editor"); }
function load(relative) {
  const filename = path.resolve(root, relative);
  if (modules.has(filename)) return modules.get(filename).exports;
  const module = { exports: {} };
  modules.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
    fileName: filename,
  }).outputText;
  const localRequire = (specifier) => {
    if (specifier === "server-only") return {};
    if (specifier === "next/server") return { NextResponse: { json: (data, init) => Response.json(data, init) } };
    if (specifier === "next/headers") return { cookies: async () => ({ get: (name) => name === "monster_student" && actionCookie ? { value: actionCookie } : undefined }) };
    if (specifier === "next/cache") return { revalidatePath: (route) => revalidated.push(route) };
    if (specifier.endsWith("supabase/server")) return { createSupabaseServiceClient: () => database };
    if (specifier === "@/features/avatar-v2/Wardrobe") return { Wardrobe: WardrobeStub };
    if (specifier.startsWith("@/")) return load(`src/${specifier.slice(2)}.ts`);
    if (specifier.startsWith(".")) return load(path.relative(root, path.resolve(path.dirname(filename), `${specifier}.ts`)));
    return require(specifier);
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(localRequire, module, module.exports);
  return module.exports;
}


const studentActions = load("src/app/me/actions.ts");
const avatarCatalog = load("src/lib/avatar-v2.ts");
const { DEFAULT_LOOK, DEFAULT_LOOK_V2, LOOK_OPTIONS, AVAILABLE_LOOK_OPTIONS, LEGACY_LOOK_OPTIONS, normalizeLook, isLookAvailable } = avatarCatalog;
const plain = (value) => JSON.parse(JSON.stringify(value));
const selfId = "10000000-0000-4000-8000-000000000001";
const peerId = "10000000-0000-4000-8000-000000000002";
const self = { branch_id: "test-branch" };
let checks = 0;
async function test(name, check) {
  try { await check(); checks++; console.log(`ok ${checks} - ${name}`); }
  catch (error) { console.error(`FAILED - ${name}`); throw error; }
}

function mockDb(responder) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, operations: [] };
      calls.push(call);
      const chain = {};
      for (const method of ["select", "eq", "neq", "gt", "gte", "lte", "in", "order", "limit", "maybeSingle", "upsert", "update"]) {
        chain[method] = (...args) => { call.operations.push([method, ...args]); return chain; };
      }
      chain.then = (resolve, reject) => Promise.resolve().then(() => responder(call)).then(resolve, reject);
      return chain;
    },
  };
}
const operation = (call, name, field) => call.operations.find((entry) => entry[0] === name && (field === undefined || entry[1] === field));
const has = (call, name, field, value) => operation(call, name, field)?.[2] === value;

const defaultResponder = () => ({ data: null, error: null });
const originalSecret = process.env.JWT_SECRET;
const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
try {
  process.env.JWT_SECRET = "local-avatar-test-secret-not-a-live-credential";
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const claims = { branchId: self.branch_id, studentLocalId: 11, loginId: "private-login", name: "private-claim" };
  const token = await new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("5m").sign(secret);
  await test("avatar save authenticates before accessing the database", async () => {
    database = mockDb(defaultResponder);
    actionCookie = undefined;
    assert.equal((await studentActions.updateAvatarAction({ avatar: DEFAULT_LOOK })).ok, false);
    assert.equal(database.calls.length, 0);
    actionCookie = token;
  });

  await test("forged, expired, non-HS256 and missing-secret avatar sessions cause no database calls", async () => {
    const fixture = (alg, expiry, key = secret) => new SignJWT(claims).setProtectedHeader({ alg }).setIssuedAt().setExpirationTime(expiry).sign(key);
    for (const cookie of ["not-a-token", await fixture("HS512", "5m"), await fixture("HS256", 1),
      await fixture("HS256", "5m", new TextEncoder().encode("different-local-fixture-only".repeat(3)))]) {
      database = mockDb(defaultResponder); actionCookie = cookie;
      assert.equal((await studentActions.updateAvatarAction({ avatar: DEFAULT_LOOK })).ok, false);
      assert.equal(database.calls.length, 0);
    }
    actionCookie = token; delete process.env.JWT_SECRET;
    assert.equal((await studentActions.updateAvatarAction({ avatar: DEFAULT_LOOK })).ok, false);
    assert.equal(database.calls.length, 0);
    process.env.JWT_SECRET = "local-avatar-test-secret-not-a-live-credential";
  });

  await test("v3 malformed values, unknown keys, resource injection and wrong versions are rejected before DB access", async () => {
    assert.equal(DEFAULT_LOOK.version, 3);
    const malformed = [null, [], {}, "paperdoll", { ...DEFAULT_LOOK, version: 4 }, { ...DEFAULT_LOOK, version: "3" },
      { ...DEFAULT_LOOK, studentId: peerId }, { ...DEFAULT_LOOK, url: "https://private.invalid/tracker.svg" },
      { ...DEFAULT_LOOK, accessories: { bag: "backpack" } }, { ...DEFAULT_LOOK, x: 50 }, { ...DEFAULT_LOOK, crop: [0, 0, 10, 10] },
      { ...DEFAULT_LOOK, version: 2 }];
    for (const field of Object.keys(LOOK_OPTIONS)) {
      for (const value of [null, [], {}, 1, true, "", "not-an-option", "https://private.invalid/asset.png"]) malformed.push({ ...DEFAULT_LOOK, [field]: value });
      const missing = { ...DEFAULT_LOOK }; delete missing[field]; malformed.push(missing);
    }
    for (const avatar of malformed) {
      database = mockDb(defaultResponder); revalidated.length = 0;
      assert.equal((await studentActions.updateAvatarAction({ avatar })).ok, false, JSON.stringify(avatar));
      assert.equal(database.calls.length, 0); assert.equal(revalidated.length, 0);
    }
  });

  await test("a legacy v2 outfit upgrades only during explicit save and preserves every original choice", async () => {
    const legacy = Object.freeze({ ...DEFAULT_LOOK_V2, face: "rabbit", hair: "bob", top: "dress", bottom: "pants", bottomColor: "navy", shoes: "boots", hat: "beret" });
    const before = JSON.stringify(legacy);
    database = mockDb((call) => operation(call, "update") ? { data: { id: selfId }, error: null } : defaultResponder(call));
    const normalized = normalizeLook(legacy);
    assert.equal(database.calls.length, 0, "normalizing a saved row cannot save it");
    for (const field of Object.keys(LEGACY_LOOK_OPTIONS)) assert.equal(normalized[field], legacy[field]);
    assert.equal(normalized.bag, "none"); assert.equal(normalized.glasses, "none"); assert.equal(normalized.neckwear, "none");
    const result = await studentActions.updateAvatarAction({ avatar: legacy });
    assert.equal(result.ok, true); assert.equal(result.avatar.version, 3);
    assert.equal(database.calls.length, 1); assert.deepEqual(plain(operation(database.calls[0], "update")[1]), { avatar: plain(normalized) });
    assert.equal(JSON.stringify(legacy), before);
  });

  await test("v3-only catalog choices cannot masquerade as original v2 payloads", async () => {
    let rejected = 0;
    for (const field of Object.keys(LEGACY_LOOK_OPTIONS)) {
      for (const value of LOOK_OPTIONS[field].filter((option) => !LEGACY_LOOK_OPTIONS[field].includes(option))) {
        database = mockDb(defaultResponder);
        assert.equal((await studentActions.updateAvatarAction({ avatar: { ...DEFAULT_LOOK_V2, [field]: value } })).ok, false);
        assert.equal(database.calls.length, 0); rejected++;
      }
    }
    assert.ok(rejected > 0, "the expanded catalog must exercise actual v3-only IDs");
  });

  await test("the server enforces artwork availability before creating any database operation", async () => {
    const originalGate = avatarCatalog.isLookAvailable;
    try {
      avatarCatalog.isLookAvailable = () => false;
      database = mockDb(defaultResponder); revalidated.length = 0;
      assert.equal((await studentActions.updateAvatarAction({ avatar: DEFAULT_LOOK })).ok, false);
      assert.equal(database.calls.length, 0); assert.equal(revalidated.length, 0);
    } finally { avatarCatalog.isLookAvailable = originalGate; }
    for (const [field, options] of Object.entries(LOOK_OPTIONS)) for (const value of options) {
      const avatar = { ...DEFAULT_LOOK, [field]: value };
      database = mockDb(() => ({ data: { id: selfId }, error: null }));
      assert.equal((await studentActions.updateAvatarAction({ avatar })).ok, isLookAvailable(avatar), `${field}:${value}`);
      assert.equal(database.calls.length, isLookAvailable(avatar) ? 1 : 0);
    }
  });

  await test("bags, glasses and neckwear combine independently without point, ownership or layout writes", async () => {
    let combinations = 0;
    for (const bag of LOOK_OPTIONS.bag) for (const glasses of LOOK_OPTIONS.glasses) for (const neckwear of LOOK_OPTIONS.neckwear) {
      const avatar = Object.freeze({ ...DEFAULT_LOOK, top: "dress", bottom: "pants", bottomColor: "navy",
        hat: "beret", shoes: "boots", bag, bagColor: "sage", glasses, glassesColor: "navy", neckwear, neckwearColor: "rose" });
      database = mockDb((call) => operation(call, "update") ? { data: { id: selfId }, error: null } : defaultResponder(call));
      const result = await studentActions.updateAvatarAction({ avatar });
      if (!isLookAvailable(avatar)) {
        assert.equal(result.ok, false); assert.equal(database.calls.length, 0); combinations++; continue;
      }
      assert.equal(result.ok, true); assert.deepEqual(plain(result.avatar), plain(avatar));
      assert.equal(database.calls.length, 1);
      assert.equal(database.calls[0].table, "garden_students");
      assert.deepEqual(Object.keys(operation(database.calls[0], "update")[1]), ["avatar"]);
      assert.deepEqual(plain(operation(database.calls[0], "update")[1].avatar), plain(avatar)); combinations++;
    }
    assert.ok(combinations > 8);
  });

  await test("actual editor wrapper opening/closing and admin-only edits never automatically save old rows", async () => {
    const { AvatarEditSheet } = load("src/features/garden/avatar/AvatarEditSheet.tsx");
    database = mockDb(defaultResponder);
    const old = Object.freeze({ ...DEFAULT_LOOK_V2, face: "cat", top: "stripe", hat: "cap" });
    const before = JSON.stringify(old); const saved = [];
    for (const open of [false, true, false]) {
      const view = AvatarEditSheet({ open, initial: old, onClose() {}, onSaved: (look) => saved.push(look) });
      assert.equal(view.type, WardrobeStub); assert.equal(view.props.initial.version, 3);
      assert.equal(view.props.initial.top, old.top); assert.equal(view.props.initial.hat, old.hat);
    }
    assert.equal(database.calls.length, 0); assert.equal(saved.length, 0); assert.equal(JSON.stringify(old), before);
    const view = AvatarEditSheet({ open: true, initial: old, adminMode: true, onClose() {}, onSaved: (look) => saved.push(look) });
    await view.props.onSave({ ...view.props.initial, bag: LOOK_OPTIONS.bag.find((option) => option !== "none") });
    assert.equal(saved.length, 1); assert.equal(database.calls.length, 0); assert.equal(JSON.stringify(old), before);
  });

  await test("avatar save updates only the active cookie owner and confirms a returned row", async () => {
    database = mockDb((call) => operation(call, "update") ? { data: { id: selfId }, error: null } : defaultResponder(call));
    revalidated.length = 0;
    const result = await studentActions.updateAvatarAction({ avatar: DEFAULT_LOOK, student_id: peerId });
    assert.equal(result.ok, true);
    assert.equal(database.calls.length, 1);
    const update = database.calls[0];
    assert.equal(update.table, "garden_students");
    assert.equal(has(update, "eq", "branch_id", self.branch_id), true);
    assert.equal(has(update, "eq", "external_student_id", 11), true);
    assert.equal(has(update, "eq", "is_active", true), true);
    assert.equal(operation(update, "select")[1], "id");
    assert.ok(operation(update, "maybeSingle"));
    assert.deepEqual(Object.keys(operation(update, "update")[1]), ["avatar"]);
    assert.ok(revalidated.length > 0);
  });

  await test("missing/inactive avatar rows and database errors never report a saved outfit", async () => {
    revalidated.length = 0;
    database = mockDb(() => ({ data: null, error: null }));
    assert.equal((await studentActions.updateAvatarAction({ avatar: DEFAULT_LOOK })).ok, false);
    assert.equal(revalidated.length, 0);
    database = mockDb(() => ({ data: null, error: { message: "sensitive database details", code: "XX000" } }));
    const result = await studentActions.updateAvatarAction({ avatar: DEFAULT_LOOK });
    assert.equal(result.ok, false);
    assert.equal(result.message.includes("sensitive"), false);
    assert.equal(revalidated.length, 0);
  });

  await test("legacy image URLs reject lookalike hosts, credentials and non-public paths before DB access", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://avatar-test.supabase.co";
    for (const url of [
      "https://avatar-test.supabase.co.evil.example/storage/v1/object/public/a.png",
      "https://avatar-test.supabase.co@evil.example/storage/v1/object/public/a.png",
      "http://avatar-test.supabase.co/storage/v1/object/public/a.png",
      "https://avatar-test.supabase.co/auth/v1/authorize",
      "https://avatar-test.supabase.co/storage/v1/object/authenticated/a.png",
    ]) {
      database = mockDb(defaultResponder);
      assert.equal((await studentActions.updateAvatarAction({ avatar: { kind: "image", url } })).ok, false);
      assert.equal(database.calls.length, 0);
    }
  });

  await test("legacy public images on the configured exact origin remain supported", async () => {
    database = mockDb((call) => operation(call, "update") ? { data: { id: selfId }, error: null } : defaultResponder(call));
    const avatar = { kind: "image", url: "https://avatar-test.supabase.co/storage/v1/object/public/avatars/a.png" };
    assert.equal((await studentActions.updateAvatarAction({ avatar })).ok, true);
    assert.deepEqual(operation(database.calls[0], "update")[1], { avatar });
  });

  if (process.argv.includes("--release")) await test("the complete approved v3 catalog is enabled for this release", async () => {
    assert.deepEqual(plain(AVAILABLE_LOOK_OPTIONS), plain(LOOK_OPTIONS), "Do not release a silently reduced wardrobe");
  });


} finally {
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
}
console.log(`Passed ${checks} backward-compatible v2/v3 avatar, independent-slot and owner-only save checks. No live services used.`);
