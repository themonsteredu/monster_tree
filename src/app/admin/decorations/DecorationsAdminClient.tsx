"use client";

// 마당 소품 관리 UI.
// - 카테고리 탭 + 카드 그리드
// - 카드: 이미지(체크무늬 배경) + 이름/가격/카테고리 + 활성 토글 + 수정/삭제
// - 새 소품 추가 모달

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { DecorationCategory, DecorationItem } from "@/lib/types";
import {
  DECORATION_CATEGORIES,
  DECORATION_CATEGORY_LABEL,
} from "@/lib/types";
import {
  createDecorationItemAction,
  deleteDecorationItemAction,
  updateDecorationItemAction,
} from "./actions";

type TabKey = "all" | DecorationCategory;

const TABS: TabKey[] = ["all", ...DECORATION_CATEGORIES];

const TAB_LABEL: Record<TabKey, string> = {
  all: "전체",
  ...DECORATION_CATEGORY_LABEL,
};

const CHECKER_BG =
  "repeating-conic-gradient(#e5e7eb 0% 25%, #f9fafb 0% 50%) 50% / 16px 16px";

export function DecorationsAdminClient({
  initialItems,
}: {
  initialItems: DecorationItem[];
}) {
  const [items, setItems] = useState<DecorationItem[]>(initialItems);
  const [tab, setTab] = useState<TabKey>("all");
  const [toast, setToast] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<DecorationItem | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const filtered = useMemo(() => {
    if (tab === "all") return items;
    return items.filter((i) => i.category === tab);
  }, [items, tab]);

  const onCreated = (item: DecorationItem) => {
    setItems((prev) => [item, ...prev]);
  };

  const onUpdated = (item: DecorationItem) => {
    setItems((prev) => prev.map((p) => (p.id === item.id ? item : p)));
  };

  const onDeleted = (id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className="max-w-3xl mx-auto px-4 pt-4 space-y-4">
      <p className="text-xs text-gray-500 leading-relaxed">
        학생이 마당에 배치할 수 있는 소품을 등록해요. 투명 배경 PNG (또는 WebP), 1MB 이하 권장.
      </p>

      {/* 카테고리 탭 */}
      <div className="bg-white rounded-2xl border border-gray-100 p-2 flex flex-wrap gap-1">
        {TABS.map((t) => {
          const count = t === "all" ? items.length : items.filter((i) => i.category === t).length;
          const active = t === tab;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={[
                "text-xs font-semibold px-3 py-1.5 rounded-lg transition",
                active
                  ? "bg-amber-100 text-amber-800"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-900",
              ].join(" ")}
            >
              {TAB_LABEL[t]} <span className="text-[10px] text-gray-400 ml-0.5">{count}</span>
            </button>
          );
        })}
      </div>

      {/* 새 소품 추가 버튼 */}
      <button
        type="button"
        onClick={() => setShowCreate(true)}
        className="w-full text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl py-3 transition"
      >
        + 새 소품 추가
      </button>

      {/* 카드 그리드 */}
      {filtered.length === 0 ? (
        <div className="text-center text-sm text-gray-400 py-12">
          {tab === "all" ? "아직 등록된 소품이 없어요." : "이 카테고리에 소품이 없어요."}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {filtered.map((item) => (
            <DecorationCard
              key={item.id}
              item={item}
              onEdit={() => setEditing(item)}
              onToggleActive={async (next) => {
                const r = await updateDecorationItemAction({ id: item.id, isActive: next });
                if (!r.ok) {
                  setToast(r.message);
                  return;
                }
                onUpdated({ ...item, is_active: next, updated_at: new Date().toISOString() });
              }}
              onDelete={async () => {
                if (!confirm(`'${item.name}' 소품을 삭제할까요?`)) return;
                const r = await deleteDecorationItemAction({ id: item.id });
                if (!r.ok) {
                  setToast(r.message);
                  return;
                }
                onDeleted(item.id);
                setToast("삭제했어요.");
              }}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={(item) => {
            onCreated(item);
            setShowCreate(false);
            setToast("새 소품을 추가했어요.");
          }}
          onToast={setToast}
        />
      )}

      {editing && (
        <EditModal
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={(item) => {
            onUpdated(item);
            setEditing(null);
            setToast("수정했어요.");
          }}
          onToast={setToast}
        />
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-full shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

/* ============== 카드 ============== */

function DecorationCard({
  item,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  item: DecorationItem;
  onEdit: () => void;
  onToggleActive: (next: boolean) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div
      className={[
        "bg-white rounded-xl border border-gray-100 p-2 flex flex-col gap-2",
        item.is_active ? "" : "opacity-60",
      ].join(" ")}
    >
      <div
        className="relative w-full aspect-square rounded-lg overflow-hidden flex items-center justify-center"
        style={{ background: CHECKER_BG }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.image_url}
          alt={item.name}
          className="max-w-[80%] max-h-[80%] object-contain pointer-events-none"
        />
        {!item.is_active && (
          <span className="absolute top-1 left-1 bg-gray-700/80 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded">
            비활성
          </span>
        )}
      </div>
      <div className="px-1">
        <div className="text-xs font-semibold text-gray-900 truncate">{item.name}</div>
        <div className="text-[10px] text-gray-500 flex items-center justify-between mt-0.5">
          <span>{DECORATION_CATEGORY_LABEL[item.category]}</span>
          <span className="text-amber-600 font-semibold">{item.price} P</span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-1 pt-1 border-t border-gray-100">
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => onToggleActive(!item.is_active))}
          className="text-[10px] font-semibold text-gray-600 hover:bg-gray-100 rounded px-2 py-1 transition"
        >
          {item.is_active ? "비활성화" : "활성화"}
        </button>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            disabled={pending}
            onClick={onEdit}
            className="text-[10px] font-semibold text-amber-700 hover:bg-amber-50 rounded px-2 py-1 transition"
          >
            수정
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => onDelete())}
            className="text-[10px] font-semibold text-rose-600 hover:bg-rose-50 rounded px-2 py-1 transition"
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============== 새 소품 모달 ============== */

function CreateModal({
  onClose,
  onCreated,
  onToast,
}: {
  onClose: () => void;
  onCreated: (item: DecorationItem) => void;
  onToast: (msg: string) => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<DecorationCategory>("flower");
  const [price, setPrice] = useState<number>(0);
  const [width, setWidth] = useState<number>(8);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setPreviewUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const canSubmit = name.trim().length > 0 && !!file && !pending;

  const onSubmit = () => {
    if (!file) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("name", name.trim());
      fd.set("category", category);
      fd.set("price", String(price));
      fd.set("defaultWidthPercent", String(width));
      fd.set("file", file);
      const r = await createDecorationItemAction(fd);
      if (!r.ok) {
        onToast(r.message);
        return;
      }
      // 액션이 다음 GET 에서 갱신된 목록을 반환하지 않으므로, 클라이언트에서 임시 객체 생성.
      // 정확한 데이터는 새로고침/revalidate 시 반영.
      onCreated({
        id: `tmp-${Date.now()}`,
        name: name.trim(),
        category,
        image_url: previewUrl ?? "",
        price,
        default_width_percent: width,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    });
  };

  return (
    <ModalShell title="새 소품 추가" onClose={onClose}>
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full aspect-square rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-sm hover:border-amber-400 hover:text-amber-600 transition"
          style={previewUrl ? { background: CHECKER_BG } : undefined}
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="미리보기"
              className="max-w-[80%] max-h-[80%] object-contain"
            />
          ) : (
            "📁 PNG / WebP 선택 (1MB 이하)"
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/webp"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />

        <LabeledInput label="이름">
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 40))}
            placeholder="예: 노란 나비"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
          />
        </LabeledInput>

        <LabeledInput label="카테고리">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as DecorationCategory)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
          >
            {DECORATION_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {DECORATION_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </LabeledInput>

        <div className="grid grid-cols-2 gap-3">
          <LabeledInput label="가격 (P)">
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(Math.max(0, Number(e.target.value) || 0))}
              min={0}
              step={1}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
          </LabeledInput>
          <LabeledInput label="기본 크기 (%)">
            <input
              type="number"
              value={width}
              onChange={(e) => setWidth(Math.max(1, Math.min(80, Number(e.target.value) || 8)))}
              min={1}
              max={80}
              step={0.5}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
          </LabeledInput>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg py-2.5 transition"
          >
            취소
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={onSubmit}
            className="flex-1 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 rounded-lg py-2.5 transition"
          >
            {pending ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

/* ============== 수정 모달 ============== */

function EditModal({
  item,
  onClose,
  onSaved,
  onToast,
}: {
  item: DecorationItem;
  onClose: () => void;
  onSaved: (item: DecorationItem) => void;
  onToast: (msg: string) => void;
}) {
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState<DecorationCategory>(item.category);
  const [price, setPrice] = useState<number>(item.price);
  const [width, setWidth] = useState<number>(item.default_width_percent);
  const [pending, startTransition] = useTransition();

  const onSubmit = () => {
    startTransition(async () => {
      const r = await updateDecorationItemAction({
        id: item.id,
        name,
        category,
        price,
        defaultWidthPercent: width,
      });
      if (!r.ok) {
        onToast(r.message);
        return;
      }
      onSaved({
        ...item,
        name: name.trim(),
        category,
        price,
        default_width_percent: width,
        updated_at: new Date().toISOString(),
      });
    });
  };

  return (
    <ModalShell title={`${item.name} 수정`} onClose={onClose}>
      <div className="space-y-3">
        <div
          className="w-full aspect-square rounded-xl flex items-center justify-center"
          style={{ background: CHECKER_BG }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.image_url} alt={item.name} className="max-w-[80%] max-h-[80%] object-contain" />
        </div>
        <p className="text-[11px] text-gray-400 text-center">이미지는 다시 등록해야 변경할 수 있어요.</p>

        <LabeledInput label="이름">
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 40))}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
          />
        </LabeledInput>

        <LabeledInput label="카테고리">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as DecorationCategory)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
          >
            {DECORATION_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {DECORATION_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </LabeledInput>

        <div className="grid grid-cols-2 gap-3">
          <LabeledInput label="가격 (P)">
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(Math.max(0, Number(e.target.value) || 0))}
              min={0}
              step={1}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
          </LabeledInput>
          <LabeledInput label="기본 크기 (%)">
            <input
              type="number"
              value={width}
              onChange={(e) => setWidth(Math.max(1, Math.min(80, Number(e.target.value) || 8)))}
              min={1}
              max={80}
              step={0.5}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
          </LabeledInput>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg py-2.5 transition"
          >
            취소
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onSubmit}
            className="flex-1 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 rounded-lg py-2.5 transition"
          >
            {pending ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

/* ============== 공용 컴포넌트 ============== */

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-lg leading-none p-1"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function LabeledInput({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-gray-600 block mb-1">{label}</span>
      {children}
    </label>
  );
}
