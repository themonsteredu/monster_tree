"use client";

// /tree/me 클라이언트 렌더러.
// 초기 데이터는 서버에서 SSR 으로 주입하고,
// 이후 garden_students UPDATE 를 Realtime 구독해 포인트/단계/사과 수 변화를
// 페이지 새로고침 없이 반영한다.
//
// Phase 1: 시각적 풍부 — 🌳 이모지 대신 AppleTree SVG, 단계별 액센트 컬러,
//          단계 배지, 8단계 시 수확 가능 배지, 페이지 배경 그라데이션.

import { useEffect, useState } from "react";
import { AppleTree } from "@/components/AppleTree";
import {
  STAGE_TABLE,
  calculateStage,
  getStageInfo,
  pointsToNextStage,
  stageProgress,
} from "@/lib/garden";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Row = {
  id: string;
  total_points: number | null;
  current_stage: number | null;
  apples_harvested: number | null;
  grade: string | null;
};

// 단계별 컬러 토큰. TVScreen 의 STAGE_ACCENT 와 톤을 맞췄다.
//   pageBg: 페이지 배경 그라데이션 시작
//   pageBgEnd: 페이지 배경 그라데이션 끝 (살짝 진한 같은 계열)
//   badgeBg: 단계 배지 배경
//   badgeText: 단계 배지 글자
//   barFill: 진행도 바 채움
//   emoji: 단계 이모지
const STAGE_ACCENT: Record<
  number,
  {
    pageBg: string;
    pageBgEnd: string;
    badgeBg: string;
    badgeText: string;
    barFill: string;
    emoji: string;
  }
> = {
  1: {
    pageBg: "#fffaf2",
    pageBgEnd: "#fef0d6",
    badgeBg: "#fef9ed",
    badgeText: "#8a6f52",
    barFill: "linear-gradient(90deg, #b8a382, #d6c2a0)",
    emoji: "🪴",
  },
  2: {
    pageBg: "#fef9ed",
    pageBgEnd: "#f3eadc",
    badgeBg: "#f3eadc",
    badgeText: "#3d2818",
    barFill: "linear-gradient(90deg, #a87454, #d6a888)",
    emoji: "🌱",
  },
  3: {
    pageBg: "#f7fcec",
    pageBgEnd: "#dbecc1",
    badgeBg: "#dbecc1",
    badgeText: "#4a8030",
    barFill: "linear-gradient(90deg, #5e9c38, #a8e070)",
    emoji: "🌿",
  },
  4: {
    pageBg: "#f4fae6",
    pageBgEnd: "#cfe6a8",
    badgeBg: "#cfe6a8",
    badgeText: "#4a8030",
    barFill: "linear-gradient(90deg, #5e9c38, #a8e070)",
    emoji: "🌳",
  },
  5: {
    pageBg: "#f0f8e0",
    pageBgEnd: "#bfdc8a",
    badgeBg: "#bfdc8a",
    badgeText: "#4a8030",
    barFill: "linear-gradient(90deg, #4a8030, #8ec85c)",
    emoji: "🌳",
  },
  6: {
    pageBg: "#fef0f6",
    pageBgEnd: "#f8d8e8",
    badgeBg: "#f8d8e8",
    badgeText: "#b0398e",
    barFill: "linear-gradient(90deg, #c87fdb, #ffb8d4)",
    emoji: "🌸",
  },
  7: {
    pageBg: "#fff0eb",
    pageBgEnd: "#ffd6c8",
    badgeBg: "#ffd6c8",
    badgeText: "#b02020",
    barFill: "linear-gradient(90deg, #f04848, #ffb0a0)",
    emoji: "🍎",
  },
  8: {
    pageBg: "#fffadd",
    pageBgEnd: "#f7d878",
    badgeBg: "#f0c050",
    badgeText: "#3d2818",
    barFill: "linear-gradient(90deg, #e8a020, #f0c050)",
    emoji: "★",
  },
};

export function MeTreeClient({
  initialRow,
  studentName,
}: {
  initialRow: Row | null;
  studentName: string;
}) {
  const [row, setRow] = useState<Row | null>(initialRow);

  useEffect(() => {
    if (!initialRow) return;
    const sb = createSupabaseBrowserClient();
    if (!sb) return;

    const channel = sb
      .channel(`garden_students:me:${initialRow.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "garden_students",
          filter: `id=eq.${initialRow.id}`,
        },
        (payload) => {
          const next = payload.new as Partial<Row> | null;
          if (!next) return;
          setRow((prev) => ({
            id: initialRow.id,
            total_points: next.total_points ?? prev?.total_points ?? 0,
            current_stage: next.current_stage ?? prev?.current_stage ?? 1,
            apples_harvested:
              next.apples_harvested ?? prev?.apples_harvested ?? 0,
            grade: next.grade ?? prev?.grade ?? null,
          }));
        },
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [initialRow]);

  const points = row?.total_points ?? 0;
  const stage = calculateStage(points);
  const info = getStageInfo(stage);
  const progress = stageProgress(points);
  const remain = pointsToNextStage(points);
  const accent = STAGE_ACCENT[stage] ?? STAGE_ACCENT[1];
  const isHarvest = stage === 8;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: `linear-gradient(180deg, ${accent.pageBg} 0%, ${accent.pageBgEnd} 100%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        fontFamily:
          '"Pretendard Variable", "Pretendard", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        transition: "background 600ms ease",
      }}
    >
      <div
        style={{
          background: isHarvest ? "#fff5d6" : "#fff",
          borderRadius: 24,
          padding: "32px 28px",
          width: "100%",
          maxWidth: 460,
          boxShadow: isHarvest
            ? "0 0 0 4px rgba(240,192,80,0.45), 0 10px 40px rgba(61,40,24,0.12)"
            : "0 10px 40px rgba(61,40,24,0.08)",
          border: `2px solid ${isHarvest ? "#e8a020" : "#f1e8d8"}`,
        }}
      >
        {/* 헤더: 학생 이름 + 학년 */}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "#9a8b6c", fontWeight: 600 }}>
            나의 사과정원
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "#1f2937",
              marginTop: 4,
            }}
          >
            {studentName}
          </div>
          {row?.grade && (
            <div
              style={{
                fontSize: 13,
                color: "#9a8b6c",
                marginTop: 2,
                fontWeight: 600,
              }}
            >
              {row.grade}
            </div>
          )}
        </div>

        {!row ? (
          <div
            style={{
              padding: 20,
              borderRadius: 14,
              background: "#fef9ed",
              color: "#7a6233",
              fontSize: 14,
              lineHeight: 1.6,
              textAlign: "center",
            }}
          >
            아직 나무가 심어지지 않았어요.
            <br />
            원장님께 문의해주세요.
          </div>
        ) : (
          <>
            {/* 단계 배지 + 수확 가능 배지 */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 8,
                marginBottom: 8,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 14px",
                  borderRadius: 999,
                  background: accent.badgeBg,
                  color: accent.badgeText,
                  fontSize: 13,
                  fontWeight: 800,
                  border: `2px solid #3d2818`,
                  boxShadow: "0 2px 6px rgba(61,40,24,0.10)",
                }}
              >
                <span>{accent.emoji}</span>
                <span>
                  {stage}단계 · {info.name}
                </span>
              </span>
              {isHarvest && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 14px",
                    borderRadius: 999,
                    background: "#f0c050",
                    color: "#3d2818",
                    fontSize: 13,
                    fontWeight: 800,
                    border: "2px solid #3d2818",
                    boxShadow: "0 4px 12px rgba(232,160,32,0.45)",
                  }}
                >
                  ★ 수확 가능!
                </span>
              )}
            </div>

            {/* AppleTree SVG */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                margin: "8px 0 16px",
              }}
            >
              <AppleTree
                stage={stage}
                size="xl"
                mood="happy"
                growthBoost={progress}
              />
            </div>

            {/* 단계 정보 */}
            <div style={{ textAlign: "center", marginBottom: 18 }}>
              <div style={{ fontSize: 12, color: "#9a8b6c" }}>
                {STAGE_TABLE.length}단계 중 {stage}단계
              </div>
            </div>

            {/* 통계 카드 */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
                marginBottom: 18,
              }}
            >
              <Stat label="누적 포인트" value={`${points} P`} />
              <Stat
                label="수확한 사과"
                value={`${row.apples_harvested ?? 0}개`}
              />
            </div>

            {/* 진행도 바 */}
            <div style={{ marginBottom: 8 }}>
              <div
                style={{
                  height: 12,
                  borderRadius: 999,
                  background: "#f0e6d4",
                  overflow: "hidden",
                  border: "1.5px solid #d6c2a0",
                }}
              >
                <div
                  style={{
                    width: `${Math.round(progress * 100)}%`,
                    height: "100%",
                    background: accent.barFill,
                    transition: "width 600ms ease",
                  }}
                />
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "#9a8b6c",
                  marginTop: 6,
                  textAlign: "center",
                  fontWeight: 600,
                }}
              >
                {info.nextThreshold === null
                  ? "🎉 최고 단계 도달!"
                  : `다음 단계까지 ${remain} P`}
              </div>
            </div>
          </>
        )}

        <div style={{ marginTop: 24, textAlign: "center" }}>
          <a
            href="https://www.themonster.kr/student"
            style={{
              fontSize: 13,
              color: "#F26522",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            ← 학생 홈으로
          </a>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "#fff8e8",
        borderRadius: 12,
        padding: "14px 12px",
        textAlign: "center",
        border: "1.5px solid #f1e8d8",
      }}
    >
      <div style={{ fontSize: 11, color: "#9a8b6c", fontWeight: 600 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 800,
          color: "#1f2937",
          marginTop: 4,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}
