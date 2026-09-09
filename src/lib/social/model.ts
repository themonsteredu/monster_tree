import { DECOR_CATALOG, type DecorId } from "@/lib/decor-catalog";
import type { AvatarConfig } from "../types";
import { DEFAULT_LOOK } from "../avatar-v2";

// Shared by server routes and the lightweight client; no server-only imports.
export const SOCIAL_MAX_PLAYERS = 24;
export const SOCIAL_FRIENDS_PAGE_SIZE = 48;
export const SOCIAL_PRESENCE_TTL_MS = 30_000;
export const SOCIAL_POLL_MS = 3_000;
export const SOCIAL_IDLE_HEARTBEAT_MS = 8_000;
export const SOCIAL_MOVE_THROTTLE_MS = 1_500;
export const SOCIAL_MAX_BODY_BYTES = 4_096;
export const SOCIAL_HOME_MAX_BODY_BYTES = 24_576;

export type RoomTheme = "cream" | "sage" | "lilac" | "peach";
export const MAX_ROOM_FURNITURE = 48;
export type FurnitureId = DecorId | "sofa" | "rug" | "desk" | "bed" | "plant" | "shelf" | "lamp";
export type FurniturePlacement = { id: FurnitureId; x: number; y: number; instanceId?: string; rotation?: number; scale?: number; flipX?: boolean; layer?: number };
export type HomeConfig = {
  theme: RoomTheme;
  furniture: FurniturePlacement[];
  allowVisits: boolean;
};
export type SocialProfile = { id: string; name: string; avatar: AvatarConfig };
export type SocialFriend = SocialProfile & { allowVisits: boolean };
export type SocialSelf = SocialProfile & { home: HomeConfig };
export type SocialBootstrap = {
  ok: true;
  self: SocialSelf;
  friends: SocialFriend[];
  nextCursor: string | null;
};
export type SocialVisit = { ok: true; owner: SocialProfile; home: HomeConfig };
export type SocialPlayer = SocialProfile & { x: number; y: number };
export type SocialPresence = { ok: true; players: SocialPlayer[] };
export type SocialError = { ok: false; error: string };
export type SocialSpace = "plaza" | `home:${string}`;

export const ROOM_THEMES: ReadonlyArray<{
  id: RoomTheme; label: string; wall: string; floor: string; accent: string;
}> = [
  { id: "cream", label: "버터 크림", wall: "#f5ebd9", floor: "#ddc6a8", accent: "#e3bb6c" },
  { id: "sage", label: "숲속 세이지", wall: "#e4ebdf", floor: "#c7d3b8", accent: "#8ea783" },
  { id: "lilac", label: "라일락 구름", wall: "#eee5f2", floor: "#d7c6de", accent: "#b99dca" },
  { id: "peach", label: "복숭아 오후", wall: "#f8e6df", floor: "#e8c3b2", accent: "#ddad99" },
];

// Width/height are scene percentages. x/y anchors are center/bottom.
export const FURNITURE_CATALOG: ReadonlyArray<{
  id: FurnitureId; label: string; width: number; height: number; category?: string;
}> = [
  ...DECOR_CATALOG,
  { id: "sofa", label: "포근한 소파", width: 28, height: 23 },
  { id: "rug", label: "동그란 러그", width: 44, height: 22 },
  { id: "desk", label: "작은 책상", width: 24, height: 25 },
  { id: "bed", label: "폭신한 침대", width: 30, height: 31 },
  { id: "plant", label: "초록 화분", width: 12, height: 22 },
  { id: "shelf", label: "나의 책장", width: 19, height: 28 },
  { id: "lamp", label: "따뜻한 조명", width: 10, height: 30 },
];

export function createDefaultHome(): HomeConfig {
  return {
    theme: "cream",
    allowVisits: true,
    furniture: [
      { id: "sofa", x: 28, y: 67 },
      { id: "rug", x: 50, y: 84 },
      { id: "plant", x: 87, y: 76 },
      { id: "shelf", x: 72, y: 66 },
    ],
  };
}

/** Only the admin preview imports this fixture. Never use as a live-data fallback. */
export function createPreviewBootstrap(): SocialBootstrap {
  return {
    ok: true,
    self: { id: "preview-self", name: "나", avatar: { ...DEFAULT_LOOK }, home: createDefaultHome() },
    friends: ["하루", "유나", "도윤", "지우", "소율", "민준"].map((name, index) => ({
      id: `preview-friend-${index + 1}`,
      name,
      avatar: { ...DEFAULT_LOOK },
      allowVisits: index !== 5,
    })),
    nextCursor: null,
  };
}

/** Keep the whole rotated allocation inside the 10:9 room, using a centre pivot.
 * Persisted x/y remain the historical bottom-centre anchor. */
export function fitRoomPlacement(item: FurniturePlacement): FurniturePlacement {
  const definition = FURNITURE_CATALOG.find(entry => entry.id === item.id)!;
  const radians = (item.rotation ?? 0) * Math.PI / 180;
  const cos = Math.abs(Math.cos(radians)), sin = Math.abs(Math.sin(radians));
  const aspect = 10 / 9;
  const boundWidth = cos * definition.width + sin * definition.height / aspect;
  const boundHeight = cos * definition.height + sin * definition.width * aspect;
  const scale = Math.min(item.scale ?? 1, 94 / boundWidth, 94 / boundHeight);
  const height = definition.height * scale;
  const halfWidth = boundWidth * scale / 2, halfHeight = boundHeight * scale / 2;
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  return { ...item, ...(item.scale !== undefined || scale !== 1 ? { scale } : {}),
    x: Math.round(clamp(item.x, Math.max(8, halfWidth + 2), Math.min(92, 98 - halfWidth)) * 10) / 10,
    y: Math.round(clamp(item.y, Math.max(45, height/2 + halfHeight + 2), Math.min(92, height/2 + 98 - halfHeight)) * 10) / 10 };
}
