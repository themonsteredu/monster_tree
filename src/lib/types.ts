// Supabase garden_* 테이블의 행 타입 정의 (마이그레이션 SQL 과 1:1 대응)

export type AvatarHumanBody = "boy" | "girl";
export type AvatarKind = "human" | "animal" | "fantasy";

export type AvatarAccessories = { glasses?: string; hat?: string };

// 갤러리 항목의 미세조정 위치/크기. 관리자가 에디터로 잡고 DB 에 저장.
// x, y 는 컨테이너 기준 %(0~100). scale 은 %(30~200, 100=원본 비율 contain).
export type AvatarItemPosition = { x: number; y: number; scale: number };

// 갤러리 슬롯 값 — 레거시는 단순 URL 문자열, 신규는 항목 위치까지 포함한 객체.
// 학생이 picker 에서 선택할 때 항목의 현재 position 을 함께 스냅샷으로 저장한다.
// 렌더러는 객체면 그 position 을, 문자열이면 카테고리 기본값을 사용.
export type AvatarGallerySlotValue =
  | string
  | { url: string; position?: AvatarItemPosition | null };

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
      // 각 슬롯은 garden_avatar_gallery 항목. 없으면 해당 레이어 미표시.
      kind: "gallery";
      base?: AvatarGallerySlotValue;
      outfit?: AvatarGallerySlotValue;
      bottom?: AvatarGallerySlotValue;
      shoes?: AvatarGallerySlotValue;
      hair?: AvatarGallerySlotValue;
      face?: AvatarGallerySlotValue;
      hat?: AvatarGallerySlotValue;
      accessory?: AvatarGallerySlotValue;
    };

export type AvatarGalleryCategory =
  | "base"
  | "outfit"
  | "bottom"
  | "shoes"
  | "hair"
  | "face"
  | "hat"
  | "accessory";

export type AvatarGalleryItem = {
  id: string;
  category: AvatarGalleryCategory;
  label: string | null;
  image_url: string;
  sort_order: number;
  active: boolean;
  created_at: string;
  // position 컬럼은 마이그레이션 0023 적용 후에만 존재. 컬럼이 없거나 select 에서
  // 제외되면 undefined. 렌더러는 DEFAULT_ITEM_POSITION fallback 사용.
  position?: AvatarItemPosition | null;
};

// 카테고리별 위치 기본값 — 항목에 position 메타데이터가 없을 때 fallback.
// (대략적 시작점이며 관리자가 항목별로 미세조정하는 게 정상.)
export const DEFAULT_ITEM_POSITION: Record<AvatarGalleryCategory, AvatarItemPosition> = {
  base:      { x: 50, y: 50, scale: 100 },
  hat:       { x: 50, y: 15, scale: 60 },
  hair:      { x: 50, y: 20, scale: 65 },
  face:      { x: 50, y: 33, scale: 40 },
  accessory: { x: 50, y: 33, scale: 40 },
  outfit:    { x: 50, y: 52, scale: 55 },
  bottom:    { x: 50, y: 70, scale: 50 },
  shoes:     { x: 50, y: 88, scale: 40 },
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
};

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
