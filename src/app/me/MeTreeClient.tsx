"use client";

// /tree/me 클라이언트 렌더러.
// 초기 데이터는 서버에서 SSR 으로 주입하고,
// 이후 garden_students UPDATE 를 Realtime 구독해 포인트/단계/사과 수 변화를
// 페이지 새로고침 없이 반영한다.
//
// Phase 1: 시각적 풍부 — AppleTree SVG, 단계별 액센트, 단계 배지, 수확 배지.
// Phase 2: 정보 풍부 — 이번 주/이번 달 통계, 최근 활동 타임라인, 수확 히스토리.
// Phase 3: 동기부여 — 격려 멘트, 다음 단계 미리보기, 마일스톤 뱃지.
// Phase 4: 인터랙션 — 실시간 +pt 토스트, 단계업 컨페티/배너, 수확 가능 펄스, 수확 배너.

import { useEffect, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { AppleTree } from "@/components/AppleTree";
import {
  STAGE_TABLE,
  calculateStage,
  getStageInfo,
  pointsToNextStage,
  stageProgress,
} from "@/lib/garden";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Row = {
  id: string;
  total_points: number | null;
  current_stage: number | null;
  apples_harvested: number | null;
  grade: string | null;
};

type PointLog = {
  id: string;
  points: number;
  reason: string | null;
  logged_at: string;
};

type Harvest = {
  id: string;
  apples_count: number;
  harvested_at: string;
};

type Toast = {
  id: string;
  points: number;
  reason: string | null;
};

type StageUpBanner = {
  id: string;
  stage: number;
  name: string;
  isHarvest: boolean;
};

type HarvestBanner = {
  id: string;
  applesCount: number;
};

const TOAST_MS = 3500;
const STAGE_UP_BANNER_MS = 4500;
const HARVEST_BANNER_MS = 5000;

const STAGE_ACCENT: Record<
  number,
  {
    pageBg: string;
    pageBgEnd: string;
    badgeBg: string;
    badgeText: string;
    barFill: string;
    emoji: string;
  }
> = {
  1: {
    pageBg: "#fffaf2",
    pageBgEnd: "#fef0d6",
    badgeBg: "#fef9ed",
    badgeText: "#8a6f52",
    barFill: "linear-gradient(90deg, #b8a382, #d6c2a0)",
    emoji: "🪴",
  },
  2: {
    pageBg: "#fef9ed",
    pageBgEnd: "#f3eadc",
    badgeBg: "#f3eadc",
    badgeText: "#3d2818",
    barFill: "linear-gradient(90deg, #a87454, #d6a888)",
    emoji: "🌱",
  },
  3: {
    pageBg: "#f7fcec",
    pageBgEnd: "#dbecc1",
    badgeBg: "#dbecc1",
    badgeText: "#4a8030",
    barFill: "linear-gradient(90deg, #5e9c38, #a8e070)",
    emoji: "🌿",
  },
  4: {
    pageBg: "#f4fae6",
    pageBgEnd: "#cfe6a8",
    badgeBg: "#cfe6a8",
    badgeText: "#4a8030",
    barFill: "linear-gradient(90deg, #5e9c38, #a8e070)",
    emoji: "🌳",
  },
  5: {
    pageBg: "#f0f8e0",
    pageBgEnd: "#bfdc8a",
    badgeBg: "#bfdc8a",
    badgeText: "#4a8030",
    barFill: "linear-gradient(90deg, #4a8030, #8ec85c)",
    emoji: "🌳",
  },
  6: {
    pageBg: "#fef0f6",
    pageBgEnd: "#f8d8e8",
    badgeBg: "#f8d8e8",
    badgeText: "#b0398e",
    barFill: "linear-gradient(90deg, #c87fdb, #ffb8d4)",
    emoji: "🌸",
  },
  7: {
    pageBg: "#fff0eb",
    pageBgEnd: "#ffd6c8",
    badgeBg: "#ffd6c8",
    badgeText: "#b02020",
    barFill: "linear-gradient(90deg, #f04848, #ffb0a0)",
    emoji: "🍎",
  },
  8: {
    pageBg: "#fffadd",
    pageBgEnd: "#f7d878",
    badgeBg: "#f0c050",
    badgeText: "#3d2818",
    barFill: "linear-gradient(90deg, #e8a020, #f0c050)",
    emoji: "★",
  },
};

type Milestone = {
  key: string;
  emoji: string;
  name: string;
  achieved: boolean;
};

function buildMilestones(maxStageEver: number, applesHarvested: number): Milestone[] {
  return [
    { key: "s2", emoji: "🌱", name: "첫 씨앗", achieved: maxStageEver >= 2 },
    { key: "s3", emoji: "🌿", name: "새싹", achieved: maxStageEver >= 3 },
    { key: "s4", emoji: "🌳", name: "어린나무", achieved: maxStageEver >= 4 },
    { key: "s5", emoji: "🌳", name: "큰나무", achieved: maxStageEver >= 5 },
    { key: "s6", emoji: "🌸", name: "꽃피움", achieved: maxStageEver >= 6 },
    { key: "s7", emoji: "🍎", name: "열매", achieved: maxStageEver >= 7 },
    { key: "h1", emoji: "🏆", name: "첫 수확", achieved: applesHarvested >= 1 },
    { key: "h5", emoji: "🥇", name: "사과왕", achieved: applesHarvested >= 5 },
    { key: "h10", emoji: "🌟", name: "사과 마스터", achieved: applesHarvested >= 10 },
  ];
}

function pickEncouragement(args: {
  isHarvest: boolean;
  applesHarvested: number;
  weekTotal: number;
  monthTotal: number;
  hasAnyLogs: boolean;
}): { text: string; tone: "celebrate" | "warm" | "neutral" | "soft" } {
  const { isHarvest, applesHarvested, weekTotal, monthTotal, hasAnyLogs } = args;
  if (isHarvest && applesHarvested === 0) {
    return {
      text: "🎉 8단계 도달 축하해요! 곧 사과를 딸 수 있어요",
      tone: "celebrate",
    };
  }
  if (isHarvest && applesHarvested > 0) {
    return {
      text: "🍎 또 수확할 수 있어요! 멋진 페이스예요",
      tone: "celebrate",
    };
  }
  if (weekTotal >= 30) {
    return {
      text: "🔥 이번 주 정말 열심히 하고 있어요! 멋져요",
      tone: "celebrate",
    };
  }
  if (weekTotal >= 15) {
    return { text: "💪 좋은 페이스로 자라고 있어요", tone: "warm" };
  }
  if (weekTotal >= 5) {
    return { text: "🌱 한 발씩 차근차근 자라는 중!", tone: "warm" };
  }
  if (weekTotal < 0) {
    return {
      text: "🌧 이번 주는 살짝 차감이 있었어요. 다시 한 걸음씩 가봐요",
      tone: "soft",
    };
  }
  if (!hasAnyLogs) {
    return {
      text: "🌟 사과정원에 오신 걸 환영해요! 첫 포인트를 기다리고 있어요",
      tone: "neutral",
    };
  }
  if (monthTotal > 0) {
    return { text: "💡 이번 주 새 도전을 시작해 봐요!", tone: "neutral" };
  }
  return { text: "🌳 천천히 자라는 게 좋은 거예요", tone: "neutral" };
}

function getWeekStart(now: Date): Date {
  const d = new Date(now);
  const day = d.getDay();
  const daysFromMonday = (day + 6) % 7;
  d.setDate(d.getDate() - daysFromMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatRelative(iso: string, now: Date): string {
  const d = new Date(iso);
  const diffMs = now.getTime() - d.getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day}일 전`;
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${m}/${dd}`;
}

function fireConfetti(harvest: boolean) {
  const colors = ["#f0c050", "#f04848", "#5e9c38", "#c87fdb", "#ffb8d4"];
  if (harvest) {
    const end = Date.now() + 2_500;
    const tick = () => {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 65,
        origin: { x: 0, y: 0.7 },
        colors,
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 65,
        origin: { x: 1, y: 0.7 },
        colors,
      });
      if (Date.now() < end) requestAnimationFrame(tick);
    };
    tick();
  } else {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.55 },
      colors,
    });
  }
}

export function MeTreeClient({
  initialRow,
  studentName,
  initialPointLogs,
  initialHarvests,
}: {
  initialRow: Row | null;
  studentName: string;
  initialPointLogs: PointLog[];
  initialHarvests: Harvest[];
}) {
  const [row, setRow] = useState<Row | null>(initialRow);
  const [now, setNow] = useState<Date | null>(null);
  // 실시간 인터랙션 상태
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [stageUp, setStageUp] = useState<StageUpBanner | null>(null);
  const [harvestBanner, setHarvestBanner] = useState<HarvestBanner | null>(null);
  // 단계 변화 감지용 (단계 증가 시 컨페티 + 배너)
  const prevStageRef = useRef<number>(initialRow?.current_stage ?? 1);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Realtime 구독
  useEffect(() => {
    if (!initialRow) return;
    const sb = createSupabaseBrowserClient();
    if (!sb) return;

    const channel = sb
      .channel(`me:${initialRow.id}`)
      // 본인 행 갱신 (포인트/단계/사과 수)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "garden_students",
          filter: `id=eq.${initialRow.id}`,
        },
        (payload) => {
          const next = payload.new as Partial<Row> | null;
          if (!next) return;
          // 단계 상승 감지 → 컨페티 + 배너 (수확 후 5단계로 떨어지는 건 무시)
          const prevStage = prevStageRef.current;
          const newStage = next.current_stage ?? prevStage;
          if (newStage > prevStage) {
            const info = getStageInfo(newStage as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8);
            const isHarvest = newStage === 8;
            setStageUp({
              id: `${Date.now()}`,
              stage: newStage,
              name: info.name,
              isHarvest,
            });
            fireConfetti(isHarvest);
          }
          prevStageRef.current = newStage;

          setRow((prev) => ({
            id: initialRow.id,
            total_points: next.total_points ?? prev?.total_points ?? 0,
            current_stage: newStage,
            apples_harvested:
              next.apples_harvested ?? prev?.apples_harvested ?? 0,
            grade: next.grade ?? prev?.grade ?? null,
          }));
        },
      )
      // 본인 포인트 적립/차감 로그 → 토스트
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "garden_point_logs",
          filter: `student_id=eq.${initialRow.id}`,
        },
        (payload) => {
          const log = payload.new as PointLog;
          if (!log) return;
          const id = `${log.id}-${Date.now()}`;
          setToasts((prev) => [
            ...prev,
            { id, points: log.points, reason: log.reason },
          ]);
          // 자동 dismiss
          window.setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
          }, TOAST_MS);
        },
      )
      // 본인 수확 기록 → 수확 배너
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "garden_harvests",
          filter: `student_id=eq.${initialRow.id}`,
        },
        (payload) => {
          const h = payload.new as { apples_count: number; id: string };
          if (!h) return;
          setHarvestBanner({
            id: `${h.id}-${Date.now()}`,
            applesCount: h.apples_count,
          });
          fireConfetti(true);
        },
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [initialRow]);

  // 단계 상승 배너 자동 dismiss
  useEffect(() => {
    if (!stageUp) return;
    const id = stageUp.id;
    const t = window.setTimeout(() => {
      setStageUp((cur) => (cur?.id === id ? null : cur));
    }, STAGE_UP_BANNER_MS);
    return () => clearTimeout(t);
  }, [stageUp]);

  // 수확 배너 자동 dismiss
  useEffect(() => {
    if (!harvestBanner) return;
    const id = harvestBanner.id;
    const t = window.setTimeout(() => {
      setHarvestBanner((cur) => (cur?.id === id ? null : cur));
    }, HARVEST_BANNER_MS);
    return () => clearTimeout(t);
  }, [harvestBanner]);

  const points = row?.total_points ?? 0;
  const stage = calculateStage(points);
  const info = getStageInfo(stage);
  const progress = stageProgress(points);
  const remain = pointsToNextStage(points);
  const accent = STAGE_ACCENT[stage] ?? STAGE_ACCENT[1];
  const isHarvest = stage === 8;
  const applesHarvested = row?.apples_harvested ?? 0;
  const maxStageEver = applesHarvested > 0 ? 8 : stage;

  const nextStage = stage < 8 ? ((stage + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8) : null;
  const nextInfo = nextStage ? getStageInfo(nextStage) : null;
  const nextAccent = nextStage ? STAGE_ACCENT[nextStage] : null;

  const stats = useMemo(() => {
    if (!now) return { weekTotal: 0, monthTotal: 0 };
    const weekStart = getWeekStart(now);
    let weekTotal = 0;
    let monthTotal = 0;
    for (const log of initialPointLogs) {
      const t = new Date(log.logged_at).getTime();
      if (t >= weekStart.getTime()) weekTotal += log.points;
      monthTotal += log.points;
    }
    return { weekTotal, monthTotal };
  }, [initialPointLogs, now]);

  const milestones = useMemo(
    () => buildMilestones(maxStageEver, applesHarvested),
    [maxStageEver, applesHarvested],
  );

  const encouragement = useMemo(() => {
    if (now === null) return null;
    return pickEncouragement({
      isHarvest,
      applesHarvested,
      weekTotal: stats.weekTotal,
      monthTotal: stats.monthTotal,
      hasAnyLogs: initialPointLogs.length > 0,
    });
  }, [now, isHarvest, applesHarvested, stats, initialPointLogs.length]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: `linear-gradient(180deg, ${accent.pageBg} 0%, ${accent.pageBgEnd} 100%)`,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: 20,
        fontFamily:
          '"Pretendard Variable", "Pretendard", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        transition: "background 600ms ease",
      }}
    >
      <div
        style={{
          background: isHarvest ? "#fff5d6" : "#fff",
          borderRadius: 24,
          padding: "32px 24px",
          width: "100%",
          maxWidth: 480,
          boxShadow: isHarvest
            ? "0 0 0 4px rgba(240,192,80,0.45), 0 10px 40px rgba(61,40,24,0.12)"
            : "0 10px 40px rgba(61,40,24,0.08)",
          border: `2px solid ${isHarvest ? "#e8a020" : "#f1e8d8"}`,
        }}
      >
        {/* 헤더 */}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "#9a8b6c", fontWeight: 600 }}>
            나의 사과정원
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "#1f2937",
              marginTop: 4,
            }}
          >
            {studentName}
          </div>
          {row?.grade && (
            <div
              style={{
                fontSize: 13,
                color: "#9a8b6c",
                marginTop: 2,
                fontWeight: 600,
              }}
            >
              {row.grade}
            </div>
          )}
        </div>

        {!row ? (
          <div
            style={{
              padding: 20,
              borderRadius: 14,
              background: "#fef9ed",
              color: "#7a6233",
              fontSize: 14,
              lineHeight: 1.6,
              textAlign: "center",
            }}
          >
            아직 나무가 심어지지 않았어요.
            <br />
            원장님께 문의해주세요.
          </div>
        ) : (
          <>
            {/* 단계 배지 + 수확 가능 배지 (8단계는 펄스 애니메이션) */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 8,
                marginBottom: 8,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 14px",
                  borderRadius: 999,
                  background: accent.badgeBg,
                  color: accent.badgeText,
                  fontSize: 13,
                  fontWeight: 800,
                  border: `2px solid #3d2818`,
                  boxShadow: "0 2px 6px rgba(61,40,24,0.10)",
                }}
              >
                <span>{accent.emoji}</span>
                <span>
                  {stage}단계 · {info.name}
                </span>
              </span>
              {isHarvest && (
                <span
                  className="harvest-pulse"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 14px",
                    borderRadius: 999,
                    background: "#f0c050",
                    color: "#3d2818",
                    fontSize: 13,
                    fontWeight: 800,
                    border: "2px solid #3d2818",
                  }}
                >
                  ★ 수확 가능!
                </span>
              )}
            </div>

            {/* AppleTree SVG */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                margin: "8px 0 12px",
              }}
            >
              <AppleTree
                stage={stage}
                size="xl"
                mood="happy"
                growthBoost={progress}
              />
            </div>

            {/* 격려 멘트 */}
            {encouragement && (
              <EncouragementCard
                text={encouragement.text}
                tone={encouragement.tone}
              />
            )}

            {/* 단계 정보 */}
            <div style={{ textAlign: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: "#9a8b6c" }}>
                {STAGE_TABLE.length}단계 중 {stage}단계
              </div>
            </div>

            {/* 통계 카드 */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                marginBottom: 14,
              }}
            >
              <Stat label="누적 포인트" value={`${points} P`} tone="primary" />
              <Stat
                label="수확한 사과"
                value={`${applesHarvested}개`}
                tone="primary"
              />
              <Stat
                label="이번 주 적립"
                value={
                  now === null
                    ? "—"
                    : `${stats.weekTotal >= 0 ? "+" : ""}${stats.weekTotal} P`
                }
                tone={stats.weekTotal >= 0 ? "positive" : "negative"}
              />
              <Stat
                label="이번 달 적립"
                value={
                  now === null
                    ? "—"
                    : `${stats.monthTotal >= 0 ? "+" : ""}${stats.monthTotal} P`
                }
                tone={stats.monthTotal >= 0 ? "positive" : "negative"}
              />
            </div>

            {/* 진행도 바 */}
            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  height: 12,
                  borderRadius: 999,
                  background: "#f0e6d4",
                  overflow: "hidden",
                  border: "1.5px solid #d6c2a0",
                }}
              >
                <div
                  style={{
                    width: `${Math.round(progress * 100)}%`,
                    height: "100%",
                    background: accent.barFill,
                    transition: "width 600ms ease",
                  }}
                />
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "#9a8b6c",
                  marginTop: 6,
                  textAlign: "center",
                  fontWeight: 600,
                }}
              >
                {info.nextThreshold === null
                  ? "🎉 최고 단계 도달!"
                  : `다음 단계까지 ${remain} P`}
              </div>
            </div>

            {/* 다음 단계 미리보기 */}
            {nextStage && nextInfo && nextAccent && (
              <NextStagePreview
                stage={nextStage}
                name={nextInfo.name}
                threshold={nextInfo.threshold}
                emoji={nextAccent.emoji}
                badgeBg={nextAccent.badgeBg}
                badgeText={nextAccent.badgeText}
              />
            )}

            {/* 마일스톤 */}
            <Section title="🏆 마일스톤">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 8,
                }}
              >
                {milestones.map((m) => (
                  <MilestoneBadge key={m.key} {...m} />
                ))}
              </div>
            </Section>

            {/* 최근 활동 */}
            <Section title="📋 최근 활동">
              {initialPointLogs.length === 0 ? (
                <Empty text="이번 달 활동 기록이 없어요" />
              ) : (
                <ul
                  style={{
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  {initialPointLogs.slice(0, 10).map((log) => (
                    <LogRow key={log.id} log={log} now={now} />
                  ))}
                </ul>
              )}
            </Section>

            {/* 수확 히스토리 */}
            {initialHarvests.length > 0 && (
              <Section title="🍎 수확 히스토리">
                <ul
                  style={{
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  {initialHarvests.slice(0, 5).map((h) => (
                    <HarvestRow key={h.id} harvest={h} now={now} />
                  ))}
                </ul>
              </Section>
            )}
          </>
        )}

        <div style={{ marginTop: 20, textAlign: "center" }}>
          <a
            href="https://www.themonster.kr/student"
            style={{
              fontSize: 13,
              color: "#F26522",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            ← 학생 홈으로
          </a>
        </div>
      </div>

      {/* 토스트 스택 (하단 가운데) */}
      <div
        aria-live="polite"
        style={{
          position: "fixed",
          left: "50%",
          bottom: 24,
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column-reverse",
          gap: 8,
          zIndex: 50,
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} />
        ))}
      </div>

      {/* 단계 상승 배너 */}
      {stageUp && (
        <StageUpModal
          stage={stageUp.stage}
          name={stageUp.name}
          isHarvest={stageUp.isHarvest}
          studentName={studentName}
          onClose={() => setStageUp(null)}
        />
      )}

      {/* 수확 배너 */}
      {harvestBanner && (
        <HarvestModal
          applesCount={harvestBanner.applesCount}
          studentName={studentName}
          onClose={() => setHarvestBanner(null)}
        />
      )}
    </main>
  );
}

/* ================================================================
   Phase 4: Toast / StageUpModal / HarvestModal
================================================================ */

function ToastCard({ toast }: { toast: Toast }) {
  const isPositive = toast.points >= 0;
  return (
    <div
      className="toast-in"
      style={{
        background: isPositive ? "#5e9c38" : "#b04020",
        color: "#fff",
        padding: "10px 16px",
        borderRadius: 999,
        fontSize: 14,
        fontWeight: 800,
        boxShadow: "0 8px 20px rgba(61,40,24,0.25)",
        border: "2px solid #3d2818",
        display: "flex",
        alignItems: "center",
        gap: 10,
        whiteSpace: "nowrap",
        maxWidth: "calc(100vw - 40px)",
      }}
    >
      <span style={{ fontSize: 16 }}>{isPositive ? "✨" : "⚠️"}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>
        {isPositive ? "+" : ""}
        {toast.points} P
      </span>
      {toast.reason && (
        <>
          <span style={{ opacity: 0.6 }}>·</span>
          <span
            style={{
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {toast.reason}
          </span>
        </>
      )}
    </div>
  );
}

function StageUpModal({
  stage,
  name,
  isHarvest,
  studentName,
  onClose,
}: {
  stage: number;
  name: string;
  isHarvest: boolean;
  studentName: string;
  onClose: () => void;
}) {
  const accent = STAGE_ACCENT[stage] ?? STAGE_ACCENT[1];
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(61,40,24,0.35)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 100,
        cursor: "pointer",
      }}
    >
      <div
        className="banner-pop"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: isHarvest
            ? "linear-gradient(180deg, #fff5d6 0%, #f0c050 100%)"
            : "linear-gradient(180deg, #fff 0%, #fff5d6 100%)",
          border: `3px solid ${isHarvest ? "#e8a020" : "#3d2818"}`,
          borderRadius: 28,
          padding: "32px 28px",
          textAlign: "center",
          maxWidth: 360,
          boxShadow: "0 20px 60px rgba(61,40,24,0.35)",
          cursor: "default",
        }}
      >
        <div style={{ fontSize: 56, lineHeight: 1, marginBottom: 8 }}>
          {isHarvest ? "🎉" : accent.emoji}
        </div>
        <div
          style={{
            fontSize: 14,
            color: "#8a6f52",
            fontWeight: 700,
            marginBottom: 4,
          }}
        >
          축하해요!
        </div>
        <div
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: "#3d2818",
            marginBottom: 8,
          }}
        >
          {studentName} 학생
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: "#3d2818",
          }}
        >
          {isHarvest ? (
            <>
              사과를 <span style={{ color: "#b02020" }}>수확</span>할 수 있어요!
            </>
          ) : (
            <>
              <span style={{ color: "#4a8030" }}>{name}</span> 단계로 성장!
            </>
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            marginTop: 18,
            padding: "8px 20px",
            borderRadius: 999,
            background: "#3d2818",
            color: "#fff",
            fontSize: 13,
            fontWeight: 800,
            border: "none",
            cursor: "pointer",
          }}
        >
          확인
        </button>
      </div>
    </div>
  );
}

function HarvestModal({
  applesCount,
  studentName,
  onClose,
}: {
  applesCount: number;
  studentName: string;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(61,40,24,0.35)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 100,
        cursor: "pointer",
      }}
    >
      <div
        className="banner-pop"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "linear-gradient(180deg, #fff5d6 0%, #f7d878 100%)",
          border: "3px solid #e8a020",
          borderRadius: 28,
          padding: "32px 28px",
          textAlign: "center",
          maxWidth: 360,
          boxShadow: "0 20px 60px rgba(61,40,24,0.35)",
          cursor: "default",
        }}
      >
        <div style={{ fontSize: 56, lineHeight: 1, marginBottom: 8 }}>🍎</div>
        <div
          style={{
            fontSize: 14,
            color: "#8a6f52",
            fontWeight: 700,
            marginBottom: 4,
          }}
        >
          수확 완료!
        </div>
        <div
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: "#3d2818",
            marginBottom: 8,
          }}
        >
          {studentName} 학생
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: "#3d2818",
          }}
        >
          사과 <span style={{ color: "#b02020" }}>{applesCount}개</span> 를
          수확했어요!
        </div>
        <button
          onClick={onClose}
          style={{
            marginTop: 18,
            padding: "8px 20px",
            borderRadius: 999,
            background: "#3d2818",
            color: "#fff",
            fontSize: 13,
            fontWeight: 800,
            border: "none",
            cursor: "pointer",
          }}
        >
          확인
        </button>
      </div>
    </div>
  );
}

/* ================================================================
   기존 Phase 1~3 부품들
================================================================ */

function EncouragementCard({
  text,
  tone,
}: {
  text: string;
  tone: "celebrate" | "warm" | "neutral" | "soft";
}) {
  const palette: Record<typeof tone, { bg: string; border: string; color: string }> = {
    celebrate: { bg: "#fff5d6", border: "#f0c050", color: "#3d2818" },
    warm: { bg: "#f0fae6", border: "#a8e070", color: "#3d2818" },
    neutral: { bg: "#fff8e8", border: "#e8d8b8", color: "#3d2818" },
    soft: { bg: "#eef4f9", border: "#bcd2e2", color: "#3d2818" },
  };
  const p = palette[tone];
  return (
    <div
      style={{
        background: p.bg,
        border: `1.5px solid ${p.border}`,
        borderRadius: 14,
        padding: "10px 14px",
        textAlign: "center",
        marginBottom: 14,
        fontSize: 13,
        fontWeight: 700,
        color: p.color,
        lineHeight: 1.5,
      }}
    >
      {text}
    </div>
  );
}

function NextStagePreview({
  stage,
  name,
  threshold,
  emoji,
  badgeBg,
  badgeText,
}: {
  stage: number;
  name: string;
  threshold: number;
  emoji: string;
  badgeBg: string;
  badgeText: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        background: "#fffaf2",
        border: "1.5px dashed #d6c2a0",
        borderRadius: 14,
        marginBottom: 14,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 999,
          background: badgeBg,
          color: badgeText,
          fontSize: 22,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          border: "2px solid #3d2818",
        }}
      >
        {emoji}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            color: "#9a8b6c",
            fontWeight: 700,
            letterSpacing: "0.02em",
          }}
        >
          다음 단계
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 800,
            color: "#1f2937",
            marginTop: 2,
          }}
        >
          {stage}단계 · {name}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "#9a8b6c",
            fontWeight: 600,
            marginTop: 1,
          }}
        >
          {threshold}P 도달 시 자라남
        </div>
      </div>
    </div>
  );
}

function MilestoneBadge({
  emoji,
  name,
  achieved,
}: {
  emoji: string;
  name: string;
  achieved: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        padding: "10px 4px",
        background: achieved ? "#fff5d6" : "#f5f0e6",
        border: `1.5px solid ${achieved ? "#f0c050" : "#e0d4be"}`,
        borderRadius: 12,
        opacity: achieved ? 1 : 0.55,
        transition: "all 240ms ease",
      }}
    >
      <div
        style={{
          fontSize: 22,
          filter: achieved ? "none" : "grayscale(0.7)",
        }}
      >
        {emoji}
      </div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: achieved ? "#3d2818" : "#9a8b6c",
          textAlign: "center",
        }}
      >
        {name}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "primary",
}: {
  label: string;
  value: string;
  tone?: "primary" | "positive" | "negative";
}) {
  const palette =
    tone === "positive"
      ? { bg: "#f0fae6", border: "#d8ebbf", color: "#4a8030" }
      : tone === "negative"
        ? { bg: "#fef2f0", border: "#f5cdc4", color: "#b04020" }
        : { bg: "#fff8e8", border: "#f1e8d8", color: "#1f2937" };
  return (
    <div
      style={{
        background: palette.bg,
        borderRadius: 12,
        padding: "10px 12px",
        textAlign: "center",
        border: `1.5px solid ${palette.border}`,
      }}
    >
      <div style={{ fontSize: 11, color: "#9a8b6c", fontWeight: 600 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 800,
          color: palette.color,
          marginTop: 4,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: 18 }}>
      <div
        style={{
          fontSize: 12,
          color: "#8a6f52",
          fontWeight: 800,
          marginBottom: 8,
          letterSpacing: "0.02em",
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: "16px 12px",
        textAlign: "center",
        color: "#b09a7c",
        fontSize: 13,
        background: "#fff8e8",
        borderRadius: 12,
        border: "1.5px dashed #e8d8b8",
      }}
    >
      {text}
    </div>
  );
}

function LogRow({ log, now }: { log: PointLog; now: Date | null }) {
  const isPositive = log.points >= 0;
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        borderRadius: 10,
        background: "#fffaf2",
        border: "1.5px solid #f1e8d8",
      }}
    >
      <div
        style={{
          width: 36,
          textAlign: "center",
          fontSize: 14,
          fontWeight: 800,
          fontVariantNumeric: "tabular-nums",
          color: isPositive ? "#4a8030" : "#b04020",
        }}
      >
        {isPositive ? "+" : ""}
        {log.points}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "#1f2937",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {log.reason ?? (isPositive ? "포인트 적립" : "포인트 차감")}
        </div>
      </div>
      <div
        style={{
          fontSize: 11,
          color: "#9a8b6c",
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {now ? formatRelative(log.logged_at, now) : ""}
      </div>
    </li>
  );
}

function HarvestRow({
  harvest,
  now,
}: {
  harvest: Harvest;
  now: Date | null;
}) {
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        borderRadius: 10,
        background: "#fff5d6",
        border: "1.5px solid #f0c050",
      }}
    >
      <div style={{ fontSize: 18 }}>🍎</div>
      <div
        style={{
          flex: 1,
          fontSize: 13,
          fontWeight: 800,
          color: "#3d2818",
        }}
      >
        사과 {harvest.apples_count}개 수확!
      </div>
      <div
        style={{
          fontSize: 11,
          color: "#8a6f52",
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {now ? formatRelative(harvest.harvested_at, now) : ""}
      </div>
    </li>
  );
}
