"use client";

// /tree/me 클라이언트 렌더러.
// 초기 데이터는 서버에서 SSR 으로 주입하고,
// 이후 useStudentRealtime 훅으로 점수/단계/사과/대기열 변화를 반영한다.

import { useEffect, useMemo, useRef, useState } from "react";
import { AppleTree, type AppleTreeMood } from "@/components/AppleTree";
import { AvatarFigure } from "@/features/garden/avatar/AvatarFigure";
import { AvatarEditSheet } from "@/features/garden/avatar/AvatarEditSheet";
import { useGalleryPositions } from "@/features/garden/avatar/useGalleryPositions";
import { BackgroundCanvas } from "@/features/garden/background/BackgroundCanvas";
import { BackgroundEditSheet } from "@/features/garden/background/BackgroundEditSheet";
import {
  DEFAULT_AVATAR,
  DEFAULT_BACKGROUND,
  type AvatarConfig,
  type BackgroundConfig,
} from "@/lib/types";
import {
  STAGE_TABLE,
  calculateStage,
  getStageInfo,
  pointsToNextStage,
  stageProgress,
} from "@/lib/garden";
import { STAGE_ACCENT } from "@/features/garden/stage-accent";
import { SprayWaterMe } from "@/features/garden/effects/SprayWater";
import { fireConfetti, firePtCelebration } from "@/features/garden/effects/confetti";
import { useStudentRealtime } from "@/features/garden/hooks/useStudentRealtime";
import { claimPointAction } from "./actions";

type Row = {
  id: string;
  total_points: number | null;
  current_stage: number | null;
  apples_harvested: number | null;
  grade: string | null;
  avatar?: AvatarConfig | null;
  background?: BackgroundConfig | null;
};

type PointLog = { id: string; points: number; reason: string | null; logged_at: string };
type Harvest = { id: string; apples_count: number; harvested_at: string };
type PendingClaim = { id: string; points: number; reason: string | null; created_at: string };
type Toast = { id: string; points: number; reason: string | null };
type StageUpBanner = { id: string; stage: number; name: string; isHarvest: boolean };
type HarvestBanner = { id: string; applesCount: number };
type Highlight = { id: string; delta: number; reason: string | null; expiresAt: number };

const TOAST_MS = 3500;
const STAGE_UP_BANNER_MS = 4500;
const HARVEST_BANNER_MS = 5000;
const HIGHLIGHT_MS = 2400;

type Milestone = { key: string; emoji: string; name: string; achieved: boolean };

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
  pendingCount: number;
}): { text: string; tone: "celebrate" | "warm" | "neutral" | "soft" } {
  const { isHarvest, applesHarvested, weekTotal, monthTotal, hasAnyLogs, pendingCount } = args;
  if (pendingCount > 0) {
    return { text: `🎁 받을 포인트가 ${pendingCount}개 있어요! 받기 버튼을 눌러 화분을 키워봐요`, tone: "celebrate" };
  }
  if (isHarvest && applesHarvested === 0) {
    return { text: "🎉 8단계 도달 축하해요! 곧 사과를 딸 수 있어요", tone: "celebrate" };
  }
  if (isHarvest && applesHarvested > 0) {
    return { text: "🍎 또 수확할 수 있어요! 멋진 페이스예요", tone: "celebrate" };
  }
  if (weekTotal >= 30) {
    return { text: "🔥 이번 주 정말 열심히 하고 있어요! 멋져요", tone: "celebrate" };
  }
  if (weekTotal >= 15) return { text: "💪 좋은 페이스로 자라고 있어요", tone: "warm" };
  if (weekTotal >= 5) return { text: "🌱 한 발씩 차근차근 자라는 중!", tone: "warm" };
  if (weekTotal < 0) return { text: "🌧 이번 주는 살짝 차감이 있었어요. 다시 한 걸음씩 가봐요", tone: "soft" };
  if (!hasAnyLogs) return { text: "🌟 사과정원에 오신 걸 환영해요! 첫 포인트를 기다리고 있어요", tone: "neutral" };
  if (monthTotal > 0) return { text: "💡 이번 주 새 도전을 시작해 봐요!", tone: "neutral" };
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

export function MeTreeClient({
  initialRow,
  studentName,
  initialPointLogs,
  initialHarvests,
  initialPending,
}: {
  initialRow: Row | null;
  studentName: string;
  initialPointLogs: PointLog[];
  initialHarvests: Harvest[];
  initialPending: PendingClaim[];
}) {
  const [row, setRow] = useState<Row | null>(initialRow);
  const [now, setNow] = useState<Date | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [stageUp, setStageUp] = useState<StageUpBanner | null>(null);
  const [harvestBanner, setHarvestBanner] = useState<HarvestBanner | null>(null);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [pending, setPending] = useState<PendingClaim[]>(initialPending);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [avatarSheetOpen, setAvatarSheetOpen] = useState(false);
  const [bgSheetOpen, setBgSheetOpen] = useState(false);
  const prevStageRef = useRef<number>(initialRow?.current_stage ?? 1);

  const currentAvatar: AvatarConfig = row?.avatar ?? DEFAULT_AVATAR;
  const currentBackground: BackgroundConfig = row?.background ?? DEFAULT_BACKGROUND;
  const galleryPositions = useGalleryPositions();

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useStudentRealtime(initialRow?.id, {
    onStudentUpdate: (next) => {
      const prevStage = prevStageRef.current;
      const newStage = next.current_stage ?? prevStage;
      if (newStage > prevStage) {
        const stInfo = getStageInfo(newStage as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8);
        const isHarvestUp = newStage === 8;
        setStageUp({ id: `${Date.now()}`, stage: newStage, name: stInfo.name, isHarvest: isHarvestUp });
        fireConfetti(isHarvestUp, 0.55);
      }
      prevStageRef.current = newStage;
      if (!initialRow) return;
      setRow((prev) => ({
        id: initialRow.id,
        total_points: next.total_points ?? prev?.total_points ?? 0,
        current_stage: newStage,
        apples_harvested: next.apples_harvested ?? prev?.apples_harvested ?? 0,
        grade: next.grade ?? prev?.grade ?? null,
      }));
    },
    onPointLog: (log) => {
      const id = `${log.id}-${Date.now()}`;
      setToasts((prev) => [...prev, { id, points: log.points, reason: log.reason }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, TOAST_MS);
      setHighlight({ id, delta: log.points, reason: log.reason, expiresAt: Date.now() + HIGHLIGHT_MS });
      setShakeKey((k) => k + 1);
      if (log.points > 0) firePtCelebration();
    },
    onHarvest: (h) => {
      setHarvestBanner({ id: `${h.id}-${Date.now()}`, applesCount: h.apples_count });
      fireConfetti(true, 0.55);
    },
    onPendingInsert: (p) => {
      setPending((prev) => {
        if (prev.some((x) => x.id === p.id)) return prev;
        return [...prev, p].sort((a, b) => a.created_at.localeCompare(b.created_at));
      });
    },
    onPendingDelete: (id) => {
      setPending((prev) => prev.filter((x) => x.id !== id));
    },
  });

  useEffect(() => {
    if (!highlight || !now) return;
    if (highlight.expiresAt <= now.getTime()) setHighlight(null);
  }, [now, highlight]);

  useEffect(() => {
    if (!stageUp) return;
    const id = stageUp.id;
    const t = window.setTimeout(() => {
      setStageUp((cur) => (cur?.id === id ? null : cur));
    }, STAGE_UP_BANNER_MS);
    return () => clearTimeout(t);
  }, [stageUp]);

  useEffect(() => {
    if (!harvestBanner) return;
    const id = harvestBanner.id;
    const t = window.setTimeout(() => {
      setHarvestBanner((cur) => (cur?.id === id ? null : cur));
    }, HARVEST_BANNER_MS);
    return () => clearTimeout(t);
  }, [harvestBanner]);

  useEffect(() => {
    if (claimingId && !pending.some((p) => p.id === claimingId)) {
      setClaimingId(null);
    }
  }, [pending, claimingId]);

  const onClaim = async (pendingId: string) => {
    if (claimingId) return;
    setClaimingId(pendingId);
    setClaimError(null);
    try {
      const res = await claimPointAction({ pendingId });
      if (!res.ok) {
        setClaimError(res.message);
        setClaimingId(null);
        window.setTimeout(() => setClaimError(null), 5000);
        return;
      }
      setPending((prev) => prev.filter((p) => p.id !== pendingId));
      setClaimingId(null);
    } catch (e) {
      setClaimError(`오류: ${(e as Error).message}`);
      setClaimingId(null);
      window.setTimeout(() => setClaimError(null), 5000);
    }
  };

  const points = row?.total_points ?? 0;
  const stage = calculateStage(points);
  const info = getStageInfo(stage);
  const progress = stageProgress(points);
  const remain = pointsToNextStage(points);
  const accent = STAGE_ACCENT[stage] ?? STAGE_ACCENT[1];
  const isHarvestStage = stage === 8;
  const applesHarvested = row?.apples_harvested ?? 0;
  const maxStageEver = applesHarvested > 0 ? 8 : stage;

  const nextStage = stage < 8 ? ((stage + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8) : null;
  const nextInfo = nextStage ? getStageInfo(nextStage) : null;
  const nextAccent = nextStage ? STAGE_ACCENT[nextStage] : null;

  const isFresh = !!(highlight && now && highlight.expiresAt > now.getTime());
  const isPositive = isFresh && highlight!.delta > 0;
  const isNegative = isFresh && highlight!.delta < 0;
  const treeMood: AppleTreeMood = isNegative ? "sad" : isPositive ? "surprised" : "happy";

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
      isHarvest: isHarvestStage,
      applesHarvested,
      weekTotal: stats.weekTotal,
      monthTotal: stats.monthTotal,
      hasAnyLogs: initialPointLogs.length > 0,
      pendingCount: pending.length,
    });
  }, [now, isHarvestStage, applesHarvested, stats, initialPointLogs.length, pending.length]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: `linear-gradient(180deg, ${accent.mePageBg} 0%, ${accent.mePageBgEnd} 100%)`,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: 20,
        fontFamily: '"Pretendard Variable", "Pretendard", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        transition: "background 600ms ease",
      }}
    >
      <div
        style={{
          background: isHarvestStage ? "#fff5d6" : "#fff",
          borderRadius: 24,
          padding: "32px 24px",
          width: "100%",
          maxWidth: 480,
          boxShadow: isHarvestStage
            ? "0 0 0 4px rgba(240,192,80,0.45), 0 10px 40px rgba(61,40,24,0.12)"
            : "0 10px 40px rgba(61,40,24,0.08)",
          border: `2px solid ${isHarvestStage ? "#e8a020" : "#f1e8d8"}`,
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "#9a8b6c", fontWeight: 600 }}>나의 사과정원</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#1f2937", marginTop: 4 }}>
            {studentName}
          </div>
          {row?.grade && (
            <div style={{ fontSize: 13, color: "#9a8b6c", marginTop: 2, fontWeight: 600 }}>
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
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 14px",
                  borderRadius: 999,
                  background: accent.meBadgeBg,
                  color: accent.meBadgeText,
                  fontSize: 13,
                  fontWeight: 800,
                  border: `2px solid #3d2818`,
                  boxShadow: "0 2px 6px rgba(61,40,24,0.10)",
                }}
              >
                <span>{accent.emoji}</span>
                <span>{stage}단계 · {info.name}</span>
              </span>
              {isHarvestStage && (
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

            <div
              style={{
                position: "relative",
                borderRadius: 20,
                overflow: "hidden",
                margin: "8px 0 12px",
                padding: "12px 8px",
              }}
            >
              <BackgroundCanvas config={currentBackground} rounded={20} />
              <div
                style={{
                  position: "relative",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "flex-end",
                  minHeight: 200,
                }}
              >
                <div style={{ position: "relative", display: "inline-block" }}>
                  {isPositive && highlight && <GlowRing key={`ring-${highlight.id}`} />}
                  <div key={shakeKey} className={isPositive ? "tree-shake" : undefined}>
                    <AppleTree
                      stage={stage}
                      size="xl"
                      mood={treeMood}
                      wilted={isNegative}
                      growthBoost={progress}
                    />
                  </div>
                  {isPositive && <SprayWaterMe />}
                  {isFresh && highlight && (
                    <PtFloat key={highlight.id} delta={highlight.delta} reason={highlight.reason} />
                  )}
                </div>
                <div
                  style={{
                    position: "absolute",
                    right: 12,
                    bottom: 0,
                    pointerEvents: "none",
                  }}
                >
                  <AvatarFigure config={currentAvatar} size={160} galleryPositions={galleryPositions} />
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 8,
                marginBottom: 14,
              }}
            >
              <button
                type="button"
                onClick={() => setAvatarSheetOpen(true)}
                style={{
                  border: "1.5px solid #d6c2a0",
                  background: "#fff",
                  color: "#3d2818",
                  padding: "8px 16px",
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                ✨ 아바타 꾸미기
              </button>
              <button
                type="button"
                onClick={() => setBgSheetOpen(true)}
                style={{
                  border: "1.5px solid #d6c2a0",
                  background: "#fff",
                  color: "#3d2818",
                  padding: "8px 16px",
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                🎨 배경 바꾸기
              </button>
            </div>

            {pending.length > 0 && (
              <PendingClaimSection
                pending={pending}
                claimingId={claimingId}
                error={claimError}
                onClaim={onClaim}
              />
            )}

            {encouragement && <EncouragementCard text={encouragement.text} tone={encouragement.tone} />}

            <div style={{ textAlign: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: "#9a8b6c" }}>
                {STAGE_TABLE.length}단계 중 {stage}단계
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
              <AnimatedStat label="누적 포인트" value={points} unit="P" />
              <Stat label="수확한 사과" value={`${applesHarvested}개`} tone="primary" />
              <Stat
                label="이번 주 적립"
                value={now === null ? "—" : `${stats.weekTotal >= 0 ? "+" : ""}${stats.weekTotal} P`}
                tone={stats.weekTotal >= 0 ? "positive" : "negative"}
              />
              <Stat
                label="이번 달 적립"
                value={now === null ? "—" : `${stats.monthTotal >= 0 ? "+" : ""}${stats.monthTotal} P`}
                tone={stats.monthTotal >= 0 ? "positive" : "negative"}
              />
            </div>

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
                    background: accent.meBarFill,
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
                {info.nextThreshold === null ? "🎉 최고 단계 도달!" : `다음 단계까지 ${remain} P`}
              </div>
            </div>

            {nextStage && nextInfo && nextAccent && (
              <NextStagePreview
                stage={nextStage}
                name={nextInfo.name}
                threshold={nextInfo.threshold}
                emoji={nextAccent.emoji}
                badgeBg={nextAccent.meBadgeBg}
                badgeText={nextAccent.meBadgeText}
              />
            )}

            <Section title="🏆 마일스톤">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {milestones.map(({ key, ...rest }) => (
                  <MilestoneBadge key={key} {...rest} />
                ))}
              </div>
            </Section>

            <Section title="📋 최근 활동">
              {initialPointLogs.length === 0 ? (
                <Empty text="이번 달 활동 기록이 없어요" />
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                  {initialPointLogs.slice(0, 10).map((log) => (
                    <LogRow key={log.id} log={log} now={now} />
                  ))}
                </ul>
              )}
            </Section>

            {initialHarvests.length > 0 && (
              <Section title="🍎 수확 히스토리">
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
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
            style={{ fontSize: 13, color: "#F26522", textDecoration: "none", fontWeight: 700 }}
          >
            ← 학생 홈으로
          </a>
        </div>
      </div>

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

      {stageUp && (
        <StageUpModal
          stage={stageUp.stage}
          name={stageUp.name}
          isHarvest={stageUp.isHarvest}
          studentName={studentName}
          onClose={() => setStageUp(null)}
        />
      )}

      {harvestBanner && (
        <HarvestModal
          applesCount={harvestBanner.applesCount}
          studentName={studentName}
          onClose={() => setHarvestBanner(null)}
        />
      )}

      <AvatarEditSheet
        open={avatarSheetOpen}
        initial={currentAvatar}
        onClose={() => setAvatarSheetOpen(false)}
        onSaved={(next) => setRow((prev) => (prev ? { ...prev, avatar: next } : prev))}
      />

      <BackgroundEditSheet
        open={bgSheetOpen}
        initial={currentBackground}
        onClose={() => setBgSheetOpen(false)}
        onSaved={(next) => setRow((prev) => (prev ? { ...prev, background: next } : prev))}
      />
    </main>
  );
}

function PendingClaimSection({
  pending,
  claimingId,
  error,
  onClaim,
}: {
  pending: PendingClaim[];
  claimingId: string | null;
  error: string | null;
  onClaim: (id: string) => void;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontSize: 12,
          color: "#8a6f52",
          fontWeight: 800,
          marginBottom: 8,
          letterSpacing: "0.02em",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span>🎁 받을 포인트</span>
        <span
          style={{
            background: "#f0c050",
            color: "#3d2818",
            padding: "2px 8px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 800,
            border: "1.5px solid #3d2818",
          }}
        >
          {pending.length}개
        </span>
      </div>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {pending.map((p) => (
          <PendingClaimCard
            key={p.id}
            p={p}
            claiming={claimingId === p.id}
            disabled={!!claimingId && claimingId !== p.id}
            onClaim={() => onClaim(p.id)}
          />
        ))}
      </ul>
      {error && (
        <div
          role="alert"
          style={{
            marginTop: 8,
            background: "#fef2f0",
            border: "1.5px solid #f5cdc4",
            color: "#b04020",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

function PendingClaimCard({
  p,
  claiming,
  disabled,
  onClaim,
}: {
  p: PendingClaim;
  claiming: boolean;
  disabled: boolean;
  onClaim: () => void;
}) {
  const isPositive = p.points > 0;
  const palette = isPositive
    ? { bg: "#fff8e8", border: "#f0c050", btnBg: "#5e9c38", numColor: "#4a8030" }
    : { bg: "#fef2f0", border: "#f5cdc4", btnBg: "#b04020", numColor: "#b04020" };

  return (
    <li
      className="banner-pop"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        background: palette.bg,
        border: `2px solid ${palette.border}`,
        borderRadius: 14,
      }}
    >
      <div
        style={{
          fontSize: 20,
          fontWeight: 800,
          color: palette.numColor,
          fontVariantNumeric: "tabular-nums",
          minWidth: 60,
          textAlign: "center",
        }}
      >
        {isPositive ? "+" : ""}
        {p.points} P
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 13,
          fontWeight: 700,
          color: "#3d2818",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {p.reason ?? (isPositive ? "포인트 적립" : "포인트 차감")}
      </div>
      <button
        onClick={onClaim}
        disabled={claiming || disabled}
        style={{
          padding: "8px 18px",
          borderRadius: 999,
          background: claiming || disabled ? "#d6c2a0" : palette.btnBg,
          color: "#fff",
          border: "2px solid #3d2818",
          fontSize: 13,
          fontWeight: 800,
          cursor: claiming || disabled ? "not-allowed" : "pointer",
          minWidth: 70,
          flexShrink: 0,
        }}
      >
        {claiming ? "적용 중…" : isPositive ? "받기" : "확인"}
      </button>
    </li>
  );
}

function AnimatedStat({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit: string;
}) {
  const [display, setDisplay] = useState(value);
  const [popKey, setPopKey] = useState(0);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    setPopKey((k) => k + 1);
    const duration = 700;
    const start = performance.now();
    let raf = 0;
    const tick = (ts: number) => {
      const t = Math.min(1, (ts - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const cur = Math.round(from + (to - from) * eased);
      setDisplay(cur);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <div
      style={{
        background: "#fff8e8",
        borderRadius: 12,
        padding: "10px 12px",
        textAlign: "center",
        border: "1.5px solid #f1e8d8",
      }}
    >
      <div style={{ fontSize: 11, color: "#9a8b6c", fontWeight: 600 }}>{label}</div>
      <div
        key={popKey}
        className={popKey > 0 ? "number-pop" : undefined}
        style={{
          fontSize: 16,
          fontWeight: 800,
          color: "#1f2937",
          marginTop: 4,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {display} {unit}
      </div>
    </div>
  );
}

function PtFloat({ delta, reason }: { delta: number; reason: string | null }) {
  const isPositive = delta > 0;
  return (
    <div
      className="pt-float"
      style={{
        position: "absolute",
        top: "10%",
        left: "50%",
        zIndex: 6,
        pointerEvents: "none",
        textAlign: "center",
        whiteSpace: "nowrap",
      }}
    >
      <div
        style={{
          display: "inline-block",
          padding: "10px 22px",
          borderRadius: 999,
          background: isPositive ? "#5e9c38" : "#b04020",
          color: "#fff",
          fontSize: 38,
          fontWeight: 900,
          fontVariantNumeric: "tabular-nums",
          border: "3px solid #3d2818",
          boxShadow: "0 12px 32px rgba(61,40,24,0.40)",
          letterSpacing: "-0.02em",
        }}
      >
        {isPositive ? "+" : ""}
        {delta} P
      </div>
      {reason && (
        <div
          style={{
            marginTop: 6,
            display: "inline-block",
            padding: "4px 12px",
            borderRadius: 999,
            background: "#3d2818",
            color: "#fff",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.02em",
            boxShadow: "0 4px 10px rgba(61,40,24,0.30)",
          }}
        >
          {reason}
        </div>
      )}
    </div>
  );
}

function GlowRing() {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 1,
      }}
    >
      {[0, 280, 560].map((delay) => (
        <div
          key={delay}
          className="ring-pulse"
          style={{
            position: "absolute",
            top: "55%",
            left: "50%",
            width: 120,
            height: 120,
            borderRadius: "50%",
            border: "4px solid #7fc6e8",
            background: "radial-gradient(circle, rgba(168,224,255,0.35), rgba(168,224,255,0))",
            animationDelay: `${delay}ms`,
          }}
        />
      ))}
    </div>
  );
}

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
          <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>
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
  const accent = STAGE_ACCENT[stage as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8] ?? STAGE_ACCENT[1];
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
        <div style={{ fontSize: 14, color: "#8a6f52", fontWeight: 700, marginBottom: 4 }}>
          축하해요!
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#3d2818", marginBottom: 8 }}>
          {studentName} 학생
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#3d2818" }}>
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
        <div style={{ fontSize: 14, color: "#8a6f52", fontWeight: 700, marginBottom: 4 }}>
          수확 완료!
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#3d2818", marginBottom: 8 }}>
          {studentName} 학생
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#3d2818" }}>
          사과 <span style={{ color: "#b02020" }}>{applesCount}개</span> 를 수확했어요!
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
        <div style={{ fontSize: 11, color: "#9a8b6c", fontWeight: 700, letterSpacing: "0.02em" }}>
          다음 단계
        </div>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#1f2937", marginTop: 2 }}>
          {stage}단계 · {name}
        </div>
        <div style={{ fontSize: 11, color: "#9a8b6c", fontWeight: 600, marginTop: 1 }}>
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
      <div style={{ fontSize: 22, filter: achieved ? "none" : "grayscale(0.7)" }}>{emoji}</div>
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
      <div style={{ fontSize: 11, color: "#9a8b6c", fontWeight: 600 }}>{label}</div>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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
      <div style={{ fontSize: 11, color: "#9a8b6c", fontWeight: 600, flexShrink: 0 }}>
        {now ? formatRelative(log.logged_at, now) : ""}
      </div>
    </li>
  );
}

function HarvestRow({ harvest, now }: { harvest: Harvest; now: Date | null }) {
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
      <div style={{ flex: 1, fontSize: 13, fontWeight: 800, color: "#3d2818" }}>
        사과 {harvest.apples_count}개 수확!
      </div>
      <div style={{ fontSize: 11, color: "#8a6f52", fontWeight: 600, flexShrink: 0 }}>
        {now ? formatRelative(harvest.harvested_at, now) : ""}
      </div>
    </li>
  );
}
