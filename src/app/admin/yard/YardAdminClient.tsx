"use client";

// TV 정원의 마당 배경 관리. 학생 개인 숲속 마당에는 적용하지 않는다.

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import type { YardSettings } from "@/lib/types";
import { deleteYardBackgroundAction, uploadYardBackgroundAction } from "./actions";

export function YardAdminClient({ initial }: { initial: YardSettings | null }) {
  const [settings, setSettings] = useState<YardSettings | null>(initial);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    startTransition(async () => {
      const fd = new FormData();
      fd.set("file", file);
      const r = await uploadYardBackgroundAction(fd);
      if (!r.ok) {
        setToast(r.message);
        return;
      }
      setSettings({
        id: settings?.id ?? "",
        background_image: r.url,
        is_active: true,
        updated_at: new Date().toISOString(),
      });
      setToast("TV 마당 배경을 업데이트했어요.");
    });
  };

  const onDelete = () => {
    if (!settings?.background_image) return;
    if (!confirm("TV 마당 배경 이미지를 삭제할까요? 학생의 숲속 마당에는 영향이 없어요.")) return;
    startTransition(async () => {
      const r = await deleteYardBackgroundAction();
      if (!r.ok) {
        setToast(r.message);
        return;
      }
      setSettings({
        id: settings?.id ?? "",
        background_image: null,
        is_active: true,
        updated_at: new Date().toISOString(),
      });
      setToast("TV 마당 배경 이미지를 삭제했어요.");
    });
  };

  return (
    <div className="max-w-3xl mx-auto px-4 pt-4 space-y-4">
      <p className="text-xs text-gray-500 leading-relaxed">
        TV 정원 화면에 표시되는 마당의 공통 배경이에요.
        <br />
        비율은 <b>1:1 (정사각형)</b> 권장. 4MB 이하 PNG / JPG / WebP.
      </p>
      <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm leading-relaxed text-green-900">
        학생의 개인 화면은 새 숲속 마당으로 분리되었어요. 여기서 배경을 바꿔도 학생의 마당·간판·나무·포인트는 바뀌지 않아요.
        <Link href="/admin/yard-preview" className="mt-2 inline-flex min-h-11 items-center font-bold underline">학생 숲속 마당 미리보기 →</Link>
      </div>

      <section className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="w-full aspect-square rounded-xl overflow-hidden bg-gradient-to-b from-slate-200 to-emerald-200 flex items-center justify-center mb-3">
          {settings?.background_image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={settings.background_image}
              alt="TV 마당 배경"
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-gray-500 text-sm">아직 TV 마당 배경이 없어요</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => fileRef.current?.click()}
            className="text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 rounded-lg px-4 py-2 transition"
          >
            {pending
              ? "처리 중…"
              : settings?.background_image
                ? "배경 변경"
                : "배경 업로드"}
          </button>
          {settings?.background_image && (
            <button
              type="button"
              disabled={pending}
              onClick={onDelete}
              className="text-sm font-semibold text-gray-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg px-3 py-2 transition"
            >
              삭제
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={onFile}
          />
        </div>
      </section>

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
