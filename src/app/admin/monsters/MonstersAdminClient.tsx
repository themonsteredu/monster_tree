"use client";

// 몬스터 종 관리 UI.
// - 종 카드 그리드 (1단계 알 미리보기 + 단계 5개 체크리스트 + 활성/비활성)
// - "새 종 추가" 모달 (이름/설명/1단계 이미지)
// - 카드의 "관리" 버튼 → 종별 상세 모달 (5단계 이미지 업로드 + EXP/이름 수정)

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { MonsterSpecies, MonsterStageImage } from "@/lib/types";
import { MONSTER_STAGE_DEFAULTS } from "@/lib/types";
import {
  createSpeciesAction,
  deleteSpeciesAction,
  deleteStageImageAction,
  updateSpeciesAction,
  updateStageMetaAction,
  uploadStageImageAction,
} from "./actions";

const CHECKER_BG =
  "repeating-conic-gradient(#e5e7eb 0% 25%, #f9fafb 0% 50%) 50% / 16px 16px";

export function MonstersAdminClient({
  initialSpecies,
  initialStages,
}: {
  initialSpecies: MonsterSpecies[];
  initialStages: MonsterStageImage[];
}) {
  const [species, setSpecies] = useState<MonsterSpecies[]>(initialSpecies);
  const [stages, setStages] = useState<MonsterStageImage[]>(initialStages);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const stagesBySpecies = useMemo(() => {
    const m = new Map<string, MonsterStageImage[]>();
    for (const s of stages) {
      const arr = m.get(s.species_id) ?? [];
      arr.push(s);
      m.set(s.species_id, arr);
    }
    for (const [k, arr] of m) {
      arr.sort((a, b) => a.stage - b.stage);
      m.set(k, arr);
    }
    return m;
  }, [stages]);

  const editingSpecies = editingId ? species.find((s) => s.id === editingId) ?? null : null;
  const editingStages = editingId ? stagesBySpecies.get(editingId) ?? [] : [];

  const handleSpeciesUpdate = (next: MonsterSpecies) => {
    setSpecies((prev) => prev.map((s) => (s.id === next.id ? next : s)));
  };

  const handleStageUpdate = (next: MonsterStageImage) => {
    setStages((prev) => prev.map((s) => (s.id === next.id ? next : s)));
  };

  return (
    <div className="max-w-3xl mx-auto px-4 pt-4 space-y-4">
      <p className="text-xs text-gray-500 leading-relaxed">
        몬스터 종을 등록하고 단계별(1~5) 이미지를 점진적으로 업로드해요.
        <br />
        1단계(알) 이미지만 있어도 학생이 선택할 수 있어요. 2단계 이상은 나중에 추가해도 자동 진화.
      </p>

      <button
        type="button"
        onClick={() => setShowCreate(true)}
        className="w-full text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl py-3 transition"
      >
        + 새 종 추가
      </button>

      {species.length === 0 ? (
        <div className="text-center text-sm text-gray-400 py-12">
          아직 등록된 종이 없어요.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {species.map((sp) => (
            <SpeciesCard
              key={sp.id}
              species={sp}
              stages={stagesBySpecies.get(sp.id) ?? []}
              onManage={() => setEditingId(sp.id)}
              onToggleActive={async (next) => {
                const r = await updateSpeciesAction({ id: sp.id, isActive: next });
                if (!r.ok) {
                  setToast(r.message);
                  return;
                }
                handleSpeciesUpdate({ ...sp, is_active: next, updated_at: new Date().toISOString() });
              }}
              onDelete={async () => {
                if (!confirm(`'${sp.name}' 종을 삭제할까요? 학생이 키우는 중이면 삭제 불가.`)) return;
                const r = await deleteSpeciesAction({ id: sp.id });
                if (!r.ok) {
                  setToast(r.message);
                  return;
                }
                setSpecies((prev) => prev.filter((p) => p.id !== sp.id));
                setStages((prev) => prev.filter((p) => p.species_id !== sp.id));
                setToast("삭제했어요.");
              }}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            setToast("새 종을 추가했어요. 새로고침하면 보여요.");
            // 새로고침 트리거 — Server Action revalidate 가 작동하지만 클라이언트 상태도 갱신 필요.
            // 가장 단순한 방법으로 location reload.
            window.location.reload();
          }}
          onToast={setToast}
        />
      )}

      {editingSpecies && (
        <DetailModal
          species={editingSpecies}
          stages={editingStages}
          onClose={() => setEditingId(null)}
          onSpeciesChange={handleSpeciesUpdate}
          onStageChange={handleStageUpdate}
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

/* ============== 종 카드 ============== */

function SpeciesCard({
  species,
  stages,
  onManage,
  onToggleActive,
  onDelete,
}: {
  species: MonsterSpecies;
  stages: MonsterStageImage[];
  onManage: () => void;
  onToggleActive: (next: boolean) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const eggImage = stages.find((s) => s.stage === 1)?.image_url ?? null;
  const filledCount = stages.filter((s) => !!s.image_url).length;

  return (
    <div
      className={[
        "bg-white rounded-xl border border-gray-100 p-3 flex flex-col gap-2",
        species.is_active ? "" : "opacity-60",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-20 h-20 rounded-lg overflow-hidden flex items-center justify-center shrink-0"
          style={{ background: CHECKER_BG }}
        >
          {eggImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={eggImage} alt={species.name} className="max-w-[85%] max-h-[85%] object-contain" />
          ) : (
            <span className="text-xs text-gray-400">알 없음</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900 truncate">{species.name}</div>
          {species.description && (
            <div className="text-[11px] text-gray-500 line-clamp-2 mt-0.5">
              {species.description}
            </div>
          )}
          <div className="text-[10px] text-gray-400 mt-1">
            이미지 {filledCount} / 5 단계
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-gray-600 px-1">
        {stages.map((s) => (
          <span key={s.stage} title={s.stage_name} className="flex flex-col items-center gap-0.5">
            <span>{s.image_url ? "✅" : "⬜"}</span>
            <span className="text-[9px] text-gray-400">{s.stage}</span>
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-gray-100">
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => onToggleActive(!species.is_active))}
          className="text-[10px] font-semibold text-gray-600 hover:bg-gray-100 rounded px-2 py-1 transition"
        >
          {species.is_active ? "비활성화" : "활성화"}
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onManage}
            className="text-[10px] font-semibold text-amber-700 hover:bg-amber-50 rounded px-2 py-1 transition"
          >
            관리
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

/* ============== 새 종 추가 모달 ============== */

function CreateModal({
  onClose,
  onCreated,
  onToast,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
  onToast: (msg: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [hideName, setHideName] = useState(false);
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
      fd.set("description", description.trim());
      fd.set("hideName", hideName ? "true" : "false");
      fd.set("file", file);
      const r = await createSpeciesAction(fd);
      if (!r.ok) {
        onToast(r.message);
        return;
      }
      onCreated(r.id);
    });
  };

  return (
    <ModalShell title="새 종 추가" onClose={onClose}>
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full aspect-square rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-sm hover:border-amber-400 hover:text-amber-600 transition"
          style={previewUrl ? { background: CHECKER_BG } : undefined}
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="알 미리보기" className="max-w-[80%] max-h-[80%] object-contain" />
          ) : (
            "📁 1단계(알) PNG/WebP 선택 (1MB 이하)"
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
            placeholder="예: 민트 드래곤"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
          />
        </LabeledInput>

        <LabeledInput label="설명 (선택)">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 200))}
            placeholder="알 화면에 보이는 짧은 소개"
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
          />
        </LabeledInput>

        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={hideName}
            onChange={(e) => setHideName(e.target.checked)}
            className="w-4 h-4 accent-amber-500"
          />
          이름 가리기 (학생에게 &quot;??? 비밀의 알&quot; 로 표시)
        </label>

        <div className="text-[10px] text-gray-400 leading-relaxed">
          • 2~5단계 이미지는 추가 후 &quot;관리&quot; 버튼에서 점진적으로 업로드하세요.
          <br />
          • 필요 EXP 기본값: 0 / 50 / 150 / 300 / 500 (관리에서 수정 가능)
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

/* ============== 종 상세 관리 모달 ============== */

function DetailModal({
  species,
  stages,
  onClose,
  onSpeciesChange,
  onStageChange,
  onToast,
}: {
  species: MonsterSpecies;
  stages: MonsterStageImage[];
  onClose: () => void;
  onSpeciesChange: (next: MonsterSpecies) => void;
  onStageChange: (next: MonsterStageImage) => void;
  onToast: (msg: string) => void;
}) {
  const [name, setName] = useState(species.name);
  const [description, setDescription] = useState(species.description);
  const [hideName, setHideName] = useState(species.hide_name);
  const [pending, startTransition] = useTransition();

  const onSaveMeta = () => {
    startTransition(async () => {
      const r = await updateSpeciesAction({
        id: species.id,
        name,
        description,
        hideName,
      });
      if (!r.ok) {
        onToast(r.message);
        return;
      }
      onSpeciesChange({
        ...species,
        name: name.trim(),
        description: description.trim(),
        hide_name: hideName,
        updated_at: new Date().toISOString(),
      });
      onToast("기본 정보 저장.");
    });
  };

  return (
    <ModalShell title={species.name + " 관리"} onClose={onClose}>
      <div className="space-y-4">
        {/* 기본 정보 편집 */}
        <section className="bg-gray-50 rounded-xl p-3 space-y-2">
          <h4 className="text-xs font-semibold text-gray-700">기본 정보</h4>
          <LabeledInput label="이름">
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 40))}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
            />
          </LabeledInput>
          <LabeledInput label="설명">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 200))}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm resize-none"
            />
          </LabeledInput>
          <label className="flex items-center gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={hideName}
              onChange={(e) => setHideName(e.target.checked)}
              className="w-4 h-4 accent-amber-500"
            />
            이름 가리기
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={onSaveMeta}
            className="w-full text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg py-2"
          >
            기본 정보 저장
          </button>
        </section>

        {/* 단계별 이미지 + 메타 */}
        <section className="space-y-3">
          <h4 className="text-xs font-semibold text-gray-700">단계별 이미지 + EXP</h4>
          {MONSTER_STAGE_DEFAULTS.map((def) => {
            const s = stages.find((x) => x.stage === def.stage);
            if (!s) return null;
            return (
              <StageRow
                key={s.id}
                speciesId={species.id}
                stage={s}
                onChange={onStageChange}
                onToast={onToast}
              />
            );
          })}
        </section>
      </div>
    </ModalShell>
  );
}

function StageRow({
  speciesId,
  stage,
  onChange,
  onToast,
}: {
  speciesId: string;
  stage: MonsterStageImage;
  onChange: (next: MonsterStageImage) => void;
  onToast: (msg: string) => void;
}) {
  const [stageName, setStageName] = useState(stage.stage_name);
  const [requiredExp, setRequiredExp] = useState<number>(stage.required_exp);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setStageName(stage.stage_name);
    setRequiredExp(stage.required_exp);
  }, [stage.stage_name, stage.required_exp]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("speciesId", speciesId);
      fd.set("stage", String(stage.stage));
      fd.set("file", file);
      const r = await uploadStageImageAction(fd);
      if (!r.ok) {
        onToast(r.message);
        return;
      }
      onChange({ ...stage, image_url: r.url, updated_at: new Date().toISOString() });
      onToast(`${stage.stage}단계 이미지 업데이트.`);
    });
  };

  const onDeleteImg = () => {
    if (stage.stage === 1) {
      onToast("1단계(알) 이미지는 삭제 불가. 변경만 가능.");
      return;
    }
    if (!stage.image_url) return;
    if (!confirm(`${stage.stage}단계 이미지를 삭제할까요?`)) return;
    startTransition(async () => {
      const r = await deleteStageImageAction({ speciesId, stage: stage.stage });
      if (!r.ok) {
        onToast(r.message);
        return;
      }
      onChange({ ...stage, image_url: null, updated_at: new Date().toISOString() });
      onToast(`${stage.stage}단계 이미지 삭제.`);
    });
  };

  const onSaveMeta = () => {
    startTransition(async () => {
      const r = await updateStageMetaAction({
        speciesId,
        stage: stage.stage,
        stageName,
        requiredExp,
      });
      if (!r.ok) {
        onToast(r.message);
        return;
      }
      onChange({
        ...stage,
        stage_name: stageName.trim(),
        required_exp: requiredExp,
        updated_at: new Date().toISOString(),
      });
      onToast(`${stage.stage}단계 메타 저장.`);
    });
  };

  return (
    <div className="bg-gray-50 rounded-xl p-3 flex gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => fileRef.current?.click()}
        className="w-20 h-20 rounded-lg overflow-hidden flex items-center justify-center shrink-0 border-2 border-dashed border-gray-300 hover:border-amber-400 transition"
        style={stage.image_url ? { background: CHECKER_BG } : undefined}
        title={stage.image_url ? "이미지 변경" : "이미지 업로드"}
      >
        {stage.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={stage.image_url}
            alt={`${stage.stage}단계`}
            className="max-w-[85%] max-h-[85%] object-contain pointer-events-none"
          />
        ) : (
          <span className="text-[10px] text-gray-400">+ 업로드</span>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/webp"
        className="hidden"
        onChange={onFile}
      />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-1 text-[10px] text-gray-500">
          <span className="font-bold text-gray-700">{stage.stage}단계</span>
          {stage.image_url ? (
            <span className="text-emerald-600">✅ 업로드됨</span>
          ) : (
            <span className="text-gray-400">⬜ 비어있음</span>
          )}
        </div>
        <input
          value={stageName}
          onChange={(e) => setStageName(e.target.value.slice(0, 30))}
          placeholder="단계 이름"
          className="w-full px-2 py-1 rounded border border-gray-200 text-xs bg-white"
        />
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-500">EXP</span>
          <input
            type="number"
            value={requiredExp}
            onChange={(e) => setRequiredExp(Math.max(0, Number(e.target.value) || 0))}
            min={0}
            className="flex-1 px-2 py-1 rounded border border-gray-200 text-xs bg-white"
          />
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            disabled={pending}
            onClick={onSaveMeta}
            className="flex-1 text-[10px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded py-1"
          >
            메타 저장
          </button>
          {stage.image_url && stage.stage > 1 && (
            <button
              type="button"
              disabled={pending}
              onClick={onDeleteImg}
              className="text-[10px] font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded px-2 py-1"
            >
              이미지 삭제
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============== 공용 ============== */

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
