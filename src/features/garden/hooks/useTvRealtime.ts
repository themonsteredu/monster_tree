"use client";

// TV 로비의 전역 Supabase Realtime 구독을 캡슐화한 훅.
//
// 필터 없이 3개 테이블의 모든 이벤트를 받는다:
//   garden_students   * (INSERT/UPDATE/DELETE)
//   garden_point_logs INSERT
//   garden_harvests   INSERT
//
// 핸들러는 ref 로 lock 되어 매 렌더마다 채널이 재구독되지 않는다.

import { useEffect, useRef } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { GardenPointLog, GardenStudent } from "@/lib/types";

export type TvHarvestPayload = {
  student_id: string;
  apples_count: number;
};

export type TvStudentEventType = "INSERT" | "UPDATE" | "DELETE";

export type TvRealtimeHandlers = {
  onStudentEvent?: (
    eventType: TvStudentEventType,
    next: GardenStudent | null,
    old: GardenStudent | null,
  ) => void;
  onPointLog?: (log: GardenPointLog) => void;
  onHarvest?: (h: TvHarvestPayload) => void;
};

export function useTvRealtime(handlers: TvRealtimeHandlers): void {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const sb = createSupabaseBrowserClient();
    if (!sb) return;

    const channel = sb
      .channel("garden-tv")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "garden_students" },
        (payload) => {
          handlersRef.current.onStudentEvent?.(
            payload.eventType as TvStudentEventType,
            (payload.new as GardenStudent | null) ?? null,
            (payload.old as GardenStudent | null) ?? null,
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "garden_point_logs" },
        (payload) => {
          const log = payload.new as GardenPointLog | null;
          if (log) handlersRef.current.onPointLog?.(log);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "garden_harvests" },
        (payload) => {
          const h = payload.new as { student_id?: string; apples_count?: number } | null;
          if (h?.student_id && typeof h.apples_count === "number") {
            handlersRef.current.onHarvest?.({
              student_id: h.student_id,
              apples_count: h.apples_count,
            });
          }
        },
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, []);
}
