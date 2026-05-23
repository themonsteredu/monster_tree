"use client";

// 도감 UI — 3열 그리드. 수집한 종은 컬러 + 이름 + 획득일, 미수집은 실루엣 + ???.
// 카드 탭 → 상세 모달 (큰 이모지, 이름, 설명, "O번째로 키운 몬스터", 획득일).

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import type { MonsterSpecies } from "@/lib/types";

export type CollectionEntry = {
  species: MonsterSpecies;
  collected: boolean;
  rank: number | null;
  evolvedAt: string | null;
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

type Props = {
  studentName: string;
  entries: CollectionEntry[];
  collectedCount: number;
  totalCount: number;
};

export function CollectionClient({
  studentName,
  entries,
  collectedCount,
  totalCount,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  const openEntry = entries.find((e) => e.species.id === openId) ?? null;

  return (
    <main className="min-h-[100dvh] bg-gradient-to-b from-amber-50 to-orange-100 pb-16">
      <div className="mx-auto max-w-md px-4 pt-6">
        <header className="mb-5 flex items-center justify-between">
          <Link
            href="/me"
            className="rounded-full bg-white/70 px-3 py-1.5 text-xs font-bold text-amber-800 backdrop-blur-sm"
          >
            ← 사과정원
          </Link>
          <span className="text-xs text-amber-700">
            {studentName} 님의 도감
          </span>
        </header>

        <div className="mb-5 text-center">
          <h1 className="font-pretendard text-2xl font-extrabold text-amber-900">
            📖 몬스터도감
          </h1>
          <p className="mt-1 text-sm text-amber-700">
            <strong className="text-amber-900">
              {collectedCount} / {totalCount}
            </strong>{" "}
            수집완료
          </p>
          <div className="mx-auto mt-2 h-2 max-w-[200px] overflow-hidden rounded-full bg-amber-200/60">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500"
              initial={{ width: 0 }}
              animate={{
                width:
                  totalCount > 0
                    ? `${(collectedCount / totalCount) * 100}%`
                    : "0%",
              }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
            아직 도감에 등록할 수 있는 몬스터가 없어요.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2.5">
            {entries.map((e) => (
              <DexCard
                key={e.species.id}
                entry={e}
                onClick={() => setOpenId(e.species.id)}
              />
            ))}
          </div>
        )}

        <div className="mt-6 text-center">
          <Link
            href="/me"
            className="font-pretendard text-amber-600 hover:text-amber-700"
            style={{ fontSize: 13, fontWeight: 500 }}
          >
            🍎 사과정원으로
          </Link>
        </div>
      </div>

      {/* 상세 모달 */}
      <AnimatePresence>
        {openEntry && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-5 backdrop-blur-sm"
            onClick={() => setOpenId(null)}
          >
            <motion.div
              initial={{ y: 30, scale: 0.95 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 30, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 220, damping: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-sm rounded-3xl bg-gradient-to-br from-amber-50 to-orange-50 p-6 shadow-2xl"
            >
              <button
                type="button"
                onClick={() => setOpenId(null)}
                aria-label="닫기"
                className="absolute right-3 top-3 rounded-full bg-black/10 px-2 py-0.5 text-xs font-bold text-amber-900"
              >
                ✕
              </button>

              <DexDetail entry={openEntry} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function DexCard({
  entry,
  onClick,
}: {
  entry: CollectionEntry;
  onClick: () => void;
}) {
  const { species, collected, evolvedAt } = entry;
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "relative flex aspect-square w-full flex-col items-center justify-center rounded-2xl border-2 p-2 text-center transition active:scale-95",
        collected
          ? "border-amber-300 bg-white shadow-sm"
          : "border-amber-200/40 bg-amber-50/50",
      ].join(" ")}
    >
      <span
        className="text-4xl leading-none"
        style={
          collected
            ? {
                filter: "drop-shadow(0 2px 4px rgba(217,119,6,0.3))",
              }
            : {
                filter: "brightness(0) opacity(0.25)",
              }
        }
        aria-hidden
      >
        {species.emoji}
      </span>
      <div className="mt-1.5 truncate text-[11px] font-bold text-amber-900">
        {collected ? species.name : "???"}
      </div>
      {collected && evolvedAt && (
        <div className="text-[9px] text-amber-700">
          {new Date(evolvedAt).toLocaleDateString("ko-KR", {
            month: "numeric",
            day: "numeric",
          })}
        </div>
      )}
      {!collected && (
        <span
          className="absolute right-1.5 top-1.5 text-xs text-amber-900/40"
          aria-hidden
        >
          🔒
        </span>
      )}
    </button>
  );
}

function DexDetail({ entry }: { entry: CollectionEntry }) {
  const { species, collected, rank, evolvedAt } = entry;
  return (
    <div className="text-center">
      <div
        className="mx-auto mt-2 flex h-28 w-28 items-center justify-center rounded-full"
        style={{
          background: collected
            ? "radial-gradient(circle at 30% 30%, #fef3c7, #fde68a)"
            : "rgba(120,53,15,0.08)",
        }}
      >
        <span
          className="text-7xl leading-none"
          style={
            collected
              ? {
                  filter:
                    "drop-shadow(0 4px 10px rgba(217,119,6,0.45))",
                }
              : {
                  filter: "brightness(0) opacity(0.3)",
                }
          }
        >
          {species.emoji}
        </span>
      </div>

      <h2 className="mt-3 text-xl font-extrabold text-amber-900">
        {collected ? species.name : "???"}
      </h2>

      {collected && species.description && (
        <p className="mt-1.5 text-sm text-amber-800">{species.description}</p>
      )}

      {!collected && (
        <p className="mt-1.5 text-sm text-amber-700/70">
          아직 발견하지 못한 몬스터예요. 알을 끝까지 키워보세요!
        </p>
      )}

      {collected && (
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl bg-white/70 px-3 py-2">
            <div className="text-amber-700/70">획득 순서</div>
            <div className="mt-0.5 text-base font-extrabold text-amber-900">
              {rank}번째
            </div>
          </div>
          <div className="rounded-xl bg-white/70 px-3 py-2">
            <div className="text-amber-700/70">획득일</div>
            <div className="mt-0.5 text-base font-extrabold text-amber-900">
              {formatDate(evolvedAt)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
