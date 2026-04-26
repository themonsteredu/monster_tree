"use client";

// TV 화면 (1920×1080 풀스크린 가로 모드 가정)
//
// 레이아웃:
//   [헤더: 타이틀 / TOP 학생 / 오늘 수확 / 시계]
//   ┌─────────────────────┬───────────────────────────────────┐
//   │   SPOTLIGHT (좌)    │   STUDENTS GRID (우)              │
//   │   한 학생씩 큰 사과나무 │   모든 학생을 컴팩트 카드로 한 번에 │
//   │   4초마다 자동 교체    │   현재 스포트라이트 학생 강조        │
//   └─────────────────────┴───────────────────────────────────┘
//                                                  [수확 바구니]
//
// Realtime:
// - garden_students: 학생 정보 갱신, 단계 상승 시 배너 + 컨페티
// - garden_point_logs: +pt 강조 (3초)
// - garden_harvests: 사과가 카드 → 바구니로 포물선 비행

import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "framer-motion";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { AppleTree, type AppleTreeMood, type AppleTreeSize } from "@/components/AppleTree";
import {
  calculateStage,
  getStageInfo,
  pointsToNextStage,
  stageProgress,
} from "@/lib/garden";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { GardenPointLog, GardenStudent } from "@/lib/types";

const SPOTLIGHT_INTERVAL_MS = 4_000; // 한 학생당 스포트라이트 노출 시간
const HIGHLIGHT_MS = 3_000;
const BANNER_MS = 5_000;
const HARVEST_BANNER_MS = 10_000;
const FLY_DURATION_MS = 3_500; // 2s 떨어짐(중력) + 1.5s 바구니로 비행

type Highlight = { delta: number; expiresAt: number };
type Banner = {
  id: string;
  name: string;
  stage: number;
  stageName: string;
  expiresAt: number;
};
// 수확 시퀀스: tree → ground → basket (3 keyframe trajectory)
type FlyingApple = {
  id: string;
  // Phase 1 시작: 캐노피 위
  treeX: number;
  treeY: number;
  // Phase 1 끝 / Phase 2 시작: 화분 근처 바닥
  groundX: number;
  groundY: number;
  // Phase 2 끝: 바구니
  basketX: number;
  basketY: number;
  // 사과들이 시간차로 떨어지게 (후두두 효과)
  delay: number;
};

// 단계별 액센트 (배지/진행바 컬러)
const STAGE_ACCENT: Record<
  number,
  { bg: string; text: string; emoji: string; barFill: string }
> = {
  1: { bg: "bg-white", text: "text-[var(--ink-soft)]", emoji: "🪴", barFill: "var(--ink-soft)" },
  2: { bg: "bg-[#f3eadc]", text: "text-[var(--ink)]", emoji: "🌱", barFill: "var(--leaf-deep)" },
  3: { bg: "bg-[#dbecc1]", text: "text-[var(--leaf-deep)]", emoji: "🌿", barFill: "var(--leaf-base)" },
  4: { bg: "bg-[#cfe6a8]", text: "text-[var(--leaf-deep)]", emoji: "🌳", barFill: "var(--leaf-base)" },
  5: { bg: "bg-[#bfdc8a]", text: "text-[var(--leaf-deep)]", emoji: "🌳", barFill: "var(--leaf-base)" },
  6: { bg: "bg-[#f8d8e8]", text: "text-[#b0398e]", emoji: "🌸", barFill: "var(--accent-purple)" },
  7: { bg: "bg-[#ffd6c8]", text: "text-[var(--apple-deep)]", emoji: "🍎", barFill: "var(--apple-base)" },
  8: { bg: "bg-[var(--accent-gold)]", text: "text-[var(--ink)]", emoji: "★", barFill: "var(--accent-gold-deep)" },
};

export function TVScreen({
  initialStudents,
  initialTodayHarvest = 0,
}: {
  initialStudents: GardenStudent[];
  initialTodayHarvest?: number;
}) {
  const [students, setStudents] = useState<GardenStudent[]>(initialStudents);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [highlights, setHighlights] = useState<Record<string, Highlight>>({});
  const [banners, setBanners] = useState<Banner[]>([]);
  const [todayApples, setTodayApples] = useState<number>(initialTodayHarvest);
  const [bumpBasket, setBumpBasket] = useState(0); // 바구니 살짝 흔들기 트리거
  const [flyingApples, setFlyingApples] = useState<FlyingApple[]>([]);
  // SSR/CSR 시각 mismatch 방지 - 마운트 전에는 0
  const [now, setNow] = useState(0);

  const prevStageRef = useRef<Record<string, number>>({});
  // sorted 의 최신 값 ref (Realtime 핸들러는 마운트 시 한 번만 등록되므로 stale closure 방지)
  const sortedRef = useRef<GardenStudent[]>(initialStudents);
  // 카드 DOM 참조 (사과 비행 시작점 계산용)
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // 바구니 DOM 참조 (사과 비행 도착점 계산용)
  const basketRef = useRef<HTMLDivElement | null>(null);
  // 스포트라이트 패널 참조 (수확 시 사과가 떨어지는 위치)
  const spotlightRef = useRef<HTMLDivElement | null>(null);
  // 현재 흔들리는 학생 (수확 시작 1초 동안)
  const [shakingId, setShakingId] = useState<string | null>(null);

  useEffect(() => {
    for (const s of initialStudents) prevStageRef.current[s.id] = s.current_stage;
  }, [initialStudents]);

  // 1초마다 시각 갱신
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

  // 스포트라이트 자동 순환 - 전체 학생을 한 명씩
  useEffect(() => {
    if (sorted.length <= 1) return;
    const t = setInterval(() => {
      setFocusedIdx((i) => (i + 1) % sorted.length);
    }, SPOTLIGHT_INTERVAL_MS);
    return () => clearInterval(t);
  }, [sorted.length]);

  // 학생 수가 줄어들어 인덱스가 범위를 벗어나면 보정
  useEffect(() => {
    if (focusedIdx >= sorted.length) setFocusedIdx(0);
  }, [focusedIdx, sorted.length]);

  // sorted 의 최신 값을 ref 에 저장 (Realtime 핸들러에서 사용)
  useEffect(() => {
    sortedRef.current = sorted;
  }, [sorted]);

  // Realtime 구독
  useEffect(() => {
    const sb = createSupabaseBrowserClient();
    if (!sb) return;

    // 수확 시퀀스: 스포트라이트 점프 → 흔들림(1s) → 후두두 떨어짐 + 바구니 비행(3.5s) → 배너
    function triggerHarvestSequence(studentId: string, count: number) {
      const idx = sortedRef.current.findIndex((s) => s.id === studentId);
      if (idx >= 0) setFocusedIdx(idx);

      // 스포트라이트가 새 학생으로 리렌더된 직후 흔들림 시작
      window.setTimeout(() => {
        setShakingId(studentId);
        window.setTimeout(() => {
          setShakingId((cur) => (cur === studentId ? null : cur));
        }, 1000);
      }, 120);

      // 흔들림 종료(~1100ms 후) 시점에 사과들을 후두두 떨어뜨림
      window.setTimeout(() => {
        const items = buildFallingApples(
          count,
          spotlightRef.current,
          basketRef.current,
        );
        if (items.length > 0) {
          setFlyingApples((prev) => [...prev, ...items]);
        } else {
          // refs 가 준비 안 된 fallback - 바구니 카운트만 즉시 +N
          setTodayApples((c) => c + count);
          setBumpBasket((k) => k + 1);
        }
      }, 1100);
    }

    const channel = sb
      .channel("garden-tv")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "garden_students" },
        (payload) => {
          const next = payload.new as GardenStudent | null;
          const old = payload.old as GardenStudent | null;
          if (payload.eventType === "DELETE" && old) {
            setStudents((prev) => prev.filter((s) => s.id !== old.id));
            return;
          }
          if (!next) return;

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
            // 컨페티
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
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "garden_point_logs" },
        (payload) => {
          const log = payload.new as GardenPointLog;
          if (!log?.student_id) return;
          setHighlights((h) => ({
            ...h,
            [log.student_id]: {
              delta: (h[log.student_id]?.delta ?? 0) + log.points,
              expiresAt: Date.now() + HIGHLIGHT_MS,
            },
          }));
          // 포인트 적립 시 해당 학생을 즉시 스포트라이트로 점프
          // (정상 사이클은 다음 SPOTLIGHT_INTERVAL_MS 후에 다시 진행)
          const idx = sortedRef.current.findIndex((s) => s.id === log.student_id);
          if (idx >= 0) setFocusedIdx(idx);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "garden_harvests" },
        (payload) => {
          const harvest = payload.new as {
            student_id: string;
            apples_count: number;
          } | null;
          if (!harvest?.student_id) return;
          triggerHarvestSequence(harvest.student_id, harvest.apples_count);
        },
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, []);

  // 만료 정리
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
    <main className="kiosk min-h-screen relative overflow-hidden">
      {/* 배경 데코 닷 (절제 있게 4개) */}
      <DecorDots />

      {/* 헤더 */}
      <header className="relative z-10 px-8 pt-6 pb-3 flex items-center justify-between">
        <TitlePill />
        <div className="flex items-center gap-3">
          <TodayHarvestPill count={todayApples} bump={bumpBasket} />
          {top && <TopStudentPill name={top.name} points={top.total_points} />}
          <div className="px-4 py-2 rounded-full bg-white border-[2.5px] border-[var(--ink)] text-[var(--ink)] tabular-nums text-lg font-bold shadow-card">
            {today}
          </div>
        </div>
      </header>

      {/* 본문: 좌측 스포트라이트 + 우측 컴팩트 그리드 */}
      {sorted.length === 0 ? (
        <EmptyState />
      ) : (
        <section
          className="relative z-10 grid gap-6 px-8 pb-10"
          style={{
            gridTemplateColumns: "minmax(420px, 36%) 1fr",
            height: "calc(100vh - 130px)",
          }}
        >
          <Spotlight
            ref={spotlightRef}
            student={spotlight}
            highlight={spotlight ? highlights[spotlight.id] : undefined}
            now={now}
            cycleLabel={cycleLabel}
            isShaking={!!spotlight && shakingId === spotlight.id}
          />
          <CompactGrid
            students={sorted}
            spotlightId={spotlight?.id}
            highlights={highlights}
            now={now}
            registerRef={(id, el) => {
              cardRefs.current[id] = el;
            }}
          />
        </section>
      )}

      {/* 하단 포인트 적립 기준 바 */}
      <CriteriaBar />

      {/* 우하단 수확 바구니 */}
      <HarvestBasket
        ref={basketRef}
        count={todayApples}
        bumpKey={bumpBasket}
      />

      {/* 사과 비행 layer (포물선) */}
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

      {/* 단계 상승 모달 배너 */}
      {banners.map((b) => (
        <StageUpBanner key={b.id} banner={b} />
      ))}
    </main>
  );
}

/* ================================================================
   좌측 스포트라이트 (큰 카드 1개, 4초마다 학생 교체)
================================================================ */

const Spotlight = forwardRef<
  HTMLDivElement,
  {
    student: GardenStudent | undefined;
    highlight: Highlight | undefined;
    now: number;
    cycleLabel: string;
    isShaking: boolean;
  }
>(function Spotlight({ student, highlight, now, cycleLabel, isShaking }, ref) {
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
        "relative rounded-[28px] border-[2.5px] border-[var(--ink)] p-7 flex flex-col items-center",
        isHarvest
          ? "bg-[var(--card-bg-hero)] hero-glow"
          : "bg-[var(--card-bg)] shadow-card",
      ].join(" ")}
    >
      {/* 우상단 사이클 인디케이터 */}
      <div className="absolute top-4 right-5 flex items-center gap-2 text-sm font-bold text-[var(--ink-soft)] tabular-nums">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--apple-base)] animate-pulse" />
        스포트라이트 {cycleLabel}
      </div>

      {/* 단계 배지 + 수확 배지 */}
      <div className="flex items-center gap-2 mt-1">
        <span
          className={[
            "inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-extrabold border-[2.5px] border-[var(--ink)] shadow-card",
            accent.bg,
            accent.text,
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

      {/* 사과나무 (학생 교체 시 부드러운 페이드/스케일 전환) */}
      <div className="flex-1 flex items-center justify-center w-full min-h-0 my-3">
        <AnimatePresence mode="wait">
          <motion.div
            key={student.id}
            initial={{ opacity: 0, scale: 0.85, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -10 }}
            transition={{ duration: 0.45, ease: [0.34, 1.2, 0.64, 1] }}
            className={["relative", isShaking ? "tree-shake" : ""].join(" ")}
          >
            <AppleTree
              stage={stage}
              size="xl"
              mood={mood}
              wilted={isNegative}
              growthBoost={progress}
            />
            {isPositive && (
              <>
                <div className="absolute -top-2 -right-2 px-3.5 py-1.5 rounded-2xl bg-[var(--accent-success)] border-[2.5px] border-[var(--ink)] text-white text-xl font-extrabold shadow-card-pop animate-pop-in">
                  +{highlight!.delta}pt ✨
                </div>
                <SprayWater />
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

      {/* 학생 정보 + 진행도 (학생 교체 시 같이 페이드) */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${student.id}-info`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.4, delay: 0.06 }}
          className="text-center w-full"
        >
          <div className="text-5xl font-black tracking-tight leading-none truncate">
            {student.name}
          </div>
          {student.class_name && (
            <div className="mt-2 text-base font-semibold text-[var(--ink-soft)]">
              {student.class_name}
            </div>
          )}
          <div className="mt-4 flex items-baseline justify-center gap-1.5">
            <span className="text-6xl font-black tabular-nums text-[var(--ink)]">
              {student.total_points}
            </span>
            <span className="text-xl font-bold text-[var(--ink-soft)]">pt</span>
          </div>
          {/* 누적 수확 사과 수 */}
          {student.apples_harvested > 0 && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--card-bg-hero)] border-[2px] border-[var(--ink)] text-[var(--ink)] text-sm font-extrabold tabular-nums">
              🍎 × {student.apples_harvested}개
            </div>
          )}

          {/* 진행도 바 / 수확 알약 */}
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
                barFill={accent.barFill}
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

/* ================================================================
   우측 컴팩트 그리드 (모든 학생을 한 화면에)
================================================================ */

function CompactGrid({
  students,
  spotlightId,
  highlights,
  now,
  registerRef,
}: {
  students: GardenStudent[];
  spotlightId: string | undefined;
  highlights: Record<string, Highlight>;
  now: number;
  registerRef: (id: string, el: HTMLDivElement | null) => void;
}) {
  const cols = colsFor(students.length);
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
      {/* 좌상단 순위 (Top 3 색상) */}
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

      {/* 우상단 수확 별 */}
      {isHarvest && (
        <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-[var(--accent-gold)] border-[1.5px] border-[var(--ink)] text-[var(--ink)] flex items-center justify-center text-[12px] font-extrabold">
          ★
        </div>
      )}

      {/* +pt 강조 */}
      {isFresh && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-[var(--accent-success)] border-[1.5px] border-[var(--ink)] text-white text-[11px] font-extrabold animate-pop-in shadow-card">
          {(highlight!.delta > 0 ? "+" : "") + highlight!.delta}
        </div>
      )}

      {/* 사과나무 */}
      <div className="flex-1 flex items-center justify-center w-full pt-3 relative">
        <AppleTree
          stage={stage}
          size={treeSize}
          mood={mood}
          wilted={isNegative}
          growthBoost={progress}
        />
        {isPositive && <SprayWater compact />}
      </div>

      {/* 이름 + pt + 사과 누적 */}
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

// 학생 수에 맞춰 그리드 컬럼 수를 결정 (최대 10열)
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

function BurstLines() {
  const lines = useMemo(
    () =>
      Array.from({ length: 8 }).map((_, i) => {
        const angle = (i / 8) * 360;
        return { angle, delay: i * 30 };
      }),
    [],
  );
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-visible"
    >
      {lines.map((l, i) => (
        <div
          key={i}
          className="burst-line absolute left-1/2 top-1/2"
          style={{
            transform: `translate(-50%, -50%) rotate(${l.angle}deg) translateY(-60px)`,
            animationDelay: `${l.delay}ms`,
          }}
        >
          <div className="w-[3px] h-[14px] rounded-full bg-[var(--accent-gold)] border border-[var(--ink)]/30" />
        </div>
      ))}
    </div>
  );
}

/* ================================================================
   헤더 부품
================================================================ */

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

// 헤더의 "오늘 수확 N개" 알약. bumpKey 가 바뀔 때마다 살짝 흔들리며 강조.
function TodayHarvestPill({
  count,
  bump,
}: {
  count: number;
  bump: number;
}) {
  return (
    <motion.div
      key={bump}
      initial={{ scale: 1 }}
      animate={{ scale: bump > 0 ? [1, 1.15, 1] : 1 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-[var(--card-bg-hero)] text-[var(--ink)] border-[2.5px] border-[var(--ink)] shadow-card"
    >
      <span className="text-lg">🍎</span>
      <span className="font-extrabold text-sm">오늘 수확</span>
      <span className="font-extrabold tabular-nums">{count}개</span>
    </motion.div>
  );
}

/* ================================================================
   하단 포인트 적립 기준 바 (placeholder - 양희쌤이 알려주시면 교체)
================================================================ */

// 자주 쓰는 적립 사유와 추천 포인트.
// 실제 운영 기준이 정해지면 이 배열만 갈아끼우면 됨.
const CRITERIA: ReadonlyArray<{ label: string; pts: number; emoji: string }> = [
  { label: "출석", pts: 1, emoji: "📅" },
  { label: "지각 안 함", pts: 1, emoji: "⏰" },
  { label: "숙제 완료", pts: 2, emoji: "📝" },
  { label: "수업 태도 우수", pts: 3, emoji: "🌟" },
  { label: "테스트 70점↑", pts: 2, emoji: "✏️" },
  { label: "테스트 80점↑", pts: 3, emoji: "📘" },
  { label: "테스트 90점↑", pts: 5, emoji: "🏆" },
];

function CriteriaBar() {
  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 max-w-[78%]">
      <div className="flex items-center gap-2 flex-wrap justify-center">
        <span className="text-xs font-extrabold text-[var(--ink-soft)] mr-1">
          포인트 기준
        </span>
        {CRITERIA.map((c) => (
          <span
            key={c.label}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border-[2px] border-[var(--ink)] text-[var(--ink)] text-xs font-bold shadow-card"
          >
            <span>{c.emoji}</span>
            <span>{c.label}</span>
            <span className="text-[var(--accent-success)] font-extrabold tabular-nums">
              +{c.pts}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ================================================================
   분무기 + 미스트 (포인트 적립 시 나무에 물 뿌리기)
================================================================ */

function SprayWater({ compact = false }: { compact?: boolean }) {
  // compact=true: 컴팩트 카드용 (작게), false: 스포트라이트용 (크게)
  const particleCount = compact ? 8 : 16;
  // 분무기 노즐 위치 (우상단). 미스트는 여기서 좌하단 부채꼴로 뿜어져 나옴
  const bottlePx = compact ? 28 : 56;
  // 미스트 부채꼴 범위 (좌하단으로 -130도 ~ -200도)
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-visible z-30"
    >
      {/* 분무기 SVG (우상단) */}
      <div
        className="absolute spray-wiggle"
        style={{
          top: compact ? 0 : 6,
          right: compact ? -2 : 12,
          width: bottlePx,
          height: bottlePx,
        }}
      >
        <SprayBottleSVG />
      </div>

      {/* 미스트 입자들 (분무기 노즐에서 좌하단 부채꼴로) */}
      {Array.from({ length: particleCount }).map((_, i) => {
        // 노즐 화면상 좌표 (분무기 좌상단 코너 근처)
        const nozzleTop = compact ? 6 : 14;
        const nozzleRight = compact ? 16 : 38;
        // 부채꼴 각도: -160도 ~ -200도 (좌하단 방향)
        const angleDeg = -160 - (i / particleCount) * 80 + ((i * 13) % 7) * 2;
        const angleRad = (angleDeg * Math.PI) / 180;
        const distance = (compact ? 26 : 60) + ((i * 7) % 11) * 2;
        const dx = Math.cos(angleRad) * distance;
        const dy = -Math.sin(angleRad) * distance; // 화면 y 는 아래로
        const delay = i * 35;
        const dotSize = compact ? 3.5 : 6;
        return (
          <div
            key={i}
            className="spray-mist absolute rounded-full"
            style={{
              top: nozzleTop,
              right: nozzleRight,
              width: dotSize,
              height: dotSize,
              background: "#7fc6e8",
              border: "1.2px solid var(--ink)",
              opacity: 0,
              animationDelay: `${delay}ms`,
              ["--spray-x" as string]: `${dx}px`,
              ["--spray-y" as string]: `${dy}px`,
            }}
          />
        );
      })}
    </div>
  );
}

function SprayBottleSVG() {
  // 단순 분무기: 본체 + 노즐 + 트리거
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <defs>
        <linearGradient id="bottle-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#a8e0ff" />
          <stop offset="100%" stopColor="#5cb8e8" />
        </linearGradient>
      </defs>
      {/* 본체 (라운드 사각형) */}
      <rect
        x="36"
        y="40"
        width="44"
        height="48"
        rx="6"
        fill="url(#bottle-grad)"
        stroke="var(--ink)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {/* 라벨 */}
      <rect x="42" y="56" width="32" height="18" rx="2" fill="#fff" stroke="var(--ink)" strokeWidth="1.6" />
      <line x1="46" y1="61" x2="70" y2="61" stroke="#5cb8e8" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="46" y1="65" x2="66" y2="65" stroke="#5cb8e8" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="46" y1="69" x2="68" y2="69" stroke="#5cb8e8" strokeWidth="1.4" strokeLinecap="round" />
      {/* 목 */}
      <rect x="46" y="32" width="20" height="10" fill="#5cb8e8" stroke="var(--ink)" strokeWidth="2.5" />
      {/* 트리거 손잡이 */}
      <path
        d="M 36 44 L 24 44 L 22 56 L 30 56 L 34 50 Z"
        fill="#7fc6e8"
        stroke="var(--ink)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* 노즐 (좌상단) */}
      <path
        d="M 46 32 L 46 22 L 18 22 L 12 26 L 18 30 L 46 30 Z"
        fill="#5cb8e8"
        stroke="var(--ink)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* 노즐 입구 점 */}
      <circle cx="13" cy="26" r="1.4" fill="var(--ink)" />
    </svg>
  );
}

/* ================================================================
   수확 바구니 (우하단 고정) + 비행 사과
================================================================ */

// 우하단 큰 바구니. 사과가 도착하면 살짝 튀어오르며 카운트가 +1 됨.
const HarvestBasket = forwardRef<HTMLDivElement, { count: number; bumpKey: number }>(
  function HarvestBasket({ count, bumpKey }, ref) {
    return (
      <motion.div
        ref={ref}
        animate={{ rotate: bumpKey > 0 ? [0, -3, 3, 0] : 0, y: bumpKey > 0 ? [0, -6, 0] : 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="fixed bottom-6 right-6 z-30 pointer-events-none select-none"
      >
        <div className="relative">
          {/* 바구니 SVG */}
          <BasketSVG />
          {/* 카운트 배지 (바구니 위쪽에 알약) */}
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3.5 py-1 rounded-full bg-[var(--ink)] border-[2.5px] border-[var(--ink)] text-[var(--accent-gold)] text-base font-extrabold shadow-card-pop tabular-nums whitespace-nowrap">
            🍎 {count}
          </div>
        </div>
      </motion.div>
    );
  },
);

function BasketSVG() {
  return (
    <svg
      viewBox="0 0 200 160"
      width={180}
      height={144}
      role="img"
      aria-label="수확 바구니"
    >
      <defs>
        <linearGradient id="basket-side" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#c9924f" />
          <stop offset="100%" stopColor="#8a5a26" />
        </linearGradient>
        <linearGradient id="basket-rim" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#d8a868" />
          <stop offset="100%" stopColor="#a4753a" />
        </linearGradient>
      </defs>

      {/* 그림자 */}
      <ellipse cx="100" cy="148" rx="78" ry="6" fill="var(--ink)" opacity="0.18" />

      {/* 바구니 본체 (사다리꼴) */}
      <path
        d="M 26 60 L 174 60 L 162 142 L 38 142 Z"
        fill="url(#basket-side)"
        stroke="var(--ink)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {/* 바구니 위빙 라인 */}
      {[78, 96, 114, 132].map((y) => (
        <path
          key={y}
          d={`M ${30 + (y - 60) * 0.18} ${y} L ${170 - (y - 60) * 0.18} ${y}`}
          stroke="var(--ink)"
          strokeWidth="1.5"
          opacity="0.45"
        />
      ))}
      {[60, 90, 120, 150].map((x) => (
        <path
          key={x}
          d={`M ${x} 60 L ${x - 6} 142`}
          stroke="var(--ink)"
          strokeWidth="1.5"
          opacity="0.35"
        />
      ))}
      {/* 위쪽 가장자리 림 */}
      <ellipse
        cx="100"
        cy="60"
        rx="76"
        ry="12"
        fill="url(#basket-rim)"
        stroke="var(--ink)"
        strokeWidth="3"
      />
      <ellipse cx="100" cy="58" rx="68" ry="7" fill="#5a3a1a" opacity="0.55" />

      {/* 안쪽 사과 더미 (장식) */}
      <g>
        <circle cx="78" cy="56" r="9" fill="var(--apple-base)" stroke="var(--ink)" strokeWidth="2" />
        <circle cx="76" cy="54" r="2.5" fill="#fff" opacity="0.7" />
        <circle cx="100" cy="50" r="11" fill="var(--apple-base)" stroke="var(--ink)" strokeWidth="2" />
        <circle cx="97" cy="47" r="3" fill="#fff" opacity="0.8" />
        <circle cx="124" cy="55" r="9" fill="var(--apple-base)" stroke="var(--ink)" strokeWidth="2" />
        <circle cx="122" cy="53" r="2.5" fill="#fff" opacity="0.7" />
      </g>

      {/* 손잡이 */}
      <path
        d="M 30 60 Q 100 -30 170 60"
        fill="none"
        stroke="url(#basket-rim)"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path
        d="M 30 60 Q 100 -30 170 60"
        fill="none"
        stroke="var(--ink)"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.85"
      />
    </svg>
  );
}

// 사과가 캐노피 → 바닥(후두두) → 바구니로 3-페이즈로 이동.
// 각 사과는 fa.delay (0..700ms) 만큼 늦게 시작해 "후두두" 효과를 낸다.
// times 0..0.57: 떨어지기 (2s, gravity), 0.57..1: 바구니로 비행 (1.5s)
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

/* ================================================================
   배경 데코
================================================================ */

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

/* ================================================================
   단계업 배너 (모달형)
================================================================ */

function StageUpBanner({ banner }: { banner: Banner }) {
  const isHarvest = banner.stage === 8;
  const accent = STAGE_ACCENT[banner.stage];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-10 pointer-events-none"
    >
      {/* 살짝 어둡게 + blur */}
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

/* ================================================================
   유틸
================================================================ */

// 수확 시퀀스용 사과 생성:
// - 시작: 스포트라이트 캐노피 위쪽
// - 중간: 화분/바닥 근처 (떨어진 상태)
// - 도착: 바구니
// 사과마다 0~700ms 시간차로 떨어져 "후두두" 효과
function buildFallingApples(
  count: number,
  spotlightEl: HTMLDivElement | null,
  basketEl: HTMLDivElement | null,
): FlyingApple[] {
  if (!spotlightEl || !basketEl) return [];
  const sRect = spotlightEl.getBoundingClientRect();
  const bRect = basketEl.getBoundingClientRect();
  const treeCenterX = sRect.left + sRect.width / 2;
  // 캐노피 영역 (스포트라이트 상단 25-50% 영역에 사과들이 흩어져 있다고 가정)
  const treeTop = sRect.top + sRect.height * 0.32;
  // 화분 근처 (스포트라이트 하단 80% 즈음)
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
      delay: i * 110, // 사과들이 시간차로
    };
  });
}

function fireConfetti(harvest: boolean) {
  const colors = ["#f0c050", "#f04848", "#5e9c38", "#c87fdb", "#ffb8d4"];
  if (harvest) {
    // 수확: 화면 양쪽에서 풍성하게
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
      origin: { y: 0.6 },
      colors,
    });
  }
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
