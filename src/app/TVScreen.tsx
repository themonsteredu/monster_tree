"use client";

// TV 화면 (1920×1080 풀스크린 가로 모드 가정)
// - 학생을 누적 포인트 높은 순으로 정렬해 12명씩 4×3 그리드로 표시
// - 12명 초과 시 15초마다 자동 페이지 전환
// - Supabase Realtime 으로 garden_students/garden_point_logs 변경 감지
//   → 방금 적립된 학생은 3초간 강조 (놀란 표정 + 초록 외곽선 + +pt 배지)
//   → 단계 상승 시 5초 배너 + 컨페티

import confetti from "canvas-confetti";
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppleTree, type AppleTreeMood } from "@/components/AppleTree";
import {
  calculateStage,
  getStageInfo,
  pointsToNextStage,
  stageProgress,
} from "@/lib/garden";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { GardenPointLog, GardenStudent } from "@/lib/types";

const PAGE_SIZE = 12; // 4 × 3
const PAGE_INTERVAL_MS = 15_000;
const HIGHLIGHT_MS = 3_000;
const BANNER_MS = 5_000;
const HARVEST_BANNER_MS = 10_000;

type Highlight = { delta: number; expiresAt: number };
type Banner = {
  id: string;
  name: string;
  stage: number;
  stageName: string;
  expiresAt: number;
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

export function TVScreen({ initialStudents }: { initialStudents: GardenStudent[] }) {
  const [students, setStudents] = useState<GardenStudent[]>(initialStudents);
  const [page, setPage] = useState(0);
  const [highlights, setHighlights] = useState<Record<string, Highlight>>({});
  const [banners, setBanners] = useState<Banner[]>([]);
  // SSR/CSR 시각 mismatch 방지 - 마운트 전에는 0
  const [now, setNow] = useState(0);

  const prevStageRef = useRef<Record<string, number>>({});
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

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));

  // 페이지 자동 전환
  useEffect(() => {
    if (pageCount <= 1) return;
    const t = setInterval(() => {
      setPage((p) => (p + 1) % pageCount);
    }, PAGE_INTERVAL_MS);
    return () => clearInterval(t);
  }, [pageCount]);
  useEffect(() => {
    if (page >= pageCount) setPage(0);
  }, [page, pageCount]);

  // Realtime 구독
  useEffect(() => {
    const sb = createSupabaseBrowserClient();
    if (!sb) return;

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

  const visible = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const today = now === 0 ? "" : formatToday(new Date(now));
  const top = sorted[0];

  return (
    <main className="kiosk min-h-screen relative overflow-hidden">
      {/* 배경 데코 닷 (절제 있게 4개) */}
      <DecorDots />

      {/* 헤더 */}
      <header className="relative z-10 px-8 pt-6 pb-3 flex items-center justify-between">
        <TitlePill />
        <div className="flex items-center gap-3">
          {top && <TopStudentPill name={top.name} points={top.total_points} />}
          <div className="px-4 py-2 rounded-full bg-white border-[2.5px] border-[var(--ink)] text-[var(--ink)] tabular-nums text-lg font-bold shadow-card">
            {today}
          </div>
        </div>
      </header>

      {/* 그리드 */}
      <section className="relative z-10 px-8 pb-10">
        {sorted.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-4 grid-rows-3 gap-5 h-[calc(100vh-130px)]">
            {visible.map((s) => (
              <StudentCard
                key={s.id}
                student={s}
                highlight={highlights[s.id]}
                now={now}
              />
            ))}
            {/* 빈 슬롯 (12개 미만일 때) */}
            {visible.length < PAGE_SIZE &&
              Array.from({ length: PAGE_SIZE - visible.length }).map((_, i) => (
                <div key={`empty-${i}`} className="rounded-[22px] bg-white/30 border-[2.5px] border-dashed border-[var(--ink)]/15" />
              ))}
          </div>
        )}
      </section>

      {/* 페이지 인디케이터 */}
      {pageCount > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {Array.from({ length: pageCount }).map((_, i) => (
            <div
              key={i}
              className={`h-2.5 rounded-full transition-all duration-500 ${
                i === page
                  ? "w-10 bg-[var(--ink)]"
                  : "w-2.5 bg-[var(--ink)]/25"
              }`}
            />
          ))}
        </div>
      )}

      {/* 단계 상승 모달 배너 */}
      {banners.map((b) => (
        <StageUpBanner key={b.id} banner={b} />
      ))}
    </main>
  );
}

/* ================================================================
   학생 카드
================================================================ */

function StudentCard({
  student,
  highlight,
  now,
}: {
  student: GardenStudent;
  highlight: Highlight | undefined;
  now: number;
}) {
  const stage = calculateStage(student.total_points);
  const info = getStageInfo(stage);
  const remaining = pointsToNextStage(student.total_points);
  const progress = stageProgress(student.total_points);
  const isHarvest = stage === 8;
  const isFresh = highlight && highlight.expiresAt > now;
  const accent = STAGE_ACCENT[stage];
  const mood: AppleTreeMood = isFresh ? "surprised" : "happy";

  return (
    <div
      className={[
        "relative rounded-[22px] border-[2.5px] flex flex-col items-center px-3 pt-4 pb-3 gap-1.5",
        "transition-all duration-300",
        isHarvest
          ? "bg-[var(--card-bg-hero)] border-[var(--ink)] hero-glow"
          : "bg-[var(--card-bg)] border-[var(--ink)] shadow-card",
        isFresh ? "!border-[var(--accent-success)] !border-[3.5px]" : "",
      ].join(" ")}
    >
      {/* 상단 뱃지 (단계 표시) - 카드 위쪽으로 살짝 튀어나옴 */}
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20">
        <span
          className={[
            "inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-extrabold border-[2.5px] border-[var(--ink)] shadow-card",
            accent.bg,
            accent.text,
          ].join(" ")}
        >
          <span>{accent.emoji}</span>
          <span>
            {stage}단계 · {info.name}
          </span>
        </span>
      </div>

      {/* 우상단: 수확 가능 뱃지 */}
      {isHarvest && (
        <div className="absolute -top-3 -right-2 z-20 px-2.5 py-1 rounded-full bg-[var(--accent-gold)] border-[2.5px] border-[var(--ink)] text-[var(--ink)] text-xs font-extrabold shadow-card-pop animate-soft-bounce">
          ★ 수확
        </div>
      )}

      {/* 좌상단: 방금 +pt 뱃지 */}
      {isFresh && (
        <>
          <div className="absolute -top-3 -left-2 z-20 px-2.5 py-1 rounded-full bg-[var(--accent-success)] border-[2.5px] border-[var(--ink)] text-white text-xs font-extrabold shadow-card-pop animate-pop-in">
            {(highlight!.delta > 0 ? "+" : "") + highlight!.delta}pt ✨
          </div>
          {/* 카드 양쪽 burst lines */}
          <BurstLines />
        </>
      )}

      {/* 사과나무 */}
      <div className="flex-1 flex items-center justify-center w-full pt-2">
        <AppleTree stage={stage} size="medium" mood={mood} />
      </div>

      {/* 학생 정보 */}
      <div className="text-center w-full">
        <div className="text-[17px] font-extrabold leading-tight truncate">
          {student.name}
        </div>
        <div className="text-[10px] font-semibold text-[var(--ink-soft)] mt-0.5 truncate">
          {student.class_name ? `${student.class_name} · ` : ""}
          {stage}단계
        </div>
      </div>

      {/* 진행률 바 또는 포인트 알약 */}
      <div className="w-full mt-1">
        {isHarvest ? (
          <div className="mx-auto inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full bg-[var(--accent-gold)] border-[2.5px] border-[var(--ink)] text-[var(--ink)] text-sm font-extrabold w-full">
            <span>🍎</span>
            <span className="tabular-nums">{student.total_points} pt</span>
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
      </div>
    </div>
  );
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
