"use client";

// Admin 메인 화면 클라이언트 측 로직
// - 반(class) 필터
// - 학생별 빠른 적립 버튼 (+1, +2, +3, +5, -1)
// - 길게 누르면 사유 입력 모달
// - 하단 시트로 "오늘 입력 기록" 펼치기
// - Realtime 으로 다른 화면에서 입력해도 즉시 갱신됨

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AppleTree } from "@/components/AppleTree";
import { calculateStage } from "@/lib/garden";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { GardenPointLog, GardenStudent } from "@/lib/types";
import { addPointsAction } from "./actions";

const QUICK_BUTTONS = [1, 2, 3, 5] as const;
const LONG_PRESS_MS = 500;

type StudentMini = { name: string; class_name: string | null };

type Props = {
  students: GardenStudent[];
  recentLogs: GardenPointLog[];
  studentMap: Record<string, StudentMini>;
  initialClass: string | null;
};

export function AdminClient({ students: initialStudents, recentLogs: initialLogs, studentMap, initialClass }: Props) {
  const [students, setStudents] = useState(initialStudents);
  const [logs, setLogs] = useState(initialLogs);
  const [classFilter, setClassFilter] = useState<string | null>(initialClass);
  const [reasonModal, setReasonModal] = useState<{ studentId: string; delta: number } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const classes = useMemo(() => {
    const set = new Set<string>();
    for (const s of students) if (s.class_name) set.add(s.class_name);
    return Array.from(set).sort();
  }, [students]);

  const visible = useMemo(
    () =>
      students.filter((s) => (classFilter ? s.class_name === classFilter : true)),
    [students, classFilter],
  );

  // Realtime 구독 (다른 기기에서 입력 시 즉시 반영)
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
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const submitPoints = (studentId: string, delta: number, reason?: string) => {
    startTransition(async () => {
      const res = await addPointsAction({ studentId, delta, reason: reason ?? null });
      if (!res.ok) {
        showToast(res.message);
        return;
      }
      const name = students.find((s) => s.id === studentId)?.name ?? "";
      showToast(`${name} ${delta > 0 ? "+" : ""}${delta}pt 적립`);
    });
  };

  return (
    <div className="max-w-2xl mx-auto px-4 pt-4 space-y-3">
      {/* 반 필터 */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        <FilterChip active={classFilter === null} onClick={() => setClassFilter(null)}>
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

      {/* 학생 목록 */}
      <div className="space-y-2">
        {visible.length === 0 && (
          <div className="text-center text-ink-soft py-12">
            표시할 학생이 없어요.
          </div>
        )}
        {visible.map((s) => (
          <StudentRow
            key={s.id}
            student={s}
            disabled={pending}
            onQuick={(delta) => submitPoints(s.id, delta)}
            onLongPress={(delta) => setReasonModal({ studentId: s.id, delta })}
          />
        ))}
      </div>

      {/* 하단 고정: 오늘 기록 시트 토글 */}
      <button
        onClick={() => setSheetOpen(true)}
        className="fixed bottom-4 right-4 z-30 px-4 py-3 rounded-full bg-ink-strong text-white shadow-card-pop"
      >
        오늘 입력 기록
      </button>

      {/* 토스트 */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full bg-ink-strong text-white text-sm shadow-card animate-pop-in">
          {toast}
        </div>
      )}

      {/* 사유 입력 모달 */}
      {reasonModal && (
        <ReasonModal
          delta={reasonModal.delta}
          onCancel={() => setReasonModal(null)}
          onConfirm={(reason) => {
            submitPoints(reasonModal.studentId, reasonModal.delta, reason);
            setReasonModal(null);
          }}
        />
      )}

      {/* 오늘 입력 기록 시트 */}
      {sheetOpen && (
        <RecentLogsSheet
          logs={logs}
          studentMap={studentMap}
          onClose={() => setSheetOpen(false)}
        />
      )}
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
        "shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition",
        active ? "bg-apple text-white" : "bg-white text-ink-strong border border-ink-soft/20",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function StudentRow({
  student,
  disabled,
  onQuick,
  onLongPress,
}: {
  student: GardenStudent;
  disabled: boolean;
  onQuick: (delta: number) => void;
  onLongPress: (delta: number) => void;
}) {
  const stage = calculateStage(student.total_points);

  return (
    <div className="bg-white rounded-2xl shadow-card p-3">
      <div className="flex items-center gap-3">
        <AppleTree stage={stage} size="small" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <div className="text-lg font-semibold truncate">{student.name}</div>
            <div className="text-xs text-ink-soft truncate">{student.class_name ?? ""}</div>
          </div>
          <div className="text-sm text-ink-soft">
            <span className="text-base text-ink-strong font-semibold tabular-nums">
              {student.total_points}pt
            </span>
            <span className="ml-2">{stage}단계</span>
          </div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-5 gap-2">
        {QUICK_BUTTONS.map((n) => (
          <LongPressButton
            key={n}
            disabled={disabled}
            onClick={() => onQuick(n)}
            onLongPress={() => onLongPress(n)}
            className="py-3 rounded-xl bg-leaf-light/30 hover:bg-leaf-light/60 active:bg-leaf-light text-ink-strong font-bold text-lg select-none touch-manipulation"
          >
            +{n}
          </LongPressButton>
        ))}
        <button
          disabled={disabled}
          onClick={() => onQuick(-1)}
          className="py-3 rounded-xl bg-apple/10 hover:bg-apple/20 active:bg-apple/30 text-apple font-bold text-lg select-none touch-manipulation"
        >
          −1
        </button>
      </div>
    </div>
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
  // touchstart / mousedown 에서 타이머 시작, 일정 시간 지나면 onLongPress
  // 빨리 떼면 onClick
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

const REASON_PRESETS = ["출석", "지각 안 함", "숙제 완료", "수업 태도 우수", "테스트 90점↑", "테스트 80점↑", "테스트 70점↑", "응시"];

function ReasonModal({
  delta,
  onCancel,
  onConfirm,
}: {
  delta: number;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [text, setText] = useState("");
  return (
    <div className="fixed inset-0 z-50 bg-ink-strong/40 flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-card-pop p-5">
        <div className="text-lg font-bold mb-1">
          {delta > 0 ? `+${delta}` : delta}pt 적립 사유
        </div>
        <p className="text-sm text-ink-soft mb-3">자주 쓰는 사유를 누르거나 직접 입력해주세요.</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {REASON_PRESETS.map((r) => (
            <button
              key={r}
              onClick={() => setText(r)}
              className="px-3 py-1.5 rounded-full bg-cream-deep text-ink-strong text-sm"
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
          className="w-full px-3 py-2 rounded-xl border border-ink-soft/20 focus:outline-none focus:ring-2 focus:ring-apple"
        />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={onCancel}
            className="py-3 rounded-xl bg-cream-deep text-ink-strong font-semibold"
          >
            취소
          </button>
          <button
            onClick={() => onConfirm(text)}
            className="py-3 rounded-xl bg-apple text-white font-semibold"
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
  studentMap,
  onClose,
}: {
  logs: GardenPointLog[];
  studentMap: Record<string, StudentMini>;
  onClose: () => void;
}) {
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t.getTime();
  }, []);
  const todayLogs = logs.filter((l) => new Date(l.logged_at).getTime() >= today);

  return (
    <div className="fixed inset-0 z-50 bg-ink-strong/40 flex items-end justify-center" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-white rounded-t-3xl p-5 max-h-[70vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">오늘 입력 기록 ({todayLogs.length})</h2>
          <button onClick={onClose} className="text-ink-soft text-sm">닫기</button>
        </div>
        {todayLogs.length === 0 && (
          <p className="text-center text-ink-soft py-10">아직 오늘 입력한 기록이 없어요.</p>
        )}
        <ul className="divide-y divide-ink-soft/10">
          {todayLogs.map((l) => {
            const m = studentMap[l.student_id];
            const t = new Date(l.logged_at);
            const hh = t.getHours().toString().padStart(2, "0");
            const mm = t.getMinutes().toString().padStart(2, "0");
            return (
              <li key={l.id} className="py-2 flex items-center gap-3">
                <div className="text-xs text-ink-soft tabular-nums w-12">
                  {hh}:{mm}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{m?.name ?? "(삭제된 학생)"}</div>
                  <div className="text-xs text-ink-soft truncate">{l.reason ?? "—"}</div>
                </div>
                <div
                  className={[
                    "font-bold tabular-nums",
                    l.points >= 0 ? "text-leaf-dark" : "text-apple",
                  ].join(" ")}
                >
                  {l.points > 0 ? "+" : ""}
                  {l.points}pt
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
