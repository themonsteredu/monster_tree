"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CLOTH_COLORS, HAIR_COLORS, LOOK_LABELS, LOOK_OPTIONS, LOOK_PRESETS, SKIN_COLORS,
  normalizeLook, type LookField, type PaperDollLook,
} from "@/lib/avatar-v2";
import { PaperDoll } from "./PaperDoll";
import styles from "./Wardrobe.module.css";

type Tab = "looks" | "face" | "hair" | "top" | "bottom" | "shoes" | "hat";
const TABS: { id: Tab; name: string; short: string }[] = [
  { id: "looks", name: "추천 코디", short: "✦" }, { id: "face", name: "얼굴", short: "☺" },
  { id: "hair", name: "헤어", short: "⌁" }, { id: "top", name: "상의", short: "♧" },
  { id: "bottom", name: "하의", short: "⋈" }, { id: "shoes", name: "신발", short: "◡" },
  { id: "hat", name: "모자", short: "⌒" },
];
const COLOR_FIELD: Partial<Record<Tab, LookField>> = {
  top: "topColor", bottom: "bottomColor", shoes: "shoeColor", hat: "hatColor",
};
const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), [href], [tabindex="0"]:not(:disabled)';

export function Wardrobe({ open, initial, onClose, onSave, adminMode = false }: {
  open: boolean; initial: PaperDollLook; onClose: () => void;
  onSave: (look: PaperDollLook) => Promise<void> | void; adminMode?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState(() => normalizeLook(initial));
  const [tab, setTab] = useState<Tab>("looks");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const savingRef = useRef(false);
  const snapshotRef = useRef(JSON.stringify(normalizeLook(initial)));
  const titleId = useId();
  const tabPrefix = useId();
  const initialKey = JSON.stringify(normalizeLook(initial));
  const dirty = JSON.stringify(draft) !== snapshotRef.current;

  const requestClose = () => {
    if (savingRef.current) return;
    if (dirty) setConfirmLeave(true);
    else onClose();
  };
  const handlers = useRef({ requestClose, confirmLeave });
  handlers.current = { requestClose, confirmLeave };

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!open) return;
    setDraft(normalizeLook(JSON.parse(initialKey)));
    snapshotRef.current = initialKey;
    setTab("looks"); setError(""); setConfirmLeave(false);
  }, [open, initialKey]);

  useEffect(() => {
    if (!open || !mounted) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => closeButtonRef.current?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation();
        if (handlers.current.confirmLeave) { setConfirmLeave(false); closeButtonRef.current?.focus(); }
        else handlers.current.requestClose();
      }
      if (event.key === "Tab") {
        const scope = handlers.current.confirmLeave ? confirmRef.current : modalRef.current;
        const controls = Array.from(scope?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(el => el.getClientRects().length);
        const first = controls[0]; const last = controls[controls.length - 1];
        if (!first || !last) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || !scope?.contains(document.activeElement))) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !scope?.contains(document.activeElement))) {
          event.preventDefault(); first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [open, mounted]);

  useEffect(() => {
    if (confirmLeave) confirmRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [confirmLeave]);

  const change = <K extends LookField>(field: K, value: PaperDollLook[K]) => {
    setError("");
    setDraft(current => ({
      ...current, [field]: value,
      ...(field === "hair" || field === "hairColor" ? { face: "human" as const } : {}),
      ...((field === "bottom" || field === "bottomColor") && current.top === "dress" ? { top: "sweatshirt" as const } : {}),
    }));
  };
  const save = async () => {
    if (savingRef.current) return;
    savingRef.current = true; setPending(true); setError("");
    try {
      await onSave({ ...draft });
      snapshotRef.current = JSON.stringify(draft);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "저장하지 못했어요. 연결을 확인한 뒤 다시 눌러주세요.");
    } finally {
      savingRef.current = false; setPending(false);
    }
  };

  if (!mounted || !open) return null;
  const selectedPreset = LOOK_PRESETS.find(preset => JSON.stringify(preset.look) === JSON.stringify(draft));
  const colorField = COLOR_FIELD[tab];
  return createPortal(
    <div className={styles.backdrop} onClick={event => { if (event.target === event.currentTarget) requestClose(); }}>
      <div className={styles.modal} ref={modalRef} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className={styles.header}>
          <div><span className={styles.eyebrow}>MONSTER WORLD · INVENTORY</span><h2 id={titleId}>오늘의 블록 아바타</h2></div>
          <button type="button" className={styles.close} ref={closeButtonRef} onClick={requestClose} disabled={pending} aria-label="옷장 닫기">×</button>
        </header>
        {adminMode && <p className={styles.admin}>🛠 테스트 모드 — 기록 저장 안 됨</p>}
        <div className={styles.body}>
          <section className={styles.preview} aria-label="선택한 아바타 미리보기">
            <span className={styles.previewTag}>내 캐릭터 · 장비 장착</span>
            <div className={styles.mirror}><PaperDoll look={draft} size={320} className={styles.largeDoll} /></div>
            <div className={styles.previewCaption}><span className={styles.littleStar}>✦</span><strong>{selectedPreset?.name ?? "나만의 코디"}</strong><span>장비를 고르고 나만의 캐릭터 완성!</span></div>
            <span className={styles.freePill}>모든 기본 아이템 무료</span>
          </section>
          <section className={styles.closet} aria-label="아바타 꾸미기">
            <div className={styles.tabs} role="tablist" aria-label="꾸미기 종류">
              {TABS.map((item, index) => <button key={item.id} type="button" role="tab"
                id={`${tabPrefix}-${item.id}`} aria-selected={tab === item.id} aria-controls={`${tabPrefix}-panel`}
                tabIndex={tab === item.id ? 0 : -1} disabled={pending}
                className={`${styles.tab} ${tab === item.id ? styles.activeTab : ""}`}
                onClick={() => setTab(item.id)} onKeyDown={event => {
                  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                  event.preventDefault();
                  const next = event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1
                    : (index + (event.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
                  setTab(TABS[next].id);
                  document.getElementById(`${tabPrefix}-${TABS[next].id}`)?.focus();
                }}><span aria-hidden="true">{item.short}</span>{item.name}</button>)}
            </div>
            <div id={`${tabPrefix}-panel`} role="tabpanel" aria-labelledby={`${tabPrefix}-${tab}`} className={styles.panel}>
              <div className={styles.panelHeading}><h3>{TABS.find(item => item.id === tab)?.name}</h3><span>{tab === "looks" ? "한 번에 갈아입기" : "누르면 바로 입어요"}</span></div>
              <fieldset className={styles.fieldset} disabled={pending}>
                <legend className={styles.srOnly}>{TABS.find(item => item.id === tab)?.name} 선택</legend>
                {tab === "looks" ? <div className={styles.presetGrid}>
                  {LOOK_PRESETS.map(preset => <label key={preset.id} className={`${styles.preset} ${selectedPreset?.id === preset.id ? styles.selected : ""}`}>
                    <input className={styles.radio} type="radio" name="preset" value={preset.id} checked={selectedPreset?.id === preset.id} onChange={() => { setDraft({ ...preset.look }); setError(""); }} />
                    <div className={styles.presetIllustration} style={{ background: `${CLOTH_COLORS[preset.look.topColor].fill}35` }}><PaperDoll look={preset.look} size={130} /></div>
                    <span className={styles.cardText}><strong>{preset.name}</strong><small>{preset.description}</small></span>
                    {selectedPreset?.id === preset.id && <span className={styles.check} aria-hidden="true">✓</span>}
                  </label>)}
                </div> : <>
                  {tab === "hair" && draft.face !== "human" && <p className={styles.hint}>헤어나 머리색을 고르면 사람 얼굴로 바뀌어요.</p>}
                  {tab === "bottom" && draft.top === "dress" && <p className={styles.hint}>하의나 색상을 고르면 원피스 대신 맨투맨을 입어요.</p>}
                  <div className={styles.itemGrid}>
                    {LOOK_OPTIONS[tab].map(value => {
                      const preview = { ...draft, [tab]: value,
                        ...(tab === "hair" ? { face: "human" as const } : {}),
                        ...(tab === "bottom" && draft.top === "dress" ? { top: "sweatshirt" as const } : {}),
                      } as PaperDollLook;
                      const selected = draft[tab] === value && !(tab === "hair" && draft.face !== "human");
                      return <label key={value} className={`${styles.item} ${selected ? styles.selected : ""}`}>
                        <input type="radio" className={styles.radio} name={tab} value={value} checked={selected} onChange={() => change(tab, value)} />
                        <div className={styles.itemIllustration}><PaperDoll look={preview} size={124} /></div>
                        <strong>{LOOK_LABELS[value]}</strong>{selected && <span className={styles.check} aria-hidden="true">✓</span>}
                      </label>;
                    })}
                  </div>
                  {tab === "face" && <>
                    <fieldset className={styles.subFieldset}><legend>표정</legend><div className={styles.chips}>
                      {LOOK_OPTIONS.eyes.map(value => <label key={value} className={`${styles.chip} ${draft.eyes === value ? styles.selected : ""}`}><input type="radio" className={styles.radio} name="eyes" value={value} checked={draft.eyes === value} onChange={() => change("eyes", value)} />{LOOK_LABELS[value]}</label>)}
                    </div></fieldset>
                    {draft.face === "human" && <ColorChoices title="피부색" field="skin" options={SKIN_COLORS} selected={draft.skin} onChange={value => change("skin", value as PaperDollLook["skin"])} />}
                  </>}
                  {tab === "hair" && <ColorChoices title="머리색" field="hairColor" options={HAIR_COLORS} selected={draft.hairColor} onChange={value => change("hairColor", value as PaperDollLook["hairColor"])} />}
                  {colorField && (tab !== "hat" || draft.hat !== "none") && <ColorChoices title="색 고르기" field={colorField} options={CLOTH_COLORS} selected={draft[colorField]} onChange={value => change(colorField, value as PaperDollLook[typeof colorField])} />}
                </>}
              </fieldset>
            </div>
          </section>
        </div>
        <footer className={styles.footer}>
          <div className={styles.saveMessage} aria-live="polite">{error ? <span role="alert" className={styles.error}>{error}</span> : <><strong>{pending ? "코디를 저장하고 있어요…" : "준비됐으면 친구들을 만나러!"}</strong><span>아바타는 언제든 다시 바꿀 수 있어요.</span></>}</div>
          <button type="button" className={styles.save} onClick={save} disabled={pending} aria-busy={pending}>{pending ? "저장 중…" : adminMode ? "미리보기 적용" : "이렇게 입을래"}<span aria-hidden="true"> →</span></button>
        </footer>
        {confirmLeave && <div className={styles.confirmBackdrop}>
          <div ref={confirmRef} role="alertdialog" aria-modal="true" aria-labelledby={`${titleId}-leave`} className={styles.confirm}>
            <span aria-hidden="true" className={styles.confirmIcon}>✦</span><h3 id={`${titleId}-leave`}>코디를 저장하지 않고 나갈까요?</h3><p>아직 저장하지 않은 꾸미기는 사라져요.</p>
            <button type="button" className={styles.save} onClick={() => { setConfirmLeave(false); closeButtonRef.current?.focus(); }}>계속 꾸미기</button>
            <button type="button" className={styles.discard} onClick={onClose}>저장하지 않고 나가기</button>
          </div>
        </div>}
      </div>
    </div>, document.body,
  );
}

function ColorChoices({ title, field, options, selected, onChange }: {
  title: string; field: string; options: Record<string, { name: string; fill: string }>;
  selected: string; onChange: (value: string) => void;
}) {
  return <fieldset className={styles.subFieldset}><legend>{title}<span>{options[selected]?.name}</span></legend>
    <div className={styles.swatches}>{Object.entries(options).map(([value, color]) => <label key={value} title={color.name} className={`${styles.swatch} ${selected === value ? styles.selectedSwatch : ""}`}>
      <input type="radio" className={styles.radio} name={field} value={value} checked={selected === value} onChange={() => onChange(value)} />
      <span style={{ backgroundColor: color.fill }} aria-hidden="true">{selected === value ? "✓" : ""}</span><span className={styles.srOnly}>{color.name}</span>
    </label>)}</div>
  </fieldset>;
}
