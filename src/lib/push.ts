// 웹 푸시 발송 헬퍼 (서버 전용) — 미수령 포인트 리마인더.
//
// VAPID 키 3개(VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / NEXT_PUBLIC_VAPID_PUBLIC_KEY)가
// 설정되지 않으면 기능 전체가 조용히 비활성화된다 (isPushConfigured=false).
// 발송 경로는 두 곳에서 공유:
//   - /admin "미수령 알림 보내기" 버튼 → sendPendingPointsPushAction (지점 스코프)
//   - Vercel Cron → /api/push-pending (전 지점)

import webpush from "web-push";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export function isPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export type PushSendResult = {
  ok: boolean;
  message: string;
  /** 미수령 포인트가 있고 구독도 있는 학생 수 */
  students: number;
  /** 성공적으로 발송된 알림(기기) 수 */
  sent: number;
  /** 만료돼서 삭제한 구독 수 */
  cleaned: number;
};

type SubscriptionRow = {
  id: string;
  student_id: string;
  endpoint: string;
  keys: { p256dh?: string; auth?: string } | null;
};

// 미수령(garden_pending_points) 학생들의 구독 기기로 리마인더 발송.
// branchId 를 주면 그 지점 학생만 (admin 버튼), 없으면 전 지점 (cron).
export async function sendPendingPointsPushes(opts: {
  branchId?: string;
}): Promise<PushSendResult> {
  if (!isPushConfigured()) {
    return {
      ok: false,
      message:
        "알림 키(VAPID)가 아직 설정되지 않았어요. Vercel 환경변수 설정 후 사용할 수 있어요.",
      students: 0,
      sent: 0,
      cleaned: 0,
    };
  }

  const sb = createSupabaseServiceClient();

  // 1) 미수령 포인트 집계 (학생별 건수) — 차감 대기(-)도 "처리할 것"이므로 포함.
  const { data: pendingRows, error: pendingError } = await sb
    .from("garden_pending_points")
    .select("student_id, points, garden_students!inner(id, name, branch_id)");
  if (pendingError) {
    return {
      ok: false,
      message: `미수령 목록 조회 실패: ${pendingError.message}`,
      students: 0,
      sent: 0,
      cleaned: 0,
    };
  }

  const byStudent = new Map<string, { name: string; count: number }>();
  for (const row of pendingRows ?? []) {
    const student = row.garden_students as unknown as {
      id: string;
      name: string;
      branch_id: string;
    } | null;
    if (!student) continue;
    if (opts.branchId && student.branch_id !== opts.branchId) continue;
    const cur = byStudent.get(student.id);
    if (cur) cur.count += 1;
    else byStudent.set(student.id, { name: student.name, count: 1 });
  }

  if (byStudent.size === 0) {
    return {
      ok: true,
      message: "미수령 포인트가 있는 학생이 없어요.",
      students: 0,
      sent: 0,
      cleaned: 0,
    };
  }

  // 2) 해당 학생들의 푸시 구독 조회.
  const { data: subs, error: subsError } = await sb
    .from("garden_push_subscriptions")
    .select("id, student_id, endpoint, keys")
    .in("student_id", Array.from(byStudent.keys()));
  if (subsError) {
    return {
      ok: false,
      message: `구독 조회 실패: ${subsError.message}`,
      students: 0,
      sent: 0,
      cleaned: 0,
    };
  }
  const subRows = (subs ?? []) as SubscriptionRow[];
  if (subRows.length === 0) {
    return {
      ok: true,
      message: `미수령 학생 ${byStudent.size}명 중 알림을 켠 학생이 아직 없어요.`,
      students: 0,
      sent: 0,
      cleaned: 0,
    };
  }

  // 3) 발송. 410 Gone / 404 는 만료된 구독 → 삭제.
  const vapidDetails = {
    subject: "https://www.themonster.kr",
    publicKey: process.env.VAPID_PUBLIC_KEY as string,
    privateKey: process.env.VAPID_PRIVATE_KEY as string,
  };

  let sent = 0;
  const staleIds: string[] = [];
  const reachedStudents = new Set<string>();

  await Promise.all(
    subRows.map(async (sub) => {
      const info = byStudent.get(sub.student_id);
      if (!info || !sub.keys?.p256dh || !sub.keys?.auth) return;
      const payload = JSON.stringify({
        title: "🍎 사과정원",
        body: `${info.name}님, 받지 않은 포인트 선물이 ${info.count}개 기다리고 있어요! 받기 버튼을 눌러주세요 🍏`,
        url: "/tree/me",
      });
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
          },
          payload,
          { vapidDetails, TTL: 12 * 3600 },
        );
        sent += 1;
        reachedStudents.add(sub.student_id);
      } catch (e) {
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) staleIds.push(sub.id);
        // 그 외 실패(일시 네트워크 등)는 구독 유지하고 넘어간다.
      }
    }),
  );

  if (staleIds.length > 0) {
    await sb.from("garden_push_subscriptions").delete().in("id", staleIds);
  }

  return {
    ok: true,
    message:
      sent > 0
        ? `학생 ${reachedStudents.size}명에게 알림 ${sent}건을 보냈어요.` +
          (staleIds.length > 0 ? ` (만료 구독 ${staleIds.length}개 정리)` : "")
        : "보낼 수 있는 구독이 없었어요. (학생이 알림을 켰는지 확인해주세요)",
    students: reachedStudents.size,
    sent,
    cleaned: staleIds.length,
  };
}
