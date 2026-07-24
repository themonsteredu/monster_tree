"use client";

import { useEffect, useRef, useState } from "react";
import { BlockWorldAudio } from "./blockWorldAudio";

const MUTE_STORAGE_KEY = "block-math-quest-muted";

function readStageIndex() {
  if (typeof document === "undefined") return 0;
  const match = document.body.innerText.match(/WORLD\s*(\d+)\s*\/\s*\d+/i);
  return match ? Math.max(0, Number(match[1]) - 1) : 0;
}

function readCubeCount(text: string) {
  const match = text.match(/CUBE\s*×\s*(\d+)/i);
  return match ? Number(match[1]) : 0;
}

function readHeartCount(text: string) {
  return (text.match(/♥/g) ?? []).length;
}

function countActivePowerBadges() {
  if (typeof document === "undefined") return 0;
  const labels = ["성장 방어", "에너지탄", "무적 수정"];
  return Array.from(document.querySelectorAll("div")).filter((element) => {
    const text = element.textContent?.trim() ?? "";
    return labels.some((label) => text === label || text.endsWith(label))
      && element.className.includes("bg-[#244f55]");
  }).length;
}

export function BlockWorldSoundLayer() {
  const audioRef = useRef<BlockWorldAudio | null>(null);
  const mutedRef = useRef(false);
  const startedRef = useRef(false);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const storedMuted = window.localStorage.getItem(MUTE_STORAGE_KEY) === "1";
    mutedRef.current = storedMuted;
    setMuted(storedMuted);

    const audio = new BlockWorldAudio();
    audio.setMuted(storedMuted);
    audioRef.current = audio;

    let lastWorld = readStageIndex();
    let lastCubeCount = readCubeCount(document.body.innerText);
    let lastHeartCount = readHeartCount(document.body.innerText);
    let lastPowerCount = countActivePowerBadges();
    let portalVisible = false;
    let correctVisible = false;
    let wrongVisible = false;
    let clearVisible = false;
    let failedVisible = false;
    let scanFrame = 0;

    const startAudio = () => {
      startedRef.current = true;
      audio.setMuted(mutedRef.current);
      void audio.start(readStageIndex()).then(() => audio.resumeMusic());
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || target.closest("[data-sound-toggle='true']")) return;
      const button = target.closest("button");
      if (!button) return;
      const label = button.getAttribute("aria-label") ?? "";
      const text = button.textContent?.trim() ?? "";
      const shouldUnlock = text.includes("START QUEST")
        || text === "RETRY"
        || label === "점프"
        || label === "에너지탄 발사";

      if (shouldUnlock && !mutedRef.current) startAudio();
      if (label === "점프") audio.playSfx("jump");
      if (label === "에너지탄 발사" && !button.hasAttribute("disabled")) audio.playSfx("shoot");
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (!mutedRef.current && (event.key === "Enter" || event.key === " " || key === "a" || key === "d" || key === "f" || key === "x")) {
        startAudio();
      }
      if (event.key === "ArrowUp" || event.key === " ") audio.playSfx("jump");
      if (key === "f" || key === "x") audio.playSfx("shoot");
    };

    const scan = () => {
      scanFrame = 0;
      const text = document.body.innerText;
      const nextWorld = readStageIndex();
      if (nextWorld !== lastWorld) {
        lastWorld = nextWorld;
        audio.setStage(nextWorld);
        if (startedRef.current) audio.resumeMusic();
      }

      const nextCubeCount = readCubeCount(text);
      if (nextCubeCount > lastCubeCount) audio.playSfx("coin");
      lastCubeCount = nextCubeCount;

      const nextHeartCount = readHeartCount(text);
      if (nextHeartCount < lastHeartCount) audio.playSfx("damage");
      lastHeartCount = nextHeartCount;

      const nextPowerCount = countActivePowerBadges();
      if (nextPowerCount > lastPowerCount) audio.playSfx("item");
      lastPowerCount = nextPowerCount;

      const nextPortalVisible = text.includes("PORTAL OPEN!");
      if (nextPortalVisible && !portalVisible) {
        audio.pauseMusic();
        audio.playSfx("portal");
      }
      if (!nextPortalVisible && portalVisible && startedRef.current) audio.resumeMusic();
      portalVisible = nextPortalVisible;

      const nextCorrectVisible = text.includes("정답! 다음 블록 지역으로 이동!")
        || text.includes("정답! 모든 포털을 열었어요!");
      if (nextCorrectVisible && !correctVisible) audio.playSfx("correct");
      correctVisible = nextCorrectVisible;

      const nextWrongVisible = text.includes("다시 골라보세요!");
      if (nextWrongVisible && !wrongVisible) audio.playSfx("wrong");
      wrongVisible = nextWrongVisible;

      const nextClearVisible = text.includes("QUEST COMPLETE!");
      if (nextClearVisible && !clearVisible) {
        audio.stop();
        audio.playSfx("clear");
      }
      clearVisible = nextClearVisible;

      const nextFailedVisible = text.includes("QUEST FAILED");
      if (nextFailedVisible && !failedVisible) {
        audio.stop();
        audio.playSfx("gameOver");
      }
      failedVisible = nextFailedVisible;
    };

    const observer = new MutationObserver(() => {
      if (scanFrame) return;
      scanFrame = window.requestAnimationFrame(scan);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "disabled"],
    });

    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);

    return () => {
      observer.disconnect();
      if (scanFrame) window.cancelAnimationFrame(scanFrame);
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      audio.dispose();
      audioRef.current = null;
    };
  }, []);

  const toggleMuted = () => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    window.localStorage.setItem(MUTE_STORAGE_KEY, next ? "1" : "0");
    const audio = audioRef.current;
    if (!audio) return;
    audio.setMuted(next);
    if (!next && !document.body.innerText.includes("START QUEST")) {
      startedRef.current = true;
      void audio.start(readStageIndex()).then(() => audio.resumeMusic());
      audio.playSfx("item");
    }
  };

  return (
    <button
      type="button"
      data-sound-toggle="true"
      onClick={toggleMuted}
      aria-label={muted ? "게임 소리 켜기" : "게임 소리 끄기"}
      className="fixed right-2 top-[calc(0.5rem+env(safe-area-inset-top))] z-[180] grid h-10 w-10 place-items-center border-2 border-[#d7e0e7] bg-[#35404a] text-lg text-white shadow-[3px_3px_0_#080b0e] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_#080b0e]"
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
}
