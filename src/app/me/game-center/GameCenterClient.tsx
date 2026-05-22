"use client";

// 게임센터 허브 UI (모바일 세로 최적화) — 두 게임(무한의계단 / 스카이슈터) 지원.
// 각 게임은 자체 일일 한도 + 자체 월간 랭킹을 가짐 (game_rankings.game_type 별 키).
// 몬스터알 진행 상태는 두 게임 공통.

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

export type GameTypeId = "infinite_stairs" | "sky_shooter";

export type GameMeta = {
  type: GameTypeId;
  name: string;
  description: string;
  icon: string; // 이모지
  studentRoute: string;
  adminRoute: string;
  iconBg: string; // tailwind gradient classes
};

// 게임 카탈로그 — 새 게임 추가 시 여기만 늘리면 허브/페이지 데이터 로드가 자동 반영.
export const GAME_TYPES: GameMeta[] = [
  {
    type: "infinite_stairs",
    name: "무한의 계단",
    description: "좌·우 터치로 계단을 끝없이 올라가자!",
    icon: "🪜",
    studentRoute: "/me/game-center/infinite-stairs",
    adminRoute: "/admin/game-center-preview/infinite-stairs",
    iconBg: "linear-gradient(180deg, #1a0a3a 0%, #0d0524 100%)",
  },
  {
    type: "sky_shooter",
    name: "스카이 슈터",
    description: "하늘을 날며 적을 쏘고 동전을 먹자!",
    icon: "🚀",
    studentRoute: "/me/game-center/sky-shooter",
    adminRoute: "/admin/game-center-preview/sky-shooter",
    iconBg: "linear-gradient(180deg, #0c4a6e 0%, #082f49 100%)",
  },
];

export type GameStats = {
  todayPlayCount: number;
  topRankings: GameRanking[];
  myRanking: GameRanking | null;
  myRankNumber: number | null;
};

type Props = {
  studentName: string;
  dailyLimit: number;
  activeMonster: StudentMonster;
  monsterSpecies: MonsterSpecies | null;
  monsterStages: MonsterStageImage[];
  gameStats: Record<string, GameStats>;
  myStudentId: string;
  nameByStudentId: Record<string, string>;
  monthKey: string;
  // adminMode: 관리자 미리보기. 일일 한도/랭킹/EXP 영향 없음, 테스트 모드 뱃지.
  adminMode?: boolean;
  villageHref?: string;
};

const MEDAL = ["🥇", "🥈", "🥉"];

export function GameCenterClient({
  studentName,
  dailyLimit,
  activeMonster,
  monsterSpecies,
  monsterStages,
  gameStats,
  myStudentId,
  nameByStudentId,
  monthKey,
  adminMode = false,
  villageHref = "/me/village",
}: Props) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [rankingTab, setRankingTab] = useState<GameTypeId>("infinite_stairs");

  // 현재 단계 / 다음 단계 — required_exp + image_url 기준.
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

  const onPlayClick = (g: GameMeta, canPlay: boolean) => {
    if (!canPlay) {
      showToast(`${g.name}은 오늘 다 썼어요! 내일 다시 오자 🎮`);
      return;
    }
    router.push(adminMode ? g.adminRoute : g.studentRoute);
  };

  const activeRanking = gameStats[rankingTab] ?? {
    todayPlayCount: 0,
    topRankings: [],
    myRanking: null,
    myRankNumber: null,
  };
  const activeGameMeta =
    GAME_TYPES.find((g) => g.type === rankingTab) ?? GAME_TYPES[0];

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
            <div
              className="relative h-44 w-36 shrink-0 overflow-hidden rounded-2xl"
              style={{
                background:
                  "radial-gradient(80% 60% at 50% 80%, rgba(192,38,211,0.4) 0%, rgba(91,33,182,0.25) 50%, rgba(15,7,40,0) 100%), linear-gradient(180deg, #1a0a3a 0%, #0d0524 100%)",
                boxShadow:
                  "0 0 24px rgba(168,85,247,0.25) inset, 0 0 1px rgba(255,255,255,0.08) inset",
              }}
            >
              <div
                className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-pink-200 backdrop-blur-sm"
                style={{ boxShadow: "0 0 10px rgba(244,114,182,0.3)" }}
              >
                <span aria-hidden>✨</span>
                <span>성장 중</span>
              </div>

              <span
                className="absolute right-3 top-4 text-xs text-yellow-200/70"
                aria-hidden
              >
                ✦
              </span>
              <span
                className="absolute right-6 top-10 text-[8px] text-yellow-200/50"
                aria-hidden
              >
                ✦
              </span>
              <span
                className="absolute left-3 top-12 text-[10px] text-yellow-200/60"
                aria-hidden
              >
                ✦
              </span>

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
                      filter: "drop-shadow(0 8px 20px rgba(168,85,247,0.55))",
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

              <div
                className="absolute inset-x-0 bottom-3 flex justify-center"
                aria-hidden
              >
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
                    animate={{
                      scaleX: [1, 1.1, 1],
                      opacity: [0.6, 0.9, 0.6],
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                  <motion.div
                    className="absolute inset-x-5 bottom-1 h-1 rounded-full border border-purple-300/40"
                    animate={{
                      scaleX: [1.05, 0.95, 1.05],
                      opacity: [0.4, 0.7, 0.4],
                    }}
                    transition={{ duration: 2.4, repeat: Infinity }}
                  />
                </div>
              </div>
            </div>

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
          <div className="space-y-2.5">
            {GAME_TYPES.map((g) => {
              const stats = gameStats[g.type];
              const used = stats?.todayPlayCount ?? 0;
              const remaining = adminMode
                ? dailyLimit
                : Math.max(dailyLimit - used, 0);
              const canPlay = adminMode || remaining > 0;
              return (
                <GameCard
                  key={g.type}
                  game={g}
                  remaining={remaining}
                  dailyLimit={dailyLimit}
                  adminMode={adminMode}
                  canPlay={canPlay}
                  onClick={() => onPlayClick(g, canPlay)}
                />
              );
            })}
          </div>
        </section>

        {/* 이번 달 랭킹 — 게임별 탭 */}
        <section
          className="mb-7 rounded-2xl border border-purple-400/20 bg-purple-900/20 p-4 backdrop-blur-sm"
          aria-label="이번 달 랭킹"
        >
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-white">
              <span
                style={{
                  filter: "drop-shadow(0 0 8px rgba(251,191,36,0.6))",
                }}
                aria-hidden
              >
                🏆
              </span>
              <span>이번 달 랭킹</span>
            </h2>
            <span className="flex items-center gap-1 text-xs text-white/55">
              <span aria-hidden>📅</span>
              <span>{monthKey}</span>
            </span>
          </div>

          {/* 게임 탭 */}
          <div className="mb-3 flex gap-1.5 rounded-xl border border-white/10 bg-black/20 p-1">
            {GAME_TYPES.map((g) => {
              const active = g.type === rankingTab;
              return (
                <button
                  key={g.type}
                  type="button"
                  onClick={() => setRankingTab(g.type)}
                  className={[
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold transition-all",
                    active
                      ? "bg-gradient-to-r from-pink-500/30 to-fuchsia-500/30 text-white shadow-[0_0_10px_rgba(244,114,182,0.35)]"
                      : "text-white/55 active:bg-white/[0.04]",
                  ].join(" ")}
                >
                  <span aria-hidden>{g.icon}</span>
                  <span className="truncate">{g.name}</span>
                </button>
              );
            })}
          </div>

          <RankingList
            topRankings={activeRanking.topRankings}
            myRanking={activeRanking.myRanking}
            myRankNumber={activeRanking.myRankNumber}
            myStudentId={myStudentId}
            nameByStudentId={nameByStudentId}
            studentName={studentName}
            gameLabel={activeGameMeta.name}
          />
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
                filter: "drop-shadow(0 0 6px rgba(74,222,128,0.5))",
              }}
              aria-hidden
            >
              🏔️
            </span>
          </Link>
        </div>
      </div>

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

// ===== 보조 컴포넌트 =====

function GameCard({
  game,
  remaining,
  dailyLimit,
  adminMode,
  canPlay,
  onClick,
}: {
  game: GameMeta;
  remaining: number;
  dailyLimit: number;
  adminMode: boolean;
  canPlay: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!canPlay}
      className={[
        "group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border p-3.5 text-left transition-all active:scale-[0.98]",
        canPlay ? "border-purple-400/30" : "border-white/5 opacity-55",
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
      <div
        className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl"
        style={{
          background: game.iconBg,
          boxShadow: "0 0 12px rgba(168,85,247,0.18) inset",
        }}
      >
        <span
          className="text-3xl"
          style={{
            filter: "drop-shadow(0 4px 8px rgba(244,114,182,0.4))",
          }}
          aria-hidden
        >
          {game.icon}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-lg font-extrabold text-white">{game.name}</div>
        <div className="mt-0.5 truncate text-xs text-white/60">
          {game.description}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
          <span className="text-white/45">오늘</span>
          <span
            className={[
              "font-bold",
              adminMode
                ? "text-amber-300"
                : remaining > 0
                  ? "text-pink-300"
                  : "text-white/35",
            ].join(" ")}
          >
            {adminMode ? "∞" : `${remaining} / ${dailyLimit}`}
          </span>
        </div>
      </div>

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
  );
}

function RankingList({
  topRankings,
  myRanking,
  myRankNumber,
  myStudentId,
  nameByStudentId,
  studentName,
  gameLabel,
}: {
  topRankings: GameRanking[];
  myRanking: GameRanking | null;
  myRankNumber: number | null;
  myStudentId: string;
  nameByStudentId: Record<string, string>;
  studentName: string;
  gameLabel: string;
}) {
  if (topRankings.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-purple-400/20 bg-black/20 px-4 py-7 text-center">
        <Podium />
        <div className="mt-2 text-sm text-white/60">
          아직 {gameLabel} 랭킹이 없어요.
        </div>
        <div className="mt-0.5 text-xs text-pink-200/80">
          첫 도전자가 되어보세요! 🚀
        </div>
      </div>
    );
  }
  return (
    <>
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
    </>
  );
}

function Podium() {
  return (
    <div
      className="mx-auto flex h-12 w-24 items-end justify-center gap-0.5"
      aria-hidden
    >
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
