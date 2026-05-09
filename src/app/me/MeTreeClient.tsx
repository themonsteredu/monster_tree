"use client";

// /tree/me 클라이언트 렌더러.
// 초기 데이터는 서버에서 SSR 으로 주입하고,
// 이후 garden_students UPDATE 를 Realtime 구독해 포인트/단계/사과 수 변화를
// 페이지 새로고침 없이 반영한다.

import { useEffect, useState } from "react";
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

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#fffaf2",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        fontFamily:
          '"Noto Sans KR", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 24,
          padding: "36px 28px",
          width: "100%",
          maxWidth: 460,
          boxShadow: "0 10px 40px rgba(0,0,0,0.06)",
          border: "1px solid #f1e8d8",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 13, color: "#9a8b6c" }}>나의 사과정원</div>
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
            원장님껌 문의해주세요.
          </div>
        ) : (
          <>
            <div style={{ textAlign: "center", marginBottom: 18 }}>
              <div style={{ fontSize: 64, lineHeight: 1, marginBottom: 8 }}>🌳</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#1f2937" }}>
                {info.name} 명계
              </div>
              <div style={{ fontSize: 13, color: "#9a8b6c", marginTop: 4 }}>
                {STAGE_TABLE.length}단계 중 {stage}단계
              </div>
            </div>

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

            <div style={{ marginBottom: 8 }}>
              <div
                style={{
                  height: 10,
                  borderRadius: 999,
                  background: "#fef0d6",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.round(progress * 100)}%`,
                    height: "100%",
                    background: "linear-gradient(90deg, #F26522, #ffae5c)",
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
                }}
              >
                {info.nextThreshold === null
                  ? "최고 단계!"
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
      }}
    >
      <div style={{ fontSize: 11, color: "#9a8b6c" }}>{label}</div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 800,
          color: "#1f2937",
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  );
}
