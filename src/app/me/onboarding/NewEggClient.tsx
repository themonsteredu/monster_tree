"use client";

// 새 알 받기 UI — 종 선택 없이 닉네임만 입력 → 서버가 랜덤 종 배정.
// 진화 직후엔 상단에 "🎉 OO몬을 발견했다!" 축하 카드 노출.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import type { MonsterSpecies } from "@/lib/types";
import { startRandomEggAction } from "../actions";

type Props = {
  studentName: string;
  noActiveSpecies: boolean;
  evolvedCount: number;
  celebrateSpecies: MonsterSpecies | null;
  celebrateMonsterNickname: string | null;
};

export function NewEggClient({
  studentName,
  noActiveSpecies,
  evolvedCount,
  celebrateSpecies,
  celebrateMonsterNickname,
}: Props) {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = () => {
    if (!nickname.trim()) {
      setError("이름을 입력해주세요.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await startRandomEggAction({ nickname: nickname.trim() });
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
      <div className="mx-auto max-w-md px-4 pt-8">
        {/* 진화 직후 축하 카드 */}
        {celebrateSpecies && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 18 }}
            className="mb-6 rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-100 to-orange-50 p-5 text-center shadow-md"
          >
            <div className="text-4xl">🎉🎊</div>
            <div className="mt-2 text-xs font-bold text-amber-700">
              완전 진화 성공!
            </div>
            <div className="mt-1 flex items-center justify-center gap-2 text-2xl font-extrabold text-amber-900">
              <span aria-hidden>{celebrateSpecies.emoji}</span>
              <span>{celebrateSpecies.name}</span>
              <span className="text-base">을 발견했다!</span>
            </div>
            {celebrateMonsterNickname && (
              <div className="mt-1 text-sm font-semibold text-amber-700">
                나의 {celebrateMonsterNickname} 가 도감에 등록됐어요 📖
              </div>
            )}
            {celebrateSpecies.description && (
              <div className="mt-2 text-xs text-amber-700/80">
                {celebrateSpecies.description}
              </div>
            )}
          </motion.div>
        )}

        {!celebrateSpecies && (
          <div className="mb-6 text-center">
            <h1 className="font-pretendard text-xl font-extrabold text-amber-800">
              {evolvedCount > 0
                ? `${studentName}, 새 알을 받아볼까요?`
                : "알이 도착했어요 🥚"}
            </h1>
            <p className="mt-1 text-sm text-amber-700">
              어떤 친구가 들어있을지 키워보면서 알 수 있어요.
            </p>
          </div>
        )}

        {noActiveSpecies ? (
          <div className="rounded-2xl bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
            아직 키울 수 있는 알이 없어요. 선생님께 문의해주세요.
          </div>
        ) : (
          <div className="rounded-3xl bg-white p-6 shadow-md">
            {/* 신비로운 알 일러스트 */}
            <div className="relative mx-auto h-48 w-48">
              <motion.div
                className="absolute inset-0 flex items-center justify-center"
                animate={{ y: [0, -8, 0], rotate: [-2, 2, -2] }}
                transition={{
                  duration: 4,
                  ease: "easeInOut",
                  repeat: Infinity,
                }}
              >
                <span
                  className="text-[120px] leading-none"
                  style={{
                    filter:
                      "drop-shadow(0 10px 20px rgba(217,119,6,0.35))",
                  }}
                >
                  🥚
                </span>
              </motion.div>
              {/* 반짝임 */}
              <span
                className="absolute right-4 top-6 text-xl text-amber-300"
                aria-hidden
              >
                ✨
              </span>
              <span
                className="absolute left-6 top-16 text-sm text-amber-300"
                aria-hidden
              >
                ✦
              </span>
              <span
                className="absolute right-8 bottom-10 text-base text-amber-300"
                aria-hidden
              >
                ✨
              </span>
            </div>

            <div className="mt-4 space-y-2">
              <label className="block text-xs font-bold text-amber-800">
                이름을 지어주세요
              </label>
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value.slice(0, 10))}
                placeholder="예: 미미, 토토 (10자 이내)"
                className="w-full rounded-lg border border-amber-200 px-3 py-2.5 text-sm font-pretendard focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
              {error && (
                <div className="text-center text-[11px] font-semibold text-rose-600">
                  {error}
                </div>
              )}
              <button
                type="button"
                onClick={onSubmit}
                disabled={!nickname.trim() || pending}
                className="w-full rounded-xl bg-amber-500 py-3 text-sm font-bold text-white transition hover:bg-amber-600 disabled:opacity-40"
              >
                {pending ? "준비 중…" : "🥚 이 알 받기"}
              </button>
              <p className="text-center text-[11px] text-amber-700/70">
                키우는 동안엔 무슨 몬스터인지 비밀이에요!
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
