"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { DEFAULT_YARD_SIGN, MAX_YARD_SIGN_LENGTH, parseYardSign } from "@/lib/yard-sign";

type SignResult = { ok?: boolean; signText?: unknown; error?: string };

async function requestSign(options: RequestInit = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const timer = window.setTimeout(abort, 15_000);
  try {
    const response = await fetch("/tree/api/yard-sign", {
      ...options, credentials: "same-origin", cache: "no-store", signal: controller.signal,
    });
    const result = await response.json() as SignResult;
    return { response, result };
  } catch (error) {
    if (controller.signal.aborted) throw new Error("연결이 오래 걸려요. 문구를 확인하고 다시 시도해 주세요.");
    throw error;
  } finally {
    window.clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}

export default function YardSign({ adminMode = false }: { adminMode?: boolean }) {
  const [sign, setSign] = useState(DEFAULT_YARD_SIGN);
  const [draft, setDraft] = useState(DEFAULT_YARD_SIGN);
  const [loaded, setLoaded] = useState(adminMode);
  const [loading, setLoading] = useState(!adminMode);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [editError, setEditError] = useState("");
  const [notice, setNotice] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);
  const titleId = useId();
  const hintId = useId();
  const errorId = useId();

  const load = useCallback(async (signal?: AbortSignal) => {
    if (adminMode) return;
    setLoading(true); setLoadError("");
    try {
      const { response, result } = await requestSign({ signal });
      const next = result.ok ? parseYardSign(result.signText) : null;
      if (!response.ok || next === null) throw new Error(result.error || "간판을 불러오지 못했어요.");
      if (!signal?.aborted && mounted.current) { setSign(next); setLoaded(true); }
    } catch {
      if (!signal?.aborted && mounted.current) setLoadError("간판을 불러오지 못했어요.");
    } finally { if (!signal?.aborted && mounted.current) setLoading(false); }
  }, [adminMode]);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void load(controller.signal);
    return () => { mounted.current = false; controller.abort(); };
  }, [load]);

  function open() {
    setDraft(sign); setEditError(""); setNotice("");
    dialog.current?.showModal();
  }
  function close() {
    if (saving) return;
    dialog.current?.close(); trigger.current?.focus();
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const next = parseYardSign(draft);
    if (next === null) { setEditError("줄바꿈 없이 1~24자로 적어 주세요."); return; }
    setSaving(true); setEditError("");
    try {
      let saved = next;
      if (!adminMode) {
        const { response, result } = await requestSign({
          method: "POST",
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signText: next }),
        });
        const parsed = result.ok ? parseYardSign(result.signText) : null;
        if (!response.ok || parsed === null) throw new Error(result.error || "저장하지 못했어요. 다시 시도해 주세요.");
        saved = parsed;
      }
      if (!mounted.current) return;
      setSign(saved); dialog.current?.close(); trigger.current?.focus();
      setNotice(adminMode ? "미리보기에서만 바꿨어요. 실제 기록은 저장하지 않아요." : "간판 문구를 저장했어요!");
    } catch (error) {
      if (mounted.current) setEditError(error instanceof Error ? error.message : "저장하지 못했어요. 다시 시도해 주세요.");
    } finally { if (mounted.current) setSaving(false); }
  }

  const count = Array.from(draft.normalize("NFC").trim()).length;
  return (
    <div className="w-full min-w-0 text-center">
      <button ref={trigger} type="button" onClick={open} disabled={!loaded || loading}
        aria-label={`간판 문구 바꾸기: ${loaded ? sign : "불러오는 중"}`}
        className="relative w-full min-h-[86px] rounded-xl border-[5px] border-[#79502c] px-8 py-3 text-[#4a2a13] shadow-[0_4px_0_#51381f,inset_0_0_0_2px_#efcf90] transition-colors focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[#386337] disabled:cursor-wait"
        style={{ background: "repeating-linear-gradient(0deg,#dbae69 0px,#dbae69 23px,#c99954 24px,#e8c284 26px)" }}>
        <span aria-hidden="true" className="absolute left-3 top-3 h-2 w-2 rounded-full bg-[#704724] shadow-[0_1px_0_#f5d496]" />
        <span aria-hidden="true" className="absolute right-3 top-3 h-2 w-2 rounded-full bg-[#704724] shadow-[0_1px_0_#f5d496]" />
        <span className="block break-words text-[clamp(1.2rem,5vw,1.8rem)] font-black leading-snug [overflow-wrap:anywhere]"
          style={{ textShadow: "0 1px 0 #f3d59b" }}>{loading ? "간판 불러오는 중…" : sign}</span>
        <span className="mt-1 block text-xs font-bold">{loaded ? "✎ 눌러서 간판 문구 바꾸기" : "내 간판을 연결하고 있어요"}</span>
      </button>
      {loadError && <p role="status" className="mt-2 text-sm text-[#6a321f]">{loadError} <button type="button" className="min-h-11 px-2 font-bold underline" onClick={() => void load()}>다시 연결</button></p>}
      <p aria-live="polite" className="mt-1 text-xs text-[#365434]">{notice}</p>
      <dialog ref={dialog} aria-labelledby={titleId} onCancel={(event) => { if (saving) event.preventDefault(); }}
        className="w-[calc(100%-32px)] max-w-md max-h-[85dvh] overflow-y-auto rounded-2xl border-2 border-[#b58a50] bg-[#fff8e9] p-5 text-[#4a2a13] shadow-2xl backdrop:bg-black/50">
        <form onSubmit={save}>
          <h2 id={titleId} className="text-xl font-black">우리 집 간판 쓰기</h2>
          <p id={hintId} className="mb-4 mt-2 text-sm">내 아지트를 소개해 봐! 한글과 이모지로 {MAX_YARD_SIGN_LENGTH}자까지 적을 수 있어.</p>
          <label className="block text-sm font-bold" htmlFor={`${titleId}-input`}>간판 문구</label>
          <input id={`${titleId}-input`} autoFocus value={draft} onChange={(event) => { setDraft(event.target.value); setEditError(""); }}
            maxLength={96} disabled={saving} autoComplete="off" enterKeyHint="done" aria-describedby={`${hintId} ${errorId}`}
            aria-invalid={!!editError || count > MAX_YARD_SIGN_LENGTH}
            className="mt-2 min-h-12 w-full rounded-lg border-2 border-[#ae8653] bg-white px-3 py-2 text-base outline-offset-2 focus:outline-[#386337]" />
          <p className={`mt-1 text-right text-xs ${count > MAX_YARD_SIGN_LENGTH ? "text-red-700" : "text-[#75614b]"}`}>{count}/{MAX_YARD_SIGN_LENGTH}</p>
          <p id={errorId} role="alert" className="min-h-6 text-sm text-red-700">{editError}</p>
          <p className="mb-4 text-xs text-[#75614b]">이름, 전화번호 같은 개인정보는 적지 말아 줘.</p>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={close} disabled={saving} className="min-h-12 rounded-xl border border-[#b89a73] bg-[#f1e6d3] font-bold disabled:opacity-60">취소</button>
            <button type="submit" disabled={saving || count < 1 || count > MAX_YARD_SIGN_LENGTH}
              className="min-h-12 rounded-xl bg-[#416b35] px-3 font-bold text-white disabled:opacity-60">{saving ? "저장하는 중…" : "간판에 걸기"}</button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
