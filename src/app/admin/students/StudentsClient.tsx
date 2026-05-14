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
    if (
      !confirm(
        `정말로 ${s.name} 학생을 삭제할까요?\n\n포인트 기록도 함께 삭제됩니다. 이 작업은 되돌릴 수 없어요.`,
      )
    )
      return;
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
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <h2 className="text-base font-semibold text-gray-900 mb-3">학생 추가</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름 (필수)"
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-transparent transition"
          />
          <input
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            placeholder="반 (예: 중2 A반)"
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-transparent transition"
          />
        </div>
        <button
          disabled={pending}
          onClick={onCreate}
          className="mt-3 w-full py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50"
        >
          {pending ? "처리 중…" : "추가하기"}
        </button>
        {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
      </div>

      {/* 학생 목록 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-100">
        {students.length === 0 && (
          <p className="text-center text-gray-400 py-10 text-sm">등록된 학생이 없어요.</p>
        )}
        {students.map((s) => (
          <div
            key={s.id}
            className={`p-3 flex items-center gap-3 ${s.is_active ? "" : "opacity-50"}`}
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900 truncate">{s.name}</div>
              <div className="text-xs text-gray-400 truncate">
                {s.class_name ?? "반 미지정"} · 누적 {s.total_points}pt · {s.current_stage}단계
                {!s.is_active && <span className="ml-1 text-red-500">· 비활성</span>}
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

      <p className="text-xs text-gray-400 px-1 leading-relaxed">
        휴원 처리하면 TV 화면에서는 보이지 않지만, 복귀 시 포인트가 그대로 유지돼요. 삭제는 모든
        기록이 함께 사라지므로 신중히 사용해주세요.
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
        "px-2.5 py-1 rounded-lg text-xs font-medium border transition",
        danger
          ? "text-red-500 border-red-200 hover:bg-red-50"
          : "text-gray-600 border-gray-200 hover:bg-gray-50",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
