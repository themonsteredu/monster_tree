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
function load(relative) {
  const filename = path.resolve(root, relative);
  if (modules.has(filename)) return modules.get(filename).exports;
  const module = { exports: {} };
  modules.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const localRequire = (specifier) => {
    if (specifier === "server-only") return {};
    if (specifier === "next/server") return { NextResponse: { json: (data, init) => Response.json(data, init) } };
    if (specifier === "next/headers") return { cookies: () => ({ get: () => actionCookie ? { value: actionCookie } : undefined }) };
    if (specifier === "next/cache") return { revalidatePath: (route) => revalidated.push(route) };
    if (specifier.endsWith("supabase/server")) return { createSupabaseServiceClient: () => database };
    if (specifier.startsWith("@/")) return load(`src/${specifier.slice(2)}.ts`);
    if (specifier.startsWith(".")) return load(path.relative(root, path.resolve(path.dirname(filename), `${specifier}.ts`)));
    return require(specifier);
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(localRequire, module, module.exports);
  return module.exports;
}


const studentActions = load("src/app/me/actions.ts");
const avatarCatalog = load("src/lib/avatar-v2.ts");
const { DEFAULT_LOOK, normalizeLook } = avatarCatalog;
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


  await test("saved v3 converts to original garments and saves only the avatar column", async () => {
    const avatar = Object.freeze({ ...DEFAULT_LOOK, version: 3, face: "rabbit", hair: "bob", hairColor: "rose", top: "long_dress", topColor: "lilac", bottom: "cargo_pants", bottomColor: "navy", shoes: "high_tops", hat: "beanie", bag: "tote", bagColor: "sage", glasses: "sunglasses", glassesColor: "navy", neckwear: "scarf", neckwearColor: "rose" });
    database = mockDb(() => ({ data: { id: selfId }, error: null }));
    assert.equal((await studentActions.updateAvatarAction({ avatar })).ok, true);
    assert.equal(database.calls.length, 1);
    const written = operation(database.calls[0], "update")[1];
    assert.deepEqual(written, { avatar: normalizeLook(avatar) });
    assert.equal(written.avatar.version, 2);
    assert.equal(written.avatar.top, "dress");
    assert.equal(written.avatar.face, "rabbit");
    assert.equal(written.avatar.topColor, "lilac");
    assert.equal(avatar.version, 3);
    for (const invalid of [{ ...avatar, bag: "unknown" }, { ...avatar, image: "https://example.invalid/x.svg" }, { ...DEFAULT_LOOK, top: "tee" }]) {
      database = mockDb(defaultResponder);
      assert.equal((await studentActions.updateAvatarAction({ avatar: invalid })).ok, false);
      assert.equal(database.calls.length, 0);
    }
  });
  await test("availability guard still runs before any avatar write", async () => {
    const originalGate = avatarCatalog.isLookAvailable;
    try {
      avatarCatalog.isLookAvailable = () => false;
      database = mockDb(defaultResponder);
      assert.equal((await studentActions.updateAvatarAction({ avatar: DEFAULT_LOOK })).ok, false);
      assert.equal(database.calls.length, 0);
    } finally { avatarCatalog.isLookAvailable = originalGate; }
  });

} finally {
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
}
console.log(`Passed ${checks} original-avatar save checks. No live services used.`);
