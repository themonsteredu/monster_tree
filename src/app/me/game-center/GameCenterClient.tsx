"use client";

// 게임센터 허브 UI (모바일 세로 최적화).
// - 어두운 우주 배경 + 보라/핑크 그라데이션 포인트
// - 5단계 EXP 진행바 (현재→다음 단계까지의 % 진행도)
// - 게임 카드: 무한의계단 (다음 단계에서 실제 게임 라우트 연결)
//
// 의도적으로 비워둔 것:
//  - 게임 카드 클릭 시 실제 진입은 다음 단계 작업. 지금은 "곧 오픈!" 토스트만.

import { useMemo, useState } from "react";
import Link from "next/link";
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
}: Props) {
  const [toast, setToast] = useState<string | null>(null);

  const remaining = Math.max(dailyLimit - todayPlayCount, 0);
  const canPlay = remaining > 0;

  // 현재 단계 / 다음 단계 정보 — required_exp 와 image_url 둘 다 보고 결정.
  const { currentStageInfo, nextStageInfo, progressRatio } = useMemo(() => {
    const sorted = [...monsterStages].sort((a, b) => a.stage - b.stage);
    const cur =
      sorted.find((s) => s.stage === activeMonster.current_stage) ?? null;
    const next = sorted.find((s) => s.stage === activeMonster.current_stage + 1) ?? null;

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
    : monsterSpecies?.name ?? "내 몬스터";

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
    showToast("무한의계단은 곧 오픈! 🚧");
  };

  return (
    <main
      className="min-h-[100dvh] text-white"
      style={{
        background:
          "radial-gradient(120% 80% at 50% 0%, #2a1252 0%, #0a0613 55%, #050308 100%)",
        fontFamily: "'Jua', 'Pretendard Variable', sans-serif",
      }}
    >
      {/* 글로벌 별 배경 (가벼운 SVG 노이즈 대용) */}
      <Stars />

      <div className="relative mx-auto w-full max-w-md px-5 pb-14 pt-6">
        {/* 헤더 */}
        <header className="mb-5 flex items-center justify-between">
          <h1 className="text-2xl font-extrabold tracking-tight drop-shadow-[0_2px_6px_rgba(168,85,247,0.4)]">
            🎮 게임센터
          </h1>
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur-sm">
            {studentName}
          </span>
        </header>

        {/* 남은 횟수 — 동그라미 5개 */}
        <section
          className="mb-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm"
          aria-label="오늘 남은 플레이 횟수"
        >
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm text-white/70">오늘 남은 횟수</span>
            <span className="text-sm">
              <strong
                className={
                  remaining > 0 ? "text-pink-300" : "text-white/40"
                }
              >
                {remaining}
              </strong>
              <span className="text-white/40"> / {dailyLimit}</span>
            </span>
          </div>
          <div className="flex gap-2">
            {Array.from({ length: dailyLimit }, (_, i) => {
              const filled = i < remaining;
              return (
                <span
                  key={i}
                  className={[
                    "h-5 w-5 rounded-full border transition-colors",
                    filled
                      ? "border-pink-300/70 bg-gradient-to-br from-pink-400 to-fuchsia-500 shadow-[0_0_10px_rgba(244,114,182,0.6)]"
                      : "border-white/15 bg-white/[0.04]",
                  ].join(" ")}
                  aria-hidden
                />
              );
            })}
          </div>
        </section>

        {/* 몬스터알 카드 */}
        <section
          className="mb-5 rounded-2xl border border-white/10 bg-gradient-to-br from-fuchsia-500/10 via-purple-500/10 to-indigo-500/10 p-5 backdrop-blur-sm"
          aria-label="몬스터알 성장 상태"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-white/80">
              내 몬스터알
            </span>
            <span className="text-xs text-white/50">
              {activeMonster.current_stage} / 5 단계
            </span>
          </div>

          <div className="flex items-center gap-4">
            <motion.div
              key={activeMonster.current_stage}
              initial={{ scale: 0.9, opacity: 0.6 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 220, damping: 18 }}
              className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-black/40 ring-1 ring-white/10"
            >
              {stageImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={stageImageUrl}
                  alt={currentStageInfo?.stage_name ?? "현재 단계"}
                  className="h-20 w-20 object-contain drop-shadow-[0_4px_12px_rgba(168,85,247,0.45)]"
                  draggable={false}
                />
              ) : (
                <span
                  className="text-5xl"
                  style={{
                    filter:
                      "drop-shadow(0 4px 10px rgba(168,85,247,0.55))",
                  }}
                >
                  {stageFallback}
                </span>
              )}
            </motion.div>

            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-extrabold">
                {activeMonster.nickname}
              </div>
              <div className="truncate text-xs text-white/60">{eggLabel}</div>
              <div className="mt-2 text-xs text-white/60">
                {currentStageInfo?.stage_name ?? `${activeMonster.current_stage}단계`}
                {nextStageInfo
                  ? ` → ${nextStageInfo.stage_name}`
                  : " (최종 단계)"}
              </div>

              <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-pink-400 via-fuchsia-400 to-violet-400 shadow-[0_0_8px_rgba(244,114,182,0.55)]"
                  style={{ width: `${progressRatio * 100}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-white/60">
                <span>EXP {activeMonster.current_exp}</span>
                {nextStageInfo ? (
                  <span>다음 {nextStageInfo.required_exp}</span>
                ) : (
                  <span>완성까지 한 발짝!</span>
                )}
              </div>
            </div>
          </div>

          {/* 5단계 미니 인디케이터 */}
          <div className="mt-4 flex items-center justify-between gap-1">
            {[1, 2, 3, 4, 5].map((s) => {
              const info = monsterStages.find((x) => x.stage === s);
              const reached = s <= activeMonster.current_stage;
              return (
                <div
                  key={s}
                  className="flex flex-1 flex-col items-center"
                  aria-label={info?.stage_name ?? `${s}단계`}
                >
                  <div
                    className={[
                      "flex h-9 w-9 items-center justify-center rounded-xl border text-lg transition-all",
                      reached
                        ? "border-pink-300/60 bg-pink-400/15 shadow-[0_0_8px_rgba(244,114,182,0.35)]"
                        : "border-white/10 bg-white/[0.03] text-white/30",
                    ].join(" ")}
                  >
                    {STAGE_FALLBACK_EMOJI[s] ?? "•"}
                  </div>
                  <span
                    className={[
                      "mt-1 text-[10px]",
                      reached ? "text-white/80" : "text-white/35",
                    ].join(" ")}
                  >
                    {info?.required_exp ?? "-"}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* 게임 목록 */}
        <section className="mb-5" aria-label="플레이 가능한 게임">
          <h2 className="mb-2 px-1 text-sm font-bold text-white/80">
            게임 목록
          </h2>
          <button
            type="button"
            onClick={onPlayClick}
            disabled={!canPlay}
            className={[
              "group flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-all active:scale-[0.98]",
              canPlay
                ? "border-white/15 bg-gradient-to-r from-indigo-500/15 to-fuchsia-500/15 hover:border-pink-300/40 hover:shadow-[0_0_20px_rgba(168,85,247,0.25)]"
                : "border-white/5 bg-white/[0.02] opacity-60",
            ].join(" ")}
          >
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-black/50 text-3xl ring-1 ring-white/10">
              🪜
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-base font-extrabold">무한의 계단</div>
              <div className="mt-0.5 text-xs text-white/60">
                좌·우 터치로 계단을 끝없이 올라가자
              </div>
            </div>
            <span
              className={[
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-bold",
                canPlay
                  ? "bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white shadow-[0_4px_12px_rgba(244,114,182,0.4)]"
                  : "bg-white/10 text-white/50",
              ].join(" ")}
            >
              {canPlay ? "플레이" : "내일!"}
            </span>
          </button>
        </section>

        {/* 이번 달 랭킹 */}
        <section
          className="mb-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm"
          aria-label="이번 달 랭킹"
        >
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-bold text-white/80">
              이번 달 랭킹 <span className="text-white/40">· 무한의 계단</span>
            </h2>
            <span className="text-[11px] text-white/40">{monthKey}</span>
          </div>

          {topRankings.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center text-xs text-white/50">
              아직 랭킹이 없어요.
              <br />
              첫 도전자가 되어볼래요? 🚀
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
                        : "bg-white/[0.03]",
                    ].join(" ")}
                  >
                    <span className="w-7 text-center text-xl">
                      {MEDAL[i] ?? `${i + 1}`}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {nameByStudentId[r.student_id] ?? "익명"}
                      {isMe && (
                        <span className="ml-1.5 rounded bg-pink-500/30 px-1.5 py-0.5 text-[10px] font-bold text-pink-100">
                          나
                        </span>
                      )}
                    </span>
                    <span className="font-extrabold text-pink-200">
                      {r.best_score}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}

          {/* 본인이 TOP 3 밖이면 별도로 표시 */}
          {myRanking &&
            myRankNumber !== null &&
            !topRankings.some((r) => r.student_id === myStudentId) && (
              <div className="mt-3 border-t border-white/10 pt-3">
                <div className="flex items-center gap-3 rounded-xl bg-pink-400/10 px-3 py-2.5 ring-1 ring-pink-300/30">
                  <span className="w-7 text-center text-sm font-bold text-pink-200">
                    {myRankNumber}위
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {nameByStudentId[myRanking.student_id] ?? studentName}
                    <span className="ml-1.5 rounded bg-pink-500/30 px-1.5 py-0.5 text-[10px] font-bold text-pink-100">
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

        {/* 하단 액션 */}
        <div className="flex justify-center">
          <Link
            href="/me/village"
            className="rounded-full border border-white/15 bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-white/80 backdrop-blur-sm transition hover:bg-white/[0.08]"
          >
            ← 몬스터마을로 돌아가기
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
          className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-full bg-black/85 px-4 py-2.5 text-sm font-medium text-white shadow-xl backdrop-blur-sm"
        >
          {toast}
        </div>
      )}
    </main>
  );
}

// 가벼운 별 배경 — 정적 CSS 만으로 렌더 (성능/저전력 단말 친화).
function Stars() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 opacity-60"
      style={{
        backgroundImage:
          "radial-gradient(1.5px 1.5px at 20% 30%, rgba(255,255,255,0.6) 50%, transparent 51%)," +
          "radial-gradient(1px 1px at 70% 60%, rgba(255,255,255,0.5) 50%, transparent 51%)," +
          "radial-gradient(1.2px 1.2px at 40% 80%, rgba(255,255,255,0.4) 50%, transparent 51%)," +
          "radial-gradient(1px 1px at 85% 20%, rgba(255,255,255,0.5) 50%, transparent 51%)," +
          "radial-gradient(1.4px 1.4px at 12% 70%, rgba(255,255,255,0.4) 50%, transparent 51%)," +
          "radial-gradient(1px 1px at 55% 15%, rgba(255,255,255,0.45) 50%, transparent 51%)",
        backgroundSize: "320px 320px",
      }}
    />
  );
}
