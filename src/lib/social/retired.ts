import { NextResponse } from "next/server";

// The live plaza is owned by monster-site. Never import auth or a database client here.
export function getSitePlazaUrl(): string {
  const fallback = "https://www.themonster.kr/plaza";
  try {
    const base = new URL(process.env.NEXT_PUBLIC_MONSTER_SITE_URL || "https://www.themonster.kr");
    if (!["https:", "http:"].includes(base.protocol) || base.username || base.password) return fallback;
    return new URL("/plaza", base).href;
  } catch { return fallback; }
}

export function retiredSocialResponse(): NextResponse {
  return NextResponse.json({
    ok: false,
    error: "광장은 새 사이트로 이사했어요. 새 광장으로 이동해 주세요.",
    redirectTo: getSitePlazaUrl(),
  }, { status: 410, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
