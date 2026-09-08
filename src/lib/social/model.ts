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

export type RoomTheme = "cream" | "sage" | "lilac" | "peach";
export type FurnitureId = "sofa" | "rug" | "desk" | "bed" | "plant" | "shelf" | "lamp";
export type FurniturePlacement = { id: FurnitureId; x: number; y: number };
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
  id: FurnitureId; label: string; width: number; height: number;
}> = [
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
