"use client";

// 게임센터 허브 UI (모바일 세로 최적화) — 네온 글로우 강화 버전.
// 디자인 기준: 보라/핑크 그라데이션 + 진한 우주 배경 + 둥근 카드 + 강한 drop-shadow.
// 이미지 에셋 없이 emoji + CSS 만으로 시각 임팩트 확보.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  STAGE_FALLBACK_EMOJI,
  type GameRanking,
  type MonsterSpecies,
  type MonsterStageImage,
  type StudentMonster,
} from "@/lib/types";

type Props = {
  studentName: string;
  todayPlayCount: number;
  dailyLimit: number;
  activeMonster: StudentMonster;
  monsterSpecies: MonsterSpecies | null;
  monsterStages: MonsterStageImage[];
  topRankings: GameRanking[];
  myRanking: GameRanking | null;
  myRankNumber: number | null;
  myStudentId: string;
  nameByStudentId: Record<string, string>;
  monthKey: string;
  // adminMode: 관리자 미리보기. 일일 한도/랭킹 영향 없음, 화면 상단에 테스트 모드 뱃지.
  adminMode?: boolean;
  // 관리자 모드에서 ← 돌아가기 클릭 시 이동할 경로.
  villageHref?: string;
};

const MEDAL = ["🥇", "🥈", "🥉"];

export function GameCenterClient({
  studentName,
  todayPlayCount,
  dailyLimit,
  activeMonster,
  monsterSpecies,
  monsterStages,
  topRankings,
  myRanking,
  myRankNumber,
  myStudentId,
  nameByStudentId,
  monthKey,
  adminMode = false,
  villageHref = "/me/village",
}: Props) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);

  // 관리자 모드는 일일 한도 무시 → 항상 플레이 가능.
  const remaining = adminMode
    ? dailyLimit
    : Math.max(dailyLimit - todayPlayCount, 0);
  const canPlay = adminMode || remaining > 0;
  const gameHref = adminMode
    ? "/admin/game-center-preview/infinite-stairs"
    : "/me/game-center/infinite-stairs";

  const remainingMessage =
    remaining === 0
      ? "모든 횟수를 사용했어요!"
      : remaining === dailyLimit
        ? "오늘도 화이팅! 🚀"
        : `${remaining}판 더 도전 가능!`;

  // 현재 단계 / 다음 단계 정보 — required_exp 와 image_url 둘 다 보고 결정.
  const { currentStageInfo, nextStageInfo, progressRatio } = useMemo(() => {
    const sorted = [...monsterStages].sort((a, b) => a.stage - b.stage);
    const cur =
      sorted.find((s) => s.stage === activeMonster.current_stage) ?? null;
    const next =
      sorted.find((s) => s.stage === activeMonster.current_stage + 1) ?? null;

    let ratio = 1;
    if (next) {
      const curExp = cur?.required_exp ?? 0;
      const nextExp = next.required_exp;
      const span = Math.max(nextExp - curExp, 1);
      ratio = Math.max(
        0,
        Math.min(1, (activeMonster.current_exp - curExp) / span),
      );
    }
    return {
      currentStageInfo: cur,
      nextStageInfo: next,
      progressRatio: ratio,
    };
  }, [activeMonster.current_exp, activeMonster.current_stage, monsterStages]);

  const eggLabel = monsterSpecies?.hide_name
    ? "??? 비밀의 알"
    : (monsterSpecies?.name ?? "내 몬스터");

  const stageImageUrl = currentStageInfo?.image_url ?? null;
  const stageFallback =
    STAGE_FALLBACK_EMOJI[activeMonster.current_stage] ?? "🥚";

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2000);
  };

  const onPlayClick = () => {
    if (!canPlay) {
      showToast("오늘은 여기까지! 내일 다시 오자 🎮");
      return;
    }
    router.push(gameHref);
  };

  return (
    <main
      className="relative min-h-[100dvh] text-white"
      style={{
        background:
          "radial-gradient(120% 80% at 50% -10%, #3b0d6e 0%, #1a0a3a 40%, #0a0418 70%, #050308 100%)",
        fontFamily: "'Jua', 'Pretendard Variable', sans-serif",
      }}
    >
      <Stars />

      <div className="relative z-10 mx-auto w-full max-w-md px-5 pb-16 pt-6">
        {/* 관리자 테스트 모드 뱃지 */}
        {adminMode && (
          <div
            className="mb-4 flex items-center justify-between rounded-xl border border-amber-400/40 bg-amber-500/15 px-3 py-2 text-xs font-bold text-amber-100 backdrop-blur-sm"
            style={{ boxShadow: "0 0 14px rgba(245,158,11,0.25)" }}
          >
            <span className="flex items-center gap-1.5">
              <span aria-hidden>🛠</span>
              <span>테스트 모드 — 기록/EXP 저장 안 됨</span>
            </span>
            <Link
              href="/admin/game-center"
              className="rounded-full bg-amber-400/20 px-2.5 py-1 text-[10px] uppercase tracking-wider"
            >
              관리 →
            </Link>
          </div>
        )}

        {/* 헤더 */}
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span
              className="text-3xl"
              style={{
                filter:
                  "drop-shadow(0 0 12px rgba(168,85,247,0.9)) drop-shadow(0 0 24px rgba(244,114,182,0.4))",
              }}
              aria-hidden
            >
              🎮
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight text-white">
              게임센터
            </h1>
          </div>
          <span
            className="flex items-center gap-1.5 rounded-full border border-purple-400/30 bg-white/[0.06] px-3 py-1.5 text-sm font-semibold backdrop-blur-sm"
            style={{ boxShadow: "0 0 16px rgba(168,85,247,0.25)" }}
          >
            <span className="text-yellow-300" aria-hidden>
              👑
            </span>
            <span className="text-white/90">{studentName}</span>
          </span>
        </header>

        {/* 남은 횟수 — 하트 5개 (admin 은 무제한) */}
        <section
          className="mb-5 rounded-2xl border border-purple-400/20 bg-gradient-to-br from-purple-900/30 to-purple-950/30 p-4 backdrop-blur-sm"
          style={{ boxShadow: "0 0 24px rgba(168,85,247,0.12) inset" }}
          aria-label="오늘 남은 플레이 횟수"
        >
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-base font-bold text-white/90">
              {adminMode ? "오늘 남은 횟수" : "오늘 남은 횟수"}
            </span>
            <span className="text-xl font-extrabold">
              {adminMode ? (
                <span className="text-amber-300">∞</span>
              ) : (
                <>
                  <span
                    className={
                      remaining > 0 ? "text-pink-300" : "text-white/40"
                    }
                  >
                    {remaining}
                  </span>
                  <span className="text-white/40"> / {dailyLimit}</span>
                </>
              )}
            </span>
          </div>
          <div className="flex items-end justify-between">
            <div className="flex gap-1.5">
              {Array.from({ length: dailyLimit }, (_, i) => (
                <Heart key={i} filled={adminMode ? true : i < remaining} />
              ))}
            </div>
            <span
              className={[
                "text-xs",
                adminMode
                  ? "text-amber-200/80"
                  : remaining === 0
                    ? "text-pink-200/80"
                    : "text-white/55",
              ].join(" ")}
            >
              {adminMode ? "테스트 모드 · 무제한" : remainingMessage}
            </span>
          </div>
        </section>

        {/* 몬스터알 카드 */}
        <section
          className="mb-5 overflow-hidden rounded-2xl border border-purple-400/25 p-4 backdrop-blur-sm"
          style={{
            background:
              "linear-gradient(160deg, rgba(91,33,182,0.35) 0%, rgba(76,29,149,0.25) 50%, rgba(49,10,101,0.35) 100%)",
            boxShadow:
              "0 0 30px rgba(168,85,247,0.18) inset, 0 8px 24px rgba(0,0,0,0.4)",
          }}
          aria-label="몬스터알 성장 상태"
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="text-xl"
                style={{
                  filter: "drop-shadow(0 0 8px rgba(251,146,60,0.7))",
                }}
                aria-hidden
              >
                🔥
              </span>
              <span className="text-base font-bold text-white">
                내 몬스터알
              </span>
            </div>
            <span className="rounded-full border border-pink-400/40 bg-pink-500/15 px-2.5 py-0.5 text-xs font-bold text-pink-200">
              {activeMonster.current_stage} / 5 단계
            </span>
          </div>

          <div className="flex items-stretch gap-4">
            {/* 알 디스플레이 영역 — 포털 효과 + 알 + 성장중 뱃지 */}
            <div
              className="relative h-44 w-36 shrink-0 overflow-hidden rounded-2xl"
              style={{
                background:
                  "radial-gradient(80% 60% at 50% 80%, rgba(192,38,211,0.4) 0%, rgba(91,33,182,0.25) 50%, rgba(15,7,40,0) 100%), linear-gradient(180deg, #1a0a3a 0%, #0d0524 100%)",
                boxShadow:
                  "0 0 24px rgba(168,85,247,0.25) inset, 0 0 1px rgba(255,255,255,0.08) inset",
              }}
            >
              {/* "성장 중" 뱃지 */}
              <div
                className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-pink-200 backdrop-blur-sm"
                style={{ boxShadow: "0 0 10px rgba(244,114,182,0.3)" }}
              >
                <span aria-hidden>✨</span>
                <span>성장 중</span>
              </div>

              {/* 별 입자 */}
              <span className="absolute right-3 top-4 text-xs text-yellow-200/70" aria-hidden>
                ✦
              </span>
              <span className="absolute right-6 top-10 text-[8px] text-yellow-200/50" aria-hidden>
                ✦
              </span>
              <span className="absolute left-3 top-12 text-[10px] text-yellow-200/60" aria-hidden>
                ✦
              </span>

              {/* 알 본체 — float 애니메이션 */}
              <motion.div
                className="absolute inset-x-0 top-4 flex justify-center"
                animate={{ y: [0, -6, 0] }}
                transition={{
                  duration: 2.8,
                  ease: "easeInOut",
                  repeat: Infinity,
                }}
              >
                {stageImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={stageImageUrl}
                    alt={currentStageInfo?.stage_name ?? "현재 단계"}
                    className="h-24 w-24 object-contain"
                    style={{
                      filter:
                        "drop-shadow(0 8px 20px rgba(168,85,247,0.55))",
                    }}
                    draggable={false}
                  />
                ) : (
                  <span
                    className="text-7xl"
                    style={{
                      filter:
                        "drop-shadow(0 8px 16px rgba(168,85,247,0.65)) drop-shadow(0 0 24px rgba(244,114,182,0.35))",
                    }}
                  >
                    {stageFallback}
                  </span>
                )}
              </motion.div>

              {/* 알 아래 포털 링 */}
              <div className="absolute inset-x-0 bottom-3 flex justify-center" aria-hidden>
                <div className="relative h-8 w-24">
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background:
                        "radial-gradient(50% 100% at 50% 50%, rgba(244,114,182,0.5) 0%, rgba(168,85,247,0.3) 50%, rgba(0,0,0,0) 80%)",
                      filter: "blur(2px)",
                    }}
                  />
                  <motion.div
                    className="absolute inset-x-2 bottom-3 h-1.5 rounded-full border border-pink-300/50"
                    animate={{ scaleX: [1, 1.1, 1], opacity: [0.6, 0.9, 0.6] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                  <motion.div
                    className="absolute inset-x-5 bottom-1 h-1 rounded-full border border-purple-300/40"
                    animate={{ scaleX: [1.05, 0.95, 1.05], opacity: [0.4, 0.7, 0.4] }}
                    transition={{ duration: 2.4, repeat: Infinity }}
                  />
                </div>
              </div>
            </div>

            {/* 정보 영역 */}
            <div className="flex min-w-0 flex-1 flex-col justify-center">
              <div className="truncate text-2xl font-extrabold text-white">
                {activeMonster.nickname}
              </div>
              <div className="mt-0.5 truncate text-sm text-white/55">
                {eggLabel}
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-sm">
                <span className="font-bold text-purple-200">
                  {currentStageInfo?.stage_name ??
                    `${activeMonster.current_stage}단계`}
                </span>
                <span className="text-white/40">→</span>
                <span className="font-bold text-pink-300">
                  {nextStageInfo?.stage_name ?? "최종!"}
                </span>
              </div>

              <div className="mt-2.5 h-3 w-full overflow-hidden rounded-full border border-purple-400/20 bg-black/40">
                <motion.div
                  className="h-full rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progressRatio * 100}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  style={{
                    background:
                      "linear-gradient(90deg, #f472b6 0%, #c084fc 60%, #818cf8 100%)",
                    boxShadow: "0 0 12px rgba(244,114,182,0.6)",
                  }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-xs">
                <span className="font-semibold text-white/70">
                  EXP {activeMonster.current_exp}
                </span>
                {nextStageInfo ? (
                  <span className="text-white/60">
                    다음 {nextStageInfo.required_exp}
                  </span>
                ) : (
                  <span className="text-pink-300">곧 완성!</span>
                )}
              </div>
            </div>
          </div>

          {/* 5단계 미니 인디케이터 */}
          <div className="mt-5 flex items-center justify-between gap-1.5">
            {[1, 2, 3, 4, 5].map((s, idx) => {
              const info = monsterStages.find((x) => x.stage === s);
              const reached = s <= activeMonster.current_stage;
              const isCurrent = s === activeMonster.current_stage;
              return (
                <div key={s} className="flex flex-1 items-center">
                  <div
                    className="flex flex-1 flex-col items-center"
                    aria-label={info?.stage_name ?? `${s}단계`}
                  >
                    <div
                      className={[
                        "flex h-12 w-12 items-center justify-center rounded-2xl border text-2xl transition-all",
                        isCurrent
                          ? "border-pink-300 bg-gradient-to-br from-pink-500/30 to-fuchsia-500/30"
                          : reached
                            ? "border-purple-400/40 bg-purple-500/15"
                            : "border-white/8 bg-white/[0.025] text-white/25",
                      ].join(" ")}
                      style={
                        isCurrent
                          ? {
                              boxShadow:
                                "0 0 16px rgba(244,114,182,0.55), 0 0 4px rgba(244,114,182,0.4) inset",
                            }
                          : undefined
                      }
                    >
                      <span
                        style={
                          reached
                            ? {
                                filter:
                                  "drop-shadow(0 2px 4px rgba(0,0,0,0.4))",
                              }
                            : { opacity: 0.4 }
                        }
                      >
                        {STAGE_FALLBACK_EMOJI[s] ?? "•"}
                      </span>
                    </div>
                    <span
                      className={[
                        "mt-1 text-[11px] font-bold",
                        isCurrent
                          ? "text-yellow-300"
                          : reached
                            ? "text-white/75"
                            : "text-white/30",
                      ].join(" ")}
                    >
                      {info?.required_exp ?? "-"}
                    </span>
                  </div>
                  {idx < 4 && (
                    <span
                      className={[
                        "mx-0.5 mb-3 text-xs",
                        s < activeMonster.current_stage
                          ? "text-pink-300/60"
                          : "text-white/15",
                      ].join(" ")}
                      aria-hidden
                    >
                      ···
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* 게임 목록 */}
        <section className="mb-5" aria-label="플레이 가능한 게임">
          <h2 className="mb-2.5 flex items-center gap-2 px-1 text-base font-bold text-white">
            <span aria-hidden>🎮</span>
            <span>게임 목록</span>
          </h2>
          <button
            type="button"
            onClick={onPlayClick}
            disabled={!canPlay}
            className={[
              "group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border p-3.5 text-left transition-all active:scale-[0.98]",
              canPlay
                ? "border-purple-400/30"
                : "border-white/5 opacity-55",
            ].join(" ")}
            style={
              canPlay
                ? {
                    background:
                      "linear-gradient(135deg, rgba(99,102,241,0.18) 0%, rgba(168,85,247,0.18) 50%, rgba(236,72,153,0.18) 100%)",
                    boxShadow:
                      "0 0 24px rgba(168,85,247,0.22), 0 0 1px rgba(255,255,255,0.08) inset",
                  }
                : { background: "rgba(255,255,255,0.02)" }
            }
          >
            {/* 사다리 아이콘 영역 */}
            <div
              className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl"
              style={{
                background:
                  "linear-gradient(180deg, #1a0a3a 0%, #0d0524 100%)",
                boxShadow: "0 0 12px rgba(168,85,247,0.18) inset",
              }}
            >
              <span className="absolute right-1 top-1 text-[8px] text-white/30" aria-hidden>
                ☁
              </span>
              <span className="absolute bottom-1 left-1 text-[8px] text-white/20" aria-hidden>
                ☁
              </span>
              <span
                className="text-3xl"
                style={{
                  filter:
                    "drop-shadow(0 4px 8px rgba(244,114,182,0.4))",
                }}
                aria-hidden
              >
                🪜
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="text-lg font-extrabold text-white">
                무한의 계단
              </div>
              <div className="mt-0.5 truncate text-xs text-white/60">
                좌·우 터치로 계단을 끝없이 올라가자!
              </div>
            </div>

            {/* 플레이 버튼 + chevron */}
            <div className="flex shrink-0 items-center gap-1">
              <span
                className={[
                  "rounded-full px-3.5 py-2 text-xs font-extrabold",
                  canPlay
                    ? "bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white"
                    : "bg-white/10 text-white/50",
                ].join(" ")}
                style={
                  canPlay
                    ? {
                        boxShadow:
                          "0 4px 16px rgba(244,114,182,0.5), 0 0 1px rgba(255,255,255,0.4) inset",
                      }
                    : undefined
                }
              >
                {canPlay ? "▶ 플레이" : "내일!"}
              </span>
              <span className="text-white/40" aria-hidden>
                ›
              </span>
            </div>
          </button>
        </section>

        {/* 이번 달 랭킹 */}
        <section
          className="mb-7 rounded-2xl border border-purple-400/20 bg-purple-900/20 p-4 backdrop-blur-sm"
          aria-label="이번 달 랭킹"
        >
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-white">
              <span
                style={{
                  filter:
                    "drop-shadow(0 0 8px rgba(251,191,36,0.6))",
                }}
                aria-hidden
              >
                🏆
              </span>
              <span>
                이번 달 랭킹{" "}
                <span className="text-sm font-bold text-white/50">
                  · 무한의 계단
                </span>
              </span>
            </h2>
            <span className="flex items-center gap-1 text-xs text-white/55">
              <span aria-hidden>📅</span>
              <span>{monthKey}</span>
            </span>
          </div>

          {topRankings.length === 0 ? (
            <div className="rounded-xl border border-dashed border-purple-400/20 bg-black/20 px-4 py-7 text-center">
              <Podium />
              <div className="mt-2 text-sm text-white/60">
                아직 랭킹이 없어요.
              </div>
              <div className="mt-0.5 text-xs text-pink-200/80">
                첫 도전자가 되어보세요! 🚀
              </div>
            </div>
          ) : (
            <ol className="space-y-2">
              {topRankings.map((r, i) => {
                const isMe = r.student_id === myStudentId;
                return (
                  <li
                    key={r.id}
                    className={[
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors",
                      isMe
                        ? "bg-pink-400/15 ring-1 ring-pink-300/40"
                        : "bg-white/[0.04]",
                    ].join(" ")}
                  >
                    <span className="w-7 text-center text-2xl">
                      {MEDAL[i] ?? `${i + 1}`}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-bold">
                      {nameByStudentId[r.student_id] ?? "익명"}
                      {isMe && (
                        <span className="ml-1.5 rounded bg-pink-500/40 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          나
                        </span>
                      )}
                    </span>
                    <span className="text-base font-extrabold text-pink-200">
                      {r.best_score}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}

          {myRanking &&
            myRankNumber !== null &&
            !topRankings.some((r) => r.student_id === myStudentId) && (
              <div className="mt-3 border-t border-white/10 pt-3">
                <div className="flex items-center gap-3 rounded-xl bg-pink-400/12 px-3 py-2.5 ring-1 ring-pink-300/30">
                  <span className="w-7 text-center text-sm font-bold text-pink-200">
                    {myRankNumber}위
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">
                    {nameByStudentId[myRanking.student_id] ?? studentName}
                    <span className="ml-1.5 rounded bg-pink-500/40 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      나
                    </span>
                  </span>
                  <span className="font-extrabold text-pink-200">
                    {myRanking.best_score}
                  </span>
                </div>
              </div>
            )}
        </section>

        {/* 하단 — 몬스터마을 돌아가기 */}
        <div className="flex justify-center">
          <Link
            href={villageHref}
            className="group relative flex items-center gap-3 rounded-full border border-purple-400/40 bg-gradient-to-r from-purple-900/50 via-fuchsia-900/40 to-purple-900/50 px-6 py-3 text-sm font-extrabold text-white backdrop-blur-sm transition-all active:scale-95"
            style={{
              boxShadow:
                "0 0 24px rgba(168,85,247,0.35), 0 4px 16px rgba(0,0,0,0.4)",
            }}
          >
            <span aria-hidden>←</span>
            <span>몬스터마을로 돌아가기</span>
            <span
              className="text-base"
              style={{
                filter:
                  "drop-shadow(0 0 6px rgba(74,222,128,0.5))",
              }}
              aria-hidden
            >
              🏔️
            </span>
          </Link>
        </div>
      </div>

      {/* Jua 폰트 — 본 페이지에서만 사용 */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Jua&display=swap"
      />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-full bg-black/85 px-4 py-2.5 text-sm font-bold text-white shadow-xl backdrop-blur-sm"
        >
          {toast}
        </div>
      )}
    </main>
  );
}

// 하트 — 네온 분홍 채워짐 / 빈 상태.
function Heart({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-8 w-8"
      aria-hidden
      style={
        filled
          ? {
              filter:
                "drop-shadow(0 0 6px rgba(244,114,182,0.7)) drop-shadow(0 0 12px rgba(168,85,247,0.4))",
            }
          : undefined
      }
    >
      <defs>
        <linearGradient id="heartFillGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fb7185" />
          <stop offset="100%" stopColor="#d946ef" />
        </linearGradient>
      </defs>
      <path
        d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 7a5.5 5.5 0 0 1 9.5 5C19 16.5 12 21 12 21z"
        fill={filled ? "url(#heartFillGrad)" : "rgba(255,255,255,0.04)"}
        stroke={filled ? "rgba(252,165,201,0.9)" : "rgba(255,255,255,0.12)"}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// 랭킹 빈 상태용 시상대 그래픽.
function Podium() {
  return (
    <div className="mx-auto flex h-12 w-24 items-end justify-center gap-0.5" aria-hidden>
      <div className="flex h-7 w-6 items-start justify-center rounded-t-sm bg-gradient-to-b from-slate-400/70 to-slate-500/40 pt-1 text-[10px] font-extrabold text-white/80">
        2
      </div>
      <div className="relative flex h-10 w-7 items-start justify-center rounded-t-sm bg-gradient-to-b from-yellow-300/80 to-amber-500/50 pt-1 text-[11px] font-extrabold text-white">
        <span
          className="absolute -top-3 text-base"
          style={{
            filter: "drop-shadow(0 0 6px rgba(251,191,36,0.7))",
          }}
        >
          👑
        </span>
        1
      </div>
      <div className="flex h-5 w-6 items-start justify-center rounded-t-sm bg-gradient-to-b from-orange-400/60 to-orange-600/40 pt-1 text-[10px] font-extrabold text-white/80">
        3
      </div>
    </div>
  );
}

// 가벼운 별 배경 — 정적 CSS 만으로 렌더.
function Stars() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 opacity-70"
      style={{
        backgroundImage:
          "radial-gradient(1.5px 1.5px at 20% 30%, rgba(255,255,255,0.7) 50%, transparent 51%)," +
          "radial-gradient(1px 1px at 70% 60%, rgba(255,255,255,0.55) 50%, transparent 51%)," +
          "radial-gradient(1.2px 1.2px at 40% 80%, rgba(255,255,255,0.5) 50%, transparent 51%)," +
          "radial-gradient(1px 1px at 85% 20%, rgba(255,255,255,0.55) 50%, transparent 51%)," +
          "radial-gradient(1.4px 1.4px at 12% 70%, rgba(255,255,255,0.45) 50%, transparent 51%)," +
          "radial-gradient(1px 1px at 55% 15%, rgba(255,255,255,0.5) 50%, transparent 51%)," +
          "radial-gradient(1.8px 1.8px at 90% 75%, rgba(255,255,255,0.4) 50%, transparent 51%)," +
          "radial-gradient(1px 1px at 5% 50%, rgba(255,255,255,0.5) 50%, transparent 51%)",
        backgroundSize: "320px 320px",
      }}
    />
  );
}
