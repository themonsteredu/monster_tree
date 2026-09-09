"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AVAILABLE_LOOK_OPTIONS, CLOTH_COLORS, HAIR_COLORS, LOOK_LABELS, LOOK_OPTIONS, LOOK_PRESETS, SKIN_COLORS,
  TOP_META, changeLook, isDressTop, isLookAvailable, normalizeLook, type LookField, type PaperDollLook,
} from "@/lib/avatar-v2";
import { PaperDoll, WardrobeItemArt } from "./PaperDoll";
import styles from "./Wardrobe.module.css";

type Tab = "looks" | "face" | "hair" | "top" | "bottom" | "shoes" | "hat" | "bag" | "glasses" | "neckwear";
const TAB_NAMES: Record<Tab, string> = {
  looks: "추천 코디", face: "얼굴", hair: "헤어", top: "상의 · 원피스", bottom: "하의", shoes: "신발",
  hat: "모자", bag: "가방", glasses: "안경", neckwear: "목소품",
};
const SECTIONS: { id: string; name: string; tabs: Tab[] }[] = [
  { id: "looks", name: "코디", tabs: ["looks"] },
  { id: "appearance", name: "얼굴·헤어", tabs: ["face", "hair"] },
  { id: "clothes", name: "옷·신발", tabs: ["top", "bottom", "shoes"] },
  { id: "gear", name: "가방·모자", tabs: ["bag", "hat"] },
  { id: "accessories", name: "액세서리", tabs: ["glasses", "neckwear"] },
];
const COLOR_FIELD: Partial<Record<Tab, LookField>> = {
  top: "topColor", bottom: "bottomColor", shoes: "shoeColor", hat: "hatColor",
  bag: "bagColor", glasses: "glassesColor", neckwear: "neckwearColor",
};
const TOP_GROUPS = [
  { id: "all", name: "전체" }, { id: "everyday", name: "일상" }, { id: "sport", name: "스포츠" },
  { id: "outerwear", name: "겉옷" }, { id: "dress", name: "원피스" },
] as const;
const REMOVABLE = new Set<Tab>(["hat", "bag", "glasses", "neckwear"]);
const FEATURED_PRESETS = new Set(["soccer", "royal", "explorer", "daytrip"]);
const PAGE_SIZE = 12;
const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), [href], [tabindex="0"]:not(:disabled)';

export function Wardrobe({ open, initial, onClose, onSave, adminMode = false }: {
  open: boolean; initial: PaperDollLook; onClose: () => void;
  onSave: (look: PaperDollLook) => Promise<void> | void; adminMode?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState(() => normalizeLook(initial));
  const [tab, setTab] = useState<Tab>("looks");
  const [topGroup, setTopGroup] = useState<(typeof TOP_GROUPS)[number]["id"]>("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
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
    setTab("looks"); setTopGroup("all"); setVisibleCount(PAGE_SIZE); setError(""); setConfirmLeave(false);
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
    setDraft(current => changeLook(current, field, value));
  };
  const selectTab = (next: Tab) => {
    setTab(next); setTopGroup("all"); setVisibleCount(PAGE_SIZE);
    panelRef.current?.scrollTo({ top: 0 });
  };
  const save = async () => {
    if (savingRef.current) return;
    if (!isLookAvailable(draft)) {
      setError("아직 준비 중인 아이템이 있어요. 다른 아이템으로 바꾼 뒤 저장해 주세요.");
      return;
    }
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
  const section = SECTIONS.find(item => item.tabs.includes(tab))!;
  const selectedPreset = LOOK_PRESETS.find(preset => JSON.stringify(preset.look) === JSON.stringify(draft));
  const colorField = COLOR_FIELD[tab];
  const wardrobeOptions = AVAILABLE_LOOK_OPTIONS;
  const options = tab === "looks" ? [] : wardrobeOptions[tab].filter(value =>
    value !== "none" && (tab !== "top" || topGroup === "all" || TOP_META[value as PaperDollLook["top"]].group === topGroup));
  const removable = REMOVABLE.has(tab);
  const isEmptySlot = tab !== "looks" && draft[tab] === "none";
  const visiblePresets = LOOK_PRESETS.filter(preset => isLookAvailable(preset.look))
    .sort((a, b) => Number(FEATURED_PRESETS.has(b.id)) - Number(FEATURED_PRESETS.has(a.id)));
  return createPortal(
    <div className={styles.backdrop} onClick={event => { if (event.target === event.currentTarget) requestClose(); }}>
      <div className={styles.modal} ref={modalRef} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className={styles.header}>
          <div><span className={styles.eyebrow}>나의 아지트 · 아바타</span><h2 id={titleId}>오늘은 어떻게 입을까?</h2></div>
          <button type="button" className={styles.close} ref={closeButtonRef} onClick={requestClose} disabled={pending} aria-label="옷장 닫기">×</button>
        </header>
        {adminMode && <p className={styles.admin}>🛠 테스트 모드 — 기록 저장 안 됨</p>}
        <div className={styles.body}>
          <section className={styles.preview} aria-label="선택한 아바타 미리보기">
            <div className={styles.mirror}><PaperDoll look={draft} size={320} className={styles.largeDoll} /></div>
            <div className={styles.previewCaption}><strong>{selectedPreset?.name ?? "나만의 코디"}</strong></div>
          </section>
          <section className={styles.closet} aria-label="아바타 꾸미기">
            <div className={styles.tabs} role="tablist" aria-label="꾸미기 종류">
              {SECTIONS.map((item, index) => <button key={item.id} type="button" role="tab"
                id={`${tabPrefix}-${item.id}`} aria-selected={section.id === item.id} aria-controls={`${tabPrefix}-panel`}
                tabIndex={section.id === item.id ? 0 : -1} disabled={pending}
                className={`${styles.tab} ${section.id === item.id ? styles.activeTab : ""}`}
                onClick={() => selectTab(item.tabs[0])} onKeyDown={event => {
                  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                  event.preventDefault();
                  const next = event.key === "Home" ? 0 : event.key === "End" ? SECTIONS.length - 1
                    : (index + (event.key === "ArrowRight" ? 1 : -1) + SECTIONS.length) % SECTIONS.length;
                  selectTab(SECTIONS[next].tabs[0]);
                  document.getElementById(`${tabPrefix}-${SECTIONS[next].id}`)?.focus();
                }}>{item.name}</button>)}
            </div>
            <div id={`${tabPrefix}-panel`} ref={panelRef} role="tabpanel" aria-labelledby={`${tabPrefix}-${section.id}`} className={styles.panel}>
              <div className={styles.panelHeading}>
                {section.tabs.length > 1 ? <select className={styles.slotSelect} aria-label={`${section.name} 세부 부위`} value={tab} disabled={pending}
                  onChange={event => selectTab(event.target.value as Tab)}>
                  {section.tabs.map(item => <option key={item} value={item}>{TAB_NAMES[item]}</option>)}
                </select> : <h3>{TAB_NAMES[tab]}</h3>}
                {tab === "top" && <select className={styles.styleSelect} aria-label="상의 스타일" value={topGroup} disabled={pending}
                  onChange={event => { setTopGroup(event.target.value as typeof topGroup); setVisibleCount(PAGE_SIZE); }}>
                  {TOP_GROUPS.filter(group => group.id === "all" || wardrobeOptions.top.some(value => TOP_META[value].group === group.id)).map(group =>
                    <option key={group.id} value={group.id}>{group.name === "전체" ? "모든 스타일" : group.name}</option>)}
                </select>}
                {removable ? <button type="button" className={styles.removeItem} disabled={pending || isEmptySlot}
                  onClick={() => change(tab as "hat" | "bag" | "glasses" | "neckwear", "none")}>{isEmptySlot ? "착용 안 함" : "벗기"}</button>
                  : tab !== "top" && <span>{tab === "looks" ? "한 번에 갈아입기" : `${options.length}가지`}</span>}
              </div>
              <fieldset className={styles.fieldset} disabled={pending}>
                <legend className={styles.srOnly}>{TAB_NAMES[tab]} 선택</legend>
                {tab === "looks" ? <div className={styles.presetGrid}>
                  {visiblePresets.slice(0, visibleCount).map(preset => <label key={preset.id} className={`${styles.preset} ${selectedPreset?.id === preset.id ? styles.selected : ""}`}>
                    <input className={styles.radio} type="radio" name="preset" value={preset.id} checked={selectedPreset?.id === preset.id} onChange={() => { setDraft({ ...preset.look }); setError(""); }} />
                    <div className={styles.presetIllustration} style={{ background: `${CLOTH_COLORS[preset.look.topColor].fill}35` }}><PaperDoll look={preset.look} size={130} /></div>
                    <span className={styles.cardText}><strong>{preset.name}</strong><small>{preset.description}</small></span>
                    {selectedPreset?.id === preset.id && <span className={styles.check} aria-hidden="true">✓</span>}
                  </label>)}
                  {visiblePresets.length > visibleCount && <button type="button" className={styles.showMore} onClick={() => setVisibleCount(count => count + PAGE_SIZE)}>코디 더 보기</button>}
                </div> : <>
                  {tab === "hair" && draft.face !== "human" && <p className={styles.hint}>헤어나 머리색을 고르면 사람 얼굴로 바뀌어요.</p>}
                  {tab === "bottom" && isDressTop(draft.top) && <p className={styles.hint}>하의나 색상을 고르면 원피스 대신 맨투맨을 입어요.</p>}
                  <div className={styles.itemGrid}>
                    {options.slice(0, visibleCount).map(value => {
                      const preview = changeLook(draft, tab, value as PaperDollLook[typeof tab]);
                      const selected = draft[tab] === value && !(tab === "hair" && draft.face !== "human") && !(tab === "bottom" && isDressTop(draft.top));
                      return <label key={value} className={`${styles.item} ${selected ? styles.selected : ""}`}>
                        <input type="radio" className={styles.radio} name={tab} value={value} checked={selected} onChange={() => change(tab, value as PaperDollLook[typeof tab])} />
                        <div className={styles.itemIllustration}><WardrobeItemArt look={preview} slot={tab} size={96} /></div>
                        <strong>{LOOK_LABELS[value]}</strong>{selected && <span className={styles.check} aria-hidden="true">✓</span>}
                      </label>;
                    })}
                  </div>
                  {options.length === 0 && <p className={styles.emptyItems}>새 아이템을 준비하고 있어요.<br />다른 부위부터 자유롭게 꾸며 보세요.</p>}
                  {options.length > visibleCount && <button type="button" className={styles.showMore} onClick={() => setVisibleCount(count => count + PAGE_SIZE)}>
                    아이템 더 보기 <span>({visibleCount}/{options.length})</span></button>}
                  {tab === "face" && <>
                    <fieldset className={styles.subFieldset}><legend>표정</legend><div className={styles.chips}>
                      {LOOK_OPTIONS.eyes.map(value => <label key={value} className={`${styles.chip} ${draft.eyes === value ? styles.selected : ""}`}><input type="radio" className={styles.radio} name="eyes" value={value} checked={draft.eyes === value} onChange={() => change("eyes", value)} />{LOOK_LABELS[value]}</label>)}
                    </div></fieldset>
                    {draft.face === "human" && <ColorChoices title="피부색" field="skin" options={SKIN_COLORS} selected={draft.skin} onChange={value => change("skin", value as PaperDollLook["skin"])} />}
                  </>}
                  {tab === "hair" && <ColorChoices title="머리색" field="hairColor" options={HAIR_COLORS} selected={draft.hairColor} onChange={value => change("hairColor", value as PaperDollLook["hairColor"])} />}
                  {colorField && !isEmptySlot && options.length > 0 && <ColorChoices title="색 고르기" field={colorField} options={CLOTH_COLORS} selected={tab === "bottom" && isDressTop(draft.top) ? "" : draft[colorField]} onChange={value => change(colorField, value as PaperDollLook[typeof colorField])} />}
                </>}
              </fieldset>
            </div>
          </section>
        </div>
        <footer className={styles.footer}>
          <div className={styles.saveMessage} aria-live="polite">{error ? <span role="alert" className={styles.error}>{error}</span> : <strong>{pending ? "코디를 저장하고 있어요…" : "언제든 다시 바꿀 수 있어요."}</strong>}</div>
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
