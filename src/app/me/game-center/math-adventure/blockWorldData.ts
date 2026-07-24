export type Phase = "ready" | "playing" | "stageQuiz" | "over";
export type TileKind = "ground" | "stone" | "ore" | "wood" | "lava";
export type ItemKind = "growth" | "blaster" | "crystal";

export type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: TileKind;
};

export type CoinSeed = { x: number; y: number };
export type BoxSeed = { x: number; y: number; item: ItemKind };
export type EnemySeed = {
  x: number;
  y: number;
  minX: number;
  maxX: number;
  speed: number;
  color: "purple" | "green" | "red";
};
export type Quiz = { prompt: string; choices: number[]; answer: number };

export type Palette = {
  skyTop: string;
  skyBottom: string;
  cloud: string;
  fog: string;
  farBlock: string;
  nearBlock: string;
  grass: string;
  dirt: string;
  dirtDark: string;
  stone: string;
  stoneDark: string;
  wood: string;
  woodDark: string;
  ore: string;
  portal: string;
  accent: string;
};

export type Stage = {
  name: string;
  subtitle: string;
  width: number;
  startX: number;
  startY: number;
  portalX: number;
  solids: Rect[];
  boxes: BoxSeed[];
  coins: CoinSeed[];
  enemies: EnemySeed[];
  quiz: Quiz;
  palette: Palette;
  weather: "day" | "cave" | "lava";
};

export type Player = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  onGround: boolean;
  facing: 1 | -1;
};

export type Coin = CoinSeed & { collected: boolean };
export type MysteryBox = BoxSeed & { used: boolean; bumpUntil: number };
export type Enemy = EnemySeed & { vx: number; alive: boolean };
export type ItemDrop = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: ItemKind;
  active: boolean;
};
export type Projectile = {
  id: number;
  x: number;
  y: number;
  vx: number;
  active: boolean;
};

export const VIEW_W = 320;
export const VIEW_H = 240;
export const PLAYER_W = 14;
export const PLAYER_H = 20;
export const MOVE_SPEED = 120;
export const JUMP_SPEED = 334;
export const GRAVITY = 930;
export const STARTING_LIVES = 3;
export const MAX_SCORE = 5000;

const MEADOW: Palette = {
  skyTop: "#72d7ff",
  skyBottom: "#d7f5ff",
  cloud: "#fffdf2",
  fog: "#bfeaff",
  farBlock: "#7fbd72",
  nearBlock: "#4f9652",
  grass: "#62b84f",
  dirt: "#9b6338",
  dirtDark: "#6f442a",
  stone: "#8b9298",
  stoneDark: "#5f666d",
  wood: "#a96e3d",
  woodDark: "#714528",
  ore: "#37d5ca",
  portal: "#8656ff",
  accent: "#f26522",
};

const CAVE: Palette = {
  skyTop: "#182333",
  skyBottom: "#314258",
  cloud: "#8797a8",
  fog: "#3d5268",
  farBlock: "#3f4f5c",
  nearBlock: "#283641",
  grass: "#478c67",
  dirt: "#5f554a",
  dirtDark: "#3f3933",
  stone: "#707b84",
  stoneDark: "#444e56",
  wood: "#876441",
  woodDark: "#553d28",
  ore: "#45e6ff",
  portal: "#b45cff",
  accent: "#45e6ff",
};

const LAVA: Palette = {
  skyTop: "#2a1316",
  skyBottom: "#663023",
  cloud: "#8f5549",
  fog: "#6d332c",
  farBlock: "#5b3031",
  nearBlock: "#3b2429",
  grass: "#7d7849",
  dirt: "#643c30",
  dirtDark: "#3d2624",
  stone: "#6c5c63",
  stoneDark: "#43373e",
  wood: "#7b4d35",
  woodDark: "#4d3025",
  ore: "#ffb13d",
  portal: "#c260ff",
  accent: "#ff713d",
};

function ground(x: number, w: number): Rect {
  return { x, y: 208, w, h: 32, kind: "ground" };
}
function stone(x: number, y: number, w = 16, h = 16): Rect {
  return { x, y, w, h, kind: "stone" };
}
function ore(x: number, y: number, w = 16, h = 16): Rect {
  return { x, y, w, h, kind: "ore" };
}
function wood(x: number, y: number, w = 16, h = 16): Rect {
  return { x, y, w, h, kind: "wood" };
}
function lava(x: number, w: number): Rect {
  return { x, y: 224, w, h: 16, kind: "lava" };
}

export const STAGES: Stage[] = [
  {
    name: "BLOCK WORLD 1",
    subtitle: "잔디 큐브 평원",
    width: 1780,
    startX: 36,
    startY: 170,
    portalX: 1662,
    palette: MEADOW,
    weather: "day",
    solids: [
      ground(0, 430),
      ground(492, 310),
      ground(858, 338),
      ground(1250, 530),
      stone(190, 160, 64),
      wood(326, 176, 48),
      stone(555, 144, 96),
      ore(686, 160, 32),
      wood(760, 176, 48),
      stone(920, 160, 64),
      ore(1030, 128, 80),
      stone(1160, 176, 48),
      wood(1325, 160, 96),
      stone(1490, 144, 80),
    ],
    boxes: [
      { x: 278, y: 144, item: "growth" },
      { x: 670, y: 128, item: "blaster" },
      { x: 1438, y: 128, item: "crystal" },
    ],
    coins: [
      { x: 205, y: 138 }, { x: 235, y: 138 }, { x: 286, y: 122 },
      { x: 370, y: 164 }, { x: 520, y: 176 }, { x: 575, y: 122 },
      { x: 620, y: 122 }, { x: 692, y: 108 }, { x: 830, y: 170 },
      { x: 940, y: 138 }, { x: 1048, y: 106 }, { x: 1090, y: 106 },
      { x: 1215, y: 170 }, { x: 1350, y: 138 }, { x: 1400, y: 138 },
      { x: 1515, y: 122 }, { x: 1590, y: 176 },
    ],
    enemies: [
      { x: 330, y: 194, minX: 300, maxX: 398, speed: 25, color: "green" },
      { x: 610, y: 194, minX: 520, maxX: 770, speed: 29, color: "purple" },
      { x: 990, y: 194, minX: 900, maxX: 1140, speed: 31, color: "green" },
      { x: 1480, y: 194, minX: 1300, maxX: 1600, speed: 34, color: "purple" },
    ],
    quiz: { prompt: "7 + 5", choices: [10, 11, 12, 13], answer: 12 },
  },
  {
    name: "BLOCK WORLD 2",
    subtitle: "푸른 수정 동굴",
    width: 1960,
    startX: 36,
    startY: 170,
    portalX: 1840,
    palette: CAVE,
    weather: "cave",
    solids: [
      ground(0, 350),
      ground(415, 250),
      ground(730, 255),
      ground(1045, 320),
      ground(1430, 530),
      stone(160, 160, 96),
      ore(300, 144, 32),
      wood(455, 176, 64),
      stone(550, 144, 96),
      ore(685, 176, 48),
      stone(785, 128, 96),
      wood(930, 160, 48),
      stone(1090, 160, 96),
      ore(1240, 128, 64),
      wood(1368, 176, 64),
      stone(1500, 144, 112),
      ore(1700, 160, 64),
    ],
    boxes: [
      { x: 270, y: 128, item: "growth" },
      { x: 900, y: 128, item: "blaster" },
      { x: 1640, y: 128, item: "crystal" },
    ],
    coins: [
      { x: 175, y: 138 }, { x: 220, y: 138 }, { x: 285, y: 106 },
      { x: 380, y: 172 }, { x: 470, y: 154 }, { x: 580, y: 122 },
      { x: 630, y: 122 }, { x: 700, y: 154 }, { x: 760, y: 176 },
      { x: 815, y: 106 }, { x: 865, y: 106 }, { x: 915, y: 106 },
      { x: 1070, y: 176 }, { x: 1120, y: 138 }, { x: 1270, y: 106 },
      { x: 1390, y: 154 }, { x: 1525, y: 122 }, { x: 1585, y: 122 },
      { x: 1660, y: 106 }, { x: 1780, y: 176 },
    ],
    enemies: [
      { x: 250, y: 194, minX: 205, maxX: 325, speed: 31, color: "purple" },
      { x: 500, y: 194, minX: 445, maxX: 635, speed: 34, color: "green" },
      { x: 795, y: 194, minX: 755, maxX: 945, speed: 37, color: "purple" },
      { x: 1160, y: 194, minX: 1080, maxX: 1320, speed: 39, color: "green" },
      { x: 1550, y: 194, minX: 1470, maxX: 1760, speed: 42, color: "purple" },
    ],
    quiz: { prompt: "6 × 4", choices: [20, 22, 24, 26], answer: 24 },
  },
  {
    name: "BLOCK WORLD 3",
    subtitle: "용암 큐브 요새",
    width: 2140,
    startX: 36,
    startY: 170,
    portalX: 2020,
    palette: LAVA,
    weather: "lava",
    solids: [
      ground(0, 300),
      ground(360, 245),
      ground(670, 250),
      ground(990, 270),
      ground(1330, 280),
      ground(1680, 460),
      lava(300, 60),
      lava(605, 65),
      lava(920, 70),
      lava(1260, 70),
      lava(1610, 70),
      stone(145, 160, 80),
      ore(270, 144, 32),
      wood(405, 176, 64),
      stone(520, 128, 96),
      ore(640, 176, 32),
      stone(740, 160, 96),
      wood(880, 144, 48),
      stone(1050, 144, 112),
      ore(1210, 128, 48),
      stone(1370, 176, 80),
      wood(1500, 128, 112),
      ore(1640, 144, 32),
      stone(1750, 160, 112),
      wood(1910, 128, 64),
    ],
    boxes: [
      { x: 242, y: 128, item: "growth" },
      { x: 850, y: 112, item: "blaster" },
      { x: 1645, y: 112, item: "crystal" },
    ],
    coins: [
      { x: 160, y: 138 }, { x: 205, y: 138 }, { x: 255, y: 106 },
      { x: 330, y: 160 }, { x: 430, y: 154 }, { x: 550, y: 106 },
      { x: 600, y: 106 }, { x: 700, y: 176 }, { x: 770, y: 138 },
      { x: 825, y: 138 }, { x: 870, y: 90 }, { x: 970, y: 170 },
      { x: 1080, y: 122 }, { x: 1140, y: 122 }, { x: 1230, y: 106 },
      { x: 1360, y: 176 }, { x: 1410, y: 154 }, { x: 1530, y: 106 },
      { x: 1590, y: 106 }, { x: 1660, y: 90 }, { x: 1760, y: 138 },
      { x: 1830, y: 138 }, { x: 1950, y: 176 },
    ],
    enemies: [
      { x: 230, y: 194, minX: 190, maxX: 285, speed: 33, color: "red" },
      { x: 470, y: 194, minX: 390, maxX: 570, speed: 38, color: "purple" },
      { x: 780, y: 194, minX: 710, maxX: 890, speed: 41, color: "red" },
      { x: 1100, y: 194, minX: 1030, maxX: 1215, speed: 44, color: "purple" },
      { x: 1410, y: 194, minX: 1360, maxX: 1570, speed: 47, color: "red" },
      { x: 1810, y: 194, minX: 1730, maxX: 1970, speed: 50, color: "purple" },
    ],
    quiz: { prompt: "35 ÷ 5", choices: [5, 6, 7, 8], answer: 7 },
  },
];

export function intersects(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
