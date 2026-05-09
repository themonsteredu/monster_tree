"use client";

// /tree/me 학생 페이지의 Supabase Realtime 구독을 캡슐화한 훅.
//
// 단일 학생 ID 에 묶여 5개 테이블 이벤트를 받는다:
//   garden_students       UPDATE (filter: id=eq.studentId)
//   garden_point_logs     INSERT (filter: student_id=eq.studentId)
//   garden_harvests       INSERT (filter: student_id=eq.studentId)
//   garden_pending_points INSERT/DELETE (filter: student_id=eq.studentId)
//
// 핸들러는 ref 로 lock 되어 매 렌더마다 채널이 재구독되지 않는다.
// studentId 가 바뀔 때만 cleanup → 새 채널 구독.

import { useEffect, useRef } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export type StudentUpdatePayload = {
  current_stage?: number;
  total_points?: number;
  apples_harvested?: number;
  grade?: string | null;
};

export type StudentPointLog = {
  id: string;
  points: number;
  reason: string | null;
  logged_at: string;
};

export type StudentHarvest = {
  id: string;
  apples_count: number;
};

export type StudentPendingPoint = {
  id: string;
  points: number;
  reason: string | null;
  created_at: string;
};

export type StudentRealtimeHandlers = {
  onStudentUpdate?: (next: StudentUpdatePayload) => void;
  onPointLog?: (log: StudentPointLog) => void;
  onHarvest?: (h: StudentHarvest) => void;
  onPendingInsert?: (p: StudentPendingPoint) => void;
  onPendingDelete?: (id: string) => void;
};

export function useStudentRealtime(
  studentId: string | null | undefined,
  handlers: StudentRealtimeHandlers,
): void {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (!studentId) return;
    const sb = createSupabaseBrowserClient();
    if (!sb) return;

    const channel = sb
      .channel(`me:${studentId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "garden_students", filter: `id=eq.${studentId}` },
        (payload) => {
          const next = payload.new as StudentUpdatePayload | null;
          if (next) handlersRef.current.onStudentUpdate?.(next);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "garden_point_logs", filter: `student_id=eq.${studentId}` },
        (payload) => {
          const log = payload.new as StudentPointLog | null;
          if (log) handlersRef.current.onPointLog?.(log);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "garden_harvests", filter: `student_id=eq.${studentId}` },
        (payload) => {
          const h = payload.new as StudentHarvest | null;
          if (h) handlersRef.current.onHarvest?.(h);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "garden_pending_points", filter: `student_id=eq.${studentId}` },
        (payload) => {
          const p = payload.new as StudentPendingPoint | null;
          if (p) handlersRef.current.onPendingInsert?.(p);
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "garden_pending_points", filter: `student_id=eq.${studentId}` },
        (payload) => {
          const old = payload.old as { id?: string } | null;
          if (old?.id) handlersRef.current.onPendingDelete?.(old.id);
        },
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [studentId]);
}
