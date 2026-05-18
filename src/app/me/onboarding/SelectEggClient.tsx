"use client";

// 학생 알 선택 화면.
// - 활성 종 그리드에서 카드 탭 → 선택 표시
// - 닉네임 입력 → 저장 → /me 이동

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MonsterSpecies, MonsterStageImage } from "@/lib/types";
import { selectEggAction } from "../actions";

const CHECKER_BG =
  "repeating-conic-gradient(#fef3c7 0% 25%, #fffbeb 0% 50%) 50% / 16px 16px";

export function SelectEggClient({
  studentName,
  species,
  stage1Map,
  evolvedCount,
}: {
  studentName: string;
  species: MonsterSpecies[];
  stage1Map: Record<string, MonsterStageImage>;
  evolvedCount: number;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const visible = species.filter((s) => !!stage1Map[s.id]);

  const onSubmit = () => {
    if (!selectedId) {
      setError("알을 먼저 선택해주세요.");
      return;
    }
    if (!nickname.trim()) {
      setError("이름을 입력해주세요.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await selectEggAction({ speciesId: selectedId, nickname: nickname.trim() });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      router.push("/me");
      router.refresh();
    });
  };

  return (
    <main className="min-h-[100dvh] bg-gradient-to-b from-amber-50 to-orange-100 pb-32">
      <div className="max-w-2xl mx-auto px-4 pt-8 pb-4">
        {evolvedCount > 0 ? (
          <div className="text-center mb-6">
            <div className="text-3xl mb-2">🎉🎊</div>
            <h1 className="font-pretendard text-xl font-extrabold text-amber-800">
              축하해요, {studentName}!
            </h1>
            <p className="text-sm text-amber-700 mt-1">
              완전히 성장한 친구가 도감에 등록되었어요.
            </p>
            <p className="text-sm text-amber-600 mt-2 font-semibold">
              새로운 알을 골라볼까요?
            </p>
          </div>
        ) : (
          <div className="text-center mb-6">
            <h1 className="font-pretendard text-xl font-extrabold text-amber-800">
              어떤 알을 키워볼까요? 🥚
            </h1>
            <p className="text-sm text-amber-700 mt-1">
              신비로운 알 안에 어떤 친구가 있을지 궁금해요!
            </p>
          </div>
        )}

        {visible.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center text-sm text-gray-500">
            아직 키울 수 있는 알이 없어요. 선생님께 문의해주세요.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {visible.map((sp) => {
              const stage1 = stage1Map[sp.id];
              const isSelected = selectedId === sp.id;
              const displayName = sp.hide_name ? "??? 비밀의 알" : sp.name;
              return (
                <button
                  key={sp.id}
                  type="button"
                  onClick={() => setSelectedId(sp.id)}
                  className={[
                    "rounded-2xl p-3 flex flex-col items-center gap-2 transition border-2 bg-white",
                    isSelected
                      ? "border-amber-500 ring-2 ring-amber-300 shadow-lg scale-105"
                      : "border-transparent hover:border-amber-200 hover:shadow-sm",
                  ].join(" ")}
                >
                  <div
                    className="w-full aspect-square rounded-xl overflow-hidden flex items-center justify-center"
                    style={{ background: CHECKER_BG }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={stage1.image_url!}
                      alt={displayName}
                      className="max-w-[85%] max-h-[85%] object-contain"
                      draggable={false}
                    />
                  </div>
                  <div className="text-xs font-semibold text-gray-900 text-center truncate w-full">
                    {displayName}
                  </div>
                  {!sp.hide_name && sp.description && (
                    <div className="text-[10px] text-gray-500 text-center line-clamp-2">
                      {sp.description}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 하단 고정 — 이름 입력 + 받기 버튼 */}
      {visible.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-amber-200 shadow-[0_-10px_30px_rgba(0,0,0,0.06)] z-40">
          <div className="max-w-2xl mx-auto px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <label className="font-pretendard text-xs font-semibold text-amber-800 shrink-0">
                이름:
              </label>
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value.slice(0, 10))}
                placeholder={selectedId ? "예: 미미, 토토 (10자 이내)" : "먼저 알을 선택해주세요"}
                disabled={!selectedId}
                className="flex-1 px-3 py-2 rounded-lg border border-amber-200 text-sm font-pretendard focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:bg-gray-100"
              />
            </div>
            {error && (
              <div className="text-[11px] text-rose-600 text-center font-semibold">
                {error}
              </div>
            )}
            <button
              type="button"
              onClick={onSubmit}
              disabled={!selectedId || !nickname.trim() || pending}
              className="w-full font-pretendard text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-40 rounded-xl py-3 transition"
            >
              {pending ? "준비 중…" : "🥚 이 알 받기"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
