"use client";

// TV 화면 (1920×1080 가정)
// 좌측: 한 명씩 순차적으로 비춰지는 스포트라이트 (4.5초마다 자동 전환)
// 우측: 모든 활성 학생을 한 화면에 보여주는 컴팩트 그리드 (학생수에 따라 컬럼 자동 조정)
// + Realtime: garden_students/garden_point_logs 변경 감지 → 강조 / 단계 상승 배너

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppleTree, type AppleTreeSize } from "@/components/AppleTree";
import {
  calculateStage,
  getStageInfo,
  pointsToNextStage,
  stageProgress,
} from "@/lib/garden";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { GardenPointLog, GardenStudent } from "@/lib/types";

const SPOTLIGHT_INTERVAL_MS = 4_500; // 한 학생당 스포트라이트 노출 시간
const HIGHLIGHT_MS = 3_000; // 포인트 적립 강조 3초
const BANNER_MS = 5_000; // 단계 상승 배너 5초

type Highlight = { delta: number; expiresAt: number };
type Banner = { name: string; stageName: string; expiresAt: number };

export function TVScreen({ initialStudents }: { initialStudents: GardenStudent[] }) {
  const [students, setStudents] = useState<GardenStudent[]>(initialStudents);
  const [spotlightIdx, setSpotlightIdx] = useState(0);
  const [highlights, setHighlights] = useState<Record<string, Highlight>>({});
  const [banners, setBanners] = useState<Banner[]>([]);
  // SSR 과 클라이언트의 시각이 달라 hydration mismatch 가 나는 것을 방지하기 위해
  // 마운트 전에는 0 으로 두고, 클라이언트에서만 실제 시각으로 갱신합니다.
  const [now, setNow] = useState(0);

  const prevStageRef = useRef<Record<string, number>>({});
  useEffect(() => {
    for (const s of initialStudents) prevStageRef.current[s.id] = s.current_stage;
  }, [initialStudents]);

  // 1초마다 시각 갱신 (현재 시각 표시 + 만료 정리)
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // 누적 포인트 내림차순으로 정렬한 활성 학생 목록
  const sorted = useMemo(
    () =>
      [...students]
        .filter((s) => s.is_active)
        .sort((a, b) => b.total_points - a.total_points),
    [students],
  );

  // 스포트라이트 자동 순환
  useEffect(() => {
    if (sorted.length <= 1) return;
    const t = setInterval(() => {
      setSpotlightIdx((i) => (i + 1) % sorted.length);
    }, SPOTLIGHT_INTERVAL_MS);
    return () => clearInterval(t);
  }, [sorted.length]);
  // 학생 목록 변동으로 인덱스가 범위를 벗어나면 보정
  useEffect(() => {
    if (spotlightIdx >= sorted.length) setSpotlightIdx(0);
  }, [spotlightIdx, sorted.length]);

  // Realtime 구독
  useEffect(() => {
    const sb = createSupabaseBrowserClient();
    if (!sb) return; // 클라이언트 env 미주입 환경에서는 SSR 결과만 표시

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
            setBanners((b) => [
              ...b,
              {
                name: next.name,
                stageName: info.name,
                expiresAt: Date.now() + BANNER_MS,
              },
            ]);
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
        },
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, []);

  // 만료된 강조/배너 정리
  useEffect(() => {
    setHighlights((h) => {
      const cleaned: Record<string, Highlight> = {};
      for (const [k, v] of Object.entries(h)) if (v.expiresAt > now) cleaned[k] = v;
      return Object.keys(cleaned).length === Object.keys(h).length ? h : cleaned;
    });
    setBanners((b) => b.filter((x) => x.expiresAt > now));
  }, [now]);

  // 새로 포인트가 적립된 학생이 있으면 자동으로 그 학생을 스포트라이트로 가져온다.
  // (HIGHLIGHT_MS 동안만 살아있는 highlights 가 들어왔을 때 한 번 점프)
  const lastSeenHighlightId = useRef<string | null>(null);
  useEffect(() => {
    const freshIds = Object.entries(highlights)
      .filter(([, v]) => v.expiresAt > now)
      .map(([k]) => k);
    if (freshIds.length === 0) {
      lastSeenHighlightId.current = null;
      return;
    }
    const target = freshIds[freshIds.length - 1];
    if (target === lastSeenHighlightId.current) return;
    lastSeenHighlightId.current = target;
    const idx = sorted.findIndex((s) => s.id === target);
    if (idx >= 0) setSpotlightIdx(idx);
  }, [highlights, sorted, now]);

  const today = now === 0 ? "" : formatToday(new Date(now));
  const spotlight = sorted[spotlightIdx];
  const cycleLabel =
    sorted.length > 0
      ? `${spotlightIdx + 1} / ${sorted.length}`
      : "0 / 0";

  return (
    <main className="kiosk h-screen w-screen overflow-hidden relative">
      {/* 부드러운 배경 빛 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(240,192,80,0.18),transparent_60%),radial-gradient(50%_50%_at_100%_100%,rgba(214,59,59,0.10),transparent_60%)]"
      />

      {/* 헤더 */}
      <header className="relative z-10 px-12 pt-8 pb-3 flex items-end justify-between">
        <div>
          <h1 className="text-[44px] leading-none font-black tracking-tight text-ink-strong">
            우리들의 사과정원
          </h1>
          <div className="mt-2 text-base text-ink-soft tracking-wide">
            더몬스터학원 · 작은 노력이 모여 큰 열매가 됩니다
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-sm text-ink-soft">출석한 학생</div>
            <div className="text-2xl font-bold tabular-nums">
              {sorted.length}명
            </div>
          </div>
          <div className="h-10 w-px bg-ink-soft/20" />
          <div className="text-2xl tabular-nums text-ink-strong">{today}</div>
        </div>
      </header>

      {/* 본문: 스포트라이트(좌) + 그리드(우) */}
      {sorted.length === 0 ? (
        <EmptyState />
      ) : (
        <section className="relative z-10 grid grid-cols-[minmax(420px,2fr)_3fr] gap-6 px-12 pb-10 h-[calc(100vh-118px)]">
          <Spotlight
            student={spotlight}
            highlight={spotlight ? highlights[spotlight.id] : undefined}
            now={now}
            cycleLabel={cycleLabel}
          />
          <StudentsGrid
            students={sorted}
            spotlightId={spotlight?.id}
            highlights={highlights}
            now={now}
          />
        </section>
      )}

      {/* 단계 상승 배너 (스택) */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-50">
        {banners.map((b, i) => (
          <div
            key={`${b.name}-${b.expiresAt}-${i}`}
            className="px-8 py-4 rounded-2xl bg-harvest-gold text-ink-strong text-2xl font-bold shadow-card-pop animate-pop-in"
          >
            축하합니다! <span className="text-apple">{b.name}</span> 학생이{" "}
            <span className="underline decoration-wavy decoration-apple/60">
              {b.stageName}
            </span>{" "}
            단계로 성장했어요!
          </div>
        ))}
      </div>
    </main>
  );
}

/* ================================================================
   스포트라이트 (좌측 큰 카드)
================================================================ */

function Spotlight({
  student,
  highlight,
  now,
  cycleLabel,
}: {
  student: GardenStudent | undefined;
  highlight: Highlight | undefined;
  now: number;
  cycleLabel: string;
}) {
  if (!student) {
    return (
      <div className="rounded-[32px] bg-white/70 shadow-card flex items-center justify-center text-ink-soft">
        스포트라이트 대기 중…
      </div>
    );
  }

  const stage = calculateStage(student.total_points);
  const info = getStageInfo(stage);
  const progress = stageProgress(student.total_points);
  const remaining = pointsToNextStage(student.total_points);
  const isHarvest = stage === 8;
  const isFresh = highlight && highlight.expiresAt > now;

  return (
    <div
      className={[
        "relative rounded-[32px] overflow-hidden p-8 flex flex-col",
        "bg-gradient-to-br from-white via-cream to-cream-deep",
        "shadow-[0_30px_60px_-30px_rgba(122,80,40,0.45)] ring-1 ring-black/5",
      ].join(" ")}
    >
      {/* 우상단 사이클 인디케이터 */}
      <div className="absolute top-5 right-6 flex items-center gap-2 text-sm text-ink-soft tabular-nums">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-apple animate-pulse" />
        스포트라이트 {cycleLabel}
      </div>

      {/* 단계 배지 */}
      <div className="flex items-center gap-3">
        <div className="px-3 py-1 rounded-full bg-apple/10 text-apple text-sm font-bold tracking-wide">
          {stage}단계 · {info.name}
        </div>
        {isHarvest && (
          <div className="px-3 py-1 rounded-full bg-harvest-gold text-ink-strong text-sm font-bold animate-soft-bounce">
            ★ 수확 완료
          </div>
        )}
      </div>

      {/* 사과나무 (전환 애니메이션) */}
      <div className="flex-1 flex items-center justify-center min-h-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={student.id}
            initial={{ opacity: 0, scale: 0.9, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: -10 }}
            transition={{ duration: 0.5, ease: [0.34, 1.2, 0.64, 1] }}
            className="relative"
          >
            <AppleTree stage={stage} size="xl" />
            {isFresh && (
              <div className="absolute -top-3 -right-2 px-4 py-2 rounded-2xl bg-leaf-dark text-white text-2xl font-bold shadow-card-pop animate-pop-in">
                +{highlight!.delta}pt
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 이름/포인트 (전환 애니메이션) */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${student.id}-info`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.45, delay: 0.05 }}
          className="text-center"
        >
          <div className="text-6xl font-black tracking-tight leading-none truncate">
            {student.name}
          </div>
          {student.class_name && (
            <div className="mt-2 text-lg text-ink-soft">
              {student.class_name}
            </div>
          )}
          <div className="mt-5 flex items-baseline justify-center gap-2">
            <span className="text-7xl font-black tabular-nums text-ink-strong">
              {student.total_points}
            </span>
            <span className="text-2xl text-ink-soft">pt</span>
          </div>

          {/* 진행도 바 */}
          <div className="mt-5 mx-auto max-w-[80%]">
            <div className="relative h-3 rounded-full bg-cream-deep overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-leaf-light via-leaf-dark to-apple transition-[width] duration-700 ease-out"
                style={{ width: `${Math.max(4, progress * 100)}%` }}
              />
            </div>
            <div className="mt-2 text-sm text-ink-soft">
              {remaining > 0
                ? `다음 단계까지 ${remaining}pt`
                : "최고 단계 달성!"}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ================================================================
   학생 그리드 (우측, 모든 학생 표시)
================================================================ */

function StudentsGrid({
  students,
  spotlightId,
  highlights,
  now,
}: {
  students: GardenStudent[];
  spotlightId: string | undefined;
  highlights: Record<string, Highlight>;
  now: number;
}) {
  const cols = colsFor(students.length);
  const treeSize: AppleTreeSize = cols >= 8 ? "xs" : "small";

  return (
    <div className="rounded-[32px] bg-white/55 backdrop-blur-sm shadow-card ring-1 ring-black/5 p-5 overflow-hidden">
      <div
        className="grid gap-3 h-full content-start"
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
}: {
  student: GardenStudent;
  rank: number;
  isSpotlight: boolean;
  highlight: Highlight | undefined;
  now: number;
  treeSize: AppleTreeSize;
}) {
  const stage = calculateStage(student.total_points);
  const isHarvest = stage === 8;
  const isFresh = highlight && highlight.expiresAt > now;

  return (
    <motion.div
      animate={{
        scale: isSpotlight ? 1.05 : 1,
      }}
      transition={{ type: "spring", stiffness: 220, damping: 22 }}
      className={[
        "relative rounded-2xl bg-white p-2.5 flex flex-col items-center justify-between gap-1",
        "transition-[box-shadow,outline-color] duration-300",
        isSpotlight
          ? "shadow-card-pop outline outline-[3px] outline-apple z-10"
          : "shadow-[0_4px_14px_-8px_rgba(122,80,40,0.35)]",
        !isSpotlight && isHarvest ? "ring-2 ring-harvest-gold" : "",
      ].join(" ")}
    >
      {/* 좌상단 순위 (Top 3는 색상 배지) */}
      <div
        className={[
          "absolute top-1.5 left-1.5 min-w-[22px] h-[22px] px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center tabular-nums",
          rank === 1
            ? "bg-harvest-gold text-ink-strong"
            : rank === 2
              ? "bg-[#cdd0d4] text-ink-strong"
              : rank === 3
                ? "bg-[#d9a273] text-white"
                : "bg-cream-deep text-ink-soft",
        ].join(" ")}
      >
        {rank}
      </div>

      {/* 우상단 수확 별 */}
      {isHarvest && (
        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-harvest-gold text-ink-strong flex items-center justify-center text-[12px] font-bold shadow-card">
          ★
        </div>
      )}

      {/* 적립 강조 배지 */}
      {isFresh && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-leaf-dark text-white text-xs font-bold animate-pop-in shadow-card-pop">
          {(highlight!.delta > 0 ? "+" : "") + highlight!.delta}pt
        </div>
      )}

      {/* 사과나무 */}
      <div className="flex-1 flex items-center justify-center w-full pt-3">
        <AppleTree stage={stage} size={treeSize} />
      </div>

      {/* 이름 + 포인트 */}
      <div className="text-center w-full">
        <div className="text-[13px] font-bold truncate leading-tight">
          {student.name}
        </div>
        <div className="text-[11px] text-ink-soft tabular-nums">
          {student.total_points}
          <span className="ml-0.5">pt</span>
        </div>
      </div>
    </motion.div>
  );
}

/* ================================================================
   유틸
================================================================ */

// 학생 수에 맞춰 그리드 컬럼 수를 자동 결정 (최대 10열)
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

function EmptyState() {
  return (
    <div className="relative z-10 flex items-center justify-center h-[calc(100vh-118px)]">
      <div className="text-center">
        <div className="text-7xl mb-4">🪴</div>
        <div className="text-2xl text-ink-soft">
          아직 등록된 학생이 없어요. <br />
          <code className="text-base">/admin/students</code> 에서 학생을
          추가해보세요!
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
