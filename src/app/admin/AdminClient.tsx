"use client";

// Admin 메인 화면 (PC + 모바일)
// - 상단 필터 바: 반(class) pill + 이름 검색
// - 학생 그리드(컴팩트 카드): 한 화면에 30명+ 표시
// - 카드 탭 → 하단 포인트 패널: 초등/중고등 자동 분기
//   • 초등: [출석 +1] [숙제 +1] [단원테스트 +10] / 일일테스트 1~4 / 월말테스트 1~10
//   • 중고등: [출석 +1] [숙제 +1] / 주간테스트 1~10 / 월말테스트 1~10
// - 모든 적립은 garden_pending_points 로 들어가 학생 화면에서 받기 누르면 확정 (기존과 동일)
// - 사유(reason) 자동 기록: "출석", "숙제", "단원테스트", "일일테스트 N점", "주간테스트 N점", "월말테스트 N점", "취소 -1"
// - 단계 상승, 수확, Realtime, 되돌리기 시트는 기존 로직 유지

import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { calculateStage, getStageInfo, stageProgress } from "@/lib/garden";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { GardenPointLog, GardenStudent } from "@/lib/types";
import {
  addPointsAction,
  cancelPendingAction,
  harvestStudentAction,
  undoLogAction,
} from "./actions";

const STALE_THRESHOLD_HOURS = 72;
const WARM_THRESHOLD_HOURS = 12;

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

type ClassLevel = "elementary" | "middlehigh";

function detectClassLevel(className: string | null | undefined): ClassLevel {
  if (!className) return "elementary";
  if (className.includes("초")) return "elementary";
  if (className.includes("중") || className.includes("고")) return "middlehigh";
  return "elementary";
}

function stageEmoji(stage: number): string {
  switch (stage) {
    case 1: return "🪴";
    case 2: return "🌱";
    case 3: return "🌿";
    case 4: return "🌳";
    case 5: return "🌲";
    case 6: return "🌸";
    case 7: return "🍎";
    case 8: return "🎉";
    default: return "🪴";
  }
}

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [stageUp, setStageUp] = useState<StageUp | null>(null);
  const [harvestTarget, setHarvestTarget] = useState<GardenStudent | null>(null);
  const [pending, startTransition] = useTransition();

  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

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
      if (q && !s.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [students, classFilter, search]);

  const selectedStudent = useMemo(
    () => (selectedId ? students.find((s) => s.id === selectedId) ?? null : null),
    [students, selectedId],
  );

  // 필터/검색으로 선택된 학생이 화면에서 사라지면 선택 해제
  useEffect(() => {
    if (!selectedId) return;
    if (!visible.some((s) => s.id === selectedId)) {
      setSelectedId(null);
    }
  }, [visible, selectedId]);

  const panelLevel: ClassLevel = useMemo(() => {
    if (selectedStudent) return detectClassLevel(selectedStudent.class_name);
    if (classFilter) return detectClassLevel(classFilter);
    return "elementary";
  }, [selectedStudent, classFilter]);

  // Realtime
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
          const prev = prevStageRef.current[next.id] ?? next.current_stage;
          if (next.current_stage > prev) {
            const info = getStageInfo(next.current_stage as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8);
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

  const submitPoints = (studentId: string, delta: number, reason: string) => {
    setFlashId(studentId);
    setTimeout(() => setFlashId((cur) => (cur === studentId ? null : cur)), 600);
    triggerHaptic(delta > 0 ? "tap" : "warning");

    startTransition(async () => {
      const res = await addPointsAction({ studentId, delta, reason });
      if (!res.ok) {
        showToast(res.message);
        return;
      }
      const name = students.find((s) => s.id === studentId)?.name ?? "";
      showToast(`${name} ${delta > 0 ? "+" : ""}${delta}pt · ${reason}`);
    });
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

  const submitCancelPending = (pendingId: string) => {
    triggerHaptic("warning");
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
        setUndoneIds((prev) => {
          const next = new Set(prev);
          next.delete(logId);
          return next;
        });
        showToast(res.message);
        return;
      }
      showToast(
        `되돌리기 완료 (${res.revertedPoints > 0 ? "−" : "+"}${Math.abs(res.revertedPoints)}pt)`,
      );
    });
  };

  return (
    <div className="max-w-5xl mx-auto px-4 pt-3 pb-44">
      {/* 상단 필터 바 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ClassPill active={classFilter === null} onClick={() => setClassFilter(null)}>
          전체 <span className="text-gray-400">({students.length})</span>
        </ClassPill>
        {classes.map((c) => (
          <ClassPill
            key={c}
            active={classFilter === c}
            onClick={() => setClassFilter(c)}
          >
            {c}{" "}
            <span className="text-gray-400">
              ({students.filter((s) => s.class_name === c).length})
            </span>
          </ClassPill>
        ))}
        <div className="ml-auto relative">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름 검색..."
            type="search"
            className="w-44 sm:w-56 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-transparent transition"
          />
        </div>
      </div>

      {(search || classFilter) && (
        <div className="mb-2 text-xs text-gray-400">
          {visible.length}명 표시
          {search && <span> · &quot;{search}&quot;</span>}
        </div>
      )}

      {stalePendingCount > 0 && (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="mb-3 w-full text-left px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 hover:bg-red-100 transition flex items-center gap-2"
        >
          <span className="font-medium">3일 넘게 안 받은 포인트 {stalePendingCount}개</span>
          <span className="text-red-400">— 기록 시트에서 확인</span>
          <span className="ml-auto text-red-400">→</span>
        </button>
      )}

      {/* 학생 그리드 */}
      {visible.length === 0 ? (
        <div className="text-center text-gray-400 py-16 bg-white rounded-xl border border-gray-100">
          표시할 학생이 없어요.
        </div>
      ) : (
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))" }}
        >
          {visible.map((s) => (
            <StudentCard
              key={s.id}
              student={s}
              selected={selectedId === s.id}
              flash={flashId === s.id}
              onClick={() => setSelectedId((cur) => (cur === s.id ? null : s.id))}
            />
          ))}
        </div>
      )}

      {/* 하단 우측 플로팅: 오늘 기록 / 되돌리기 */}
      <button
        onClick={() => setSheetOpen(true)}
        className="fixed bottom-4 right-4 z-30 px-4 py-2.5 rounded-full bg-white border border-gray-200 shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 transition flex items-center gap-2"
      >
        오늘 기록
        {pendingPoints.length > 0 && (
          <span
            className={[
              "inline-block min-w-[20px] px-1.5 py-0.5 rounded-full text-white text-[11px] font-semibold tabular-nums",
              stalePendingCount > 0 ? "bg-red-500" : "bg-emerald-500",
            ].join(" ")}
          >
            {pendingPoints.length}
          </span>
        )}
      </button>

      {/* 하단 포인트 패널 */}
      <AnimatePresence>
        {selectedStudent && (
          <PointPanel
            key={selectedStudent.id}
            student={selectedStudent}
            level={panelLevel}
            disabled={pending}
            onClose={() => setSelectedId(null)}
            onApply={(delta, reason) => submitPoints(selectedStudent.id, delta, reason)}
            onHarvest={() => setHarvestTarget(selectedStudent)}
          />
        )}
      </AnimatePresence>

      {/* 토스트 */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium shadow-lg"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 오늘 기록 시트 */}
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

      {/* 단계 상승 */}
      <AnimatePresence>
        {stageUp && <StageUpModal stageUp={stageUp} onClose={() => setStageUp(null)} />}
      </AnimatePresence>

      {/* 수확 확인 */}
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
  );
}

/* ============== 상단 필터 pill ============== */

function ClassPill({
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
      type="button"
      onClick={onClick}
      className={[
        "px-3 py-1.5 rounded-full text-sm font-medium border transition",
        active
          ? "bg-amber-100 text-amber-900 border-amber-200"
          : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/* ============== 학생 카드 (컴팩트 그리드) ============== */

function StudentCard({
  student,
  selected,
  flash,
  onClick,
}: {
  student: GardenStudent;
  selected: boolean;
  flash: boolean;
  onClick: () => void;
}) {
  const stage = calculateStage(student.total_points);
  const progress = stageProgress(student.total_points);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={[
        "bg-white rounded-xl p-2 text-center cursor-pointer transition border",
        selected
          ? "ring-2 ring-amber-400 bg-amber-50 border-amber-200"
          : "border-gray-100 hover:border-gray-200 hover:shadow-sm",
        flash ? "!bg-emerald-50 !border-emerald-200" : "",
      ].join(" ")}
    >
      <div className="text-2xl leading-none mb-1" aria-hidden>
        {stageEmoji(stage)}
      </div>
      <div className="text-xs font-medium text-gray-900 truncate">{student.name}</div>
      <div className="text-[9px] text-gray-400 tabular-nums truncate">
        {student.total_points}pt · {stage}단계
      </div>
      <div className="mt-1 h-[3px] rounded-full bg-gray-100 overflow-hidden">
        <div
          className={selected ? "h-full bg-amber-400" : "h-full bg-emerald-400"}
          style={{ width: `${Math.max(2, progress * 100)}%` }}
        />
      </div>
      {student.mood_text && student.mood_text.trim().length > 0 && (
        <div
          className="mt-1.5 text-[9px] text-pink-700 bg-pink-50 border border-pink-100 rounded px-1 py-0.5 truncate"
          title={student.mood_text}
        >
          💬 {student.mood_text}
        </div>
      )}
    </button>
  );
}

/* ============== 하단 포인트 패널 ============== */

function PointPanel({
  student,
  level,
  disabled,
  onClose,
  onApply,
  onHarvest,
}: {
  student: GardenStudent;
  level: ClassLevel;
  disabled: boolean;
  onClose: () => void;
  onApply: (delta: number, reason: string) => void;
  onHarvest: () => void;
}) {
  const stage = calculateStage(student.total_points);
  const info = getStageInfo(stage);
  const isHarvest = stage === 8;

  // 점수 선택 상태 (학생 바뀌면 자동 리셋 - key prop 으로 컴포넌트 재마운트)
  const [dailySel, setDailySel] = useState<number | null>(null);
  const [weeklySel, setWeeklySel] = useState<number | null>(null);
  const [monthlySel, setMonthlySel] = useState<number | null>(null);

  const fixedBtn =
    "min-h-[36px] px-3 rounded-lg text-sm font-medium border transition disabled:opacity-50 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100";
  const goldBtn =
    "min-h-[36px] px-3 rounded-lg text-sm font-medium border transition disabled:opacity-50 bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100";
  const dangerBtn =
    "min-h-[36px] px-3 rounded-lg text-sm font-medium border transition disabled:opacity-50 text-red-400 border-red-200 hover:bg-red-50";

  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
      className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-100 shadow-[0_-2px_12px_rgba(0,0,0,0.05)]"
    >
      <div className="max-w-5xl mx-auto px-4 py-3">
        {/* 상단 정보 행 */}
        <div className="flex items-center gap-3 mb-3">
          <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="font-medium text-gray-900 truncate">{student.name}</span>
              <span className="text-xs text-gray-400 truncate">
                {student.class_name ?? "—"} · {student.total_points}pt · {stage}단계 {info.name}
              </span>
            </div>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onApply(-1, "취소 -1")}
            className={dangerBtn}
          >
            -1 취소
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-sm px-2 py-1.5 rounded-lg hover:bg-gray-50 transition"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {/* 수확 가능 (8단계) */}
        {isHarvest && (
          <button
            type="button"
            disabled={disabled}
            onClick={onHarvest}
            className="mb-3 w-full min-h-[40px] rounded-lg bg-amber-100 text-amber-900 border border-amber-300 text-sm font-medium hover:bg-amber-200 transition disabled:opacity-50"
          >
            🍎 수확하기 — 사과 6개 → 바구니
          </button>
        )}

        {/* 고정 포인트 */}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-xs text-gray-400 w-20 shrink-0">고정 포인트</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onApply(1, "출석")}
            className={fixedBtn}
          >
            출석 +1
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onApply(1, "숙제")}
            className={fixedBtn}
          >
            숙제 +1
          </button>
          {level === "elementary" && (
            <>
              <span className="text-gray-300">|</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onApply(10, "단원테스트")}
                className={goldBtn}
              >
                단원테스트 +10
              </button>
            </>
          )}
        </div>

        {/* 일일/주간 테스트 */}
        {level === "elementary" ? (
          <ScoreRow
            label="일일테스트"
            range={4}
            selected={dailySel}
            onSelect={setDailySel}
            disabled={disabled}
            onApply={() => {
              if (dailySel == null) return;
              onApply(dailySel, `일일테스트 ${dailySel}점`);
              setDailySel(null);
            }}
          />
        ) : (
          <ScoreRow
            label="주간테스트"
            range={10}
            selected={weeklySel}
            onSelect={setWeeklySel}
            disabled={disabled}
            onApply={() => {
              if (weeklySel == null) return;
              onApply(weeklySel, `주간테스트 ${weeklySel}점`);
              setWeeklySel(null);
            }}
          />
        )}

        {/* 월말테스트 (공통) */}
        <ScoreRow
          label="월말테스트"
          range={10}
          selected={monthlySel}
          onSelect={setMonthlySel}
          disabled={disabled}
          onApply={() => {
            if (monthlySel == null) return;
            onApply(monthlySel, `월말테스트 ${monthlySel}점`);
            setMonthlySel(null);
          }}
        />
      </div>
    </motion.div>
  );
}

function ScoreRow({
  label,
  range,
  selected,
  onSelect,
  onApply,
  disabled,
}: {
  label: string;
  range: number;
  selected: number | null;
  onSelect: (n: number) => void;
  onApply: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      <span className="text-xs text-gray-400 w-20 shrink-0">{label}</span>
      {Array.from({ length: range }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(n)}
          className={[
            "min-h-[36px] min-w-[36px] px-2 rounded-lg text-sm font-medium border transition disabled:opacity-50",
            selected === n
              ? "bg-emerald-600 text-white border-emerald-600"
              : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50",
          ].join(" ")}
        >
          {n}
        </button>
      ))}
      <button
        type="button"
        disabled={disabled || selected == null}
        onClick={onApply}
        className="ml-1 min-h-[36px] px-3 rounded-lg text-sm font-medium border border-gray-900 bg-gray-900 text-white hover:bg-gray-800 transition disabled:opacity-30 disabled:bg-gray-200 disabled:text-gray-400 disabled:border-gray-200"
      >
        적용
      </button>
    </div>
  );
}

/* ============== 오늘 기록 / 되돌리기 시트 ============== */

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
  const todayLogs = logs.filter((l) => new Date(l.logged_at).getTime() >= todayStart);

  const sortedPending = useMemo(
    () =>
      [...pendingPoints].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
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
      className="fixed inset-0 z-50 bg-gray-900/30 flex items-end justify-center backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-t-2xl border-t border-gray-100 p-5 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">오늘 기록 / 되돌리기</h2>
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg px-3 py-1.5 transition"
          >
            닫기
          </button>
        </div>

        <section className="mb-5">
          <div className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2 flex-wrap">
            <span>대기 중</span>
            <span className="text-xs text-gray-400">({sortedPending.length})</span>
            {staleCount > 0 && (
              <span className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                3일+ {staleCount}개
              </span>
            )}
            {warmCount > 0 && (
              <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                12h+ {warmCount}개
              </span>
            )}
          </div>
          {sortedPending.length === 0 ? (
            <p className="text-center text-gray-400 py-4 text-sm">대기 중인 포인트가 없어요.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {sortedPending.map((p) => {
                const m = studentMap[p.student_id];
                const age = pendingAge(p.created_at, now);
                const ageColor =
                  age.severity === "stale"
                    ? "text-red-500"
                    : age.severity === "warm"
                      ? "text-amber-600"
                      : "text-gray-400";
                const rowBg =
                  age.severity === "stale"
                    ? "bg-red-50"
                    : age.severity === "warm"
                      ? "bg-amber-50"
                      : "";
                return (
                  <li
                    key={p.id}
                    className={`py-2 px-2 -mx-2 rounded-lg flex items-center gap-3 ${rowBg}`}
                  >
                    <div className={`text-xs font-medium tabular-nums w-14 text-right ${ageColor}`}>
                      {age.label}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate text-sm">
                        {m?.name ?? "(삭제된 학생)"}
                      </div>
                      <div className="text-xs text-gray-400 truncate">{p.reason ?? "—"}</div>
                    </div>
                    <div
                      className={[
                        "font-medium tabular-nums text-sm",
                        p.points >= 0 ? "text-emerald-600" : "text-red-500",
                      ].join(" ")}
                    >
                      {p.points > 0 ? "+" : ""}
                      {p.points}pt
                    </div>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onCancelPending(p.id)}
                      className="shrink-0 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg px-2.5 py-1 hover:bg-gray-50 transition disabled:opacity-50"
                    >
                      취소
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <div className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            <span>오늘 적용됨</span>
            <span className="text-xs text-gray-400">({todayLogs.length})</span>
          </div>
          {todayLogs.length === 0 ? (
            <p className="text-center text-gray-400 py-4 text-sm">
              아직 오늘 적용된 기록이 없어요.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {todayLogs.map((l) => {
                const m = studentMap[l.student_id];
                const t = new Date(l.logged_at);
                const hh = t.getHours().toString().padStart(2, "0");
                const mm = t.getMinutes().toString().padStart(2, "0");
                const isUndone = undoneIds.has(l.id);
                const isCompensation = (l.reason ?? "").startsWith("되돌리기:");
                return (
                  <li key={l.id} className="py-2 flex items-center gap-3">
                    <div className="text-xs font-medium text-gray-400 tabular-nums w-12">
                      {hh}:{mm}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate text-sm">
                        {m?.name ?? "(삭제된 학생)"}
                      </div>
                      <div className="text-xs text-gray-400 truncate">{l.reason ?? "—"}</div>
                    </div>
                    <div
                      className={[
                        "font-medium tabular-nums text-sm",
                        l.points >= 0 ? "text-emerald-600" : "text-red-500",
                      ].join(" ")}
                    >
                      {l.points > 0 ? "+" : ""}
                      {l.points}pt
                    </div>
                    {!isCompensation && (
                      <button
                        type="button"
                        disabled={disabled || isUndone}
                        onClick={() => onUndoLog(l.id)}
                        className={[
                          "shrink-0 text-xs font-medium border rounded-lg px-2.5 py-1 transition disabled:opacity-50",
                          isUndone
                            ? "text-gray-400 border-gray-100 bg-gray-50"
                            : "text-gray-500 border-gray-200 hover:bg-gray-50",
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

/* ============== 단계 상승 / 수확 모달 ============== */

function StageUpModal({ stageUp, onClose }: { stageUp: StageUp; onClose: () => void }) {
  useEffect(() => {
    const id = setTimeout(onClose, stageUp.isHarvest ? 8_000 : 4_000);
    return () => clearTimeout(id);
  }, [stageUp, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-gray-900/40 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.7, y: 30, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={{ type: "spring", stiffness: 250, damping: 20 }}
        className="relative w-full max-w-sm rounded-2xl border border-gray-100 bg-white px-6 py-6 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-5xl mb-2">{stageUp.isHarvest ? "🎉" : stageEmoji(stageUp.stage)}</div>
        <div className="text-sm font-medium text-gray-500">축하합니다</div>
        <div className="mt-1 text-2xl font-semibold text-gray-900">{stageUp.name}</div>
        <div className="mt-2 text-base font-medium text-gray-700">
          {stageUp.isHarvest ? <>사과를 수확할 수 있어요</> : <>{stageUp.stageName} 단계로 성장</>}
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
      className="fixed inset-0 z-[55] flex items-center justify-center p-6 bg-gray-900/40 backdrop-blur-[2px]"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.85, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", stiffness: 280, damping: 22 }}
        className="relative w-full max-w-sm rounded-2xl border border-gray-100 bg-white px-6 py-6 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-4xl mb-2">🍎</div>
        <div className="text-lg font-semibold text-gray-900">수확하시겠어요?</div>
        <div className="mt-3 text-sm font-medium text-gray-900">{student.name}</div>
        <p className="mt-2 text-sm text-gray-500 leading-relaxed">
          사과 <b className="text-red-500">6개</b>가 바구니로 모이고,
          <br />
          나무는 <b>큰나무(5단계)</b>로 돌아가
          <br />
          다시 꽃 → 열매 → 수확 사이클을 시작해요.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            disabled={disabled}
            onClick={onCancel}
            className="py-2.5 rounded-lg bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
          >
            취소
          </button>
          <button
            disabled={disabled}
            onClick={onConfirm}
            className="py-2.5 rounded-lg bg-amber-100 border border-amber-300 text-sm font-medium text-amber-900 hover:bg-amber-200 transition disabled:opacity-50"
          >
            수확하기
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ============== util ============== */

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
    // 권한 미허용
  }
}

function fireConfetti(harvest: boolean) {
  const colors = ["#f0c050", "#f04848", "#5e9c38", "#c87fdb", "#ffb8d4"];
  if (harvest) {
    const end = Date.now() + 2_500;
    const tick = () => {
      confetti({ particleCount: 4, angle: 60, spread: 65, origin: { x: 0, y: 0.7 }, colors });
      confetti({ particleCount: 4, angle: 120, spread: 65, origin: { x: 1, y: 0.7 }, colors });
      if (Date.now() < end) requestAnimationFrame(tick);
    };
    tick();
  } else {
    confetti({ particleCount: 60, spread: 65, origin: { y: 0.5 }, colors });
  }
}
