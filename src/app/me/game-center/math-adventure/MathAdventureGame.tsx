"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  recordMathAdventurePlayAction,
  type PlayResult,
} from "../actions";
import { drawBlockWorld } from "./blockWorldArt";
import {
  GRAVITY,
  JUMP_SPEED,
  MAX_SCORE,
  MOVE_SPEED,
  PLAYER_H,
  PLAYER_W,
  STARTING_LIVES,
  STAGES,
  VIEW_H,
  VIEW_W,
  clamp,
  intersects,
  type Coin,
  type Enemy,
  type ItemDrop,
  type MysteryBox,
  type Phase,
  type Player,
  type Projectile,
  type Rect,
} from "./blockWorldData";

type Props = {
  remainingBefore: number;
  monsterNickname: string;
  adminMode?: boolean;
  homeHref?: string;
};

type Controls = {
  left: boolean;
  right: boolean;
  jumpQueued: boolean;
  fireQueued: boolean;
};

const EMPTY_CONTROLS: Controls = {
  left: false,
  right: false,
  jumpQueued: false,
  fireQueued: false,
};

function asSolidRect(box: MysteryBox): Rect {
  return { x: box.x, y: box.y, w: 16, h: 16, kind: "wood" };
}

export function MathAdventureGame({
  remainingBefore,
  monsterNickname,
  adminMode = false,
  homeHref = "/me/game-center",
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef<Phase>("ready");
  const stageIndexRef = useRef(0);
  const playerRef = useRef<Player>({
    x: 36,
    y: 170,
    vx: 0,
    vy: 0,
    w: PLAYER_W,
    h: PLAYER_H,
    onGround: false,
    facing: 1,
  });
  const coinsRef = useRef<Coin[]>([]);
  const enemiesRef = useRef<Enemy[]>([]);
  const boxesRef = useRef<MysteryBox[]>([]);
  const itemsRef = useRef<ItemDrop[]>([]);
  const projectilesRef = useRef<Projectile[]>([]);
  const controlsRef = useRef<Controls>({ ...EMPTY_CONTROLS });
  const jumpCountRef = useRef(0);
  const cameraRef = useRef(0);
  const scoreRef = useRef(0);
  const livesRef = useRef(STARTING_LIVES);
  const coinCountRef = useRef(0);
  const startedAtRef = useRef(0);
  const lastHudPaintRef = useRef(0);
  const invincibleUntilRef = useRef(0);
  const armoredRef = useRef(false);
  const hasBlasterRef = useRef(false);
  const nextEntityIdRef = useRef(1);
  const lastShotAtRef = useRef(0);
  const finishingRef = useRef(false);
  const submitResultRef = useRef<(cleared: boolean) => void>(() => undefined);

  const [phase, setPhase] = useState<Phase>("ready");
  const [stageIndex, setStageIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(STARTING_LIVES);
  const [coinCount, setCoinCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [quizFeedback, setQuizFeedback] = useState<"correct" | "wrong" | null>(null);
  const [cleared, setCleared] = useState(false);
  const [result, setResult] = useState<PlayResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [armored, setArmored] = useState(false);
  const [hasBlaster, setHasBlaster] = useState(false);
  const [invincibleActive, setInvincibleActive] = useState(false);

  const currentStage = STAGES[stageIndex];
  const hearts = useMemo(
    () => Array.from({ length: STARTING_LIVES }, (_, index) => (index < lives ? "♥" : "♡")),
    [lives],
  );

  const syncPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const addScore = useCallback((amount: number) => {
    scoreRef.current = clamp(scoreRef.current + amount, 0, MAX_SCORE);
    setScore(scoreRef.current);
  }, []);

  const loadStage = useCallback((index: number, startImmediately = true) => {
    const stage = STAGES[index];
    stageIndexRef.current = index;
    setStageIndex(index);
    playerRef.current = {
      x: stage.startX,
      y: stage.startY,
      vx: 0,
      vy: 0,
      w: PLAYER_W,
      h: PLAYER_H,
      onGround: false,
      facing: 1,
    };
    coinsRef.current = stage.coins.map((coin) => ({ ...coin, collected: false }));
    enemiesRef.current = stage.enemies.map((enemy) => ({
      ...enemy,
      vx: enemy.speed,
      alive: true,
    }));
    boxesRef.current = stage.boxes.map((box) => ({ ...box, used: false, bumpUntil: 0 }));
    itemsRef.current = [];
    projectilesRef.current = [];
    cameraRef.current = 0;
    controlsRef.current = { ...EMPTY_CONTROLS };
    jumpCountRef.current = 0;
    setQuizFeedback(null);
    if (startImmediately) syncPhase("playing");
  }, [syncPhase]);

  const submitResult = useCallback(async (didClear: boolean) => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    controlsRef.current = { ...EMPTY_CONTROLS };
    const seconds = Math.max(1, Math.floor((Date.now() - startedAtRef.current) / 1000));
    const clearBonus = didClear ? 900 : 0;
    const lifeBonus = didClear ? livesRef.current * 120 : 0;
    const powerBonus = didClear
      ? (armoredRef.current ? 120 : 0) + (hasBlasterRef.current ? 180 : 0)
      : 0;
    const timeBonus = didClear ? Math.max(0, 420 - seconds) : 0;
    const finalScore = clamp(
      Math.floor(scoreRef.current + clearBonus + lifeBonus + powerBonus + timeBonus),
      0,
      MAX_SCORE,
    );
    scoreRef.current = finalScore;
    setScore(finalScore);
    setElapsed(seconds);
    setCleared(didClear);
    setSubmitting(true);
    syncPhase("over");

    if (adminMode) {
      setSubmitting(false);
      return;
    }

    try {
      const saved = await recordMathAdventurePlayAction({ score: finalScore });
      setResult(saved);
    } catch {
      setResult({
        ok: false,
        reason: "invalid",
        message: "네트워크 오류로 기록을 저장하지 못했어요.",
      });
    } finally {
      setSubmitting(false);
    }
  }, [adminMode, syncPhase]);

  useEffect(() => {
    submitResultRef.current = (didClear: boolean) => {
      void submitResult(didClear);
    };
  }, [submitResult]);

  const startGame = useCallback(() => {
    finishingRef.current = false;
    scoreRef.current = 0;
    livesRef.current = STARTING_LIVES;
    coinCountRef.current = 0;
    armoredRef.current = false;
    hasBlasterRef.current = false;
    invincibleUntilRef.current = 0;
    nextEntityIdRef.current = 1;
    lastShotAtRef.current = 0;
    startedAtRef.current = Date.now();
    setScore(0);
    setLives(STARTING_LIVES);
    setCoinCount(0);
    setElapsed(0);
    setCleared(false);
    setResult(null);
    setSubmitting(false);
    setArmored(false);
    setHasBlaster(false);
    setInvincibleActive(false);
    loadStage(0, true);
  }, [loadStage]);

  const answerStageQuiz = useCallback((choice: number) => {
    if (quizFeedback) return;
    const stage = STAGES[stageIndexRef.current];
    if (choice !== stage.quiz.answer) {
      setQuizFeedback("wrong");
      window.setTimeout(() => setQuizFeedback(null), 650);
      return;
    }

    setQuizFeedback("correct");
    addScore(250);
    window.setTimeout(() => {
      const next = stageIndexRef.current + 1;
      if (next >= STAGES.length) submitResultRef.current(true);
      else loadStage(next, true);
    }, 700);
  }, [addScore, loadStage, quizFeedback]);

  const pressControl = (key: "left" | "right") => {
    if (phaseRef.current !== "playing") return;
    controlsRef.current[key] = true;
  };

  const releaseControl = (key: "left" | "right") => {
    controlsRef.current[key] = false;
  };

  const queueJump = () => {
    if (phaseRef.current === "playing") controlsRef.current.jumpQueued = true;
  };

  const queueFire = () => {
    if (phaseRef.current === "playing" && hasBlasterRef.current) {
      controlsRef.current.fireQueued = true;
    }
  };

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (phaseRef.current === "ready" && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        startGame();
        return;
      }
      if (phaseRef.current !== "playing") return;
      const key = event.key.toLowerCase();
      if (event.key === "ArrowLeft" || key === "a") {
        event.preventDefault();
        controlsRef.current.left = true;
      }
      if (event.key === "ArrowRight" || key === "d") {
        event.preventDefault();
        controlsRef.current.right = true;
      }
      if (event.key === "ArrowUp" || event.key === " ") {
        event.preventDefault();
        controlsRef.current.jumpQueued = true;
      }
      if (key === "f" || key === "x") {
        event.preventDefault();
        controlsRef.current.fireQueued = true;
      }
    };
    const up = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (event.key === "ArrowLeft" || key === "a") controlsRef.current.left = false;
      if (event.key === "ArrowRight" || key === "d") controlsRef.current.right = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [startGame]);

  useEffect(() => {
    loadStage(0, false);
  }, [loadStage]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    let animationFrame = 0;
    let lastFrame = 0;

    const getCollisionRects = (stageIndexValue: number) => {
      const stage = STAGES[stageIndexValue];
      const terrain = stage.solids.filter((solid) => solid.kind !== "lava");
      const boxes = boxesRef.current.map(asSolidRect);
      return [...terrain, ...boxes];
    };

    const resetPosition = () => {
      const stage = STAGES[stageIndexRef.current];
      playerRef.current.x = stage.startX;
      playerRef.current.y = stage.startY;
      playerRef.current.vx = 0;
      playerRef.current.vy = 0;
      cameraRef.current = 0;
      jumpCountRef.current = 0;
      itemsRef.current = [];
      projectilesRef.current = [];
    };

    const loseLife = (now: number) => {
      const nextLives = livesRef.current - 1;
      livesRef.current = nextLives;
      setLives(nextLives);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(90);
      if (nextLives <= 0) {
        submitResultRef.current(false);
        return;
      }
      invincibleUntilRef.current = now + 1300;
      setInvincibleActive(true);
      resetPosition();
    };

    const damagePlayer = (now: number, fall = false) => {
      if (!fall && now < invincibleUntilRef.current) return;
      if (!fall && hasBlasterRef.current) {
        hasBlasterRef.current = false;
        setHasBlaster(false);
        invincibleUntilRef.current = now + 1100;
        setInvincibleActive(true);
        playerRef.current.vx = -playerRef.current.facing * 95;
        playerRef.current.vy = -145;
        return;
      }
      if (!fall && armoredRef.current) {
        armoredRef.current = false;
        setArmored(false);
        invincibleUntilRef.current = now + 1100;
        setInvincibleActive(true);
        playerRef.current.vx = -playerRef.current.facing * 95;
        playerRef.current.vy = -145;
        return;
      }
      loseLife(now);
    };

    const spawnBoxItem = (box: MysteryBox, now: number) => {
      if (box.used) return;
      box.used = true;
      box.bumpUntil = now + 190;
      itemsRef.current.push({
        id: nextEntityIdRef.current++,
        x: box.x,
        y: box.y - 14,
        vx: box.item === "growth" ? 34 : 0,
        vy: -120,
        kind: box.item,
        active: true,
      });
      addScore(40);
    };

    const shoot = (now: number) => {
      if (!hasBlasterRef.current || now - lastShotAtRef.current < 320) return;
      const player = playerRef.current;
      lastShotAtRef.current = now;
      projectilesRef.current.push({
        id: nextEntityIdRef.current++,
        x: player.x + (player.facing > 0 ? player.w + 2 : -7),
        y: player.y + 11,
        vx: player.facing * 245,
        active: true,
      });
    };

    const collectItem = (item: ItemDrop, now: number) => {
      item.active = false;
      if (item.kind === "growth") {
        armoredRef.current = true;
        setArmored(true);
        addScore(150);
      } else if (item.kind === "blaster") {
        armoredRef.current = true;
        hasBlasterRef.current = true;
        setArmored(true);
        setHasBlaster(true);
        addScore(190);
      } else {
        invincibleUntilRef.current = now + 7000;
        setInvincibleActive(true);
        addScore(220);
      }
    };

    const update = (now: number, dt: number) => {
      if (phaseRef.current !== "playing") return;
      const stage = STAGES[stageIndexRef.current];
      const player = playerRef.current;
      const previous = { x: player.x, y: player.y, w: player.w, h: player.h };
      const controls = controlsRef.current;
      const collisionRects = getCollisionRects(stageIndexRef.current);

      if (controls.left === controls.right) player.vx *= Math.pow(0.0008, dt);
      else if (controls.left) {
        player.vx = -MOVE_SPEED;
        player.facing = -1;
      } else {
        player.vx = MOVE_SPEED;
        player.facing = 1;
      }

      if (controls.jumpQueued) {
        controls.jumpQueued = false;
        if (player.onGround) {
          player.vy = -JUMP_SPEED;
          player.onGround = false;
          jumpCountRef.current = 1;
        } else if (jumpCountRef.current < 2) {
          player.vy = -JUMP_SPEED * 0.92;
          jumpCountRef.current = 2;
        }
      }
      if (controls.fireQueued) {
        controls.fireQueued = false;
        shoot(now);
      }

      player.vy = Math.min(player.vy + GRAVITY * dt, 550);
      player.x += player.vx * dt;
      player.x = clamp(player.x, 0, stage.width - player.w);
      for (const solid of collisionRects) {
        if (!intersects(player, solid)) continue;
        if (player.vx > 0 && previous.x + previous.w <= solid.x + 3) {
          player.x = solid.x - player.w;
          player.vx = 0;
        } else if (player.vx < 0 && previous.x >= solid.x + solid.w - 3) {
          player.x = solid.x + solid.w;
          player.vx = 0;
        }
      }

      player.y += player.vy * dt;
      player.onGround = false;
      for (const solid of collisionRects) {
        if (!intersects(player, solid)) continue;
        const previousBottom = previous.y + previous.h;
        if (player.vy >= 0 && previousBottom <= solid.y + 5) {
          player.y = solid.y - player.h;
          player.vy = 0;
          player.onGround = true;
          jumpCountRef.current = 0;
        } else if (player.vy < 0 && previous.y >= solid.y + solid.h - 5) {
          player.y = solid.y + solid.h;
          player.vy = 0;
          const hitBox = boxesRef.current.find(
            (box) => box.x === solid.x && box.y === solid.y,
          );
          if (hitBox) spawnBoxItem(hitBox, now);
        }
      }

      if (player.y > VIEW_H + 36) {
        damagePlayer(now, true);
        return;
      }
      for (const hazard of stage.solids) {
        if (hazard.kind === "lava" && intersects(player, hazard)) {
          damagePlayer(now, true);
          return;
        }
      }

      for (const coin of coinsRef.current) {
        if (coin.collected) continue;
        if (intersects(player, { x: coin.x - 5, y: coin.y - 7, w: 10, h: 14 })) {
          coin.collected = true;
          coinCountRef.current += 1;
          setCoinCount(coinCountRef.current);
          addScore(30);
        }
      }

      for (const item of itemsRef.current) {
        if (!item.active) continue;
        const beforeItem = { x: item.x, y: item.y, w: 16, h: 16 };
        item.vy = Math.min(item.vy + GRAVITY * 0.58 * dt, 320);
        item.x += item.vx * dt;
        for (const solid of collisionRects) {
          const itemBox = { x: item.x, y: item.y, w: 16, h: 16 };
          if (!intersects(itemBox, solid)) continue;
          if (item.vx > 0 && beforeItem.x + 16 <= solid.x + 3) {
            item.x = solid.x - 16;
            item.vx = -Math.abs(item.vx);
          } else if (item.vx < 0 && beforeItem.x >= solid.x + solid.w - 3) {
            item.x = solid.x + solid.w;
            item.vx = Math.abs(item.vx);
          }
        }
        item.y += item.vy * dt;
        for (const solid of collisionRects) {
          const itemBox = { x: item.x, y: item.y, w: 16, h: 16 };
          if (!intersects(itemBox, solid)) continue;
          if (item.vy >= 0 && beforeItem.y + 16 <= solid.y + 5) {
            item.y = solid.y - 16;
            item.vy = 0;
          }
        }
        if (item.y > VIEW_H + 40) item.active = false;
        if (item.active && intersects(player, { x: item.x, y: item.y, w: 16, h: 16 })) {
          collectItem(item, now);
        }
      }

      for (const projectile of projectilesRef.current) {
        if (!projectile.active) continue;
        projectile.x += projectile.vx * dt;
        if (projectile.x < 0 || projectile.x > stage.width) {
          projectile.active = false;
          continue;
        }
        const shotBox = { x: projectile.x, y: projectile.y, w: 7, h: 5 };
        if (collisionRects.some((solid) => intersects(shotBox, solid))) {
          projectile.active = false;
          continue;
        }
        for (const enemy of enemiesRef.current) {
          if (!enemy.alive) continue;
          if (intersects(shotBox, { x: enemy.x, y: enemy.y, w: 14, h: 14 })) {
            enemy.alive = false;
            projectile.active = false;
            addScore(120);
            break;
          }
        }
      }

      for (const enemy of enemiesRef.current) {
        if (!enemy.alive) continue;
        enemy.x += enemy.vx * dt;
        if (enemy.x <= enemy.minX) {
          enemy.x = enemy.minX;
          enemy.vx = Math.abs(enemy.speed);
        } else if (enemy.x >= enemy.maxX) {
          enemy.x = enemy.maxX;
          enemy.vx = -Math.abs(enemy.speed);
        }
        const enemyBox = { x: enemy.x, y: enemy.y, w: 14, h: 14 };
        if (!intersects(player, enemyBox)) continue;
        if (now < invincibleUntilRef.current) {
          enemy.alive = false;
          addScore(120);
          continue;
        }
        const previousBottom = previous.y + previous.h;
        if (player.vy > 35 && previousBottom <= enemy.y + 5) {
          enemy.alive = false;
          player.vy = -205;
          addScore(100);
        } else {
          damagePlayer(now, false);
          return;
        }
      }

      if (player.x + player.w >= stage.portalX + 18) {
        controlsRef.current = { ...EMPTY_CONTROLS };
        player.vx = 0;
        addScore(180);
        syncPhase("stageQuiz");
      }

      cameraRef.current = clamp(player.x - 112, 0, stage.width - VIEW_W);
      if (now - lastHudPaintRef.current > 200) {
        lastHudPaintRef.current = now;
        setElapsed(Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)));
        setInvincibleActive(now < invincibleUntilRef.current);
      }
    };

    const draw = (now: number) => {
      drawBlockWorld(ctx, {
        stage: STAGES[stageIndexRef.current],
        camera: cameraRef.current,
        player: playerRef.current,
        coins: coinsRef.current,
        enemies: enemiesRef.current,
        boxes: boxesRef.current,
        items: itemsRef.current,
        projectiles: projectilesRef.current,
        now,
        invincibleUntil: invincibleUntilRef.current,
        armored: armoredRef.current,
        hasBlaster: hasBlasterRef.current,
      });
    };

    const loop = (now: number) => {
      const previous = lastFrame || now;
      const dt = Math.min((now - previous) / 1000, 0.035);
      lastFrame = now;
      update(now, dt);
      draw(now);
      animationFrame = requestAnimationFrame(loop);
    };

    animationFrame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrame);
  }, [addScore, syncPhase]);

  const remainingAfter = result?.ok
    ? result.remainingToday
    : Math.max(remainingBefore - 1, 0);

  return (
    <main
      className="relative flex min-h-[100dvh] select-none flex-col overflow-hidden bg-[#111820] text-white"
      style={{ fontFamily: "'Galmuri11', 'Jua', monospace", touchAction: "none" }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] [background-size:16px_16px]" />

      {adminMode && (
        <div className="absolute inset-x-0 top-0 z-[120] flex justify-center">
          <span className="border-x-2 border-b-2 border-amber-200 bg-amber-500 px-3 py-1 text-[10px] font-bold text-slate-950">
            TEST MODE · 기록 저장 안 됨
          </span>
        </div>
      )}

      <header className={`relative z-50 mx-auto flex w-full max-w-3xl items-center justify-between gap-2 px-3 pb-2 ${adminMode ? "pt-9" : "pt-3"}`}>
        <Link
          href={homeHref}
          className="border-2 border-[#9aa6b2] bg-[#35404a] px-3 py-2 text-[10px] font-bold shadow-[3px_3px_0_#080b0e] active:translate-y-0.5"
        >
          ← GAME CENTER
        </Link>
        <div className="flex min-w-0 items-center gap-3 text-[9px] sm:text-xs">
          <Hud label="WORLD" value={`${stageIndex + 1}/${STAGES.length}`} />
          <Hud label="SCORE" value={score.toString().padStart(6, "0")} />
          <Hud label="CUBE" value={`×${coinCount}`} accent />
          <Hud label="TIME" value={String(elapsed)} />
        </div>
        <div className="whitespace-nowrap text-sm tracking-[-3px] text-rose-400">
          {hearts.join(" ")}
        </div>
      </header>

      <div className="relative z-20 mx-auto mb-2 flex min-h-6 w-full max-w-3xl items-center justify-center gap-2 px-3 text-[9px] sm:text-[10px]">
        <PowerBadge active={armored} label="성장 방어" icon="🍄" />
        <PowerBadge active={hasBlaster} label="에너지탄" icon="▰" />
        <PowerBadge active={invincibleActive} label="무적 수정" icon="◆" />
      </div>

      <section className="relative z-20 mx-auto w-full max-w-3xl border-y-4 border-[#080b0e] bg-black shadow-[0_8px_0_#080b0e] sm:border-x-4">
        <canvas
          ref={canvasRef}
          width={VIEW_W}
          height={VIEW_H}
          aria-label="블록 월드 횡스크롤 수학 게임"
          className="block h-auto w-full"
          style={{ imageRendering: "pixelated", aspectRatio: `${VIEW_W}/${VIEW_H}` }}
        />

        <AnimatePresence>
          {phase === "ready" && (
            <motion.div
              className="absolute inset-0 z-40 flex items-center justify-center bg-[#101820]/90 px-5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="w-full max-w-sm border-4 border-[#d7e0e7] bg-[#263742] p-5 text-center shadow-[8px_8px_0_#080b0e]">
                <div className="mx-auto mb-3 grid h-16 w-16 place-items-center border-4 border-[#161b20] bg-[#62b84f] text-4xl shadow-[4px_4px_0_#080b0e]">
                  ◈
                </div>
                <h1 className="text-xl font-black leading-relaxed text-[#8ff3eb] sm:text-2xl">
                  BLOCK MATH QUEST
                </h1>
                <p className="mt-2 text-[10px] leading-5 text-white/80 sm:text-xs">
                  블록 초원·수정 동굴·용암 요새를 탐험하세요.<br />포털에 도착하면 수학 문제 1개가 나옵니다.
                </p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-[8px] sm:text-[9px]">
                  <InfoBlock icon="🍄" title="성장 버섯" text="공격 1회 방어" />
                  <InfoBlock icon="▰" title="발사기" text="에너지탄 사용" />
                  <InfoBlock icon="◆" title="수정" text="7초 무적" />
                </div>
                <p className="mt-3 text-[9px] leading-4 text-white/60">
                  주황 아이템 큐브를 아래에서 점프해 치면 아이템이 등장해요.<br />공중에서 점프를 한 번 더 누르면 더블점프!
                </p>
                <button
                  type="button"
                  onClick={startGame}
                  className="mt-5 w-full border-4 border-[#d7e0e7] bg-[#f26522] py-3 text-sm font-black text-white shadow-[5px_5px_0_#080b0e] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0_#080b0e]"
                >
                  ▶ START QUEST
                </button>
                <p className="mt-3 text-[9px] text-white/55">
                  오늘 남은 횟수 · {adminMode ? "∞" : `${remainingBefore}회`}
                </p>
              </div>
            </motion.div>
          )}

          {phase === "stageQuiz" && (
            <motion.div
              className="absolute inset-0 z-50 flex items-center justify-center bg-[#081018]/85 px-5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <motion.div
                initial={{ scale: 0.82, y: 12 }}
                animate={{ scale: 1, y: 0 }}
                className="w-full max-w-xs border-4 border-[#d8e2e8] bg-[#cfb486] p-4 text-center text-[#17202a] shadow-[8px_8px_0_#080b0e]"
              >
                <div className="text-[10px] font-black text-[#6d3d22]">
                  {currentStage.name} PORTAL OPEN!
                </div>
                <h2 className="mt-2 text-sm font-black">다음 지역 제작 문제</h2>
                <div className="my-4 border-4 border-[#3f3428] bg-[#f2e5c7] py-4 text-3xl font-black shadow-[inset_4px_4px_0_rgba(255,255,255,.35)]">
                  {currentStage.quiz.prompt} = ?
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {currentStage.quiz.choices.map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      disabled={quizFeedback !== null}
                      onClick={() => answerStageQuiz(choice)}
                      className="border-4 border-[#26313a] bg-[#62b84f] py-3 text-xl font-black shadow-[3px_3px_0_#17202a] active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-70"
                    >
                      {choice}
                    </button>
                  ))}
                </div>
                {quizFeedback && (
                  <div className={`mt-3 border-2 border-[#26313a] py-2 text-xs font-black ${quizFeedback === "correct" ? "bg-emerald-300" : "bg-rose-300"}`}>
                    {quizFeedback === "correct"
                      ? stageIndex === STAGES.length - 1
                        ? "정답! 모든 포털을 열었어요!"
                        : "정답! 다음 블록 지역으로 이동!"
                      : "다시 골라보세요!"}
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}

          {phase === "over" && (
            <motion.div
              className="absolute inset-0 z-50 flex items-center justify-center bg-[#080d12]/90 px-5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="w-full max-w-sm border-4 border-[#d7e0e7] bg-[#263742] p-5 text-center shadow-[8px_8px_0_#080b0e]">
                <div className="text-4xl">{cleared ? "◆" : "▧"}</div>
                <h2 className="mt-2 text-xl font-black text-[#8ff3eb]">
                  {cleared ? "QUEST COMPLETE!" : "QUEST FAILED"}
                </h2>
                <p className="mt-2 text-[10px] leading-5 text-white/75">
                  {cleared
                    ? `${monsterNickname}와 함께 3개 블록 지역을 모두 통과했어요!`
                    : "아이템 큐브와 점프 타이밍을 활용해 다시 도전해보세요."}
                </p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-[10px]">
                  <BlockStat label="SCORE" value={score.toLocaleString()} />
                  <BlockStat label="CUBE" value={String(coinCount)} />
                  <BlockStat label="TIME" value={`${elapsed}s`} />
                </div>
                <div className="mt-3 border-2 border-white/60 bg-black/25 p-3 text-[10px] leading-5">
                  {submitting
                    ? "기록 저장 중..."
                    : adminMode
                      ? "테스트 모드라 기록은 저장되지 않아요."
                      : result?.ok
                        ? `EXP +${result.expEarned}${result.isNewBest ? " · NEW RECORD!" : ""}`
                        : result
                          ? result.message
                          : "결과를 확인했어요."}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs font-black">
                  {(adminMode || remainingAfter > 0) && (
                    <button
                      type="button"
                      onClick={startGame}
                      className="border-4 border-white bg-[#f26522] py-3 shadow-[4px_4px_0_#080b0e] active:translate-y-0.5"
                    >
                      RETRY
                    </button>
                  )}
                  <Link
                    href={homeHref}
                    className="flex items-center justify-center border-4 border-white bg-[#279f8f] py-3 shadow-[4px_4px_0_#080b0e] active:translate-y-0.5"
                  >
                    EXIT
                  </Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <div className="relative z-20 mx-auto flex w-full max-w-3xl flex-1 items-center justify-between gap-3 px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="flex gap-2">
          <BlockControl
            label="왼쪽"
            icon="◀"
            onPress={() => pressControl("left")}
            onRelease={() => releaseControl("left")}
          />
          <BlockControl
            label="오른쪽"
            icon="▶"
            onPress={() => pressControl("right")}
            onRelease={() => releaseControl("right")}
          />
        </div>
        <div className="hidden text-center text-[9px] leading-5 text-white/45 sm:block">
          {currentStage.name}<br />{currentStage.subtitle}
        </div>
        <div className="flex items-end gap-2">
          <button
            type="button"
            disabled={!hasBlaster}
            onPointerDown={(event) => {
              event.preventDefault();
              queueFire();
            }}
            className="grid h-16 w-16 place-items-center border-4 border-[#d7e0e7] bg-[#24bdb5] text-xl font-black shadow-[0_7px_0_#126b69,0_10px_0_#080b0e] active:translate-y-1 active:shadow-[0_3px_0_#126b69,0_5px_0_#080b0e] disabled:bg-[#3e4a52] disabled:text-white/25 disabled:shadow-[0_7px_0_#202930,0_10px_0_#080b0e]"
            aria-label="에너지탄 발사"
          >
            ▰
          </button>
          <button
            type="button"
            onPointerDown={(event) => {
              event.preventDefault();
              queueJump();
            }}
            className="grid h-20 w-20 place-items-center border-4 border-[#d7e0e7] bg-[#f26522] text-3xl font-black shadow-[0_7px_0_#8e2e12,0_10px_0_#080b0e] active:translate-y-1 active:shadow-[0_3px_0_#8e2e12,0_5px_0_#080b0e]"
            aria-label="점프"
          >
            ↑
          </button>
        </div>
      </div>
    </main>
  );
}

function Hud({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="text-center">
      <div className="text-white/50">{label}</div>
      <div className={accent ? "text-[#8ff3eb]" : "text-white"}>{value}</div>
    </div>
  );
}

function PowerBadge({ active, label, icon }: { active: boolean; label: string; icon: string }) {
  return (
    <div className={`border-2 px-2 py-1 ${active ? "border-[#8ff3eb] bg-[#244f55] text-white" : "border-white/15 bg-black/20 text-white/25"}`}>
      <span className="mr-1">{icon}</span>{label}
    </div>
  );
}

function InfoBlock({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="border-2 border-white/60 bg-black/25 p-2 leading-4">
      <div className="text-lg">{icon}</div>
      <div className="font-black text-[#8ff3eb]">{title}</div>
      <div className="text-white/65">{text}</div>
    </div>
  );
}

function BlockControl({
  label,
  icon,
  onPress,
  onRelease,
}: {
  label: string;
  icon: string;
  onPress: () => void;
  onRelease: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        onPress();
      }}
      onPointerUp={onRelease}
      onPointerCancel={onRelease}
      onLostPointerCapture={onRelease}
      className="grid h-[70px] w-[70px] place-items-center border-4 border-[#aebbc5] bg-[#3b4852] text-2xl font-black shadow-[0_7px_0_#1d252b,0_10px_0_#080b0e] active:translate-y-1 active:shadow-[0_3px_0_#1d252b,0_5px_0_#080b0e]"
    >
      {icon}
    </button>
  );
}

function BlockStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-2 border-white/60 bg-black/25 p-2">
      <div className="text-white/50">{label}</div>
      <div className="mt-1 text-sm text-[#8ff3eb]">{value}</div>
    </div>
  );
}
