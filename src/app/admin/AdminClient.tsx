"use client";

// Admin 메인 화면 (모바일 한 손 조작 최적화)
// - 반(class) 필터
// - 가로 행 학생 카드 + 빠른 적립 버튼 (+1, +2, +3, +5, -1)
// - 길게 누르면 사유 입력 모달
// - 선택 모드 시 여러 학생 일괄 +pt 적립
// - 점수 적립 시 카드 초록 플래시 + 포인트 카운트업
// - 단계 상승 시 큰 모달 + 컨페티
// - 하단 시트로 "오늘 입력 기록" + "대기 중" 펼치기 + 되돌리기/취소
// - 대기 중 포인트가 12시간 / 3일 묵으면 색으로 강조 (미수령 모니터링)
// - Realtime 으로 다른 화면에서 입력해도 즉시 갱신됨

import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AppleTree } from "@/components/AppleTree";
import { calculateStage, getStageInfo, stageProgress } from "@/lib/garden";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { GardenPointLog, GardenStudent } from "@/lib/types";
import {
  addPointsAction,
  addPointsBulkAction,
  cancelPendingAction,
  harvestStudentAction,
  undoLogAction,
} from "./actions";

const QUICK_BUTTONS = [1, 2, 3, 4, 5] as const;
const LONG_PRESS_MS = 500;
const FLASH_MS = 600;

// 미수령 모니터링 임계값
const STALE_THRESHOLD_HOURS = 72; // 3일 이상 → 빨강
const WARM_THRESHOLD_HOURS = 12; // 12시간 이상 → 노랑

type PendingSeverity = "fresh" | "warm" | "stale";

function pendingAge(createdAtIso: string, now: number): { label: string; severity: PendingSeverity } {
  const created = new Date(createdAtIso).getTime();
  const diffMs = Math.max(0, now - created);
  const min = Math.floor(diffMs / 60_000);
  const hour = Math.floor(min / 60);
  const day = Math.floor(hour / 24);

  let label: string;
  if (min < 1) label = "방금";
  else if (min < 60) label = `${min}분 전`;
  else if (hour < 24) label = `${hour}시간 전`;
  else label = `${day}일 전`;

  let severity: PendingSeverity = "fresh";
  if (hour >= STALE_THRESHOLD_HOURS) severity = "stale";
  else if (hour >= WARM_THRESHOLD_HOURS) severity = "warm";

  return { label, severity };
}

type StudentMini = { name: string; class_name: string | null };

type PendingPoint = {
  id: string;
  student_id: string;
  points: number;
  reason: string | null;
  created_at: string;
};

type Props = {
  students: GardenStudent[];
  recentLogs: GardenPointLog[];
  recentPending: PendingPoint[];
  studentMap: Record<string, StudentMini>;
  initialClass: string | null;
};

type StageUp = {
  id: string;
  name: string;
  stage: number;
  stageName: string;
  isHarvest: boolean;
};

export function AdminClient({
  students: initialStudents,
  recentLogs: initialLogs,
  recentPending: initialPending,
  studentMap,
  initialClass,
}: Props) {
  const [students, setStudents] = useState(initialStudents);
  const [logs, setLogs] = useState(initialLogs);
  const [pendingPoints, setPendingPoints] = useState<PendingPoint[]>(initialPending);
  const [undoneIds, setUndoneIds] = useState<Set<string>>(new Set());
  const [classFilter, setClassFilter] = useState<string | null>(initialClass);
  const [search, setSearch] = useState("");
  const [reasonModal, setReasonModal] = useState<{
    studentId: string;
    delta: number;
  } | null>(null);
  const [bulkReasonDelta, setBulkReasonDelta] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [stageUp, setStageUp] = useState<StageUp | null>(null);
  const [harvestTarget, setHarvestTarget] = useState<GardenStudent | null>(null);
  const [pending, startTransition] = useTransition();

  // 선택 모드 (다중 +pt)
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 미수령 묵음 표시용 시계 (1분마다 갱신)
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // 묵은 pending 카운트 (3일 이상)
  const stalePendingCount = useMemo(
    () =>
      pendingPoints.filter(
        (p) => pendingAge(p.created_at, nowTick).severity === "stale",
      ).length,
    [pendingPoints, nowTick],
  );

  const prevStageRef = useRef<Record<string, number>>({});
  useEffect(() => {
    for (const s of initialStudents) prevStageRef.current[s.id] = s.current_stage;
  }, [initialStudents]);

  const classes = useMemo(() => {
    const set = new Set<string>();
    for (const s of students) if (s.class_name) set.add(s.class_name);
    return Array.from(set).sort();
  }, [students]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      if (classFilter && s.class_name !== classFilter) return false;
      if (q && !s.name.toLowerCase().includes(q) && !(s.class_name ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [students, classFilter, search]);

  // Realtime 구독
  useEffect(() => {
    const sb = createSupabaseBrowserClient();
    if (!sb) return;
    const ch = sb
      .channel("garden-admin")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "garden_students" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const old = payload.old as GardenStudent;
            setStudents((p) => p.filter((s) => s.id !== old.id));
            return;
          }
          const next = payload.new as GardenStudent;
          // 단계 상승 감지 (Admin 에서도 모달 띄우기)
          const prev = prevStageRef.current[next.id] ?? next.current_stage;
          if (next.current_stage > prev) {
            const info = getStageInfo(
              next.current_stage as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
            );
            const isHarvest = next.current_stage === 8;
            setStageUp({
              id: `${next.id}-${next.current_stage}-${Date.now()}`,
              name: next.name,
              stage: next.current_stage,
              stageName: info.name,
              isHarvest,
            });
            fireConfetti(isHarvest);
          }
          prevStageRef.current[next.id] = next.current_stage;
          setStudents((prev) => {
            const i = prev.findIndex((s) => s.id === next.id);
            if (i === -1) return [...prev, next];
            const copy = prev.slice();
            copy[i] = next;
            return copy;
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "garden_point_logs" },
        (payload) => {
          setLogs((p) => [payload.new as GardenPointLog, ...p].slice(0, 50));
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "garden_pending_points" },
        (payload) => {
          const p = payload.new as PendingPoint;
          if (!p) return;
          setPendingPoints((prev) => {
            if (prev.some((x) => x.id === p.id)) return prev;
            return [p, ...prev].slice(0, 200);
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "garden_pending_points" },
        (payload) => {
          const old = payload.old as { id?: string } | null;
          if (!old?.id) return;
          setPendingPoints((prev) => prev.filter((x) => x.id !== old.id));
        },
      )
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const submitHarvest = (student: GardenStudent) => {
    triggerHaptic("strong");
    startTransition(async () => {
      const res = await harvestStudentAction({ studentId: student.id });
      if (!res.ok) {
        showToast(res.message);
        return;
      }
      showToast(`${student.name} 사과 ${res.apples}개 수확!`);
      fireConfetti(true);
    });
  };

  const submitPoints = (studentId: string, delta: number, reason?: string) => {
    // 카드 플래시 (낙관적 - 서버 응답 기다리지 않고 시각적 피드백)
    setFlashId(studentId);
    setTimeout(() => setFlashId((cur) => (cur === studentId ? null : cur)), FLASH_MS);
    // 모바일 햅틱 피드백 (지원하는 브라우저만)
    triggerHaptic(delta > 0 ? "tap" : "warning");

    startTransition(async () => {
      const res = await addPointsAction({
        studentId,
        delta,
        reason: reason ?? null,
      });
      if (!res.ok) {
        showToast(res.message);
        return;
      }
      const name = students.find((s) => s.id === studentId)?.name ?? "";
      showToast(`${name} ${delta > 0 ? "+" : ""}${delta}pt 적립`);
    });
  };

  const submitBulk = (delta: number, reason?: string) => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    triggerHaptic(delta > 0 ? "tap" : "warning");
    startTransition(async () => {
      const res = await addPointsBulkAction({
        studentIds: ids,
        delta,
        reason: reason ?? null,
      });
      if (!res.ok) {
        showToast(res.message);
        return;
      }
      showToast(`${res.count}명 ${delta > 0 ? "+" : ""}${delta}pt 적립`);
      setSelectedIds(new Set());
      setSelectMode(false);
    });
  };

  const submitCancelPending = (pendingId: string) => {
    triggerHaptic("warning");
    // 낙관적: 즉시 로컬 제거 (Realtime DELETE 도 도착하면 멱등하게 처리됨)
    setPendingPoints((prev) => prev.filter((p) => p.id !== pendingId));
    startTransition(async () => {
      const res = await cancelPendingAction({ pendingId });
      if (!res.ok) {
        showToast(res.message);
        return;
      }
      showToast("취소되었어요");
    });
  };

  const submitUndoLog = (logId: string) => {
    if (undoneIds.has(logId)) return;
    triggerHaptic("warning");
    setUndoneIds((prev) => {
      const next = new Set(prev);
      next.add(logId);
      return next;
    });
    startTransition(async () => {
      const res = await undoLogAction({ logId });
      if (!res.ok) {
        // 실패 시 원복
        setUndoneIds((prev) => {
          const next = new Set(prev);
          next.delete(logId);
          return next;
        });
        showToast(res.message);
        return;
      }
      showToast(`되돌리기 완료 (${res.revertedPoints > 0 ? "−" : "+"}${Math.abs(res.revertedPoints)}pt)`);
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const s of visible) next.add(s.id);
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  return (
    <div className="max-w-2xl mx-auto pb-20">
      {/* sticky 헤더: 검색 + 반 필터 (스크롤 시에도 항상 보임) */}
      <div className="sticky top-0 z-20 -mx-0 px-4 pt-3 pb-2 bg-gradient-to-b from-[var(--bg-warm-start)] via-[var(--bg-warm-start)]/95 to-[var(--bg-warm-start)]/0 backdrop-blur-sm">
        {/* 한 줄: 타이틀 알약 + 검색창 + 선택 토글 */}
        <div className="flex items-center gap-2 mb-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-white border-[2.5px] border-[var(--ink)] shadow-card shrink-0">
            <span className="text-lg">🌳</span>
            <span className="text-sm font-extrabold text-[var(--ink)] hidden sm:inline">
              사과정원
            </span>
          </div>
          <div className="relative flex-1 min-w-0">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="학생 이름 / 반 검색"
              className="w-full px-4 py-2.5 rounded-full bg-white border-[2.5px] border-[var(--ink)] text-[var(--ink)] text-sm font-bold placeholder:text-[var(--ink-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-success)] shadow-card"
              type="search"
              inputMode="search"
              enterKeyHint="search"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute top-1/2 -translate-y-1/2 right-2 w-7 h-7 rounded-full bg-[var(--ink)]/10 text-[var(--ink)] font-extrabold text-sm flex items-center justify-center"
                aria-label="검색어 지우기"
              >
                ✕
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectMode((m) => {
                if (m) setSelectedIds(new Set());
                return !m;
              });
            }}
            aria-pressed={selectMode}
            className={[
              "shrink-0 px-3 py-2 rounded-full font-extrabold text-sm border-[2.5px] border-[var(--ink)] shadow-card",
              selectMode
                ? "bg-[var(--accent-success)] text-white"
                : "bg-white text-[var(--ink)]",
            ].join(" ")}
          >
            {selectMode ? "선택 종료" : "선택"}
          </button>
        </div>

        {/* 반 필터 (가로 스크롤) */}
        <div className="flex items-center gap-2 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-none">
          <FilterChip
            active={classFilter === null}
            onClick={() => setClassFilter(null)}
          >
            전체 ({students.length})
          </FilterChip>
          {classes.map((c) => (
            <FilterChip
              key={c}
              active={classFilter === c}
              onClick={() => setClassFilter(c)}
            >
              {c} ({students.filter((s) => s.class_name === c).length})
            </FilterChip>
          ))}
        </div>

        {/* 검색 결과 개수 (필터 활성 시에만) */}
        {(search || classFilter) && (
          <div className="mt-1.5 text-xs font-bold text-[var(--ink-soft)] px-1">
            {visible.length}명 표시
            {search && <span> · "{search}"</span>}
          </div>
        )}

        {/* 묵은 미수령 알림 (3일 이상이 1개 이상) */}
        {stalePendingCount > 0 && !selectMode && (
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="mt-1.5 w-full text-left px-3 py-2 rounded-xl bg-[#fef2f0] border-[1.5px] border-[var(--apple-deep)] text-xs font-extrabold text-[var(--apple-deep)] flex items-center gap-2"
          >
            <span>⚠️</span>
            <span className="flex-1 truncate">
              3일 넘게 안 받은 포인트 {stalePendingCount}개 — 시트에서 확인
            </span>
            <span aria-hidden>→</span>
          </button>
        )}

        {/* 선택 모드 안내 + 전체 선택 / 해제 */}
        {selectMode && (
          <div className="mt-1.5 flex items-center justify-between gap-2 px-1">
            <div className="text-xs font-bold text-[var(--ink)]">
              {selectedIds.size}명 선택됨
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAllVisible}
                disabled={visible.length === 0}
                className="text-xs font-extrabold text-[var(--ink)] underline disabled:opacity-40"
              >
                보이는 {visible.length}명 전체 선택
              </button>
              {selectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-xs font-extrabold text-[var(--ink-soft)] underline"
                >
                  해제
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 본문 영역 */}
      <div className="px-4 pt-2 space-y-3">

      {/* 학생 목록 */}
      <div className="space-y-2.5">
        {visible.length === 0 && (
          <div className="text-center text-[var(--ink-soft)] py-12">
            표시할 학생이 없어요.
          </div>
        )}
        {visible.map((s) => (
          <StudentRow
            key={s.id}
            student={s}
            disabled={pending}
            isFlash={flashId === s.id}
            selectMode={selectMode}
            selected={selectedIds.has(s.id)}
            onToggleSelect={() => toggleSelect(s.id)}
            onQuick={(delta) => submitPoints(s.id, delta)}
            onLongPress={(delta) => setReasonModal({ studentId: s.id, delta })}
            onHarvest={() => setHarvestTarget(s)}
          />
        ))}
      </div>

      {/* 하단 고정: 선택 모드면 일괄 적립 바, 아니면 오늘 기록 시트 토글 */}
      {selectMode && selectedIds.size > 0 ? (
        <BulkActionBar
          count={selectedIds.size}
          disabled={pending}
          onQuick={(n) => submitBulk(n)}
          onLongPress={(n) => setBulkReasonDelta(n)}
        />
      ) : (
        <button
          onClick={() => setSheetOpen(true)}
          className="fixed bottom-4 right-4 z-30 px-4 py-3 rounded-full bg-[var(--ink)] text-white border-[2.5px] border-[var(--ink)] shadow-card-pop font-bold text-sm flex items-center gap-2"
        >
          <span>오늘 기록 / 되돌리기</span>
          {pendingPoints.length > 0 && (
            <span
              className={[
                "inline-block min-w-[20px] px-1.5 py-0.5 rounded-full text-white text-[11px] font-extrabold tabular-nums",
                stalePendingCount > 0
                  ? "bg-[var(--apple-deep)]"
                  : "bg-[var(--accent-success)]",
              ].join(" ")}
            >
              {pendingPoints.length}
            </span>
          )}
        </button>
      )}

      {/* 토스트 */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full bg-[var(--ink)] text-white text-sm font-bold shadow-card-pop border-[2px] border-[var(--ink)]"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 사유 입력 모달 (단일) */}
      {reasonModal && (
        <ReasonModal
          delta={reasonModal.delta}
          title={`${reasonModal.delta > 0 ? `+${reasonModal.delta}` : reasonModal.delta}pt 적립 사유`}
          onCancel={() => setReasonModal(null)}
          onConfirm={(reason) => {
            submitPoints(reasonModal.studentId, reasonModal.delta, reason);
            setReasonModal(null);
          }}
        />
      )}

      {/* 사유 입력 모달 (일괄) */}
      {bulkReasonDelta !== null && (
        <ReasonModal
          delta={bulkReasonDelta}
          title={`${selectedIds.size}명에게 ${bulkReasonDelta > 0 ? `+${bulkReasonDelta}` : bulkReasonDelta}pt 적립 사유`}
          onCancel={() => setBulkReasonDelta(null)}
          onConfirm={(reason) => {
            const d = bulkReasonDelta;
            setBulkReasonDelta(null);
            submitBulk(d, reason);
          }}
        />
      )}

      {/* 오늘 기록 / 대기 중 시트 */}
      {sheetOpen && (
        <RecentLogsSheet
          logs={logs}
          pendingPoints={pendingPoints}
          undoneIds={undoneIds}
          studentMap={studentMap}
          disabled={pending}
          onCancelPending={submitCancelPending}
          onUndoLog={submitUndoLog}
          onClose={() => setSheetOpen(false)}
        />
      )}

      {/* 단계 상승 모달 */}
      <AnimatePresence>
        {stageUp && (
          <StageUpModal
            stageUp={stageUp}
            onClose={() => setStageUp(null)}
          />
        )}
      </AnimatePresence>

      {/* 수확 확인 모달 */}
      <AnimatePresence>
        {harvestTarget && (
          <HarvestConfirmModal
            student={harvestTarget}
            disabled={pending}
            onCancel={() => setHarvestTarget(null)}
            onConfirm={() => {
              const t = harvestTarget;
              setHarvestTarget(null);
              submitHarvest(t);
            }}
          />
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "shrink-0 px-3.5 py-2 rounded-full text-sm font-extrabold transition border-[2px] border-[var(--ink)]",
        active
          ? "bg-[var(--ink)] text-white shadow-card"
          : "bg-white text-[var(--ink)] shadow-card",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function StudentRow({
  student,
  disabled,
  isFlash,
  selectMode,
  selected,
  onToggleSelect,
  onQuick,
  onLongPress,
  onHarvest,
}: {
  student: GardenStudent;
  disabled: boolean;
  isFlash: boolean;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onQuick: (delta: number) => void;
  onLongPress: (delta: number) => void;
  onHarvest: () => void;
}) {
  const stage = calculateStage(student.total_points);
  const info = getStageInfo(stage);
  const progress = stageProgress(student.total_points);
  const isHarvest = stage === 8;

  const cardBody = (
    <>
      <div className="flex items-center gap-3">
        {selectMode && (
          <div
            aria-hidden
            className={[
              "shrink-0 w-7 h-7 rounded-full border-[2.5px] border-[var(--ink)] flex items-center justify-center text-sm font-extrabold",
              selected
                ? "bg-[var(--accent-success)] text-white"
                : "bg-white text-transparent",
            ].join(" ")}
          >
            ✓
          </div>
        )}
        <AppleTree stage={stage} size="small" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <div className="text-lg font-extrabold truncate text-[var(--ink)]">
              {student.name}
            </div>
            <div className="text-xs font-semibold text-[var(--ink-soft)] truncate">
              {student.class_name ?? ""}
            </div>
          </div>
          <div className="text-sm font-bold text-[var(--ink-soft)] flex items-center gap-2">
            <CountUpNumber value={student.total_points} />
            <span className="text-[var(--ink-soft)]">pt</span>
            <span className="text-xs">·</span>
            <span>{stage}단계 {info.name}</span>
          </div>
          {/* 작은 progress 바 */}
          {!isHarvest && (
            <div className="mt-1.5 h-2 rounded-full bg-[#e8dfcf] border border-[var(--ink)]/30 overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{
                  background: stage === 6 ? "var(--accent-purple)" : "var(--leaf-base)",
                }}
                initial={false}
                animate={{ width: `${Math.max(4, progress * 100)}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );

  if (selectMode) {
    return (
      <button
        type="button"
        onClick={onToggleSelect}
        aria-pressed={selected}
        className={[
          "w-full text-left relative rounded-[18px] p-3 border-[2.5px] transition-colors duration-300",
          selected
            ? "border-[var(--accent-success)] bg-[#dff5d0]"
            : "border-[var(--ink)] bg-white",
          "shadow-[0_2px_6px_rgba(61,40,24,0.15)]",
        ].join(" ")}
      >
        {cardBody}
      </button>
    );
  }

  return (
    <div
      className={[
        "relative rounded-[18px] p-3 border-[2.5px] border-[var(--ink)] transition-colors duration-300",
        isHarvest
          ? "bg-[var(--card-bg-hero)]"
          : "bg-white",
        isFlash ? "!bg-[#dff5d0]" : "",
        "shadow-[0_2px_6px_rgba(61,40,24,0.15)]",
      ].join(" ")}
    >
      {cardBody}

      {/* 수확 가능 학생 (8단계) 전용 버튼 */}
      {isHarvest && (
        <button
          type="button"
          disabled={disabled}
          onClick={onHarvest}
          className="mt-3 w-full min-h-[48px] py-3 rounded-[14px] border-[2.5px] border-[var(--ink)] bg-[var(--accent-gold)] text-[var(--ink)] font-extrabold text-base active:scale-[0.97] transition-transform shadow-card animate-soft-bounce"
        >
          🍎 수확하기 (사과 6개 → 바구니로)
        </button>
      )}

      {/* 1행: 일반 적립 +1 ~ +5 */}
      <div className="mt-3 grid grid-cols-5 gap-2">
        {QUICK_BUTTONS.map((n) => (
          <LongPressButton
            key={n}
            disabled={disabled}
            onClick={() => onQuick(n)}
            onLongPress={() => onLongPress(n)}
            className={[
              "min-h-[44px] py-2.5 rounded-[14px] border-[2px] border-[var(--ink)] font-extrabold text-base",
              "active:scale-[0.92] transition-transform duration-100 select-none touch-manipulation",
              quickClass(n),
            ].join(" ")}
          >
            +{n}
          </LongPressButton>
        ))}
      </div>

      {/* 2행: 단원평가 만점 (+10) / 차감 (-1) */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <LongPressButton
          disabled={disabled}
          onClick={() => onQuick(10)}
          onLongPress={() => onLongPress(10)}
          className="min-h-[44px] py-2.5 rounded-[14px] border-[2px] border-[var(--ink)] bg-[var(--accent-gold)] text-[var(--ink)] font-extrabold text-base active:scale-[0.92] transition-transform duration-100 select-none touch-manipulation"
        >
          🏆 단원평가 만점 +10
        </LongPressButton>
        <button
          disabled={disabled}
          onClick={() => onQuick(-1)}
          className="min-h-[44px] py-2.5 rounded-[14px] border-[2px] border-[var(--ink)] bg-[#ffe4dc] text-[var(--apple-deep)] font-extrabold text-base active:scale-[0.92] transition-transform duration-100 select-none touch-manipulation"
        >
          −1
        </button>
      </div>
    </div>
  );
}

function BulkActionBar({
  count,
  disabled,
  onQuick,
  onLongPress,
}: {
  count: number;
  disabled: boolean;
  onQuick: (delta: number) => void;
  onLongPress: (delta: number) => void;
}) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 px-3 pb-3 pt-2 bg-gradient-to-t from-[var(--bg-warm-start)] via-[var(--bg-warm-start)]/95 to-[var(--bg-warm-start)]/0">
      <div className="max-w-2xl mx-auto bg-white rounded-[20px] border-[2.5px] border-[var(--ink)] shadow-card-pop p-3">
        <div className="text-xs font-extrabold text-[var(--ink)] mb-2 px-1">
          {count}명에게 일괄 적립 (길게 누르면 사유 입력)
        </div>
        <div className="grid grid-cols-5 gap-2">
          {QUICK_BUTTONS.map((n) => (
            <LongPressButton
              key={n}
              disabled={disabled}
              onClick={() => onQuick(n)}
              onLongPress={() => onLongPress(n)}
              className={[
                "min-h-[44px] py-2.5 rounded-[14px] border-[2px] border-[var(--ink)] font-extrabold text-base",
                "active:scale-[0.92] transition-transform duration-100 select-none touch-manipulation",
                quickClass(n),
              ].join(" ")}
            >
              +{n}
            </LongPressButton>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <LongPressButton
            disabled={disabled}
            onClick={() => onQuick(10)}
            onLongPress={() => onLongPress(10)}
            className="min-h-[44px] py-2.5 rounded-[14px] border-[2px] border-[var(--ink)] bg-[var(--accent-gold)] text-[var(--ink)] font-extrabold text-base active:scale-[0.92] transition-transform duration-100 select-none touch-manipulation"
          >
            🏆 +10
          </LongPressButton>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onQuick(-1)}
            className="min-h-[44px] py-2.5 rounded-[14px] border-[2px] border-[var(--ink)] bg-[#ffe4dc] text-[var(--apple-deep)] font-extrabold text-base active:scale-[0.92] transition-transform duration-100 select-none touch-manipulation"
          >
            −1
          </button>
        </div>
      </div>
    </div>
  );
}

function quickClass(n: number): string {
  // 단계별 컬러 (밝게 → 진하게)
  switch (n) {
    case 1:
      return "bg-[#e8f5d8] text-[var(--ink)]";
    case 2:
      return "bg-[#d4ebc0] text-[var(--ink)]";
    case 3:
      return "bg-[#c8e598] text-[var(--ink)]";
    case 4:
      return "bg-[#a8d870] text-[var(--ink)]";
    case 5:
      return "bg-[var(--accent-success)] text-white";
    default:
      return "bg-[#e8f5d8] text-[var(--ink)]";
  }
}

function CountUpNumber({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const start = prevRef.current;
    const end = value;
    if (start === end) return;
    const startTime = performance.now();
    const duration = 400;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - startTime) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      const current = Math.round(start + (end - start) * eased);
      setShown(current);
      if (k < 1) raf = requestAnimationFrame(tick);
      else prevRef.current = end;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <span className="text-base font-extrabold tabular-nums text-[var(--ink)]">
      {shown}
    </span>
  );
}

function LongPressButton({
  onClick,
  onLongPress,
  disabled,
  className,
  children,
}: {
  onClick: () => void;
  onLongPress: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const timer = useRef<number | null>(null);
  const longPressed = useRef(false);

  const start = () => {
    longPressed.current = false;
    timer.current = window.setTimeout(() => {
      longPressed.current = true;
      onLongPress();
    }, LONG_PRESS_MS);
  };
  const end = (fire: boolean) => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (fire && !longPressed.current) onClick();
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={start}
      onMouseUp={() => end(true)}
      onMouseLeave={() => end(false)}
      onTouchStart={start}
      onTouchEnd={(e) => {
        e.preventDefault();
        end(true);
      }}
      className={className}
    >
      {children}
    </button>
  );
}

// 더몬스터학원 사과정원 적립 사유 프리셋 (양희쌤 기준)
// - 실제 적립 포인트는 +1/+2/+3/+5 버튼 또는 사유 입력 후 직접 선택
const REASON_PRESETS = [
  "출석",
  "숙제",
  "일일테스트",
  "단원평가 만점",
  "주간 테스트",
  "월말 테스트",
];

function ReasonModal({
  delta,
  title,
  onCancel,
  onConfirm,
}: {
  delta: number;
  title?: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [text, setText] = useState("");
  return (
    <div className="fixed inset-0 z-50 bg-[var(--ink)]/40 flex items-end sm:items-center justify-center p-4 backdrop-blur-[1px]">
      <div className="w-full max-w-sm bg-white rounded-[24px] border-[2.5px] border-[var(--ink)] shadow-card-pop p-5">
        <div className="text-lg font-extrabold mb-1 text-[var(--ink)]">
          {title ?? `${delta > 0 ? `+${delta}` : delta}pt 적립 사유`}
        </div>
        <p className="text-sm text-[var(--ink-soft)] mb-3">
          자주 쓰는 사유를 누르거나 직접 입력해주세요.
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          {REASON_PRESETS.map((r) => (
            <button
              key={r}
              onClick={() => setText(r)}
              className="px-3 py-1.5 rounded-full bg-[#fff5d6] border-[1.5px] border-[var(--ink)]/50 text-[var(--ink)] text-sm font-bold"
            >
              {r}
            </button>
          ))}
        </div>
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="예: 단어시험 만점"
          className="w-full px-3 py-2.5 rounded-xl border-[2px] border-[var(--ink)]/40 focus:outline-none focus:border-[var(--accent-success)] font-medium"
        />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={onCancel}
            className="py-3 rounded-xl bg-white border-[2px] border-[var(--ink)] text-[var(--ink)] font-extrabold"
          >
            취소
          </button>
          <button
            onClick={() => onConfirm(text)}
            className="py-3 rounded-xl bg-[var(--accent-success)] border-[2px] border-[var(--ink)] text-white font-extrabold"
          >
            적립
          </button>
        </div>
      </div>
    </div>
  );
}

function RecentLogsSheet({
  logs,
  pendingPoints,
  undoneIds,
  studentMap,
  disabled,
  onCancelPending,
  onUndoLog,
  onClose,
}: {
  logs: GardenPointLog[];
  pendingPoints: PendingPoint[];
  undoneIds: Set<string>;
  studentMap: Record<string, StudentMini>;
  disabled: boolean;
  onCancelPending: (pendingId: string) => void;
  onUndoLog: (logId: string) => void;
  onClose: () => void;
}) {
  // 시트 자체에서 1분마다 시계 갱신 (묵음 표시 실시간)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const todayStart = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t.getTime();
  }, []);
  const todayLogs = logs.filter(
    (l) => new Date(l.logged_at).getTime() >= todayStart,
  );

  // pending 정렬: 묵은 순 (오래된 것 위로) — 묵음 알림이 잘 보이게
  const sortedPending = useMemo(
    () =>
      [...pendingPoints].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      ),
    [pendingPoints],
  );

  const staleCount = sortedPending.filter(
    (p) => pendingAge(p.created_at, now).severity === "stale",
  ).length;
  const warmCount = sortedPending.filter(
    (p) => pendingAge(p.created_at, now).severity === "warm",
  ).length;

  return (
    <div
      className="fixed inset-0 z-50 bg-[var(--ink)]/40 flex items-end justify-center backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-t-[24px] border-t-[2.5px] border-[var(--ink)] p-5 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-extrabold text-[var(--ink)]">
            오늘 기록 / 되돌리기
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--ink-soft)] text-sm font-bold"
          >
            닫기
          </button>
        </div>

        {/* 대기 중 (아직 학생이 받기 안 누름) */}
        <section className="mb-4">
          <div className="text-sm font-extrabold text-[var(--ink)] mb-2 flex items-center gap-2 flex-wrap">
            <span>🎁 대기 중</span>
            <span className="text-xs font-bold text-[var(--ink-soft)]">
              ({sortedPending.length})
            </span>
            {staleCount > 0 && (
              <span className="text-xs font-extrabold text-[var(--apple-deep)] bg-[#fef2f0] border border-[var(--apple-deep)] rounded-full px-2 py-0.5">
                ⚠️ 3일+ {staleCount}개
              </span>
            )}
            {warmCount > 0 && (
              <span className="text-xs font-extrabold text-[var(--accent-warning)] bg-[var(--accent-warning-bg)] border border-[var(--accent-warning)] rounded-full px-2 py-0.5">
                12h+ {warmCount}개
              </span>
            )}
          </div>
          {sortedPending.length === 0 ? (
            <p className="text-center text-[var(--ink-soft)] py-4 text-sm">
              대기 중인 포인트가 없어요.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--ink)]/10">
              {sortedPending.map((p) => {
                const m = studentMap[p.student_id];
                const age = pendingAge(p.created_at, now);
                const ageColor =
                  age.severity === "stale"
                    ? "text-[var(--apple-deep)]"
                    : age.severity === "warm"
                      ? "text-[var(--accent-warning)]"
                      : "text-[var(--ink-soft)]";
                const rowBg =
                  age.severity === "stale"
                    ? "bg-[#fef2f0]"
                    : age.severity === "warm"
                      ? "bg-[var(--accent-warning-bg)]"
                      : "";
                return (
                  <li
                    key={p.id}
                    className={`py-2 px-2 -mx-2 rounded-lg flex items-center gap-3 ${rowBg}`}
                  >
                    <div
                      className={`text-xs font-extrabold tabular-nums w-16 text-right ${ageColor}`}
                    >
                      {age.label}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-extrabold truncate text-[var(--ink)]">
                        {m?.name ?? "(삭제된 학생)"}
                      </div>
                      <div className="text-xs text-[var(--ink-soft)] truncate">
                        {p.reason ?? "—"}
                      </div>
                    </div>
                    <div
                      className={[
                        "font-extrabold tabular-nums",
                        p.points >= 0
                          ? "text-[var(--accent-success)]"
                          : "text-[var(--apple-deep)]",
                      ].join(" ")}
                    >
                      {p.points > 0 ? "+" : ""}
                      {p.points}pt
                    </div>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onCancelPending(p.id)}
                      className="shrink-0 px-2.5 py-1.5 rounded-full bg-white border-[1.5px] border-[var(--ink)] text-[var(--ink)] text-xs font-extrabold disabled:opacity-50"
                    >
                      취소
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* 오늘 적용된 로그 */}
        <section>
          <div className="text-sm font-extrabold text-[var(--ink)] mb-2 flex items-center gap-2">
            <span>📋 오늘 적용됨</span>
            <span className="text-xs font-bold text-[var(--ink-soft)]">
              ({todayLogs.length})
            </span>
          </div>
          {todayLogs.length === 0 ? (
            <p className="text-center text-[var(--ink-soft)] py-4 text-sm">
              아직 오늘 적용된 기록이 없어요.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--ink)]/10">
              {todayLogs.map((l) => {
                const m = studentMap[l.student_id];
                const t = new Date(l.logged_at);
                const hh = t.getHours().toString().padStart(2, "0");
                const mm = t.getMinutes().toString().padStart(2, "0");
                const isUndone = undoneIds.has(l.id);
                const isCompensation = (l.reason ?? "").startsWith("되돌리기:");
                return (
                  <li key={l.id} className="py-2 flex items-center gap-3">
                    <div className="text-xs font-bold text-[var(--ink-soft)] tabular-nums w-12">
                      {hh}:{mm}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-extrabold truncate text-[var(--ink)]">
                        {m?.name ?? "(삭제된 학생)"}
                      </div>
                      <div className="text-xs text-[var(--ink-soft)] truncate">
                        {l.reason ?? "—"}
                      </div>
                    </div>
                    <div
                      className={[
                        "font-extrabold tabular-nums",
                        l.points >= 0
                          ? "text-[var(--accent-success)]"
                          : "text-[var(--apple-deep)]",
                      ].join(" ")}
                    >
                      {l.points > 0 ? "+" : ""}
                      {l.points}pt
                    </div>
                    {/* 보상 로그 자체는 되돌리기 버튼 숨김 (무한 루프 방지) */}
                    {!isCompensation && (
                      <button
                        type="button"
                        disabled={disabled || isUndone}
                        onClick={() => onUndoLog(l.id)}
                        className={[
                          "shrink-0 px-2.5 py-1.5 rounded-full text-xs font-extrabold border-[1.5px] border-[var(--ink)]",
                          isUndone
                            ? "bg-[var(--ink)]/10 text-[var(--ink-soft)]"
                            : "bg-white text-[var(--ink)]",
                          "disabled:opacity-50",
                        ].join(" ")}
                      >
                        {isUndone ? "되돌림" : "되돌리기"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function StageUpModal({
  stageUp,
  onClose,
}: {
  stageUp: StageUp;
  onClose: () => void;
}) {
  // 자동 닫기
  useEffect(() => {
    const timeoutId = setTimeout(
      onClose,
      stageUp.isHarvest ? 8_000 : 4_000,
    );
    return () => clearTimeout(timeoutId);
  }, [stageUp, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-[var(--ink)]/40 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.6, y: 50, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={{ type: "spring", stiffness: 240, damping: 18 }}
        className={[
          "relative rounded-[28px] border-[3px] border-[var(--ink)] px-8 py-7 text-center shadow-card-pop",
          stageUp.isHarvest
            ? "bg-gradient-to-br from-[#fff5d6] via-[var(--accent-gold)] to-[#f0a020]"
            : "bg-gradient-to-br from-white via-[#fff5d6] to-[var(--accent-gold)]",
        ].join(" ")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-6xl mb-1 animate-soft-bounce">
          {stageUp.isHarvest ? "🎉" : "🌳"}
        </div>
        <div className="text-lg font-extrabold text-[var(--ink)]">
          축하합니다!
        </div>
        <div className="mt-1 text-3xl font-black text-[var(--ink)] tracking-tight">
          {stageUp.name}
        </div>
        <div className="mt-2 text-xl font-extrabold text-[var(--ink)]">
          {stageUp.isHarvest ? (
            <>
              사과를{" "}
              <span className="underline decoration-wavy decoration-[var(--apple-base)]">
                수확
              </span>
              !
            </>
          ) : (
            <>
              <span className="underline decoration-wavy decoration-[var(--apple-base)]">
                {stageUp.stageName}
              </span>{" "}
              단계로 성장!
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function HarvestConfirmModal({
  student,
  disabled,
  onCancel,
  onConfirm,
}: {
  student: GardenStudent;
  disabled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[55] flex items-center justify-center p-6 bg-[var(--ink)]/40 backdrop-blur-[2px]"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.7, y: 30, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={{ type: "spring", stiffness: 250, damping: 20 }}
        className="relative w-full max-w-sm rounded-[24px] border-[3px] border-[var(--ink)] bg-white px-6 py-6 text-center shadow-card-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-5xl mb-2">🍎</div>
        <div className="text-xl font-extrabold text-[var(--ink)]">수확하시겠어요?</div>
        <div className="mt-3 text-base font-bold text-[var(--ink)]">
          {student.name}
        </div>
        <p className="mt-2 text-sm text-[var(--ink-soft)] leading-relaxed">
          사과 <b className="text-[var(--apple-deep)]">6개</b>가 바구니로
          모이고,
          <br />
          나무는 <b>큰나무 (5단계)</b>로 돌아가
          <br />
          다시 꽃 → 열매 → 수확 사이클을 시작해요.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            disabled={disabled}
            onClick={onCancel}
            className="py-3 rounded-xl bg-white border-[2px] border-[var(--ink)] text-[var(--ink)] font-extrabold disabled:opacity-50"
          >
            취소
          </button>
          <button
            disabled={disabled}
            onClick={onConfirm}
            className="py-3 rounded-xl bg-[var(--accent-gold)] border-[2px] border-[var(--ink)] text-[var(--ink)] font-extrabold disabled:opacity-50"
          >
            🍎 수확하기
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// 모바일 햅틱(진동) 피드백 - navigator.vibrate 가 있는 환경(Android Chrome 등)에서만 동작
// iOS Safari 는 미지원 → noop
function triggerHaptic(kind: "tap" | "warning" | "strong") {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & {
    vibrate?: (pattern: number | number[]) => boolean;
  };
  if (!nav.vibrate) return;
  try {
    if (kind === "tap") nav.vibrate(8);
    else if (kind === "warning") nav.vibrate([10, 40, 10]);
    else if (kind === "strong") nav.vibrate([25, 30, 25, 30, 50]);
  } catch {
    // 일부 환경에서 권한 없을 수 있음
  }
}

function fireConfetti(harvest: boolean) {
  const colors = ["#f0c050", "#f04848", "#5e9c38", "#c87fdb", "#ffb8d4"];
  if (harvest) {
    const end = Date.now() + 2_500;
    const tick = () => {
      confetti({
        particleCount: 4,
        angle: 60,
        spread: 65,
        origin: { x: 0, y: 0.7 },
        colors,
      });
      confetti({
        particleCount: 4,
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
      particleCount: 60,
      spread: 65,
      origin: { y: 0.5 },
      colors,
    });
  }
}
