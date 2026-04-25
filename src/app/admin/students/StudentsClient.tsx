"use client";

import { useState, useTransition } from "react";
import type { GardenStudent } from "@/lib/types";
import {
  createStudentAction,
  deleteStudentAction,
  updateStudentAction,
} from "../actions";

export function StudentsClient({ initialStudents }: { initialStudents: GardenStudent[] }) {
  const [students, setStudents] = useState(initialStudents);
  const [name, setName] = useState("");
  const [className, setClassName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const refresh = (mutator: (prev: GardenStudent[]) => GardenStudent[]) =>
    setStudents((prev) => mutator(prev));

  const onCreate = () => {
    setError(null);
    if (!name.trim()) {
      setError("이름을 입력해주세요.");
      return;
    }
    startTransition(async () => {
      const res = await createStudentAction({
        name,
        className: className || null,
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setName("");
      // 페이지 새로고침 없이도 Realtime 으로 들어오지만, admin 페이지에서는 즉시 반영을 위해
      // 임시로 placeholder 추가하고 다음 SSR 에서 갱신되게 둔다.
      // 여기서는 단순화: 입력창만 비우고 다음 갱신을 기다림.
    });
  };

  const onToggleActive = (s: GardenStudent) => {
    startTransition(async () => {
      const res = await updateStudentAction({ id: s.id, isActive: !s.is_active });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      refresh((prev) => prev.map((x) => (x.id === s.id ? { ...x, is_active: !s.is_active } : x)));
    });
  };

  const onDelete = (s: GardenStudent) => {
    if (!confirm(`정말로 ${s.name} 학생을 삭제할까요?\n\n포인트 기록도 함께 삭제됩니다. 이 작업은 되돌릴 수 없어요.`)) return;
    startTransition(async () => {
      const res = await deleteStudentAction({ id: s.id });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      refresh((prev) => prev.filter((x) => x.id !== s.id));
    });
  };

  const onRename = (s: GardenStudent) => {
    const newName = prompt("새 이름", s.name);
    if (!newName || newName === s.name) return;
    startTransition(async () => {
      const res = await updateStudentAction({ id: s.id, name: newName });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      refresh((prev) => prev.map((x) => (x.id === s.id ? { ...x, name: newName } : x)));
    });
  };

  const onChangeClass = (s: GardenStudent) => {
    const cn = prompt("반 이름 (비우면 미지정)", s.class_name ?? "");
    if (cn === null) return;
    startTransition(async () => {
      const res = await updateStudentAction({ id: s.id, className: cn });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      refresh((prev) =>
        prev.map((x) => (x.id === s.id ? { ...x, class_name: cn || null } : x)),
      );
    });
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      {/* 추가 폼 */}
      <div className="bg-white rounded-2xl shadow-card p-4">
        <h2 className="text-lg font-bold mb-3">학생 추가</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름 (필수)"
            className="px-3 py-2 rounded-xl border border-ink-soft/20 focus:outline-none focus:ring-2 focus:ring-apple"
          />
          <input
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            placeholder="반 (예: 중2 A반)"
            className="px-3 py-2 rounded-xl border border-ink-soft/20 focus:outline-none focus:ring-2 focus:ring-apple"
          />
        </div>
        <button
          disabled={pending}
          onClick={onCreate}
          className="mt-3 w-full py-3 rounded-xl bg-apple text-white font-semibold disabled:opacity-50"
        >
          {pending ? "처리 중…" : "추가하기"}
        </button>
        {error && <p className="text-sm text-apple mt-2">{error}</p>}
      </div>

      {/* 학생 목록 */}
      <div className="bg-white rounded-2xl shadow-card divide-y divide-ink-soft/10">
        {students.length === 0 && (
          <p className="text-center text-ink-soft py-10">등록된 학생이 없어요.</p>
        )}
        {students.map((s) => (
          <div key={s.id} className={`p-3 flex items-center gap-3 ${s.is_active ? "" : "opacity-50"}`}>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{s.name}</div>
              <div className="text-xs text-ink-soft truncate">
                {s.class_name ?? "반 미지정"} · 누적 {s.total_points}pt · {s.current_stage}단계
                {!s.is_active && <span className="ml-1 text-apple">· 비활성</span>}
              </div>
            </div>
            <div className="flex flex-wrap gap-1 justify-end">
              <SmallButton onClick={() => onRename(s)}>이름</SmallButton>
              <SmallButton onClick={() => onChangeClass(s)}>반</SmallButton>
              <SmallButton onClick={() => onToggleActive(s)}>
                {s.is_active ? "휴원" : "복귀"}
              </SmallButton>
              <SmallButton danger onClick={() => onDelete(s)}>
                삭제
              </SmallButton>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-ink-soft px-1 leading-relaxed">
        💡 휴원 처리하면 TV 화면에서는 보이지 않지만, 복귀 시 포인트가 그대로 유지돼요. <br />
        삭제는 모든 기록이 함께 사라지므로 신중히 사용해주세요.
      </p>
    </div>
  );
}

function SmallButton({
  onClick,
  children,
  danger,
}: {
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "px-3 py-1.5 rounded-lg text-xs font-semibold",
        danger
          ? "bg-apple/10 text-apple hover:bg-apple/20"
          : "bg-cream-deep text-ink-strong hover:bg-pot/20",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
