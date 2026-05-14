"use client";

// 주간 / 월간 리포트 클라이언트.
// 월 단위 데이터를 미리 받아서 탭마다 주/월의 필터 + 집계만 수행.

import { useMemo, useState } from "react";
import type { GardenStudent } from "@/lib/types";
import type { ReportHarvest, ReportLog } from "./page";

type Range = "week" | "month";

function startOfWeek(now: Date): Date {
  const d = new Date(now);
  const day = d.getDay();
  const daysFromMonday = (day + 6) % 7; // 월요일 시작
  d.setDate(d.getDate() - daysFromMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function ReportsClient({
  students,
  monthLogs,
  monthHarvests,
  monthStartIso,
}: {
  students: GardenStudent[];
  monthLogs: ReportLog[];
  monthHarvests: ReportHarvest[];
  monthStartIso: string;
}) {
  const [range, setRange] = useState<Range>("week");

  const studentMap = useMemo(() => {
    const m = new Map<string, GardenStudent>();
    for (const s of students) m.set(s.id, s);
    return m;
  }, [students]);

  const periodStart = useMemo(() => {
    if (range === "month") return new Date(monthStartIso);
    return startOfWeek(new Date());
  }, [range, monthStartIso]);

  const filteredLogs = useMemo(
    () =>
      monthLogs.filter(
        (l) => new Date(l.logged_at).getTime() >= periodStart.getTime(),
      ),
    [monthLogs, periodStart],
  );
  const filteredHarvests = useMemo(
    () =>
      monthHarvests.filter(
        (h) => new Date(h.harvested_at).getTime() >= periodStart.getTime(),
      ),
    [monthHarvests, periodStart],
  );

  // KPI
  const kpi = useMemo(() => {
    let pos = 0;
    let neg = 0;
    for (const l of filteredLogs) {
      if (l.points >= 0) pos += l.points;
      else neg += l.points;
    }
    const apples = filteredHarvests.reduce((s, h) => s + h.apples_count, 0);
    const harvestEvents = filteredHarvests.length;
    return { pos, neg, net: pos + neg, apples, harvestEvents };
  }, [filteredLogs, filteredHarvests]);

  // 학생별 합계 (점수)
  const byStudent = useMemo(() => {
    const map = new Map<string, { pos: number; neg: number; net: number; count: number }>();
    for (const l of filteredLogs) {
      const cur = map.get(l.student_id) ?? { pos: 0, neg: 0, net: 0, count: 0 };
      if (l.points >= 0) cur.pos += l.points;
      else cur.neg += l.points;
      cur.net += l.points;
      cur.count += 1;
      map.set(l.student_id, cur);
    }
    return [...map.entries()]
      .map(([id, v]) => ({
        id,
        name: studentMap.get(id)?.name ?? "(삭제된 학생)",
        className: studentMap.get(id)?.class_name ?? "",
        ...v,
      }))
      .sort((a, b) => b.net - a.net);
  }, [filteredLogs, studentMap]);

  // 학생별 수확 사과
  const harvestByStudent = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of filteredHarvests) {
      map.set(h.student_id, (map.get(h.student_id) ?? 0) + h.apples_count);
    }
    return [...map.entries()]
      .map(([id, apples]) => ({
        id,
        name: studentMap.get(id)?.name ?? "(삭제된 학생)",
        className: studentMap.get(id)?.class_name ?? "",
        apples,
      }))
      .sort((a, b) => b.apples - a.apples);
  }, [filteredHarvests, studentMap]);

  // 반별 합계
  const byClass = useMemo(() => {
    const map = new Map<string, { net: number; count: number; students: number }>();
    const studentIdsByClass = new Map<string, Set<string>>();
    for (const l of filteredLogs) {
      const className = studentMap.get(l.student_id)?.class_name ?? "(미배정)";
      const cur = map.get(className) ?? { net: 0, count: 0, students: 0 };
      cur.net += l.points;
      cur.count += 1;
      map.set(className, cur);
      const set = studentIdsByClass.get(className) ?? new Set();
      set.add(l.student_id);
      studentIdsByClass.set(className, set);
    }
    return [...map.entries()]
      .map(([className, v]) => ({
        className,
        net: v.net,
        count: v.count,
        students: studentIdsByClass.get(className)?.size ?? 0,
      }))
      .sort((a, b) => b.net - a.net);
  }, [filteredLogs, studentMap]);

  // 일별 활동량 (간단 막대)
  const dailySeries = useMemo(() => {
    const days: { date: string; pos: number; neg: number }[] = [];
    const now = new Date();
    const start = new Date(periodStart);
    const dayMs = 24 * 60 * 60 * 1000;
    for (let t = start.getTime(); t <= now.getTime(); t += dayMs) {
      const d = new Date(t);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      days.push({ date: key, pos: 0, neg: 0 });
    }
    const indexByDate = new Map<string, number>();
    days.forEach((d, i) => indexByDate.set(d.date, i));
    for (const l of filteredLogs) {
      const d = new Date(l.logged_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const i = indexByDate.get(key);
      if (i === undefined) continue;
      if (l.points >= 0) days[i].pos += l.points;
      else days[i].neg += l.points;
    }
    return days;
  }, [filteredLogs, periodStart]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
      {/* 기간 탭 */}
      <div className="flex items-center gap-2">
        <RangeChip active={range === "week"} onClick={() => setRange("week")}>
          이번 주 (월~오늘)
        </RangeChip>
        <RangeChip active={range === "month"} onClick={() => setRange("month")}>
          이번 달
        </RangeChip>
        <span className="ml-auto text-xs text-gray-400">
          {formatDate(periodStart)} ~ 오늘
        </span>
      </div>

      {/* KPI */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <KpiCard label="총 적립" value={`+${kpi.pos}`} unit="pt" tone="positive" />
        <KpiCard
          label="총 차감"
          value={kpi.neg < 0 ? `${kpi.neg}` : "0"}
          unit="pt"
          tone="negative"
        />
        <KpiCard
          label="순 적립"
          value={`${kpi.net >= 0 ? "+" : ""}${kpi.net}`}
          unit="pt"
          tone={kpi.net >= 0 ? "positive" : "negative"}
        />
        <KpiCard
          label="수확 사과"
          value={`${kpi.apples}`}
          unit={`개 (${kpi.harvestEvents}회)`}
          tone="primary"
        />
      </section>

      {/* 일별 미니 막대 */}
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="text-sm font-semibold text-gray-900 mb-3">일별 활동</div>
        <DailyBars data={dailySeries} />
      </section>

      {/* 학생별 순위 (Top 20) */}
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-gray-900">학생별 순 적립 순위</div>
          <div className="text-xs text-gray-400">{byStudent.length}명 활동</div>
        </div>
        {byStudent.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-4">기간 내 활동이 없어요.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {byStudent.slice(0, 20).map((row, i) => (
              <li key={row.id} className="py-2 flex items-center gap-3">
                <div className="w-6 text-center text-xs font-medium tabular-nums text-gray-400">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate text-sm">{row.name}</div>
                  <div className="text-xs text-gray-400 truncate">
                    {row.className} · {row.count}회
                  </div>
                </div>
                <div
                  className={[
                    "text-sm font-medium tabular-nums",
                    row.net >= 0 ? "text-emerald-600" : "text-red-500",
                  ].join(" ")}
                >
                  {row.net > 0 ? "+" : ""}
                  {row.net}pt
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 수확 사과 순위 */}
      {harvestByStudent.length > 0 && (
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="text-sm font-semibold text-gray-900 mb-3">수확 사과 순위</div>
          <ul className="divide-y divide-gray-100">
            {harvestByStudent.map((row, i) => (
              <li key={row.id} className="py-2 flex items-center gap-3">
                <div className="w-6 text-center text-xs font-medium tabular-nums text-gray-400">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate text-sm">{row.name}</div>
                  <div className="text-xs text-gray-400 truncate">{row.className}</div>
                </div>
                <div className="text-sm font-medium tabular-nums text-red-500">
                  🍎 {row.apples}개
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 반별 합계 */}
      {byClass.length > 0 && (
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="text-sm font-semibold text-gray-900 mb-3">반별 순 적립</div>
          <ul className="divide-y divide-gray-100">
            {byClass.map((row) => (
              <li key={row.className} className="py-2 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate text-sm">{row.className}</div>
                  <div className="text-xs text-gray-400">
                    {row.students}명 활동 · {row.count}건
                  </div>
                </div>
                <div
                  className={[
                    "text-sm font-medium tabular-nums",
                    row.net >= 0 ? "text-emerald-600" : "text-red-500",
                  ].join(" ")}
                >
                  {row.net > 0 ? "+" : ""}
                  {row.net}pt
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function RangeChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "px-3 py-1.5 rounded-full text-sm font-medium border transition",
        active
          ? "bg-amber-100 text-amber-900 border-amber-200"
          : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function KpiCard({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  tone: "primary" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-600"
      : tone === "negative"
        ? "text-red-500"
        : "text-amber-700";
  return (
    <div className="rounded-xl p-3 bg-white border border-gray-100 shadow-sm">
      <div className="text-xs text-gray-400">{label}</div>
      <div className={`text-xl font-semibold mt-1 tabular-nums ${toneClass}`}>
        {value}
        <span className="text-xs font-normal ml-0.5 text-gray-400">{unit}</span>
      </div>
    </div>
  );
}

function DailyBars({
  data,
}: {
  data: { date: string; pos: number; neg: number }[];
}) {
  if (data.length === 0) {
    return <p className="text-center text-sm text-gray-400 py-4">기간 내 활동이 없어요.</p>;
  }
  const max = Math.max(1, ...data.map((d) => Math.max(d.pos, Math.abs(d.neg))));
  return (
    <div className="flex items-end gap-[3px] h-32">
      {data.map((d) => {
        const posH = (d.pos / max) * 100;
        const negH = (Math.abs(d.neg) / max) * 100;
        const day = d.date.slice(8); // "DD"
        return (
          <div
            key={d.date}
            className="flex-1 flex flex-col items-center justify-end gap-0.5"
            title={`${d.date}: +${d.pos} / ${d.neg}`}
          >
            <div className="w-full flex flex-col justify-end items-stretch h-24">
              {d.pos > 0 && (
                <div className="bg-emerald-400 rounded-sm" style={{ height: `${posH}%` }} />
              )}
              {d.neg < 0 && (
                <div
                  className="bg-red-300 rounded-sm mt-0.5"
                  style={{ height: `${negH * 0.4}%` }}
                />
              )}
            </div>
            <div className="text-[9px] font-medium text-gray-400 tabular-nums">{day}</div>
          </div>
        );
      })}
    </div>
  );
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}
