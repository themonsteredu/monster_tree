// Vercel Cron 전용 — 매일 저녁 미수령 포인트 리마인더 자동 발송 (전 지점).
// vercel.json 의 crons 가 이 경로를 호출한다. Vercel 은 CRON_SECRET 환경변수가
// 있으면 Authorization: Bearer <CRON_SECRET> 헤더를 붙여 호출하므로 그걸 검증.
// CRON_SECRET 미설정 시 이 라우트는 잠긴 상태로 아무것도 하지 않는다.

import { NextResponse } from "next/server";
import { sendPendingPointsPushes } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }
  const result = await sendPendingPointsPushes({});
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
