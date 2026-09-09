import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { STUDENT_COOKIE_NAME, verifyStudentJwt } from "./student-jwt";
import { getSitePlazaUrl } from "./social/retired";
import { parseYardSign, parseYardSignInput } from "./yard-sign";

const MAX_BYTES = 1024;
const UNAVAILABLE = "간판을 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.";

class SignError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: {
    "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie", "X-Content-Type-Options": "nosniff",
  } });
}

function siteEndpoint(): URL {
  // The destination is server configuration only, never a request parameter or header.
  const target = new URL("/api/plaza/sign", getSitePlazaUrl());
  if (target.protocol !== "https:" && process.env.NODE_ENV !== "development") {
    throw new SignError(503, UNAVAILABLE);
  }
  return target;
}

function assertWriteOrigin(request: NextRequest, target: URL): void {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null" || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new SignError(403, "내 마당 화면에서 다시 시도해 주세요.");
  }
  const allowed = new Set([new URL(request.url).origin, target.origin]);
  for (const host of [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]) {
    if (host && /^[a-zA-Z0-9.-]+$/.test(host)) allowed.add(`https://${host}`);
  }
  try {
    if (new URL(origin).origin !== origin || !allowed.has(origin)) throw new Error();
  } catch { throw new SignError(403, "내 마당 화면에서 다시 시도해 주세요."); }
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new SignError(415, "올바른 저장 형식이 아니에요.");
  }
}

async function readBoundedJson(message: Request | Response): Promise<unknown> {
  const length = message.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) {
    throw new SignError(413, "간판 문구가 너무 길어요.");
  }
  const reader = message.body?.getReader();
  if (!reader) throw new SignError(400, "간판 문구를 입력해 주세요.");
  const chunks: Uint8Array[] = [];
  let count = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      count += value.byteLength;
      if (count > MAX_BYTES) { await reader.cancel(); throw new SignError(413, "간판 문구가 너무 길어요."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(count);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new SignError(400, "간판 문구를 확인해 주세요."); }
}

export async function handleYardSign(request: NextRequest) {
  try {
    const target = siteEndpoint();
    if (request.method === "POST") assertWriteOrigin(request, target);
    const token = request.cookies.get(STUDENT_COOKIE_NAME)?.value;
    if (!token || token.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) ||
        !await verifyStudentJwt(token)) {
      throw new SignError(401, "다시 로그인한 뒤 간판을 바꿔 주세요.");
    }
    let signText: string | null = null;
    if (request.method === "POST") {
      signText = parseYardSignInput(await readBoundedJson(request));
      if (signText === null) throw new SignError(400, "간판은 줄바꿈 없이 1~24자로 적어 주세요.");
    }
    // Only the existing signed student cookie leaves TREE. SITE independently checks
    // the current credential and active TREE membership before reading/writing its own DB.
    const response = await fetch(target, {
      method: request.method === "POST" ? "POST" : "GET",
      headers: {
        Cookie: `${STUDENT_COOKIE_NAME}=${token}`, Accept: "application/json",
        ...(signText !== null ? { "Content-Type": "application/json", Origin: target.origin } : {}),
      },
      ...(signText !== null ? { body: JSON.stringify({ signText }) } : {}),
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const status = [400, 401, 403, 413, 415, 429].includes(response.status) ? response.status : 503;
      const message = status === 401 ? "다시 로그인한 뒤 간판을 바꿔 주세요."
        : status === 403 ? "내 간판만 바꿀 수 있어요. 학생 로그인을 확인해 주세요."
        : status === 429 ? "잠시 기다렸다가 다시 저장해 주세요." : UNAVAILABLE;
      throw new SignError(status, message);
    }
    if (response.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new SignError(503, UNAVAILABLE);
    let value: unknown;
    try { value = await readBoundedJson(response); } catch { throw new SignError(503, UNAVAILABLE); }
    const result = value as { ok?: unknown; signText?: unknown } | null;
    const saved = result?.ok === true ? parseYardSign(result.signText) : null;
    if (saved === null) throw new SignError(503, UNAVAILABLE);
    // Never pass through upstream headers, identifiers, tokens, or diagnostic errors.
    return json({ ok: true, signText: saved });
  } catch (error) {
    return error instanceof SignError
      ? json({ ok: false, error: error.message }, error.status)
      : json({ ok: false, error: UNAVAILABLE }, 503);
  }
}
