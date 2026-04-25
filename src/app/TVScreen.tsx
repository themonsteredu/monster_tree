"use client";

// TV 화면의 클라이언트 측 로직.
// - Realtime 구독으로 학생/포인트 변경 감지
// - 페이지네이션 (12명씩)
// - 방금 업데이트된 학생 강조
// - 단계 상승 축하 배너

import { useEffect, useMemo, useRef, useState } from "react";
import { AppleTree } from "@/components/AppleTree";
import { calculateStage, getStageInfo, pointsToNextStage } from "@/lib/garden";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { GardenPointLog, GardenStudent } from "@/lib/types";

const PAGE_SIZE = 12; // 4 열 × 3 행
const PAGE_INTERVAL_MS = 15_000; // 15초마다 페이지 전환
const HIGHLIGHT_MS = 3_000; // 포인트 적립 강조 3초
const BANNER_MS = 5_000; // 단계 상승 배너 5초

type Highlight = { delta: number; expiresAt: number };
type Banner = { name: string; stageName: string; expiresAt: number };

export function TVScreen({ initialStudents }: { initialStudents: GardenStudent[] }) {
  const [students, setStudents] = useState<GardenStudent[]>(initialStudents);
  const [page, setPage] = useState(0);
  const [highlights, setHighlights] = useState<Record<string, Highlight>>({});
  const [banners, setBanners] = useState<Banner[]>([]);
  // SSR 과 클라이언트의 시각이 달라 hydration mismatch 가 나는 것을 방지하기 위해
  // 마운트 전에는 0 으로 두고, 클라이언트에서만 실제 시각으로 갱신합니다.
  const [now, setNow] = useState(0);

  // 이전 단계 캐시 (단계 상승 감지용)
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

  // 페이지 자동 전환
  const sorted = useMemo(
    () =>
      [...students]
        .filter((s) => s.is_active)
        .sort((a, b) => b.total_points - a.total_points),
    [students],
  );
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  useEffect(() => {
    if (pageCount <= 1) return;
    const t = setInterval(() => {
      setPage((p) => (p + 1) % pageCount);
    }, PAGE_INTERVAL_MS);
    return () => clearInterval(t);
  }, [pageCount]);
  // 페이지 수가 줄면 현재 페이지 인덱스 보정
  useEffect(() => {
    if (page >= pageCount) setPage(0);
  }, [page, pageCount]);

  // Realtime 구독
  useEffect(() => {
    const sb = createSupabaseBrowserClient();
    // 환경변수가 클라이언트 번들에 inline 되지 않은 배포 환경에서는
    // 조용히 구독을 건너뜁니다. (SSR 데이터로 화면은 그대로 렌더됨)
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

          // 단계 상승 감지
          const prevStage = prevStageRef.current[next.id] ?? next.current_stage;
          if (next.current_stage > prevStage) {
            const info = getStageInfo(next.current_stage as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8);
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

  const visible = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  // now === 0 이면 SSR 단계 → 시각 영역만 빈 칸으로 두어 hydration mismatch 회피
  const today = now === 0 ? "" : formatToday(new Date(now));

  return (
    <main className="min-h-screen kiosk overflow-hidden">
      {/* 헤더 */}
      <header className="px-10 pt-8 pb-4 flex items-baseline justify-between">
        <h1 className="text-4xl font-bold tracking-tight">
          더몬스터학원 <span className="text-apple">·</span> 우리들의 사과정원
        </h1>
        <div className="text-2xl text-ink-soft tabular-nums">{today}</div>
      </header>

      {/* 그리드 */}
      <section className="px-10 pb-10">
        {sorted.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-4 grid-rows-3 gap-6 h-[calc(100vh-180px)]">
            {visible.map((s) => (
              <StudentCard
                key={s.id}
                student={s}
                highlight={highlights[s.id]}
                now={now}
              />
            ))}
          </div>
        )}
      </section>

      {/* 페이지 인디케이터 */}
      {pageCount > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
          {Array.from({ length: pageCount }).map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all ${
                i === page ? "w-8 bg-apple" : "w-2 bg-ink-soft/30"
              }`}
            />
          ))}
        </div>
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
  const isHarvest = stage === 8;
  const isFresh = highlight && highlight.expiresAt > now;
  const remaining = pointsToNextStage(student.total_points);

  return (
    <div
      className={[
        "relative rounded-3xl bg-white shadow-card p-5 flex flex-col items-center justify-between transition-all duration-300",
        isHarvest ? "ring-4 ring-harvest-gold" : "",
        isFresh ? "ring-4 ring-leaf-dark scale-[1.02]" : "",
      ].join(" ")}
    >
      {/* 우상단: 수확 별 / 갓 적립 배지 */}
      {isHarvest && (
        <div className="absolute -top-3 -right-3 w-10 h-10 rounded-full bg-harvest-gold text-ink-strong flex items-center justify-center text-2xl font-bold shadow-card">
          ★
        </div>
      )}
      {isFresh && (
        <div className="absolute -top-3 -left-3 px-3 py-1 rounded-full bg-leaf-dark text-white text-xl font-bold animate-pop-in">
          {(highlight!.delta > 0 ? "+" : "") + highlight!.delta}pt
        </div>
      )}

      {/* 사과나무 */}
      <div className="flex-1 flex items-center justify-center w-full">
        <AppleTree stage={stage} size="large" />
      </div>

      {/* 이름 + 포인트 */}
      <div className="text-center w-full">
        <div className="text-3xl font-bold truncate">{student.name}</div>
        <div className="text-sm text-ink-soft mt-1">
          {student.class_name ?? "—"}
        </div>
        <div className="mt-2 text-2xl font-semibold tabular-nums">
          {student.total_points}
          <span className="text-base text-ink-soft ml-1">pt</span>
        </div>
        {remaining > 0 ? (
          <div className="text-xs text-ink-soft mt-1">
            다음 단계까지 {remaining}pt
          </div>
        ) : (
          <div className="text-xs text-harvest-gold font-bold mt-1">
            수확 완료!
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="text-center">
        <div className="text-7xl mb-4">🪴</div>
        <div className="text-2xl text-ink-soft">
          아직 등록된 학생이 없어요. <br />
          <code className="text-base">/admin/students</code> 에서 학생을 추가해보세요!
        </div>
      </div>
    </div>
  );
}

function formatToday(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  const week = "일월화수목금토"[d.getDay()];
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${y}.${m}.${day} (${week}) ${hh}:${mm}`;
}
