"use client";

// /tree/me 클라이언트 렌더러.
// 초기 데이터는 서버에서 SSR 으로 주입하고,
// 이후 useStudentRealtime 훅으로 점수/단계/사과/대기열 변화를 반영한다.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppleTree, type AppleTreeMood } from "@/components/AppleTree";
import { AvatarFigurePreloaded } from "@/features/garden/avatar/AvatarFigurePreloaded";
import { AvatarEditSheet } from "@/features/garden/avatar/AvatarEditSheet";
import { useGalleryPositions } from "@/features/garden/avatar/useGalleryPositions";
import { BackgroundCanvas } from "@/features/garden/background/BackgroundCanvas";
import { MoodEditSheet } from "@/features/garden/mood/MoodEditSheet";
import { MoodTicker } from "@/features/garden/mood/MoodTicker";
import { WeatherEffect } from "@/features/garden/weather/WeatherEffect";
import { WeatherPickerSheet } from "@/features/garden/weather/WeatherPickerSheet";
import { YardLayer } from "@/features/garden/decorations/YardLayer";
import { DecorateMode } from "@/features/garden/decorations/DecorateMode";
import { useTreeStages } from "@/features/garden/tree/useTreeStages";
import {
  DEFAULT_AVATAR,
  DEFAULT_BACKGROUND,
  DEFAULT_SCENE_LAYOUT,
  type AvatarConfig,
  type BackgroundConfig,
  type SceneLayout,
} from "@/lib/types";

// 트리/아바타의 자연 px 크기. transform: scale 계산에 사용.
const TREE_NATURAL_PX = 340;
const AVATAR_NATURAL_PX = 220;
import {
  STAGE_TABLE,
  calculateStage,
  getStageInfo,
  pointsToNextStage,
  stageProgress,
} from "@/lib/garden";
import { STAGE_ACCENT } from "@/features/garden/stage-accent";
import { SprayWaterMe } from "@/features/garden/effects/SprayWater";
import { fireConfetti, firePtCelebration } from "@/features/garden/effects/confetti";
import { useStudentRealtime } from "@/features/garden/hooks/useStudentRealtime";
import { claimPointAction, resetAvatarAction, replaceYardLayoutAction } from "./actions";

type Row = {
  id: string;
  total_points: number | null;
  current_stage: number | null;
  apples_harvested: number | null;
  grade: string | null;
  avatar?: AvatarConfig | null;
  background?: BackgroundConfig | null;
  mood_text?: string | null;
};

type PointLog = { id: string; points: number; reason: string | null; logged_at: string };
type Harvest = { id: string; apples_count: number; harvested_at: string };
type PendingClaim = { id: string; points: number; reason: string | null; created_at: string };
type Toast = { id: string; points: number; reason: string | null };
type StageUpBanner = { id: string; stage: number; name: string; isHarvest: boolean };
type HarvestBanner = { id: string; applesCount: number };
type Highlight = { id: string; delta: number; reason: string | null; expiresAt: number };

const TOAST_MS = 3500;
const STAGE_UP_BANNER_MS = 4500;
const HARVEST_BANNER_MS = 5000;
const HIGHLIGHT_MS = 2400;

type Milestone = { key: string; emoji: string; name: string; achieved: boolean };

function buildMilestones(maxStageEver: number, applesHarvested: number): Milestone[] {
  return [
    { key: "s2", emoji: "🌱", name: "첫 씨앗", achieved: maxStageEver >= 2 },
    { key: "s3", emoji: "🌿", name: "새싹", achieved: maxStageEver >= 3 },
    { key: "s4", emoji: "🌳", name: "어린나무", achieved: maxStageEver >= 4 },
    { key: "s5", emoji: "🌳", name: "큰나무", achieved: maxStageEver >= 5 },
    { key: "s6", emoji: "🌸", name: "꽃피움", achieved: maxStageEver >= 6 },
    { key: "s7", emoji: "🍎", name: "열매", achieved: maxStageEver >= 7 },
    { key: "h1", emoji: "🏆", name: "첫 수확", achieved: applesHarvested >= 1 },
    { key: "h5", emoji: "🥇", name: "사과왕", achieved: applesHarvested >= 5 },
    { key: "h10", emoji: "🌟", name: "사과 마스터", achieved: applesHarvested >= 10 },
  ];
}

function pickEncouragement(args: {
  isHarvest: boolean;
  applesHarvested: number;
  weekTotal: number;
  monthTotal: number;
  hasAnyLogs: boolean;
  pendingCount: number;
}): { text: string; tone: "celebrate" | "warm" | "neutral" | "soft" } {
  const { isHarvest, applesHarvested, weekTotal, monthTotal, hasAnyLogs, pendingCount } = args;
  if (pendingCount > 0) {
    return { text: `🎁 받을 포인트가 ${pendingCount}개 있어요! 받기 버튼을 눌러 화분을 키워봐요`, tone: "celebrate" };
  }
  if (isHarvest && applesHarvested === 0) {
    return { text: "🎉 8단계 도달 축하해요! 곧 사과를 딸 수 있어요", tone: "celebrate" };
  }
  if (isHarvest && applesHarvested > 0) {
    return { text: "🍎 또 수확할 수 있어요! 멋진 페이스예요", tone: "celebrate" };
  }
  if (weekTotal >= 30) {
    return { text: "🔥 이번 주 정말 열심히 하고 있어요! 멋져요", tone: "celebrate" };
  }
  if (weekTotal >= 15) return { text: "💪 좋은 페이스로 자라고 있어요", tone: "warm" };
  if (weekTotal >= 5) return { text: "🌱 한 발씩 차근차근 자라는 중!", tone: "warm" };
  if (weekTotal < 0) return { text: "🌧 이번 주는 살짝 차감이 있었어요. 다시 한 걸음씩 가봐요", tone: "soft" };
  if (!hasAnyLogs) return { text: "🌟 사과정원에 오신 걸 환영해요! 첫 포인트를 기다리고 있어요", tone: "neutral" };
  if (monthTotal > 0) return { text: "💡 이번 주 새 도전을 시작해 봐요!", tone: "neutral" };
  return { text: "🌳 천천히 자라는 게 좋은 거예요", tone: "neutral" };
}

function getWeekStart(now: Date): Date {
  const d = new Date(now);
  const day = d.getDay();
  const daysFromMonday = (day + 6) % 7;
  d.setDate(d.getDate() - daysFromMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatRelative(iso: string, now: Date): string {
  const d = new Date(iso);
  const diffMs = now.getTime() - d.getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day}일 전`;
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${m}/${dd}`;
}

export function MeTreeClient({
  initialRow,
  studentName,
  initialPointLogs,
  initialHarvests,
  initialPending,
  initialTreeStages,
  initialWeather = "none",
  initialDecorationItems = [],
  initialYardLayout = [],
  yardBackgroundImage = null,
  initialSceneLayout = null,
  initialMonster = null,
  initialMonsterSpecies = null,
  initialMonsterStages = [],
  initialEvolvedMonsters = [],
  initialMonsterSpeciesById = {},
  initialMonsterStagesBySpecies = {},
  justEvolved = null,
}: {
  initialRow: Row | null;
  studentName: string;
  initialPointLogs: PointLog[];
  initialHarvests: Harvest[];
  initialPending: PendingClaim[];
  initialTreeStages?: import("@/lib/types").GardenTreeStage[];
  initialWeather?: import("@/lib/types").WeatherType;
  initialDecorationItems?: import("@/lib/types").DecorationItem[];
  initialYardLayout?: import("@/lib/types").StudentYardItem[];
  yardBackgroundImage?: string | null;
  initialSceneLayout?: import("@/lib/types").SceneLayout | null;
  initialMonster?: import("@/lib/types").StudentMonster | null;
  initialMonsterSpecies?: import("@/lib/types").MonsterSpecies | null;
  initialMonsterStages?: import("@/lib/types").MonsterStageImage[];
  initialEvolvedMonsters?: import("@/lib/types").StudentMonster[];
  initialMonsterSpeciesById?: Record<string, import("@/lib/types").MonsterSpecies>;
  initialMonsterStagesBySpecies?: Record<string, import("@/lib/types").MonsterStageImage[]>;
  justEvolved?: {
    fromStage: number;
    toStage: number;
    nickname: string;
    newStageName: string;
  } | null;
}) {
  const [row, setRow] = useState<Row | null>(initialRow);
  const [now, setNow] = useState<Date | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [stageUp, setStageUp] = useState<StageUpBanner | null>(null);
  const [harvestBanner, setHarvestBanner] = useState<HarvestBanner | null>(null);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [pending, setPending] = useState<PendingClaim[]>(initialPending);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [avatarSheetOpen, setAvatarSheetOpen] = useState(false);
  const [moodSheetOpen, setMoodSheetOpen] = useState(false);
  const [weatherSheetOpen, setWeatherSheetOpen] = useState(false);
  const [weather, setWeather] = useState<import("@/lib/types").WeatherType>(initialWeather);
  const [decorateMode, setDecorateMode] = useState(false);
  const [yardLayout, setYardLayout] = useState<import("@/lib/types").StudentYardItem[]>(initialYardLayout);
  const [sceneLayout, setSceneLayout] = useState<import("@/lib/types").SceneLayout | null>(initialSceneLayout);
  const [evolutionBanner, setEvolutionBanner] = useState<typeof justEvolved>(justEvolved);
  const [monsterInfoOpen, setMonsterInfoOpen] = useState(false);
  const prevStageRef = useRef<number>(initialRow?.current_stage ?? 1);

  // 몬스터 정보 말풍선 — 3초 후 자동 닫힘.
  useEffect(() => {
    if (!monsterInfoOpen) return;
    const t = window.setTimeout(() => setMonsterInfoOpen(false), 3000);
    return () => window.clearTimeout(t);
  }, [monsterInfoOpen]);

  // 몬스터 진화 시 축하 — confetti + 모달 (자동 닫힘 4s)
  useEffect(() => {
    if (!justEvolved) return;
    fireConfetti(true, 0.45);
    const t = window.setTimeout(() => setEvolutionBanner(null), 4500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentAvatar: AvatarConfig = row?.avatar ?? DEFAULT_AVATAR;
  const currentBackground: BackgroundConfig = row?.background ?? DEFAULT_BACKGROUND;
  const galleryPositions = useGalleryPositions();
  const treeStages = useTreeStages(initialTreeStages);

  // Yard 박스 크기 측정 — 트리/아바타 cqmin 스케일링 계산용.
  const yardRef = useRef<HTMLDivElement>(null);
  const [yardPx, setYardPx] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useEffect(() => {
    const el = yardRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setYardPx({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const cqminPx = Math.min(yardPx.w || 1, yardPx.h || 1) / 100;

  // 효과적인 씬 레이아웃: DB 값 ⊕ 기본값.
  const effectiveScene = {
    tree: sceneLayout?.tree ?? DEFAULT_SCENE_LAYOUT.tree,
    avatar: sceneLayout?.avatar ?? DEFAULT_SCENE_LAYOUT.avatar,
    monster: sceneLayout?.monster ?? DEFAULT_SCENE_LAYOUT.monster,
  };

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useStudentRealtime(initialRow?.id, {
    onStudentUpdate: (next) => {
      const prevStage = prevStageRef.current;
      const newStage = next.current_stage ?? prevStage;
      if (newStage > prevStage) {
        const stInfo = getStageInfo(newStage as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8);
        const isHarvestUp = newStage === 8;
        setStageUp({ id: `${Date.now()}`, stage: newStage, name: stInfo.name, isHarvest: isHarvestUp });
        fireConfetti(isHarvestUp, 0.55);
      }
      prevStageRef.current = newStage;
      if (!initialRow) return;
      setRow((prev) => ({
        id: initialRow.id,
        total_points: next.total_points ?? prev?.total_points ?? 0,
        current_stage: newStage,
        apples_harvested: next.apples_harvested ?? prev?.apples_harvested ?? 0,
        grade: next.grade ?? prev?.grade ?? null,
        avatar: prev?.avatar ?? null,
        background: prev?.background ?? null,
        mood_text: next.mood_text !== undefined ? next.mood_text : (prev?.mood_text ?? ""),
      }));
    },
    onPointLog: (log) => {
      const id = `${log.id}-${Date.now()}`;
      setToasts((prev) => [...prev, { id, points: log.points, reason: log.reason }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, TOAST_MS);
      setHighlight({ id, delta: log.points, reason: log.reason, expiresAt: Date.now() + HIGHLIGHT_MS });
      setShakeKey((k) => k + 1);
      if (log.points > 0) firePtCelebration();
    },
    onHarvest: (h) => {
      setHarvestBanner({ id: `${h.id}-${Date.now()}`, applesCount: h.apples_count });
      fireConfetti(true, 0.55);
    },
    onPendingInsert: (p) => {
      setPending((prev) => {
        if (prev.some((x) => x.id === p.id)) return prev;
        return [...prev, p].sort((a, b) => a.created_at.localeCompare(b.created_at));
      });
    },
    onPendingDelete: (id) => {
      setPending((prev) => prev.filter((x) => x.id !== id));
    },
  });

  useEffect(() => {
    if (!highlight || !now) return;
    if (highlight.expiresAt <= now.getTime()) setHighlight(null);
  }, [now, highlight]);

  useEffect(() => {
    if (!stageUp) return;
    const id = stageUp.id;
    const t = window.setTimeout(() => {
      setStageUp((cur) => (cur?.id === id ? null : cur));
    }, STAGE_UP_BANNER_MS);
    return () => clearTimeout(t);
  }, [stageUp]);

  useEffect(() => {
    if (!harvestBanner) return;
    const id = harvestBanner.id;
    const t = window.setTimeout(() => {
      setHarvestBanner((cur) => (cur?.id === id ? null : cur));
    }, HARVEST_BANNER_MS);
    return () => clearTimeout(t);
  }, [harvestBanner]);

  useEffect(() => {
    if (claimingId && !pending.some((p) => p.id === claimingId)) {
      setClaimingId(null);
    }
  }, [pending, claimingId]);

  const onClaim = async (pendingId: string) => {
    if (claimingId) return;
    setClaimingId(pendingId);
    setClaimError(null);
    try {
      const res = await claimPointAction({ pendingId });
      if (!res.ok) {
        setClaimError(res.message);
        setClaimingId(null);
        window.setTimeout(() => setClaimError(null), 5000);
        return;
      }
      setPending((prev) => prev.filter((p) => p.id !== pendingId));
      setClaimingId(null);
    } catch (e) {
      setClaimError(`오류: ${(e as Error).message}`);
      setClaimingId(null);
      window.setTimeout(() => setClaimError(null), 5000);
    }
  };

  const points = row?.total_points ?? 0;
  const stage = calculateStage(points);
  const info = getStageInfo(stage);
  const progress = stageProgress(points);
  const remain = pointsToNextStage(points);
  const accent = STAGE_ACCENT[stage] ?? STAGE_ACCENT[1];
  const isHarvestStage = stage === 8;
  const applesHarvested = row?.apples_harvested ?? 0;
  const maxStageEver = applesHarvested > 0 ? 8 : stage;

  const nextStage = stage < 8 ? ((stage + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8) : null;
  const nextInfo = nextStage ? getStageInfo(nextStage) : null;
  const nextAccent = nextStage ? STAGE_ACCENT[nextStage] : null;

  const isFresh = !!(highlight && now && highlight.expiresAt > now.getTime());
  const isPositive = isFresh && highlight!.delta > 0;
  const isNegative = isFresh && highlight!.delta < 0;
  const treeMood: AppleTreeMood = isNegative ? "sad" : isPositive ? "surprised" : "happy";

  const stats = useMemo(() => {
    if (!now) return { weekTotal: 0, monthTotal: 0 };
    const weekStart = getWeekStart(now);
    let weekTotal = 0;
    let monthTotal = 0;
    for (const log of initialPointLogs) {
      const t = new Date(log.logged_at).getTime();
      if (t >= weekStart.getTime()) weekTotal += log.points;
      monthTotal += log.points;
    }
    return { weekTotal, monthTotal };
  }, [initialPointLogs, now]);

  const milestones = useMemo(
    () => buildMilestones(maxStageEver, applesHarvested),
    [maxStageEver, applesHarvested],
  );

  const encouragement = useMemo(() => {
    if (now === null) return null;
    return pickEncouragement({
      isHarvest: isHarvestStage,
      applesHarvested,
      weekTotal: stats.weekTotal,
      monthTotal: stats.monthTotal,
      hasAnyLogs: initialPointLogs.length > 0,
      pendingCount: pending.length,
    });
  }, [now, isHarvestStage, applesHarvested, stats, initialPointLogs.length, pending.length]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: `linear-gradient(180deg, ${accent.mePageBg} 0%, ${accent.mePageBgEnd} 100%)`,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: 16,
        fontFamily: '"Pretendard Variable", "Pretendard", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        transition: "background 600ms ease",
      }}
    >
      <div
        style={{
          background: isHarvestStage ? "#fff5d6" : "#fff",
          borderRadius: 24,
          padding: 14,
          width: "100%",
          maxWidth: 460,
          boxShadow: isHarvestStage
            ? "0 0 0 4px rgba(240,192,80,0.45), 0 10px 40px rgba(61,40,24,0.12)"
            : "0 10px 40px rgba(61,40,24,0.08)",
          border: `2px solid ${isHarvestStage ? "#e8a020" : "#f1e8d8"}`,
        }}
      >
        {!row ? (
          <>
            <div style={{ textAlign: "center", marginBottom: 16, paddingTop: 8 }}>
              <div style={{ fontSize: 12, color: "#9a8b6c", fontWeight: 600 }}>나의 사과정원</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#1f2937", marginTop: 4 }}>
                {studentName}
              </div>
            </div>
            <div
              style={{
                padding: 20,
                borderRadius: 14,
                background: "#fef9ed",
                color: "#7a6233",
                fontSize: 14,
                lineHeight: 1.6,
                textAlign: "center",
              }}
            >
              아직 나무가 심어지지 않았어요.
              <br />
              원장님께 문의해주세요.
            </div>
          </>
        ) : (
          <>
            {/* === 씬 영역 — 세로 1:1, 가로 16:9 적응. 자식 cqmin 단위 활성화 === */}
            <div
              ref={yardRef}
              className="aspect-square landscape:aspect-[16/9]"
              style={{
                position: "relative",
                borderRadius: 20,
                overflow: "hidden",
                marginBottom: 12,
                background: "#e8d8b8",
                containerType: "size",
              } as React.CSSProperties}
            >
              {/* 마당 글로벌 배경 (관리자) — 설정돼 있으면 학생 본인 background 보다 우선. */}
              {yardBackgroundImage ? (
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage: `url(${yardBackgroundImage})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    borderRadius: 20,
                  }}
                />
              ) : (
                <BackgroundCanvas config={currentBackground} rounded={20} />
              )}

              {/* 마당 소품 — 배경 위, 나무 아래 (편집 모드일 때는 DecorateMode 가 위에서 덮음) */}
              {!decorateMode && (
                <YardLayer items={initialDecorationItems} layout={yardLayout} />
              )}

              {/* 날씨/분위기 효과 오버레이 — 배경 위 / 나무·아바타 아래 */}
              <WeatherEffect weather={weather} />

              {/* 꾸미기 모드 — 마당 박스 내부의 모든 편집 UI */}
              {decorateMode && (
                <DecorateMode
                  items={initialDecorationItems}
                  initialLayout={yardLayout}
                  initialSceneLayout={effectiveScene}
                  treeNode={
                    <AppleTree
                      stage={stage}
                      size="xl"
                      mood={treeMood}
                      wilted={isNegative}
                      growthBoost={progress}
                      imageConfig={treeStages[stage] ?? null}
                    />
                  }
                  avatarNode={
                    row.avatar ? (
                      <AvatarFigurePreloaded
                        config={currentAvatar}
                        size={AVATAR_NATURAL_PX}
                        galleryPositions={galleryPositions}
                      />
                    ) : null
                  }
                  monsterNode={(() => {
                    if (!initialMonster || !initialMonsterSpecies) return null;
                    const pick = pickStageImage(initialMonsterStages, initialMonster.current_stage);
                    if (!pick.url) return null;
                    return (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={pick.url}
                        alt={initialMonster.nickname}
                        draggable={false}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "contain",
                          filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.3))",
                        }}
                      />
                    );
                  })()}
                  treeNaturalPx={TREE_NATURAL_PX}
                  avatarNaturalPx={AVATAR_NATURAL_PX}
                  monsterNaturalPx={MONSTER_NATURAL_PX}
                  cqminPx={cqminPx}
                  onCancel={() => setDecorateMode(false)}
                  onSave={async ({ layout: next, sceneLayout: nextScene }) => {
                    const r = await replaceYardLayoutAction({
                      items: next.map((l) => ({
                        decorationItemId: l.decoration_item_id,
                        instanceId: l.instance_id,
                        positionX: l.position_x,
                        positionY: l.position_y,
                        widthPercent: l.width_percent,
                        rotation: l.rotation ?? 0,
                        zIndex: l.z_index,
                      })),
                      sceneLayout: nextScene,
                    });
                    if (!r.ok) return { ok: false, message: r.message };
                    setYardLayout(next);
                    setSceneLayout(nextScene);
                    setDecorateMode(false);
                    return { ok: true };
                  }}
                />
              )}

              {/* 이름 오버레이 (좌상단) */}
              <div
                style={{
                  position: "absolute",
                  top: 14,
                  left: 14,
                  zIndex: 5,
                  pointerEvents: "none",
                }}
              >
                <div
                  className="font-galmuri"
                  style={{
                    fontSize: 20,
                    fontWeight: 400,
                    color: "#fff",
                    textShadow: "0 1px 3px rgba(0,0,0,0.45)",
                    lineHeight: 1.2,
                  }}
                >
                  {studentName}
                </div>
                {row.grade && (
                  <div
                    className="font-pretendard"
                    style={{
                      fontSize: 11,
                      color: "rgba(255,255,255,0.65)",
                      marginTop: 2,
                      fontWeight: 400,
                      textShadow: "0 1px 3px rgba(0,0,0,0.4)",
                    }}
                  >
                    {row.grade}
                  </div>
                )}
              </div>

              {/* 포인트 오버레이 (우상단) */}
              <div
                style={{
                  position: "absolute",
                  top: 12,
                  right: 12,
                  zIndex: 5,
                  padding: "8px 14px",
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.18)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  border: "1px solid rgba(255,255,255,0.22)",
                  textAlign: "center",
                  minWidth: 66,
                }}
              >
                <div
                  className="font-galmuri"
                  style={{
                    fontSize: 20,
                    fontWeight: 400,
                    color: "#fff",
                    fontVariantNumeric: "tabular-nums",
                    lineHeight: 1,
                    textShadow: "0 1px 2px rgba(0,0,0,0.35)",
                  }}
                >
                  {points}
                </div>
                <div
                  className="font-pretendard"
                  style={{
                    fontSize: 8,
                    color: "rgba(255,255,255,0.55)",
                    letterSpacing: "0.14em",
                    fontWeight: 400,
                    marginTop: 3,
                  }}
                >
                  POINT
                </div>
              </div>

              {/* 수확 가능 배지 */}
              {isHarvestStage && (
                <div
                  className="harvest-pulse"
                  style={{
                    position: "absolute",
                    top: 70,
                    right: 12,
                    zIndex: 5,
                    padding: "4px 12px",
                    borderRadius: 999,
                    background: "#f0c050",
                    color: "#3d2818",
                    fontSize: 11,
                    fontWeight: 800,
                    border: "2px solid #3d2818",
                  }}
                >
                  ★ 수확 가능!
                </div>
              )}

              {/* 나무 + 아바타 — 절대 좌표 (sceneLayout 기반). 편집 모드일 땐 DecorateMode 가 자체 렌더. */}
              {!decorateMode && (
                <>
                  <SceneActor
                    layout={effectiveScene.tree}
                    naturalPx={TREE_NATURAL_PX}
                    cqminPx={cqminPx}
                    zIndex={2}
                    animation="sway"
                  >
                    {isPositive && highlight && <GlowRing key={`ring-${highlight.id}`} />}
                    <div key={shakeKey} className={isPositive ? "tree-shake" : undefined}>
                      <AppleTree
                        stage={stage}
                        size="xl"
                        mood={treeMood}
                        wilted={isNegative}
                        growthBoost={progress}
                        imageConfig={treeStages[stage] ?? null}
                      />
                    </div>
                    {isPositive && <SprayWaterMe />}
                    {isFresh && highlight && (
                      <PtFloat key={highlight.id} delta={highlight.delta} reason={highlight.reason} />
                    )}
                  </SceneActor>
                  {row.avatar && (
                    <SceneActor
                      layout={effectiveScene.avatar}
                      naturalPx={AVATAR_NATURAL_PX}
                      cqminPx={cqminPx}
                      zIndex={3}
                      animation="bob"
                    >
                      <AvatarFigurePreloaded
                        config={currentAvatar}
                        size={AVATAR_NATURAL_PX}
                        galleryPositions={galleryPositions}
                      />
                    </SceneActor>
                  )}

                  {/* 진화 완료 몬스터들 — 자동 배치 (뒤편 작은 크기) */}
                  {initialEvolvedMonsters.map((em, idx) => {
                    const sp = initialMonsterSpeciesById[em.species_id];
                    const stages = initialMonsterStagesBySpecies[em.species_id] ?? [];
                    if (!sp) return null;
                    return (
                      <MonsterActor
                        key={em.id}
                        monster={em}
                        species={sp}
                        stages={stages}
                        cqminPx={cqminPx}
                        evolvedIndex={idx}
                        evolvedTotal={initialEvolvedMonsters.length}
                      />
                    );
                  })}

                  {/* 활성 몬스터 (있을 때) — 진화 직후면 glow */}
                  {initialMonster && initialMonsterSpecies && (
                    <MonsterActor
                      monster={initialMonster}
                      species={initialMonsterSpecies}
                      stages={initialMonsterStages}
                      cqminPx={cqminPx}
                      isActive
                      layoutOverride={effectiveScene.monster}
                      justEvolved={!!justEvolved}
                      onTap={() => setMonsterInfoOpen((v) => !v)}
                      infoOpen={monsterInfoOpen}
                    />
                  )}
                </>
              )}

              {/* 몬스터 EXP 정보 말풍선 — 탭 시에만 표시 (MonsterActor 내부에서 렌더) */}

              {/* 하단 기분 전광판 */}
              <MoodTicker text={row.mood_text ?? ""} borderRadius={20} />
            </div>

            {/* === 하단 정보 영역 === */}

            {/* 받을 포인트 (액션 아이템 - 항상 표시) */}
            {pending.length > 0 && (
              <PendingClaimSection
                pending={pending}
                claimingId={claimingId}
                error={claimError}
                onClaim={onClaim}
              />
            )}

            {/* 단계 + 프로그레스 바 */}
            <div className="bg-[#F5F0E6] rounded-2xl px-3.5 py-3 mb-2.5">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: accent.meBarFill,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    className="font-galmuri text-gray-900 truncate"
                    style={{ fontSize: 13, fontWeight: 400 }}
                  >
                    {stage}단계 · {info.name}
                  </span>
                </div>
                <div
                  className="font-pretendard text-gray-500 flex-shrink-0"
                  style={{ fontSize: 11, fontWeight: 400 }}
                >
                  {info.nextThreshold === null ? "최고 단계" : `다음 단계까지 ${remain}P`}
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
                <div
                  style={{
                    width: `${Math.round(progress * 100)}%`,
                    height: "100%",
                    background: accent.meBarFill,
                    transition: "width 600ms ease",
                    borderRadius: 999,
                  }}
                />
              </div>
            </div>

            {/* 액션 버튼 (배경은 관리자만 — 학생 측 버튼 제거) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <button
                type="button"
                onClick={() => setAvatarSheetOpen(true)}
                className="font-pretendard bg-white border border-gray-200 rounded-xl py-3 text-gray-700 hover:bg-gray-50 transition"
                style={{ fontSize: 13, fontWeight: 500 }}
              >
                아바타 꾸미기
              </button>
              <button
                type="button"
                onClick={() => setMoodSheetOpen(true)}
                className="font-pretendard bg-white border border-gray-200 rounded-xl py-3 text-gray-700 hover:bg-gray-50 transition"
                style={{ fontSize: 13, fontWeight: 500 }}
              >
                한마디
              </button>
              <button
                type="button"
                onClick={() => setWeatherSheetOpen(true)}
                className="font-pretendard bg-white border border-gray-200 rounded-xl py-3 text-gray-700 hover:bg-gray-50 transition"
                style={{ fontSize: 13, fontWeight: 500 }}
              >
                ☁️ 분위기
              </button>
              <button
                type="button"
                onClick={() => setDecorateMode(true)}
                className="font-pretendard bg-amber-50 border border-amber-200 rounded-xl py-3 text-amber-800 hover:bg-amber-100 transition"
                style={{ fontSize: 13, fontWeight: 700 }}
              >
                🎨 마당 꾸미기
              </button>
            </div>

            {/* 활동 기록 · 마일스톤 (접기/펼치기) */}
            <DetailsCollapse title="활동 기록 · 마일스톤">
              <RecentActivity logs={initialPointLogs} now={now} />

              {encouragement && (
                <EncouragementCard text={encouragement.text} tone={encouragement.tone} />
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  marginBottom: 14,
                }}
              >
                <AnimatedStat label="누적 포인트" value={points} unit="P" />
                <Stat label="수확한 사과" value={`${applesHarvested}개`} tone="primary" />
                <Stat
                  label="이번 주 적립"
                  value={now === null ? "—" : `${stats.weekTotal >= 0 ? "+" : ""}${stats.weekTotal} P`}
                  tone={stats.weekTotal >= 0 ? "positive" : "negative"}
                />
                <Stat
                  label="이번 달 적립"
                  value={now === null ? "—" : `${stats.monthTotal >= 0 ? "+" : ""}${stats.monthTotal} P`}
                  tone={stats.monthTotal >= 0 ? "positive" : "negative"}
                />
              </div>

              {nextStage && nextInfo && nextAccent && (
                <NextStagePreview
                  stage={nextStage}
                  name={nextInfo.name}
                  threshold={nextInfo.threshold}
                  emoji={nextAccent.emoji}
                  badgeBg={nextAccent.meBadgeBg}
                  badgeText={nextAccent.meBadgeText}
                />
              )}

              <Section title="🏆 마일스톤">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {milestones.map(({ key, ...rest }) => (
                    <MilestoneBadge key={key} {...rest} />
                  ))}
                </div>
              </Section>

              {initialHarvests.length > 0 && (
                <Section title="🍎 수확 히스토리">
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                    {initialHarvests.slice(0, 5).map((h) => (
                      <HarvestRow key={h.id} harvest={h} now={now} />
                    ))}
                  </ul>
                </Section>
              )}

              <div style={{ marginTop: 10, fontSize: 11, color: "#b09a7c", textAlign: "center" }}>
                {STAGE_TABLE.length}단계 중 {stage}단계
              </div>
            </DetailsCollapse>
          </>
        )}

        <div className="mt-4 text-center">
          <Link
            href="/me/village"
            className="font-pretendard text-amber-600 no-underline hover:text-amber-700"
            style={{ fontSize: 13, fontWeight: 500 }}
          >
            🏘️ 몬스터 마을로
          </Link>
        </div>
      </div>

      <div
        aria-live="polite"
        style={{
          position: "fixed",
          left: "50%",
          bottom: 24,
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column-reverse",
          gap: 8,
          zIndex: 50,
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} />
        ))}
      </div>

      {stageUp && (
        <StageUpModal
          stage={stageUp.stage}
          name={stageUp.name}
          isHarvest={stageUp.isHarvest}
          studentName={studentName}
          onClose={() => setStageUp(null)}
        />
      )}

      {harvestBanner && (
        <HarvestModal
          applesCount={harvestBanner.applesCount}
          studentName={studentName}
          onClose={() => setHarvestBanner(null)}
        />
      )}

      <AvatarEditSheet
        open={avatarSheetOpen}
        initial={currentAvatar}
        onClose={() => setAvatarSheetOpen(false)}
        onSaved={(next) => setRow((prev) => (prev ? { ...prev, avatar: next } : prev))}
        onReset={async () => {
          const r = await resetAvatarAction();
          if (r.ok) {
            setRow((prev) => (prev ? { ...prev, avatar: null } : prev));
            setAvatarSheetOpen(false);
          } else {
            window.alert(r.message);
          }
        }}
      />


      <MoodEditSheet
        open={moodSheetOpen}
        initial={row?.mood_text ?? ""}
        onClose={() => setMoodSheetOpen(false)}
        onSaved={(next) => setRow((prev) => (prev ? { ...prev, mood_text: next } : prev))}
      />

      {/* 몬스터 진화 축하 모달 */}
      {evolutionBanner && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55"
          onClick={() => setEvolutionBanner(null)}
        >
          <div
            className="bg-white rounded-3xl px-8 py-7 max-w-xs text-center shadow-2xl scene-evolution-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-5xl mb-3 scene-evolution-bounce">🎉✨</div>
            <h2 className="font-pretendard text-xl font-extrabold text-amber-800 mb-2">
              진화!
            </h2>
            <p className="text-sm text-gray-700 font-pretendard leading-relaxed">
              <strong>{evolutionBanner.nickname}</strong>이(가)
              <br />
              <span className="text-amber-700 font-bold">{evolutionBanner.newStageName}</span>
              {"이(가) 되었어요!"}
            </p>
            <button
              type="button"
              onClick={() => setEvolutionBanner(null)}
              className="mt-5 w-full font-pretendard text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-xl py-2.5 transition"
            >
              계속 키우기
            </button>
          </div>
        </div>
      )}

      <WeatherPickerSheet
        open={weatherSheetOpen}
        current={weather}
        onClose={() => setWeatherSheetOpen(false)}
        onApplied={(w) => setWeather(w)}
      />
    </main>
  );
}

function PendingClaimSection({
  pending,
  claimingId,
  error,
  onClaim,
}: {
  pending: PendingClaim[];
  claimingId: string | null;
  error: string | null;
  onClaim: (id: string) => void;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontSize: 12,
          color: "#8a6f52",
          fontWeight: 800,
          marginBottom: 8,
          letterSpacing: "0.02em",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span>🎁 받을 포인트</span>
        <span
          style={{
            background: "#f0c050",
            color: "#3d2818",
            padding: "2px 8px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 800,
            border: "1.5px solid #3d2818",
          }}
        >
          {pending.length}개
        </span>
      </div>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {pending.map((p) => (
          <PendingClaimCard
            key={p.id}
            p={p}
            claiming={claimingId === p.id}
            disabled={!!claimingId && claimingId !== p.id}
            onClaim={() => onClaim(p.id)}
          />
        ))}
      </ul>
      {error && (
        <div
          role="alert"
          style={{
            marginTop: 8,
            background: "#fef2f0",
            border: "1.5px solid #f5cdc4",
            color: "#b04020",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

function PendingClaimCard({
  p,
  claiming,
  disabled,
  onClaim,
}: {
  p: PendingClaim;
  claiming: boolean;
  disabled: boolean;
  onClaim: () => void;
}) {
  const isPositive = p.points > 0;
  const palette = isPositive
    ? { bg: "#fff8e8", border: "#f0c050", btnBg: "#5e9c38", numColor: "#4a8030" }
    : { bg: "#fef2f0", border: "#f5cdc4", btnBg: "#b04020", numColor: "#b04020" };

  return (
    <li
      className="banner-pop"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        background: palette.bg,
        border: `2px solid ${palette.border}`,
        borderRadius: 14,
      }}
    >
      <div
        style={{
          fontSize: 20,
          fontWeight: 800,
          color: palette.numColor,
          fontVariantNumeric: "tabular-nums",
          minWidth: 60,
          textAlign: "center",
        }}
      >
        {isPositive ? "+" : ""}
        {p.points} P
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 13,
          fontWeight: 700,
          color: "#3d2818",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {p.reason ?? (isPositive ? "포인트 적립" : "포인트 차감")}
      </div>
      <button
        onClick={onClaim}
        disabled={claiming || disabled}
        style={{
          padding: "8px 18px",
          borderRadius: 999,
          background: claiming || disabled ? "#d6c2a0" : palette.btnBg,
          color: "#fff",
          border: "2px solid #3d2818",
          fontSize: 13,
          fontWeight: 800,
          cursor: claiming || disabled ? "not-allowed" : "pointer",
          minWidth: 70,
          flexShrink: 0,
        }}
      >
        {claiming ? "적용 중…" : isPositive ? "받기" : "확인"}
      </button>
    </li>
  );
}

function AnimatedStat({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit: string;
}) {
  const [display, setDisplay] = useState(value);
  const [popKey, setPopKey] = useState(0);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    setPopKey((k) => k + 1);
    const duration = 700;
    const start = performance.now();
    let raf = 0;
    const tick = (ts: number) => {
      const t = Math.min(1, (ts - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const cur = Math.round(from + (to - from) * eased);
      setDisplay(cur);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <div
      style={{
        background: "#fff8e8",
        borderRadius: 12,
        padding: "10px 12px",
        textAlign: "center",
        border: "1.5px solid #f1e8d8",
      }}
    >
      <div style={{ fontSize: 11, color: "#9a8b6c", fontWeight: 600 }}>{label}</div>
      <div
        key={popKey}
        className={popKey > 0 ? "number-pop" : undefined}
        style={{
          fontSize: 16,
          fontWeight: 800,
          color: "#1f2937",
          marginTop: 4,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {display} {unit}
      </div>
    </div>
  );
}

function PtFloat({ delta, reason }: { delta: number; reason: string | null }) {
  const isPositive = delta > 0;
  return (
    <div
      className="pt-float"
      style={{
        position: "absolute",
        top: "10%",
        left: "50%",
        zIndex: 6,
        pointerEvents: "none",
        textAlign: "center",
        whiteSpace: "nowrap",
      }}
    >
      <div
        style={{
          display: "inline-block",
          padding: "10px 22px",
          borderRadius: 999,
          background: isPositive ? "#5e9c38" : "#b04020",
          color: "#fff",
          fontSize: 38,
          fontWeight: 900,
          fontVariantNumeric: "tabular-nums",
          border: "3px solid #3d2818",
          boxShadow: "0 12px 32px rgba(61,40,24,0.40)",
          letterSpacing: "-0.02em",
        }}
      >
        {isPositive ? "+" : ""}
        {delta} P
      </div>
      {reason && (
        <div
          style={{
            marginTop: 6,
            display: "inline-block",
            padding: "4px 12px",
            borderRadius: 999,
            background: "#3d2818",
            color: "#fff",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.02em",
            boxShadow: "0 4px 10px rgba(61,40,24,0.30)",
          }}
        >
          {reason}
        </div>
      )}
    </div>
  );
}

function GlowRing() {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 1,
      }}
    >
      {[0, 280, 560].map((delay) => (
        <div
          key={delay}
          className="ring-pulse"
          style={{
            position: "absolute",
            top: "55%",
            left: "50%",
            width: 120,
            height: 120,
            borderRadius: "50%",
            border: "4px solid #7fc6e8",
            background: "radial-gradient(circle, rgba(168,224,255,0.35), rgba(168,224,255,0))",
            animationDelay: `${delay}ms`,
          }}
        />
      ))}
    </div>
  );
}

function ToastCard({ toast }: { toast: Toast }) {
  const isPositive = toast.points >= 0;
  return (
    <div
      className="toast-in"
      style={{
        background: isPositive ? "#5e9c38" : "#b04020",
        color: "#fff",
        padding: "10px 16px",
        borderRadius: 999,
        fontSize: 14,
        fontWeight: 800,
        boxShadow: "0 8px 20px rgba(61,40,24,0.25)",
        border: "2px solid #3d2818",
        display: "flex",
        alignItems: "center",
        gap: 10,
        whiteSpace: "nowrap",
        maxWidth: "calc(100vw - 40px)",
      }}
    >
      <span style={{ fontSize: 16 }}>{isPositive ? "✨" : "⚠️"}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>
        {isPositive ? "+" : ""}
        {toast.points} P
      </span>
      {toast.reason && (
        <>
          <span style={{ opacity: 0.6 }}>·</span>
          <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>
            {toast.reason}
          </span>
        </>
      )}
    </div>
  );
}

function StageUpModal({
  stage,
  name,
  isHarvest,
  studentName,
  onClose,
}: {
  stage: number;
  name: string;
  isHarvest: boolean;
  studentName: string;
  onClose: () => void;
}) {
  const accent = STAGE_ACCENT[stage as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8] ?? STAGE_ACCENT[1];
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(61,40,24,0.35)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 100,
        cursor: "pointer",
      }}
    >
      <div
        className="banner-pop"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: isHarvest
            ? "linear-gradient(180deg, #fff5d6 0%, #f0c050 100%)"
            : "linear-gradient(180deg, #fff 0%, #fff5d6 100%)",
          border: `3px solid ${isHarvest ? "#e8a020" : "#3d2818"}`,
          borderRadius: 28,
          padding: "32px 28px",
          textAlign: "center",
          maxWidth: 360,
          boxShadow: "0 20px 60px rgba(61,40,24,0.35)",
          cursor: "default",
        }}
      >
        <div style={{ fontSize: 56, lineHeight: 1, marginBottom: 8 }}>
          {isHarvest ? "🎉" : accent.emoji}
        </div>
        <div style={{ fontSize: 14, color: "#8a6f52", fontWeight: 700, marginBottom: 4 }}>
          축하해요!
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#3d2818", marginBottom: 8 }}>
          {studentName} 학생
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#3d2818" }}>
          {isHarvest ? (
            <>
              사과를 <span style={{ color: "#b02020" }}>수확</span>할 수 있어요!
            </>
          ) : (
            <>
              <span style={{ color: "#4a8030" }}>{name}</span> 단계로 성장!
            </>
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            marginTop: 18,
            padding: "8px 20px",
            borderRadius: 999,
            background: "#3d2818",
            color: "#fff",
            fontSize: 13,
            fontWeight: 800,
            border: "none",
            cursor: "pointer",
          }}
        >
          확인
        </button>
      </div>
    </div>
  );
}

function HarvestModal({
  applesCount,
  studentName,
  onClose,
}: {
  applesCount: number;
  studentName: string;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(61,40,24,0.35)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 100,
        cursor: "pointer",
      }}
    >
      <div
        className="banner-pop"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "linear-gradient(180deg, #fff5d6 0%, #f7d878 100%)",
          border: "3px solid #e8a020",
          borderRadius: 28,
          padding: "32px 28px",
          textAlign: "center",
          maxWidth: 360,
          boxShadow: "0 20px 60px rgba(61,40,24,0.35)",
          cursor: "default",
        }}
      >
        <div style={{ fontSize: 56, lineHeight: 1, marginBottom: 8 }}>🍎</div>
        <div style={{ fontSize: 14, color: "#8a6f52", fontWeight: 700, marginBottom: 4 }}>
          수확 완료!
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#3d2818", marginBottom: 8 }}>
          {studentName} 학생
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#3d2818" }}>
          사과 <span style={{ color: "#b02020" }}>{applesCount}개</span> 를 수확했어요!
        </div>
        <button
          onClick={onClose}
          style={{
            marginTop: 18,
            padding: "8px 20px",
            borderRadius: 999,
            background: "#3d2818",
            color: "#fff",
            fontSize: 13,
            fontWeight: 800,
            border: "none",
            cursor: "pointer",
          }}
        >
          확인
        </button>
      </div>
    </div>
  );
}

function EncouragementCard({
  text,
  tone,
}: {
  text: string;
  tone: "celebrate" | "warm" | "neutral" | "soft";
}) {
  const palette: Record<typeof tone, { bg: string; border: string; color: string }> = {
    celebrate: { bg: "#fff5d6", border: "#f0c050", color: "#3d2818" },
    warm: { bg: "#f0fae6", border: "#a8e070", color: "#3d2818" },
    neutral: { bg: "#fff8e8", border: "#e8d8b8", color: "#3d2818" },
    soft: { bg: "#eef4f9", border: "#bcd2e2", color: "#3d2818" },
  };
  const p = palette[tone];
  return (
    <div
      style={{
        background: p.bg,
        border: `1.5px solid ${p.border}`,
        borderRadius: 14,
        padding: "10px 14px",
        textAlign: "center",
        marginBottom: 14,
        fontSize: 13,
        fontWeight: 700,
        color: p.color,
        lineHeight: 1.5,
      }}
    >
      {text}
    </div>
  );
}

function NextStagePreview({
  stage,
  name,
  threshold,
  emoji,
  badgeBg,
  badgeText,
}: {
  stage: number;
  name: string;
  threshold: number;
  emoji: string;
  badgeBg: string;
  badgeText: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        background: "#fffaf2",
        border: "1.5px dashed #d6c2a0",
        borderRadius: 14,
        marginBottom: 14,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 999,
          background: badgeBg,
          color: badgeText,
          fontSize: 22,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          border: "2px solid #3d2818",
        }}
      >
        {emoji}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: "#9a8b6c", fontWeight: 700, letterSpacing: "0.02em" }}>
          다음 단계
        </div>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#1f2937", marginTop: 2 }}>
          {stage}단계 · {name}
        </div>
        <div style={{ fontSize: 11, color: "#9a8b6c", fontWeight: 600, marginTop: 1 }}>
          {threshold}P 도달 시 자라남
        </div>
      </div>
    </div>
  );
}

function MilestoneBadge({
  emoji,
  name,
  achieved,
}: {
  emoji: string;
  name: string;
  achieved: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        padding: "10px 4px",
        background: achieved ? "#fff5d6" : "#f5f0e6",
        border: `1.5px solid ${achieved ? "#f0c050" : "#e0d4be"}`,
        borderRadius: 12,
        opacity: achieved ? 1 : 0.55,
        transition: "all 240ms ease",
      }}
    >
      <div style={{ fontSize: 22, filter: achieved ? "none" : "grayscale(0.7)" }}>{emoji}</div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: achieved ? "#3d2818" : "#9a8b6c",
          textAlign: "center",
        }}
      >
        {name}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "primary",
}: {
  label: string;
  value: string;
  tone?: "primary" | "positive" | "negative";
}) {
  const palette =
    tone === "positive"
      ? { bg: "#f0fae6", border: "#d8ebbf", color: "#4a8030" }
      : tone === "negative"
        ? { bg: "#fef2f0", border: "#f5cdc4", color: "#b04020" }
        : { bg: "#fff8e8", border: "#f1e8d8", color: "#1f2937" };
  return (
    <div
      style={{
        background: palette.bg,
        borderRadius: 12,
        padding: "10px 12px",
        textAlign: "center",
        border: `1.5px solid ${palette.border}`,
      }}
    >
      <div style={{ fontSize: 11, color: "#9a8b6c", fontWeight: 600 }}>{label}</div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 800,
          color: palette.color,
          marginTop: 4,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div
        style={{
          fontSize: 12,
          color: "#8a6f52",
          fontWeight: 800,
          marginBottom: 8,
          letterSpacing: "0.02em",
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: "16px 12px",
        textAlign: "center",
        color: "#b09a7c",
        fontSize: 13,
        background: "#fff8e8",
        borderRadius: 12,
        border: "1.5px dashed #e8d8b8",
      }}
    >
      {text}
    </div>
  );
}

function LogRow({ log }: { log: PointLog }) {
  const isPositive = log.points >= 0;
  return (
    <li
      className="flex items-center gap-3 py-1.5"
    >
      <div
        className="font-galmuri text-right"
        style={{
          width: 36,
          fontSize: 12,
          fontWeight: 400,
          fontVariantNumeric: "tabular-nums",
          color: isPositive ? "#4a8030" : "#b04020",
        }}
      >
        {isPositive ? "+" : ""}
        {log.points}
      </div>
      <div
        className="font-pretendard text-gray-700 truncate flex-1"
        style={{ fontSize: 12, fontWeight: 400 }}
      >
        {log.reason ?? (isPositive ? "포인트 적립" : "포인트 차감")}
      </div>
    </li>
  );
}

function RecentActivity({ logs, now }: { logs: PointLog[]; now: Date | null }) {
  if (!now) {
    return null;
  }
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const today: PointLog[] = [];
  const yesterday: PointLog[] = [];
  for (const log of logs) {
    const t = new Date(log.logged_at).getTime();
    if (t >= todayStart.getTime()) today.push(log);
    else if (t >= yesterdayStart.getTime()) yesterday.push(log);
  }

  return (
    <div className="mt-4">
      <DayGroup label="오늘" logs={today} emptyText="오늘 활동이 없어요" />
      {yesterday.length > 0 && (
        <div className="mt-3">
          <DayGroup label="어제" logs={yesterday} />
        </div>
      )}
    </div>
  );
}

function DayGroup({
  label,
  logs,
  emptyText,
}: {
  label: string;
  logs: PointLog[];
  emptyText?: string;
}) {
  return (
    <div>
      <div
        className="font-pretendard text-gray-500 mb-1.5"
        style={{ fontSize: 12, fontWeight: 500 }}
      >
        {label}
      </div>
      {logs.length === 0 && emptyText ? (
        <div
          className="font-pretendard text-gray-400 py-2"
          style={{ fontSize: 12, fontWeight: 400 }}
        >
          {emptyText}
        </div>
      ) : (
        <ul className="list-none p-0 m-0">
          {logs.map((log) => (
            <LogRow key={log.id} log={log} />
          ))}
        </ul>
      )}
    </div>
  );
}

function HarvestRow({ harvest, now }: { harvest: Harvest; now: Date | null }) {
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        borderRadius: 10,
        background: "#fff5d6",
        border: "1.5px solid #f0c050",
      }}
    >
      <div style={{ fontSize: 18 }}>🍎</div>
      <div style={{ flex: 1, fontSize: 13, fontWeight: 800, color: "#3d2818" }}>
        사과 {harvest.apples_count}개 수확!
      </div>
      <div style={{ fontSize: 11, color: "#8a6f52", fontWeight: 600, flexShrink: 0 }}>
        {now ? formatRelative(harvest.harvested_at, now) : ""}
      </div>
    </li>
  );
}

function DetailsCollapse({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        background: "transparent",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="font-pretendard w-full flex items-center justify-center gap-1 py-2 bg-transparent border-none cursor-pointer text-gray-400 hover:text-gray-600 transition"
        style={{ fontSize: 11, fontWeight: 500 }}
      >
        <span>{title}</span>
        <span
          style={{
            fontSize: 9,
            transform: open ? "rotate(0deg)" : "rotate(-90deg)",
            transition: "transform 200ms ease",
            display: "inline-block",
          }}
          aria-hidden
        >
          ▼
        </span>
      </button>
      {open && (
        <div style={{ padding: "0 14px 14px" }}>
          {children}
        </div>
      )}
    </div>
  );
}

function SceneActor({
  layout,
  naturalPx,
  cqminPx,
  zIndex = 2,
  animation,
  children,
}: {
  layout: import("@/lib/types").SceneItemLayout;
  naturalPx: number;
  cqminPx: number;
  zIndex?: number;
  // 미세 idle 애니메이션 — 살아있는 느낌. 부모의 transform 과 충돌하지 않도록
  // 자식 wrapper 에 적용.
  animation?: "bob" | "sway";
  children: React.ReactNode;
}) {
  // 외부 wrapper: 절대 좌표로 (x%, y%) 에 0px 점 만들고 translate(-50%,-50%) 로 자식 중심을 그 점에 정렬.
  // 내부 wrapper: 자식의 자연 크기(naturalPx) 로 box 잡고 transform: scale 로 확대/축소.
  const scale = cqminPx > 0 ? (layout.width * cqminPx) / naturalPx : 1;
  const animClass =
    animation === "bob" ? "scene-idle-bob" : animation === "sway" ? "scene-tree-sway" : "";
  return (
    <div
      aria-hidden={false}
      style={{
        position: "absolute",
        left: `${layout.x}%`,
        top: `${layout.y}%`,
        width: 0,
        height: 0,
        zIndex,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: -naturalPx / 2,
          top: -naturalPx / 2,
          width: naturalPx,
          height: naturalPx,
          transform: `scale(${scale * (layout.flipX ? -1 : 1)}, ${scale}) rotate(${layout.rotation ?? 0}deg)`,
          transformOrigin: "center",
        }}
      >
        {animClass ? (
          <div className={animClass} style={{ width: "100%", height: "100%" }}>
            {children}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

/* ============== 몬스터 렌더 ============== */

const MONSTER_NATURAL_PX = 220;
const MONSTER_DEFAULT_LAYOUT: import("@/lib/types").SceneItemLayout = {
  x: 28,
  y: 88,
  width: 22,
};

function pickStageImage(
  stages: import("@/lib/types").MonsterStageImage[],
  currentStage: number,
): { url: string; isFallback: boolean; targetStageName: string | null } {
  // 1) 현재 단계 이미지 있으면 그대로
  const cur = stages.find((s) => s.stage === currentStage);
  if (cur?.image_url) return { url: cur.image_url, isFallback: false, targetStageName: null };
  // 2) 이전 단계 이미지 fallback
  for (let s = currentStage - 1; s >= 1; s--) {
    const prev = stages.find((x) => x.stage === s);
    if (prev?.image_url) {
      return {
        url: prev.image_url,
        isFallback: true,
        targetStageName: cur?.stage_name ?? null,
      };
    }
  }
  return { url: "", isFallback: true, targetStageName: cur?.stage_name ?? null };
}

// 진화 완료 몬스터 자동 배치: 윗줄에 가로로 분산 (최대 5칸, 넘으면 다음 줄).
function evolvedLayout(index: number): import("@/lib/types").SceneItemLayout {
  const colsPerRow = 5;
  const col = index % colsPerRow;
  const rowIdx = Math.floor(index / colsPerRow);
  const x = 14 + col * 18; // 14, 32, 50, 68, 86
  const y = 68 + rowIdx * 12; // 68, 80, ...
  return { x, y, width: 14 };
}

function MonsterActor({
  monster,
  species,
  stages,
  cqminPx,
  isActive = false,
  layoutOverride,
  justEvolved = false,
  evolvedIndex = 0,
  onTap,
  infoOpen = false,
}: {
  monster: import("@/lib/types").StudentMonster;
  species: import("@/lib/types").MonsterSpecies;
  stages: import("@/lib/types").MonsterStageImage[];
  cqminPx: number;
  isActive?: boolean;
  layoutOverride?: import("@/lib/types").SceneItemLayout;
  justEvolved?: boolean;
  evolvedIndex?: number;
  evolvedTotal?: number;
  onTap?: () => void;
  infoOpen?: boolean;
}) {
  const pick = pickStageImage(stages, monster.current_stage);
  if (!pick.url) {
    return null;
  }
  const layout = isActive
    ? (layoutOverride ?? MONSTER_DEFAULT_LAYOUT)
    : evolvedLayout(evolvedIndex);
  const scale = cqminPx > 0 ? (layout.width * cqminPx) / MONSTER_NATURAL_PX : 1;

  return (
    <div
      style={{
        position: "absolute",
        left: `${layout.x}%`,
        top: `${layout.y}%`,
        width: 0,
        height: 0,
        // 활성 몬스터가 앞, 진화 완료 몬스터는 뒤 (z 낮게)
        zIndex: isActive ? 4 : 2,
      }}
      className={justEvolved ? "scene-evolution-glow" : undefined}
      onClick={onTap ? () => onTap() : undefined}
    >
      {/* 정보 말풍선 — 탭 시 표시 (활성 몬스터만) */}
      {isActive && infoOpen && (
        <MonsterInfoBubble monster={monster} species={species} stages={stages} />
      )}
      <div
        style={{
          position: "absolute",
          left: -MONSTER_NATURAL_PX / 2,
          top: -MONSTER_NATURAL_PX / 2,
          width: MONSTER_NATURAL_PX,
          height: MONSTER_NATURAL_PX,
          transform: `scale(${scale * (layout.flipX ? -1 : 1)}, ${scale}) rotate(${layout.rotation ?? 0}deg)`,
          transformOrigin: "center",
          cursor: onTap ? "pointer" : undefined,
        }}
      >
        {/* 미세 idle bob */}
        <div className="scene-idle-bob" style={{ width: "100%", height: "100%", position: "relative" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pick.url}
            alt={monster.nickname}
            draggable={false}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.3))",
            }}
          />
          {pick.isFallback && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                paddingBottom: 4,
                pointerEvents: "none",
              }}
            >
              <span
                style={{
                  background: "rgba(245, 158, 11, 0.92)",
                  color: "white",
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "3px 8px",
                  borderRadius: 999,
                  whiteSpace: "nowrap",
                  textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
                  // 부모 transform: scale 의 영향 상쇄
                  transform: cqminPx > 0 ? `scale(${1 / Math.max(scale, 0.1)})` : undefined,
                  transformOrigin: "bottom center",
                }}
              >
                ✨ 곧 {pick.targetStageName ?? "변신"}해요!
              </span>
            </div>
          )}
        </div>
        {/* 닉네임 라벨 — 항상 아래에 */}
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: "50%",
            transform: `translateX(-50%) ${cqminPx > 0 ? `scale(${1 / Math.max(scale, 0.1)})` : ""}`,
            transformOrigin: "top center",
            whiteSpace: "nowrap",
            marginTop: 6,
            fontSize: 11,
            fontWeight: 700,
            color: "white",
            textShadow: "0 1px 3px rgba(0,0,0,0.85), 0 0 6px rgba(0,0,0,0.6)",
            pointerEvents: "none",
          }}
        >
          {species.hide_name ? monster.nickname : `${monster.nickname} (${species.name})`}
        </div>
      </div>
    </div>
  );
}

// 몬스터 정보 말풍선 — 활성 몬스터 위에 떠 있는 카드.
// MonsterActor 내부에서 infoOpen=true 일 때만 렌더. 부모의 transform 영향을 받으므로
// 자기 자신은 정상 크기로 보이게 absolute 위치를 outer 0x0 wrapper 기준으로 잡음.
function MonsterInfoBubble({
  monster,
  species,
  stages,
}: {
  monster: import("@/lib/types").StudentMonster;
  species: import("@/lib/types").MonsterSpecies;
  stages: import("@/lib/types").MonsterStageImage[];
}) {
  const currentStage = monster.current_stage;
  const cur = stages.find((s) => s.stage === currentStage);
  const next = stages.find((s) => s.stage === currentStage + 1);

  const isFinal = currentStage >= 5 || !next;
  const fromExp = cur?.required_exp ?? 0;
  const toExp = next?.required_exp ?? fromExp;
  const range = Math.max(1, toExp - fromExp);
  const progressed = Math.max(0, monster.current_exp - fromExp);
  const pct = Math.min(100, Math.round((progressed / range) * 100));
  const imageMissing = next ? !next.image_url : false;

  return (
    <div
      role="status"
      aria-hidden={false}
      style={{
        position: "absolute",
        bottom: "100%",
        left: "50%",
        transform: "translate(-50%, -16px)",
        zIndex: 50,
        minWidth: 180,
        maxWidth: 240,
        padding: "10px 14px",
        background: "rgba(255, 255, 255, 0.97)",
        color: "#1a1a1a",
        borderRadius: 14,
        boxShadow: "0 10px 30px rgba(0,0,0,0.35), 0 2px 6px rgba(0,0,0,0.25)",
        pointerEvents: "none",
        animation: "monster-info-pop 200ms ease-out backwards",
      }}
    >
      <style jsx>{`
        @keyframes monster-info-pop {
          from { opacity: 0; transform: translate(-50%, -10px) scale(0.92); }
          to   { opacity: 1; transform: translate(-50%, -16px) scale(1); }
        }
      `}</style>
      <div style={{ fontSize: 13, fontWeight: 800, textAlign: "center", marginBottom: 4 }}>
        {monster.nickname}
        {!species.hide_name && (
          <span style={{ fontSize: 10, fontWeight: 600, color: "#6b7280", marginLeft: 4 }}>
            · {species.name}
          </span>
        )}
      </div>
      <div style={{ fontSize: 10, fontWeight: 600, color: "#6b7280", textAlign: "center", marginBottom: 6 }}>
        {cur?.stage_name ?? `${currentStage}단계`}
      </div>

      {isFinal ? (
        <div style={{
          fontSize: 11, fontWeight: 700, color: "#b45309", textAlign: "center",
          background: "#fef3c7", padding: "4px 8px", borderRadius: 8,
        }}>
          🏆 최종 진화 도달
        </div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 600, marginBottom: 3 }}>
            <span style={{ color: "#1a1a1a" }}>
              {next!.stage_name}{imageMissing ? " ✨" : ""}
            </span>
            <span style={{ color: "#6b7280" }}>
              {monster.current_exp} / {toExp} EXP
            </span>
          </div>
          <div style={{
            width: "100%", height: 6,
            background: "#f3f4f6", borderRadius: 999, overflow: "hidden",
          }}>
            <div style={{
              width: `${pct}%`, height: "100%",
              background: imageMissing
                ? "linear-gradient(90deg, #fbbf24, #f59e0b)"
                : "linear-gradient(90deg, #34d399, #10b981)",
              transition: "width 300ms ease",
            }} />
          </div>
          {imageMissing && progressed >= range && (
            <div style={{ fontSize: 10, fontWeight: 700, color: "#d97706", marginTop: 4, textAlign: "center" }}>
              곧 부화해요! 🥚✨
            </div>
          )}
        </>
      )}

      {/* 아래쪽 화살표 */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: "100%",
          left: "50%",
          marginLeft: -7,
          width: 0,
          height: 0,
          borderLeft: "7px solid transparent",
          borderRight: "7px solid transparent",
          borderTop: "7px solid rgba(255,255,255,0.97)",
          filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.15))",
        }}
      />
    </div>
  );
}
