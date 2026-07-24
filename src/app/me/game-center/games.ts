// 게임센터 게임 카탈로그 + 공통 타입.
// 서버 컴포넌트가 import 해도 안전하도록 "use client" 표시 없이 분리.
// (use client 모듈의 non-component export 를 서버에서 호출하면 런타임 에러.)

import type { GameRanking } from "@/lib/types";

export type GameTypeId =
  | "infinite_stairs"
  | "sky_shooter"
  | "math_adventure";

export type GameMeta = {
  type: GameTypeId;
  name: string;
  description: string;
  icon: string;
  studentRoute: string;
  adminRoute: string;
  iconBg: string;
};

export const GAME_TYPES: GameMeta[] = [
  {
    type: "infinite_stairs",
    name: "무한의 계단",
    description: "좌·우 터치로 계단을 끝없이 올라가자!",
    icon: "🪜",
    studentRoute: "/me/game-center/infinite-stairs",
    adminRoute: "/admin/game-center-preview/infinite-stairs",
    iconBg: "linear-gradient(180deg, #1a0a3a 0%, #0d0524 100%)",
  },
  {
    type: "sky_shooter",
    name: "스카이 슈터",
    description: "하늘을 날며 적을 쏘고 동전을 먹자!",
    icon: "🚀",
    studentRoute: "/me/game-center/sky-shooter",
    adminRoute: "/admin/game-center-preview/sky-shooter",
    iconBg: "linear-gradient(180deg, #0c4a6e 0%, #082f49 100%)",
  },
  {
    type: "math_adventure",
    name: "블록 수학 퀘스트",
    description: "아이템 큐브를 열고 3개 블록 지역을 탐험!",
    icon: "🧊",
    studentRoute: "/me/game-center/math-adventure",
    adminRoute: "/admin/game-center-preview/math-adventure",
    iconBg: "linear-gradient(180deg, #72d7ff 0%, #62b84f 55%, #6f442a 100%)",
  },
];

export type GameStats = {
  todayPlayCount: number;
  topRankings: GameRanking[];
  myRanking: GameRanking | null;
  myRankNumber: number | null;
};
