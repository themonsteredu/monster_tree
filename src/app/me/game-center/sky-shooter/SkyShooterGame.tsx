"use client";

// 스카이 슈터 — 모바일 세로 화면 슈팅 게임.
// 규칙:
//  - 화면 하단 캐릭터는 좌/우로 이동 (터치 드래그 / 마우스 / ← →).
//  - 위에서 떨어지는 적(👾) / 동전(🪙) / 폭탄(💣) 처리:
//      · 적: 자동 발사 총알로 처치 (+2점). 닿으면 -1 목숨.
//      · 동전: 캐릭터와 닿으면 획득 (+1점).
//      · 폭탄: 닿으면 -1 목숨. 총알로 못 부숨.
//  - 시간이 흐를수록 스폰 빨라지고 낙하 속도 증가.
//  - 목숨 0 = 게임오버.
//
// 좌표계는 컨테이너 실측 px 기반. 60fps rAF 루프 + ref 갱신 + forceTick 으로 리렌더.

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { AvatarFigurePreloaded } from "@/features/garden/avatar/AvatarFigurePreloaded";
import { useGalleryPositions } from "@/features/garden/avatar/useGalleryPositions";
import type { AvatarConfig } from "@/lib/types";
import {
  recordSkyShooterPlayAction,
  type PlayResult,
} from "../actions";
import { GameAudio } from "../bgm";

type EntityType = "enemy" | "coin" | "bomb";
type Entity = {
  id: number;
  type: EntityType;
  x: number;
  y: number;
  vy: number;
};
type Bullet = { id: number; x: number; y: number; vy: number };
type Phase = "ready" | "playing" | "over";

const STARTING_LIVES = 3;
const PLAYER_Y_RATIO = 0.85; // 화면 높이의 85% 지점에 캐릭터 고정.
const PLAYER_RADIUS_PX = 28;
const ENTITY_RADIUS_PX = 22;
const BULLET_RADIUS_PX = 5;
const BULLET_SPEED_PX_S = 620;
const FIRE_INTERVAL_MS = 230;
const INVINCIBLE_MS = 800;
const DAMAGED_FLASH_MS = 800;
const INITIAL_SPAWN_MS = 900;
const MIN_SPAWN_MS = 320;
const INITIAL_FALL_SPEED = 90;
const MAX_FALL_SPEED = 230;
const KEYBOARD_SPEED_PX_S = 460;

// 스폰 가중치 (sum = 100).
const SPAWN_WEIGHTS: Record<EntityType, number> = {
  coin: 45,
  enemy: 45,
  bomb: 10,
};

function pickType(): EntityType {
  const r = Math.random() * 100;
  let acc = 0;
  for (const type of ["coin", "enemy", "bomb"] as const) {
    acc += SPAWN_WEIGHTS[type];
    if (r < acc) return type;
  }
  return "coin";
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

type Props = {
  remainingBefore: number;
  avatarConfig: AvatarConfig | null;
  monsterNickname: string;
  adminMode?: boolean;
  homeHref?: string;
};

export function SkyShooterGame({
  remainingBefore,
  avatarConfig,
  monsterNickname,
  adminMode = false,
  homeHref = "/me/game-center",
}: Props) {
  const router = useRouter();
  const galleryPositions = useGalleryPositions();

  const [phase, setPhase] = useState<Phase>("ready");
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(STARTING_LIVES);
  const [muted, setMuted] = useState(false);
  const [damaged, setDamaged] = useState(false);
  const [result, setResult] = useState<PlayResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 강제 리렌더 (rAF 루프에서 ref 갱신 후 호출).
  const [, forceTick] = useReducer((x: number) => x + 1, 0);

  const containerRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef({ w: 360, h: 640 });

  // 게임 상태 — ref (리렌더 트리거 없음)
  const phaseRef = useRef<Phase>(phase);
  const playerXRef = useRef(180);
  const scoreRef = useRef(0);
  const livesRef = useRef(STARTING_LIVES);
  const invincibleRef = useRef(false);
  const entitiesRef = useRef<Entity[]>([]);
  const bulletsRef = useRef<Bullet[]>([]);
  const elapsedRef = useRef(0);
  const spawnAccumRef = useRef(0);
  const fireAccumRef = useRef(0);
  const nextIdRef = useRef(1);
  const lastFrameRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);
  const keysRef = useRef({ left: false, right: false });

  const audioRef = useRef<GameAudio | null>(null);
  if (audioRef.current === null && typeof window !== "undefined") {
    audioRef.current = new GameAudio();
  }

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // 컨테이너 크기 측정 + 리사이즈 추적.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      sizeRef.current = { w: rect.width, h: rect.height };
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const stopLoop = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const submitResult = useCallback(
    async (finalScore: number) => {
      stopLoop();
      audioRef.current?.stopBgm();
      audioRef.current?.sfxGameOver();
      setSubmitting(true);
      if (adminMode) {
        setResult(null);
        setSubmitting(false);
        setPhase("over");
        return;
      }
      try {
        const res = await recordSkyShooterPlayAction({ score: finalScore });
        setResult(res);
      } catch {
        setResult({
          ok: false,
          reason: "invalid",
          message: "네트워크 오류로 저장 실패",
        });
      } finally {
        setSubmitting(false);
        setPhase("over");
      }
    },
    [stopLoop, adminMode],
  );

  const loseLife = useCallback(() => {
    if (invincibleRef.current) return;
    const newLives = livesRef.current - 1;
    livesRef.current = newLives;
    setLives(newLives);
    setDamaged(true);
    window.setTimeout(() => setDamaged(false), DAMAGED_FLASH_MS);
    if (newLives <= 0) {
      void submitResult(scoreRef.current);
      return;
    }
    audioRef.current?.sfxHurt();
    invincibleRef.current = true;
    window.setTimeout(() => {
      invincibleRef.current = false;
    }, INVINCIBLE_MS);
  }, [submitResult]);

  const loseLifeRef = useRef(loseLife);
  useEffect(() => {
    loseLifeRef.current = loseLife;
  }, [loseLife]);

  // 메인 게임 루프 — rAF.
  const loop = useCallback((now: number) => {
    if (phaseRef.current !== "playing") return;
    const last = lastFrameRef.current || now;
    // dt 상한 — 백그라운드 복귀 시 거대한 dt 로 엔티티가 순간 통과하는 사고 방지.
    const dt = Math.min((now - last) / 1000, 0.05);
    lastFrameRef.current = now;
    elapsedRef.current += dt;

    const { w, h } = sizeRef.current;
    const tProg = Math.min(elapsedRef.current / 60, 1); // 0→1 over 60s
    const fallSpeed = lerp(INITIAL_FALL_SPEED, MAX_FALL_SPEED, tProg);
    const spawnInterval = lerp(INITIAL_SPAWN_MS, MIN_SPAWN_MS, tProg);

    // 키보드 좌우 이동.
    if (keysRef.current.left) {
      playerXRef.current = Math.max(
        PLAYER_RADIUS_PX,
        playerXRef.current - KEYBOARD_SPEED_PX_S * dt,
      );
    }
    if (keysRef.current.right) {
      playerXRef.current = Math.min(
        w - PLAYER_RADIUS_PX,
        playerXRef.current + KEYBOARD_SPEED_PX_S * dt,
      );
    }

    // 엔티티 스폰.
    spawnAccumRef.current += dt * 1000;
    if (spawnAccumRef.current >= spawnInterval) {
      spawnAccumRef.current = 0;
      const x =
        ENTITY_RADIUS_PX + Math.random() * (w - 2 * ENTITY_RADIUS_PX);
      entitiesRef.current.push({
        id: nextIdRef.current++,
        type: pickType(),
        x,
        y: -ENTITY_RADIUS_PX,
        vy: fallSpeed,
      });
    }

    // 자동 발사.
    fireAccumRef.current += dt * 1000;
    if (fireAccumRef.current >= FIRE_INTERVAL_MS) {
      fireAccumRef.current = 0;
      bulletsRef.current.push({
        id: nextIdRef.current++,
        x: playerXRef.current,
        y: h * PLAYER_Y_RATIO - 32,
        vy: BULLET_SPEED_PX_S,
      });
      audioRef.current?.sfxShoot();
    }

    // 이동.
    for (const e of entitiesRef.current) e.y += e.vy * dt;
    for (const b of bulletsRef.current) b.y -= b.vy * dt;

    // 충돌 판정.
    const playerY = h * PLAYER_Y_RATIO;
    const playerX = playerXRef.current;
    let scoreDelta = 0;
    const consumedEntityIds = new Set<number>();
    const survivingBullets: Bullet[] = [];

    // 총알 vs 적
    for (const b of bulletsRef.current) {
      if (b.y < -BULLET_RADIUS_PX) continue;
      let hit = false;
      for (const e of entitiesRef.current) {
        if (consumedEntityIds.has(e.id) || e.type !== "enemy") continue;
        const dx = b.x - e.x;
        const dy = b.y - e.y;
        const r = BULLET_RADIUS_PX + ENTITY_RADIUS_PX;
        if (dx * dx + dy * dy < r * r) {
          consumedEntityIds.add(e.id);
          scoreDelta += 2;
          hit = true;
          audioRef.current?.sfxHitEnemy();
          break;
        }
      }
      if (!hit) survivingBullets.push(b);
    }

    // 플레이어 vs 엔티티
    for (const e of entitiesRef.current) {
      if (consumedEntityIds.has(e.id)) continue;
      if (e.y > h + ENTITY_RADIUS_PX) {
        consumedEntityIds.add(e.id);
        continue;
      }
      const dx = playerX - e.x;
      const dy = playerY - e.y;
      const r = PLAYER_RADIUS_PX + ENTITY_RADIUS_PX;
      if (dx * dx + dy * dy < r * r) {
        if (e.type === "coin") {
          consumedEntityIds.add(e.id);
          scoreDelta += 1;
          audioRef.current?.sfxCoin();
        } else if (e.type === "enemy" || e.type === "bomb") {
          consumedEntityIds.add(e.id);
          audioRef.current?.sfxBomb();
          loseLifeRef.current();
        }
      }
    }

    entitiesRef.current = entitiesRef.current.filter(
      (e) => !consumedEntityIds.has(e.id),
    );
    bulletsRef.current = survivingBullets;

    if (scoreDelta !== 0) {
      scoreRef.current += scoreDelta;
      setScore(scoreRef.current);
    }

    forceTick();
    rafIdRef.current = requestAnimationFrame(loop);
  }, []);

  const startGame = useCallback(() => {
    scoreRef.current = 0;
    livesRef.current = STARTING_LIVES;
    invincibleRef.current = false;
    entitiesRef.current = [];
    bulletsRef.current = [];
    elapsedRef.current = 0;
    spawnAccumRef.current = 0;
    fireAccumRef.current = 0;
    lastFrameRef.current = 0;
    nextIdRef.current = 1;
    playerXRef.current = sizeRef.current.w / 2;
    setScore(0);
    setLives(STARTING_LIVES);
    setDamaged(false);
    setResult(null);
    setPhase("playing");
    phaseRef.current = "playing";
    audioRef.current?.startBgm();
    rafIdRef.current = requestAnimationFrame(loop);
  }, [loop]);

  // 키보드.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        phaseRef.current === "ready" &&
        (e.key === " " || e.key === "Enter")
      ) {
        e.preventDefault();
        startGame();
        return;
      }
      if (phaseRef.current !== "playing") return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        keysRef.current.left = true;
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        keysRef.current.right = true;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") keysRef.current.left = false;
      else if (e.key === "ArrowRight") keysRef.current.right = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [startGame]);

  // 포인터 드래그 — 모바일/마우스 공통 (Pointer Events 통합).
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (phaseRef.current !== "playing") return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    playerXRef.current = Math.max(
      PLAYER_RADIUS_PX,
      Math.min(rect.width - PLAYER_RADIUS_PX, x),
    );
  };

  // unmount cleanup.
  useEffect(() => {
    return () => {
      stopLoop();
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, [stopLoop]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    audioRef.current?.setMuted(next);
  };

  const { h } = sizeRef.current;
  const playerY = h * PLAYER_Y_RATIO;
  const playerX = playerXRef.current;

  return (
    <main
      className="relative h-[100dvh] w-full select-none overflow-hidden text-white"
      style={{
        background:
          "linear-gradient(180deg, #1e3a8a 0%, #312e81 45%, #1e1b4b 75%, #0a0418 100%)",
        fontFamily: "'Jua', 'Pretendard Variable', sans-serif",
        touchAction: "none",
      }}
    >
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Jua&display=swap"
      />

      <CloudsBackground />

      {/* 관리자 테스트 모드 뱃지 */}
      {adminMode && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex justify-center pt-1">
          <span
            className="pointer-events-auto rounded-b-xl border border-t-0 border-amber-400/40 bg-amber-500/20 px-3 py-1 text-[11px] font-bold text-amber-100 backdrop-blur-sm"
            style={{ boxShadow: "0 0 12px rgba(245,158,11,0.4)" }}
          >
            🛠 테스트 모드 · 기록 저장 안 됨
          </span>
        </div>
      )}

      {/* 상단 — 나가기 / 하트 / 뮤트+점수 */}
      <div
        className={`absolute inset-x-0 top-0 z-30 px-5 ${adminMode ? "pt-9" : "pt-4"}`}
      >
        <div className="mx-auto flex w-full max-w-md items-center justify-between gap-2">
          <Link
            href={homeHref}
            className="rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-xs font-bold text-white/80 backdrop-blur-sm"
          >
            ← 나가기
          </Link>
          <Hearts lives={lives} max={STARTING_LIVES} />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? "소리 켜기" : "소리 끄기"}
              className="rounded-full border border-white/15 bg-black/40 px-2.5 py-1.5 text-base backdrop-blur-sm"
            >
              {muted ? "🔇" : "🔊"}
            </button>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-widest text-white/45">
                SCORE
              </div>
              <motion.div
                key={score}
                initial={{ scale: 1.25, color: "#fde68a" }}
                animate={{ scale: 1, color: "#ffffff" }}
                transition={{ duration: 0.2 }}
                className="text-3xl font-extrabold leading-none tracking-tight"
                style={{ textShadow: "0 2px 8px rgba(0,0,0,0.55)" }}
              >
                {score}
              </motion.div>
            </div>
          </div>
        </div>
      </div>

      {/* 게임 영역 — 전체 화면 (포인터 캡처 영역) */}
      <div
        ref={containerRef}
        className="absolute inset-0 z-10"
        onPointerDown={onPointerMove}
        onPointerMove={onPointerMove}
      >
        {entitiesRef.current.map((e) => (
          <EntityDot key={e.id} entity={e} />
        ))}
        {bulletsRef.current.map((b) => (
          <div
            key={b.id}
            className="absolute"
            style={{
              left: b.x - BULLET_RADIUS_PX,
              top: b.y - BULLET_RADIUS_PX,
              width: BULLET_RADIUS_PX * 2,
              height: BULLET_RADIUS_PX * 2,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, #fef3c7 0%, #facc15 60%, transparent 80%)",
              boxShadow: "0 0 8px rgba(250,204,21,0.7)",
              pointerEvents: "none",
            }}
          />
        ))}
        {phase !== "ready" && (
          <motion.div
            className="absolute"
            animate={
              damaged
                ? { opacity: [1, 0.2, 1, 0.2, 1] }
                : { opacity: 1 }
            }
            transition={{ duration: damaged ? 0.7 : 0.1 }}
            style={{
              left: playerX - 30,
              top: playerY - 30,
              width: 60,
              height: 60,
              pointerEvents: "none",
            }}
          >
            <div
              aria-hidden
              className="absolute -bottom-1 left-1/2 h-2 w-10 -translate-x-1/2 rounded-full bg-black/45 blur-sm"
            />
            {avatarConfig ? (
              <div
                style={{
                  filter:
                    "drop-shadow(0 6px 14px rgba(0,0,0,0.55)) drop-shadow(0 0 12px rgba(56,189,248,0.45))",
                }}
              >
                <AvatarFigurePreloaded
                  config={avatarConfig}
                  size={60}
                  galleryPositions={galleryPositions}
                />
              </div>
            ) : (
              <span
                className="block text-5xl leading-none"
                style={{
                  filter:
                    "drop-shadow(0 6px 12px rgba(0,0,0,0.55)) drop-shadow(0 0 12px rgba(56,189,248,0.45))",
                }}
              >
                🚀
              </span>
            )}
          </motion.div>
        )}
      </div>

      {/* 시작 전 / 게임오버 오버레이 */}
      <AnimatePresence>
        {phase === "ready" && (
          <motion.div
            key="ready"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/55 px-6 text-center backdrop-blur-sm"
          >
            <div className="text-5xl">🚀</div>
            <h2 className="mt-3 text-2xl font-extrabold">스카이 슈터</h2>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-white/80">
              화면을 좌·우로 드래그해 움직여요.
              <br />
              👾 적 +2 · 🪙 동전 +1 · 💣 폭탄 피하기!
            </p>
            <button
              type="button"
              onClick={startGame}
              className="mt-6 rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 px-8 py-3 text-base font-extrabold text-white shadow-[0_8px_24px_rgba(56,189,248,0.45)] active:scale-95"
            >
              ▶ 탭하여 시작
            </button>
            <p className="mt-4 text-xs text-white/50">
              오늘 남은 횟수 · {remainingBefore}회
            </p>
          </motion.div>
        )}

        {phase === "over" && (
          <ResultOverlay
            key="over"
            result={result}
            submitting={submitting}
            score={score}
            monsterNickname={monsterNickname}
            adminMode={adminMode}
            onRetry={adminMode || remainingBefore > 1 ? startGame : null}
            onHome={() => router.push(homeHref)}
            onEvolutionContinue={() => router.push("/me/onboarding")}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

// ============ 보조 ============

function EntityDot({ entity }: { entity: Entity }) {
  const emoji =
    entity.type === "enemy" ? "👾" : entity.type === "coin" ? "🪙" : "💣";
  const glow =
    entity.type === "bomb"
      ? "drop-shadow(0 0 6px rgba(239,68,68,0.65))"
      : entity.type === "coin"
        ? "drop-shadow(0 0 8px rgba(250,204,21,0.7))"
        : "drop-shadow(0 0 6px rgba(168,85,247,0.5))";
  return (
    <div
      className="pointer-events-none absolute select-none"
      style={{
        left: entity.x - ENTITY_RADIUS_PX,
        top: entity.y - ENTITY_RADIUS_PX,
        width: ENTITY_RADIUS_PX * 2,
        height: ENTITY_RADIUS_PX * 2,
        fontSize: ENTITY_RADIUS_PX * 1.55,
        lineHeight: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        filter: glow,
      }}
    >
      {emoji}
    </div>
  );
}

function Hearts({ lives, max }: { lives: number; max: number }) {
  return (
    <div
      className="flex items-center gap-1"
      aria-label={`목숨 ${lives} / ${max}`}
    >
      {Array.from({ length: max }).map((_, i) => {
        const filled = i < lives;
        return (
          <motion.span
            key={i}
            className="text-lg leading-none"
            initial={false}
            animate={{
              scale: filled ? 1 : 0.78,
              opacity: filled ? 1 : 0.22,
            }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            style={{
              filter: filled
                ? "drop-shadow(0 0 6px rgba(244,63,94,0.7))"
                : "grayscale(1)",
            }}
          >
            ❤️
          </motion.span>
        );
      })}
    </div>
  );
}

function CloudsBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(40px 16px at 15% 18%, rgba(255,255,255,0.25), transparent 70%)," +
            "radial-gradient(50px 18px at 70% 30%, rgba(255,255,255,0.22), transparent 70%)," +
            "radial-gradient(35px 14px at 35% 55%, rgba(255,255,255,0.18), transparent 70%)," +
            "radial-gradient(48px 16px at 85% 72%, rgba(255,255,255,0.22), transparent 70%)," +
            "radial-gradient(38px 14px at 20% 88%, rgba(255,255,255,0.18), transparent 70%)",
          backgroundSize: "100% 600px",
          animation: "skyShooterClouds 14s linear infinite",
        }}
      />
      <style jsx>{`
        @keyframes skyShooterClouds {
          from {
            background-position: 0 0;
          }
          to {
            background-position: 0 600px;
          }
        }
      `}</style>
    </div>
  );
}

function ResultOverlay({
  result,
  submitting,
  score,
  monsterNickname,
  adminMode,
  onRetry,
  onHome,
  onEvolutionContinue,
}: {
  result: PlayResult | null;
  submitting: boolean;
  score: number;
  monsterNickname: string;
  adminMode: boolean;
  onRetry: (() => void) | null;
  onHome: () => void;
  onEvolutionContinue: () => void;
}) {
  const isFinal = result?.ok && result.finalEvolution;
  const stageUp = result?.ok && result.stageUp;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/65 px-6 backdrop-blur-sm"
    >
      <motion.div
        initial={{ y: 30, scale: 0.95 }}
        animate={{ y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 20 }}
        className="w-full max-w-sm rounded-2xl border border-sky-400/30 bg-gradient-to-br from-sky-900/80 to-indigo-950/85 p-6 text-center"
        style={{
          boxShadow:
            "0 20px 50px rgba(0,0,0,0.55), 0 0 40px rgba(56,189,248,0.25)",
        }}
      >
        {submitting ? (
          <>
            <div className="text-4xl">⏳</div>
            <div className="mt-3 text-base font-bold text-white">
              결과 저장 중...
            </div>
          </>
        ) : adminMode ? (
          <>
            <div className="text-2xl font-extrabold text-white">GAME OVER</div>
            <div className="mt-1 inline-block rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1 text-[11px] font-bold text-amber-100">
              🛠 테스트 모드 — 기록 저장 안 됨
            </div>
            <div className="mt-4 rounded-xl bg-white/[0.05] p-4">
              <div className="text-xs text-white/55">최종 점수</div>
              <div className="text-5xl font-extrabold text-sky-300">
                {score}
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-2">
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 px-5 py-3 text-base font-extrabold text-white shadow-[0_6px_18px_rgba(56,189,248,0.45)] active:scale-95"
                >
                  ↻ 다시하기
                </button>
              )}
              <button
                type="button"
                onClick={onHome}
                className="rounded-full border border-white/15 bg-white/[0.04] px-5 py-2.5 text-sm font-bold text-white/80 active:scale-95"
              >
                게임센터로
              </button>
            </div>
          </>
        ) : result?.ok ? (
          <>
            <div className="text-2xl font-extrabold text-white">
              {isFinal
                ? "🎉 진화 완료!"
                : stageUp
                  ? "🌟 단계 업!"
                  : "GAME OVER"}
            </div>
            <div className="mt-4 rounded-xl bg-white/[0.05] p-4">
              <div className="text-xs text-white/55">최종 점수</div>
              <div className="text-5xl font-extrabold text-sky-300">
                {result.score}
              </div>
              {result.isNewBest && (
                <div className="mt-1 text-xs font-bold text-yellow-300">
                  🏆 이번 달 최고기록!
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center justify-center gap-2 text-sm text-white/85">
              <span aria-hidden>✨</span>
              <span className="font-bold">EXP +{result.expEarned}</span>
              <span className="text-white/40">·</span>
              <span className="text-white/65">총 {result.newExp}</span>
            </div>
            {stageUp && !isFinal && (
              <div className="mt-3 rounded-lg border border-sky-300/30 bg-sky-500/15 px-3 py-2 text-sm font-bold text-sky-200">
                {monsterNickname} 가 {result.toStage}단계로 성장했어요!
              </div>
            )}
            {isFinal && (
              <div className="mt-3 rounded-lg border border-yellow-300/30 bg-yellow-400/10 px-3 py-2 text-sm font-bold text-yellow-200">
                {monsterNickname} 가 최종 진화 완료! 도감에 등록됐어요.
              </div>
            )}
            <div className="mt-5 flex flex-col gap-2">
              {isFinal ? (
                <button
                  type="button"
                  onClick={onEvolutionContinue}
                  className="rounded-full bg-gradient-to-r from-yellow-400 to-orange-500 px-5 py-3 text-base font-extrabold text-white shadow-[0_6px_18px_rgba(251,191,36,0.45)] active:scale-95"
                >
                  🥚 새 알 고르러 가기
                </button>
              ) : onRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 px-5 py-3 text-base font-extrabold text-white shadow-[0_6px_18px_rgba(56,189,248,0.45)] active:scale-95"
                >
                  ↻ 다시하기
                </button>
              ) : (
                <div className="rounded-full bg-white/10 px-5 py-3 text-sm font-bold text-white/60">
                  오늘 횟수를 모두 사용했어요
                </div>
              )}
              <button
                type="button"
                onClick={onHome}
                className="rounded-full border border-white/15 bg-white/[0.04] px-5 py-2.5 text-sm font-bold text-white/80 active:scale-95"
              >
                게임센터로
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-2xl font-extrabold text-white">GAME OVER</div>
            <div className="mt-3 text-3xl font-extrabold text-sky-300">
              {score}점
            </div>
            <div className="mt-2 text-sm text-rose-200">
              {result?.message ?? "결과 저장에 실패했어요"}
            </div>
            <button
              type="button"
              onClick={onHome}
              className="mt-5 w-full rounded-full bg-white/10 px-5 py-3 text-base font-bold text-white"
            >
              게임센터로
            </button>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
