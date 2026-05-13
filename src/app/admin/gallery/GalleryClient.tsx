"use client";

// 아바타 갤러리 관리 UI.
// 카테고리별 섹션: 업로드 버튼 + 라벨 input + 그리드(썸네일 + 토글 + 삭제).
// 업로드 시 클라이언트에서 자동 배경 제거 — 가장자리 dominant 색 + ChatGPT 류
// "가짜 투명" 회색 체크무늬 패턴을 둘 다 감지해 알파 0 으로 만든다.
// 원본 캔버스 크기는 보존 (정렬을 위해 base 와 같은 좌표계 유지).

import { useMemo, useRef, useState, useTransition } from "react";
import type { AvatarGalleryCategory, AvatarGalleryItem } from "@/lib/types";
import {
  uploadGalleryItemAction,
  setGalleryItemActiveAction,
  deleteGalleryItemAction,
  seedDefaultPositionsAction,
} from "../actions";
import { ItemPositionEditor } from "./ItemPositionEditor";

// ─────────────────────────────────────────────────────────────────────────────
// ⚠ 핫픽스 (업로드 무반응 긴급 복구):
// 클라이언트 측 자동 배경 제거를 일시 비활성화. 업로드된 파일을 그대로 서버로 전송.
// 이전 버전에서는 createImageBitmap + 가장자리 dominant 색 분석 + 체크무늬 감지
// 까지 수행했으나, 어떤 입력에서 await 가 영원히 resolve 되지 않아 업로드
// 자체가 안 가는 현상이 발생. 원인 파악 전까지 PNG 원본을 그대로 업로드한다.
//
// 필요시 관리자가 PNG 편집기에서 미리 투명화한 뒤 업로드.
// 향후 재활성화 절차:
//   1) 별도 페이지에서 stripBackgroundToPng 단위 테스트 (다양한 입력 케이스)
//   2) 무한 대기/예외 시나리오를 catch 로 모두 잡음 + 타임아웃 보호
//   3) 한 카테고리만 opt-in 으로 다시 켜서 검증 후 확장
// ─────────────────────────────────────────────────────────────────────────────
async function stripBackgroundToPng(file: File): Promise<File> {
  console.log("[gallery] 배경 제거 (비활성화) — 원본 그대로 사용", {
    name: file.name,
    type: file.type,
    sizeKB: Math.round(file.size / 1024),
  });
  return file;
}

const CATEGORIES: Array<{ key: AvatarGalleryCategory; label: string; hint: string }> = [
  { key: "base", label: "베이스 (캐릭터)", hint: "전신 캐릭터 이미지. 학생이 가장 먼저 고르는 레이어." },
  { key: "outfit", label: "상의", hint: "후드/티/재킷 등 상체 의상. 투명 PNG 권장." },
  { key: "bottom", label: "하의", hint: "바지/치마/반바지 등 하체 의상. 투명 PNG 권장." },
  { key: "shoes", label: "신발", hint: "운동화/구두 등. 투명 PNG 권장." },
  { key: "hair", label: "헤어", hint: "머리/앞머리. 베이스 머리 위에 덮어쓰며 모자 아래에 표시." },
  { key: "face", label: "얼굴표정", hint: "눈코입 표정. 베이스 얼굴 위에 덮어씀." },
  { key: "hat", label: "모자", hint: "모자/헤어 액세서리. 투명 PNG 권장." },
  { key: "accessory", label: "액세서리", hint: "안경/뱃지/소품. 투명 PNG 권장." },
];

export function GalleryClient({ initialItems }: { initialItems: AvatarGalleryItem[] }) {
  const [items, setItems] = useState<AvatarGalleryItem[]>(initialItems);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editorItem, setEditorItem] = useState<AvatarGalleryItem | null>(null);

  const byCategory = (cat: AvatarGalleryCategory) => items.filter((i) => i.category === cat);

  // 위치 에디터의 base 오버레이용 — 활성 base 항목 중 첫 번째.
  const baseImageUrl = useMemo(() => {
    const base = items.find((i) => i.category === "base" && i.active);
    return base?.image_url ?? null;
  }, [items]);

  const handleSeedDefaults = () => {
    if (!confirm("위치값이 비어있는 항목들에 카테고리 기본 위치를 채울까요?")) return;
    setError(null);
    startTransition(async () => {
      const r = await seedDefaultPositionsAction();
      if (!r.ok) {
        setError(r.message);
        return;
      }
      await refreshFromServer();
    });
  };

  const refreshFromServer = async () => {
    // 간단히 page refresh — server action 후 revalidatePath 가 호출되긴 하나 클라이언트 state 도 갱신 필요
    if (typeof window !== "undefined") window.location.reload();
  };

  const handleUpload = (cat: AvatarGalleryCategory, file: File, label: string) => {
    console.log("[gallery] 업로드 시작", { cat, name: file.name, sizeKB: Math.round(file.size / 1024) });
    setError(null);
    if (file.size > 5_242_880) {
      setError("이미지가 너무 커요 (5MB 이하).");
      return;
    }
    startTransition(async () => {
      let processed: File;
      try {
        processed = await stripBackgroundToPng(file);
      } catch (e) {
        console.error("[gallery] 배경 제거 실패", e);
        setError(`이미지 처리 실패: ${(e as Error).message}`);
        return;
      }
      if (processed.size > 5_242_880) {
        console.warn("[gallery] 처리 결과 5MB 초과", { sizeKB: Math.round(processed.size / 1024) });
        setError("이미지가 5MB 를 초과해요. 더 작은 해상도로 다시 시도해주세요.");
        return;
      }
      const fd = new FormData();
      fd.append("file", processed);
      fd.append("category", cat);
      if (label) fd.append("label", label);
      console.log("[gallery] 스토리지 + DB 저장 시작");
      try {
        const r = await uploadGalleryItemAction(fd);
        if (!r.ok) {
          console.error("[gallery] 서버 업로드 실패", r.message);
          setError(r.message);
          return;
        }
        console.log("[gallery] 서버 업로드 완료");
      } catch (e) {
        console.error("[gallery] 서버 업로드 예외", e);
        setError(`업로드 실패: ${(e as Error).message}`);
        return;
      }
      console.log("[gallery] 페이지 새로고침");
      await refreshFromServer();
    });
  };

  const handleToggle = (id: string, active: boolean) => {
    setError(null);
    startTransition(async () => {
      const r = await setGalleryItemActiveAction({ id, active });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, active } : i)));
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("이 항목을 삭제할까요? 학생들의 아바타에서 사용 중이면 빈 슬롯이 됩니다.")) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteGalleryItemAction({ id });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== id));
    });
  };

  // ⚠ 핫픽스: 클라이언트 측 배경 재처리(recleanOne / handleReclean / handleRecleanAll) 일시 제거.
  // stripBackgroundToPng 가 no-op 이라 재처리가 의미 없음. 배경 자동 제거 재활성화 후 복원.

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 space-y-6">
      {error && (
        <div className="bg-[#fde8e4] text-[#a83020] px-3 py-2 rounded text-sm">
          {error}
        </div>
      )}
      <p className="text-sm text-ink-soft">
        학생들이 아바타 꾸미기에서 카테고리마다 1개씩 골라 합성한 아바타를 사용합니다. 같은 비율의
        정사각형 <b>투명 배경 PNG</b> 가 가장 잘 어울려요.
      </p>
      <div className="bg-[#fff5e6] border-[1.5px] border-[#f0c050] rounded-xl p-3 text-xs text-ink">
        ⚠ 클라이언트 측 자동 배경 제거가 일시 비활성화돼 있어요. 업로드 전에 <b>이미 투명
        배경으로 만들어진 PNG</b> 를 올려주세요. (Photoshop / Figma / remove.bg 등) 5MB 이하.
      </div>
      <div className="bg-cream/60 border-[1.5px] border-pot/30 rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-ink-soft flex-1 min-w-[180px]">
          position 이 비어있는 항목에 카테고리별 기본 위치를 한 번에 채울 수 있어요.
        </div>
        <button
          type="button"
          onClick={handleSeedDefaults}
          disabled={pending || items.length === 0}
          className="px-3 py-2 rounded bg-cream text-ink font-extrabold text-sm disabled:opacity-50 whitespace-nowrap border-[1.5px] border-pot/30"
          title="position 이 비어있는 항목에 카테고리별 기본 위치를 자동 채움"
        >
          📐 기본 위치 채우기
        </button>
      </div>
      {CATEGORIES.map((c) => (
        <CategorySection
          key={c.key}
          category={c.key}
          label={c.label}
          hint={c.hint}
          items={byCategory(c.key)}
          pending={pending}
          onUpload={handleUpload}
          onToggle={handleToggle}
          onDelete={handleDelete}
          onEditPosition={(it) => setEditorItem(it)}
        />
      ))}
      {editorItem && (
        <ItemPositionEditor
          item={editorItem}
          baseImageUrl={baseImageUrl}
          onClose={() => setEditorItem(null)}
          onSaved={(position) => {
            setItems((prev) =>
              prev.map((p) => (p.id === editorItem.id ? { ...p, position } : p)),
            );
            setEditorItem(null);
          }}
        />
      )}
    </div>
  );
}

function CategorySection({
  category, label, hint, items, pending, onUpload, onToggle, onDelete, onEditPosition,
}: {
  category: AvatarGalleryCategory;
  label: string;
  hint: string;
  items: AvatarGalleryItem[];
  pending: boolean;
  onUpload: (cat: AvatarGalleryCategory, file: File, label: string) => void;
  onToggle: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
  onEditPosition: (it: AvatarGalleryItem) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [draftLabel, setDraftLabel] = useState("");

  const onPick = () => fileRef.current?.click();
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    onUpload(category, f, draftLabel);
    setDraftLabel("");
  };

  return (
    <section className="bg-white border-[1.5px] border-pot/30 rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="font-extrabold text-ink">{label}</h2>
        <span className="text-xs text-ink-soft">{items.length}개</span>
      </div>
      <p className="text-xs text-ink-soft mb-3">{hint}</p>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input
          type="text"
          placeholder="라벨 (선택)"
          value={draftLabel}
          onChange={(e) => setDraftLabel(e.target.value)}
          className="px-3 py-2 border-[1.5px] border-pot/30 rounded text-sm flex-1 min-w-[120px]"
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/webp"
          onChange={onFile}
          style={{ display: "none" }}
        />
        <button
          type="button"
          onClick={onPick}
          disabled={pending}
          className="px-3 py-2 rounded bg-apple text-white font-extrabold text-sm disabled:opacity-50"
        >
          {pending ? "업로드 중..." : "📷 이미지 추가"}
        </button>
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-ink-soft py-6 text-center bg-cream/50 rounded">
          업로드된 항목이 없어요.
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {items.map((it) => (
            <div
              key={it.id}
              className={`relative border-[1.5px] rounded-lg overflow-hidden bg-cream/30 ${
                it.active ? "border-pot/40" : "border-pot/20 opacity-50"
              }`}
            >
              <div className="aspect-square w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={it.image_url}
                  alt={it.label ?? ""}
                  className="w-full h-full object-contain bg-white"
                />
              </div>
              <div className="px-1.5 py-1 text-[11px] text-ink truncate flex items-center gap-1">
                <span
                  title={it.position ? "위치 저장됨" : "카테고리 기본 위치"}
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    it.position ? "bg-apple" : "bg-pot/30"
                  }`}
                />
                <span className="truncate">{it.label ?? "(라벨 없음)"}</span>
              </div>
              <div className="flex border-t border-pot/20">
                <button
                  type="button"
                  onClick={() => onEditPosition(it)}
                  disabled={pending}
                  className="flex-1 py-1 text-[11px] font-bold border-r border-pot/20"
                  title="아바타 base 위에 겹쳐서 위치/크기 미세조정"
                >
                  📍 위치
                </button>
                <button
                  type="button"
                  onClick={() => onToggle(it.id, !it.active)}
                  disabled={pending}
                  className="flex-1 py-1 text-[11px] font-bold border-r border-pot/20"
                >
                  {it.active ? "끔" : "켬"}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(it.id)}
                  disabled={pending}
                  className="flex-1 py-1 text-[11px] font-bold text-[#a83020]"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
