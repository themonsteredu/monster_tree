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
      // 각 슬롯은 garden_avatar_gallery.image_url 값. 없으면 해당 레이어 미표시.
      kind: "gallery";
      base?: string;
      outfit?: string;
      hat?: string;
      accessory?: string;
    };

export type AvatarGalleryCategory = "base" | "outfit" | "hat" | "accessory";

export type AvatarGalleryItem = {
  id: string;
  category: AvatarGalleryCategory;
  label: string | null;
  image_url: string;
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
