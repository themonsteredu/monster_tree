"use client";

// TV 화면 (1920×1080 풀스크린 가로 모드 기준)
//
// 화면 폭별 분기:
//  - <640px: 모바일 — 핸드폰으로 관찰용. compact 레이아웃 + 그리드 2열.
//  - 640~1023px: 태블릿 — compact 레이아웃 + 그리드 3열.
//  - 1024px+: 데스크탑/TV — 풀 레이아웃 (Spotlight + 그리드 자동 칸수).
// 지점 (BRANCH_ID env, prop 으로 주입) 학생만 표시 — Realtime 이벤트도 필터.
//
// Realtime (useTvRealtime 훅):
// - garden_students: 학생 정보 갱신, 단계 상승 시 배너 + 컨페티
// - garden_point_logs: +pt 강조 (3초)
// - garden_harvests: 사과가 카드 → 바구니로 포물선 비행

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { AppleTree, type AppleTreeMood, type AppleTreeSize } from "@/components/AppleTree";
import {
  calculateStage,
  getStageInfo,
  pointsToNextStage,
  stageProgress,
} from "@/lib/garden";
import type { GardenStudent } from "@/lib/types";
import { STAGE_ACCENT } from "@/features/garden/stage-accent";
import { SprayWaterTv } from "@/features/garden/effects/SprayWater";
import { fireConfetti } from "@/features/garden/effects/confetti";
import { useTvRealtime } from "@/features/garden/hooks/useTvRealtime";
import { AvatarFigure } from "@/features/garden/avatar/AvatarFigure";
import { BackgroundCanvas } from "@/features/garden/background/BackgroundCanvas";

// 화면 폭 매체 쿼리 훅 (TV 풀HD 가정의 데스크탑 vs 모바일)
function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const m = window.matchMedia(query);
    setMatch(m.matches);
    const handler = (e: MediaQueryListEvent) => setMatch(e.matches);
    m.addEventListener("change", handler);
    return () => m.removeEventListener("change", handler);
  }, [query]);
  return match;
}

const SPOTLIGHT_INTERVAL_MS = 4_000;
const HIGHLIGHT_MS = 3_000;
const BANNER_MS = 5_000;
const HARVEST_BANNER_MS = 10_000;
const FLY_DURATION_MS = 3_500;

type Highlight = { delta: number; expiresAt: number };
type Banner = {
  id: string;
  name: string;
  stage: number;
  stageName: string;
  expiresAt: number;
};
type FlyingApple = {
  id: string;
  treeX: number;
  treeY: number;
  groundX: number;
  groundY: number;
  basketX: number;
  basketY: number;
  delay: number;
};

export function TVScreen({
  initialStudents,
  initialTodayHarvest = 0,
  branchId,
}: {
  initialStudents: GardenStudent[];
  initialTodayHarvest?: number;
  branchId: string;
}) {
  const [students, setStudents] = useState<GardenStudent[]>(initialStudents);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [highlights, setHighlights] = useState<Record<string, Highlight>>({});
  const [banners, setBanners] = useState<Banner[]>([]);
  const [todayApples, setTodayApples] = useState<number>(initialTodayHarvest);
  const [bumpBasket, setBumpBasket] = useState(0);
  const [flyingApples, setFlyingApples] = useState<FlyingApple[]>([]);
  const [now, setNow] = useState(0);

  // 화면 분기:
  //  - <640px: 모바일 — compact 레이아웃 + 그리드 2열
  //  - 640~1023px: 태블릿 — compact 레이아웃 + 그리드 3열
  //  - 1024px+: 데스크탑/TV — 풀 레이아웃 (Spotlight + 자동 칸수 그리드)
  const isPhone = useMediaQuery("(max-width: 639px)");
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  // SSR 시 useMediaQuery 는 false 를 반환 → 첫 페인트는 데스크탑 가정.
  // 마운트 후 mounted 가 true 가 되면 매체 쿼리 결과를 신뢰.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const prevStageRef = useRef<Record<string, number>>({});
  const sortedRef = useRef<GardenStudent[]>(initialStudents);
  // 지점 학생 ID 집합 (Realtime log/harvest 이벤트 필터용)
  const branchStudentIdsRef = useRef<Set<string>>(new Set(initialStudents.map((s) => s.id)));
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const basketRef = useRef<HTMLDivElement | null>(null);
  const spotlightRef = useRef<HTMLDivElement | null>(null);
  const [shakingId, setShakingId] = useState<string | null>(null);

  useEffect(() => {
    for (const s of initialStudents) prevStageRef.current[s.id] = s.current_stage;
    branchStudentIdsRef.current = new Set(initialStudents.map((s) => s.id));
  }, [initialStudents]);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const sorted = useMemo(
    () =>
      [...students]
        .filter((s) => s.is_active)
        .sort((a, b) => b.total_points - a.total_points),
    [students],
  );

  useEffect(() => {
    if (sorted.length <= 1) return;
    const t = setInterval(() => {
      setFocusedIdx((i) => (i + 1) % sorted.length);
    }, SPOTLIGHT_INTERVAL_MS);
    return () => clearInterval(t);
  }, [sorted.length]);

  useEffect(() => {
    if (focusedIdx >= sorted.length) setFocusedIdx(0);
  }, [focusedIdx, sorted.length]);

  useEffect(() => {
    sortedRef.current = sorted;
    branchStudentIdsRef.current = new Set(students.map((s) => s.id));
  }, [sorted, students]);

  // 수확 시퀀스: 스포트라이트 점프 → 흔들림(1s) → 후두두 떨어짐 + 바구니 비행(3.5s) → 배너
  function triggerHarvestSequence(studentId: string, count: number) {
    const idx = sortedRef.current.findIndex((s) => s.id === studentId);
    if (idx >= 0) setFocusedIdx(idx);

    window.setTimeout(() => {
      setShakingId(studentId);
      window.setTimeout(() => {
        setShakingId((cur) => (cur === studentId ? null : cur));
      }, 1000);
    }, 120);

    window.setTimeout(() => {
      const items = buildFallingApples(
        count,
        spotlightRef.current,
        basketRef.current,
      );
      if (items.length > 0) {
        setFlyingApples((prev) => [...prev, ...items]);
      } else {
        setTodayApples((c) => c + count);
        setBumpBasket((k) => k + 1);
      }
    }, 1100);
  }

  useTvRealtime({
    onStudentEvent: (eventType, next, old) => {
      // 지점 필터: 이벤트의 branch_id 가 우리 지점이 아니면 무시
      if (eventType === "DELETE" && old) {
        if (old.branch_id && old.branch_id !== branchId) return;
        setStudents((prev) => prev.filter((s) => s.id !== old.id));
        return;
      }
      if (!next) return;
      if (next.branch_id !== branchId) return;

      const prevStage = prevStageRef.current[next.id] ?? next.current_stage;
      if (next.current_stage > prevStage) {
        const info = getStageInfo(
          next.current_stage as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
        );
        const isHarvest = next.current_stage === 8;
        setBanners((b) => [
          ...b,
          {
            id: `${next.id}-${next.current_stage}-${Date.now()}`,
            name: next.name,
            stage: next.current_stage,
            stageName: info.name,
            expiresAt: Date.now() + (isHarvest ? HARVEST_BANNER_MS : BANNER_MS),
          },
        ]);
        fireConfetti(isHarvest);
      }
      prevStageRef.current[next.id] = next.current_stage;

      setStudents((prev) => {
        const idx = prev.findIndex((s) => s.id === next.id);
        if (idx === -1) return [...prev, next];
        const copy = prev.slice();
        copy[idx] = next;
        return copy;
      });
    },
    onPointLog: (log) => {
      if (!log?.student_id) return;
      // 지점 필터: 우리 지점 학생의 로그만
      if (!branchStudentIdsRef.current.has(log.student_id)) return;
      setHighlights((h) => ({
        ...h,
        [log.student_id]: {
          delta: (h[log.student_id]?.delta ?? 0) + log.points,
          expiresAt: Date.now() + HIGHLIGHT_MS,
        },
      }));
      const idx = sortedRef.current.findIndex((s) => s.id === log.student_id);
      if (idx >= 0) setFocusedIdx(idx);
    },
    onHarvest: (h) => {
      // 지점 필터: 우리 지점 학생의 수확만
      if (!branchStudentIdsRef.current.has(h.student_id)) return;
      triggerHarvestSequence(h.student_id, h.apples_count);
    },
  });

  useEffect(() => {
    setHighlights((h) => {
      const cleaned: Record<string, Highlight> = {};
      for (const [k, v] of Object.entries(h)) if (v.expiresAt > now) cleaned[k] = v;
      return Object.keys(cleaned).length === Object.keys(h).length ? h : cleaned;
    });
    setBanners((b) => b.filter((x) => x.expiresAt > now));
  }, [now]);

  const today = now === 0 ? "" : formatToday(new Date(now));
  const top = sorted[0];
  const spotlight = sorted[focusedIdx];
  const cycleLabel = sorted.length > 0 ? `${focusedIdx + 1} / ${sorted.length}` : "0 / 0";

  return (
    <main className="kiosk h-screen flex flex-col overflow-hidden relative">
      <DecorDots />

      <header className="relative z-10 flex-shrink-0 px-3 sm:px-8 pt-3 sm:pt-6 pb-2 sm:pb-3 flex items-center justify-between gap-2">
        <TitlePill />
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
          <TodayHarvestPill ref={basketRef} count={todayApples} bump={bumpBasket} />
          {top && (
            <div className="hidden md:block">
              <TopStudentPill name={top.name} points={top.total_points} />
            </div>
          )}
          <div className="hidden lg:block px-4 py-2 rounded-full bg-white border-[2.5px] border-[var(--ink)] text-[var(--ink)] tabular-nums text-lg font-bold shadow-card">
            {today}
          </div>
        </div>
      </header>

      {sorted.length === 0 ? (
        <EmptyState />
      ) : (
        <section
          className="relative z-10 flex-1 min-h-0 px-3 sm:px-8 pb-3 gap-3 lg:gap-6 flex flex-col lg:grid lg:[grid-template-columns:minmax(420px,_36%)_1fr]"
        >
          <div className="h-[44vh] lg:h-auto min-h-0 shrink-0 lg:shrink">
            <Spotlight
              ref={spotlightRef}
              student={spotlight}
              highlight={spotlight ? highlights[spotlight.id] : undefined}
              now={now}
              cycleLabel={cycleLabel}
              isShaking={!!spotlight && shakingId === spotlight.id}
              compact={!isDesktop}
            />
          </div>
          <div className="flex flex-col gap-3 min-h-0 flex-1">
            <div className="flex-1 min-h-0">
              <CompactGrid
                students={sorted}
                spotlightId={spotlight?.id}
                highlights={highlights}
                now={now}
                registerRef={(id, el) => {
                  cardRefs.current[id] = el;
                }}
                maxCols={isDesktop ? undefined : isPhone ? 2 : 3}
              />
            </div>
            <div className="hidden lg:block">
              <CriteriaBar />
            </div>
          </div>
        </section>
      )}


      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
      >
        {flyingApples.map((fa) => (
          <FlyingAppleNode
            key={fa.id}
            fa={fa}
            onArrive={() => {
              setFlyingApples((prev) => prev.filter((x) => x.id !== fa.id));
              setTodayApples((c) => c + 1);
              setBumpBasket((k) => k + 1);
            }}
          />
        ))}
      </div>

      {banners.map((b) => (
        <StageUpBanner key={b.id} banner={b} />
      ))}

      <AdminLink />
    </main>
  );
}

const Spotlight = forwardRef<
  HTMLDivElement,
  {
    student: GardenStudent | undefined;
    highlight: Highlight | undefined;
    now: number;
    cycleLabel: string;
    isShaking: boolean;
    compact?: boolean;
  }
>(function Spotlight({ student, highlight, now, cycleLabel, isShaking, compact = false }, ref) {
  if (!student) {
    return (
      <div
        ref={ref}
        className="rounded-[28px] bg-white/70 border-[2.5px] border-[var(--ink)] flex items-center justify-center text-[var(--ink-soft)]"
      >
        스포트라이트 대기 중…
      </div>
    );
  }

  const stage = calculateStage(student.total_points);
  const info = getStageInfo(stage);
  const remaining = pointsToNextStage(student.total_points);
  const progress = stageProgress(student.total_points);
  const isHarvest = stage === 8;
  const isFresh = highlight && highlight.expiresAt > now;
  const isPositive = isFresh && highlight!.delta > 0;
  const isNegative = isFresh && highlight!.delta < 0;
  const accent = STAGE_ACCENT[stage];
  const mood: AppleTreeMood = isNegative
    ? "sad"
    : isPositive
      ? "surprised"
      : "happy";

  return (
    <div
      ref={ref}
      className={[
        "relative rounded-[28px] border-[2.5px] border-[var(--ink)] flex flex-col items-center h-full",
        compact ? "p-3" : "p-7",
        isHarvest
          ? "bg-[var(--card-bg-hero)] hero-glow"
          : "bg-[var(--card-bg)] shadow-card",
      ].join(" ")}
    >
      <div className="absolute top-2 right-3 sm:top-4 sm:right-5 flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[var(--ink-soft)] tabular-nums">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--apple-base)] animate-pulse" />
        {cycleLabel}
      </div>

      <div className="flex items-center gap-2 mt-1">
        <span
          className={[
            "inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-extrabold border-[2.5px] border-[var(--ink)] shadow-card",
            accent.tvBgClass,
            accent.tvTextClass,
          ].join(" ")}
        >
          <span>{accent.emoji}</span>
          <span>
            {stage}단계 · {info.name}
          </span>
        </span>
        {isHarvest && (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-extrabold bg-[var(--accent-gold)] border-[2.5px] border-[var(--ink)] text-[var(--ink)] shadow-card-pop animate-soft-bounce">
            ★ 수확 가능
          </span>
        )}
      </div>

      <div className="flex-1 flex items-center justify-center w-full min-h-0 my-3 relative">
        <div className="relative w-full h-full rounded-3xl overflow-hidden flex items-center justify-center">
          <BackgroundCanvas config={student.background ?? null} rounded={24} />
          <AnimatePresence mode="wait">
            <motion.div
              key={student.id}
              initial={{ opacity: 0, scale: 0.85, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: -10 }}
              transition={{ duration: 0.45, ease: [0.34, 1.2, 0.64, 1] }}
              className={["relative flex items-end justify-center gap-3", isShaking ? "tree-shake" : ""].join(" ")}
            >
              <AppleTree
                stage={stage}
                size={compact ? "large" : "xl"}
                mood={mood}
                wilted={isNegative}
                growthBoost={progress}
              />
              <div className="pb-3 shrink-0" aria-hidden>
                <AvatarFigure config={student.avatar ?? null} size={compact ? 96 : 180} />
              </div>
              {isPositive && (
                <>
                  <div className="absolute -top-2 -right-2 px-3.5 py-1.5 rounded-2xl bg-[var(--accent-success)] border-[2.5px] border-[var(--ink)] text-white text-xl font-extrabold shadow-card-pop animate-pop-in">
                    +{highlight!.delta}pt ✨
                  </div>
                  <SprayWaterTv />
                </>
              )}
              {isNegative && (
                <div className="absolute -top-2 -right-2 px-3.5 py-1.5 rounded-2xl bg-[var(--apple-deep)] border-[2.5px] border-[var(--ink)] text-white text-xl font-extrabold shadow-card-pop animate-pop-in">
                  {highlight!.delta}pt
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={`${student.id}-info`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.4, delay: 0.06 }}
          className="text-center w-full"
        >
          <div
            className={[
              "font-black tracking-tight leading-none truncate",
              compact ? "text-3xl" : "text-5xl",
            ].join(" ")}
          >
            {student.name}
          </div>
          {student.class_name && (
            <div
              className={[
                "font-semibold text-[var(--ink-soft)]",
                compact ? "mt-1 text-sm" : "mt-2 text-base",
              ].join(" ")}
            >
              {student.class_name}
            </div>
          )}
          <div className={["flex items-baseline justify-center gap-1.5", compact ? "mt-2" : "mt-4"].join(" ")}>
            <span
              className={[
                "font-black tabular-nums text-[var(--ink)]",
                compact ? "text-4xl" : "text-6xl",
              ].join(" ")}
            >
              {student.total_points}
            </span>
            <span className={["font-bold text-[var(--ink-soft)]", compact ? "text-base" : "text-xl"].join(" ")}>pt</span>
          </div>
          {student.apples_harvested > 0 && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--card-bg-hero)] border-[2px] border-[var(--ink)] text-[var(--ink)] text-sm font-extrabold tabular-nums">
              🍎 × {student.apples_harvested}개
            </div>
          )}

          <div className="mt-5 mx-auto w-full max-w-[78%]">
            {isHarvest ? (
              <div className="inline-flex items-center justify-center gap-2 w-full px-4 py-2 rounded-full bg-[var(--accent-gold)] border-[2.5px] border-[var(--ink)] text-[var(--ink)] text-base font-extrabold">
                <span>🍎</span>
                <span>다음 수확을 기다리는 중!</span>
              </div>
            ) : (
              <ProgressBar
                current={student.total_points}
                target={info.nextThreshold ?? student.total_points}
                stageStart={info.threshold}
                progress={progress}
                barFill={accent.tvBarFill}
                remaining={remaining}
              />
            )}
            {!isHarvest && remaining > 0 && (
              <div className="mt-2 text-sm font-bold text-[var(--ink-soft)]">
                다음 단계까지 {remaining}pt
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
});

function CompactGrid({
  students,
  spotlightId,
  highlights,
  now,
  registerRef,
  maxCols,
}: {
  students: GardenStudent[];
  spotlightId: string | undefined;
  highlights: Record<string, Highlight>;
  now: number;
  registerRef: (id: string, el: HTMLDivElement | null) => void;
  maxCols?: number;
}) {
  const cols = Math.min(colsFor(students.length), maxCols ?? Infinity);
  const treeSize: AppleTreeSize = cols >= 8 ? "xs" : "small";
  return (
    <div className="rounded-[28px] bg-white/55 border-[2.5px] border-[var(--ink)]/40 backdrop-blur-sm shadow-card p-4 overflow-hidden">
      <div
        className="grid gap-2.5 h-full content-start"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {students.map((s, i) => (
          <CompactCard
            key={s.id}
            student={s}
            rank={i + 1}
            isSpotlight={s.id === spotlightId}
            highlight={highlights[s.id]}
            now={now}
            treeSize={treeSize}
            cardRef={(el) => registerRef(s.id, el)}
          />
        ))}
      </div>
    </div>
  );
}

function CompactCard({
  student,
  rank,
  isSpotlight,
  highlight,
  now,
  treeSize,
  cardRef,
}: {
  student: GardenStudent;
  rank: number;
  isSpotlight: boolean;
  highlight: Highlight | undefined;
  now: number;
  treeSize: AppleTreeSize;
  cardRef: (el: HTMLDivElement | null) => void;
}) {
  const stage = calculateStage(student.total_points);
  const progress = stageProgress(student.total_points);
  const isHarvest = stage === 8;
  const isFresh = highlight && highlight.expiresAt > now;
  const isPositive = isFresh && highlight!.delta > 0;
  const isNegative = isFresh && highlight!.delta < 0;
  const mood: AppleTreeMood = isNegative
    ? "sad"
    : isPositive
      ? "surprised"
      : "happy";

  return (
    <motion.div
      ref={cardRef}
      animate={{
        scale: isSpotlight ? 1.06 : 1,
      }}
      transition={{ type: "spring", stiffness: 240, damping: 22 }}
      style={{ zIndex: isSpotlight ? 5 : 1 }}
      className={[
        "relative rounded-[18px] bg-white p-2 flex flex-col items-center justify-between gap-1",
        "border-[2px] border-[var(--ink)]/85",
        isSpotlight
          ? "!border-[3px] !border-[var(--apple-base)] shadow-card-pop"
          : "shadow-[0_3px_10px_-6px_rgba(61,40,24,0.35)]",
        !isSpotlight && isHarvest ? "!border-[var(--accent-gold-deep)]" : "",
      ].join(" ")}
    >
      <div
        className={[
          "absolute top-1 left-1 min-w-[20px] h-[20px] px-1.5 rounded-full text-[11px] font-extrabold flex items-center justify-center tabular-nums border-[1.5px] border-[var(--ink)]",
          rank === 1
            ? "bg-[var(--accent-gold)] text-[var(--ink)]"
            : rank === 2
              ? "bg-[#cdd0d4] text-[var(--ink)]"
              : rank === 3
                ? "bg-[#d9a273] text-white"
                : "bg-white text-[var(--ink-soft)]",
        ].join(" ")}
      >
        {rank}
      </div>

      {isHarvest && (
        <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-[var(--accent-gold)] border-[1.5px] border-[var(--ink)] text-[var(--ink)] flex items-center justify-center text-[12px] font-extrabold">
          ★
        </div>
      )}

      {isFresh && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-[var(--accent-success)] border-[1.5px] border-[var(--ink)] text-white text-[11px] font-extrabold animate-pop-in shadow-card">
          {(highlight!.delta > 0 ? "+" : "") + highlight!.delta}
        </div>
      )}

      <div className="flex-1 flex items-center justify-center w-full pt-3 relative">
        <AppleTree
          stage={stage}
          size={treeSize}
          mood={mood}
          wilted={isNegative}
          growthBoost={progress}
        />
        {isPositive && <SprayWaterTv compact />}
      </div>

      <div className="text-center w-full">
        <div className="text-[12px] font-extrabold truncate leading-tight">
          {student.name}
        </div>
        <div className="text-[10px] font-bold tabular-nums text-[var(--ink-soft)] flex items-center justify-center gap-1">
          <span>{student.total_points}pt</span>
          {student.apples_harvested > 0 && (
            <>
              <span className="text-[var(--ink)]/30">·</span>
              <span className="text-[var(--apple-deep)]">🍎 {student.apples_harvested}</span>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function colsFor(count: number): number {
  if (count <= 6) return 3;
  if (count <= 12) return 4;
  if (count <= 20) return 5;
  if (count <= 30) return 6;
  if (count <= 42) return 7;
  if (count <= 56) return 8;
  if (count <= 72) return 9;
  return 10;
}

function ProgressBar({
  current,
  target,
  progress,
  barFill,
}: {
  current: number;
  target: number;
  stageStart: number;
  progress: number;
  barFill: string;
  remaining: number;
}) {
  const pct = Math.max(4, Math.round(progress * 100));
  return (
    <div className="relative h-[18px] rounded-[9px] bg-[#e8dfcf] border-[2px] border-[var(--ink)] overflow-hidden">
      <motion.div
        className="absolute inset-y-0 left-0 rounded-[7px]"
        style={{ background: barFill }}
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />
      <div className="absolute inset-0 flex items-center justify-center text-[10px] font-extrabold text-white tabular-nums tracking-wide drop-shadow-[0_1px_0_rgba(0,0,0,0.35)]">
        {current} / {target}pt
      </div>
    </div>
  );
}

function TitlePill() {
  return (
    <div className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-white border-[2.5px] border-[var(--ink)] shadow-card">
      <span className="text-2xl">🌳</span>
      <span className="text-2xl font-extrabold text-[var(--ink)] tracking-tight">
        우리들의 사과정원
      </span>
      <span className="text-[var(--ink-soft)] font-bold text-sm hidden md:inline">
        · 더몬스터학원
      </span>
    </div>
  );
}

function TopStudentPill({
  name,
  points,
}: {
  name: string;
  points: number;
}) {
  return (
    <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-[var(--ink)] text-white shadow-card border-[2.5px] border-[var(--ink)]">
      <span className="text-[var(--accent-gold)] text-lg">⭐</span>
      <span className="text-[var(--accent-gold)] font-extrabold text-sm">TOP</span>
      <span className="text-white font-extrabold">{name}</span>
      <span className="text-[var(--accent-gold)] font-extrabold tabular-nums">
        {points}pt
      </span>
    </div>
  );
}

const TodayHarvestPill = forwardRef<HTMLDivElement, { count: number; bump: number }>(
  function TodayHarvestPill({ count, bump }, ref) {
    return (
      <motion.div
        ref={ref}
        key={bump}
        initial={{ scale: 1 }}
        animate={{ scale: bump > 0 ? [1, 1.18, 1] : 1, rotate: bump > 0 ? [0, -4, 4, 0] : 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-[var(--card-bg-hero)] text-[var(--ink)] border-[2.5px] border-[var(--ink)] shadow-card"
      >
        <span className="text-lg">🍎</span>
        <span className="font-extrabold text-sm">오늘 수확</span>
        <span className="font-extrabold tabular-nums">{count}개</span>
      </motion.div>
    );
  },
);

const CRITERIA: ReadonlyArray<{ label: string; pts: string }> = [
  { label: "출석·숙제", pts: "+1" },
  { label: "일일테스트", pts: "+1~4" },
  { label: "단원평가 만점", pts: "+10" },
  { label: "주간·월말", pts: "+2~5" },
];

function CriteriaBar() {
  return (
    <div className="flex items-center justify-center gap-4 px-4 py-2.5 rounded-full bg-white/85 border-[2px] border-[var(--ink)] backdrop-blur-sm shadow-card text-sm whitespace-nowrap overflow-x-auto">
      <span className="font-extrabold text-[var(--ink)] flex items-center gap-1 shrink-0">
        🌳 포인트
      </span>
      {CRITERIA.map((c, i) => (
        <div key={c.label} className="flex items-center gap-2 shrink-0">
          {i > 0 && <span className="text-[var(--ink)]/25">·</span>}
          <span className="font-bold text-[var(--ink)]">{c.label}</span>
          <span className="font-extrabold tabular-nums text-[var(--accent-success)]">
            {c.pts}
          </span>
        </div>
      ))}
    </div>
  );
}

function FlyingAppleNode({
  fa,
  onArrive,
}: {
  fa: FlyingApple;
  onArrive: () => void;
}) {
  return (
    <motion.div
      className="absolute"
      style={{ left: 0, top: 0 }}
      initial={{ x: fa.treeX - 18, y: fa.treeY - 18, scale: 1, rotate: 0 }}
      animate={{
        x: [fa.treeX - 18, fa.groundX - 18, fa.basketX - 18],
        y: [fa.treeY - 18, fa.groundY - 18, fa.basketY - 18],
        scale: [1, 1, 0.55],
        rotate: [0, 540, 900],
      }}
      transition={{
        duration: FLY_DURATION_MS / 1000,
        ease: "easeIn",
        delay: fa.delay / 1000,
        times: [0, 0.57, 1],
      }}
      onAnimationComplete={onArrive}
    >
      <FlyingAppleSVG />
    </motion.div>
  );
}

function FlyingAppleSVG() {
  return (
    <svg viewBox="-20 -22 40 40" width={36} height={36}>
      <defs>
        <radialGradient id="fly-apple-grad" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="var(--apple-light)" />
          <stop offset="55%" stopColor="var(--apple-base)" />
          <stop offset="100%" stopColor="var(--apple-deep)" />
        </radialGradient>
      </defs>
      <path
        d="M 0 -10 L 4 -16"
        stroke="var(--ink)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M 4 -16 Q 10 -16 12 -12 Q 8 -14 4 -12 Z"
        fill="var(--leaf-base)"
        stroke="var(--ink)"
        strokeWidth="1.5"
      />
      <circle
        cx="0"
        cy="0"
        r="11"
        fill="url(#fly-apple-grad)"
        stroke="var(--ink)"
        strokeWidth="2"
      />
      <ellipse cx="-3.5" cy="-4.5" rx="3" ry="3.6" fill="#fff" opacity="0.85" />
    </svg>
  );
}

function AdminLink() {
  return (
    <Link
      href="/admin"
      aria-label="관리자 페이지로 이동"
      title="관리자"
      className={[
        "fixed bottom-2.5 right-2.5 z-30",
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full",
        "bg-white/35 hover:bg-white/85 focus-visible:bg-white/90 backdrop-blur-sm",
        "border border-[var(--ink)]/15 hover:border-[var(--ink)]/40",
        "text-[var(--ink)]/45 hover:text-[var(--ink)]",
        "text-xs font-bold tracking-tight leading-none",
        "opacity-40 hover:opacity-100 focus-visible:opacity-100",
        "shadow-sm hover:shadow-card",
        "transition-all duration-200",
        "outline-none focus-visible:ring-2 focus-visible:ring-[var(--apple-base)]",
      ].join(" ")}
    >
      <span aria-hidden className="text-sm leading-none">⚙️</span>
      <span>관리자</span>
    </Link>
  );
}

function DecorDots() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
      <div className="absolute top-[14%] right-[6%] w-3 h-3 rounded-full bg-[var(--accent-gold)] border-2 border-[var(--ink)]/30 animate-soft-bounce" />
      <div className="absolute top-[8%] left-[10%] w-2 h-2 rounded-full bg-[var(--accent-pink)] opacity-70" />
      <div className="absolute bottom-[12%] left-[5%] w-3.5 h-3.5 rounded-full bg-[var(--leaf-light)] border-2 border-[var(--ink)]/30" />
      <div className="absolute bottom-[18%] right-[8%] w-2.5 h-2.5 rounded-full bg-[var(--apple-base)] opacity-70" />
      <div className="absolute top-1/2 left-[3%] w-1.5 h-1.5 rounded-full bg-[var(--accent-purple)] opacity-60" />
    </div>
  );
}

function StageUpBanner({ banner }: { banner: Banner }) {
  const isHarvest = banner.stage === 8;
  const accent = STAGE_ACCENT[banner.stage as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-10 pointer-events-none"
    >
      <div className="absolute inset-0 bg-[var(--ink)]/30 backdrop-blur-[2px]" />

      <motion.div
        initial={{ scale: 0.6, y: 60, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, y: -20, opacity: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 18 }}
        className={[
          "relative rounded-[32px] border-[3px] border-[var(--ink)] px-12 py-8 text-center shadow-card-pop",
          isHarvest
            ? "bg-gradient-to-br from-[#fff5d6] via-[var(--accent-gold)] to-[#f0a020]"
            : "bg-gradient-to-br from-white via-[#fff5d6] to-[var(--accent-gold)]",
        ].join(" ")}
      >
        <div className="text-7xl mb-2 animate-soft-bounce">
          {isHarvest ? "🎉" : accent.emoji}
        </div>
        <div className="text-2xl font-extrabold text-[var(--ink)]">
          축하합니다!
        </div>
        <div className="mt-2 text-4xl font-black text-[var(--ink)] tracking-tight">
          {banner.name}{" "}
          <span className="text-[var(--apple-deep)]">학생</span>
        </div>
        <div className="mt-3 text-2xl font-extrabold text-[var(--ink)]">
          {isHarvest ? (
            <>
              사과를 <span className="underline decoration-wavy decoration-[var(--apple-base)]">수확</span>할 수 있어요!
            </>
          ) : (
            <>
              <span className="underline decoration-wavy decoration-[var(--apple-base)]">
                {banner.stageName}
              </span>{" "}
              단계로 성장!
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function buildFallingApples(
  count: number,
  spotlightEl: HTMLDivElement | null,
  basketEl: HTMLDivElement | null,
): FlyingApple[] {
  if (!spotlightEl || !basketEl) return [];
  const sRect = spotlightEl.getBoundingClientRect();
  const bRect = basketEl.getBoundingClientRect();
  const treeCenterX = sRect.left + sRect.width / 2;
  const treeTop = sRect.top + sRect.height * 0.32;
  const groundY = sRect.top + sRect.height * 0.78;
  const basketX = bRect.left + bRect.width / 2;
  const basketY = bRect.top + bRect.height * 0.32;

  const baseId = Date.now();
  return Array.from({ length: count }, (_, i) => {
    const offsetX = (Math.random() - 0.5) * sRect.width * 0.55;
    return {
      id: `${baseId}-${i}`,
      treeX: treeCenterX + offsetX,
      treeY: treeTop + (Math.random() - 0.5) * sRect.height * 0.18,
      groundX: treeCenterX + offsetX * 0.7 + (Math.random() - 0.5) * 16,
      groundY: groundY + (Math.random() - 0.5) * 14,
      basketX: basketX + (Math.random() - 0.5) * bRect.width * 0.55,
      basketY: basketY + (Math.random() - 0.5) * 8,
      delay: i * 110,
    };
  });
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="text-center">
        <div className="text-7xl mb-4">🪴</div>
        <div className="text-2xl text-[var(--ink-soft)]">
          아직 등록된 학생이 없어요. <br />
          <code className="text-base">/admin/students</code> 에서 학생을 추가해보세요!
        </div>
      </div>
    </div>
  );
}

function formatToday(d: Date): string {
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  const week = "일월화수목금토"[d.getDay()];
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${m}.${day} (${week}) ${hh}:${mm}`;
}
