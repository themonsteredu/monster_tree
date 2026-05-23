// Supabase garden_* 테이블의 행 타입 정의 (마이그레이션 SQL 과 1:1 대응)

export type AvatarHumanBody = "boy" | "girl";
export type AvatarKind = "human" | "animal" | "fantasy";

export type AvatarAccessories = { glasses?: string; hat?: string };

export type AvatarConfig =
  | {
      kind: "human";
      body: AvatarHumanBody;
      skin: string;
      hair: string;
      eyes: string;
      mouth: string;
      // costume = 상의+하의+신발 세트. "none" 이면 맨몸(피부만).
      costume: string;
      accessories?: AvatarAccessories;
    }
  | {
      kind: "animal" | "fantasy";
      variant: string;
      // 동물/판타지도 의상 입을 수 있음.
      costume?: string;
      accessories?: AvatarAccessories;
    }
  | {
      kind: "image";
      url: string;
    }
  | {
      // 관리자가 카테고리별로 업로드한 갤러리에서 학생이 1개씩 골라 합성하는 아바타.
      // 각 슬롯은 다음 두 형태 중 하나:
      //   1) string  — 관리자 기본 position 사용 (legacy)
      //   2) { url, position? } — 학생이 위치/크기 개별 조절 (신규)
      // 둘 다 호환되며 position 없으면 string 으로 정규화 가능.
      kind: "gallery";
      base?: AvatarGallerySlot;
      outfit?: AvatarGallerySlot;
      bottom?: AvatarGallerySlot;
      shoes?: AvatarGallerySlot;
      hair?: AvatarGallerySlot;
      face?: AvatarGallerySlot;
      hat?: AvatarGallerySlot;
      accessory?: AvatarGallerySlot;
    };

export type AvatarGallerySlot =
  | string
  | { url: string; position?: AvatarGalleryItemPosition };

export function getGallerySlotUrl(slot: AvatarGallerySlot | undefined): string | undefined {
  if (!slot) return undefined;
  if (typeof slot === "string") return slot;
  return typeof slot.url === "string" && slot.url.length > 0 ? slot.url : undefined;
}

export function getGallerySlotPosition(
  slot: AvatarGallerySlot | undefined,
): AvatarGalleryItemPosition | undefined {
  if (!slot || typeof slot === "string") return undefined;
  return slot.position;
}

export type AvatarGalleryCategory =
  | "base"
  | "outfit"
  | "bottom"
  | "shoes"
  | "hair"
  | "face"
  | "hat"
  | "accessory";

// 갤러리 아이템이 합성 아바타 안에서 차지하는 위치/크기 — base bbox 기준.
// x, y: 0~100 (% 위치, 중심점 기준 — translate(-50%, -50%) 와 결합).
// scaleX, scaleY: 10~200 (% 크기, 100 = inner box 전체 너비/높이).
// zIndex: 1~20 (학생이 레이어 순서 조절 시. 없으면 카테고리 기본 z 사용).
export type AvatarGalleryItemPosition = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  zIndex?: number;
};

// 카테고리별 기본 위치 — 관리자가 position 을 따로 지정하지 않은 항목에 적용.
export const DEFAULT_GALLERY_POSITION_BY_CATEGORY: Record<
  AvatarGalleryCategory,
  AvatarGalleryItemPosition
> = {
  base:      { x: 50, y: 50, scaleX: 100, scaleY: 100 },
  outfit:    { x: 50, y: 52, scaleX: 45,  scaleY: 45 },
  bottom:    { x: 50, y: 70, scaleX: 40,  scaleY: 40 },
  shoes:     { x: 50, y: 88, scaleX: 35,  scaleY: 35 },
  hair:      { x: 50, y: 20, scaleX: 50,  scaleY: 50 },
  face:      { x: 50, y: 33, scaleX: 35,  scaleY: 35 },
  hat:       { x: 50, y: 15, scaleX: 45,  scaleY: 45 },
  accessory: { x: 50, y: 33, scaleX: 35,  scaleY: 35 },
};

export function getGalleryItemPosition(item: {
  category: AvatarGalleryCategory;
  position?: AvatarGalleryItemPosition | null;
}): AvatarGalleryItemPosition {
  return item.position ?? DEFAULT_GALLERY_POSITION_BY_CATEGORY[item.category];
}

export type AvatarGalleryItem = {
  id: string;
  category: AvatarGalleryCategory;
  label: string | null;
  image_url: string;
  position: AvatarGalleryItemPosition | null;
  sort_order: number;
  active: boolean;
  created_at: string;
};

export const DEFAULT_AVATAR: AvatarConfig = {
  kind: "human",
  body: "boy",
  skin: "light",
  hair: "short_brown",
  eyes: "happy",
  mouth: "smile",
  costume: "casual_olive",
};

// 학생 개인 페이지 + TV 스포트라이트 의 배경 꾸미기.
// solid: 단색  /  pattern: 무늬 (color 위에 패턴 오버레이)  /  scene: 풍경 프리셋
export type BackgroundConfig =
  | { kind: "solid"; color: string }
  | { kind: "pattern"; pattern: string; color: string }
  | { kind: "scene"; scene: string };

export const DEFAULT_BACKGROUND: BackgroundConfig = {
  kind: "solid",
  color: "cream",
};

export type GardenStudent = {
  id: string;
  name: string;
  class_name: string | null;
  branch_id: string | null;
  total_points: number;
  current_stage: number; // 1~8
  apples_harvested: number;
  is_active: boolean;
  created_at: string;
  avatar?: AvatarConfig | null;
  background?: BackgroundConfig | null;
  mood_text?: string | null;
  mood_updated_at?: string | null;
};

export const MOOD_TEXT_MAX = 30;

export type GardenPointLog = {
  id: string;
  student_id: string;
  points: number; // 음수도 가능
  reason: string | null;
  logged_at: string;
};

export type GardenHarvest = {
  id: string;
  student_id: string;
  apples_count: number;
  harvested_at: string;
};

// 사과나무 단계별 이미지 + 미세조정 설정.
// image_url 이 null 이면 AppleTree 는 기존 SVG fallback 으로 렌더된다.
export type GardenTreeStage = {
  stage: number;
  image_url: string | null;
  scale: number;
  offset_x: number;
  offset_y: number;
  updated_at: string;
};

export type TreeStageImageConfig = {
  url: string;
  scale: number;
  offsetX: number;
  offsetY: number;
};

// 몬스터 마을 — 배경/시즌 전역 설정 (단일 행).
export type VillageSettings = {
  id: string;
  background_image: string | null;
  season: string;
  is_active: boolean;
  updated_at: string;
};

// 몬스터 마을 — 건물 한 동.
export type VillageBuilding = {
  id: string;
  building_key: string;
  name: string;
  image_url: string | null;
  link: string;
  position_top: string;
  position_left: string | null;
  position_right: string | null;
  size: string;
  rotation: number; // 도(°), 시계방향 +. 0 = 회전 없음.
  description: string; // 학생 화면 hover 시 말풍선 내용. 빈 문자열이면 이름만 표시.
  display_order: number;
  is_ready: boolean;
  is_visible: boolean;
  updated_at: string;
};

// 마이룸 마당 꾸미기 — 소품 카테고리.
export type DecorationCategory = "insect" | "flower" | "furniture" | "plant" | "misc";

export const DECORATION_CATEGORIES: DecorationCategory[] = [
  "insect",
  "flower",
  "furniture",
  "plant",
  "misc",
];

export const DECORATION_CATEGORY_LABEL: Record<DecorationCategory, string> = {
  insect: "곤충",
  flower: "꽃",
  furniture: "가구",
  plant: "식물",
  misc: "기타",
};

// 소품 마스터 — 관리자가 등록한 꾸미기 아이템.
export type DecorationItem = {
  id: string;
  name: string;
  image_url: string;
  category: DecorationCategory;
  price: number;
  default_width_percent: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

// 학생 보유 소품.
export type StudentDecoration = {
  id: string;
  student_id: string;
  decoration_item_id: string;
  quantity: number;
  acquired_at: string;
};

// 학생 마당 배치 인스턴스.
export type StudentYardItem = {
  id: string;
  student_id: string;
  decoration_item_id: string;
  instance_id: string;
  position_x: number; // 마당 너비 대비 %, 0~100
  position_y: number; // 마당 세로 대비 %, 0~100
  width_percent: number; // 마당 너비 대비 %
  rotation: number; // 도(°)
  z_index: number;
  placed_at: string;
};

// 마이룸 씬 액터(나무·아바타)의 위치/크기.
// x, y: 컨테이너 너비/높이 대비 % (0~100, 중심점 기준)
// width: cqmin (짧은 변) 대비 % — 가로/세로 모드 모두에서 같은 물리적 크기
// flipX: 좌우 반전 (옆을 보는 효과)
// rotation: 미세 회전 -30~30° (자연스러운 변주)
export type SceneItemLayout = {
  x: number;
  y: number;
  width: number;
  flipX?: boolean;
  rotation?: number;
};

export type SceneLayout = {
  tree?: SceneItemLayout;
  avatar?: SceneItemLayout;
  monster?: SceneItemLayout; // 활성 몬스터 (알/키우는 중)
};

// 학생이 한 번도 위치를 잡지 않았을 때의 기본값.
// 마이룸 yard 안에 트리는 중앙-하단, 아바타는 그 우측에 약간 겹치게.
export const DEFAULT_SCENE_LAYOUT: Required<SceneLayout> = {
  tree:    { x: 45, y: 92, width: 55, flipX: false, rotation: 0 },
  avatar:  { x: 68, y: 95, width: 28, flipX: false, rotation: 0 },
  monster: { x: 28, y: 88, width: 22, flipX: false, rotation: 0 },
};

// 마이룸 마당 글로벌 배경 — 관리자만 업로드, 모든 학생에게 동일 적용.
export type YardSettings = {
  id: string;
  background_image: string | null;
  is_active: boolean;
  updated_at: string;
};

// 마이룸 날씨/분위기 효과 타입.
export type WeatherType =
  | "none"
  | "rain"
  | "snow"
  | "cherry_blossom"
  | "sunshine"
  | "firefly"
  | "stars"
  | "autumn_leaves";

export const WEATHER_TYPES: WeatherType[] = [
  "none",
  "rain",
  "snow",
  "cherry_blossom",
  "sunshine",
  "firefly",
  "stars",
  "autumn_leaves",
];

export const WEATHER_LABEL: Record<WeatherType, { icon: string; name: string }> = {
  none: { icon: "☀️", name: "맑음" },
  rain: { icon: "🌧️", name: "비" },
  snow: { icon: "❄️", name: "눈" },
  cherry_blossom: { icon: "🌸", name: "벚꽃비" },
  sunshine: { icon: "✨", name: "반짝햇살" },
  firefly: { icon: "🌟", name: "반딧불이" },
  stars: { icon: "⭐", name: "별밤" },
  autumn_leaves: { icon: "🍂", name: "단풍" },
};

// 몬스터 키우기 시스템 — 종별 마스터.
export type MonsterSpecies = {
  id: string;
  name: string;
  emoji: string; // 도감/UI 의 큰 아이콘 (예: '🔥', '💧'). 마이그레이션 시 기본 '✨'.
  description: string;
  display_order: number;
  is_active: boolean;
  hide_name: boolean; // 알 화면에서 이름 가리기
  created_at: string;
  updated_at: string;
};

// 몬스터 단계별 이미지 (한 종당 5단계 행).
export type MonsterStageImage = {
  id: string;
  species_id: string;
  stage: number; // 1~5
  image_url: string | null;
  stage_name: string;
  required_exp: number;
  updated_at: string;
};

// 학생이 키우는 몬스터.
export type StudentMonster = {
  id: string;
  student_id: string;
  species_id: string;
  nickname: string;
  current_exp: number;
  current_stage: number; // 1~5
  is_evolved: boolean;
  selected_at: string;
  evolved_at: string | null;
};

// 단계별 기본 이름/필요 EXP — 관리자가 새 species 만들 때 기본값 + 도감/UI fallback.
// 누적 EXP 기준: 0 → 70 → 190 → 380 → 630.
export const MONSTER_STAGE_DEFAULTS: Array<{ stage: number; name: string; requiredExp: number }> = [
  { stage: 1, name: "알", requiredExp: 0 },
  { stage: 2, name: "금간 알", requiredExp: 70 },
  { stage: 3, name: "부화", requiredExp: 190 },
  { stage: 4, name: "성장", requiredExp: 380 },
  { stage: 5, name: "완성체", requiredExp: 630 },
];

// 게임센터 — 한 판 기록.
export type GamePlay = {
  id: string;
  student_id: string;
  branch_id: string;
  game_type: string;
  score: number;
  exp_earned: number;
  played_at: string;
};

// 게임센터 — 월간 베스트 (지점/게임/월 단위, student×game×month UNIQUE).
export type GameRanking = {
  id: string;
  student_id: string;
  branch_id: string;
  game_type: string;
  best_score: number;
  month: string; // 'YYYY-MM' (KST)
  reward_exp: number;
  rank: number | null;
  updated_at: string;
};

// 하루 플레이 횟수 상한 (학생당, 게임당).
export const DAILY_PLAY_LIMIT = 3;

// 단계별 fallback 이모지 — monster_stage_images.image_url 이 비어있을 때만 사용.
// 관리자가 이미지를 업로드하면 그쪽이 우선.
export const STAGE_FALLBACK_EMOJI: Record<number, string> = {
  1: "🥚",
  2: "🥚",
  3: "🐣",
  4: "🐾",
  5: "🔥",
};

// 건의함 (Suggestion Mailbox)
export type SuggestionCategory = "praise" | "suggestion" | "complaint" | "etc";
export type SuggestionStatus = "received" | "reviewing" | "done";
// public: 다른 학생도 본문을 볼 수 있음. private: 관리자에게만 본문 노출 (다른 학생은 접힌 종이만).
export type SuggestionVisibility = "public" | "private";

export const SUGGESTION_CATEGORY_LABELS: Record<SuggestionCategory, string> = {
  praise: "칭찬",
  suggestion: "건의",
  complaint: "불편",
  etc: "기타",
};

export const SUGGESTION_STATUS_LABELS: Record<SuggestionStatus, string> = {
  received: "접수",
  reviewing: "검토중",
  done: "완료",
};

export const SUGGESTION_TITLE_MAX = 60;
export const SUGGESTION_BODY_MAX = 1000;
export const SUGGESTION_REPLY_MAX = 1000;

export type GardenSuggestion = {
  id: string;
  branch_id: string;
  student_id: string | null;
  student_name_snapshot: string;
  is_anonymous: boolean;
  visibility: SuggestionVisibility;
  category: SuggestionCategory;
  title: string;
  body: string;
  status: SuggestionStatus;
  reply: string | null;
  replied_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SuggestionBlock = {
  id: string;
  student_id: string;
  branch_id: string;
  reason: string | null;
  blocked_at: string;
  blocked_until: string | null;
  blocked_by: string | null;
};
