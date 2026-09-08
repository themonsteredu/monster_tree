// Run: node scripts/test-student-jwt.mjs. Only locally signed fixtures; no real sessions or network.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { SignJWT, jwtVerify } from "jose";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/lib/student-jwt.ts", import.meta.url), "utf8");
const module = { exports: {} };
const testEnv = { JWT_SECRET: "local-security-regression-only-".repeat(3) };
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, {
  module, exports: module.exports, TextEncoder, process: { env: testEnv },
  require: (name) => { assert.equal(name, "jose"); return { jwtVerify }; },
});
const verify = module.exports.verifyStudentJwt;
const secret = new TextEncoder().encode(testEnv.JWT_SECRET);
const claims = { branchId: "local-branch", studentLocalId: 11, loginId: "local-private-login", name: "테스트" };
const sign = (body, alg = "HS256", expiry = "5m", key = secret) => new SignJWT(body)
  .setProtectedHeader({ alg }).setIssuedAt().setExpirationTime(expiry).sign(key);
const valid = await sign(claims);
assert.equal(JSON.stringify(await verify(valid)), JSON.stringify(claims));
let checks = 1;
for (const token of [
  undefined, "not-a-jwt", await sign(claims, "HS512"), await sign(claims, "HS256", 1),
  await sign(claims, "HS256", "5m", new TextEncoder().encode("different-local-key-".repeat(5))),
  await sign({ ...claims, studentLocalId: "11" }),
]) { assert.equal(await verify(token), null); checks++; }
delete testEnv.JWT_SECRET;
assert.equal(await verify(valid), null);
checks++;
console.log(`Passed ${checks} HS256, signature, expiry, claim and missing-secret checks. No live services used.`);
